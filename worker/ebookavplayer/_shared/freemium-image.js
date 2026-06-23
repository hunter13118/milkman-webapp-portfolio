/**
 * Freemium image cascade (port of IMAGE AND VOICE HANDOFF/freemiumImageGen.js).
 * Chain order from pipeline-registry (KV / defaults — Workers AI last).
 */
import { resolvedFreemiumImageChain } from "./pipeline-registry.js";

const PER_PROVIDER_TIMEOUT_MS = 30_000;
const CF_FLUX = "@cf/black-forest-labs/flux-1-schnell";
const HF_MODEL = "black-forest-labs/FLUX.1-schnell";
const POLLINATIONS_MODEL = "flux";

const SUBJECT_FRAMING = {
  character: {
    pre: "Portrait bust character sprite, head and shoulders, centered, expressive,",
    postTransparent:
      "character cutout transparent background, no backdrop, visual novel portrait.",
  },
  background: {
    pre: "Wide establishing background, no characters, atmospheric depth,",
    post: "full scene backdrop, layered depth.",
  },
};

const STYLE_TEMPLATES = {
  realistic: "photorealistic, natural lighting",
  anime: "anime cel-shaded, bold outlines, vibrant colors",
  pixel: "pixel art, 16-bit RPG sprite, crisp pixels",
  comic: "cartoon comic style, bold outlines",
  neutral: "clean digital illustration",
};

function keys(env) {
  return {
    cloudflareAccountId: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareToken: env.CLOUDFLARE_API_TOKEN,
    pollinationsToken: env.POLLINATIONS_TOKEN,
    hfToken: env.HF_TOKEN,
  };
}

export function artStyleKey(artStyle) {
  const s = (artStyle || "").toLowerCase();
  if (s.includes("real") || s === "semi-real") return "realistic";
  if (s.includes("anime")) return "anime";
  if (s.includes("pixel")) return "pixel";
  if (s.includes("cartoon") || s.includes("comic")) return "comic";
  return "neutral";
}

export function composeImagePrompt(description, { subjectType = "character", style = "neutral" } = {}) {
  const subj = subjectType === "background" ? "background" : "character";
  const framing = SUBJECT_FRAMING[subj];
  const styleDesc = STYLE_TEMPLATES[style] || STYLE_TEMPLATES.neutral;
  const desc = String(description || "").trim().replace(/\s+/g, " ");
  const post = subj === "character" ? framing.postTransparent : framing.post;
  return `${framing.pre} ${desc} ${post} Art style: ${styleDesc}.`;
}

async function fetchTimeout(url, options, ms = PER_PROVIDER_TIMEOUT_MS) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

async function tryCloudflare(prompt, seed, cfg) {
  const { cloudflareAccountId: acct, cloudflareToken: token } = cfg;
  if (!acct || !token) throw new Error("cloudflare: missing credentials");
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${CF_FLUX}`;
  const body = { prompt };
  if (Number.isInteger(seed)) body.seed = seed;
  const res = await fetchTimeout(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`cloudflare: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const b64 = data?.result?.image;
  if (!b64) throw new Error("cloudflare: no image");
  const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return { provider: "cloudflare", model: "flux-1-schnell", bytes: bin, contentType: "image/jpeg" };
}

function pollinationsUrl(prompt, seed, model) {
  let u = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}`;
  if (Number.isInteger(seed)) u += `&seed=${seed}`;
  return u;
}

async function tryPollinations(prompt, seed, cfg, { authed, providerId, label }) {
  const token = cfg.pollinationsToken;
  if (authed && !token) throw new Error(`pollinations-${label}: no token`);
  const res = await fetchTimeout(pollinationsUrl(prompt, seed, POLLINATIONS_MODEL), {
    method: "GET",
    headers: token && authed ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`pollinations-${label}: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/")) throw new Error(`pollinations-${label}: bad content-type`);
  return {
    provider: providerId,
    model: POLLINATIONS_MODEL,
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: ct,
  };
}

async function tryHuggingface(prompt, seed, cfg) {
  if (!cfg.hfToken) throw new Error("huggingface: no token");
  const url = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;
  const payload = { inputs: prompt, parameters: { num_inference_steps: 4 } };
  if (Number.isInteger(seed)) payload.parameters.seed = seed;
  const res = await fetchTimeout(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.hfToken}`,
      "content-type": "application/json",
      accept: "image/png",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`huggingface: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "image/png";
  return {
    provider: "huggingface",
    model: HF_MODEL,
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: ct,
  };
}

const TRY = {
  cloudflare: (p, s, c) => tryCloudflare(p, s, c),
  "pollinations-anon": (p, s, c) => tryPollinations(p, s, c, { authed: false, providerId: "pollinations-anon", label: "anon" }),
  "pollinations-seed": (p, s, c) => tryPollinations(p, s, c, { authed: true, providerId: "pollinations-seed", label: "seed" }),
  huggingface: (p, s, c) => tryHuggingface(p, s, c),
};

/** Generate one image; returns { provider, model, bytes, contentType }. */
export async function freemiumImage(prompt, { subjectType = "character", preferProvider, seed, env } = {}) {
  if (!env) throw new Error("freemiumImage: env required for pipeline chain");
  const cfg = keys(env);
  const chain = await resolvedFreemiumImageChain(env, subjectType, preferProvider);
  const failures = [];
  for (const pid of chain) {
    const fn = TRY[pid];
    if (!fn) continue;
    try {
      return await fn(prompt, seed, cfg);
    } catch (e) {
      failures.push(e);
    }
  }
  throw new Error(`freemium_image: all failed (${failures.length})`);
}

export function mediaUrl(bookId, style, filename) {
  return `/media/${bookId}/${style}/${filename}`;
}

export function r2MediaKey(bookId, style, filename) {
  return `media/${bookId}/${style}/${filename}`;
}
