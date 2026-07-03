import { putBookIndex } from "../_shared/jobs-kv.js";
import { touchIngestJob } from "../_shared/job-touch.js";
import { createPhaseLogger, PHASE } from "../_shared/phase-debug.js";
import { createIngestProgress } from "../_shared/ingest-progress.js";
import { runCheckpointedExtraction } from "../_shared/chapter-extract-pipeline.js";

async function touchBookProgress(env, bookId, patch) {
  await putBookIndex(env, bookId, patch);
}

export async function handleIngestMessage(message, env) {
  const {
    job_id, book_id, art_style, narrator_gender, dry_run, generate_art, byo_mode, illustration_mode,
    prefer_provider,
  } = message.body;
  const dbg = createPhaseLogger(env, "ingest", job_id);
  const wantArt = generate_art !== false && !dry_run && !byo_mode;
  const tracker = createIngestProgress({ wantArt });
  let lastReportFlush = 0;
  let lastReportPhase = "";

  async function report(phase, t, meta = {}) {
    const patch = tracker.at(phase, t, meta);
    const detail = String(meta.detail || "");
    const force = t === 0 || t === 1
      || phase !== lastReportPhase
      || /fail|error|complete|skipped|done/i.test(detail)
      || /Trying |Waiting on /i.test(detail);
    const now = Date.now();
    if (!force && now - lastReportFlush < 800) return patch;
    lastReportFlush = now;
    lastReportPhase = phase;
    await touchIngestJob(env, job_id, patch, { dbg });
    await touchBookProgress(env, book_id, {
      progress: patch.progress,
      stage: patch.stage,
      status: patch.status,
      phase: patch.phase,
      phase_label: patch.phase_label,
      detail: patch.detail,
      step: patch.step,
      step_index: patch.step_index,
      step_total: patch.step_total,
      workers: patch.workers,
      progress_meta: patch.progress_meta,
    });
    return patch;
  }

  try {
    const result = await runCheckpointedExtraction({
      env,
      job_id,
      book_id,
      art_style,
      narrator_gender,
      illustration_mode,
      dry_run,
      generate_art,
      byo_mode,
      prefer_provider,
      report,
      dbg,
    });

    const donePatch = tracker.at("done", 1, {
      detail: result.status === "partial"
        ? `Stalled at chapter ${result.checkpoint.next_chapter_idx}/${result.checkpoint.total_chapters}`
        : "Ready",
    });
    await dbg.flush((patch) => touchIngestJob(env, job_id, patch, { eventType: "done", dbg }), {
      ...donePatch,
      book_id,
      extract_provider: result.provider,
      imaging: result.imagingStats || null,
      status: result.status,
    });

    // Re-assert the terminal book status last. A fire-and-forget progress
    // report from the final chunk attempt can occasionally resolve after
    // runCheckpointedExtraction's own status write (report() is called
    // without awaiting inside onProgress, so its KV read-modify-write can
    // land after the stall/ready write and clobber "partial" back to
    // "processing"). This closes that race without needing to serialize
    // every progress tick.
    if (result.status === "partial") {
      await putBookIndex(env, book_id, {
        status: "partial",
        chapters_ready: result.checkpoint.chapters_done.length,
        total_chapters: result.checkpoint.total_chapters,
        active_job_id: null,
        imaging_locked: false,
      });
    }

    // A "partial" result (a chapter's provider chain fully exhausted) is a
    // deliberate stop, not a queue failure — ack so it doesn't retry-loop
    // and burn through the same exhausted quota again. The user resumes via
    // POST /books/:id/continue-extract whenever they choose.
    message.ack();
  } catch (e) {
    console.error("ingest consumer", job_id, e);
    dbg.log("ERROR", String(e.message || e).slice(0, 200));
    await dbg.flush((patch) => touchIngestJob(env, job_id, patch, { eventType: "error", dbg }), {
      status: "error",
      progress: 0,
      stage: "error",
      phase: "error",
      phase_label: "Failed",
      detail: String(e.message || e).slice(0, 300),
    });
    await putBookIndex(env, book_id, {
      book_id,
      title: book_id,
      status: "error",
      stage: "error",
      progress: 0,
      job_id,
      imaging_locked: false,
      active_job_id: null,
      error: String(e.message || e).slice(0, 200),
    }).catch(() => {});
    message.retry();
  }
}
