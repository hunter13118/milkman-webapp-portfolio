/** Patch illustration_ref fields on analysis + sync to playback. */

export function applyIllustrationRefsPatch(analysis, { cover_illustration_ref, characters } = {}) {
  const out = {
    ...analysis,
    characters: (analysis.characters || []).map((c) => ({ ...c })),
  };

  if (cover_illustration_ref !== undefined) {
    if (cover_illustration_ref === null) delete out.cover_illustration_ref;
    else out.cover_illustration_ref = cover_illustration_ref;
  }

  if (characters && typeof characters === "object") {
    for (const c of out.characters) {
      if (!Object.prototype.hasOwnProperty.call(characters, c.id)) continue;
      const v = characters[c.id];
      if (v === null) delete c.illustration_ref;
      else c.illustration_ref = v;
    }
  }

  return out;
}

export function syncIllustrationRefsToPlayback(playback, analysis) {
  if (analysis?.illustration_urls) playback.illustration_urls = analysis.illustration_urls;
  if (analysis?.cover_illustration_ref != null) {
    playback.cover_illustration_ref = analysis.cover_illustration_ref;
  } else {
    delete playback.cover_illustration_ref;
  }

  const byId = Object.fromEntries((analysis?.characters || []).map((c) => [c.id, c]));
  for (const [cid, c] of Object.entries(playback.characters || {})) {
    const ref = byId[cid]?.illustration_ref;
    if (ref != null) c.illustration_ref = ref;
    else delete c.illustration_ref;
  }

  return playback;
}

export function validateIllustrationRef(ref, catalog) {
  if (ref === null || ref === undefined) return true;
  if (!Number.isInteger(ref) || ref < 0) return false;
  const urls = catalog || {};
  return Object.prototype.hasOwnProperty.call(urls, ref)
    || Object.prototype.hasOwnProperty.call(urls, String(ref));
}
