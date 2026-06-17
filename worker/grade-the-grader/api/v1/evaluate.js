import { geminiGenerateContent } from "../../../_shared/gemini-generate.js";
import { resolveGeminiKey } from "../../../_shared/resolve-gemini-key.js";
import { JUDGES, buildUserPrompt, extractJsonArray } from "../../judges.js";

const MODEL = "gemini-2.5-flash";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

async function callJudge(apiKey, judge, payload) {
  const reply = await geminiGenerateContent(apiKey, {
    model: MODEL,
    systemInstruction: judge.system,
    userText: buildUserPrompt(payload),
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });
  const scores = extractJsonArray(reply);
  return { judgeId: judge.id, judgeName: judge.name, color: judge.color, scores, raw: reply };
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const text = String(body.text || "").trim();
  const criteria = Array.isArray(body.criteria) ? body.criteria.map(String) : [];
  const rubricLabel = String(body.rubricLabel || "Rubric");
  if (!text || !criteria.length) {
    return json({ error: "bad_request", hint: "text and criteria required" }, 400);
  }

  const resolved = await resolveGeminiKey(request, env);
  if (resolved.error) return resolved.error;

  try {
    const payload = { text, criteria, rubricLabel };
    const results = await Promise.all(JUDGES.map((j) => callJudge(resolved.apiKey, j, payload)));
    return json({ results, _mode: resolved.mode });
  } catch (e) {
    return json({ error: "gemini_failed", detail: String(e).slice(0, 300) }, 502);
  }
}
