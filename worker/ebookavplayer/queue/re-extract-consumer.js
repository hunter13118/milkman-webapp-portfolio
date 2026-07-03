import { extractEpubText } from "../_shared/epub-text.js";
import { runBookExtractPipeline, loadStoredEpubBytes } from "../_shared/book-extract-pipeline.js";
import { putBookIndex } from "../_shared/jobs-kv.js";
import { touchIngestJob } from "../_shared/job-touch.js";
import { createKvReporter } from "../_shared/job-kv-throttle.js";
import { createPhaseLogger, PHASE } from "../_shared/phase-debug.js";

export async function handleReExtractMessage(message, env) {
  const { job_id, book_id, force_provider, prefer_provider } = message.body;
  const dbg = createPhaseLogger(env, "re-extract", job_id);
  const reporter = createKvReporter();

  async function report(patch, opts = {}) {
    await reporter.maybeReport(patch, async () => {
      await touchIngestJob(env, job_id, patch, { dbg, ...opts });
    }, opts);
  }

  try {
    await touchIngestJob(env, job_id, {
      status: "processing",
      stage: "analyzing",
      progress: 0.05,
      detail: "Loading EPUB",
    }, { eventType: "started", dbg });

    const bytes = await loadStoredEpubBytes(env, book_id);
    if (!bytes) {
      throw new Error("EPUB not found — re-upload the book to re-extract");
    }

    const maxChars = parseInt(env.VAE_EPUB_MAX_CHARS || "800000", 10) || 800000;
    const parsed = extractEpubText(bytes, { maxChars });
    const title = parsed.title || book_id;
    const author = parsed.author || "";

    await touchIngestJob(env, job_id, {
      progress: 0.15,
      detail: `Parsed ${parsed.chapters?.length || parsed.spine_parts || 0} chapters`,
    }, { dbg });

    const bookMetaRaw = await env.VAE_JOBS.get(`book:${book_id}`);
    const meta = bookMetaRaw ? JSON.parse(bookMetaRaw) : {};
    const art_style = meta.art_style || "semi-real";
    const narrator_gender = meta.narrator_gender || "male";

    dbg.log(PHASE.P2_EXTRACT, "start", { chapters: parsed.chapters?.length });
    await touchIngestJob(env, job_id, { progress: 0.2, detail: "Re-extracting script" }, { dbg });

    const { analysis, provider } = await runBookExtractPipeline(
      { book_id, title, author, body_text: parsed.body_text },
      {
        env,
        preferProvider: prefer_provider || (force_provider ? null : meta.extract_provider),
        epubChapters: parsed.chapters,
        onProgress: {
          extract: ({ chunk, total, provider: p }) => {
            report({
              progress: 0.2 + (0.55 * chunk) / Math.max(total, 1),
              detail: `Extract chunk ${chunk}/${total}${p ? ` (${p})` : ""}`,
            }, { eventType: p ? "provider" : "progress", provider: p, dbg, force: Boolean(p) }).catch(() => {});
          },
        },
      },
    );

    await env.VAE_PACKS.put(
      `books/${book_id}.analysis.json`,
      JSON.stringify(analysis, null, 2),
      { httpMetadata: { contentType: "application/json" } },
    );

    const existingRaw = await env.VAE_PACKS.get(`books/${book_id}.json`);
    const existing = existingRaw ? await existingRaw.json() : null;

    const { compilePlayback } = await import("../_shared/compile-playback.js");
    const { enrichPlaybackFromAnalysis } = await import("../_shared/compile-playback.js");

    let playback = compilePlayback(analysis, { art_style, narrator_gender });
    if (existing) {
      playback = enrichPlaybackFromAnalysis(existing, analysis, { narrator_gender });
      playback.art_style = art_style;
    }

    playback.status = "ready";
    playback.stage = "done";
    playback.progress = 1;

    await env.VAE_PACKS.put(
      `books/${book_id}.json`,
      JSON.stringify(playback, null, 2),
      { httpMetadata: { contentType: "application/json" } },
    );

    const lines = (playback.scenes || []).reduce((n, s) => n + (s.lines?.length || 0), 0);
    await putBookIndex(env, book_id, {
      book_id,
      title: playback.title || title,
      author: playback.author || author,
      status: "ready",
      stage: "done",
      progress: 1,
      scenes: playback.scenes?.length || 0,
      lines,
      art_style,
      extract_provider: provider,
      imaging_locked: false,
    });

    await dbg.flush((patch) => touchIngestJob(env, job_id, patch, { eventType: "done", dbg }), {
      status: "done",
      stage: "done",
      progress: 1,
      detail: `Re-extract complete (${provider})`,
      book_id,
      extract_provider: provider,
    });
    message.ack();
  } catch (e) {
    console.error("re-extract consumer", job_id, e);
    await touchIngestJob(env, job_id, {
      status: "error",
      stage: "error",
      progress: 0,
      detail: String(e.message || e).slice(0, 300),
      error: String(e.message || e).slice(0, 300),
    }, { eventType: "error", dbg });
    await putBookIndex(env, book_id, {
      book_id,
      status: "ready",
      stage: "done",
      imaging_locked: false,
    }).catch(() => {});
    message.retry();
  }
}
