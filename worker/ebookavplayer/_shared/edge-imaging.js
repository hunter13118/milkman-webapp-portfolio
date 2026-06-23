import { freemiumImage, composeImagePrompt, mediaUrl, r2MediaKey, artStyleKey } from "./freemium-image.js";
import { compilePlayback } from "./compile-playback.js";
import { planCharacterImaging, stockSpriteUrl } from "./generic-sprites.js";

/** Optional positive limit via env (testing only); unset = no cap. */
function optionalLimit(env, key) {
  const v = parseInt(env[key], 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** Phase 3 — freemium sprites + backgrounds → R2 + updated playback JSON. */
export async function runEdgeImaging({
  env,
  book_id,
  analysis,
  art_style,
  narrator_gender,
  dbg,
  onProgress,
}) {
  const styleKey = artStyleKey(art_style);
  const maxChars = optionalLimit(env, "VAE_IMAGING_MAX_CHARS");
  const maxBgs = optionalLimit(env, "VAE_IMAGING_MAX_BGS");

  const media = { characters: {}, backgrounds: {} };
  let imagePin = null;
  let ok = 0;
  let fail = 0;
  let stock = 0;

  const { toGenerate, fromStock, lineCounts, totalLines } = planCharacterImaging(analysis, env);
  let chars = toGenerate;
  if (maxChars) chars = chars.slice(0, maxChars);

  dbg?.log("P3_IMAGES", `imaging ${chars.length} custom + ${fromStock.length} stock characters`, {
    styleKey,
    capped: Boolean(maxChars),
    totalLines,
  });

  for (const c of fromStock) {
    const url = await stockSpriteUrl(c.id, c.gender, env);
    media.characters[c.id] = url;
    stock += 1;
    dbg?.log("P3_IMAGES", `char stock ${c.id}`, {
      url,
      lines: lineCounts[c.id] || 0,
      importance: c.importance,
    });
  }

  for (let ci = 0; ci < chars.length; ci++) {
    const c = chars[ci];
    onProgress?.({ kind: "character", index: ci + 1, total: chars.length, id: c.id });
    const desc = c.description || c.name || c.id;
    const prompt = composeImagePrompt(desc, { subjectType: "character", style: styleKey });
    const seed = hashSeed(`${book_id}:${c.id}:${art_style}`);
    try {
      const img = await freemiumImage(prompt, {
        subjectType: "character",
        preferProvider: imagePin,
        seed,
        env,
      });
      if (!imagePin) imagePin = img.provider;
      const fname = `char_${c.id}.png`;
      await env.VAE_PACKS.put(r2MediaKey(book_id, art_style, fname), img.bytes, {
        httpMetadata: { contentType: img.contentType || "image/png" },
      });
      media.characters[c.id] = mediaUrl(book_id, art_style, fname);
      ok += 1;
      dbg?.log("P3_IMAGES", `char ok ${c.id}`, { provider: img.provider, lines: lineCounts[c.id] || 0 });
    } catch (e) {
      fail += 1;
      dbg?.log("P3_IMAGES", `char fail ${c.id}`, { error: String(e.message || e).slice(0, 120) });
    }
  }

  const bgSeen = new Map();
  const scenes = analysis.scenes || [];
  let bgGenerated = 0;
  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    if (maxBgs && bgGenerated >= maxBgs) break;
    const sid = scene.id || `scene-${si}`;
    const reuse = scene.reuse_background_of;
    if (reuse && bgSeen.has(reuse)) {
      media.backgrounds[sid] = bgSeen.get(reuse);
      onProgress?.({ kind: "background", index: si + 1, total: scenes.length, id: sid, reused: true });
      continue;
    }
    onProgress?.({ kind: "background", index: si + 1, total: scenes.length, id: sid });
    const desc = scene.background_desc || scene.location || scene.title || sid;
    const prompt = composeImagePrompt(desc, { subjectType: "background", style: styleKey });
    const seed = hashSeed(`${book_id}:${sid}:${art_style}`);
    try {
      const img = await freemiumImage(prompt, {
        subjectType: "background",
        preferProvider: imagePin,
        seed,
        env,
      });
      if (!imagePin) imagePin = img.provider;
      const fname = `bg_${sid.replace(/[^\w-]+/g, "_")}.png`;
      await env.VAE_PACKS.put(r2MediaKey(book_id, art_style, fname), img.bytes, {
        httpMetadata: { contentType: img.contentType || "image/png" },
      });
      const url = mediaUrl(book_id, art_style, fname);
      media.backgrounds[sid] = url;
      bgSeen.set(sid, url);
      bgGenerated += 1;
      ok += 1;
      dbg?.log("P3_IMAGES", `bg ok ${sid}`, { provider: img.provider });
    } catch (e) {
      fail += 1;
      dbg?.log("P3_IMAGES", `bg fail ${sid}`, { error: String(e.message || e).slice(0, 120) });
    }
  }

  const playback = compilePlaybackWithMedia(analysis, {
    art_style,
    narrator_gender,
    media,
  });

  dbg?.log("P3_IMAGES", "imaging complete", { ok, fail, stock, pin: imagePin });
  return { playback, media, stats: { ok, fail, stock, pin: imagePin } };
}

function compilePlaybackWithMedia(analysis, opts) {
  const base = compilePlayback(analysis, opts);
  const { media } = opts;
  if (!media) return base;

  for (const scene of base.scenes || []) {
    const sid = scene.id;
    if (media.backgrounds[sid]) scene.background = media.backgrounds[sid];
    for (const p of scene.present || []) {
      if (media.characters[p.character_id]) {
        p.sprite = media.characters[p.character_id];
      }
    }
  }
  return base;
}

function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2147483647;
}

export { r2MediaKey, mediaUrl };
