/** Post-extract repair: structural fixes only — never rewrite line text (mirrors server/analyze/repair.py). */

export const PLAIN_VERBS = new Set([
  "said", "asked", "replied", "answered", "continued", "added", "exclaimed",
  "observed", "noted", "remarked", "demanded", "insisted", "declared",
  "announced", "explained", "offered", "suggested", "warned", "promised",
  "agreed", "protested", "mused", "wondered", "admitted", "confessed",
  "informed", "told", "reported", "finished", "concluded", "began",
  "started", "pressed", "urged", "pleaded", "begged", "commanded", "ordered",
  "interrupted", "went", "on",
]);

const STYLIZED_VERBS = new Set([
  "sang", "sung", "yelled", "shouted", "screamed", "whispered", "murmured",
  "muttered", "cried", "sobbed", "laughed", "chuckled", "snapped", "growled",
  "hissed", "stammered", "stuttered", "croaked", "mumbled", "breathed",
  "sighed", "gasped", "panted", "barked", "roared", "sneered", "taunted",
  "teased", "joked", "quipped", "grinned", "smiled", "frowned", "scowled",
  "wept", "nodded", "shrugged",
]);

const PRONOUN_TAG = /^(?<pronoun>he|she|they)\s+(?<verb>\w+)(?<rest>.*)$/i;
const LONE_VERB = /^(?<verb>said|asked|replied|answered|continued|added)(?<rest>.*)$/i;
const ADVERB_TAIL = /^(quietly|softly|slowly|firmly|coldly|flatly|evenly|simply|carefully|gently|sharply)(?<punct>[.,!?]?)$/i;
const EMBEDDED_TAG_SPLIT = /^(?<tag>(?:he|she|they)\s+(?:said|asked|replied|whispered|muttered|continued|added))(?<punct>[,.])?\s+(?<rest>.+)$/i;
const STANDALONE_TAG = /^(?:he|she|they)\s+(?:said|asked|replied|whispered|muttered|continued|added)(?:\s+(?:quietly|softly|slowly|firmly|evenly|simply|carefully|gently|sharply))?[.,!?]?$/i;
const TAGISH = /^(?:(?:he|she|they)\s+)?(?:said|asked|replied|answered|continued|added|whispered|murmured|muttered|exclaimed|observed|noted|remarked|demanded|insisted|declared|announced|explained|offered|suggested|warned|promised|agreed|protested|mused|wondered|admitted|confessed|informed|told|reported|finished|concluded|began|started|pressed|urged|pleaded|begged|commanded|ordered|interrupted)(?:\s+\w+)*[.,!?]?$/i;

function firstVerbToken(text) {
  const t = String(text || "").trim();
  let m = PRONOUN_TAG.exec(t);
  if (m) return m.groups.verb.toLowerCase();
  m = LONE_VERB.exec(t);
  if (m) return m.groups.verb.toLowerCase();
  const parts = t.split(/\s+/);
  return parts[0]?.toLowerCase().replace(/[.,!?]+$/, "") || "";
}

export function isPlainSpeechTagLine(line) {
  if (!line || !["narration", "delivery"].includes(line.kind)) return false;
  const verb = (line.delivery_verb || firstVerbToken(line.text)).toLowerCase();
  if (PLAIN_VERBS.has(verb)) return true;
  const text = String(line.text || "").trim();
  if (!text) return false;
  if (line.kind === "delivery" && !STYLIZED_VERBS.has(verb)) return true;
  return TAGISH.test(text) && !STYLIZED_VERBS.has(verb);
}

function normalizeDeliveryLine(line) {
  const verb = (line.delivery_verb || firstVerbToken(line.text)).toLowerCase();
  if (line.kind !== "delivery") return line;
  if (STYLIZED_VERBS.has(verb)) return line;
  return { ...line, kind: "narration", line_weight: "normal", delivery_verb: null };
}

function mergeTagFragments(lines) {
  if (lines.length < 2) return lines;
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];
    if (
      i + 1 < lines.length
      && ["narration", "delivery"].includes(cur.kind)
      && ["narration", "delivery"].includes(lines[i + 1].kind)
      && isPlainSpeechTagLine(cur)
      && ADVERB_TAIL.test(String(lines[i + 1].text || "").trim())
    ) {
      out.push({
        ...cur,
        text: `${String(cur.text).trimEnd()} ${String(lines[i + 1].text).trimStart()}`.trim(),
        kind: "narration",
        line_weight: "normal",
        delivery_verb: null,
      });
      i += 2;
      continue;
    }
    out.push(cur);
    i += 1;
  }
  return out;
}

function normalizeTagMetadata(line) {
  if (!isPlainSpeechTagLine(line)) return line;
  return {
    ...line,
    kind: "narration",
    character_id: "narrator",
    line_weight: "normal",
    delivery_verb: null,
  };
}

function splitMergedTagNarration(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    const text = String(ln.text || "").trim();
    const prev = out.length ? out[out.length - 1] : (i > 0 ? lines[i - 1] : null);
    const m = EMBEDDED_TAG_SPLIT.exec(text);
    if (
      m
      && ln.kind === "narration"
      && prev
      && prev.kind === "dialogue"
      && !STANDALONE_TAG.test(text)
      && m.groups.rest.split(/\s+/).length > 2
    ) {
      const punct = m.groups.punct || ",";
      out.push({ ...ln, text: `${m.groups.tag}${punct}` });
      out.push({ ...ln, text: m.groups.rest.trim() });
      continue;
    }
    out.push(ln);
  }
  return out;
}

function fixThirdPersonThought(line) {
  if (!line || !["thought", "dialogue"].includes(line.kind)) return line;
  const text = String(line.text || "").trim();
  if (!text || line.character_id === "narrator") return line;
  const cid = String(line.character_id || "").toLowerCase();
  const nameHint = cid.replace(/_/g, " ");
  const third = new RegExp(
    `^(?:${nameHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s+(?:thought|wondered|remembered|realized|recalled|considered|felt)\\b`,
    "i",
  );
  if (third.test(text) || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:thought|wondered|remembered|realized|recalled)\b/.test(text)) {
    return { ...line, kind: "narration", character_id: "narrator" };
  }
  if (line.kind === "thought" && text.split(/\s+/).length > 18 && !/^["'I]/.test(text)) {
    return { ...line, kind: "narration", character_id: "narrator" };
  }
  return line;
}

export function repairSceneLines(lines) {
  let fixed = lines.map(normalizeDeliveryLine);
  fixed = fixed.map(fixThirdPersonThought);
  fixed = mergeTagFragments(fixed);
  fixed = splitMergedTagNarration(fixed);
  return fixed.map(normalizeTagMetadata);
}

export function repairAnalysis(analysis) {
  const scenes = (analysis.scenes || []).map((scene) => ({
    ...scene,
    lines: repairSceneLines(scene.lines || []),
  }));
  return { ...analysis, scenes };
}
