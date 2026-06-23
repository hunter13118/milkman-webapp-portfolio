import { onRequestGet as healthGet } from "./worker/cloudpilot/api/v1/health.js";
import {
  onRequestGet as generateGet,
  onRequestPost as generatePost,
} from "./worker/cloudpilot/api/v1/architect/generate.js";
import { onRequestPost as graderEvaluate } from "./worker/grade-the-grader/api/v1/evaluate.js";
import { onRequestPost as specterSmackTalk } from "./worker/specterboard/api/v1/smack-talk.js";
import { handleEbookavplayerApi } from "./worker/ebookavplayer/worker.js";
import { onQueueBatch as vaeQueueDispatch } from "./worker/ebookavplayer/queue/dispatch.js";

const ROUTES = [
  { prefix: "/projects/cloudpilot/api/v1", routes: [
    { path: "/health", method: "GET", handler: healthGet },
    { path: "/architect/generate", method: "POST", handler: generatePost },
    { path: "/architect/generate", method: "GET", handler: generateGet },
  ]},
  { prefix: "/projects/grade-the-grader/api/v1", routes: [
    { path: "/evaluate", method: "POST", handler: graderEvaluate },
  ]},
  { prefix: "/projects/specterboard/api/v1", routes: [
    { path: "/smack-talk", method: "POST", handler: specterSmackTalk },
  ]},
];

/** Canonical host + HTTPS — fixes mobile bookmarks to www and plain http. */
function canonicalRedirect(request) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const proto = request.headers.get("X-Forwarded-Proto") || url.protocol.replace(":", "");

  if (host === "www.hunterthemilkman.com") {
    url.hostname = "hunterthemilkman.com";
    return Response.redirect(url.toString(), 301);
  }
  if (proto === "http") {
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const canon = canonicalRedirect(request);
    if (canon) return canon;

    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/projects/ebookavplayer/api")) {
      return handleEbookavplayerApi(request, env, ctx);
    }

    for (const group of ROUTES) {
      if (!pathname.startsWith(group.prefix)) continue;
      const sub = pathname.slice(group.prefix.length);
      for (const route of group.routes) {
        if (sub === route.path && request.method === route.method) {
          return route.handler({ request, env, ctx });
        }
      }
    }

    // Portfolio SPA catalog — not an embedded app under /projects/<slug>/
    const isProjectsCatalog =
      pathname === "/projects" || pathname === "/projects/";
    if (isProjectsCatalog && request.method === "GET") {
      const spaUrl = new URL(request.url);
      spaUrl.pathname = "/index.html";
      request = new Request(spaUrl.toString(), request);
    }

    const response = await env.ASSETS.fetch(request);
    const isHtml =
      pathname.endsWith(".html") ||
      pathname.endsWith("/") ||
      (!pathname.includes(".") && request.method === "GET");
    if (isHtml && response.ok) {
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Pragma", "no-cache");
      return new Response(response.body, { status: response.status, headers });
    }
    return response;
  },
  async queue(batch, env, ctx) {
    return vaeQueueDispatch(batch, env);
  },
};
