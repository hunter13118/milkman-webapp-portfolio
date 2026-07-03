/** Minimal BookAnalysis → playback JSON for the React client. */

import { assignVoices, assignVoicesIncremental, narratorVoice, poolForGender } from "./voice-assign.js";
import { expandAnalysisLineText } from "./line-chunk.js";

function gradientToken(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h % 120)) % 360;
  return `gradient:${a},${b}`;
}

function slugToName(id) {
  return String(id || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function illustrationCaption(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  return t.length > 72 ? `${t.slice(0, 72).trim()}…` : t;
}

/** Apply the playback line from media.inserts and analysis line flags. */
function applyInsertFields(lineOut, sourceLine, lineIdx, media) {
  const insertUrl = media?.inserts?.[String(lineIdx)];
  if (insertUrl && String(insertUrl).startsWith("/media/")) {
    lineOut.illustration_url = insertUrl;
    lineOut.illustration_caption = illustrationCaption(lineOut.text);
    lineOut.visual_moment = true;
  } else if (sourceLine?.visual_moment) {
    lineOut.visual_moment = true;
  }
}

export function compilePlayback(analysis, {
  art_style = "semi-real",
  narrator_gender = "male",
  media = null,
} = {}) {
  const nvoice = narratorVoice(narrator_gender);
  const voiceMap = assignVoices(analysis.characters || []);
  for (const c of analysis.characters || []) {
    if (!c.id) continue;
    const va = voiceMap[c.id];
    if (va && va.voice === nvoice) {
      const pool = poolForGender(c.gender);
      va.voice = pool.find((v) => v !== nvoice) || pool[1] || va.voice;
    }
  }

  const charactersOut = {};
  for (const c of analysis.characters || []) {
    if (!c.id) continue;
    const va = voiceMap[c.id] || { voice: nvoice, pitch: "+0Hz", rate: "+0%" };
    charactersOut[c.id] = {
      name: c.name || slugToName(c.id),
      importance: c.importance || "secondary",
      gender: c.gender || "unknown",
      sprite: `sprite:${gradientToken(c.id)}`,
      voice: va.voice,
      pitch: va.pitch || "+0Hz",
      rate: va.rate || "+0%",
      description: c.description || "",
    };
  }
  charactersOut.narrator = {
    name: "Narrator",
    importance: "primary",
    gender: narrator_gender,
    sprite: "sprite:narrator",
    voice: nvoice,
    pitch: "+0Hz",
    rate: "+0%",
    description: "",
  };

  let lineIdx = 0;
  const scenes = (analysis.scenes || []).map((scene, si) => {
    const bg = `gradient:${(si * 37) % 360},${(si * 37 + 40) % 360}`;
    const lines = [];
    for (const line of scene.lines || []) {
      const cid = line.character_id || "narrator";
      const info = charactersOut[cid] || charactersOut.narrator;
      const kind = line.kind || (cid === "narrator" ? "narration" : "dialogue");
      const parts = expandAnalysisLineText(line.text);
      for (const text of parts) {
        const idx = lineIdx++;
        const lineOut = {
          idx,
          text,
          character_id: cid,
          speaker_name: info.name,
          kind,
          voice: info.voice,
          pitch: info.pitch || "+0Hz",
          rate: info.rate || "+0%",
          expression: line.expression || "normal",
          environment: line.environment || "indoor",
          intensity: line.intensity ?? 0.5,
        };
        applyInsertFields(lineOut, line, idx, media);
        lines.push(lineOut);
      }
    }

    const present = (scene.present_character_ids || []).map((id) => {
      const info = charactersOut[id] || { name: slugToName(id), sprite: `sprite:${gradientToken(id)}` };
      return {
        character_id: id,
        name: info.name,
        sprite: info.sprite,
        importance: info.importance,
      };
    });

    return {
      id: scene.id || `scene-${String(si + 1).padStart(4, "0")}`,
      chapter: scene.chapter ?? 1,
      title: scene.title || scene.location || `Scene ${si + 1}`,
      location: scene.location || "",
      background: bg,
      present,
      lines,
    };
  });

  const out = {
    book_id: analysis.book_id,
    title: analysis.title,
    author: analysis.author || "",
    chapters: analysis.chapters || [],
    art_style,
    characters: charactersOut,
    status: "ready",
    stage: "done",
    progress: 1,
    scenes,
  };
  if (media?.inserts && Object.keys(media.inserts).length) {
    out.inserts = { ...media.inserts };
  }
  return out;
}

/**
 * Compile just one chapter's scenes into playback lines, continuing from a
 * running lineIdx and voice-assignment state instead of processing the whole
 * book roster at once. Voices are assigned incrementally (assignVoicesIncremental)
 * so a character's voice never changes once set — see voice-assign.js for the
 * accepted trade-off (no longer globally importance-sorted across the book).
 *
 * `knownCharacters` is the accumulated characters map (id -> playback char
 * info) from all prior chapters, needed to correctly resolve speaker_name /
 * sprite / importance for a character who was introduced earlier and is just
 * speaking again in this chapter.
 */
export function compileChapterPlayback(chapterAnalysis, {
  art_style = "semi-real",
  narrator_gender = "male",
  voiceState,
  knownCharacters = {},
  startingLineIdx = 0,
} = {}) {
  const nvoice = narratorVoice(narrator_gender);
  const priorAssignments = voiceState?.assignments || {};
  const { usedCounts, assignments } = assignVoicesIncremental(chapterAnalysis.characters || [], voiceState);

  // Collision-avoid only the voices newly assigned this chapter.
  for (const c of chapterAnalysis.characters || []) {
    if (!c.id || priorAssignments[c.id]) continue;
    const va = assignments[c.id];
    if (va && va.voice === nvoice) {
      const pool = poolForGender(c.gender);
      va.voice = pool.find((v) => v !== nvoice) || pool[1] || va.voice;
    }
  }

  const newCharactersOut = {};
  for (const c of chapterAnalysis.characters || []) {
    if (!c.id || priorAssignments[c.id]) continue;
    const va = assignments[c.id] || { voice: nvoice, pitch: "+0Hz", rate: "+0%" };
    newCharactersOut[c.id] = {
      name: c.name || slugToName(c.id),
      importance: c.importance || "secondary",
      gender: c.gender || "unknown",
      sprite: `sprite:${gradientToken(c.id)}`,
      // Chapter this character was first introduced in (matches scene.chapter
      // numbering) — lets the art-gen picker group characters by chapter the
      // same way it already groups backgrounds (artMediaItems.js).
      chapter: chapterAnalysis.chapterIndex ?? 0,
      voice: va.voice,
      pitch: va.pitch || "+0Hz",
      rate: va.rate || "+0%",
      description: c.description || "",
    };
  }

  const charInfo = {
    ...knownCharacters,
    ...newCharactersOut,
    narrator: {
      name: "Narrator",
      importance: "primary",
      gender: narrator_gender,
      sprite: "sprite:narrator",
      voice: nvoice,
      pitch: "+0Hz",
      rate: "+0%",
      description: "",
    },
  };

  let lineIdx = startingLineIdx;
  const scenes = (chapterAnalysis.scenes || []).map((scene, si) => {
    const bg = `gradient:${(si * 37) % 360},${(si * 37 + 40) % 360}`;
    const lines = [];
    for (const line of scene.lines || []) {
      const cid = line.character_id || "narrator";
      const info = charInfo[cid] || charInfo.narrator;
      const kind = line.kind || (cid === "narrator" ? "narration" : "dialogue");
      const parts = expandAnalysisLineText(line.text);
      for (const text of parts) {
        const idx = lineIdx++;
        const lineOut = {
          idx,
          text,
          character_id: cid,
          speaker_name: info.name,
          kind,
          voice: info.voice,
          pitch: info.pitch || "+0Hz",
          rate: info.rate || "+0%",
          expression: line.expression || "normal",
          environment: line.environment || "indoor",
          intensity: line.intensity ?? 0.5,
        };
        applyInsertFields(lineOut, line, idx, null);
        lines.push(lineOut);
      }
    }

    const present = (scene.present_character_ids || []).map((id) => {
      const info = charInfo[id] || { name: slugToName(id), sprite: `sprite:${gradientToken(id)}` };
      return {
        character_id: id,
        name: info.name,
        sprite: info.sprite || `sprite:${gradientToken(id)}`,
        importance: info.importance,
      };
    });

    // Unlike the legacy whole-book compilePlayback (where scene ids only ever
    // need to be unique across one single-pass extraction), this compiles ONE
    // CHAPTER at a time from an independently-extracted chunk — the model has
    // no visibility into other chapters' scene ids, and the schema hint's
    // example ("scene-0001") means it reliably reproduces the same ids for
    // every chapter, model-supplied or fallback alike. Always qualify with the
    // chapter number so ids stay globally unique across the whole book.
    const chapterTag = chapterAnalysis.chapterIndex ?? "x";
    const rawSceneId = scene.id || `scene-${String(si + 1).padStart(4, "0")}`;
    return {
      id: `ch${chapterTag}-${rawSceneId}`,
      chapter: scene.chapter ?? chapterAnalysis.chapterIndex ?? 1,
      title: scene.title || scene.location || `Scene ${si + 1}`,
      location: scene.location || "",
      background: bg,
      present,
      lines,
    };
  });

  return {
    scenes,
    newCharactersOut,
    nextLineIdx: lineIdx,
    updatedVoiceState: { usedCounts, assignments },
  };
}

/** Re-compile voices/names while keeping generated /media/ art from stored playback. */
export function harvestInsertMap(playback) {
  const inserts = { ...(playback?.inserts || {}) };
  for (const scene of playback?.scenes || []) {
    for (const line of scene.lines || []) {
      const url = line?.illustration_url;
      if (url && String(url).startsWith("/media/")) {
        inserts[String(line.idx)] = url;
      }
    }
  }
  return inserts;
}

export function applyInsertsToLines(playback) {
  const inserts = harvestInsertMap(playback);
  if (Object.keys(inserts).length) playback.inserts = inserts;
  for (const scene of playback.scenes || []) {
    for (const line of scene.lines || []) {
      const url = playback.inserts?.[String(line.idx)];
      if (url && String(url).startsWith("/media/")) {
        line.illustration_url = url;
        line.illustration_caption = line.illustration_caption || illustrationCaption(line.text);
        line.visual_moment = true;
      }
    }
  }
  return playback;
}

export function enrichPlaybackFromAnalysis(playback, analysis, { narrator_gender = "male" } = {}) {
  const inserts = harvestInsertMap(playback);
  const fresh = compilePlayback(analysis, {
    art_style: playback.art_style || "semi-real",
    narrator_gender,
    media: Object.keys(inserts).length ? { inserts } : null,
  });

  for (let si = 0; si < (fresh.scenes || []).length; si += 1) {
    const oldScene = playback.scenes?.[si];
    const newScene = fresh.scenes[si];
    if (!oldScene || !newScene) continue;
    if (String(oldScene.background || "").startsWith("/media/")) {
      newScene.background = oldScene.background;
    }
    for (const p of newScene.present || []) {
      const oldP = (oldScene.present || []).find((x) => x.character_id === p.character_id);
      if (oldP?.sprite && String(oldP.sprite).startsWith("/media/")) {
        p.sprite = oldP.sprite;
      }
    }
  }

  for (const [cid, info] of Object.entries(fresh.characters || {})) {
    const old = playback.characters?.[cid];
    if (old?.sprite && String(old.sprite).startsWith("/media/")) {
      info.sprite = old.sprite;
    }
  }

  if (Object.keys(inserts).length) {
    fresh.inserts = { ...inserts, ...(fresh.inserts || {}) };
    for (const scene of fresh.scenes || []) {
      for (const line of scene.lines || []) {
        const url = fresh.inserts[String(line.idx)];
        if (url && String(url).startsWith("/media/")) {
          line.illustration_url = url;
          line.illustration_caption = line.illustration_caption || illustrationCaption(line.text);
          line.visual_moment = true;
        }
      }
    }
  } else {
    for (const scene of fresh.scenes || []) {
      const oldScene = playback.scenes?.find((s) => s.id === scene.id);
      if (!oldScene) continue;
      for (const line of scene.lines || []) {
        const oldLine = (oldScene.lines || []).find((l) => l.idx === line.idx);
        if (!oldLine?.illustration_url) continue;
        line.illustration_url = oldLine.illustration_url;
        line.illustration_caption = oldLine.illustration_caption;
        line.visual_moment = oldLine.visual_moment ?? true;
      }
    }
  }

  return {
    ...fresh,
    status: playback.status ?? fresh.status,
    stage: playback.stage ?? fresh.stage,
    progress: playback.progress ?? fresh.progress,
    cover: playback.cover ?? fresh.cover,
    voice_overrides: playback.voice_overrides ?? fresh.voice_overrides,
    resume: playback.resume ?? fresh.resume,
  };
}
