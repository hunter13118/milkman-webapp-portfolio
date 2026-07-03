/** R2 helpers for resumable, per-chapter extraction checkpoints. */

function checkpointKey(bookId) {
  return `books/${bookId}/checkpoint.json`;
}

function chapterKey(bookId, chapterIdx) {
  return `books/${bookId}/chapters/${chapterIdx}.json`;
}

function rawChapterKey(bookId, chapterPos) {
  return `books/${bookId}/chapters/${chapterPos}.raw.json`;
}

export async function getCheckpoint(env, bookId) {
  if (!env.VAE_PACKS) return null;
  const obj = await env.VAE_PACKS.get(checkpointKey(bookId));
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function putCheckpoint(env, bookId, checkpoint) {
  if (!env.VAE_PACKS) return;
  await env.VAE_PACKS.put(
    checkpointKey(bookId),
    JSON.stringify({ ...checkpoint, updated_at: new Date().toISOString() }, null, 2),
    { httpMetadata: { contentType: "application/json" } },
  );
}

export function emptyCheckpoint(totalChapters) {
  return {
    total_chapters: totalChapters,
    chapters_done: [],
    next_chapter_idx: 0,
    voice_state: { usedCounts: { male: 0, female: 0, neutral: 0 }, assignments: {} },
    next_line_idx: 0,
    provider_used: null,
  };
}

export async function getChapterPack(env, bookId, chapterIdx) {
  if (!env.VAE_PACKS) return null;
  const obj = await env.VAE_PACKS.get(chapterKey(bookId, chapterIdx));
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function putChapterPack(env, bookId, chapterIdx, data) {
  if (!env.VAE_PACKS) return;
  await env.VAE_PACKS.put(
    chapterKey(bookId, chapterIdx),
    JSON.stringify(data, null, 2),
    { httpMetadata: { contentType: "application/json" } },
  );
}

/**
 * Raw (pre-reconciliation) per-chapter LLM extraction result, cached the
 * moment a chapter's own extraction finishes — independent of chapter order.
 *
 * Concurrent chapters can finish "out of order" (a later chapter's LLM call
 * completes before an earlier one still churning through a huge chapter),
 * but the checkpoint only advances in strict book order (voice assignment
 * and playback line numbering depend on it). Without this cache, a crash
 * while an earlier chapter is still mid-extraction throws away every later
 * chapter's already-finished (expensive, slow local-LLM) work too, since
 * none of it was ever durable — only the in-memory look-ahead buffer held
 * it. This lets a resume skip the LLM call entirely for any chapter whose
 * raw result already made it to R2, even if it was never drained/checkpointed.
 */
export async function getRawChapterExtract(env, bookId, chapterPos) {
  if (!env.VAE_PACKS) return null;
  const obj = await env.VAE_PACKS.get(rawChapterKey(bookId, chapterPos));
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

export async function putRawChapterExtract(env, bookId, chapterPos, data) {
  if (!env.VAE_PACKS) return;
  await env.VAE_PACKS.put(
    rawChapterKey(bookId, chapterPos),
    JSON.stringify(data, null, 2),
    { httpMetadata: { contentType: "application/json" } },
  );
}

export async function deleteRawChapterExtract(env, bookId, chapterPos) {
  if (!env.VAE_PACKS) return;
  await env.VAE_PACKS.delete(rawChapterKey(bookId, chapterPos)).catch(() => {});
}
