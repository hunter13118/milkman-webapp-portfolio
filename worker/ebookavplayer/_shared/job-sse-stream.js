/** SSE fan-out: DO push events; KV read only as idle fallback (no periodic poll). */

import { getJob } from "./jobs-kv.js";
import { jobToEvent } from "./job-events.js";

/** Only re-read KV once when the DO stream ends (no periodic poll). */
const IDLE_KV_FALLBACK_MS = 45_000;

const WATCH_KEYS = [
  "status", "stage", "progress", "detail", "step_index", "step_total",
  "phase", "phase_label", "step", "error", "book_id",
];

function jobFingerprint(job = {}) {
  const dbg = job.debug_log || [];
  const dbgTail = dbg.length ? `${dbg.length}:${dbg[dbg.length - 1]?.ts || ""}:${dbg[dbg.length - 1]?.msg || ""}` : "0";
  const parts = WATCH_KEYS.map((k) => JSON.stringify(job[k] ?? null));
  parts.push(dbgTail);
  return parts.join("|");
}

/**
 * Multiplex initial snapshot + DO SSE body into one SSE stream.
 * KV is read at connect and only again after IDLE_KV_FALLBACK_MS without DO traffic.
 */
export function multiplexJobEventStream({ env, jobId, initialJob, doBody, requestSignal }) {
  const enc = new TextEncoder();
  let lastFp = jobFingerprint(initialJob);
  let lastDoTrafficAt = Date.now();
  let closed = false;
  let abortOnSignal;

  const enqueue = (controller, event) => {
    if (closed) return;
    try {
      controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
    } catch {
      closed = true;
    }
  };

  const pumpKvIfIdle = async (controller) => {
    if (closed || !env?.VAE_JOBS) return;
    if (Date.now() - lastDoTrafficAt < IDLE_KV_FALLBACK_MS) return;
    try {
      const job = await getJob(env, "ingest", jobId);
      if (!job || closed) return;
      lastDoTrafficAt = Date.now();
      const fp = jobFingerprint(job);
      if (fp === lastFp) return;
      lastFp = fp;
      enqueue(controller, jobToEvent(job, "snapshot"));
    } catch {
      /* ignore transient KV errors */
    }
  };

  const noteDoTraffic = (event) => {
    lastDoTrafficAt = Date.now();
    if (event && typeof event === "object") lastFp = jobFingerprint(event);
  };

  return new ReadableStream({
    start(controller) {
      enqueue(controller, jobToEvent(initialJob, "snapshot"));

      if (requestSignal) {
        abortOnSignal = () => {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
        };
        if (requestSignal.aborted) abortOnSignal();
        else requestSignal.addEventListener("abort", abortOnSignal, { once: true });
      }

      if (!doBody) return;

      (async () => {
        const reader = doBody.getReader();
        const dec = new TextDecoder();
        let buf = "";
        try {
          while (!closed) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              lastDoTrafficAt = Date.now();
              controller.enqueue(value);
              buf += dec.decode(value, { stream: true });
              const lines = buf.split("\n");
              buf = lines.pop() || "";
              for (const line of lines) {
                if (line.startsWith(": ping")) {
                  lastDoTrafficAt = Date.now();
                  continue;
                }
                if (!line.startsWith("data: ")) continue;
                try {
                  noteDoTraffic(JSON.parse(line.slice(6)));
                } catch { /* ignore */ }
              }
            }
          }
        } catch {
          /* DO stream ended */
        } finally {
          if (!closed) await pumpKvIfIdle(controller);
        }
      })();
    },
    cancel() {
      closed = true;
      if (abortOnSignal && requestSignal) {
        requestSignal.removeEventListener("abort", abortOnSignal);
      }
    },
  });
}

export { jobFingerprint, IDLE_KV_FALLBACK_MS };
