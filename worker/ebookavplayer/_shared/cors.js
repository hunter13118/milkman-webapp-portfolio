/** CORS for local wrangler dev — deployed CF SPA → localhost edge bridge. */

const DEFAULT_ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https:\/\/hunterthemilkman\.com$/,
  /^https:\/\/www\.hunterthemilkman\.com$/,
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.workers\.dev$/,
];

function extraPatterns(env) {
  const raw = env?.VAE_CORS_ORIGINS || "";
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => {
      try {
        return new RegExp(`^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function originAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const patterns = [...DEFAULT_ORIGIN_PATTERNS, ...extraPatterns(env)];
  return patterns.some((p) => p.test(origin));
}

export function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !originAllowed(request, env)) return {};
  const requested = request.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": requested || "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function handleOptions(request, env) {
  if (request.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

export function withCors(response, request, env) {
  const cors = corsHeaders(request, env);
  if (!Object.keys(cors).length) return response;
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
