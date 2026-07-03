/** Shared mega-pass prompt (mirrors server/analyze/prompt.py core). */

import { EXTRACTION_RULES } from "./dialogue-rules.js";

export const SYSTEM =
  "You are a literary scene director. You convert a novel's text into a structured " +
  "'visual audiobook' script. You never invent plot; you only segment, attribute, and " +
  "describe what is already in the text. Output must be a single valid JSON object and nothing else.";

export const SCHEMA_HINT = {
  book_id: "string",
  title: "string",
  author: "string",
  characters: [{
    id: "lowercase-slug",
    name: "string",
    aliases: ["string"],
    gender: "male|female|unknown",
    importance: "primary|secondary|background",
    description: "string — detailed visual appearance for image generation",
    illustration_ref: "optional int — index into attached EPUB illustration plates",
  }],
  scenes: [{
    id: "scene-0001",
    chapter: 1,
    title: "evocative setting label e.g. Forest at Night (NOT chapter title)",
    location: "string",
    background_desc: "string",
    present_character_ids: ["slug"],
    lines: [{
      character_id: "slug or narrator",
      text: "verbatim",
      kind: "dialogue|narration|thought|delivery",
      expression: "normal|whisper|yell|sad|angry",
      environment: "open|indoor|hall|cave",
      intensity: 0.5,
      line_weight: "normal|minor",
      delivery_verb: "sang|yelled|whispered|… or null",
      illustration_ref: "optional int — EPUB plate index for this line",
    }],
  }],
};

export function buildSystemPrompt() {
  return (
    `${SYSTEM}\n\nReturn JSON exactly matching this shape:\n${JSON.stringify(SCHEMA_HINT, null, 2)}\n` +
    `${EXTRACTION_RULES}\n` +
    "Output a single valid JSON object only — no markdown, no commentary."
  );
}