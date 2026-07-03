import {
  generateImage, composeImagePrompt, mediaUrl, r2MediaKey, artStyleKey, applyImagingPinState,
} from "./freemium-image.js";
import { compilePlayback } from "./compile-playback.js";
import { planCharacterImaging, stockSpriteUrl } from "./generic-sprites.js";
import {
  backupMediaAsset,
  writeStagingAsset,
} from "./media-versions.js";
import {
  loadStyleReferenceBytes,
  loadStyleReferencePublicUrls,
  referenceTargetsForCharacterWithStylePool,
  publicMediaOrigin,
} from "./reference-images.js";

function characterGenDescription(c) {
  const parts = [c.description, c.name, c.id].filter(Boolean);
  let desc = String(parts[0] || c.id).trim();
  if (Array.isArray(c.appearance_changes) && c.appearance_changes.length) {
    desc += `. Current look: ${c.appearance_changes.join("; ")}`;
  }
  return desc;
}

function optionalLimit(env, key) {
  const v = parseInt(env[key], 10);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function wantsCharacter(filter, id) {
  if (!filter || filter.scope === "all") return true;
  if (filter.scope === "characters") return true;
  if (filter.scope === "selected") return (filter.character_ids || []).includes(id);
  return false;
}

function wantsCover(filter) {
  if (!filter || filter.scope === "all") return true;
  if (filter.scope === "cover") return true;
  if (filter.scope === "selected") return Boolean(filter.include_cover);
  return false;
}

function wantsBackground(filter, sid) {
  if (!filter || filter.scope === "all") return true;
  if (filter.scope === "backgrounds") return true;
  if (filter.scope === "selected") return (filter.scene_ids || []).includes(sid);
  return false;
}

async function storeGeneratedAsset({
  env, book_id, art_style, kind, key, img, compare, stageUntilConfirm,
  media, bust, beforeLive,
}) {
  if (compare && stageUntilConfirm) {
    const prevUrl = await backupMediaAsset(env, book_id, art_style, kind, key);
    const afterUrl = await writeStagingAsset(
      env, book_id, art_style, kind, key, img.bytes, img.contentType,
    );
    return {
      afterUrl: afterUrl ? `${afterUrl}?v=${bust}` : null,
      beforeUrl: beforeLive || prevUrl || null,
      promoted: false,
    };
  }

  const fname = kind === "cover"
    ? "cover.png"
    : kind === "characters"
      ? `char_${key}.png`
      : `bg_${String(key).replace(/[^\w-]+/g, "_")}.png`;
  if (compare) await backupMediaAsset(env, book_id, art_style, kind, key);
  await env.VAE_PACKS.put(r2MediaKey(book_id, art_style, fname), img.bytes, {
    httpMetadata: { contentType: img.contentType || "image/png" },
  });
  const liveUrl = mediaUrl(book_id, art_style, fname, { bust });
  if (kind === "characters") media.characters[key] = liveUrl;
  else if (kind === "cover") media.cover = liveUrl;
  else media.backgrounds[key] = liveUrl;
  return {
    afterUrl: liveUrl,
    beforeUrl: beforeLive,
    promoted: true,
  };
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
  filter = null,
  existingMedia = null,
  diversify = false,
  ignorePins = false,
  preferProvider = null,
  compare = false,
  stageUntilConfirm = false,
  onComparison = null,
  onCoverReady = null,
  onProviderAttempt = null,
  onProviderWait = null,
  onImageFailure = null,
}) {
  const styleKey = artStyleKey(art_style);
  const maxChars = optionalLimit(env, "VAE_IMAGING_MAX_CHARS");
  const maxBgs = optionalLimit(env, "VAE_IMAGING_MAX_BGS");

  const media = {
    characters: { ...(existingMedia?.characters || {}) },
    backgrounds: { ...(existingMedia?.backgrounds || {}) },
    cover: existingMedia?.cover || null,
    inserts: { ...(existingMedia?.inserts || {}) },
  };
  // `ignorePins` never actually carried a prior pin into this function — a
  // regen batch always started fresh regardless of its value (dead branch,
  // both sides were `null`). It answers "respect an old pin?"; an explicit
  // `preferProvider` answers "the user picked X for this run" — unrelated,
  // so it seeds the starting pin unconditionally.
  let imagePin = preferProvider || null;
  let pollinationsAltFirst = false;
  let ok = 0;
  let fail = 0;
  let stock = 0;
  const runBust = Date.now();

  let styleRefPool = [];
  let styleRefPoolUrls = [];
  const mediaOrigin = publicMediaOrigin(env);
  if (env.VAE_PACKS) {
    for (const alt of ["anime", "semi-real", "cartoon", "pixel"]) {
      if (alt === art_style) continue;
      const blobs = await loadStyleReferenceBytes(env, book_id, alt, 3);
      if (blobs.length) {
        styleRefPool = blobs;
        styleRefPoolUrls = await loadStyleReferencePublicUrls(env, book_id, alt, mediaOrigin, 3);
        break;
      }
    }
  }

  const { toGenerate, fromStock, lineCounts, totalLines } = planCharacterImaging(analysis, env);
  let chars = toGenerate.filter((c) => wantsCharacter(filter, c.id));
  if (maxChars) chars = chars.slice(0, maxChars);

  dbg?.log("P3_IMAGES", `imaging ${chars.length} custom + ${fromStock.length} stock characters`, {
    styleKey,
    capped: Boolean(maxChars),
    totalLines,
    partial: Boolean(filter),
    stageUntilConfirm,
    cover: wantsCover(filter),
  });

  if (wantsCover(filter)) {
    onProgress?.({ kind: "cover", index: 1, total: 1, id: "cover" });
    const title = analysis.title || book_id;
    const coverDesc = `Evocative book cover key art for '${title}'. No text.`;
    const prompt = composeImagePrompt(coverDesc, { subjectType: "background", style: art_style });
    const seed = hashSeed(`${book_id}:cover:${art_style}${diversify ? `:${Date.now()}` : ""}`);
    const beforeLive = media.cover || null;
    try {
      const img = await generateImage(prompt, {
        subjectType: "background",
        preferProvider: imagePin,
        seed,
        env,
        pollinationsAltFirst,
        onAttempt: (provider) => onProviderAttempt?.(provider, { kind: "cover", id: "cover" }),
        onProviderWait: (provider, waitMs) => onProviderWait?.(provider, { kind: "cover", id: "cover", waitMs }),
      });
      if (!ignorePins) {
        ({ imagePin, pollinationsAltFirst } = applyImagingPinState(
          { imagePin, pollinationsAltFirst }, img, env,
        ));
      }
      const bust = runBust;
      const stored = await storeGeneratedAsset({
        env, book_id, art_style, kind: "cover", key: "cover", img,
        compare, stageUntilConfirm, media, bust, beforeLive,
      });
      ok += 1;
      if (compare && stored.afterUrl && onComparison) {
        await onComparison({
          kind: "cover",
          key: "cover",
          before_url: stored.beforeUrl || null,
          after_url: stored.afterUrl,
        });
      }
      if (stored.promoted && stored.afterUrl) {
        onCoverReady?.(stored.afterUrl);
      }
      dbg?.log("P3_IMAGES", "cover ok", { provider: img.provider, staged: !stored.promoted });
    } catch (e) {
      fail += 1;
      const errText = String(e.message || e).slice(0, 300);
      dbg?.log("P3_IMAGES", "cover fail", { error: errText.slice(0, 120) });
      onImageFailure?.({ kind: "cover", id: "cover", error: errText });
    }
  }

  for (const c of fromStock) {
    if (!wantsCharacter(filter, c.id)) continue;
    const url = await stockSpriteUrl(c.id, c.gender, env);
    media.characters[c.id] = url;
    stock += 1;
    onProgress?.({ kind: "stock", index: stock, total: fromStock.length, id: c.id });
  }

  for (let ci = 0; ci < chars.length; ci++) {
    const c = chars[ci];
    onProgress?.({ kind: "character", index: ci + 1, total: chars.length, id: c.id });
    const desc = characterGenDescription(c);
    const prompt = composeImagePrompt(desc, { subjectType: "character", style: art_style });
    const seed = hashSeed(`${book_id}:${c.id}:${art_style}${diversify ? `:${Date.now()}` : ""}`);
    const beforeLive = media.characters[c.id] || null;
    const refTargets = await referenceTargetsForCharacterWithStylePool(
      env, book_id, analysis, c.id, art_style, { stylePool: styleRefPool, stylePoolUrls: styleRefPoolUrls },
    );
    try {
      const img = await generateImage(prompt, {
        subjectType: "character",
        preferProvider: imagePin,
        seed,
        env,
        pollinationsAltFirst,
        referenceImages: refTargets.bytes.length ? refTargets.bytes : undefined,
        referenceImageUrls: refTargets.urls.length ? refTargets.urls : undefined,
        onAttempt: (provider) => onProviderAttempt?.(provider, { kind: "character", id: c.id }),
        onProviderWait: (provider, waitMs) => onProviderWait?.(provider, { kind: "character", id: c.id, waitMs }),
      });
      if (!ignorePins) {
        ({ imagePin, pollinationsAltFirst } = applyImagingPinState(
          { imagePin, pollinationsAltFirst }, img, env,
        ));
      }
      const bust = runBust + ci;
      const stored = await storeGeneratedAsset({
        env, book_id, art_style, kind: "characters", key: c.id, img,
        compare, stageUntilConfirm, media, bust, beforeLive,
      });
      ok += 1;
      if (compare && stored.afterUrl && onComparison) {
        await onComparison({
          kind: "characters",
          key: c.id,
          before_url: stored.beforeUrl || null,
          after_url: stored.afterUrl,
        });
      }
      dbg?.log("P3_IMAGES", `char ok ${c.id}`, { provider: img.provider, staged: !stored.promoted });
    } catch (e) {
      fail += 1;
      const errText = String(e.message || e).slice(0, 300);
      dbg?.log("P3_IMAGES", `char fail ${c.id}`, { error: errText.slice(0, 120) });
      onImageFailure?.({ kind: "character", id: c.id, error: errText });
    }
  }

  const bgSeen = new Map();
  const scenes = analysis.scenes || [];
  let bgGenerated = 0;
  for (let si = 0; si < scenes.length; si++) {
    const scene = scenes[si];
    const sid = scene.id || `scene-${si}`;
    if (!wantsBackground(filter, sid)) continue;
    if (maxBgs && bgGenerated >= maxBgs) break;
    const reuse = scene.reuse_background_of;
    if (reuse && bgSeen.has(reuse)) {
      media.backgrounds[sid] = bgSeen.get(reuse);
      onProgress?.({ kind: "background", index: si + 1, total: scenes.length, id: sid, reused: true });
      continue;
    }
    onProgress?.({ kind: "background", index: si + 1, total: scenes.length, id: sid });
    const desc = scene.background_desc || scene.location || scene.title || sid;
    const prompt = composeImagePrompt(desc, { subjectType: "background", style: art_style });
    const seed = hashSeed(`${book_id}:${sid}:${art_style}${diversify ? `:${Date.now()}` : ""}`);
    const beforeLive = media.backgrounds[sid] || null;
    try {
      const img = await generateImage(prompt, {
        subjectType: "background",
        preferProvider: imagePin,
        seed,
        env,
        pollinationsAltFirst,
        onAttempt: (provider) => onProviderAttempt?.(provider, { kind: "background", id: sid }),
        onProviderWait: (provider, waitMs) => onProviderWait?.(provider, { kind: "background", id: sid, waitMs }),
      });
      if (!ignorePins) {
        ({ imagePin, pollinationsAltFirst } = applyImagingPinState(
          { imagePin, pollinationsAltFirst }, img, env,
        ));
      }
      const bust = runBust + si;
      const stored = await storeGeneratedAsset({
        env, book_id, art_style, kind: "backgrounds", key: sid, img,
        compare, stageUntilConfirm, media, bust, beforeLive,
      });
      if (stored.promoted) {
        media.backgrounds[sid] = stored.afterUrl;
        bgSeen.set(sid, stored.afterUrl);
      }
      bgGenerated += 1;
      ok += 1;
      if (compare && stored.afterUrl && onComparison) {
        await onComparison({
          kind: "backgrounds",
          key: sid,
          before_url: stored.beforeUrl || null,
          after_url: stored.afterUrl,
        });
      }
      dbg?.log("P3_IMAGES", `bg ok ${sid}`, { provider: img.provider, staged: !stored.promoted });
    } catch (e) {
      fail += 1;
      const errText = String(e.message || e).slice(0, 300);
      dbg?.log("P3_IMAGES", `bg fail ${sid}`, { error: errText.slice(0, 120) });
      onImageFailure?.({ kind: "background", id: sid, error: errText });
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
  if (media.characters) {
    for (const [id, url] of Object.entries(media.characters)) {
      if (base.characters?.[id]) base.characters[id].sprite = url;
    }
  }
  if (media.cover) base.cover = media.cover;
  return base;
}

function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2147483647;
}

export { r2MediaKey, mediaUrl };
