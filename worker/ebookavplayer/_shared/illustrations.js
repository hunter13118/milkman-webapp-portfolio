/** EPUB illustration modes — edge port of server/playback/illustrations.py */

export function defaultIllustrationMode(artStyle, imageCount) {
  // "moment" is a manual, opt-in, per-scene feature — never applied
  // automatically. "direct-use" is the only mode that automatically surfaces
  // extracted EPUB plates as cover/character/background art, so when real
  // plates exist, use them rather than silently discarding them into
  // "reference" (server-side i2i hint only, never shown to the user).
  if (imageCount > 0) return "direct-use";
  return "reference";
}

export function normalizeIllustrationMode(mode, artStyle, imageCount) {
  const m = String(mode || "auto").toLowerCase().trim();
  if (["direct", "direct-use", "direct_use", "use"].includes(m)) return "direct-use";
  if (["moment", "flash", "insert"].includes(m)) return "moment";
  if (m === "reference") return "reference";
  return defaultIllustrationMode(artStyle, imageCount);
}

function catalogUrl(catalog, ref) {
  if (ref == null) return null;
  return catalog?.[ref] ?? catalog?.[String(ref)] ?? null;
}

/** Map illustration_ref → permanent cover / character / background slots. */
export function applyDirectIllustrations(playback, analysis, illustrationUrls) {
  const counts = { characters: 0, backgrounds: 0, cover: 0 };
  if (!playback || !illustrationUrls || !Object.keys(illustrationUrls).length) {
    return { playback, counts };
  }

  let coverUrl = playback.cover && String(playback.cover).startsWith("/media/")
    ? playback.cover
    : null;

  for (const c of analysis?.characters || []) {
    if (!c?.id) continue;
    const url = catalogUrl(illustrationUrls, c.illustration_ref);
    if (!url || !playback.characters?.[c.id]) continue;
    playback.characters[c.id].sprite = url;
    for (const scene of playback.scenes || []) {
      for (const p of scene.present || []) {
        if (p.character_id === c.id) p.sprite = url;
      }
    }
    counts.characters += 1;
    if (!coverUrl) coverUrl = url;
  }

  for (const s of analysis?.scenes || []) {
    if (s.reuse_background_of) continue;
    const url = catalogUrl(illustrationUrls, s.illustration_ref);
    if (!url) continue;
    const sceneOut = (playback.scenes || []).find((sc) => sc.id === s.id);
    if (!sceneOut) continue;
    sceneOut.background = url;
    counts.backgrounds += 1;
    if (!coverUrl) coverUrl = url;
  }

  if (coverUrl && counts.characters + counts.backgrounds > 0) {
    playback.cover = coverUrl;
    counts.cover = 1;
  }

  return { playback, counts };
}
