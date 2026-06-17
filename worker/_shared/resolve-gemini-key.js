import { authRequired, isTrustedGeminiUser, verifyClerkJwt } from "./clerk.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

/** Resolve Gemini credentials from Bearer JWT + optional X-Gemini-Key. */
export async function resolveGeminiKey(request, env) {
  const required = authRequired(env);
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer (.+)$/);
  const claims = bearer ? await verifyClerkJwt(bearer[1], env) : null;

  if (required && !claims) {
    return {
      error: json(
        {
          error: "unauthorized",
          hint: "Sign in, then use BYOK (Connect Gemini) or trusted-user server access.",
        },
        401,
      ),
    };
  }

  const userKey = request.headers.get("X-Gemini-Key");
  if (userKey) {
    return { apiKey: userKey, mode: "byok", claims };
  }
  if (claims && env.GEMINI_API_KEY && isTrustedGeminiUser(claims)) {
    return { apiKey: env.GEMINI_API_KEY, mode: "operator", claims };
  }

  return {
    error: json(
      {
        error: "no_credentials",
        hint: required
          ? "Paste a Gemini key (Connect Gemini) or ask for trusted-user access."
          : "Send X-Gemini-Key or sign in as a trusted user.",
      },
      401,
    ),
  };
}
