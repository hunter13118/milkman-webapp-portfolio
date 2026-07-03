/** User-supplied reference image URLs (Fandom, wiki, etc.) — stored in KV, fetched at gen time only. */

const KV_PREFIX = "external_refs:";
const MAX_URL_LEN = 2048;
const MAX_URLS_PER_CHARACTER = 6;
const MAX_BOOK_URLS = 6;

export function externalRefsKvKey(bookId) {
  return `${KV_PREFIX}${bookId}`;
}

export function emptyExternalRefs() {
  return { characters: {}, book: [] };
}

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local")) return true;
  if (h === "127.0.0.1" || h === "::1" || h === "0.0.0.0") return true;
  if (h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

/** @returns {string|null} normalized URL or null if invalid */
export function normalizeExternalRefUrl(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > MAX_URL_LEN) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (isBlockedHost(u.hostname)) return null;
  return u.toString();
}

export function sanitizeExternalRefs(body) {
  const out = emptyExternalRefs();
  const chars = body?.characters;
  if (chars && typeof chars === "object") {
    for (const [id, urls] of Object.entries(chars)) {
      if (!id || id === "narrator") continue;
      const list = Array.isArray(urls) ? urls : [urls];
      const clean = [...new Set(list.map(normalizeExternalRefUrl).filter(Boolean))]
        .slice(0, MAX_URLS_PER_CHARACTER);
      if (clean.length) out.characters[id] = clean;
    }
  }
  const bookUrls = body?.book;
  if (Array.isArray(bookUrls)) {
    out.book = [...new Set(bookUrls.map(normalizeExternalRefUrl).filter(Boolean))]
      .slice(0, MAX_BOOK_URLS);
  }
  return out;
}

export async function loadExternalRefs(env, bookId) {
  if (!env?.VAE_JOBS || !bookId) return emptyExternalRefs();
  const raw = await env.VAE_JOBS.get(externalRefsKvKey(bookId));
  if (!raw) return emptyExternalRefs();
  try {
    return sanitizeExternalRefs(JSON.parse(raw));
  } catch {
    return emptyExternalRefs();
  }
}

export async function saveExternalRefs(env, bookId, body) {
  const clean = sanitizeExternalRefs(body);
  await env.VAE_JOBS.put(externalRefsKvKey(bookId), JSON.stringify(clean), {
    expirationTtl: 86400 * 365,
  });
  return clean;
}

export function externalRefUrlsForCharacter(refs, characterId) {
  if (!refs || !characterId) return [];
  const charUrls = refs.characters?.[characterId] || [];
  const bookUrls = refs.book || [];
  return [...new Set([...charUrls, ...bookUrls].filter(Boolean))];
}

/** Fetch remote images in-memory for gen / i2i (never persisted to R2). */
export async function fetchExternalRefBytes(urls, { limit = 3, timeoutMs = 12_000 } = {}) {
  const bytes = [];
  const seen = new Set();
  for (const raw of urls || []) {
    if (bytes.length >= limit) break;
    const url = normalizeExternalRefUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "image/*" },
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      if (!ct.startsWith("image/")) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 0 && buf.byteLength < 12_000_000) bytes.push(buf);
    } catch { /* skip unreachable refs */ }
  }
  return bytes;
}
