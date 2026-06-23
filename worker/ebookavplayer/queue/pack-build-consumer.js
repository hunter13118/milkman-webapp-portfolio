/** Pack build — edge (Phase 4) or FastAPI webhook fallback. */

import { buildPackOnEdge, TIER_VISUAL, TIER_AUDIOBOOK } from "../_shared/pack-build-edge.js";
import { createPhaseLogger, PHASE } from "../_shared/phase-debug.js";

async function updateJob(env, jobId, patch) {
  if (!env.VAE_JOBS) return;
  const key = `job:${jobId}`;
  const prev = await env.VAE_JOBS.get(key);
  const base = prev ? JSON.parse(prev) : {};
  await env.VAE_JOBS.put(key, JSON.stringify({ ...base, ...patch }), { expirationTtl: 86400 * 7 });
}

async function webhookToOrigin(message, env) {
  const base = (env.VAE_API_ORIGIN || "").replace(/\/$/, "");
  const secret = env.QUEUE_WEBHOOK_SECRET || "";
  if (!base || !secret) return false;

  const res = await fetch(`${base}/internal/queue/pack-build`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Queue-Secret": secret },
    body: JSON.stringify(message.body),
  });
  if (!res.ok) {
    console.error("pack-build webhook", res.status, await res.text());
    return false;
  }
  const st = await res.json();
  if (env.VAE_JOBS && st?.job_id) {
    await env.VAE_JOBS.put(`job:${st.job_id}`, JSON.stringify(st), { expirationTtl: 86400 });
  }
  return true;
}

export async function handlePackBuildMessage(message, env) {
  const body = message.body;
  const { job_id, book_id, tier = TIER_AUDIOBOOK, style } = body;
  const dbg = createPhaseLogger(env, "pack", job_id);

  const useOrigin =
    String(env.VAE_PACK_USE_ORIGIN || "").toLowerCase() === "true" &&
    env.VAE_API_ORIGIN &&
    env.QUEUE_WEBHOOK_SECRET;

  if (useOrigin) {
    dbg.log(PHASE.P4_PACK, "delegating to origin webhook");
    const ok = await webhookToOrigin(message, env);
    if (ok) {
      message.ack();
      return;
    }
    dbg.log(PHASE.P4_PACK, "webhook failed — trying edge");
  }

  try {
    dbg.log(PHASE.P4_PACK, "edge build start", { book_id, tier, style });
    await updateJob(env, job_id, {
      status: "building",
      progress: 0.02,
      detail: "[P4] loading playback",
      book_id,
      tier,
      style,
    });

    const bookObj = await env.VAE_PACKS.get(`books/${book_id}.json`);
    if (!bookObj) throw new Error(`playback missing for ${book_id}`);
    const book = JSON.parse(await bookObj.text());
    const packStyle = style || book.art_style || "semi-real";

    const { bytes, manifest, audioManifest } = await buildPackOnEdge({
      env,
      book,
      tier: tier === TIER_VISUAL ? TIER_VISUAL : TIER_AUDIOBOOK,
      style: packStyle,
      dbg,
      onProgress: (p, detail) => {
        updateJob(env, job_id, {
          status: "building",
          progress: Math.min(0.99, p),
          detail: `[P4] ${detail}`,
        }).catch(() => {});
      },
    });

    const r2Key = `packs/jobs/${job_id}.vaepack`;
    await env.VAE_PACKS.put(r2Key, bytes, {
      httpMetadata: { contentType: "application/zip" },
    });
    dbg.log(PHASE.P4_PACK, "uploaded to R2", { r2Key, bytes: bytes.length });

    await dbg.flush((patch) => updateJob(env, job_id, patch), {
      status: "done",
      progress: 1,
      detail: `[P4] pack ready (${manifest.audio_line_count || 0} audio lines)`,
      ready: true,
      r2_key: r2Key,
      book_id,
      tier,
      style: packStyle,
      audio_source: manifest.audio_engine || null,
      audio_lines: manifest.audio_line_count || 0,
    });
    message.ack();
  } catch (e) {
    console.error("pack-build edge", job_id, e);
    dbg.log("ERROR", String(e.message || e).slice(0, 200));
    await dbg.flush((patch) => updateJob(env, job_id, patch), {
      status: "error",
      progress: 0,
      error: String(e.message || e).slice(0, 300),
      detail: `[P4] error: ${String(e.message || e).slice(0, 120)}`,
      ready: false,
    });
    message.retry();
  }
}

/** Legacy batch export for direct import. */
export async function onQueueBatch(batch, env) {
  for (const message of batch.messages) {
    await handlePackBuildMessage(message, env);
  }
}
