/** Reverse-proxy fetch to the VAE FastAPI origin (Fly, tunnel, home server). */

export function originBase(env) {
  const raw = env.VAE_API_ORIGIN || "";
  return String(raw).replace(/\/$/, "");
}

export async function proxyToOrigin(request, env, upstreamPath) {
  const base = originBase(env);
  if (!base) {
    return Response.json({ error: "VAE_API_ORIGIN not configured" }, { status: 503 });
  }
  const url = new URL(request.url);
  const target = `${base}${upstreamPath}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  const res = await fetch(target, init);
  const outHeaders = new Headers(res.headers);
  outHeaders.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, { status: res.status, headers: outHeaders });
}
