import { json } from "../../_shared/jobs-kv.js";

const EMPTY = { line: 0, sceneId: "", chapter: 0 };

export async function onProgressGet({ env, bookId }) {
  if (!env.VAE_JOBS) return json(EMPTY);
  const raw = await env.VAE_JOBS.get(`progress:${bookId}`);
  return json(raw ? JSON.parse(raw) : EMPTY);
}

export async function onProgressPost({ request, env, bookId }) {
  if (!env.VAE_JOBS) return json({ error: "kv not configured" }, 503);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "expected JSON body" }, 400);
  }
  const payload = {
    line: Number(body.line) || 0,
    sceneId: body.sceneId || "",
    chapter: Number(body.chapter) || 0,
  };
  await env.VAE_JOBS.put(`progress:${bookId}`, JSON.stringify(payload), {
    expirationTtl: 86400 * 365,
  });
  return json({ ok: true, ...payload });
}
