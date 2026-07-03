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

export async function putBookIndex(env, bookId, patch, { prev: prevHint } = {}) {
  if (!env.VAE_JOBS) return;
  let prev;
  let prevRaw = null;
  if (prevHint) {
    prev = { ...prevHint, book_id: bookId };
  } else {
    prevRaw = await env.VAE_JOBS.get(`book:${bookId}`);
    prev = prevRaw ? JSON.parse(prevRaw) : {};
  }
  const next = { ...prev, ...patch, book_id: bookId };
  if (typeof next.progress === "number") {
    next.progress = Math.min(1, Math.max(0, next.progress));
  }
  await env.VAE_JOBS.put(`book:${bookId}`, JSON.stringify(next));
  if (prevRaw || prevHint) return;
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

/** Remove a book from the catalog + its KV sidecars (progress, voices). */
export async function deleteBookIndex(env, bookId) {
  if (!env.VAE_JOBS) return;
  await Promise.all([
    env.VAE_JOBS.delete(`book:${bookId}`),
    env.VAE_JOBS.delete(`progress:${bookId}`),
    env.VAE_JOBS.delete(`voices:${bookId}`),
  ]);
  const raw = await env.VAE_JOBS.get("catalog:ids");
  const ids = raw ? JSON.parse(raw) : [];
  const next = ids.filter((id) => id !== bookId);
  if (next.length !== ids.length) {
    await env.VAE_JOBS.put("catalog:ids", JSON.stringify(next));
  }
}

export function json(data, status = 200) {
  return Response.json(data, { status });
}
