/**
 * Freemium LLM cascade for book extract on the edge (mirrors server/analyze/freemium_extract.py).
 */
import { SYSTEM, SCHEMA_HINT } from "./extract-prompt.js";
import { resolvedExtractProviders } from "./pipeline-registry.js";

const PER_PROVIDER_TIMEOUT_MS = 90_000;
const MAX_CHUNK_TOKENS = 24000;

const PROVIDER_MODELS = {
  gemini: "gemini-2.5-flash",
  cerebras: "gpt-oss-120b",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  cloudflare: "@cf/meta/llama-3.1-8b-instruct",
};

const PROVIDER_URLS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  cerebras: "https://api.cerebras.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export function parseModelJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("empty model response");
  let s = raw.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(s);
  if (fence) s = fence[1].trim();
  if (!(s.startsWith("{") || s.startsWith("["))) {
    const firstObj = s.indexOf("{");
    const firstArr = s.indexOf("[");
    const start = firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
    if (start !== -1) {
      const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
      if (end > start) s = s.slice(start, end + 1);
    }
  }
  try {
    return JSON.parse(s);
  } catch {
    return JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
  }
}

export function buildSystemPrompt() {
  return (
    `${SYSTEM}\n\nReturn JSON exactly matching this shape:\n${JSON.stringify(SCHEMA_HINT, null, 2)}\n` +
    "Output a single valid JSON object only — no markdown, no commentary."
  );
}

export function buildUserPrompt(book_id, title, author, body_text, chunkIndex, chunkTotal) {
  const chunkNote =
    chunkIndex != null && chunkTotal > 1
      ? `\nNOTE: chunk ${chunkIndex + 1} of ${chunkTotal}. Extract only this chunk; stable character ids.\n`
      : "";
  return `book_id = ${JSON.stringify(book_id)}; title = ${JSON.stringify(title)}; author = ${JSON.stringify(author)}.${chunkNote}\n\nBOOK TEXT START\n${body_text}\nBOOK TEXT END\n`;
}

function keysFromEnv(env) {
  return {
    gemini: env.GEMINI_API_KEY,
    cerebras: env.CEREBRAS_API_KEY,
    groq: env.GROQ_API_KEY,
    mistral: env.MISTRAL_API_KEY,
    openrouter: env.OPENROUTER_API_KEY,
    cloudflare_account: env.CLOUDFLARE_ACCOUNT_ID,
    cloudflare_token: env.CLOUDFLARE_API_TOKEN,
  };
}

async function fetchWithTimeout(url, options, timeoutMs = PER_PROVIDER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function openAICompatibleExtract({ providerId, baseUrl, apiKey, model, systemPrompt, userText }) {
  if (!apiKey) throw new Error(`${providerId}: missing API key (skipped)`);
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${providerId}: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${providerId}: no content in response`);
  return { provider: providerId, model, data: parseModelJson(content) };
}

async function cloudflareExtract({ accountId, token, model, systemPrompt, userText }) {
  if (!accountId || !token) throw new Error("cloudflare: missing account id or token (skipped)");
  const modelId = envCloudflareModel(model);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_tokens: 8192,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`cloudflare: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.errors?.length) throw new Error(`cloudflare: ${JSON.stringify(data.errors).slice(0, 200)}`);
  const result = data.result || {};
  const content = result.response || result.text || result.message?.content || "";
  if (!content) throw new Error("cloudflare: no content in response");
  return { provider: "cloudflare", model: modelId, data: parseModelJson(content) };
}

function envCloudflareModel(model) {
  return model.startsWith("@cf/") ? model : `@cf/${model.replace(/^@cf\//, "")}`;
}

export async function freemiumExtract(userText, { systemPrompt, preferProvider, env }) {
  const cfg = keysFromEnv(env);
  const chain = await resolvedExtractProviders(env, preferProvider);
  const failures = [];
  for (const pid of chain) {
    try {
      if (pid === "cloudflare") {
        return await cloudflareExtract({
          accountId: cfg.cloudflare_account,
          token: cfg.cloudflare_token,
          model: env.CLOUDFLARE_EXTRACT_MODEL || PROVIDER_MODELS.cloudflare,
          systemPrompt,
          userText,
        });
      }
      if (pid === "gemini") {
        return await openAICompatibleExtract({
          providerId: "gemini",
          baseUrl: PROVIDER_URLS.gemini,
          apiKey: cfg.gemini,
          model: env.GEMINI_MODEL || PROVIDER_MODELS.gemini,
          systemPrompt,
          userText,
        });
      }
      return await openAICompatibleExtract({
        providerId: pid,
        baseUrl: PROVIDER_URLS[pid],
        apiKey: cfg[pid],
        model: env[`${pid.toUpperCase()}_EXTRACT_MODEL`] || PROVIDER_MODELS[pid],
        systemPrompt,
        userText,
      });
    } catch (e) {
      console.warn("freemium extract", pid, e.message || e);
      failures.push(e);
    }
  }
  throw new Error(`freemium_extract: all providers failed (${failures.length})`);
}

export function chunkText(text, maxTokens = MAX_CHUNK_TOKENS) {
  if (!text?.trim()) return [];
  const maxChars = maxTokens * 4;
  text = text.trim();
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  const sentRe = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    push();
    if (para.length <= maxChars) {
      current = para;
    } else {
      for (const sent of para.match(sentRe) || [para]) {
        if ((current + sent).length <= maxChars) current += sent;
        else {
          push();
          if (sent.length > maxChars) {
            for (let i = 0; i < sent.length; i += maxChars) chunks.push(sent.slice(i, i + maxChars).trim());
          } else current = sent;
        }
      }
    }
  }
  push();
  return chunks;
}

export function mergeAnalysisDicts(dataObjects) {
  const charById = new Map();
  const scenes = [];
  for (const d of dataObjects) {
    if (!d) continue;
    for (const c of d.characters || []) {
      const cid = (c.id || c.name || "").toLowerCase().trim();
      if (!cid) continue;
      if (!charById.has(cid)) charById.set(cid, { ...c, id: c.id || cid, aliases: [...(c.aliases || [])] });
      else {
        const ex = charById.get(cid);
        ex.aliases = [...new Set([...(ex.aliases || []), ...(c.aliases || [])])];
        if ((c.description || "").length > (ex.description || "").length) ex.description = c.description;
      }
    }
    for (const s of d.scenes || []) scenes.push(s);
  }
  return { characters: [...charById.values()], scenes };
}

/** Full book extract via freemium chain (chunked). */
export async function freemiumExtractBook(
  { book_id, title, author, body_text },
  { env, preferProvider, onProgress },
) {
  const system = buildSystemPrompt();
  const chunks = chunkText(body_text);
  if (!chunks.length) throw new Error("empty book text");

  let pin = preferProvider;
  const partials = [];
  let usedModel = "";

  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress({ chunk: i + 1, total: chunks.length, provider: pin });
    const user = buildUserPrompt(book_id, title, author, chunks[i], i, chunks.length);
    const result = await freemiumExtract(user, { systemPrompt: system, preferProvider: pin, env });
    if (!pin) {
      pin = result.provider;
      usedModel = result.model;
    } else if (!usedModel) usedModel = result.model;
    partials.push(result.data);
  }

  const merged = mergeAnalysisDicts(partials);
  merged.book_id = book_id;
  merged.title = title;
  merged.author = author;
  return { analysis: merged, provider: pin || "unknown", model: usedModel };
}
