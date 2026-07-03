import {
  onRequest,
  onPackBuildFileGet,
  onPackCacheGet,
  onPackBuildPost,
  onPackBuildStatusGet,
  onPackBuildCancelPost,
  onAudioManifestGet,
} from "./api/v1/proxy.js";
import { onIngestPost } from "./api/v1/ingest.js";
import {
  onReExtractPost,
  onContinueExtractPost,
  onGenerateMediaPost,
  onGenerateMomentPost,
  onImagingUnlockPost,
  onJobStatusGet,
  onJobEventsGet,
  onMediaRevertPost,
  onMediaCommitPost,
  onMediaUploadPost,
  onIllustrationRefsPatch,
  onExternalRefsGet,
  onExternalRefsPatch,
} from "./api/v1/book-actions.js";
import { onBooksGet, onBookGet, onBookDelete } from "./api/v1/books.js";
import { onMediaGet } from "./api/v1/media.js";
import { onPipelineGet, onPipelinePatch } from "./api/v1/pipeline.js";
import { onTtsPost } from "./api/v1/tts.js";
import { onProgressGet, onProgressPost } from "./api/v1/progress.js";
import { onEdgeVoicesGet, onBookVoicesGet, onBookVoicesPost } from "./api/v1/voices.js";
import { onQueueBatch } from "./queue/dispatch.js";
import { json } from "./_shared/jobs-kv.js";
import { huggingfaceAvailable } from "./_shared/freemium-image.js";
import { handleOptions, withCors } from "./_shared/cors.js";

const API = "/projects/ebookavplayer/api";

/** Bare paths for Vite dev proxy (vite.config.js → :8600 without API prefix). */
const BARE_PREFIXES = ["/books", "/ingest", "/tts", "/voices", "/media", "/pipeline", "/packs", "/health"];

function resolveApiPath(pathname) {
  if (pathname.startsWith(API)) {
    return pathname.slice(API.length) || "/";
  }
  for (const p of BARE_PREFIXES) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return pathname;
  }
  return null;
}

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

  const ingestEvents = path.match(/^\/ingest\/([^/]+)\/events$/);
  if (method === "GET" && ingestEvents) {
    const edge = await onJobEventsGet({ env, jobId: ingestEvents[1], request });
    if (edge) return edge;
    return json({ error: "no such job" }, 404);
  }

  const ingestStatus = path.match(/^\/ingest\/([^/]+)$/);
  if (method === "GET" && ingestStatus) {
    const edge = await onJobStatusGet({ env, jobId: ingestStatus[1] });
    if (edge) return edge;
    const { onIngestStatusGet } = await import("./api/v1/ingest.js");
    const legacy = await onIngestStatusGet({ env, jobId: ingestStatus[1] });
    if (legacy) return legacy;
    return onRequest({ request, env });
  }

  const reExtract = path.match(/^\/books\/([^/]+)\/re-extract$/);
  if (method === "POST" && reExtract) {
    const force = url.searchParams.get("force") === "true";
    const preferProvider = url.searchParams.get("prefer_provider") || null;
    const edge = await onReExtractPost({
      env, bookId: reExtract[1], force, preferProvider,
    });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const continueExtract = path.match(/^\/books\/([^/]+)\/continue-extract$/);
  if (method === "POST" && continueExtract) {
    const edge = await onContinueExtractPost({ request, env, bookId: continueExtract[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const genMedia = path.match(/^\/books\/([^/]+)\/generate-media$/);
  if (method === "POST" && genMedia) {
    const edge = await onGenerateMediaPost({ request, env, bookId: genMedia[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const genMoment = path.match(/^\/books\/([^/]+)\/moments\/generate$/);
  if (method === "POST" && genMoment) {
    const edge = await onGenerateMomentPost({ request, env, bookId: genMoment[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const unlock = path.match(/^\/books\/([^/]+)\/imaging\/unlock$/);
  if (method === "POST" && unlock) {
    const edge = await onImagingUnlockPost({ env, bookId: unlock[1], request });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const mediaRevert = path.match(/^\/books\/([^/]+)\/media\/revert$/);
  if (method === "POST" && mediaRevert) {
    const edge = await onMediaRevertPost({ request, env, bookId: mediaRevert[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const mediaCommit = path.match(/^\/books\/([^/]+)\/media\/commit$/);
  if (method === "POST" && mediaCommit) {
    const edge = await onMediaCommitPost({ request, env, bookId: mediaCommit[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const mediaUpload = path.match(/^\/books\/([^/]+)\/media\/upload$/);
  if (method === "POST" && mediaUpload) {
    const edge = await onMediaUploadPost({ request, env, bookId: mediaUpload[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const illustrationRefs = path.match(/^\/books\/([^/]+)\/illustration-refs$/);
  if (method === "PATCH" && illustrationRefs) {
    const edge = await onIllustrationRefsPatch({ request, env, bookId: illustrationRefs[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const externalRefs = path.match(/^\/books\/([^/]+)\/external-refs$/);
  if (externalRefs) {
    if (method === "GET") {
      const edge = await onExternalRefsGet({ env, bookId: externalRefs[1] });
      if (edge) return edge;
      return onRequest({ request, env });
    }
    if (method === "PATCH") {
      const edge = await onExternalRefsPatch({ request, env, bookId: externalRefs[1] });
      if (edge) return edge;
      return onRequest({ request, env });
    }
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

  if (method === "DELETE" && bookGet) {
    const edge = await onBookDelete({ env, bookId: bookGet[1] });
    if (edge) return edge;
    return onRequest({ request, env });
  }

  const buildFile = path.match(/^\/books\/([^/]+)\/pack\/build\/([^/]+)\/file$/);
  if ((method === "GET" || method === "HEAD") && buildFile) {
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

  const buildCancel = path.match(/^\/books\/([^/]+)\/pack\/build\/([^/]+)\/cancel$/);
  if (method === "POST" && buildCancel) {
    return onPackBuildCancelPost({
      request, env, bookId: buildCancel[1], jobId: buildCancel[2],
    });
  }

  const audioManifest = path.match(/^\/books\/([^/]+)\/audio\/manifest$/);
  if (method === "GET" && audioManifest) {
    return onAudioManifestGet({ request, env, bookId: audioManifest[1] });
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

  if (method === "POST" && path === "/tts") {
    return onTtsPost({ request });
  }

  if (method === "GET" && path === "/voices/edge") {
    return onEdgeVoicesGet({ url });
  }

  const bookProgress = path.match(/^\/books\/([^/]+)\/progress$/);
  if (bookProgress) {
    if (method === "GET") return onProgressGet({ env, bookId: bookProgress[1] });
    if (method === "POST") return onProgressPost({ request, env, bookId: bookProgress[1] });
  }

  const bookVoices = path.match(/^\/books\/([^/]+)\/voices$/);
  if (bookVoices) {
    if (method === "GET") return onBookVoicesGet({ env, bookId: bookVoices[1] });
    if (method === "POST") return onBookVoicesPost({ request, env, bookId: bookVoices[1] });
  }

  if (method === "GET" && path === "/health") {
    const kvReady = Boolean(env.VAE_JOBS);
    const { getConfig } = await import("./_shared/pipeline-registry.js");
    const { evaluateCostEfficiency, attrLlmFromEnv } = await import("./_shared/pipeline-cost-guide.js");
    const cfg = kvReady ? await getConfig(env) : {};
    const cost = evaluateCostEfficiency(cfg, env);
    return Response.json({
      ok: true,
      service: "ebookavplayer-edge",
      edge_ingest: Boolean(env.VAE_PACKS && env.VAE_JOBS && env.VAE_JOBS_QUEUE),
      edge_tts: true,
      extract_skip_gemini: String(env.EXTRACT_SKIP_GEMINI || "true").toLowerCase() === "true",
      attr_llm: attrLlmFromEnv(env),
      cost_efficient: cost.matching,
      cost_guide: {
        label: cost.preset.label,
        matching: cost.matching,
        tips: cost.tips.slice(0, 6),
      },
      freemium_keys: {
        cerebras: Boolean(env.CEREBRAS_API_KEY),
        groq: Boolean(env.GROQ_API_KEY),
        mistral: Boolean(env.MISTRAL_API_KEY),
        openrouter: Boolean(env.OPENROUTER_API_KEY),
        cloudflare: Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN),
        pollinations: Boolean(env.POLLINATIONS_TOKEN),
        huggingface: huggingfaceAvailable(env),
        fal: Boolean(env.FAL_KEY || env.FAL_AI_API_KEY),
      },
      origin: Boolean(env.VAE_API_ORIGIN),
      r2: Boolean(env.VAE_PACKS),
      kv: kvReady,
      jobs_queue: Boolean(env.VAE_JOBS_QUEUE),
      job_events: Boolean(env.JOB_EVENTS),
      pack_queue: Boolean(env.VAE_PACK_QUEUE),
      gemini: Boolean(env.GEMINI_API_KEY),
      debug: String(env.VAE_DEBUG ?? "true").toLowerCase() !== "false",
      pipeline_kv: Boolean(env.VAE_JOBS),
      phases: {
        p1_parse: true,
        p2_extract_freemium: true,
        p3_images_freemium: true,
        p4_pack_edge: true,
        edge_tts: true,
      },
    });
  }

  return onRequest({ request, env });
}

export { JobEventHub } from "./durable-objects/job-event-hub.js";

export default {
  async fetch(request, env, ctx) {
    const opt = handleOptions(request, env);
    if (opt) return opt;

    const url = new URL(request.url);
    const subPath = resolveApiPath(url.pathname);
    if (!subPath) {
      return withCors(
        Response.json({
          error: "standalone VAE edge worker",
          hint: "Use /projects/ebookavplayer/api/* or bare /books, /ingest, /tts, …",
        }, { status: 404 }),
        request,
        env,
      );
    }

    const apiUrl = new URL(request.url);
    apiUrl.pathname = `${API}${subPath === "/" ? "" : subPath}`;
    const apiRequest = new Request(apiUrl.toString(), request);
    const response = await handleEbookavplayerApi(apiRequest, env, ctx);
    return withCors(response, request, env);
  },
  async queue(batch, env, ctx) {
    return onQueueBatch(batch, env);
  },
};
