import { json } from "../../_shared/jobs-kv.js";

/** GET /media/{book_id}/{style}/{file} — serve R2-stored art. */
export async function onMediaGet({ env, relPath }) {
  if (!env.VAE_PACKS) return json({ error: "r2 not configured" }, 503);
  const key = `media/${relPath}`;
  const obj = await env.VAE_PACKS.get(key);
  if (!obj) return json({ error: "not found" }, 404);
  const headers = new Headers();
  const ct = obj.httpMetadata?.contentType || "image/png";
  headers.set("content-type", ct);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(obj.body, { status: 200, headers });
}
