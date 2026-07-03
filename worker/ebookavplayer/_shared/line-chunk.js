/**
 * Split oversized script lines — prefer punctuation near the char limit.
 * Keep in sync with web/src/audio/ttsChunks.js
 */

export const PLAYBACK_LINE_MAX_CHARS = 160;
export const PLAYBACK_LINE_MIN_TAIL = 40;

const SENT_PUNCT = new Set([".", "!", "?", "…", "‽"]);
const CLAUSE_PUNCT = new Set([";", ":", "—", "–", "\u2014", "\u2013"]);
const PHRASE_PUNCT = new Set([","]);

function isPunctuation(ch) {
  return SENT_PUNCT.has(ch) || CLAUSE_PUNCT.has(ch) || PHRASE_PUNCT.has(ch);
}

/** Include closing quotes / paren / whitespace after punctuation. */
function extendPastClosing(window, endExclusive) {
  let j = endExclusive;
  while (j < window.length && /["'\u201c\u201d\u2018\u2019)\]\s]/.test(window[j])) j += 1;
  return j;
}

/**
 * Best split within `window` (length <= maxChars): latest punctuation before limit,
 * preferring sentence > clause > comma. Returns -1 if no punctuation in window.
 */
export function findPunctuationSplit(window) {
  if (!window) return -1;

  const tryTier = (isMatch) => {
    for (let i = window.length; i >= 1; i -= 1) {
      const ch = window[i - 1];
      if (!isMatch(ch)) continue;
      return extendPastClosing(window, i);
    }
    return -1;
  };

  let at = tryTier((ch) => SENT_PUNCT.has(ch));
  if (at > 0) return at;
  at = tryTier((ch) => CLAUSE_PUNCT.has(ch));
  if (at > 0) return at;
  at = tryTier((ch) => PHRASE_PUNCT.has(ch));
  if (at > 0) return at;

  if (![...window].some(isPunctuation)) return -1;

  for (let i = window.length; i >= 1; i -= 1) {
    if (isPunctuation(window[i - 1])) return extendPastClosing(window, i);
  }
  return -1;
}

/** Word-boundary fallback when the window has no punctuation at all. */
export function findWordSplit(window, maxChars) {
  const lastSpace = window.lastIndexOf(" ");
  if (lastSpace > 0) return lastSpace;
  return Math.min(maxChars, window.length);
}

export function splitTextChunks(text, maxChars = PLAYBACK_LINE_MAX_CHARS) {
  const t = String(text || "").trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];

  const chunks = [];
  let start = 0;

  while (start < t.length) {
    const remaining = t.length - start;
    if (remaining <= maxChars) {
      const tail = t.slice(start).trim();
      if (tail) chunks.push(tail);
      break;
    }

    const window = t.slice(start, start + maxChars);
    let splitLen = findPunctuationSplit(window);
    if (splitLen <= 0) splitLen = findWordSplit(window, maxChars);

    const piece = t.slice(start, start + splitLen).trim();
    if (!piece) {
      start += Math.max(1, splitLen);
      continue;
    }
    chunks.push(piece);
    start += splitLen;
    while (start < t.length && /\s/.test(t[start])) start += 1;
  }

  return mergeTinyTail(chunks, PLAYBACK_LINE_MIN_TAIL);
}

function mergeTinyTail(chunks, minTail) {
  if (chunks.length < 2) return chunks;
  const last = chunks[chunks.length - 1];
  if (last.length >= minTail) return chunks;
  const out = chunks.slice(0, -1);
  out[out.length - 1] = `${out[out.length - 1]} ${last}`;
  return out;
}

/** Split long lines in compiled playback; re-number idx globally. */
export function normalizePlaybackLines(playback, maxChars = PLAYBACK_LINE_MAX_CHARS) {
  if (!playback?.scenes?.length) return { playback, changed: false };

  let idx = 0;
  let changed = false;
  const scenes = playback.scenes.map((scene) => {
    const newLines = [];
    for (const line of scene.lines || []) {
      const text = String(line.text || "").trim();
      if (!text) continue;
      const parts = text.length > maxChars ? splitTextChunks(text, maxChars) : [text];
      if (parts.length > 1) changed = true;
      for (let pi = 0; pi < parts.length; pi += 1) {
        const part = parts[pi];
        const next = { ...line, text: part, idx: idx++ };
        if (pi > 0) {
          delete next.illustration_url;
          delete next.illustration_caption;
          delete next.visual_moment;
        }
        newLines.push(next);
      }
    }
    return { ...scene, lines: newLines };
  });

  if (!changed) return { playback, changed: false };
  return { playback: { ...playback, scenes }, changed: true };
}

export function expandAnalysisLineText(text, maxChars = PLAYBACK_LINE_MAX_CHARS) {
  const t = String(text || "").trim();
  if (!t) return [];
  if (t.length <= maxChars) return [t];
  return splitTextChunks(t, maxChars);
}
