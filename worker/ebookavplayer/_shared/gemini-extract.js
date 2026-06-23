/**
 * Gemini mega-pass on the edge (JSON mode) — mirrors CloudPilot callGemini pattern.
 */
const DEFAULT_MODEL = "gemini-2.5-flash";

const SYSTEM = `You are a literary scene director. Convert novel text into a visual audiobook script.
Output a single valid JSON object only — no markdown. Never invent plot.`;

const SCHEMA_HINT = `{
  "book_id": "string",
  "title": "string",
  "author": "string",
  "characters": [{"id":"slug","name":"string","aliases":[],"gender":"male|female|unknown",
    "importance":"primary|secondary|background","description":"string"}],
  "scenes": [{"id":"scene-0001","chapter":1,"title":"string","location":"string",
    "background_desc":"string","present_character_ids":["slug"],
    "lines":[{"character_id":"slug or narrator","text":"verbatim","kind":"dialogue|narration",
      "expression":"normal","environment":"indoor","intensity":0.5}]}]
}`;

function stripFence(t) {
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function resolveGeminiKey(request, env) {
  const userKey = request?.headers?.get?.("X-Gemini-Key");
  if (userKey) return userKey;
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  return null;
}

export async function callGeminiExtract(apiKey, { book_id, title, author, body_text }, opts = {}) {
  const model = opts.model || opts.env?.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const user = `Schema:\n${SCHEMA_HINT}\n\nbook_id: ${book_id}\ntitle: ${title}\nauthor: ${author}\n\nTEXT:\n${body_text}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  const parsed = JSON.parse(stripFence(text));
  parsed.book_id = parsed.book_id || book_id;
  parsed.title = parsed.title || title;
  parsed.author = parsed.author || author;
  return parsed;
}
