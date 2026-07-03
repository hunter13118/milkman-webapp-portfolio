/**
 * Unified image generation: Gemini → freemium APIs → Workers AI → local SD.
 */
import { resolvedOrder, stageAvailable } from "./pipeline-registry.js";
import { tryGeminiImage, geminiImageAvailable } from "./gemini-image.js";
import {
  maybePurgeFreemiumImage,
  purgeSpriteBackground,
  purgeOptsFromEnv,
  isTransparentEnough,
} from "./sprite-bg-purge.js";

const PER_PROVIDER_TIMEOUT_MS = 18_000;
/** gen.pollinations.ai — fast when authed, often 401 without. */
const POLLINATIONS_TIMEOUT_MS = 20_000;
/** image.pollinations.ai free tier can take 40–50s on back-to-back requests. */
const POLLINATIONS_ALT_TIMEOUT_MS = 65_000;
const CF_FLUX = "@cf/black-forest-labs/flux-1-schnell";
const HF_MODEL = "black-forest-labs/FLUX.1-schnell";
const POLLINATIONS_MODEL = "flux";
const POLLINATIONS_I2I_DEFAULT = "kontext";
const POLLINATIONS_I2I_DATA_URI_MAX = 180_000;

/**
 * After a successful image in a batch run, decide the next preferProvider / pollinations hints.
 * Pollinations anon + seed share the same flux model; pinning anon causes image-B failures
 * (401→seed skip, 402 budget, or alt URL timeout). Pin seed only after a paid seed success.
 */
export function applyImagingPinState(state, result, env) {
  const next = {
    imagePin: state?.imagePin ?? null,
    pollinationsAltFirst: Boolean(state?.pollinationsAltFirst),
  };
  const provider = result?.provider;
  const model = String(result?.model || "");
  if (!provider) return next;

  if (provider.startsWith("pollinations") && model.includes("-free")) {
    next.pollinationsAltFirst = true;
    return next;
  }

  if (provider === "pollinations-seed" && !model.includes("-free")) {
    next.imagePin = "pollinations-seed";
    return next;
  }

  if (provider.startsWith("pollinations")) {
    return next;
  }

  if (!next.imagePin) {
    next.imagePin = provider;
  }
  return next;
}

const SUBJECT_FRAMING = {
  character: {
    pre:
      "Portrait bust character sprite, head and shoulders, large readable face, "
      + "centered composition, expressive eyes and hair, front-facing or 3/4 view,",
    postTransparent:
      "character cutout on a fully transparent background (alpha channel), "
      + "no backdrop, no floor shadow, no scenery, even lighting, "
      + "face and hair fill most of the frame, thumbnail-friendly, "
      + "visual novel dialogue portrait ready.",
  },
  background: {
    pre:
      "Wide establishing background scene, environment art, no characters, "
      + "no people, strong sense of depth and atmosphere,",
    post: "full scene fills the frame, layered foreground/midground/background, usable as a game backdrop layer.",
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
    hfModel: String(env.HF_IMAGE_MODEL || HF_MODEL).trim() || HF_MODEL,
    hfProviders: String(env.HF_IMAGE_PROVIDERS || "hf-inference").split(",").map((s) => s.trim()).filter(Boolean),
    falKey: String(env.FAL_KEY || env.FAL_AI_API_KEY || "").trim(),
  };
}

export function huggingfaceAvailable(env) {
  return Boolean(String(env?.HF_TOKEN || "").trim() || String(env?.FAL_KEY || env?.FAL_AI_API_KEY || "").trim());
}

/** Cloudflare REST path — model id must stay literal (@cf/author/model), not encodeURIComponent. */
export function cloudflareAiRunUrl(accountId, modelId = CF_FLUX) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`;
}

// Exact-match aliases only — the old substring-`includes()` matching wrongly
// bucketed anything containing "real" (even "unrealistic") into the
// "realistic" template and silently discarded custom style text a user typed
// into the art-style picker. Unmatched text now flows through as "custom" so
// composeImagePrompt can use it verbatim instead of falling back to neutral.
const STYLE_ALIASES = {
  realistic: "realistic",
  real: "realistic",
  "semi-real": "realistic",
  "semi-realistic": "realistic",
  anime: "anime",
  pixel: "pixel",
  "pixel-art": "pixel",
  cartoon: "comic",
  comic: "comic",
  neutral: "neutral",
};

export function artStyleKey(artStyle) {
  const s = (artStyle || "").toLowerCase().trim();
  return STYLE_ALIASES[s] || "custom";
}

export function composeImagePrompt(description, { subjectType = "character", style = "neutral" } = {}) {
  const subj = subjectType === "background" ? "background" : "character";
  const framing = SUBJECT_FRAMING[subj];
  const key = artStyleKey(style);
  const styleDesc = key === "custom" ? String(style || "").trim() : (STYLE_TEMPLATES[key] || STYLE_TEMPLATES.neutral);
  const desc = String(description || "").trim().replace(/\s+/g, " ");
  const post = subj === "character" ? framing.postTransparent : framing.post;
  return `${framing.pre} ${desc} ${post} Art style: ${styleDesc || STYLE_TEMPLATES.neutral}.`;
}

async function fetchTimeout(url, options, ms = PER_PROVIDER_TIMEOUT_MS, fetchFn = fetch) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetchFn(url, { ...options, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

async function tryWorkersAiBinding(prompt, seed, env) {
  if (!env.AI) throw new Error("workers-ai: AI binding missing");
  const input = { prompt: String(prompt).slice(0, 2048) };
  if (Number.isInteger(seed)) input.seed = seed;
  const out = await env.AI.run(CF_FLUX, input);
  if (out instanceof ArrayBuffer) {
    return { provider: "workers-ai", model: CF_FLUX, bytes: new Uint8Array(out), contentType: "image/jpeg" };
  }
  if (out instanceof Uint8Array) {
    return { provider: "workers-ai", model: CF_FLUX, bytes: out, contentType: "image/jpeg" };
  }
  if (out && typeof out === "object" && out.image) {
    const b64 = out.image;
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return { provider: "workers-ai", model: CF_FLUX, bytes: bin, contentType: "image/jpeg" };
  }
  throw new Error("workers-ai: unexpected response shape");
}

async function tryCloudflareRest(prompt, seed, cfg, fetchFn = fetch) {
  const { cloudflareAccountId: acct, cloudflareToken: token } = cfg;
  if (!acct || !token) throw new Error("cloudflare: missing credentials");
  const url = cloudflareAiRunUrl(acct, CF_FLUX);
  const body = { prompt: String(prompt).slice(0, 2048) };
  if (Number.isInteger(seed)) body.seed = seed;
  const res = await fetchTimeout(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }, PER_PROVIDER_TIMEOUT_MS, fetchFn);
  if (!res.ok) throw new Error(`cloudflare: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.startsWith("image/")) {
    return {
      provider: "cloudflare",
      model: CF_FLUX,
      bytes: new Uint8Array(await res.arrayBuffer()),
      contentType: ct.split(";")[0],
    };
  }
  const data = await res.json();
  const b64 = data?.result?.image;
  if (!b64) throw new Error("cloudflare: no image");
  const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  return { provider: "cloudflare", model: CF_FLUX, bytes: bin, contentType: "image/jpeg" };
}

function pollinationsUrl(prompt, seed, model, { imageParam = null } = {}) {
  const p = String(prompt).slice(0, 900);
  let u = `https://gen.pollinations.ai/image/${encodeURIComponent(p)}?model=${encodeURIComponent(model)}&nologo=true`;
  if (Number.isInteger(seed)) u += `&seed=${seed}`;
  if (imageParam) u += `&image=${encodeURIComponent(imageParam)}`;
  return u;
}

function arrayBufferToBase64(buf) {
  const u8 = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mimeFromBytes(buf) {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50) return "image/png";
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xd8) return "image/jpeg";
  return "image/png";
}

/** Build Pollinations `image=` value: public URLs (preferred) or small data URIs. */
export function buildPollinationsImageParam({ referenceImageUrls = null, referenceImages = null } = {}) {
  const parts = [];
  for (const url of referenceImageUrls || []) {
    if (url && /^https?:\/\//i.test(url)) parts.push(url);
  }
  if (!parts.length && referenceImages?.length) {
    for (const buf of referenceImages.slice(0, 3)) {
      if (!buf?.byteLength || buf.byteLength > POLLINATIONS_I2I_DATA_URI_MAX) continue;
      const b64 = arrayBufferToBase64(buf);
      parts.push(`data:${mimeFromBytes(buf)};base64,${b64}`);
    }
  }
  if (!parts.length) return null;
  return parts.slice(0, 3).join("|");
}

function pollinationsI2iModel(env) {
  return String(env?.POLLINATIONS_I2I_MODEL || POLLINATIONS_I2I_DEFAULT).trim() || POLLINATIONS_I2I_DEFAULT;
}

async function tryPollinationsI2i(prompt, seed, cfg, {
  referenceImageUrls, referenceImages, env, fetchFn = fetch,
}) {
  const imageParam = buildPollinationsImageParam({ referenceImageUrls, referenceImages });
  if (!imageParam) throw new Error("pollinations-i2i: no resolvable reference URLs or data URIs");
  const model = pollinationsI2iModel(env);
  const token = cfg.pollinationsToken;
  const shortPrompt = String(prompt).slice(0, 900);

  if (token) {
    const url = pollinationsUrl(shortPrompt, seed, model, { imageParam });
    const res = await pollinationsGet(url, { token, timeoutMs: POLLINATIONS_TIMEOUT_MS }, fetchFn);
    if (res.ok) {
      return parsePollinationsResponse(res, { providerId: "pollinations-i2i", model, label: "i2i" });
    }
    if (res.status !== 402 && res.status !== 401) {
      throw new Error(`pollinations-i2i: HTTP ${res.status}`);
    }
  }

  // Free tier: image.pollinations.ai accepts image= without auth (flux — weak ref fidelity vs kontext).
  const altUrl = altPollinationsUrl(shortPrompt, seed, POLLINATIONS_MODEL, { imageParam });
  const altRes = await pollinationsGet(altUrl, { timeoutMs: POLLINATIONS_ALT_TIMEOUT_MS }, fetchFn);
  if (altRes.ok) {
    return parsePollinationsResponse(altRes, {
      providerId: "pollinations-i2i-anon",
      model: `${POLLINATIONS_MODEL}-free-i2i`,
      label: "i2i-anon",
    });
  }
  throw new Error(`pollinations-i2i: HTTP ${altRes.status} (authed i2i models need pollen; anon alt failed)`);
}

function altPollinationsUrl(prompt, seed, model, { imageParam = null } = {}) {
  const p = String(prompt).slice(0, 900);
  let u = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?model=${encodeURIComponent(model)}&width=768&height=1024&nologo=true`;
  if (Number.isInteger(seed)) u += `&seed=${seed}`;
  if (imageParam) u += `&image=${encodeURIComponent(imageParam)}`;
  return u;
}

async function pollinationsGet(url, { token, timeoutMs = POLLINATIONS_TIMEOUT_MS } = {}, fetchFn = fetch) {
  const res = await fetchTimeout(url, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }, timeoutMs, fetchFn);
  return res;
}

function parsePollinationsResponse(res, { providerId, model, label }) {
  if (!res.ok) {
    throw new Error(`Pollinations(${label}): HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "image/jpeg";
  if (!ct.startsWith("image/")) {
    throw new Error(`Pollinations(${label}): bad content-type ${ct.slice(0, 40)}`);
  }
  return res.arrayBuffer().then((buf) => ({
    provider: providerId,
    model,
    bytes: new Uint8Array(buf),
    contentType: ct.split(";")[0],
  }));
}

/** Match Python _pollinations_with_free_fallback — free alt endpoints before authed seed. */
async function tryPollinationsWithFallback(prompt, seed, cfg, {
  providerId, label, startAuthed, altFirst = false, fetchFn = fetch,
}) {
  const token = cfg.pollinationsToken;
  const shortPrompt = String(prompt).slice(0, 900);

  if (startAuthed) {
    if (!token) throw new Error(`pollinations-${label}: no token`);
    const authedUrl = pollinationsUrl(shortPrompt, seed, POLLINATIONS_MODEL);
    const authedRes = await pollinationsGet(authedUrl, { token }, fetchFn);
    if (authedRes.ok) {
      return parsePollinationsResponse(authedRes, { providerId, model: POLLINATIONS_MODEL, label });
    }
    if (authedRes.status !== 402) {
      throw new Error(`Pollinations(${label}): HTTP ${authedRes.status}`);
    }
  }

  const builders = altFirst
    ? [altPollinationsUrl, pollinationsUrl]
    : [pollinationsUrl, altPollinationsUrl];
  let saw401OnGen = false;

  for (const model of [POLLINATIONS_MODEL]) {
    for (const build of builders) {
      const timeoutMs = build === altPollinationsUrl
        ? POLLINATIONS_ALT_TIMEOUT_MS
        : POLLINATIONS_TIMEOUT_MS;
      try {
        const url = build(shortPrompt, seed, model);
        const res = await pollinationsGet(url, { timeoutMs }, fetchFn);
        if (res.ok) {
          return parsePollinationsResponse(res, {
            providerId,
            model: `${model}-free`,
            label,
          });
        }
        if (res.status === 401 && build === pollinationsUrl) {
          saw401OnGen = true;
          continue;
        }
        if (res.status === 429 && build === pollinationsUrl) {
          continue;
        }
      } catch (e) {
        if (build === altPollinationsUrl) {
          throw e;
        }
      }
    }
  }

  if (token && !startAuthed && saw401OnGen) {
    return tryPollinationsWithFallback(prompt, seed, cfg, {
      providerId: "pollinations-seed",
      label: "seed",
      startAuthed: true,
      altFirst,
      fetchFn,
    });
  }

  throw new Error(`pollinations-${label}: all endpoints failed`);
}

async function tryPollinations(prompt, seed, cfg, { authed, providerId, label, altFirst = false, fetchFn = fetch }) {
  return tryPollinationsWithFallback(prompt, seed, cfg, {
    providerId,
    label,
    startAuthed: authed,
    altFirst,
    fetchFn,
  });
}

const FAL_FLUX_SCHNELL = "fal-ai/flux/schnell";

function hfInferenceError(status, detail, model) {
  let msg = "";
  try {
    const parsed = JSON.parse(detail);
    msg = String(parsed?.error || parsed?.message || "").trim();
  } catch {
    msg = String(detail || "").trim();
  }
  const snippet = msg.replace(/\s+/g, " ").slice(0, 200);
  if (status === 402) {
    return `huggingface: HTTP 402 — Inference Provider credits exhausted for ${model}. ${snippet || "Purchase credits or wait for monthly reset (~$0.10 free tier)."}`;
  }
  if (status === 403 && /gated/i.test(snippet)) {
    return `huggingface: HTTP 403 — accept the model license at huggingface.co/${model}. ${snippet}`;
  }
  return `huggingface: HTTP ${status} ${snippet}`;
}

async function tryHfRouter(prompt, seed, { hfToken, model, provider }, fetchFn = fetch) {
  const payload = { inputs: String(prompt).slice(0, 1800), parameters: { num_inference_steps: 4 } };
  if (Number.isInteger(seed)) payload.parameters.seed = seed;
  const url = `https://router.huggingface.co/${provider}/models/${model}`;
  const res = await fetchTimeout(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${hfToken}`,
      "content-type": "application/json",
      accept: "image/png",
    },
    body: JSON.stringify(payload),
  }, 60_000, fetchFn);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(hfInferenceError(res.status, detail, model));
  }
  const ct = res.headers.get("content-type") || "image/png";
  return {
    provider: "huggingface",
    model,
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: ct.split(";")[0],
    via: `hf-router:${provider}`,
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Direct fal.ai queue — bills your Fal account (bypasses depleted HF Inference credits). */
async function tryFalDirect(prompt, seed, falKey, fetchFn = fetch) {
  const body = {
    prompt: String(prompt).slice(0, 1800),
    num_inference_steps: 4,
    image_size: "portrait_4_3",
  };
  if (Number.isInteger(seed)) body.seed = seed;

  const submitUrl = `https://queue.fal.run/${FAL_FLUX_SCHNELL}`;
  const submit = await fetchTimeout(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, 30_000, fetchFn);
  if (!submit.ok) {
    const detail = await submit.text().catch(() => "");
    throw new Error(`fal: HTTP ${submit.status} ${detail.slice(0, 120)}`);
  }

  const queue = await submit.json();
  const requestId = queue?.request_id;
  if (!requestId) throw new Error("fal: no request_id in queue response");

  const statusUrl = `https://queue.fal.run/${FAL_FLUX_SCHNELL}/requests/${requestId}/status`;
  const resultUrl = `https://queue.fal.run/${FAL_FLUX_SCHNELL}/requests/${requestId}`;
  let status = queue.status || "IN_QUEUE";
  const deadline = Date.now() + 120_000;
  while (status !== "COMPLETED") {
    if (status === "FAILED") throw new Error("fal: generation failed");
    if (Date.now() > deadline) throw new Error("fal: timed out waiting for image");
    await sleep(500);
    const st = await fetchTimeout(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    }, 15_000, fetchFn);
    if (!st.ok) throw new Error(`fal: status HTTP ${st.status}`);
    status = (await st.json())?.status || status;
  }

  const result = await fetchTimeout(resultUrl, {
    headers: { Authorization: `Key ${falKey}` },
  }, 30_000, fetchFn);
  if (!result.ok) throw new Error(`fal: result HTTP ${result.status}`);
  const json = await result.json();
  const imageUrl = json?.images?.[0]?.url;
  if (!imageUrl) throw new Error("fal: no image url in result");

  const img = await fetchTimeout(imageUrl, {}, 30_000, fetchFn);
  if (!img.ok) throw new Error(`fal: image fetch HTTP ${img.status}`);
  const ct = img.headers.get("content-type") || "image/png";
  return {
    provider: "huggingface",
    model: FAL_FLUX_SCHNELL,
    bytes: new Uint8Array(await img.arrayBuffer()),
    contentType: ct.split(";")[0],
    via: "fal-direct",
  };
}

async function tryHuggingface(prompt, seed, cfg, fetchFn = fetch) {
  const model = cfg.hfModel || HF_MODEL;
  const failures = [];

  if (cfg.hfToken) {
    for (const provider of cfg.hfProviders || ["hf-inference"]) {
      try {
        return await tryHfRouter(prompt, seed, { hfToken: cfg.hfToken, model, provider }, fetchFn);
      } catch (e) {
        const msg = String(e.message || e);
        failures.push(msg.slice(0, 120));
        if (!/HTTP (402|429|503)/.test(msg)) break;
      }
    }
  }

  if (cfg.falKey) {
    return tryFalDirect(prompt, seed, cfg.falKey, fetchFn);
  }

  if (!cfg.hfToken) {
    throw new Error("huggingface: set HF_TOKEN and/or FAL_KEY (Fal bills directly when HF credits are depleted)");
  }
  throw new Error(failures[0] || "huggingface: request failed");
}

async function tryLocalSd(prompt, env, fetchFn = fetch) {
  const base = String(env.LOCAL_IMAGE_URL || "").trim().replace(/\/$/, "");
  if (!base) throw new Error("local_sd: LOCAL_IMAGE_URL not set");
  const res = await fetchTimeout(`${base}/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: String(prompt).slice(0, 1800) }),
  }, 120_000, fetchFn);
  if (!res.ok) throw new Error(`local_sd: HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "image/png";
  return {
    provider: "local_sd",
    model: "local",
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: ct.split(";")[0],
  };
}

/** Drop pollinations-seed when no token; keep anon+seed in order when token is set. */
export function filterImageProviderChain(chain, cfg = {}) {
  const hasToken = Boolean(cfg.pollinationsToken);
  return (chain || []).filter((pid) => {
    if (pid === "pollinations-seed" && !hasToken) return false;
    return true;
  });
}

function freemiumTryTable(fetchFn, { pollinationsAltFirst = false } = {}) {
  return {
    cloudflare: (p, s, c) => tryCloudflareRest(p, s, c, fetchFn),
    "pollinations-anon": (p, s, c) => tryPollinations(p, s, c, {
      authed: false, providerId: "pollinations-anon", label: "anon", altFirst: pollinationsAltFirst, fetchFn,
    }),
    "pollinations-seed": (p, s, c) => tryPollinations(p, s, c, {
      authed: true, providerId: "pollinations-seed", label: "seed", altFirst: pollinationsAltFirst, fetchFn,
    }),
    huggingface: (p, s, c) => tryHuggingface(p, s, c, fetchFn),
    "workers-ai": (p, s, _c, e) => tryWorkersAiBinding(p, s, e),
  };
}

async function runFreemiumChain(prompt, {
  subjectType, preferProvider, seed, env, onAttempt, onProviderWait, pollinationsAltFirst = false,
} = {}) {
  const { resolvedFreemiumImageChain } = await import("./pipeline-registry.js");
  const cfg = keys(env);
  const fetchFn = env.__fetch || fetch;
  const chain = filterImageProviderChain(
    await resolvedFreemiumImageChain(env, subjectType, preferProvider),
    cfg,
  );
  const failures = [];
  const tryTable = freemiumTryTable(fetchFn, { pollinationsAltFirst });

  for (const pid of chain) {
    if (!stageAvailable(env, pid)) continue;
    const fn = tryTable[pid];
    if (!fn) continue;
    try {
      onAttempt?.(pid);
      const started = Date.now();
      let waitTimer;
      if (onProviderWait) {
        waitTimer = setInterval(() => {
          onProviderWait(pid, Date.now() - started);
        }, 6000);
      }
      let result;
      try {
        result = await fn(prompt, seed, cfg, env);
      } finally {
        clearInterval(waitTimer);
      }
      try {
        return postProcess(result, subjectType, env);
      } catch (e) {
        console.warn(`postProcess failed after ${pid}; returning raw image`, e?.message || e);
        return result;
      }
    } catch (e) {
      failures.push(`${pid}: ${String(e.message || e).slice(0, 80)}`);
    }
  }

  throw new Error(
    `freemium_image: all failed (${failures.length}) — ${failures.slice(0, 3).join(" | ")}`,
  );
}

function postProcess(result, subjectType, env) {
  if (subjectType === "character") return ensureCharacterSpriteTransparency(result, env);
  return result;
}

/** Ensure character sprites have a usable alpha cutout. */
export function ensureCharacterSpriteTransparency(result, env) {
  if (!result?.bytes?.length) return result;
  try {
    const opts = purgeOptsFromEnv(env);
    const minRatio = parseFloat(env?.SPRITE_MIN_TRANSPARENT_RATIO ?? "0.12");

    let out = maybePurgeFreemiumImage(result, env);
    if (!isTransparentEnough(out.bytes, out.contentType, minRatio)) {
      try {
        const forced = purgeSpriteBackground(out.bytes, { ...opts, contentType: out.contentType });
        out = {
          ...out,
          bytes: forced.bytes,
          contentType: "image/png",
          background_purged: true,
          background_purge: forced.meta,
        };
      } catch (e) {
        console.warn("forced background purge failed; keeping prior bytes", e?.message || e);
      }
    }
    return out;
  } catch (e) {
    console.warn("character sprite transparency skipped; using raw provider bytes", e?.message || e);
    return result;
  }
}

/**
 * Generate via ONE provider only — for probes/gallery (no cascade fallback).
 */
export async function generateImageIsolated(providerId, prompt, {
  subjectType = "character",
  seed,
  env,
  onAttempt,
  referenceImages = null,
} = {}) {
  if (!env) throw new Error("generateImageIsolated: env required");
  const cfg = keys(env);
  const fetchFn = env.__fetch || fetch;
  onAttempt?.(providerId);

  if (providerId === "gemini_image") {
    if (!geminiImageAvailable(env)) throw new Error("gemini_image: GEMINI_API_KEY not set");
    const result = await tryGeminiImage(prompt, env, { referenceImages });
    return postProcess(result, subjectType, env);
  }
  if (providerId === "workers-ai") {
    if (!env.AI) throw new Error("workers-ai: AI binding not available");
    const result = await tryWorkersAiBinding(prompt, seed, env);
    return postProcess(result, subjectType, env);
  }

  const tryTable = freemiumTryTable(fetchFn);
  const fn = tryTable[providerId];
  if (!fn) throw new Error(`generateImageIsolated: unknown provider ${providerId}`);
  if (providerId === "huggingface" && !huggingfaceAvailable(env)) {
    throw new Error("huggingface: set HF_TOKEN and/or FAL_KEY");
  }
  if (!stageAvailable(env, providerId)) {
    throw new Error(`${providerId}: not configured (missing API keys)`);
  }
  const result = await fn(prompt, seed, cfg, env);
  return postProcess(result, subjectType, env);
}

// Members of the "freemium_image" top-level tier — used to map a specific
// preferred provider id back to which top-level tier it lives under, since
// preferProvider only reorders *within* runFreemiumChain's sub-chain by
// default (see orderTiersForPreference below).
const IMAGE_FREEMIUM_TIER_MEMBERS = new Set([
  "pollinations-anon", "pollinations-seed", "huggingface", "cloudflare", "workers-ai",
]);

/**
 * A user-selected `preferProvider` (from the image ProviderSelect) should win
 * regardless of which top-level tier it happens to live in — gemini_image and
 * local_sd are top-level tiers, not members of the freemium_image sub-chain,
 * so reordering only the sub-chain (as runFreemiumChain already does) never
 * actually prioritizes them. This moves whichever top-level tier the
 * preference belongs to to the front, then falls through to the rest as
 * before if it fails — a soft preference, not a hard pin (unlike text
 * extraction's pinning, image generation keeps its existing fallback chain).
 */
function orderTiersForPreference(tiers, preferProvider) {
  if (!preferProvider) return tiers;
  const preferredTier = preferProvider === "gemini_image" || preferProvider === "local_sd"
    ? preferProvider
    : (IMAGE_FREEMIUM_TIER_MEMBERS.has(preferProvider) ? "freemium_image" : null);
  if (!preferredTier || !tiers.includes(preferredTier)) return tiers;
  return [preferredTier, ...tiers.filter((t) => t !== preferredTier)];
}

/**
 * Generate one image — Gemini → freemium → local SD (matches Python backends.generate_image).
 */
export async function generateImage(prompt, {
  subjectType = "character", preferProvider, seed, env, onAttempt, onProviderWait, pollinationsAltFirst = false,
  referenceImages = null,
  referenceImageUrls = null,
} = {}) {
  if (!env) throw new Error("generateImage: env required");
  const tiers = orderTiersForPreference(await resolvedOrder(env, "image"), preferProvider);
  const failures = [];
  const imageParam = buildPollinationsImageParam({ referenceImageUrls, referenceImages });
  const hasRefs = Boolean(referenceImages?.length || imageParam);

  if (hasRefs) {
    if (geminiImageAvailable(env)) {
      try {
        onAttempt?.("gemini_image");
        const result = await tryGeminiImage(prompt, env, { referenceImages });
        return postProcess(result, subjectType, env);
      } catch (e) {
        failures.push(`gemini_image: ${String(e.message || e).slice(0, 100)}`);
      }
    } else {
      failures.push("gemini_image: GEMINI_API_KEY not set");
    }

    if (stageAvailable(env, "freemium_image") && imageParam) {
      try {
        onAttempt?.("pollinations-i2i");
        const cfg = keys(env);
        const fetchFn = env.__fetch || fetch;
        const result = await tryPollinationsI2i(prompt, seed, cfg, {
          referenceImageUrls,
          referenceImages,
          env,
          fetchFn,
        });
        return postProcess(result, subjectType, env);
      } catch (e) {
        failures.push(`pollinations-i2i: ${String(e.message || e).slice(0, 120)}`);
      }
    } else if (!imageParam) {
      failures.push(
        "pollinations-i2i: set PUBLIC_MEDIA_ORIGIN to your public API base so Pollinations can fetch /media/ refs",
      );
    }

    throw new Error(
      failures.join("; ")
      || "Reference-backed generation failed (Gemini + Pollinations i2i)",
    );
  }

  for (const tier of tiers) {
    if (tier === "gemini_image") {
      if (!geminiImageAvailable(env)) continue;
      try {
        onAttempt?.("gemini_image");
        const result = await tryGeminiImage(prompt, env, { referenceImages });
        return postProcess(result, subjectType, env);
      } catch (e) {
        failures.push(`gemini_image: ${String(e.message || e).slice(0, 100)}`);
      }
      continue;
    }
    if (tier === "freemium_image") {
      if (!stageAvailable(env, "freemium_image")) continue;
      try {
        return await runFreemiumChain(prompt, {
          subjectType, preferProvider, seed, env, onAttempt, onProviderWait, pollinationsAltFirst,
        });
      } catch (e) {
        failures.push(`freemium_image: ${String(e.message || e).slice(0, 120)}`);
      }
      continue;
    }
    if (tier === "local_sd") {
      if (!stageAvailable(env, "local_sd")) continue;
      try {
        onAttempt?.("local_sd");
        const result = await tryLocalSd(prompt, env, env.__fetch || fetch);
        return postProcess(result, subjectType, env);
      } catch (e) {
        failures.push(`local_sd: ${String(e.message || e).slice(0, 100)}`);
      }
    }
  }

  throw new Error(
    `generate_image: all tiers failed (${failures.length}) — ${failures.join(" | ").slice(0, 480)}`,
  );
}

/** @deprecated use generateImage */
export async function freemiumImage(prompt, opts = {}) {
  return generateImage(prompt, opts);
}

export function mediaUrl(bookId, style, filename, { bust } = {}) {
  const base = `/media/${bookId}/${style}/${filename}`;
  if (!bust) return base;
  return `${base}?v=${bust}`;
}

export function r2MediaKey(bookId, style, filename) {
  return `media/${bookId}/${style}/${filename}`;
}

export { geminiImageAvailable };
