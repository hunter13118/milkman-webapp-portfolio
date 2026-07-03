/** Ingest progress budget — maps pipeline sub-steps to 0..1 for UI + debug. */

export const PHASE_LABELS = {
  queued: "Queued",
  parsing: "Reading EPUB",
  extracting: "Extracting script",
  repair: "Repairing speech tags",
  attributing: "Attributing dialogue",
  compiling: "Building playback",
  imaging: "Generating art",
  done: "Ready",
};

/** Legacy stage names used by catalog / player. */
export function stageForPhase(phase) {
  if (phase === "extracting") return "analyzing";
  if (phase === "repair" || phase === "attributing" || phase === "compiling") return "analyzing";
  if (phase === "imaging") return "imaging";
  if (phase === "parsing") return "parsing";
  if (phase === "done") return "done";
  if (phase === "queued") return "queued";
  return phase;
}

export function statusForPhase(phase) {
  if (phase === "done") return "done";
  if (phase === "queued") return "queued";
  if (phase === "parsing") return "parsing";
  if (phase === "imaging") return "imaging";
  return "processing";
}

/**
 * @param {{ wantArt?: boolean }} opts
 */
export function createIngestProgress({ wantArt = true } = {}) {
  const w = wantArt
    ? { parse: 0.07, extract: 0.33, repair: 0.02, attribute: 0.10, compile: 0.03, imaging: 0.45 }
    : { parse: 0.10, extract: 0.48, repair: 0.04, attribute: 0.30, compile: 0.08, imaging: 0 };

  const cum = {
    parsing: [0, w.parse],
    extracting: [w.parse, w.parse + w.extract],
    repair: [w.parse + w.extract, w.parse + w.extract + w.repair],
    attributing: [
      w.parse + w.extract + w.repair,
      w.parse + w.extract + w.repair + w.attribute,
    ],
    compiling: [
      w.parse + w.extract + w.repair + w.attribute,
      w.parse + w.extract + w.repair + w.attribute + w.compile,
    ],
    imaging: wantArt
      ? [w.parse + w.extract + w.repair + w.attribute + w.compile, 1]
      : [1, 1],
    done: [1, 1],
  };

  return {
    weights: w,
    at(phase, t, meta = {}) {
      const [lo, hi] = cum[phase] || [0, 1];
      const progress = Math.min(1, Math.max(0, lo + (hi - lo) * Math.min(1, Math.max(0, t))));
      const phaseLabel = PHASE_LABELS[phase] || phase;
      const detail = meta.detail || "";
      const step = meta.step || null;
      const stepIndex = meta.stepIndex ?? null;
      const stepTotal = meta.stepTotal ?? null;
      const workers = meta.workers || null;

      return {
        progress,
        phase,
        phase_label: phaseLabel,
        stage: stageForPhase(phase),
        status: statusForPhase(phase),
        detail,
        step,
        step_index: stepIndex,
        step_total: stepTotal,
        workers,
        progress_meta: {
          phase,
          phase_label: phaseLabel,
          step,
          step_index: stepIndex,
          step_total: stepTotal,
          sub: meta.sub || null,
          workers,
        },
      };
    },
  };
}

/** Clamp catalog progress to 0..1 and repair obvious imaging stuck states. */
export function normalizeBookProgress(meta = {}) {
  const out = { ...meta };
  if (typeof out.progress === "number") {
    out.progress = Math.min(1, Math.max(0, out.progress));
  }
  const active = Boolean(out.imaging_locked || out.active_job_id);
  if (!active && out.stage === "imaging" && (out.progress ?? 0) >= 0.99) {
    out.stage = "done";
    out.status = out.status === "error" ? out.status : "ready";
    out.progress = 1;
    out.imaging_locked = false;
    out.active_job_id = null;
  }
  if (!active && (out.progress ?? 0) >= 0.99 && out.status === "processing") {
    out.status = "ready";
    out.stage = out.stage === "imaging" ? "done" : (out.stage || "done");
  }
  return out;
}

/** Estimate imaging steps for progress denominator. */
export function countImagingSteps(analysis, env, { filter } = {}) {
  return import("./generic-sprites.js").then(({ planCharacterImaging }) => {
    const { toGenerate, fromStock } = planCharacterImaging(analysis, env);
    const scenes = analysis?.scenes || [];

    const wantChar = (id) => {
      if (!filter || filter.scope === "all") return true;
      if (filter.scope === "characters") return true;
      if (filter.scope === "selected") return (filter.character_ids || []).includes(id);
      return false;
    };
    const wantBg = (sid) => {
      if (!filter || filter.scope === "all") return true;
      if (filter.scope === "backgrounds") return true;
      if (filter.scope === "selected") return (filter.scene_ids || []).includes(sid);
      return false;
    };

    const chars = filter && filter.scope !== "all" && filter.scope !== "characters"
      ? toGenerate.filter((c) => wantChar(c.id))
      : filter?.scope === "characters" || !filter
        ? toGenerate
        : toGenerate.filter((c) => wantChar(c.id));

    const stock = filter && filter.scope !== "all"
      ? fromStock.filter((c) => wantChar(c.id))
      : fromStock;

    const bgs = filter && filter.scope !== "all" && filter.scope !== "backgrounds"
      ? scenes.filter((s) => wantBg(s.id || ""))
      : scenes;

    const wantCover = !filter
      || filter.scope === "all"
      || (filter.scope === "selected" && filter.include_cover);
    const cover = wantCover ? 1 : 0;

    return {
      stock: stock.length,
      characters: chars.length,
      backgrounds: bgs.length,
      cover,
      total: stock.length + chars.length + bgs.length + cover,
    };
  });
}
