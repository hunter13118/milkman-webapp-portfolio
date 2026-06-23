import { extractEpubText } from "../_shared/epub-text.js";
import { freemiumExtractBook } from "../_shared/freemium-extract.js";
import { runEdgeImaging } from "../_shared/edge-imaging.js";
import { putBookIndex } from "../_shared/jobs-kv.js";
import { createPhaseLogger, PHASE } from "../_shared/phase-debug.js";

async function updateIngest(env, jobId, patch) {
  const key = `ingest:${jobId}`;
  const prev = await env.VAE_JOBS.get(key);
  const base = prev ? JSON.parse(prev) : {};
  const next = { ...base, ...patch };
  await env.VAE_JOBS.put(key, JSON.stringify(next), { expirationTtl: 86400 * 7 });
  return next;
}

export async function handleIngestMessage(message, env) {
  const { job_id, book_id, art_style, narrator_gender, dry_run, generate_art } = message.body;
  const dbg = createPhaseLogger(env, "ingest", job_id);

  try {
    dbg.log(PHASE.P1_PARSE, "start");
    await updateIngest(env, job_id, { status: "parsing", progress: 0.05, detail: "loading epub", stage: "parsing" });

    const obj = await env.VAE_PACKS.get(`uploads/${job_id}.epub`);
    if (!obj) throw new Error("upload missing from R2");

    const bytes = await obj.arrayBuffer();
    const maxChars = parseInt(env.VAE_EPUB_MAX_CHARS || "800000", 10) || 800000;
    const parsed = extractEpubText(bytes, { maxChars });
    const title = parsed.title || book_id;
    const author = parsed.author || "";
    dbg.log(PHASE.P1_PARSE, "epub parsed", {
      title,
      chars: parsed.body_text?.length || 0,
      spine_parts: parsed.spine_parts,
    });

    await putBookIndex(env, book_id, {
      book_id,
      title,
      author,
      status: "processing",
      stage: "parsing",
      progress: 0.05,
      job_id,
      art_style,
    });

    await updateIngest(env, job_id, { status: "analyzing", progress: 0.15, detail: "freemium extract", stage: "analyzing" });
    const { resolvedExtractProviders } = await import("../_shared/pipeline-registry.js");
    const extractChain = await resolvedExtractProviders(env);
    dbg.log(PHASE.P2_EXTRACT, "start", { chain: extractChain });

    const { analysis, provider, model } = await freemiumExtractBook(
      { book_id, title, author, body_text: parsed.body_text },
      {
        env,
        onProgress: ({ chunk, total, provider: p }) => {
          updateIngest(env, job_id, {
            detail: `[P2] extract ${p || "…"} chunk ${chunk}/${total}`,
            progress: 0.15 + (0.35 * chunk) / total,
          }).catch(() => {});
        },
      },
    );
    dbg.log(PHASE.P2_EXTRACT, "done", { provider, model });

    const wantArt = generate_art !== false && !dry_run;

    await env.VAE_PACKS.put(
      `books/${book_id}.analysis.json`,
      JSON.stringify(analysis, null, 2),
      { httpMetadata: { contentType: "application/json" } },
    );

    const { compilePlayback } = await import("../_shared/compile-playback.js");
    let playback = compilePlayback(analysis, { art_style, narrator_gender });
    playback.status = "ready";
    playback.stage = wantArt ? "imaging" : "done";
    playback.progress = wantArt ? 0.48 : 1;

    await env.VAE_PACKS.put(
      `books/${book_id}.json`,
      JSON.stringify(playback, null, 2),
      { httpMetadata: { contentType: "application/json" } },
    );

    const earlyLines = (playback.scenes || []).reduce((n, s) => n + (s.lines?.length || 0), 0);
    await putBookIndex(env, book_id, {
      book_id,
      title: playback.title || title,
      author: playback.author || author,
      status: wantArt ? "processing" : "ready",
      stage: wantArt ? "imaging" : "done",
      progress: playback.progress,
      scenes: playback.scenes?.length || 0,
      lines: earlyLines,
      art_style,
      extract_provider: provider,
      job_id,
    });

    let imagingStats = null;

    if (wantArt) {
      await updateIngest(env, job_id, { status: "imaging", progress: 0.55, detail: "freemium images", stage: "imaging" });
      dbg.log(PHASE.P3_IMAGES, "start", { art_style, chain: await (await import("../_shared/pipeline-registry.js")).resolvedFreemiumImageChain(env, "character") });
      const img = await runEdgeImaging({
        env,
        book_id,
        analysis,
        art_style,
        narrator_gender,
        dbg,
        onProgress: ({ kind, index, total, id }) => {
          updateIngest(env, job_id, {
            detail: `[P3] ${kind} ${index}/${total} ${id}`,
            progress: 0.55 + (0.35 * index) / total,
          }).catch(() => {});
        },
      });
      playback = img.playback;
      playback.status = "ready";
      playback.stage = "done";
      playback.progress = 1;
      imagingStats = img.stats;
      dbg.log(PHASE.P3_IMAGES, "done", imagingStats);
    } else {
      dbg.log(PHASE.P3_IMAGES, "skipped", { dry_run, generate_art });
    }

    await env.VAE_PACKS.put(
      `books/${book_id}.json`,
      JSON.stringify(playback, null, 2),
      { httpMetadata: { contentType: "application/json" } },
    );

    const lines = (playback.scenes || []).reduce((n, s) => n + (s.lines?.length || 0), 0);
    await putBookIndex(env, book_id, {
      book_id,
      title: playback.title,
      author: playback.author,
      status: "ready",
      stage: "done",
      progress: 1,
      scenes: playback.scenes.length,
      lines,
      art_style,
      extract_provider: provider,
    });

    await dbg.flush((patch) => updateIngest(env, job_id, patch), {
      status: "done",
      progress: 1,
      stage: "done",
      book_id,
      extract_provider: provider,
      imaging: imagingStats,
      detail: dry_run
        ? `[P2] dry run (${provider})`
        : wantArt
          ? `[P2+P3] done extract=${provider} images ok=${imagingStats?.ok ?? 0} fail=${imagingStats?.fail ?? 0}`
          : `[P2] extract=${provider} (images skipped)`,
    });
    message.ack();
  } catch (e) {
    console.error("ingest consumer", job_id, e);
    dbg.log("ERROR", String(e.message || e).slice(0, 200));
    await dbg.flush((patch) => updateIngest(env, job_id, patch), {
      status: "error",
      progress: 0,
      stage: "error",
      detail: String(e.message || e).slice(0, 300),
    });
    await putBookIndex(env, book_id, {
      book_id,
      title: book_id,
      status: "error",
      stage: "error",
      progress: 0,
      job_id,
      error: String(e.message || e).slice(0, 200),
    }).catch(() => {});
    message.retry();
  }
}
