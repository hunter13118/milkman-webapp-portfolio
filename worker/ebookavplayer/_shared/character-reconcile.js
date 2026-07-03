/**
 * Heuristic cross-chapter character reconciliation for the parallel
 * chapter-extraction path. Concurrent chapters can't fully see each other's
 * "known characters" hint (only best-effort, snapshotted at dispatch time),
 * so a chapter can reintroduce an already-named character under a generic
 * placeholder (e.g. "unnamed male protagonist" for the established "Eizo").
 * This runs right before a chapter drains, given every character source
 * available at that moment — already-drained knownCharacters (canonical)
 * plus any completed-but-undrained chapters sitting in the look-ahead
 * buffer — and rewrites the placeholder's id (in its own character entry and
 * every scene/line reference) to the matching canonical id. No LLM call.
 */
const PLACEHOLDER_PATTERNS = [
  /unnamed/,
  /unknown/,
  /\bprotagonist\b/,
  /\bthe[- ](?:young |old |tall |short )?(?:man|woman|boy|girl|guy|lady|gentleman)\b/,
];

export function isPlaceholderCharacter(character) {
  const s = `${character?.id || ""} ${character?.name || ""}`.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((re) => re.test(s));
}

function descriptionWords(desc) {
  return new Set(
    String(desc || "")
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
}

function scoreMatch(placeholder, candidate) {
  if (!candidate?.id || candidate.id === placeholder.id) return -1;
  if (placeholder.gender && candidate.gender && placeholder.gender !== candidate.gender) return -1;

  let score = 0;
  if (placeholder.gender && candidate.gender && placeholder.gender === candidate.gender) score += 1;
  if (placeholder.importance && candidate.importance && placeholder.importance === candidate.importance) score += 1;

  const pw = descriptionWords(placeholder.description);
  const cw = descriptionWords(candidate.description);
  for (const w of pw) if (cw.has(w)) score += 1;

  return score;
}

/** Best non-placeholder candidate for a placeholder character, or null if none/ambiguous. */
function bestMatch(placeholder, candidates) {
  let best = null;
  let bestScore = 0;
  let tieCount = 0;
  for (const candidate of candidates) {
    if (isPlaceholderCharacter(candidate)) continue;
    const score = scoreMatch(placeholder, candidate);
    if (score <= 0) continue;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      tieCount = 1;
    } else if (score === bestScore) {
      tieCount += 1;
    }
  }
  if (!best || tieCount > 1) return null;
  return best;
}

export function reconcileChapterCharacters(chapterAnalysis, { knownCharacters = [], lookaheadCharacters = [] } = {}) {
  const candidates = [...knownCharacters, ...lookaheadCharacters];
  const chars = chapterAnalysis.characters || [];
  if (!candidates.length || !chars.length) return chapterAnalysis;

  const idMap = new Map();
  const renamed = chars.map((c) => {
    if (!isPlaceholderCharacter(c)) return c;
    const best = bestMatch(c, candidates);
    if (!best) return c;
    idMap.set(c.id, best.id);
    return {
      ...c,
      id: best.id,
      name: best.name || c.name,
      aliases: [...new Set([...(c.aliases || []), ...(best.aliases || []), c.name].filter(Boolean))],
      description: (best.description || "").length > (c.description || "").length ? best.description : c.description,
    };
  });

  if (!idMap.size) return chapterAnalysis;

  const dedupedById = new Map();
  for (const c of renamed) {
    const existing = dedupedById.get(c.id);
    if (!existing) {
      dedupedById.set(c.id, { ...c });
      continue;
    }
    existing.aliases = [...new Set([...(existing.aliases || []), ...(c.aliases || [])])];
    if ((c.description || "").length > (existing.description || "").length) existing.description = c.description;
  }

  const remap = (id) => idMap.get(id) || id;
  const scenes = (chapterAnalysis.scenes || []).map((s) => ({
    ...s,
    present_character_ids: (s.present_character_ids || []).map(remap),
    lines: (s.lines || []).map((l) => (l.character_id ? { ...l, character_id: remap(l.character_id) } : l)),
  }));

  return { ...chapterAnalysis, characters: [...dedupedById.values()], scenes };
}
