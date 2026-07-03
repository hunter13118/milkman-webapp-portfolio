import { putBookIndex } from "../_shared/jobs-kv.js";
import { touchIngestJob } from "../_shared/job-touch.js";
import { createPhaseLogger } from "../_shared/phase-debug.js";
import {
  composeImagePrompt,
  generateImage,
  mediaUrl,
  r2MediaKey,
} from "../_shared/freemium-image.js";
import {
  backupMediaAsset,
  cacheBustUrl,
  prevPublicUrl,
  patchPlaybackMediaUrl,
} from "../_shared/media-versions.js";
import {
  lineAtIndex,
  momentDescription,
  patchAnalysisLine,
  tweakMomentLine,
  stableInsertSeed,
} from "../_shared/moment-inserts.js";
import { referenceTargetsForMoment } from "../_shared/reference-images.js";

function findPlaybackLine(playback, lineIdx) {
  for (const scene of playback?.scenes || []) {
    for (const line of scene.lines || []) {
      if (line.idx === lineIdx) return { scene, line };
    }
  }
  return { scene: null, line: null };
}

export async function handleMomentGenerateMessage(message, env) {
  const {
    job_id,
    book_id,
    line_idx: lineIdx,
    tweak_script: tweakScript = true,
    diversify = false,
  } = message.body;
  const dbg = createPhaseLogger(env, "moment-generate", job_id);
  const comparisons = [];
  const key = String(lineIdx);

  try {
    await touchIngestJob(env, job_id, {
      status: "processing",
      stage: "imaging",
      progress: 0.05,
      detail: `moment insert line ${lineIdx}`,
      comparisons: [],
      line_idx: lineIdx,
    }, { eventType: "started", dbg });

    const axObj = await env.VAE_PACKS.get(`books/${book_id}.analysis.json`);
    if (!axObj) throw new Error("no book data to generate from");
    let analysis = await axObj.json();

    const loc = lineAtIndex(analysis, lineIdx);
    if (!loc) throw new Error(`no line at index ${lineIdx}`);
    const { scene, line } = loc;

    const tweaked = await tweakMomentLine(analysis, scene, line, {
      useLlm: Boolean(tweakScript),
      env,
    });
    analysis = patchAnalysisLine(analysis, lineIdx, tweaked);
    await env.VAE_PACKS.put(
      `books/${book_id}.analysis.json`,
      JSON.stringify(analysis, null, 2),
      { httpMetadata: { contentType: "application/json" } },
    );

    const pbObj = await env.VAE_PACKS.get(`books/${book_id}.json`);
    const playback = pbObj ? await pbObj.json() : null;

    const bookMetaRaw = await env.VAE_JOBS?.get(`book:${book_id}`);
    const bookMeta = bookMetaRaw ? JSON.parse(bookMetaRaw) : {};
    const art_style = bookMeta.art_style || playback?.active_style || playback?.art_style || "semi-real";

    const desc = momentDescription(analysis, scene, tweaked, { lineIdx });
    const prompt = composeImagePrompt(desc, { subjectType: "character", style: art_style });
    const seed = diversify
      ? Math.floor(Math.random() * 2147483646) + 1
      : stableInsertSeed(key);

    const liveKey = r2MediaKey(book_id, art_style, `insert_${key}.png`);
    const hadExisting = Boolean(await env.VAE_PACKS.get(liveKey));
    let beforeUrl = null;
    if (hadExisting) {
      beforeUrl = await backupMediaAsset(env, book_id, art_style, "inserts", key);
    }

    await touchIngestJob(env, job_id, {
      status: "processing",
      stage: "imaging",
      progress: 0.35,
      detail: `Generating moment · line ${lineIdx}`,
    }, { eventType: "progress", dbg });

    const refTargets = await referenceTargetsForMoment(
      env, book_id, analysis, scene, tweaked, art_style,
    );

    const img = await generateImage(prompt, {
      subjectType: "character",
      seed,
      env,
      referenceImages: refTargets.bytes.length ? refTargets.bytes : undefined,
      referenceImageUrls: refTargets.urls.length ? refTargets.urls : undefined,
      onAttempt: (provider) => {
        touchIngestJob(env, job_id, {
          status: "processing",
          stage: "imaging",
          detail: `Trying ${provider} for moment · line ${lineIdx}`,
        }, { eventType: "provider", provider, dbg }).catch(() => {});
      },
    });

    if (!img?.bytes) throw new Error("moment image generation failed");

    await env.VAE_PACKS.put(liveKey, img.bytes, {
      httpMetadata: { contentType: img.contentType || "image/png" },
    });

    const bust = Date.now();
    const liveUrl = cacheBustUrl(mediaUrl(book_id, art_style, `insert_${key}.png`), bust);

    await patchPlaybackMediaUrl(env, book_id, "inserts", key, liveUrl);

    const pbObj2 = await env.VAE_PACKS.get(`books/${book_id}.json`);
    if (pbObj2) {
      const pb = await pbObj2.json();
      const { line: pbLine } = findPlaybackLine(pb, lineIdx);
      if (pbLine) {
        pbLine.illustration_url = liveUrl;
        const caption = String(tweaked.text || "").slice(0, 72).trim();
        pbLine.illustration_caption = caption + (String(tweaked.text || "").length > 72 ? "…" : "");
        pbLine.visual_moment = true;
      }
      pb.inserts = pb.inserts || {};
      pb.inserts[key] = liveUrl;
      await env.VAE_PACKS.put(`books/${book_id}.json`, JSON.stringify(pb, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });
    }

    if (hadExisting) {
      comparisons.push({
        kind: "inserts",
        key,
        before_url: beforeUrl || prevPublicUrl(book_id, art_style, "inserts", key),
        after_url: liveUrl,
      });
    }

    await putBookIndex(env, book_id, {
      status: "ready",
      stage: "done",
      progress: 1,
    }).catch(() => {});

    await dbg.flush((patch) => touchIngestJob(env, job_id, patch, { eventType: "done", dbg }), {
      status: "done",
      stage: "done",
      progress: 1,
      detail: "moment insert done",
      book_id,
      line_idx: lineIdx,
      comparisons,
    });
    message.ack();
  } catch (e) {
    console.error("moment generate", job_id, e);
    await touchIngestJob(env, job_id, {
      status: "error",
      stage: "error",
      progress: 0,
      detail: String(e.message || e).slice(0, 300),
      comparisons,
      error: String(e.message || e).slice(0, 300),
      line_idx: lineIdx,
    }, { eventType: "error", dbg });
    message.ack();
  }
}
