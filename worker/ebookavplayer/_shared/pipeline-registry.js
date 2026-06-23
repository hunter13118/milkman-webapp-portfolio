/**
 * Pipeline registry for edge Worker — mirrors server/pipeline/registry.py.
 * Config persisted in KV `pipeline:config`; drives freemium chain order.
 */

const KV_KEY = "pipeline:config";

const IMAGE_FREEMIUM_DEFAULT = [
  "pollinations-anon",
  "pollinations-seed",
  "huggingface",
  "cloudflare",
];

const STAGE_META = {
  gemini: {
    label: "Gemini",
    icon: "✦",
    tier: "primary",
    lane: "extract",
    requires: ["GEMINI_API_KEY"],
  },
  cerebras: {
    label: "Cerebras",
    icon: "⚡",
    tier: "freemium",
    lane: "extract",
    requires: ["CEREBRAS_API_KEY"],
    modelEnv: "CEREBRAS_EXTRACT_MODEL",
    defaultModel: "gpt-oss-120b",
  },
  groq: {
    label: "Groq",
    icon: "🦙",
    tier: "freemium",
    lane: "extract",
    requires: ["GROQ_API_KEY"],
    defaultModel: "llama-3.3-70b-versatile",
  },
  mistral: {
    label: "Mistral",
    icon: "🌬",
    tier: "freemium",
    lane: "extract",
    requires: ["MISTRAL_API_KEY"],
    defaultModel: "mistral-small-latest",
  },
  openrouter: {
    label: "OpenRouter",
    icon: "🔀",
    tier: "freemium",
    lane: "extract",
    requires: ["OPENROUTER_API_KEY"],
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  cloudflare: {
    label: "Workers AI",
    icon: "☁",
    tier: "freemium",
    lane: "extract",
    requires: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    modelEnv: "CLOUDFLARE_EXTRACT_MODEL",
    defaultModel: "@cf/meta/llama-3.1-8b-instruct",
    note: "Late-chain fallback — shares 10k neurons/day with image FLUX",
  },
  gemini_image: {
    label: "Gemini Image",
    icon: "✦",
    tier: "primary",
    lane: "image",
    requires: ["GEMINI_API_KEY"],
  },
  freemium_image: {
    label: "Freemium APIs",
    icon: "🆓",
    tier: "freemium",
    lane: "image",
    requires: [],
  },
  local_sd: {
    label: "Local SD",
    icon: "🖥",
    tier: "local",
    lane: "image",
    requires: [],
    optionalEnv: ["LOCAL_IMAGE_URL"],
  },
  "pollinations-anon": {
    label: "Pollinations (free)",
    icon: "🌸",
    tier: "freemium",
    lane: "image_freemium",
    requires: [],
  },
  "pollinations-seed": {
    label: "Pollinations (seed)",
    icon: "🌺",
    tier: "freemium",
    lane: "image_freemium",
    requires: ["POLLINATIONS_TOKEN"],
  },
  huggingface: {
    label: "Hugging Face",
    icon: "🤗",
    tier: "freemium",
    lane: "image_freemium",
    requires: ["HF_TOKEN"],
    modelEnv: "HF_IMAGE_MODEL",
    defaultModel: "black-forest-labs/FLUX.1-schnell",
  },
};

const GEMINI_TEXT_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
];

function laneDefault(lane) {
  const map = {
    extract: {
      order: ["gemini", "cerebras", "groq", "mistral", "openrouter", "cloudflare"],
      disabled: [],
    },
    image: { order: ["gemini_image", "freemium_image", "local_sd"], disabled: [] },
    image_freemium_character: { order: [...IMAGE_FREEMIUM_DEFAULT], disabled: [] },
    image_freemium_background: { order: [...IMAGE_FREEMIUM_DEFAULT], disabled: [] },
    gemini_text: { order: [...GEMINI_TEXT_MODELS], disabled: [] },
    gemini_image_models: { order: [...GEMINI_IMAGE_MODELS], disabled: [] },
  };
  return map[lane] || { order: [], disabled: [] };
}

export function defaultConfig(env = {}) {
  const cfg = {
    extract: laneDefault("extract"),
    image: laneDefault("image"),
    image_freemium_character: laneDefault("image_freemium_character"),
    image_freemium_background: laneDefault("image_freemium_background"),
    gemini_text: laneDefault("gemini_text"),
    gemini_image_models: laneDefault("gemini_image_models"),
  };
  if (String(env.EXTRACT_SKIP_GEMINI ?? "true").toLowerCase() === "true") {
    cfg.extract.disabled = [...new Set([...(cfg.extract.disabled || []), "gemini"])];
  }
  return cfg;
}

function mergeLane(base, override) {
  if (!override) return base;
  const out = { ...base, order: [...base.order], disabled: [...(base.disabled || [])] };
  if (Array.isArray(override.order)) {
    const seen = new Set();
    const merged = [];
    for (const sid of override.order) {
      if (seen.has(sid) || !base.order.includes(sid)) continue;
      seen.add(sid);
      merged.push(sid);
    }
    for (const sid of base.order) {
      if (!seen.has(sid)) merged.push(sid);
    }
    out.order = merged;
  }
  if (Array.isArray(override.disabled)) {
    out.disabled = override.disabled.filter((x) => typeof x === "string");
  }
  return out;
}

export async function loadConfig(env) {
  const base = defaultConfig(env);
  if (!env.VAE_JOBS) return { cfg: base, persisted: false };
  const raw = await env.VAE_JOBS.get(KV_KEY);
  if (!raw) return { cfg: base, persisted: false };
  try {
    const patch = JSON.parse(raw);
    if (!patch || typeof patch !== "object") return { cfg: base, persisted: false };
    for (const lane of Object.keys(base)) {
      base[lane] = mergeLane(base[lane], patch[lane]);
    }
    return { cfg: base, persisted: true };
  } catch {
    return { cfg: base, persisted: false };
  }
}

export async function getConfig(env) {
  return (await loadConfig(env)).cfg;
}

export async function saveConfig(env, patch) {
  const { cfg } = await loadConfig(env);
  for (const [lane, body] of Object.entries(patch || {})) {
    if (!cfg[lane] || typeof body !== "object") continue;
    cfg[lane] = mergeLane(cfg[lane], body);
  }
  if (env.VAE_JOBS) {
    await env.VAE_JOBS.put(KV_KEY, JSON.stringify(cfg));
  }
  return cfg;
}

function envPresent(env, key) {
  return Boolean(String(env[key] || "").trim());
}

export function stageAvailable(env, stageId) {
  const meta = STAGE_META[stageId];
  if (!meta) {
    if (stageId.startsWith("gemini")) return envPresent(env, "GEMINI_API_KEY");
    return true;
  }
  for (const req of meta.requires || []) {
    if (!envPresent(env, req)) return false;
  }
  if (stageId === "freemium_image") {
    if (String(env.DISABLE_FREEMIUM_IMAGE || "").toLowerCase() === "true") return false;
  }
  if (stageId === "local_sd") return envPresent(env, "LOCAL_IMAGE_URL");
  return true;
}

export async function resolvedOrder(env, lane, prefer = null) {
  const cfg = await getConfig(env);
  const laneDef = cfg[lane] || { order: [], disabled: [] };
  const disabled = new Set(laneDef.disabled || []);
  let order = (laneDef.order || []).filter((sid) => !disabled.has(sid));
  if (prefer && order.includes(prefer)) {
    order = [prefer, ...order.filter((p) => p !== prefer)];
  }
  return order;
}

export async function resolvedExtractProviders(env, prefer = null) {
  return resolvedOrder(env, "extract", prefer);
}

export async function resolvedFreemiumImageChain(env, subjectType, prefer = null) {
  const lane = subjectType === "background" ? "image_freemium_background" : "image_freemium_character";
  return resolvedOrder(env, lane, prefer);
}

function laneTitle(lane) {
  const titles = {
    extract: "Text extraction",
    image: "Image generation tiers",
    image_freemium_character: "Character sprites (freemium)",
    image_freemium_background: "Backgrounds (freemium)",
    gemini_text: "Gemini text models",
    gemini_image_models: "Gemini image models",
  };
  return titles[lane] || lane;
}

export async function publicView(env) {
  const { cfg, persisted } = await loadConfig(env);
  const lanes = {};
  for (const [lane, laneDef] of Object.entries(cfg)) {
    const disabled = new Set(laneDef.disabled || []);
    const items = (laneDef.order || []).map((sid) => {
      const meta = STAGE_META[sid] || {
        label: sid,
        icon: "◇",
        tier: "model",
        lane,
      };
      let model = meta.defaultModel || null;
      if (meta.modelEnv && env[meta.modelEnv]) model = env[meta.modelEnv];
      return {
        id: sid,
        label: meta.label || sid,
        icon: meta.icon || "◇",
        tier: meta.tier || "model",
        enabled: !disabled.has(sid),
        available: stageAvailable(env, sid),
        model,
      };
    });
    lanes[lane] = { title: laneTitle(lane), items };
  }
  return { lanes, config: cfg, source: persisted ? "edge-kv" : "edge-defaults" };
}
