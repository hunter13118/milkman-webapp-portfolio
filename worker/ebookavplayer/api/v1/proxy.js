import { proxyToOrigin, originBase } from "../../_shared/proxy-fetch.js";
import { packDownloadResponse, tryPackFromR2 } from "../../_shared/r2-packs.js";

const API_PREFIX = "/projects/ebookavplayer/api";

/** Catch-all proxy: /projects/ebookavplayer/api/* → VAE_API_ORIGIN/* */
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(API_PREFIX)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const upstream = url.pathname.slice(API_PREFIX.length) || "/";
  return proxyToOrigin(request, env, upstream);
}

/** GET pack build file — R2 fast path, then origin. */
export async function onPackBuildFileGet({ request, env, bookId, jobId }) {
  const hit = await tryPackFromR2(env, { jobId });
  if (hit) {
    return packDownloadResponse(hit.obj, `${bookId}.vaepack`);
  }

  if (env.VAE_JOBS) {
    const raw = await env.VAE_JOBS.get(`job:${jobId}`);
    if (raw) {
      const st = JSON.parse(raw);
      if (st.book_id && st.book_id !== bookId) {
        return Response.json({ error: "job book mismatch" }, { status: 404 });
      }
      if (st.r2_key) {
        const obj = await env.VAE_PACKS?.get(st.r2_key);
        if (obj) return packDownloadResponse(obj, `${bookId}.vaepack`);
      }
      if (st.status !== "done") {
        return Response.json(
          {
            error: "pack not ready",
            status: st.status,
            progress: st.progress ?? 0,
            detail: st.detail || "",
            ready: false,
          },
          { status: 409 },
        );
      }
      return Response.json(
        { error: "pack file missing in storage", job_id: jobId, detail: st.detail || "" },
        { status: 404 },
      );
    }
  }

  if (!originBase(env)) {
    return Response.json(
      { error: "pack not found — start a build and wait until ready=true", job_id: jobId },
      { status: 404 },
    );
  }
  const url = new URL(request.url);
  return proxyToOrigin(
    request,
    env,
    `/books/${encodeURIComponent(bookId)}/pack/build/${encodeURIComponent(jobId)}/file${url.search}`,
  );
}

/** GET cached pack by content hash (optional CDN-style route). */
export async function onPackCacheGet({ env, cacheKey, bookId }) {
  const hit = await tryPackFromR2(env, { cacheKey });
  if (!hit) return Response.json({ error: "not found" }, { status: 404 });
  return packDownloadResponse(hit.obj, `${bookId || "pack"}.${cacheKey}.vaepack`);
}

/** POST pack build — enqueue when queue binding present, else proxy to origin. */
export async function onPackBuildPost({ request, env, bookId, body }) {
  if (!env.VAE_JOBS_QUEUE && !env.VAE_PACK_QUEUE) {
    const url = new URL(request.url);
    return proxyToOrigin(
      request,
      env,
      `/books/${encodeURIComponent(bookId)}/pack/build${url.search}`,
    );
  }
  const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const msg = {
    kind: "pack-build",
    job_id: jobId,
    book_id: bookId,
    tier: body?.tier || "audiobook",
    style: body?.style || null,
    force: Boolean(body?.force),
  };
  await (env.VAE_JOBS_QUEUE || env.VAE_PACK_QUEUE).send(msg);
  if (env.VAE_JOBS) {
    await env.VAE_JOBS.put(`job:${jobId}`, JSON.stringify({
      ...msg,
      status: "queued",
      progress: 0,
      detail: "queued on Cloudflare",
    }), { expirationTtl: 86400 });
  }
  return Response.json({
    job_id: jobId,
    book_id: bookId,
    tier: msg.tier,
    style: msg.style || "",
    status: "queued",
    progress: 0,
    detail: "queued",
    ready: false,
    cached: false,
    queued: true,
  });
}

/** Poll job status — KV first (edge pack build), origin fallback. */
export async function onPackBuildStatusGet({ request, env, bookId, jobId }) {
  if (env.VAE_JOBS) {
    const raw = await env.VAE_JOBS.get(`job:${jobId}`);
    if (raw) {
      const st = JSON.parse(raw);
      if (st.book_id && st.book_id !== bookId) {
        return Response.json({ error: "job book mismatch" }, { status: 404 });
      }
      return Response.json({
        ...st,
        ready: st.status === "done" && Boolean(st.r2_key || st.path),
        log: st.log || (st.debug_log || []).map((e) => `[${e.phase}] ${e.msg}`),
        debug_log: st.debug_log || [],
      });
    }
  }
  if (!env.VAE_API_ORIGIN) {
    return Response.json({ error: "no such pack job" }, { status: 404 });
  }
  const url = new URL(request.url);
  return proxyToOrigin(
    request,
    env,
    `/books/${encodeURIComponent(bookId)}/pack/build/${encodeURIComponent(jobId)}${url.search}`,
  );
}
