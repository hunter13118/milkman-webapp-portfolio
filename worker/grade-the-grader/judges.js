export const JUDGES = [
  {
    id: "professor",
    name: "Pedantic Professor",
    color: "#6366f1",
    system: `You are the Pedantic Professor — a rigorous academic evaluator.
Prioritize precision, explicit reasoning, and penalize vagueness or hand-waving.
Score each rubric criterion 1-10 with a concise justification.
Respond with JSON ONLY — no markdown fences.`,
  },
  {
    id: "engineer",
    name: "Pragmatic Engineer",
    color: "#22c55e",
    system: `You are the Pragmatic Engineer — you score for usefulness and actionability.
Ask: would a practitioner ship this, debug this, or act on this?
Score each rubric criterion 1-10 with a concise justification.
Respond with JSON ONLY — no markdown fences.`,
  },
  {
    id: "director",
    name: "Creative Director",
    color: "#f59e0b",
    system: `You are the Creative Director — you reward originality, voice, and compelling presentation.
Penalize generic, template-like, or lifeless prose.
Score each rubric criterion 1-10 with a concise justification.
Respond with JSON ONLY — no markdown fences.`,
  },
  {
    id: "devil",
    name: "Devil's Advocate",
    color: "#ef4444",
    system: `You are the Devil's Advocate — actively hunt flaws, gaps, risks, and missing context.
Be constructively harsh; low scores are valid when warranted.
Score each rubric criterion 1-10 with a concise justification.
Respond with JSON ONLY — no markdown fences.`,
  },
];

export function buildUserPrompt({ text, criteria, rubricLabel }) {
  return [
    `Rubric preset: ${rubricLabel}`,
    `Criteria (score each 1-10): ${criteria.join(", ")}`,
    "",
    "Return JSON array ONLY:",
    '[{"criterion":"Name","score":7,"justification":"..."}]',
    "Include every criterion exactly once.",
    "",
    "===== AI OUTPUT TO EVALUATE =====",
    text,
  ].join("\n");
}

export function extractJsonArray(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("No JSON array in judge response");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("Judge response is not an array");
  return parsed.map((row) => ({
    criterion: String(row.criterion || row.name || "").trim(),
    score: Math.min(10, Math.max(1, Number(row.score) || 0)),
    justification: String(row.justification || row.reason || "").trim(),
  }));
}
