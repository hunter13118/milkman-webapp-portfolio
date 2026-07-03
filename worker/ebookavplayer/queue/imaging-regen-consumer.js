import { putBookIndex } from "../_shared/jobs-kv.js";
import { syncCatalogCover } from "../_shared/catalog-cover.js";
import { touchIngestJob } from "../_shared/job-touch.js";
import { createKvReporter } from "../_shared/job-kv-throttle.js";
import { runEdgeImaging } from "../_shared/edge-imaging.js";
import { createPhaseLogger, PHASE } from "../_shared/phase-debug.js";
import { countImagingSteps } from "../_shared/ingest-progress.js";

function existingMediaFromPlayback(playback) {
  const characters = {};
  const backgrounds = {};
  for (const [id, c] of Object.entries(playback?.characters || {})) {
    if (c?.sprite) characters[id] = c.sprite;
  }
  for (const s of playback?.scenes || []) {
    if (s.background) backgrounds[s.id] = s.background;
    for (const p of s.present || []) {
      if (p.character_id && p.sprite && !characters[p.character_id]) {
        characters[p.character_id] = p.sprite;
      }
    }
  }
  return { characters, backgrounds, cover: playback?.cover || null, inserts: { ...(playback?.inserts || {}) } };
}

function imagingFilterFromOpts(opts = {}) {
  const scope = opts.scope || "all";
  if (scope === "all") return null;
  return {
    scope,
    character_ids: opts.character_ids || [],
    scene_ids: opts.scene_ids || [],
    include_cover: Boolean(opts.include_cover),
  };
}

export async function handleImagingRegenMessage(message, env) {
  const { job_id, book_id, opts = {} } = message.body;
  const dbg = createPhaseLogger(env, "imaging-regen", job_id);
  const compare = opts.compare !== false;
  const stageUntilConfirm = compare;
  const comparisons = [];
  const reporter = createKvReporter();

  let bookMeta = {};
  async function touchBook(patch) {
    const prev = bookMeta;
    bookMeta = { ...bookMeta, ...patch, book_id };
    await putBookIndex(env, book_id, patch, { prev });
  }

  async function reportJob(patch, opts = {}) {
    await reporter.maybeReport(patch, async () => {
      await touchIngestJob(env, job_id, patch, { dbg, ...opts });
    }, opts);
  }

  async function reportProgress(jobPatch, bookPatch, opts = {}) {
    await reporter.maybeReport(jobPatch, async () => {
      await touchIngestJob(env, job_id, jobPatch, { dbg, ...opts });
      await touchBook(bookPatch);
    }, opts);
  }

  try {
    await touchIngestJob(env, job_id, {
      status: "processing",
      stage: "imaging",
      progress: 0.05,
      detail: "Starting art regen",
      comparisons: [],
    }, { eventType: "started", dbg });
    await touchBook({ imaging_locked: true, stage: "imaging", active_job_id: job_id });

    const axObj = await env.VAE_PACKS.get(`books/${book_id}.analysis.json`);
    if (!axObj) throw new Error("no analysis — ingest or re-extract first");
    const analysis = await axObj.json();

    const pbObj = await env.VAE_PACKS.get(`books/${book_id}.json`);
    const playback = pbObj ? await pbObj.json() : null;

    const bookMetaRaw = await env.VAE_JOBS.get(`book:${book_id}`);
    bookMeta = bookMetaRaw ? JSON.parse(bookMetaRaw) : { book_id };
    const art_style = opts.art_style || bookMeta.art_style || playback?.active_style || "semi-real";
    const narrator_gender = bookMeta.narrator_gender || "male";

    const filter = imagingFilterFromOpts(opts);
    const existingMedia = existingMediaFromPlayback(playback);

    const imgPlan = await countImagingSteps(analysis, env, { filter });
    if (imgPlan.total <= 0) {
      throw new Error("nothing to regenerate for this selection — pick characters or backgrounds");
    }

    let globalStep = 0;

    await touchIngestJob(env, job_id, { step_total: imgPlan.total, step_index: 0 }, { dbg });
    await touchBook({ progress: 0.05, stage: "imaging", status: "processing" });

    dbg.log(PHASE.P3_IMAGES, "regen start", { filter, art_style, compare, stageUntilConfirm });

    const img = await runEdgeImaging({
      env,
      book_id,
      analysis,
      art_style,
      narrator_gender,
      dbg,
      filter,
      existingMedia,
      diversify: Boolean(opts.diversify),
      ignorePins: Boolean(opts.ignore_pins),
      preferProvider: opts.prefer_provider || null,
      compare,
      stageUntilConfirm,
      onComparison: async (row) => {
        comparisons.push(row);
        await reportJob({ comparisons: [...comparisons] }, { eventType: "comparison", force: true });
      },
      onProviderAttempt: (provider, { kind, id }) => {
        reportJob({
          status: "processing",
          stage: "imaging",
          detail: `Trying ${provider} for ${kind} · ${id}`,
          comparisons: [...comparisons],
        }, { eventType: "provider", provider, kind, id, dbg }).catch(() => {});
      },
      onProviderWait: (provider, { kind, id, waitMs }) => {
        const secs = Math.max(1, Math.round((waitMs || 0) / 1000));
        reportJob({
          status: "processing",
          stage: "imaging",
          detail: `Waiting on ${provider} for ${kind} · ${id} (${secs}s)`,
          comparisons: [...comparisons],
        }, { eventType: "provider", provider, kind, id, dbg, force: true }).catch(() => {});
      },
      onImageFailure: ({ kind, id, error }) => {
        reportJob({
          status: "processing",
          stage: "imaging",
          detail: `Failed ${kind} · ${id}: ${String(error || "unknown").slice(0, 220)}`,
          comparisons: [...comparisons],
        }, { eventType: "progress", kind, id, dbg, force: true }).catch(() => {});
      },
      onProgress: async ({ kind, id, reused }) => {
        globalStep += 1;
        const progress = Math.min(0.99, globalStep / Math.max(imgPlan.total, 1));
        await reportProgress({
          status: "processing",
          progress,
          step_index: globalStep,
          step_total: imgPlan.total,
          detail: reused ? `${kind} · ${id} (kept)` : `${kind} · ${id} (${globalStep}/${imgPlan.total})`,
          stage: "imaging",
          comparisons: [...comparisons],
        }, { progress, stage: "imaging", status: "processing" }, { eventType: "progress", kind, id, dbg });
      },
    });

    if ((img.stats?.ok ?? 0) === 0 && imgPlan.total > 0) {
      throw new Error(
        `All ${imgPlan.total} image(s) failed to generate — set GEMINI_API_KEY (wrangler secret) or freemium image keys`,
      );
    }

    if (!stageUntilConfirm) {
      const updated = img.playback;
      updated.status = "ready";
      updated.stage = "done";
      updated.progress = 1;
      if (playback?.voice_overrides) updated.voice_overrides = playback.voice_overrides;
      if (playback?.resume) updated.resume = playback.resume;
      if (playback?.inserts) {
        updated.inserts = { ...playback.inserts, ...(updated.inserts || {}) };
        for (const scene of updated.scenes || []) {
          for (const line of scene.lines || []) {
            const url = updated.inserts[String(line.idx)];
            if (url && !line.illustration_url) {
              line.illustration_url = url;
              line.visual_moment = true;
            }
          }
        }
      }

      await env.VAE_PACKS.put(
        `books/${book_id}.json`,
        JSON.stringify(updated, null, 2),
        { httpMetadata: { contentType: "application/json" } },
      );
      if (updated.cover) {
        await syncCatalogCover(env, book_id, updated.cover);
      }
    }

    await touchBook({
      status: "ready",
      stage: "done",
      progress: 1,
      imaging_locked: false,
      active_job_id: null,
    });

    await touchIngestJob(env, job_id, {
      status: "processing",
      stage: "imaging",
      progress: 0.99,
      step_index: imgPlan.total,
      step_total: imgPlan.total,
      detail: "Finalizing…",
      comparisons: [...comparisons],
    }, { eventType: "progress", dbg });

    await dbg.flush((patch) => touchIngestJob(env, job_id, patch, { eventType: "done", dbg }), {
      status: "done",
      stage: "done",
      progress: 1,
      step_index: imgPlan.total,
      step_total: imgPlan.total,
      detail: stageUntilConfirm
        ? `Art regen complete · review ${comparisons.length} image(s)`
        : `Art regen complete · ${img.stats?.ok ?? 0} ok`,
      book_id,
      imaging: img.stats,
      comparisons,
      staged: stageUntilConfirm,
    });
    message.ack();
  } catch (e) {
    console.error("imaging regen", job_id, e);
    await touchIngestJob(env, job_id, {
      status: "error",
      stage: "error",
      progress: 0,
      detail: String(e.message || e).slice(0, 300),
      comparisons,
      error: String(e.message || e).slice(0, 300),
    }, { eventType: "error", dbg });
    await putBookIndex(env, book_id, { imaging_locked: false, active_job_id: null }).catch(() => {});
    message.ack();
  }
}
