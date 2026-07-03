import { publicView, saveConfig, getConfig } from "../../_shared/pipeline-registry.js";
import { evaluateCostEfficiency, presetPipelinePatch } from "../../_shared/pipeline-cost-guide.js";
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
  if (body.apply_cost_efficient) {
    const cfg = await getConfig(env);
    await saveConfig(env, presetPipelinePatch(cfg));
  } else {
    await saveConfig(env, body.lanes || body);
  }
  return json(await publicView(env));
}
