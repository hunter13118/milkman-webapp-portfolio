/** Structured phase logging for edge pipeline (console + optional KV job log). */

export const PHASE = {
  P1_PARSE: "P1_PARSE",
  P2_EXTRACT: "P2_EXTRACT",
  P3_IMAGES: "P3_IMAGES",
  P4_PACK: "P4_PACK",
};

const MAX_LOG = 80;

export function debugEnabled(env) {
  return String(env.VAE_DEBUG ?? "true").toLowerCase() !== "false";
}

/** @returns {{ log(phase, msg, data?), flush(patch?) }} */
export function createPhaseLogger(env, scope, jobId) {
  const entries = [];
  const prefix = `[VAE:${scope}] job=${jobId}`;

  function log(phase, msg, data = null) {
    const row = {
      ts: new Date().toISOString(),
      phase,
      msg,
      ...(data && typeof data === "object" ? { data } : {}),
    };
    entries.push(row);
    if (debugEnabled(env)) {
      const extra = data ? ` ${JSON.stringify(data).slice(0, 400)}` : "";
      console.log(`${prefix} ${phase} ${msg}${extra}`);
    }
  }

  async function flush(updateFn, patch = {}) {
    const tail = entries.slice(-MAX_LOG);
    if (typeof updateFn === "function") {
      await updateFn({ ...patch, debug_log: tail, log: tail.map((e) => `[${e.phase}] ${e.msg}`) });
    }
    return tail;
  }

  return { log, flush, entries };
}
