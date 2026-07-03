import { putJob, getJob, putBookIndex, json } from "../../_shared/jobs-kv.js";
import { emitJobEvent, jobToEvent } from "../../_shared/job-events.js";
import { extractEpubText } from "../../_shared/epub-text.js";
import { deleteR2Prefix } from "./books.js";

const SMALL_BOOK_CHAPTER_THRESHOLD = 15;

/** Pick a sensible default extraction provider from an estimated chapter count. */
function defaultProviderForSize(chapterCount, env) {
  if (chapterCount <= SMALL_BOOK_CHAPTER_THRESHOLD) return "gemini";
  if (String(env.OLLAMA_BASE_URL || "").trim()) return "ollama-7b";
  return "cerebras";
}

function edgeIngestEnabled(env) {
  return Boolean(env.VAE_PACKS && env.VAE_JOBS && env.VAE_JOBS_QUEUE);
}

/** POST /ingest — store EPUB in R2, enqueue extract, return immediately. */
export async function onIngestPost({ request, env, ctx }) {
  if (!edgeIngestEnabled(env)) {
    return null; // caller falls back to origin proxy
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "expected multipart form" }, 400);
  }

  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return json({ error: "missing file" }, 400);
  }

  const jobId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const now = Date.now();
  const name = file.name || "book.epub";
  const bookId = name.replace(/\.epub$/i, "").replace(/[^\w-]+/g, "-").slice(0, 64) || `book-${jobId}`;
  const artStyle = form.get("art_style") || "anime";
  const narratorGender = form.get("narrator_gender") || "male";
  const dryRun = form.get("dry_run") === "true";
  const generateArt = form.get("generate_art") !== "false";
  const byoMode = form.get("byo_mode") === "true";
  const illustrationMode = String(form.get("illustration_mode") || env.ILLUSTRATION_MODE || "auto");
  let preferProvider = form.get("prefer_provider") || null;
  if (preferProvider === "auto") preferProvider = null;

  const bytes = await file.arrayBuffer();
  await env.VAE_PACKS.put(`uploads/${jobId}.epub`, bytes, {
    httpMetadata: { contentType: "application/epub+zip" },
  });
  await env.VAE_PACKS.put(`uploads/${bookId}.epub`, bytes, {
    httpMetadata: { contentType: "application/epub+zip" },
  });

  // Drop stale playback + checkpoint from a prior ingest of the same book id
  // so failures/re-uploads don't keep serving old JSON or wrongly "resume" a
  // checkpoint that belongs to a different EPUB.
  await env.VAE_PACKS.delete(`books/${bookId}.json`).catch(() => {});
  await env.VAE_PACKS.delete(`books/${bookId}.analysis.json`).catch(() => {});
  await env.VAE_PACKS.delete(`books/${bookId}/checkpoint.json`).catch(() => {});
  // Also drop any raw-extraction cache / compiled chapter packs from a prior
  // attempt — otherwise a fresh ingest could silently reuse stale per-chapter
  // results (see book-checkpoint.js's raw-chapter-extract cache) instead of
  // actually re-extracting from this upload.
  await deleteR2Prefix(env, `books/${bookId}/chapters/`).catch(() => {});

  if (!preferProvider) {
    try {
      const maxChars = parseInt(env.VAE_EPUB_MAX_CHARS || "800000", 10) || 800000;
      const parsed = extractEpubText(bytes, { maxChars });
      preferProvider = defaultProviderForSize(parsed.chapters?.length || 0, env);
    } catch {
      preferProvider = "gemini";
    }
  }

  const job = {
    job_id: jobId,
    book_id: bookId,
    status: "queued",
    progress: 0,
    detail: "queued on Cloudflare",
    stage: "queued",
    art_style: artStyle,
    created_at: now,
    updated_at: now,
  };
  await putJob(env, "ingest", jobId, job);
  await emitJobEvent(env, jobId, jobToEvent(job, "queued"));

  await putBookIndex(env, bookId, {
    book_id: bookId,
    title: name.replace(/\.epub$/i, ""),
    author: "",
    status: "processing",
    stage: "queued",
    progress: 0,
    job_id: jobId,
    active_job_id: jobId,
    art_style: artStyle,
  });

  const msg = {
    kind: "ingest",
    job_id: jobId,
    book_id: bookId,
    art_style: artStyle,
    narrator_gender: narratorGender,
    dry_run: dryRun,
    generate_art: generateArt,
    byo_mode: byoMode,
    illustration_mode: illustrationMode,
    prefer_provider: preferProvider,
  };

  if (env.VAE_JOBS_QUEUE) {
    await env.VAE_JOBS_QUEUE.send(msg);
  } else if (ctx?.waitUntil) {
    ctx.waitUntil((async () => {
      const { handleIngestMessage } = await import("../../queue/ingest-consumer.js");
      await handleIngestMessage({ body: msg, ack: () => {}, retry: () => {} }, env);
    })());
  }

  return json({ job_id: jobId, book_id: bookId, status: "queued", prefer_provider: preferProvider });
}

/** GET /ingest/:job_id */
export async function onIngestStatusGet({ env, jobId }) {
  if (!edgeIngestEnabled(env)) return null;
  const job = await getJob(env, "ingest", jobId);
  if (!job) return json({ error: "no such job" }, 404);
  return json({
    job_id: jobId,
    book_id: job.book_id,
    status: job.status,
    stage: job.stage || job.status,
    progress: job.progress ?? 0,
    detail: job.detail || "",
    phase: job.phase || null,
    phase_label: job.phase_label || null,
    step: job.step || null,
    step_index: job.step_index ?? null,
    step_total: job.step_total ?? null,
    progress_meta: job.progress_meta || null,
    log: job.log || [],
    debug_log: job.debug_log || [],
    banners: [],
  });
}
