/**
 * EPUB → plain text for edge ingest (spine order via OPF, chapter-aware).
 */
import { unzipSync } from "fflate";

const SKIP_BASENAME =
  /^(?:nav|toc|cover|titlepage|copyright|dedication|acknowledgments?|about-the-author|colophon)(?:\.\w+)?$/i;

const FRONT_MATTER_TITLES = new Set([
  "contents", "title", "nav", "cover", "copyright", "dedication",
  "acknowledgments", "acknowledgements", "about the author", "table of contents",
]);

const CHAPTER_TITLE_RE =
  /^(?:chapter|ch\.?|part|book|section|prologue|epilogue|interlude|preface)\s*[\dIVXLCDM]+(?:\s*[:\-.—]\s*.+)?$/i;

const CHAPTER_NUM_RE =
  /^(?:chapter|ch\.?|part|book|section)\s*([\dIVXLCDM]+)/i;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t　]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeXml(s) {
  return String(s || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? decodeXml(m[1].trim()) : "";
}

function attr(tag, name) {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  return m ? m[1] : "";
}

/** Case-insensitive zip path lookup. */
function pickPath(files, rel) {
  const clean = String(rel || "").replace(/\\/g, "/").replace(/^\//, "");
  if (!clean) return null;
  if (files[clean]) return clean;
  const lower = clean.toLowerCase();
  let hit = Object.keys(files).find((k) => k.toLowerCase() === lower);
  if (hit) return hit;
  hit = Object.keys(files).find((k) => k.toLowerCase().endsWith(`/${lower}`));
  return hit || null;
}

function findFile(files, suffix) {
  const lower = suffix.toLowerCase();
  return Object.keys(files).find((p) => p.replace(/\\/g, "/").toLowerCase().endsWith(lower));
}

/** Resolve manifest href relative to the OPF file location. */
function resolveFromOpf(opfPath, href) {
  const clean = href.split("#")[0].replace(/\\/g, "/");
  if (!clean) return null;
  if (/^https?:/i.test(clean)) return null;
  const base = opfPath.replace(/\\/g, "/").split("/").slice(0, -1);
  const parts = [...base, ...clean.split("/")];
  const stack = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}

function titleFromHtml(raw, fallback) {
  // Heading tags and chapter-class elements are far more reliable per-chapter
  // signals than <title> — many EPUB generators set <title> to the BOOK name
  // identically on every spine file, which would otherwise make every
  // chapter's "title" the book title. Only fall back to <title> if the page
  // has no heading at all.
  for (const level of [1, 2, 3]) {
    const h = raw.match(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, "i"));
    if (h) {
      const t = stripHtml(h[1]).trim();
      if (t) return t.slice(0, 120);
    }
  }
  const chapterClass = raw.match(/<[^>]+class=["'][^"']*chapter[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (chapterClass) {
    const t = stripHtml(chapterClass[1]).trim();
    if (t) return t.slice(0, 120);
  }
  const titleTag = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    const t = stripHtml(titleTag[1]).trim();
    if (t) return t.slice(0, 120);
  }
  return fallback;
}

function chapterNumberFromTitle(title) {
  const m = CHAPTER_NUM_RE.exec((title || "").trim());
  if (!m) return null;
  const token = m[1];
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  return null;
}

function isFrontMatter(title, text) {
  const t = (title || "").trim().toLowerCase();
  if (FRONT_MATTER_TITLES.has(t)) return true;
  if (CHAPTER_TITLE_RE.test((title || "").trim())) return false;
  if (/chapter|prologue|epilogue/i.test(title || "")) return false;
  if ((text || "").trim().length < 80) return true;
  return false;
}

function looksLikeChapter(title, text, basename) {
  if (CHAPTER_TITLE_RE.test((title || "").trim())) return true;
  if (/chapter|ch\d|part\d|afterword|prologue|epilogue|interlude/i.test(basename || "")) return true;
  if (/chapter|prologue|epilogue/i.test(title || "")) return true;
  return (text || "").length >= 120;
}

function parseOpfSpine(files, opfPath) {
  const opfBytes = files[opfPath];
  if (!opfBytes) throw new Error("epub: OPF missing");
  const opf = new TextDecoder("utf-8").decode(opfBytes);

  let title = firstTag(opf, "dc:title") || firstTag(opf, "title") || "Untitled";
  let author = firstTag(opf, "dc:creator") || firstTag(opf, "creator") || "";

  const manifest = new Map();
  for (const m of opf.match(/<item\b[^>]*\/?>/gi) || []) {
    const id = attr(m, "id");
    const href = attr(m, "href");
    const mt = attr(m, "media-type") || "";
    if (id && href) manifest.set(id, { href, mediaType: mt });
  }

  const spineIds = [];
  for (const ref of opf.match(/<itemref\b[^>]*\/?>/gi) || []) {
    const idref = attr(ref, "idref");
    if (idref) spineIds.push(idref);
  }

  const orderedPaths = [];
  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item) continue;
    const mt = item.mediaType.toLowerCase();
    if (mt && !mt.includes("html") && !mt.includes("xml")) continue;
    const resolved = pickPath(files, resolveFromOpf(opfPath, item.href));
    if (!resolved) continue;
    const base = resolved.split("/").pop() || resolved;
    if (SKIP_BASENAME.test(base)) continue;
    if (!/\.(xhtml|html|htm)$/i.test(resolved) && !mt.includes("html")) continue;
    orderedPaths.push(resolved);
  }

  return { title, author, orderedPaths };
}

function fallbackPaths(files) {
  return Object.keys(files)
    .filter((p) => /\.(xhtml|html|htm)$/i.test(p))
    .filter((p) => !SKIP_BASENAME.test(p.split("/").pop() || p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function splitTextOnChapterHeadings(text, fallbackTitle) {
  const re = /(?:^|\n\n)\s*((?:chapter|ch\.?|part|book|section|prologue|epilogue)\s+(?:\d+|[IVXLCDM]+)(?:\s*[:\-.—]\s*[^\n]{0,80})?)\s*\n/gi;
  const matches = [...text.matchAll(re)];
  if (matches.length < 2) return null;

  const parts = [];
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const title = m[1].trim();
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(start, end).trim();
    if (body.length < 40) continue;
    const parsedNum = chapterNumberFromTitle(title);
    parts.push({
      index: parsedNum ?? parts.length + 1,
      title,
      text: body,
      spine_path: null,
    });
  }
  return parts.length >= 2 ? parts : null;
}

function buildChaptersFromSpine(files, orderedPaths) {
  const chapters = [];
  let idx = 0;

  for (const rel of orderedPaths) {
    const data = files[rel];
    if (!data) continue;
    const html = new TextDecoder("utf-8").decode(data);
    const text = stripHtml(html);
    const basename = rel.split("/").pop() || rel;
    const title = titleFromHtml(html, `Section ${idx + 1}`);

    if (!text || text.length < 40) continue;
    if (isFrontMatter(title, text)) continue;

    const internal = splitTextOnChapterHeadings(text, title);
    if (internal?.length) {
      for (const part of internal) {
        idx += 1;
        chapters.push({ ...part, index: part.index ?? idx, spine_path: rel });
      }
      continue;
    }

    if (!looksLikeChapter(title, text, basename) && chapters.length > 0 && text.length < 200) {
      continue;
    }

    idx += 1;
    const parsedNum = chapterNumberFromTitle(title);
    chapters.push({
      index: parsedNum ?? idx,
      title,
      text,
      spine_path: rel,
    });
  }

  return chapters;
}

function formatBodyText(chapters) {
  return chapters
    .map((c) => `## Chapter ${c.index}: ${c.title}\n${c.text}`)
    .join("\n\n");
}

export function extractEpubText(bytes, { maxChars } = {}) {
  const cap = maxChars ?? 800_000;
  const files = unzipSync(new Uint8Array(bytes));
  const normalized = Object.create(null);
  for (const [p, data] of Object.entries(files)) {
    normalized[p.replace(/\\/g, "/")] = data;
  }

  const containerPath = findFile(normalized, "container.xml");
  if (!containerPath) throw new Error("epub: META-INF/container.xml missing");

  const containerXml = new TextDecoder("utf-8").decode(normalized[containerPath]);
  const rootfile = containerXml.match(/<rootfile\b[^>]*\/?>/i);
  const rootHref = rootfile ? attr(rootfile[0], "full-path") : "";
  const opfPath = pickPath(normalized, rootHref);
  if (!opfPath) throw new Error(`epub: content OPF not found (${rootHref || "missing full-path"})`);

  let { title, author, orderedPaths } = parseOpfSpine(normalized, opfPath);
  if (!orderedPaths.length) orderedPaths = fallbackPaths(normalized);

  let chapters = buildChaptersFromSpine(normalized, orderedPaths);
  if (!chapters.length) {
    const chunks = [];
    for (const rel of orderedPaths) {
      const data = normalized[rel];
      if (!data) continue;
      const text = stripHtml(new TextDecoder("utf-8").decode(data));
      if (text && text.length >= 20) chunks.push(text);
    }
    chapters = [{ index: 1, title: "Full text", text: chunks.join("\n\n") }];
  }

  let body = formatBodyText(chapters).slice(0, cap);
  if (!body) throw new Error("epub: no readable text found");

  if (!author) {
    const byMatch = body.match(/\bby\s+([A-Z][^\n,]{2,60})/i);
    if (byMatch) author = byMatch[1].trim();
  }

  return {
    title,
    author,
    body_text: body,
    chapters,
    spine_parts: orderedPaths.length,
    chapter_count: chapters.length,
    chars: body.length,
    opf_path: opfPath,
  };
}

/**
 * Split each chapter into one or more chunks, but never mix text from two
 * different chapters into the same chunk — every chunk carries its source
 * chapter's index so extraction can be checkpointed per chapter. Operates on
 * the structured `chapters` array from extractEpubText (not the flattened
 * body_text string), so chapter identity is known up front rather than
 * reconstructed after the fact.
 */
export function chunkChaptersStrict(chapters, maxChars) {
  const out = [];
  (chapters || []).forEach((chapter, chapterPos) => {
    const text = (chapter.text || "").trim();
    if (!text) return;
    const header = `## Chapter ${chapter.index}: ${chapter.title}\n`;
    const budget = Math.max(1, maxChars - header.length);

    const pieces = [];
    if (text.length <= budget) {
      pieces.push(text);
    } else {
      const sentRe = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
      let current = "";
      for (const sent of text.match(sentRe) || [text]) {
        if ((current + sent).length <= budget) {
          current += sent;
        } else {
          if (current.trim()) pieces.push(current.trim());
          if (sent.length > budget) {
            for (let i = 0; i < sent.length; i += budget) pieces.push(sent.slice(i, i + budget).trim());
            current = "";
          } else {
            current = sent;
          }
        }
      }
      if (current.trim()) pieces.push(current.trim());
    }

    pieces.forEach((piece, subIndex) => {
      out.push({
        chapterPos,
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
        subIndex,
        subTotal: pieces.length,
        text: `${header}${piece}`,
      });
    });
  });
  return out;
}

/** Split extract chunks on ## Chapter markers when present. */
export function chunkTextByChapters(bodyText, maxChars) {
  if (!bodyText?.includes("## Chapter ")) return null;
  const parts = bodyText.split(/(?=## Chapter \d+)/);
  const chunks = [];
  let current = "";

  for (const part of parts) {
    const piece = part.trim();
    if (!piece) continue;
    const candidate = current ? `${current}\n\n${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) chunks.push(current.trim());
      if (piece.length <= maxChars) {
        current = piece;
      } else {
        chunks.push(piece.slice(0, maxChars).trim());
        current = piece.slice(maxChars).trim();
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : null;
}
