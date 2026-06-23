import { listBookIds, json } from "../../_shared/jobs-kv.js";

export async function onBooksGet({ env }) {
  if (!env.VAE_PACKS || !env.VAE_JOBS) return null;
  const ids = await listBookIds(env);
  const out = [];
  for (const book_id of ids) {
    const raw = await env.VAE_JOBS.get(`book:${book_id}`);
    if (raw) out.push(JSON.parse(raw));
  }
  return json(out.sort((a, b) => (a.title || "").localeCompare(b.title || "")));
}

export async function onBookGet({ env, bookId }) {
  if (!env.VAE_PACKS) return null;
  const obj = await env.VAE_PACKS.get(`books/${bookId}.json`);
  if (!obj) return json({ error: "no such book" }, 404);
  return json(await obj.json());
}
