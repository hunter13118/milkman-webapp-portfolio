/** Push ingest job lifecycle events to the per-job JobEventHub DO. */

const EVENT_FIELDS = [
  "status", "stage", "progress", "detail", "step_index", "step_total",
  "comparisons", "phase", "phase_label", "step", "progress_meta", "workers",
  "book_id", "kind", "error", "provider", "id", "debug_log", "log", "job_id",
];

function pickEventFields(obj = {}) {
  const out = {};
  for (const k of EVENT_FIELDS) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

export function inferEventType(patch, prev = {}) {
  if (patch.status === "queued" || patch.stage === "queued") return "queued";
  if (patch.status === "error" || patch.stage === "error") return "error";
  if (patch.status === "done" || patch.stage === "done") return "done";
  if (patch.comparisons != null && patch.comparisons !== prev.comparisons) return "comparison";
  if (patch.detail && / via |Trying /i.test(String(patch.detail))) return "provider";
  if (patch.status === "processing" && prev.status === "queued") return "started";
  if (patch.status === "processing" && prev.status !== "processing" && prev.status) return "started";
  return "progress";
}

export function jobToEvent(job, type = "snapshot") {
  return {
    type,
    ts: Date.now(),
    ...pickEventFields(job),
  };
}

/** POST event to DO; no-op when JOB_EVENTS binding is absent. */
export async function emitJobEvent(env, jobId, event) {
  if (!env?.JOB_EVENTS || !jobId) return;
  const id = env.JOB_EVENTS.idFromName(String(jobId));
  const stub = env.JOB_EVENTS.get(id);
  const payload = { ts: Date.now(), ...event };
  if (!payload.type) payload.type = "progress";
  try {
    await stub.fetch(new Request("https://job-events/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
  } catch (e) {
    console.error("emitJobEvent", jobId, e?.message || e);
  }
}

export { pickEventFields };
