/**
 * Minimal EPUB → plain text for Gemini mega-pass (edge ingest).
 * Full fidelity parse stays in Python; this is enough for extraction MVP.
 */
import { unzipSync } from "fflate";

const SKIP_PATH = /(?:nav|toc|cover|title|copyright|dedication|acknowledgment|about the author)/i;

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractEpubText(bytes, { maxChars = 120000 } = {}) {
  const files = unzipSync(new Uint8Array(bytes));
  const paths = Object.keys(files).filter((p) => /\.(xhtml|html|htm)$/i.test(p));
  paths.sort();
  const chunks = [];
  let title = "Untitled";
  let author = "";

  for (const p of paths) {
    if (SKIP_PATH.test(p)) continue;
    const html = new TextDecoder("utf-8").decode(files[p]);
    const text = stripHtml(html);
    if (!text || text.length < 40) continue;
    if (!title || title === "Untitled") {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) title = t[1].trim();
    }
    chunks.push(text);
    if (chunks.join("\n\n").length >= maxChars) break;
  }

  let body = chunks.join("\n\n").slice(0, maxChars);
  if (!body) throw new Error("epub: no readable text found");

  const byMatch = body.match(/by\s+([A-Z][^\n,]{2,60})/i);
  if (byMatch) author = byMatch[1].trim();

  return { title, author, body_text: body };
}
