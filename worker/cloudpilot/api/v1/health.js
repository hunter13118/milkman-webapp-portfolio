// GET /api/v1/health — lightweight probe for the edge stack + auth wiring.
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestGet({ env }) {
  return json({
    ok: true,
    route: "/api/v1/health",
    auth: {
      clerk_jwks_configured: Boolean(env.CLERK_JWKS_URL),
      gemini_operator_key_configured: Boolean(env.GEMINI_API_KEY),
    },
    generate: "/api/v1/architect/generate",
  });
}
