import {
  onRequest,
  onPackBuildFileGet,
  onPackCacheGet,
  onPackBuildPost,
  onPackBuildStatusGet,
} from "./api/v1/proxy.js";
import { onIngestPost, onIngestStatusGet } from "./api/v1/ingest.js";
import { onBooksGet, onBookGet } from "./api/v1/books.js";
import { onMediaGet } from "./api/v1/media.js";
import { onPipelineGet, onPipelinePatch } from "./api/v1/pipeline.js";
import { onQueueBatch } from "./queue/dispatch.js";

const API = "/projects/ebookavplayer/api";

/** Route ebookavplayer API through edge (R2 fast path, queue, or origin proxy). */
export async function handleEbookavplayerApi(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.slice(API.length) || "/";
  const method = request.method;

  if (method === "POST" && path === "/ingest") {
    const edge = await onIngestPost({ request, env, ctx });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const ingestStatus = path.match(/^\/ingest\/([^/]+)$/);
  if (method === "GET" && ingestStatus) {
    const edge = await onIngestStatusGet({ env, jobId: ingestStatus[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  if (method === "GET" && path === "/books") {
    const edge = await onBooksGet({ env });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const bookGet = path.match(/^\/books\/([^/]+)$/);
  if (method === "GET" && bookGet) {
    const edge = await onBookGet({ env, bookId: bookGet[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const buildFile = path.match(/^\/books\/([^/]+)\/pack\/build\/([^/]+)\/file$/);
  if (method === "GET" && buildFile) {
    return onPackBuildFileGet({
      request, env, bookId: buildFile[1], jobId: buildFile[2],
    });
  }

  const buildStatus = path.match(/^\/books\/([^/]+)\/pack\/build\/([^/]+)$/);
  if (method === "GET" && buildStatus) {
    return onPackBuildStatusGet({
      request, env, bookId: buildStatus[1], jobId: buildStatus[2],
    });
  }

  const buildStart = path.match(/^\/books\/([^/]+)\/pack\/build$/);
  if (method === "POST" && buildStart) {
    let body = {};
    try { body = await request.clone().json(); } catch { /* empty */ }
    return onPackBuildPost({ request, env, bookId: buildStart[1], body });
  }

  if (method === "GET" && path === "/pipeline") {
    const edge = await onPipelineGet({ env });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  if (method === "PATCH" && path === "/pipeline") {
    const edge = await onPipelinePatch({ request, env });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const mediaGet = path.match(/^\/media\/(.+)$/);
  if (method === "GET" && mediaGet) {
    return onMediaGet({ env, relPath: mediaGet[1] });
  }

  const cacheGet = path.match(/^\/packs\/cache\/([^/]+)$/);
  if (method === "GET" && cacheGet) {
    return onPackCacheGet({
      env, cacheKey: cacheGet[1], bookId: url.searchParams.get("book_id") || "pack",
    });
  }

  if (method === "GET" && path === "/health") {
    const kvReady = Boolean(env.VAE_JOBS);
    return Response.json({
      ok: true,
      service: "ebookavplayer-edge",
      edge_ingest: Boolean(env.VAE_PACKS && env.VAE_JOBS && env.VAE_JOBS_QUEUE),
      extract_skip_gemini: String(env.EXTRACT_SKIP_GEMINI || "true").toLowerCase() === "true",
      freemium_keys: {
        cerebras: Boolean(env.CEREBRAS_API_KEY),
        groq: Boolean(env.GROQ_API_KEY),
        mistral: Boolean(env.MISTRAL_API_KEY),
        openrouter: Boolean(env.OPENROUTER_API_KEY),
        cloudflare: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
        pollinations: Boolean(env.POLLINATIONS_TOKEN),
        huggingface: Boolean(env.HF_TOKEN),
      },
      origin: Boolean(env.VAE_API_ORIGIN),
      r2: Boolean(env.VAE_PACKS),
      kv: kvReady,
      jobs_queue: Boolean(env.VAE_JOBS_QUEUE),
      pack_queue: Boolean(env.VAE_PACK_QUEUE),
      gemini: Boolean(env.GEMINI_API_KEY),
      debug: String(env.VAE_DEBUG ?? "true").toLowerCase() !== "false",
      pipeline_kv: Boolean(env.VAE_JOBS),
      phases: {
        p1_parse: true,
        p2_extract_freemium: true,
        p3_images_freemium: true,
        p4_pack_edge: true,
      },
    });
  }

  return onRequest({ request, env });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(API)) {
      return handleEbookavplayerApi(request, env, ctx);
    }
    return Response.json({ error: "standalone VAE worker — mount via portfolio" }, { status: 404 });
  },
  async queue(batch, env, ctx) {
    return onQueueBatch(batch, env);
  },
};
