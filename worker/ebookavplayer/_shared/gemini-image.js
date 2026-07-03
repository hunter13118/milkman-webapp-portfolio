/**
 * Gemini image generation on the edge (REST) — mirrors server/images/backends.py _try_gemini.
 */
import { resolvedOrder } from "./pipeline-registry.js";

const FALLBACK_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
];

function geminiApiKey(env) {
  return String(env?.GEMINI_API_KEY || "").trim() || null;
}

function extractInlineImage(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      const bin = Uint8Array.from(atob(inline.data), (ch) => ch.charCodeAt(0));
      return { bytes: bin, contentType: mime };
    }
  }
  return null;
}

async function callGeminiImageModel(apiKey, model, prompt, referenceImages = []) {
  const parts = [{ text: prompt }];
  for (const buf of (referenceImages || []).slice(0, 3)) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : "image/jpeg";
    parts.push({ inlineData: { mimeType: mime, data: btoa(binary) } });
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gemini ${model} HTTP ${res.status}: ${detail.slice(0, 160)}`);
  }
  const data = await res.json();
  const img = extractInlineImage(data);
  if (!img) throw new Error(`gemini ${model}: no image in response`);
  return { provider: "gemini_image", model, ...img };
}

export async function resolvedGeminiImageModels(env) {
  const fromCfg = await resolvedOrder(env, "gemini_image_models");
  return fromCfg.length ? fromCfg : FALLBACK_MODELS;
}

/** Try Gemini image models in order; returns { provider, model, bytes, contentType }. */
export async function tryGeminiImage(prompt, env, { referenceImages = null } = {}) {
  const apiKey = geminiApiKey(env);
  if (!apiKey) throw new Error("gemini_image: GEMINI_API_KEY not configured");
  const models = await resolvedGeminiImageModels(env);
  const refs = referenceImages?.length ? referenceImages : [];
  const failures = [];
  for (const model of models) {
    try {
      return await callGeminiImageModel(apiKey, model, prompt, refs);
    } catch (e) {
      failures.push(e);
    }
  }
  throw new Error(
    `gemini_image: all models failed (${failures.length}) — ${String(failures[0]?.message || failures[0]).slice(0, 120)}`,
  );
}

export function geminiImageAvailable(env) {
  return Boolean(geminiApiKey(env));
}
