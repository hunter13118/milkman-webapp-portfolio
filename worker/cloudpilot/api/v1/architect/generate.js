// POST /api/v1/architect/generate  — the one real-backend route.
//
// Credential resolution:
//   • X-Gemini-Key header (BYOK)              → use that key, mode "byok"
//   • Bearer Clerk JWT + operator role + env  → use env.GEMINI_API_KEY, mode "operator"
//   • When CLERK_JWKS_URL is set              → valid Bearer JWT required for any live call
//   • otherwise                               → 401 (client falls back to demo)
//
// Required Cloudflare env (set in dashboard, never committed):
//   GEMINI_API_KEY  — server-side shared key for operators
//   CLERK_JWKS_URL  — e.g. https://<your-app>.clerk.accounts.dev/.well-known/jwks.json
//   CLERK_ISSUER    — (optional) pin the token issuer
import { isOperator, verifyClerkJwt } from "../../../_shared/clerk.js";
import { callGemini } from "../../../_shared/gemini.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const graph = body.graph || { nodes: [], edges: [] };

  let apiKey = null;
  let mode = null;
  const authRequired = Boolean(env.CLERK_JWKS_URL);

  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer (.+)$/);
  const claims = bearer ? await verifyClerkJwt(bearer[1], env) : null;

  if (authRequired && !claims) {
    return json(
      {
        error: "unauthorized",
        hint: "Clerk session required. Sign in, then use BYOK or operator access.",
      },
      401
    );
  }

  const userKey = request.headers.get("X-Gemini-Key");
  if (userKey) {
    apiKey = userKey;
    mode = "byok";
  } else if (claims && env.GEMINI_API_KEY && isOperator(claims)) {
    apiKey = env.GEMINI_API_KEY;
    mode = "operator";
  }

  if (!apiKey) {
    return json(
      {
        error: "no_credentials",
        hint: authRequired
          ? "Send X-Gemini-Key while signed in, or sign in as an operator."
          : "Send X-Gemini-Key, or sign in as an operator.",
      },
      401
    );
  }

  try {
    const result = await callGemini(apiKey, {
      graph,
      project: body.project || {},
      constraints: body.constraints || [],
    });
    result._mode = mode;
    return json(result);
  } catch (e) {
    // Let the client fall back to its local demo engine.
    return json({ error: "gemini_failed", detail: String(e).slice(0, 300) }, 502);
  }
}

// Friendly probe for non-POST hits.
export async function onRequestGet() {
  return json({ ok: true, route: "/api/v1/architect/generate", method: "POST" });
}
