/**
 * Chapter assignment + setting-style scene titles (mirrors server/analyze/repair.py chapter helpers).
 */

const CHAPTER_TITLE_RE =
  /^(?:chapter|ch\.?|part|book|section|prologue|epilogue)\s*[\dIVXLCDM]+(?:\s*[:\-.—]\s*.+)?$/i;

const TIME_HINTS = [
  { re: /\b(at night|midnight|moonlit|starlit)\b/i, label: "at Night" },
  { re: /\b(at dawn|at sunrise|sunrise|daybreak)\b/i, label: "at Dawn" },
  { re: /\b(at dusk|at sunset|sunset|twilight|gloaming)\b/i, label: "at Sunset" },
  { re: /\b(in the morning|morning light)\b/i, label: "in the Morning" },
  { re: /\b(in the evening|evening)\b/i, label: "in the Evening" },
  { re: /\b(at noon|midday)\b/i, label: "at Noon" },
  { re: /\b(in the rain|rain(?:y|ing)?)\b/i, label: "in the Rain" },
];

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function titleCaseWords(s) {
  return String(s || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function renormalizeChapters(analysis) {
  const order = [];
  for (const scene of analysis.scenes || []) {
    const ch = scene.chapter ?? 1;
    if (!order.includes(ch)) order.push(ch);
  }
  if (!order.length || order.every((c, i) => c === i + 1)) return analysis;
  const mapping = Object.fromEntries(order.map((old, i) => [old, i + 1]));
  return {
    ...analysis,
    scenes: (analysis.scenes || []).map((s) => ({
      ...s,
      chapter: mapping[s.chapter ?? 1] ?? s.chapter,
    })),
  };
}

function sceneAnchorText(scene) {
  for (const line of scene.lines || []) {
    const t = normalizeText(line.text);
    if (t.length >= 24) return t.slice(0, 100);
  }
  for (const line of scene.lines || []) {
    const t = normalizeText(line.text);
    if (t.length >= 8) return t.slice(0, 100);
  }
  return "";
}

export function assignChaptersFromEpub(analysis, epubChapters) {
  if (!epubChapters?.length || epubChapters.length <= 1) return renormalizeChapters(analysis);

  const normalizedChapters = epubChapters.map((c, i) => ({
    chapter: c.index ?? i + 1,
    title: c.title || `Chapter ${c.index ?? i + 1}`,
    text: normalizeText(c.text),
  }));

  let lastChapter = normalizedChapters[0].chapter;
  let chapterCursor = 0;

  const scenes = (analysis.scenes || []).map((scene) => {
    const anchor = sceneAnchorText(scene);
    let assigned = lastChapter;

    if (anchor) {
      for (let ci = chapterCursor; ci < normalizedChapters.length; ci += 1) {
        const ch = normalizedChapters[ci];
        if (ch.text.includes(anchor.slice(0, Math.min(anchor.length, 48)))) {
          assigned = ch.chapter;
          chapterCursor = ci;
          break;
        }
      }
      if (assigned === lastChapter) {
        for (const ch of normalizedChapters) {
          if (ch.text.includes(anchor.slice(0, 32))) {
            assigned = ch.chapter;
            break;
          }
        }
      }
    }

    lastChapter = assigned;
    return { ...scene, chapter: assigned };
  });

  return renormalizeChapters({ ...analysis, scenes });
}

export function buildChapterMeta(epubChapters) {
  return (epubChapters || []).map((c, i) => ({
    chapter: c.index ?? i + 1,
    title: c.title || `Chapter ${c.index ?? i + 1}`,
  }));
}

function inferTimeSuffix(...parts) {
  const hay = parts.filter(Boolean).join(" ");
  for (const { re, label } of TIME_HINTS) {
    if (re.test(hay)) return label;
  }
  return "";
}

function looksLikeChapterTitle(title) {
  return CHAPTER_TITLE_RE.test(String(title || "").trim());
}

function hasTimePhrase(text) {
  return TIME_HINTS.some(({ re }) => re.test(String(text || "")));
}

/** Evocative setting label for stage + art picker (e.g. "Forest at Night"). */
export function formatSettingTitle(scene) {
  const title = String(scene?.title || "").trim();
  const location = String(scene?.location || "").trim();
  const desc = String(scene?.background_desc || "").trim();
  const time = inferTimeSuffix(title, location, desc);

  if (title && !looksLikeChapterTitle(title)) {
    if (time && !hasTimePhrase(title)) {
      return `${title}${time.startsWith(" at") || time.startsWith(" in") ? time : ` ${time}`}`;
    }
    return title;
  }

  const place = location || desc.split(/[.,]/)[0]?.trim() || "";
  if (!place) return title || "Scene";
  const base = titleCaseWords(place.replace(/^(a|an|the)\s+/i, ""));
  return time ? `${base} ${time}` : base;
}

export function normalizeSceneTitles(analysis, { chapterMeta } = {}) {
  const chapterTitles = new Set((chapterMeta || analysis.chapters || []).map((c) => c.title?.trim()).filter(Boolean));
  const scenes = (analysis.scenes || []).map((scene) => {
    let title = formatSettingTitle(scene);
    if (chapterTitles.has(title) || looksLikeChapterTitle(title)) {
      title = formatSettingTitle({ ...scene, title: "" });
    }
    return { ...scene, title };
  });
  return { ...analysis, scenes };
}

export function finalizeAnalysisChapters(analysis, { epubChapters } = {}) {
  let out = analysis;
  if (epubChapters?.length > 1) {
    out = assignChaptersFromEpub(out, epubChapters);
    out = { ...out, chapters: buildChapterMeta(epubChapters) };
  } else {
    out = renormalizeChapters(out);
    const seen = new Set();
    const chapters = [];
    for (const scene of out.scenes || []) {
      const ch = scene.chapter ?? 1;
      if (!seen.has(ch)) {
        seen.add(ch);
        chapters.push({ chapter: ch, title: `Chapter ${ch}` });
      }
    }
    if (chapters.length) out = { ...out, chapters };
  }
  return normalizeSceneTitles(out, { chapterMeta: out.chapters });
}
