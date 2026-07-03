/** Per-line moment illustrations (full-frame inserts) — edge port of server/images/moment_inserts.py */

import { freemiumExtract } from "./freemium-extract.js";

const EXPRESSION_PROMPTS = {
  sad: "sad wistful expression, downturned eyes, soft melancholy",
  angry: "angry fierce expression, narrowed eyes, tense jaw",
  whisper: "quiet secretive expression, softened lips, intent gaze",
  yell: "shouting intense expression, open mouth, emphatic",
  happy: "bright happy smile, lively eyes",
  surprised: "surprised wide eyes, startled expression",
};

function normalizeExpression(expr) {
  const s = String(expr || "normal").trim().toLowerCase();
  if (!s || s === "normal") return "normal";
  return s;
}

export function lineExpression(line) {
  const raw = line?.expression;
  if (raw && String(raw).trim().toLowerCase() !== "normal") {
    return normalizeExpression(raw);
  }
  return "normal";
}

export function expressionPromptSuffix(expression) {
  return EXPRESSION_PROMPTS[expression] || `${expression} facial expression`;
}

/** @returns {{ scene, lineIndex, line } | null} */
export function lineAtIndex(analysis, lineIdx) {
  let idx = 0;
  for (const scene of analysis.scenes || []) {
    for (let li = 0; li < (scene.lines || []).length; li += 1) {
      if (idx === lineIdx) {
        return { scene, lineIndex: li, line: scene.lines[li] };
      }
      idx += 1;
    }
  }
  return null;
}

export function momentDescription(analysis, scene, line, { lineIdx = -1 } = {}) {
  const custom = line?.moment_prompt || "";
  if (String(custom).trim()) return String(custom).trim();
  const byId = Object.fromEntries((analysis.characters || []).map((c) => [c.id, c]));
  const cid = line?.character_id;
  const char = byId[cid];
  const name = char?.name || (cid === "narrator" ? "Narrator" : cid);
  const expr = lineExpression(line);
  const exprBit = expr !== "normal" ? expressionPromptSuffix(expr) : "dramatic expressive moment";
  const loc = scene?.location || scene?.title || "scene";
  const text = String(line?.text || "").trim().slice(0, 200);

  const cast = (scene?.present_character_ids || [cid].filter(Boolean))
    .map((id) => {
      const c = byId[id];
      const label = c?.name || id;
      const look = c?.description ? `: ${String(c.description).slice(0, 120)}` : "";
      return `${label}${look}`;
    })
    .join("; ");

  const appearance = char?.description
    ? `Keep ${name} visually consistent — ${String(char.description).slice(0, 160)}. `
    : "";

  return (
    `${loc}. Full-screen story moment. Characters present: ${cast || name}. `
    + `${appearance}${name}, ${exprBit}. Scene: ${scene?.title || scene?.id}. `
    + `Story beat: ${text}`
  ).trim();
}

export function patchAnalysisLine(analysis, lineIdx, line) {
  const loc = lineAtIndex(analysis, lineIdx);
  if (!loc) return analysis;
  const { scene, lineIndex } = loc;
  const scenes = (analysis.scenes || []).map((s) => {
    if (s.id !== scene.id) return s;
    const newLines = [...(s.lines || [])];
    newLines[lineIndex] = line;
    return { ...s, lines: newLines };
  });
  return { ...analysis, scenes };
}

export async function tweakMomentLine(analysis, scene, line, { useLlm = false, env } = {}) {
  const updates = { visual_moment: true };
  if (!line?.moment_prompt) {
    updates.moment_prompt = momentDescription(analysis, scene, line);
  }
  let next = { ...line, ...updates };

  const disabled = String(env?.DISABLE_MOMENT_SCRIPT_TWEAK || "").toLowerCase();
  if (!useLlm || ["1", "true", "yes"].includes(disabled)) {
    return next;
  }

  try {
    const byId = Object.fromEntries((analysis.characters || []).map((c) => [c.id, c]));
    const char = byId[line.character_id];
    const system = (
      "You polish visual-audiobook moment tags. Return JSON only: "
      + '{"moment_prompt": "image gen description", "text": "optional refined line"}'
    );
    const user = (
      `Scene: ${scene.title}. Location: ${scene.location}.\n`
      + `Character: ${char?.name || line.character_id}.\n`
      + `Line (${line.kind}): ${line.text}\n`
      + `Expression: ${line.expression}\n`
      + "Write a vivid moment_prompt for a full-screen illustration (fan-service OK when "
      + "the line warrants it). Keep text identical unless a tiny clarity fix helps."
    );
    const result = await freemiumExtract(user, { systemPrompt: system, env });
    let data = result?.data || {};
    if (typeof data === "string") {
      data = JSON.parse(data.replace(/,(\s*[}\]])/g, "$1"));
    }
    if (data.moment_prompt) updates.moment_prompt = String(data.moment_prompt).trim();
    if (data.text && String(data.text).trim()) {
      const newText = String(data.text).trim();
      if (newText !== String(line.text || "").trim()) updates.text = newText;
    }
    next = { ...line, ...updates };
  } catch {
    /* LLM polish optional */
  }
  return next;
}

export function stableInsertSeed(key) {
  let h = 0;
  const s = `insert:${key}`;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2147483647;
}
