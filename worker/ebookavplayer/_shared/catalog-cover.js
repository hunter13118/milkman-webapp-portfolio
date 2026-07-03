/** Keep KV catalog `cover` in sync with playback / media commits. */
import { putBookIndex } from "./jobs-kv.js";

const COVER_URL_RE = /\/media\/[^"'\s)]+\/cover\.(?:png|jpe?g|webp)/i;

/** Derive cover path from playback.cover or any embedded /media/.../cover.png URL. */
export function coverFromPlaybackJson(playback) {
  if (playback?.cover) return String(playback.cover).split("?")[0];
  const raw = JSON.stringify(playback || {});
  const m = raw.match(COVER_URL_RE);
  return m ? m[0].split("?")[0] : null;
}

/** Probe R2 for a generated cover image. */
export async function coverFromR2Media(env, bookId, artStyle) {
  if (!env?.VAE_PACKS || !bookId) return null;
  const styles = [];
  if (artStyle) styles.push(artStyle);
  for (const s of ["anime", "semi-real", "pixel"]) styles.push(s);
  const seen = new Set();
  for (const style of styles) {
    if (seen.has(style)) continue;
    seen.add(style);
    const rel = `${bookId}/${style}/cover.png`;
    const obj = await env.VAE_PACKS.get(`media/${rel}`);
    if (obj) return `/media/${rel}`;
  }
  return null;
}

/** Best-effort cover URL for catalog tiles. */
export async function resolveCoverUrl(env, bookId, playback, meta = {}) {
  const fromPlayback = coverFromPlaybackJson(playback);
  if (fromPlayback) return fromPlayback;
  return coverFromR2Media(env, bookId, meta.art_style || playback?.art_style || playback?.active_style);
}

export async function syncCatalogCover(env, bookId, coverUrl) {
  if (!env?.VAE_JOBS || !bookId || !coverUrl) return;
  await putBookIndex(env, bookId, { cover: coverUrl });
}

/** Fill missing catalog fields from compiled playback JSON. */
export async function enrichCatalogMetaFromPlayback(env, bookId, meta) {
  if (!env?.VAE_PACKS || !meta) return meta;
  const needsTitle = !meta.title;
  const needsCover = !meta.cover;
  if (!needsTitle && !needsCover) return meta;

  const pbObj = await env.VAE_PACKS.get(`books/${bookId}.json`);
  if (!pbObj) {
    if (needsCover) {
      const fromR2 = await coverFromR2Media(env, bookId, meta.art_style);
      if (fromR2) meta.cover = fromR2;
    }
    return meta;
  }

  try {
    const playback = await pbObj.json();
    if (needsTitle && playback.title) meta.title = playback.title;
    if (!meta.author && playback.author) meta.author = playback.author;
    if (needsCover) {
      meta.cover = await resolveCoverUrl(env, bookId, playback, meta) || meta.cover;
    }
  } catch {
    /* keep meta */
  }
  return meta;
}
