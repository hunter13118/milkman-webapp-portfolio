/** KV helpers for VAE edge jobs (ingest, pack build). */

export async function putJob(env, prefix, jobId, data) {
  if (!env.VAE_JOBS) return;
  await env.VAE_JOBS.put(`${prefix}:${jobId}`, JSON.stringify(data), { expirationTtl: 86400 * 7 });
}

export async function getJob(env, prefix, jobId) {
  if (!env.VAE_JOBS) return null;
  const raw = await env.VAE_JOBS.get(`${prefix}:${jobId}`);
  return raw ? JSON.parse(raw) : null;
}

export async function putBookIndex(env, bookId, meta) {
  if (!env.VAE_JOBS) return;
  await env.VAE_JOBS.put(`book:${bookId}`, JSON.stringify(meta));
  const raw = await env.VAE_JOBS.get("catalog:ids");
  const ids = raw ? JSON.parse(raw) : [];
  if (!ids.includes(bookId)) {
    ids.push(bookId);
    await env.VAE_JOBS.put("catalog:ids", JSON.stringify(ids));
  }
}

export async function listBookIds(env) {
  if (!env.VAE_JOBS) return [];
  const raw = await env.VAE_JOBS.get("catalog:ids");
  return raw ? JSON.parse(raw) : [];
}

export function json(data, status = 200) {
  return Response.json(data, { status });
}
