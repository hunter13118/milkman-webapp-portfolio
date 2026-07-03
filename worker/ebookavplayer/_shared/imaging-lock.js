import { getJob, putJob, putBookIndex } from "./jobs-kv.js";

/** Max time an imaging job may hold the book lock while idle. */
const STALE_MS = 20 * 60 * 1000;
/** Queue pickup grace — ingest jobs may sit queued briefly without timestamps. */
const QUEUED_GRACE_MS = 2 * 60 * 1000;
/** Full freemium chain ≈ 5 providers × 18s — allow headroom before declaring stuck. */
const PROVIDER_STALE_MS = 3 * 60 * 1000;

function waitingOnProvider(detail) {
  return / via |Trying /i.test(String(detail || ""));
}

function clearedLock(meta, patch = {}) {
  return {
    ...meta,
    imaging_locked: false,
    active_job_id: null,
    status: patch.status || "ready",
    stage: patch.stage || "done",
    progress: patch.progress ?? 1,
    detail: patch.detail || "",
  };
}

function jobTimestamp(job) {
  if (!job) return 0;
  if (typeof job.updated_at === "number") return job.updated_at;
  if (typeof job.created_at === "number") return job.created_at;
  if (typeof job.ts === "number") return job.ts;
  return 0;
}

function jobLooksStuck(job, { now = Date.now() } = {}) {
  if (!job) return true;
  if (job.status === "done" || job.status === "error") return true;

  const detail = String(job.detail || "");
  const ts = jobTimestamp(job);
  const active = job.status === "processing" || job.status === "imaging";

  if (waitingOnProvider(detail)) {
    if (!ts) return false;
    if (now - ts > PROVIDER_STALE_MS) return true;
  }

  const atCap = job.step_index != null && job.step_total != null
    && job.step_index >= job.step_total;
  const highProgress = (job.progress ?? 0) >= 0.99;
  if (active && (atCap || highProgress)) {
    if (!ts) return false;
    if (now - ts > 4 * 60 * 1000) return true;
  }

  if (job.status === "queued") {
    if (!ts) {
      if (!job.created_at) return false;
      return now - job.created_at > QUEUED_GRACE_MS;
    }
    if (now - ts > 10 * 60 * 1000) return true;
  }

  if (ts && now - ts > STALE_MS) return true;

  if (!ts && active) return false;

  return false;
}

function staleLockPatch(meta, job, reason) {
  return {
    ...meta,
    imaging_locked: false,
    active_job_id: null,
    status: "processing",
    stage: meta.stage === "imaging" || job?.stage === "imaging" ? "imaging" : (meta.stage || "imaging"),
    progress: meta.progress ?? job?.progress ?? 0,
    detail: reason,
    error: reason,
  };
}

export async function markJobStale(env, jobId, job, reason) {
  if (!jobId || !env?.VAE_JOBS) return;
  const next = {
    ...(job || {}),
    status: "error",
    stage: "error",
    detail: reason,
    error: reason,
    updated_at: Date.now(),
  };
  await putJob(env, "ingest", jobId, next);
}

/**
 * Drop imaging lock when the active job finished, vanished, or timed out.
 * @returns {{ meta: object, active: boolean, cleared: boolean, job: object|null }}
 */
export async function reconcileImagingLock(env, bookId, meta = {}) {
  const locked = Boolean(meta.imaging_locked || meta.active_job_id);
  const jobId = meta.active_job_id || (locked ? meta.job_id : null);
  if (!locked) return { meta, active: false, cleared: false, job: null };

  if (!jobId) {
    const next = clearedLock(meta);
    return { meta: next, active: false, cleared: true, job: null };
  }

  const job = await getJob(env, "ingest", jobId);

  if (!job) {
    const next = clearedLock(meta);
    return { meta: next, active: false, cleared: true, job: null };
  }

  // Terminal jobs — release lock; do not run stale provider timeout path on already-failed jobs.
  if (job.status === "done" || job.status === "error") {
    const next = clearedLock(meta, {
      status: job.status === "error" ? "ready" : "ready",
      stage: job.status === "error" ? "imaging" : "done",
      progress: job.status === "error" ? (job.progress ?? meta.progress ?? 0) : 1,
      detail: job.detail || job.error || "",
    });
    return { meta: next, active: false, cleared: true, job };
  }

  if (jobLooksStuck(job)) {
    const reason = waitingOnProvider(job?.detail)
      ? "Image provider timed out — unlock and retry regen"
      : "Imaging job stalled — unlock and retry";
    await markJobStale(env, jobId, job, reason);
    const next = staleLockPatch(meta, job, reason);
    return { meta: next, active: false, cleared: true, job };
  }

  let next = { ...meta };
  let synced = false;
  if (typeof job.progress === "number" && (next.progress ?? 0) > job.progress + 0.02) {
    next.progress = job.progress;
    next.stage = job.stage || next.stage;
    next.status = job.status || next.status;
    next.detail = job.detail || next.detail;
    synced = true;
  }

  return { meta: next, active: true, cleared: synced, job };
}

/** Reconcile and persist when stale or progress was desynced. */
export async function ensureImagingLockFresh(env, bookId) {
  const raw = await env.VAE_JOBS?.get(`book:${bookId}`);
  const meta = raw ? JSON.parse(raw) : {};
  const { meta: next, active, cleared } = await reconcileImagingLock(env, bookId, meta);
  if (cleared) await putBookIndex(env, bookId, next);
  return { active, meta: next, cleared };
}

export { jobLooksStuck, waitingOnProvider };
