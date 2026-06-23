/** Minimal BookAnalysis → playback JSON for the React client. */

function gradientToken(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h % 120)) % 360;
  return `gradient:${a},${b}`;
}

const NARRATOR_VOICE = "en-US-AndrewMultilingualNeural";

export function compilePlayback(analysis, { art_style = "semi-real", narrator_gender = "male" } = {}) {
  const nvoice = narrator_gender === "female"
    ? "en-US-AvaMultilingualNeural"
    : NARRATOR_VOICE;

  let lineIdx = 0;
  const scenes = (analysis.scenes || []).map((scene, si) => {
    const bg = `gradient:${(si * 37) % 360},${(si * 37 + 40) % 360}`;
    const lines = (scene.lines || []).map((line) => {
      const out = {
        idx: lineIdx++,
        text: line.text || "",
        character_id: line.character_id || "narrator",
        voice: line.character_id === "narrator" ? nvoice : nvoice,
        pitch: "+0Hz",
        expression: line.expression || "normal",
        environment: line.environment || "indoor",
        intensity: line.intensity ?? 0.5,
      };
      return out;
    });
    return {
      id: scene.id || `scene-${String(si + 1).padStart(4, "0")}`,
      title: scene.title || scene.location || `Scene ${si + 1}`,
      background: bg,
      present: (scene.present_character_ids || []).map((id) => ({
        character_id: id,
        name: id,
        sprite: `sprite:${gradientToken(id)}`,
      })),
      lines,
    };
  });

  return {
    book_id: analysis.book_id,
    title: analysis.title,
    author: analysis.author || "",
    art_style,
    status: "ready",
    stage: "done",
    progress: 1,
    scenes,
  };
}
