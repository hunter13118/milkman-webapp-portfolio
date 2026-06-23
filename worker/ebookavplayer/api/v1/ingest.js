import { putJob, getJob, json } from "../../_shared/jobs-kv.js";

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
  const name = file.name || "book.epub";
  const bookId = name.replace(/\.epub$/i, "").replace(/[^\w-]+/g, "-").slice(0, 64) || `book-${jobId}`;
  const artStyle = form.get("art_style") || "semi-real";
  const narratorGender = form.get("narrator_gender") || "male";
  const dryRun = form.get("dry_run") === "true";
  const generateArt = form.get("generate_art") !== "false";

  const bytes = await file.arrayBuffer();
  await env.VAE_PACKS.put(`uploads/${jobId}.epub`, bytes, {
    httpMetadata: { contentType: "application/epub+zip" },
  });

  const job = {
    job_id: jobId,
    book_id: bookId,
    status: "queued",
    progress: 0,
    detail: "queued on Cloudflare",
    stage: "queued",
    art_style: artStyle,
  };
  await putJob(env, "ingest", jobId, job);

  const msg = {
    kind: "ingest",
    job_id: jobId,
    book_id: bookId,
    art_style: artStyle,
    narrator_gender: narratorGender,
    dry_run: dryRun,
    generate_art: generateArt,
  };

  if (env.VAE_JOBS_QUEUE) {
    await env.VAE_JOBS_QUEUE.send(msg);
  } else if (ctx?.waitUntil) {
    ctx.waitUntil((async () => {
      const { handleIngestMessage } = await import("../../queue/ingest-consumer.js");
      await handleIngestMessage({ body: msg, ack: () => {}, retry: () => {} }, env);
    })());
  }

  return json({ job_id: jobId, book_id: bookId, status: "queued" });
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
    log: job.log || [],
    debug_log: job.debug_log || [],
    banners: [],
  });
}
