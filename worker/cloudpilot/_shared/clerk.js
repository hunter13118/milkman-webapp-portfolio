// Clerk session-JWT verification at the edge using WebCrypto (no npm deps).
// Verifies the RS256 signature against Clerk's JWKS and returns the claims,
// or null on any failure. The operator role is read from the token — configure
// a Clerk JWT template named "cloudpilot" that injects:
//   { "role": "{{user.public_metadata.role}}" }
// so claims.role === "operator" for trusted users.

let jwksCache = { url: null, keys: null, at: 0 };
const JWKS_TTL_MS = 10 * 60 * 1000;

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getJwks(url) {
  const now = Date.now();
  if (jwksCache.url === url && jwksCache.keys && now - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(url, { cf: { cacheTtl: 600 } });
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { url, keys, at: now };
  return keys;
}

/** @returns {Promise<object|null>} verified claims or null */
export async function verifyClerkJwt(token, env) {
  try {
    const jwksUrl = env.CLERK_JWKS_URL;
    if (!jwksUrl || !token) return null;
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;

    const header = b64urlToJson(h);
    const claims = b64urlToJson(p);

    // expiry / not-before
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && now >= claims.exp) return null;
    if (claims.nbf && now < claims.nbf - 5) return null;

    const jwks = await getJwks(jwksUrl);
    const jwk = jwks.find((k) => k.kid === header.kid) || jwks[0];
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), data);
    if (!ok) return null;

    // optional issuer pin
    if (env.CLERK_ISSUER && claims.iss && claims.iss !== env.CLERK_ISSUER) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Normalize the operator role out of whatever claim shape the template used. */
export function isOperator(claims) {
  if (!claims) return false;
  return claims.role === "operator" || claims?.public_metadata?.role === "operator" || claims?.metadata?.role === "operator";
}

/** True when Clerk auth is wired on the edge (session JWT required for live calls). */
export function authRequired(env) {
  return Boolean(env?.CLERK_JWKS_URL);
}
