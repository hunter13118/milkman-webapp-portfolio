import { geminiGenerateContent } from "../../../_shared/gemini-generate.js";
import { resolveGeminiKey } from "../../../_shared/resolve-gemini-key.js";

const MODEL = "gemini-2.5-flash";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const resolved = await resolveGeminiKey(request, env);
  if (resolved.error) return resolved.error;

  const metric = body.metric || { name: "Metric", unit: "" };
  const leader = body.leader || { name: "Ghost" };
  const standings = Array.isArray(body.standings) ? body.standings : [];
  const userAhead = Boolean(body.userAhead);
  const standingLines = standings.map((s) => `${s.rank}. ${s.name}: ${s.score}`).join("\n");
  const prompt = [
    `Metric: ${metric.name} (${metric.unit})`,
    `Leaderboard:\n${standingLines}`,
    userAhead ? "User leads all ghosts." : `Leader: ${leader.name}.`,
    "Write 1-3 sentences in-character smack talk or hype. No markdown.",
  ].join("\n\n");

  try {
    const text = await geminiGenerateContent(resolved.apiKey, {
      model: MODEL,
      userText: prompt,
      generationConfig: { temperature: 0.9, maxOutputTokens: 180 },
    });
    return json({ text: text.trim() || "The ghosts are quiet.", _mode: resolved.mode });
  } catch (e) {
    return json({ error: "gemini_failed", detail: String(e).slice(0, 300) }, 502);
  }
}
