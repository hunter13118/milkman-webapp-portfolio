/** Throttle hot-loop KV job/book writes (ingest, regen, re-extract). */

export const REPORT_MIN_MS = 800;

export function shouldForceKvReport(patch, lastPhase = "", { force = false } = {}) {
  if (force) return true;
  const detail = String(patch.detail || "");
  const phase = patch.stage || patch.phase || "";
  const progress = patch.progress;
  if (progress === 0 || progress === 1) return true;
  if (phase && phase !== lastPhase) return true;
  if (/fail|error|complete|skipped|done/i.test(detail)) return true;
  if (/Trying |Waiting on /i.test(detail)) return true;
  return false;
}

/** @returns {{ maybeReport(patch, writeFn, opts?), reset() }} */
export function createKvReporter({ minMs = REPORT_MIN_MS } = {}) {
  let lastFlush = 0;
  let lastPhase = "";

  return {
    async maybeReport(patch, writeFn, opts = {}) {
      const force = shouldForceKvReport(patch, lastPhase, opts);
      const now = Date.now();
      if (!force && now - lastFlush < minMs) return false;
      lastFlush = now;
      lastPhase = patch.stage || patch.phase || lastPhase;
      await writeFn();
      return true;
    },
    reset() {
      lastFlush = 0;
      lastPhase = "";
    },
  };
}
