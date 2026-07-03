import { emitJobEvent, inferEventType, pickEventFields } from "./job-events.js";

/** Merge KV ingest job state and emit a lifecycle event. */
export async function touchIngestJob(env, jobId, patch, { eventType, dbg, provider, kind, id } = {}) {
  if (!env?.VAE_JOBS) return patch;

  const key = `ingest:${jobId}`;
  const prevRaw = await env.VAE_JOBS.get(key);
  const base = prevRaw ? JSON.parse(prevRaw) : {};

  let merged = { ...base, ...patch, updated_at: Date.now() };
  if (dbg?.entries) {
    const tail = dbg.entries.slice(-80);
    merged = {
      ...merged,
      debug_log: tail,
      log: tail.map((e) => `[${e.phase}] ${e.msg}`),
    };
  }

  await env.VAE_JOBS.put(key, JSON.stringify(merged), { expirationTtl: 86400 * 7 });

  const type = eventType || inferEventType(patch, base);
  const event = {
    type,
    ts: Date.now(),
    ...pickEventFields(merged),
  };
  if (provider) event.provider = provider;
  if (kind) event.kind = kind;
  if (id) event.id = id;

  await emitJobEvent(env, jobId, event);
  return merged;
}
