/**
 * EPUB → plain text for edge ingest (spine order via OPF, not alphabetical paths).
 */
import { unzipSync } from "fflate";

const SKIP_BASENAME =
  /^(?:nav|toc|cover|titlepage|copyright|dedication|acknowledgments?|about-the-author|colophon)(?:\.\w+)?$/i;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
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

function allTags(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(decodeXml(m[1].trim()));
  return out;
}

function attr(tag, name) {
  const m = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  return m ? m[1] : "";
}

function findFile(files, suffix) {
  const lower = suffix.toLowerCase();
  return Object.keys(files).find((p) => p.replace(/\\/g, "/").toLowerCase().endsWith(lower));
}

function resolveHref(opfPath, href) {
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
    const resolved = resolveHref(opfPath, item.href);
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
  const opfPath = rootfile ? resolveHref("META-INF/fake.xml", attr(rootfile[0], "full-path")) : null;
  if (!opfPath || !normalized[opfPath]) throw new Error("epub: content OPF not found");

  let { title, author, orderedPaths } = parseOpfSpine(normalized, opfPath);
  if (!orderedPaths.length) orderedPaths = fallbackPaths(normalized);

  const chunks = [];
  for (const p of orderedPaths) {
    const data = normalized[p];
    if (!data) continue;
    const html = new TextDecoder("utf-8").decode(data);
    const text = stripHtml(html);
    if (!text || text.length < 20) continue;
    chunks.push(text);
    if (chunks.join("\n\n").length >= cap) break;
  }

  let body = chunks.join("\n\n").slice(0, cap);
  if (!body) throw new Error("epub: no readable text found");

  if (!author) {
    const byMatch = body.match(/\bby\s+([A-Z][^\n,]{2,60})/i);
    if (byMatch) author = byMatch[1].trim();
  }

  return { title, author, body_text: body, spine_parts: chunks.length, chars: body.length };
}
