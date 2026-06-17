import { onRequestGet as healthGet } from "./worker/cloudpilot/api/v1/health.js";
import {
  onRequestGet as generateGet,
  onRequestPost as generatePost,
} from "./worker/cloudpilot/api/v1/architect/generate.js";
import { onRequestPost as graderEvaluate } from "./worker/grade-the-grader/api/v1/evaluate.js";
import { onRequestPost as specterSmackTalk } from "./worker/specterboard/api/v1/smack-talk.js";

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    for (const group of ROUTES) {
      if (!pathname.startsWith(group.prefix)) continue;
      const sub = pathname.slice(group.prefix.length);
      for (const route of group.routes) {
        if (sub === route.path && request.method === route.method) {
          return route.handler({ request, env, ctx });
        }
      }
    }

    return env.ASSETS.fetch(request);
  },
};
