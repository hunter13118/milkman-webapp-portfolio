/**
 * Cost-efficiency guidance for the edge AI pipeline + attribution tunables.
 */

export const COST_EFFICIENT_PRESET = {
  id: "cost_efficient",
  label: "Cost-efficient (recommended)",
  summary:
    "Cerebras-first extract, free image APIs before Workers AI, Gemini image off, batched LLM attribution on ambiguous scenes only.",
  lanes: {
    extract: {
      order: ["cerebras", "groq", "mistral", "openrouter", "cloudflare"],
      disabled: ["gemini"],
    },
    image: {
      order: ["freemium_image", "gemini_image", "local_sd"],
      disabled: ["gemini_image"],
    },
    image_freemium_character: {
      order: ["pollinations-anon", "pollinations-seed", "huggingface", "cloudflare", "workers-ai"],
      disabled: [],
    },
    image_freemium_background: {
      order: ["pollinations-anon", "pollinations-seed", "huggingface", "cloudflare", "workers-ai"],
      disabled: [],
    },
  },
  env: {
    EXTRACT_SKIP_GEMINI: "true",
    VAE_ATTR_LLM: "true",
    VAE_ATTR_LLM_BATCH: "5",
    VAE_ATTR_LLM_MAX_SCENES: "8",
  },
  bullets: [
    "Extract: Cerebras first (~1M tokens/day). Keep Gemini disabled unless you need max JSON quality.",
    "Extract: Keep Workers AI (Cloudflare) last — shares 10k neurons/day with FLUX imaging.",
    "Images: Pollinations → Hugging Face → Cloudflare REST → Workers AI FLUX (binding last). Disable Gemini Image on free tier.",
    "Attribution: LLM only on ambiguous multi-speaker scenes, batched (5/scene cap 8) ≈ 0–2 extra calls/book.",
    "Groq is fast but ~100k tokens/day — good burst fallback, not sustained novel ingest.",
  ],
};

export function attrLlmFromEnv(env = {}) {
  return {
    enabled: String(env.VAE_ATTR_LLM ?? "false").toLowerCase() === "true",
    batch: parseInt(env.VAE_ATTR_LLM_BATCH || "5", 10) || 5,
    max_scenes: parseInt(env.VAE_ATTR_LLM_MAX_SCENES || "8", 10) || 8,
  };
}

function enabledOrder(laneDef) {
  const disabled = new Set(laneDef?.disabled || []);
  return (laneDef?.order || []).filter((id) => !disabled.has(id));
}

function firstEnabled(laneDef) {
  return enabledOrder(laneDef)[0] || null;
}

function lastEnabled(laneDef) {
  const order = enabledOrder(laneDef);
  return order[order.length - 1] || null;
}

function matchesPresetLane(cfg, laneKey, presetLane) {
  const lane = cfg[laneKey];
  if (!lane) return false;
  const disabled = new Set(lane.disabled || []);
  for (const id of presetLane.disabled || []) {
    if (!disabled.has(id)) return false;
  }
  const enabled = enabledOrder(lane);
  const want = (presetLane.order || []).filter((id) => !(presetLane.disabled || []).includes(id));
  if (enabled.length !== want.length) return false;
  return enabled.every((id, i) => id === want[i]);
}

/** Compare live KV config + env vars to the cost-efficient preset. */
export function evaluateCostEfficiency(cfg, env = {}) {
  const tips = [];
  const preset = COST_EFFICIENT_PRESET;
  const attr = attrLlmFromEnv(env);

  if (firstEnabled(cfg.extract) === "cerebras") {
    tips.push({ level: "ok", text: "Extract leads with Cerebras — best free sustained token budget." });
  } else if (env.CEREBRAS_API_KEY) {
    tips.push({
      level: "tip",
      text: "Drag Cerebras to the top of Text extraction — ~1M tokens/day vs Groq's ~100k.",
    });
  }

  if ((cfg.extract?.disabled || []).includes("gemini")) {
    tips.push({ level: "ok", text: "Gemini extract disabled — preserves Flash quota (~1500 req/day) for optional use." });
  } else if (firstEnabled(cfg.extract) === "gemini") {
    tips.push({
      level: "warn",
      text: "Gemini is first in extract — highest quality, but burns daily request quota on every chunk.",
    });
  }

  if (lastEnabled(cfg.extract) === "cloudflare") {
    tips.push({ level: "ok", text: "Workers AI extract is last — neurons reserved for imaging fallback." });
  } else if (enabledOrder(cfg.extract).includes("cloudflare")) {
    tips.push({
      level: "warn",
      text: "Move Workers AI to the end of Text extraction — text + FLUX share 10k neurons/day.",
    });
  }

  for (const laneKey of ["image_freemium_character", "image_freemium_background"]) {
    if (lastEnabled(cfg[laneKey]) === "workers-ai") continue;
    if (enabledOrder(cfg[laneKey]).includes("workers-ai")) {
      tips.push({
        level: "warn",
        text: `${laneKey === "image_freemium_character" ? "Sprites" : "Backgrounds"}: move Workers AI (FLUX) to the end — try Pollinations/HF/REST first.`,
      });
    }
  }

  if ((cfg.image?.disabled || []).includes("gemini_image")) {
    tips.push({ level: "ok", text: "Gemini Image disabled — freemium chain handles art without image RPD." });
  }

  if (attr.enabled) {
    tips.push({
      level: "ok",
      text: `LLM attribution on — batched ${attr.batch}/call, max ${attr.max_scenes} ambiguous scenes per book.`,
    });
  } else {
    tips.push({
      level: "tip",
      text: "Set VAE_ATTR_LLM=true for ambiguous dialogue fixes (~0–2 batched calls/book when enabled).",
    });
  }

  const lanesMatch = Object.entries(preset.lanes).every(([key, lane]) =>
    matchesPresetLane(cfg, key, lane),
  );
  const attrMatch = attr.enabled && attr.batch === 5 && attr.max_scenes === 8;

  return {
    preset: {
      id: preset.id,
      label: preset.label,
      summary: preset.summary,
      bullets: preset.bullets,
      lanes: preset.lanes,
    },
    attr_llm: attr,
    matching: lanesMatch && attrMatch,
    tips,
  };
}

/** Patch object for PATCH /pipeline — merges with existing lane order. */
export function presetPipelinePatch(cfg) {
  const patch = {};
  for (const [laneKey, lanePreset] of Object.entries(COST_EFFICIENT_PRESET.lanes)) {
    const base = cfg[laneKey] || { order: [], disabled: [] };
    const seen = new Set();
    const order = [];
    for (const sid of lanePreset.order || []) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      order.push(sid);
    }
    for (const sid of base.order || []) {
      if (!seen.has(sid)) {
        seen.add(sid);
        order.push(sid);
      }
    }
    patch[laneKey] = {
      order,
      disabled: [...new Set([...(base.disabled || []), ...(lanePreset.disabled || [])])],
    };
  }
  return patch;
}
