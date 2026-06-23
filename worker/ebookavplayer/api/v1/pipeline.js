import { publicView, saveConfig } from "../../_shared/pipeline-registry.js";
import { json } from "../../_shared/jobs-kv.js";

function pipelineEnabled(env) {
  return Boolean(env.VAE_JOBS);
}

export async function onPipelineGet({ env }) {
  if (!pipelineEnabled(env)) return null;
  return json(await publicView(env));
}

export async function onPipelinePatch({ request, env }) {
  if (!pipelineEnabled(env)) return null;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  await saveConfig(env, body.lanes || body);
  return json(await publicView(env));
}
