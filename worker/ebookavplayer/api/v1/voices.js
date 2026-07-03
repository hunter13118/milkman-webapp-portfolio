import { json } from "../../_shared/jobs-kv.js";
import { edgeVoiceCatalog } from "../../_shared/voice-assign.js";

export async function onEdgeVoicesGet({ url }) {
  const locale = url.searchParams.get("locale") || "";
  return json(edgeVoiceCatalog(locale));
}

export async function onBookVoicesGet({ env, bookId }) {
  if (!env.VAE_JOBS) return json({});
  const raw = await env.VAE_JOBS.get(`voices:${bookId}`);
  return json(raw ? JSON.parse(raw) : {});
}

export async function onBookVoicesPost({ request, env, bookId }) {
  if (!env.VAE_JOBS) return json({ error: "kv not configured" }, 503);
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "expected JSON body" }, 400);
  }
  await env.VAE_JOBS.put(`voices:${bookId}`, JSON.stringify(body), {
    expirationTtl: 86400 * 365,
  });
  return json(body);
}
