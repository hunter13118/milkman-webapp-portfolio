/**
 * Freemium LLM cascade for book extract on the edge (mirrors server/analyze/freemium_extract.py).
 */
import { SYSTEM, SCHEMA_HINT, buildSystemPrompt } from "./extract-prompt.js";
import { resolvedExtractProviders } from "./pipeline-registry.js";
import { chunkTextByChapters, chunkChaptersStrict } from "./epub-text.js";
import { runOrderedDrain } from "./ordered-drain.js";
import { reconcileChapterCharacters } from "./character-reconcile.js";
import {
  getRawChapterExtract, putRawChapterExtract, deleteRawChapterExtract,
} from "./book-checkpoint.js";

const PER_PROVIDER_TIMEOUT_MS = 90_000;
// Groq's free tier caps at 12k tokens/minute per request; Cloudflare Workers AI
// truncates long JSON responses. Keep chunks well under both ceilings.
// Also lower for local Ollama: an oversized chapter (~57k chars, ~5x a normal
// chapter) produced a ~16k-char chunk that hung the local 7B model indefinitely
// (near num_ctx, plus a long fully-verbatim structured JSON output demanded of
// it) — smaller chunks keep every single call comfortably inside safe bounds.
const MAX_CHUNK_TOKENS = 2000;

const PROVIDER_MODELS = {
  gemini: "gemini-2.5-flash",
  cerebras: "gpt-oss-120b",
  groq: "llama-3.3-70b-versatile",
  mistral: "mistral-small-latest",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  cloudflare: "@cf/meta/llama-3.1-8b-instruct",
  "ollama-7b": "qwen2.5:7b",
  "ollama-14b": "qwen2.5:14b",
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

export function buildSystemPromptLegacy() {
  return buildSystemPrompt();
}

function formatKnownCharacters(knownCharacters) {
  if (!knownCharacters?.length) return "";
  const rows = knownCharacters.slice(0, 40).map((c) => {
    const aliases = c.aliases?.length ? ` aka [${c.aliases.join(", ")}]` : "";
    const desc = c.description ? ` — ${c.description.slice(0, 100)}` : "";
    return `  - id=${c.id} name=${c.name || c.id}${aliases}${desc}`;
  });
  return `\nKNOWN CHARACTERS (already identified elsewhere in this book — reuse these ids for matches, see rules):\n${rows.join("\n")}\n`;
}

function formatIllustrationsNearby(illustrationsNearby) {
  if (!illustrationsNearby?.length) return "";
  const rows = illustrationsNearby.slice(0, 20).map((p) => {
    const ctx = p.textContext ? p.textContext.slice(0, 160) : "";
    return `  - index=${p.index}${ctx ? `: "${ctx}"` : ""}`;
  });
  return `\nILLUSTRATION PLATES near this chapter (set illustration_ref to the matching index on a character or scene ONLY when the plate's nearby text clearly matches something you're extracting — do not guess):\n${rows.join("\n")}\n`;
}

export function buildUserPrompt(
  book_id, title, author, body_text, chunkIndex, chunkTotal, knownCharacters, illustrationsNearby,
) {
  const chunkNote =
    chunkIndex != null && chunkTotal > 1
      ? `\nNOTE: chunk ${chunkIndex + 1} of ${chunkTotal}. Extract only this chunk; stable character ids. Respect ## Chapter N headers — scenes in this chunk must use matching chapter numbers.\n`
      : "";
  const knownNote = formatKnownCharacters(knownCharacters);
  const illustrationNote = formatIllustrationsNearby(illustrationsNearby);
  return `book_id = ${JSON.stringify(book_id)}; title = ${JSON.stringify(title)}; author = ${JSON.stringify(author)}.${chunkNote}${knownNote}${illustrationNote}\n\nBOOK TEXT START\n${body_text}\nBOOK TEXT END\n`;
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

// Ollama's OpenAI-compat endpoint doesn't expose num_ctx, and its default
// (4096) is smaller than our chunk + prompt + JSON output easily needs — use
// the native API so we can size the context window to the model's real limit.
const OLLAMA_NUM_CTX = 16384;
// NOTE: deliberately no num_predict cap. A 6000-token cap was tried here to
// guard against a suspected repetition-loop hang, but real dense chunks
// legitimately need more than that — the cap was silently truncating valid
// output mid-JSON-string (parseModelJson then throws "Unterminated string"),
// which looked identical to a hang from the outside (endless retries on the
// same chunk). The original "hang" this was meant to fix turned out to be
// ordinary slow generation (confirmed via Ollama's own token-by-token log
// ticking up steadily, never stalling) — not a runaway loop — so there's
// nothing here that actually needs bounding.
// Measured ~83s for a synthetic 5k-token prompt on a local 14B model, but real
// dialogue-dense chunks generate far more output tokens and blew past 280s.
// Local inference has no rate limit to race against, so give it lots of room.
// Bumped further after concurrency=5 runs showed requests getting cut off
// well before 600s — GPU contention across concurrent chapters slows each
// individual generation down, not just queues them.
const OLLAMA_TIMEOUT_MS = 1_200_000;

async function ollamaExtract({ providerId, baseUrl, model, systemPrompt, userText }) {
  const res = await fetchWithTimeout(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userText },
        ],
        format: "json",
        stream: false,
        options: { temperature: 0.2, num_ctx: OLLAMA_NUM_CTX },
      }),
    },
    OLLAMA_TIMEOUT_MS,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${providerId}: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = data?.message?.content;
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

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// An explicit provider choice (vs "auto") is a hard pin: never fall through
// to other providers/APIs, even on failure. Since there's no fallback to
// absorb a transient hiccup, retry the pinned provider itself a few times
// with backoff before giving up.
const PINNED_RETRY_ATTEMPTS = 3;
const PINNED_RETRY_BACKOFF_MS = 5_000;

async function callProvider(pid, { cfg, env, systemPrompt, userText }) {
  if (pid === "cloudflare") {
    return cloudflareExtract({
      accountId: cfg.cloudflare_account,
      token: cfg.cloudflare_token,
      model: env.CLOUDFLARE_EXTRACT_MODEL || PROVIDER_MODELS.cloudflare,
      systemPrompt,
      userText,
    });
  }
  if (pid === "gemini") {
    return openAICompatibleExtract({
      providerId: "gemini",
      baseUrl: PROVIDER_URLS.gemini,
      apiKey: cfg.gemini,
      model: env.GEMINI_MODEL || PROVIDER_MODELS.gemini,
      systemPrompt,
      userText,
    });
  }
  if (pid === "ollama-7b" || pid === "ollama-14b") {
    const base = (env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
    const modelEnvKey = pid === "ollama-7b" ? "OLLAMA_MODEL_7B" : "OLLAMA_MODEL_14B";
    return ollamaExtract({
      providerId: pid,
      baseUrl: base,
      model: env[modelEnvKey] || PROVIDER_MODELS[pid],
      systemPrompt,
      userText,
    });
  }
  return openAICompatibleExtract({
    providerId: pid,
    baseUrl: PROVIDER_URLS[pid],
    apiKey: cfg[pid],
    model: env[`${pid.toUpperCase()}_EXTRACT_MODEL`] || PROVIDER_MODELS[pid],
    systemPrompt,
    userText,
  });
}

export async function freemiumExtract(userText, { systemPrompt, preferProvider, env }) {
  const cfg = keysFromEnv(env);
  const pinned = Boolean(preferProvider);
  const chain = pinned ? [preferProvider] : await resolvedExtractProviders(env, null);
  const failures = [];
  for (const pid of chain) {
    const attempts = pinned ? PINNED_RETRY_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await callProvider(pid, {
          cfg, env, systemPrompt, userText,
        });
      } catch (e) {
        const willRetry = attempt < attempts;
        console.warn("freemium extract", pid, willRetry ? `retry ${attempt}/${attempts - 1}` : "giving up", e.message || e);
        failures.push(e);
        if (willRetry) await sleep(PINNED_RETRY_BACKOFF_MS * attempt);
      }
    }
  }
  const err = new Error(
    `freemium_extract: all providers failed (${failures.length}) — ${
      failures.slice(0, 3).map((e) => e.message || e).join(" | ")
    }`,
  );
  // Distinguishes "every provider is rate-limited/out of quota right now"
  // (checkpointable — stop and let the user resume later) from a genuine bug
  // (infra error, R2 failure, etc. — worth the existing retry-the-whole-job path).
  err.providerExhausted = true;
  throw err;
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
  const maxChars = MAX_CHUNK_TOKENS * 4;
  const chapterChunks = chunkTextByChapters(body_text, maxChars);
  const chunks = chapterChunks?.length ? chapterChunks : chunkText(body_text);
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

/** Extracts one chapter's chunks (sequentially, since sub-chunks of a chapter
 * build on each other's known-character seed) and returns the raw merged
 * chapterAnalysis — everything freemiumExtractBookByChapter used to do
 * inline, before onChapterComplete fired. Shared by the sequential and
 * parallel scheduling paths so neither duplicates the chunk-extraction logic.
 */
async function extractChapterRaw({
  book_id, title, author, chapterChunks, chunkOffset, totalChunks,
  env, preferProvider, knownCharactersSnapshot, illustrationsNearby,
  onProgress, chapterOfTotal, totalChapters,
}) {
  const system = buildSystemPrompt();
  let pin = preferProvider;
  let usedModel = "";
  const chapterKnown = [...knownCharactersSnapshot];
  const partials = [];
  let chunksDone = chunkOffset;

  for (const chunk of chapterChunks) {
    chunksDone += 1;
    if (onProgress) {
      onProgress({
        chapterPos: chunk.chapterPos,
        chapterIndex: chunk.chapterIndex,
        chapterTitle: chunk.chapterTitle,
        chapterOfTotal,
        totalChapters,
        chunk: chunksDone,
        totalChunks,
        provider: pin,
      });
    }
    const user = buildUserPrompt(
      book_id, title, author, chunk.text, chunksDone - 1, totalChunks, chapterKnown, illustrationsNearby,
    );
    const result = await freemiumExtract(user, { systemPrompt: system, preferProvider: pin, env });
    if (!pin) {
      pin = result.provider;
      usedModel = result.model;
    } else if (!usedModel) usedModel = result.model;
    partials.push(result.data);

    const knownIds = new Set(chapterKnown.map((c) => c.id));
    for (const c of result.data?.characters || []) {
      if (c.id && !knownIds.has(c.id)) {
        knownIds.add(c.id);
        chapterKnown.push(c);
      }
    }
  }

  const chapterAnalysis = mergeAnalysisDicts(partials);
  chapterAnalysis.chapterIndex = chapterChunks[0].chapterIndex;
  chapterAnalysis.chapterTitle = chapterChunks[0].chapterTitle;
  return {
    chapterAnalysis, provider: pin, model: usedModel, chunksDoneAfter: chunksDone,
  };
}

/**
 * Chapter-checkpointed book extract: chunks are strictly 1:1 (or N:1 when a
 * chapter must split) with source chapters — never mixing two chapters into
 * one chunk — and `onChapterComplete` fires after each chapter's chunks are
 * extracted and merged, so the caller can persist a checkpoint immediately
 * instead of only getting a result after the whole book succeeds.
 *
 * `startChapterPos` (0-based position in the `chapters` array, NOT the
 * semantic chapter number) skips chapters already checkpointed by a prior
 * run — used for resume. If a chapter's provider chain is exhausted, this
 * throws (same as freemiumExtract) — the caller decides whether that's a
 * hard failure or a "stop here, partial book is fine" checkpoint boundary.
 *
 * `concurrency` (default 1, fully sequential — identical to the original
 * one-chapter-at-a-time behavior) lets up to N chapters extract at once via
 * a bounded producer/ordered-consumer scheduler (see ordered-drain.js).
 * Concurrent chapters can't fully see each other's freshly-introduced
 * characters at dispatch time (the "known characters" hint is best-effort,
 * snapshotted when each chapter's extraction starts), so every chapter's raw
 * result is passed through reconcileChapterCharacters immediately before
 * onChapterComplete fires — using both already-drained knownCharacters and
 * any concurrently-finished-but-undrained chapters sitting in the
 * scheduler's look-ahead buffer — to fix up placeholder character ids
 * ("unnamed male protagonist") against the real name established elsewhere.
 */
export async function freemiumExtractBookByChapter(
  { book_id, title, author, chapters },
  {
    env, preferProvider, startChapterPos = 0, onChapterComplete, onProgress,
    getKnownCharacters, getChapterIllustrations, concurrency = 1,
  },
) {
  const maxChars = MAX_CHUNK_TOKENS * 4;
  const allChunks = chunkChaptersStrict(chapters, maxChars);
  if (!allChunks.length) throw new Error("empty book text");

  const byChapter = new Map();
  for (const chunk of allChunks) {
    if (!byChapter.has(chunk.chapterPos)) byChapter.set(chunk.chapterPos, []);
    byChapter.get(chunk.chapterPos).push(chunk);
  }
  const allPositions = [...byChapter.keys()].sort((a, b) => a - b);
  const chapterPositions = allPositions.filter((p) => p >= startChapterPos);
  const totalChapters = allPositions.length;
  const totalChunks = allChunks.length;

  let pin = preferProvider;
  let usedModel = "";

  if (concurrency <= 1) {
    let chunksDone = allPositions
      .filter((p) => p < startChapterPos)
      .reduce((n, p) => n + byChapter.get(p).length, 0);

    for (const chapterPos of chapterPositions) {
      const chapterChunks = byChapter.get(chapterPos);
      const chapterKnown = getKnownCharacters ? [...getKnownCharacters()] : [];
      const chapterIllustrations = getChapterIllustrations ? getChapterIllustrations(chapterPos) : null;
      const {
        chapterAnalysis, provider, model, chunksDoneAfter,
      } = await extractChapterRaw({
        book_id,
        title,
        author,
        chapterChunks,
        chunkOffset: chunksDone,
        totalChunks,
        env,
        preferProvider: pin,
        knownCharactersSnapshot: chapterKnown,
        illustrationsNearby: chapterIllustrations,
        onProgress,
        chapterOfTotal: allPositions.indexOf(chapterPos) + 1,
        totalChapters,
      });
      chunksDone = chunksDoneAfter;
      pin = provider;
      if (!usedModel) usedModel = model;
      if (onChapterComplete) {
        await onChapterComplete(chapterPos, chapterAnalysis, { provider: pin, model: usedModel });
      }
    }

    return { provider: pin || "unknown", model: usedModel, totalChapters };
  }

  // Parallel path: bounded-concurrency producers, strictly chapter-ordered
  // consumer — see runOrderedDrain and reconcileChapterCharacters above.
  const lookaheadBuffer = new Map(); // chapterPos -> raw chapterAnalysis (finished, not yet drained)

  await runOrderedDrain(chapterPositions, {
    concurrency,
    produce: async (chapterPos) => {
      const cached = await getRawChapterExtract(env, book_id, chapterPos);
      if (cached) {
        console.warn("freemium extract", "chapter", chapterPos, "resumed from raw cache — skipping re-extraction");
        if (!pin) pin = cached.provider;
        if (!usedModel) usedModel = cached.model;
        lookaheadBuffer.set(chapterPos, cached.chapterAnalysis);
        return cached;
      }

      const chapterChunks = byChapter.get(chapterPos);
      const chapterKnown = getKnownCharacters ? [...getKnownCharacters()] : [];
      const chapterIllustrations = getChapterIllustrations ? getChapterIllustrations(chapterPos) : null;
      const { chapterAnalysis, provider, model } = await extractChapterRaw({
        book_id,
        title,
        author,
        chapterChunks,
        chunkOffset: 0,
        totalChunks,
        env,
        preferProvider: pin,
        knownCharactersSnapshot: chapterKnown,
        illustrationsNearby: chapterIllustrations,
        onProgress,
        chapterOfTotal: allPositions.indexOf(chapterPos) + 1,
        totalChapters,
      });
      if (!pin) pin = provider;
      if (!usedModel) usedModel = model;
      lookaheadBuffer.set(chapterPos, chapterAnalysis);
      const produced = { chapterAnalysis, provider, model };
      // Durable the moment this chapter's own (slow, expensive) LLM work is
      // done — independent of whether it's this chapter's turn to drain yet.
      // A crash while an earlier chapter is still churning no longer throws
      // this away; resume finds it here and skips straight to reconciliation.
      await putRawChapterExtract(env, book_id, chapterPos, produced);
      return produced;
    },
    consume: async (chapterPos, produced) => {
      lookaheadBuffer.delete(chapterPos);
      const knownCharacters = getKnownCharacters ? getKnownCharacters() : [];
      const lookaheadCharacters = [...lookaheadBuffer.values()].flatMap((a) => a.characters || []);
      const reconciled = reconcileChapterCharacters(produced.chapterAnalysis, {
        knownCharacters,
        lookaheadCharacters,
      });
      if (onChapterComplete) {
        await onChapterComplete(chapterPos, reconciled, {
          provider: produced.provider || pin,
          model: produced.model || usedModel,
        });
      }
      // Now durably checkpointed in compiled form — the raw cache has served
      // its purpose for this chapter.
      await deleteRawChapterExtract(env, book_id, chapterPos);
    },
  });

  return { provider: pin || "unknown", model: usedModel, totalChapters };
}
