/** Shared mega-pass prompt (mirrors server/analyze/prompt.py core). */

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
    description: "string",
  }],
  scenes: [{
    id: "scene-0001",
    chapter: 1,
    title: "string",
    location: "string",
    background_desc: "string",
    present_character_ids: ["slug"],
    lines: [{
      character_id: "slug or narrator",
      text: "verbatim",
      kind: "dialogue|narration",
      expression: "normal|whisper|yell|sad|angry",
      environment: "open|indoor|hall|cave",
      intensity: 0.5,
    }],
  }],
};
