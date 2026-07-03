/** Deterministic speaker attribution after LLM extract (tags + turn-taking). */

import { isPlainSpeechTagLine, repairAnalysis } from "./dialogue-repair.js";

const PRONOUN_TAG = /^(he|she|they)\b/i;
const VERB_NAME_AFTER = /\b(?:said|asked|replied|answered|whispered|muttered|continued|added|exclaimed|demanded|insisted|declared|explained|offered|suggested|warned|promised|agreed|protested|mused|wondered|admitted|confessed|informed|told|reported|finished|concluded|began|started|pressed|urged|pleaded|begged|commanded|ordered|interrupted)\s+([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)/i;
const NAME_VERB_BEFORE = /\b([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)\s+(?:said|asked|replied|answered|whispered|muttered|continued|added)\b/i;
const SELF_ID = /\b(?:I am|I'm|It is I,?|My name is)\s+([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)/i;

function normSlug(s) {
  return String(s || "").toLowerCase().replace(/[\s-]+/g, "_").replace(/[^\w_]/g, "");
}

function buildLookup(characters = []) {
  const byId = new Map();
  const aliases = new Map();
  for (const c of characters) {
    if (!c.id) continue;
    byId.set(c.id, c);
    byId.set(normSlug(c.id), c);
    aliases.set(normSlug(c.id), c.id);
    aliases.set(normSlug(c.name), c.id);
    for (const a of c.aliases || []) aliases.set(normSlug(a), c.id);
  }
  return { byId, aliases };
}

function resolveName(text, lookup) {
  const m1 = VERB_NAME_AFTER.exec(text);
  if (m1) {
    const hit = lookup.aliases.get(normSlug(m1[1]));
    if (hit) return hit;
  }
  const m2 = NAME_VERB_BEFORE.exec(text);
  if (m2) {
    const hit = lookup.aliases.get(normSlug(m2[1]));
    if (hit) return hit;
  }
  return null;
}

function genderBucket(gender) {
  const g = String(gender || "").toLowerCase();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return "unknown";
}

function resolvePronoun(text, lookup, presentIds, lastSpeaker) {
  const m = PRONOUN_TAG.exec(String(text || "").trim());
  if (!m) return null;
  const want = m[1].toLowerCase() === "he" ? "male" : m[1].toLowerCase() === "she" ? "female" : null;
  const candidates = presentIds
    .filter((id) => id && id !== "narrator")
    .map((id) => lookup.byId.get(id) || lookup.byId.get(normSlug(id)))
    .filter(Boolean)
    .filter((c) => !want || genderBucket(c.gender) === want);

  if (candidates.length === 1) return candidates[0].id;
  if (candidates.length >= 2 && lastSpeaker) {
    const other = candidates.find((c) => c.id !== lastSpeaker && normSlug(c.id) !== normSlug(lastSpeaker));
    if (other) return other.id;
  }
  return candidates[0]?.id || null;
}

function resolveFromTag(text, lookup, presentIds, lastSpeaker) {
  return resolveName(text, lookup) || resolvePronoun(text, lookup, presentIds, lastSpeaker);
}

function alternateSpeaker(lastSpeaker, presentIds, lookup) {
  const ids = presentIds.filter((id) => id && id !== "narrator");
  if (ids.length < 2) return ids[0] || lastSpeaker;
  const other = ids.find((id) => id !== lastSpeaker && normSlug(id) !== normSlug(lastSpeaker));
  return other || ids.find((id) => normSlug(id) !== normSlug(lastSpeaker)) || ids[0];
}

function selfIdentifySpeaker(text, lookup) {
  const m = SELF_ID.exec(String(text || ""));
  if (!m) return null;
  return lookup.aliases.get(normSlug(m[1])) || null;
}

/** Fix speaker attribution within one scene. Mutates line objects in place. */
export function attributeSceneLines(scene, characters = []) {
  const lookup = buildLookup(characters);
  const present = scene.present_character_ids?.length
    ? scene.present_character_ids
    : characters.map((c) => c.id).filter(Boolean);

  let lastSpeaker = null;

  for (let i = 0; i < (scene.lines || []).length; i += 1) {
    const ln = scene.lines[i];
    if (!ln) continue;

    if (isPlainSpeechTagLine(ln)) {
      const speaker = resolveFromTag(ln.text, lookup, present, lastSpeaker);
      if (speaker && i > 0 && scene.lines[i - 1]?.kind === "dialogue") {
        scene.lines[i - 1].character_id = speaker;
        lastSpeaker = speaker;
      }
      continue;
    }

    if (ln.kind === "dialogue") {
      const self = selfIdentifySpeaker(ln.text, lookup);
      if (self) ln.character_id = self;

      if (i > 0 && scene.lines[i - 1]?.kind === "dialogue") {
        const alt = alternateSpeaker(lastSpeaker, present, lookup);
        if (alt) ln.character_id = alt;
      }

      lastSpeaker = ln.character_id;
    }
  }

  return scene;
}

export function attributeAnalysis(analysis) {
  const characters = analysis.characters || [];
  const scenes = (analysis.scenes || []).map((scene) => {
    const copy = {
      ...scene,
      lines: (scene.lines || []).map((ln) => ({ ...ln })),
    };
    return attributeSceneLines(copy, characters);
  });
  return { ...analysis, scenes };
}

export function postProcessAnalysis(analysis) {
  return attributeAnalysis(repairAnalysis(analysis));
}
