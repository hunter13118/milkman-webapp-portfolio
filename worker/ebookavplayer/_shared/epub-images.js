/**
 * Extract embedded raster images from EPUB bytes — no default cap (set maxImages to limit).
 * Cover + opening-spine images are indexed first for illustration_ref slot 0…
 */
import { unzipSync } from "fflate";

const IMAGE_EXT = /\.(jpe?g|png|webp|svg|gif)$/i;
const HTML_EXT = /\.(xhtml|html|htm)$/i;
const COVER_PATH = /(?:^|\/)(cover|titlepage|title-page|front-cover|jacket)(?:[_-][^/]*)?\.(jpe?g|png|webp|gif)$/i;
const IMG_TAG = /<img\b[^>]*>/gi;
const IMG_SRC = /src=["']([^"']+)["']/i;

function normalizePath(href) {
  return String(href || "").replace(/\\/g, "/").split("#")[0].replace(/^\//, "");
}

function pickPath(files, rel) {
  const clean = normalizePath(rel);
  if (!clean) return null;
  if (files[clean]) return clean;
  const lower = clean.toLowerCase();
  let hit = Object.keys(files).find((k) => k.replace(/\\/g, "/").toLowerCase() === lower);
  if (hit) return hit.replace(/\\/g, "/");
  hit = Object.keys(files).find((k) => k.replace(/\\/g, "/").toLowerCase().endsWith(`/${lower}`));
  return hit ? hit.replace(/\\/g, "/") : null;
}

function resolveFromOpf(opfPath, href) {
  const clean = normalizePath(href);
  if (!clean || /^https?:/i.test(clean)) return null;
  const base = opfPath.replace(/\\/g, "/").split("/").slice(0, -1);
  const parts = [...base, ...clean.split("/")];
  const stack = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}

function parseOpf(files) {
  const opfPath = Object.keys(files).find((p) => p.replace(/\\/g, "/").toLowerCase().endsWith(".opf"));
  if (!opfPath) return { opfPath: null, spineHtml: [], coverHref: null };

  const opfNorm = opfPath.replace(/\\/g, "/");
  const opf = new TextDecoder("utf-8").decode(files[opfPath]);
  const manifest = new Map();
  let coverHref = null;

  for (const m of opf.match(/<item\b[^>]*\/?>/gi) || []) {
    const id = (m.match(/\bid=["']([^"']+)["']/i) || [])[1];
    const href = (m.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    const mt = (m.match(/media-type=["']([^"']+)["']/i) || [])[1] || "";
    const props = (m.match(/properties=["']([^"']+)["']/i) || [])[1] || "";
    if (!id || !href) continue;
    manifest.set(id, { href, mediaType: mt, properties: props });
    if (/cover-image/i.test(props) && !coverHref) {
      coverHref = resolveFromOpf(opfNorm, href);
    }
  }

  if (!coverHref) {
    for (const [, item] of manifest) {
      const href = resolveFromOpf(opfNorm, item.href);
      if (href && COVER_PATH.test(href)) {
        coverHref = href;
        break;
      }
    }
  }

  return {
    opfPath: opfNorm,
    spineHtml: buildSpineHtml(files, opfPath, opf, manifest),
    coverHref,
  };
}

function buildSpineHtml(files, opfPath, opf, manifest) {
  const spineIds = [];
  for (const ref of opf.match(/<itemref\b[^>]*\/?>/gi) || []) {
    const idref = (ref.match(/\bidref=["']([^"']+)["']/i) || [])[1];
    if (idref) spineIds.push(idref);
  }
  const paths = [];
  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item) continue;
    const mt = (item.mediaType || "").toLowerCase();
    if (mt && !mt.includes("html") && !mt.includes("xml")) continue;
    const resolved = pickPath(files, resolveFromOpf(opfPath.replace(/\\/g, "/"), item.href));
    if (resolved && HTML_EXT.test(resolved)) paths.push(resolved);
  }
  return paths;
}

function stripTagsSimple(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** ~text before/after the tag's position in the raw HTML, tags stripped. */
function textNear(raw, tagStart, tagEnd, radius = 400) {
  const before = raw.slice(Math.max(0, tagStart - radius), tagStart);
  const after = raw.slice(tagEnd, tagEnd + radius);
  return `${stripTagsSimple(before)} ${stripTagsSimple(after)}`.trim().slice(0, 240);
}

/** Returns [{ path, sourcePath, textContext }] — sourcePath is the spine file the image was found in. */
function imagesInHtml(files, htmlPath, opfPath) {
  const key = pickPath(files, htmlPath);
  if (!key || !files[key]) return [];
  const raw = new TextDecoder("utf-8").decode(files[key]);
  const out = [];
  for (const tag of raw.match(IMG_TAG) || []) {
    const src = (tag.match(IMG_SRC) || [])[1];
    if (!src) continue;
    const resolved = pickPath(files, resolveFromOpf(opfPath, src));
    if (!resolved || !IMAGE_EXT.test(resolved)) continue;
    const tagStart = raw.indexOf(tag);
    const textContext = tagStart >= 0 ? textNear(raw, tagStart, tagStart + tag.length) : "";
    out.push({ path: resolved, sourcePath: key, textContext });
  }
  return out;
}

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {{ maxImages?: number | null }} opts — omit or null = no cap
 * @returns {{ images: ArrayBuffer[], cover_index: number|null, opening_count: number, imageMeta: Array<{index:number, sourcePath:string|null, textContext:string}> }}
 */
export function extractEpubImages(bytes, { maxImages = null } = {}) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const files = unzipSync(u8);
  const normalized = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k.replace(/\\/g, "/"), v]),
  );

  const { opfPath, spineHtml, coverHref } = parseOpf(normalized);
  const allImagePaths = Object.keys(normalized)
    .filter((p) => IMAGE_EXT.test(p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const ordered = [];
  const seen = new Set();
  const metaByKey = new Map();
  const push = (p, meta) => {
    const key = pickPath(normalized, p);
    if (!key || seen.has(key) || !normalized[key]?.length) return;
    seen.add(key);
    ordered.push(key);
    if (meta) metaByKey.set(key, meta);
  };

  if (coverHref) push(coverHref);
  for (const p of allImagePaths) {
    if (COVER_PATH.test(p)) push(p);
  }

  const openingLimit = Math.min(3, spineHtml.length);
  for (let i = 0; i < openingLimit; i += 1) {
    if (!opfPath) break;
    for (const img of imagesInHtml(normalized, spineHtml[i], opfPath)) {
      push(img.path, { sourcePath: img.sourcePath, textContext: img.textContext });
    }
  }

  for (const htmlPath of spineHtml) {
    if (!opfPath) break;
    for (const img of imagesInHtml(normalized, htmlPath, opfPath)) {
      push(img.path, { sourcePath: img.sourcePath, textContext: img.textContext });
    }
  }

  for (const p of allImagePaths) push(p);

  let paths = ordered;
  if (maxImages != null && Number.isFinite(maxImages) && maxImages > 0) {
    paths = paths.slice(0, maxImages);
  }

  const images = paths.map((p) => {
    const data = normalized[p];
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  });

  const imageMeta = paths.map((p, index) => {
    const m = metaByKey.get(p);
    return { index, sourcePath: m?.sourcePath || null, textContext: m?.textContext || "" };
  });

  const coverIndex = coverHref && paths.includes(pickPath(normalized, coverHref))
    ? paths.indexOf(pickPath(normalized, coverHref))
    : (paths.find((p) => COVER_PATH.test(p)) != null
      ? paths.findIndex((p) => COVER_PATH.test(p))
      : null);

  return {
    images,
    cover_index: coverIndex != null && coverIndex >= 0 ? coverIndex : null,
    opening_count: openingLimit,
    imageMeta,
  };
}
