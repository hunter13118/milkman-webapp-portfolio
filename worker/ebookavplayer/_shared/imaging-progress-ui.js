/** Progress bar math shared by worker tests and web UI. */

export function waitingOnProvider(detail) {
  return / via |Trying /i.test(String(detail || ""));
}

/**
 * @param {object} st job/catalog status snapshot
 * @param {{ lastProgress?: number, startedAt?: number }} opts
 */
export function computeImagingProgress(st, { lastProgress = 0, startedAt = Date.now() } = {}) {
  const IMAGING_START = 0.08;

  if (st?.status === "done") return 1;

  let server = typeof st?.progress === "number" ? st.progress : 0;
  const detail = st?.detail || "";
  const providerWait = waitingOnProvider(detail);

  if (!providerWait && st?.step_index != null && st?.step_total != null && st.step_total > 0) {
    server = Math.max(server, st.step_index / st.step_total);
  }

  if (st?.status !== "done") {
    server = Math.min(server, 0.99);
  }

  if (st?.status === "processing" && providerWait) {
    const elapsed = Date.now() - (startedAt || Date.now());
    const timeCreep = Math.min(0.12, (elapsed / 120_000) * 0.12);
    const cap = Math.min(0.88, server + 0.08 + timeCreep);
    return Math.max(lastProgress, server, Math.min(cap, lastProgress + 0.008));
  }

  if (st?.status === "queued") {
    const elapsed = Date.now() - (startedAt || Date.now());
    const timeFloor = Math.min(0.25, IMAGING_START + (elapsed / 90000) * 0.15);
    return Math.max(lastProgress, IMAGING_START, timeFloor, server, 0.04);
  }

  return Math.max(lastProgress, IMAGING_START, server);
}
