/**
 * Scene-scoped LLM pass to fix dialogue character_id — opt-in, ambiguous scenes only.
 */
import { freemiumExtract } from "./freemium-extract.js";
import { repairAnalysis } from "./dialogue-repair.js";
import { isPlainSpeechTagLine } from "./dialogue-repair.js";
import { attributeAnalysis as attributeDeterministic } from "./dialogue-attribute.js";

const ATTR_SYSTEM = `You assign character_id on dialogue lines in visual audiobook scripts.

Rules:
- Only change kind=dialogue lines. Never rewrite text.
- Use present_character_ids, character briefs, adjacent narration (speech tags), turn-taking, and sentence content.
- Speech tags in narration refer to the PREVIOUS dialogue line's speaker.
- Self-identification in dialogue overrides turn order.
- Output JSON only:
  { "scenes": [ { "scene_id": "id", "assignments": [ { "idx": number, "character_id": "slug" } ] } ] }
- One entry per input scene. Include assignments only for dialogue lines you change or all dialogue lines.`;

function isDialogueLine(ln) {
  return ln?.kind === "dialogue" || (!ln?.kind && ln?.character_id !== "narrator");
}

function sceneHasMultiSpeakerDialogue(scene) {
  const present = (scene.present_character_ids || []).filter((id) => id && id !== "narrator");
  if (present.length < 2) return false;
  return (scene.lines || []).filter(isDialogueLine).length >= 2;
}

/** True when deterministic attribution likely left errors worth an LLM call. */
export function sceneNeedsAmbiguousLLM(scene) {
  if (!sceneHasMultiSpeakerDialogue(scene)) return false;

  const lines = scene.lines || [];
  const dialogueLines = lines.filter(isDialogueLine);

  if (dialogueLines.some((ln) => ln.character_id === "narrator")) return true;

  const speakers = new Set(
    dialogueLines.map((ln) => ln.character_id).filter((id) => id && id !== "narrator"),
  );
  if (speakers.size === 1) return true;

  let consecutive = 0;
  for (const ln of lines) {
    if (isDialogueLine(ln)) {
      consecutive += 1;
      if (consecutive >= 3) return true;
      continue;
    }
    if (isPlainSpeechTagLine(ln)) {
      consecutive = 0;
      continue;
    }
    consecutive = 0;
  }

  for (let i = 1; i < lines.length; i += 1) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (!isDialogueLine(prev) || !isDialogueLine(cur)) continue;
    if (prev.character_id === cur.character_id) return true;
  }

  return false;
}

function buildCharacterBriefs(characters, presentIds) {
  const byId = new Map((characters || []).map((c) => [c.id, c]));
  return presentIds
    .filter((id) => id !== "narrator")
    .map((id) => {
      const c = byId.get(id) || { id, name: id };
      return {
        id: c.id,
        name: c.name || c.id,
        gender: c.gender || "unknown",
        description: (c.description || "").slice(0, 200),
      };
    });
}

function buildScenePayload(scene, characters) {
  const present = scene.present_character_ids?.length
    ? scene.present_character_ids
    : (characters || []).map((c) => c.id).filter(Boolean);

  return {
    scene_id: scene.id,
    title: scene.title,
    location: scene.location,
    present_character_ids: present,
    characters: buildCharacterBriefs(characters, present),
    lines: (scene.lines || []).map((ln) => ({
      idx: ln.idx,
      character_id: ln.character_id,
      kind: ln.kind || (ln.character_id === "narrator" ? "narration" : "dialogue"),
      text: ln.text,
    })),
  };
}

function applyAssignments(scene, assignments) {
  if (!assignments?.length) return scene;
  const byIdx = new Map(assignments.map((a) => [a.idx, a.character_id]));
  const lines = (scene.lines || []).map((ln) => {
    const cid = byIdx.get(ln.idx);
    if (!cid) return ln;
    if (ln.kind === "narration") return ln;
    if (isDialogueLine(ln)) return { ...ln, character_id: cid, kind: "dialogue" };
    return ln;
  });
  return { ...scene, lines };
}

function parseBatchResult(data, batch) {
  if (data.scenes?.length) {
    return data.scenes.map((row) => ({
      sceneId: row.scene_id,
      assignments: row.assignments || row.lines || [],
    }));
  }
  if (data.assignments || data.lines) {
    return [{ sceneId: batch[0]?.scene?.id, assignments: data.assignments || data.lines }];
  }
  return [];
}

async function attributeScenesBatch(batch, characters, { env, preferProvider }) {
  const payload = { scenes: batch.map(({ scene }) => buildScenePayload(scene, characters)) };
  const user = `Assign character_id for dialogue in these scenes.\n\n${JSON.stringify(payload, null, 2)}`;
  const result = await freemiumExtract(user, {
    systemPrompt: ATTR_SYSTEM,
    preferProvider,
    env,
  });
  return parseBatchResult(result.data || {}, batch);
}

function attrEnabled(env) {
  return String(env.VAE_ATTR_LLM ?? "false").toLowerCase() === "true";
}

export function isAttrLlmEnabled(env) {
  return attrEnabled(env);
}

function attrMaxScenes(env) {
  const n = parseInt(env.VAE_ATTR_LLM_MAX_SCENES || "8", 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

function attrBatchSize(env) {
  const n = parseInt(env.VAE_ATTR_LLM_BATCH || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Optional LLM attribution — only ambiguous multi-speaker scenes, batched + capped. */
export async function attributeAnalysisLLM(analysis, { env, preferProvider, onProgress } = {}) {
  if (!attrEnabled(env)) return analysis;

  const scenes = analysis.scenes || [];
  let targets = scenes
    .map((scene, sceneIndex) => ({ scene, sceneIndex }))
    .filter(({ scene }) => sceneNeedsAmbiguousLLM(scene));

  if (!targets.length) return analysis;

  const maxScenes = attrMaxScenes(env);
  const skipped = Math.max(0, targets.length - maxScenes);
  if (skipped > 0) {
    console.warn(`attribute LLM: capping ${targets.length} scenes to ${maxScenes} (VAE_ATTR_LLM_MAX_SCENES)`);
    targets = targets.slice(0, maxScenes);
  }

  const batchSize = attrBatchSize(env);
  const batches = chunkArray(targets, batchSize);
  const newScenes = [...scenes];
  let processed = 0;

  for (let b = 0; b < batches.length; b += 1) {
    const batch = batches[b];
    try {
      const results = await attributeScenesBatch(batch, analysis.characters, { env, preferProvider });
      for (const { sceneId, assignments } of results) {
        const hit = batch.find(({ scene }) => scene.id === sceneId) || batch[0];
        if (!hit) continue;
        newScenes[hit.sceneIndex] = applyAssignments(hit.scene, assignments);
      }
      processed += batch.length;
      onProgress?.({
        sceneIndex: processed,
        sceneTotal: targets.length,
        batchIndex: b + 1,
        batchTotal: batches.length,
        sceneId: batch.map(({ scene }) => scene.id).join(", "),
        skipped,
      });
    } catch (e) {
      console.warn("attribute LLM batch", b + 1, e.message || e);
      processed += batch.length;
    }
  }

  return { ...analysis, scenes: newScenes, _attr_llm: { scenes: targets.length, batches: batches.length, skipped } };
}

export async function postProcessAnalysis(analysis, { env, preferProvider, onProgress } = {}) {
  let out = repairAnalysis(analysis);
  out = attributeDeterministic(out);
  return attributeAnalysisLLM(out, { env, preferProvider, onProgress });
}
