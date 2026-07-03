/**
 * Shared per-chapter checkpointed extraction pipeline — used by both a fresh
 * ingest job (worker/queue/ingest-consumer.js) and a "continue extraction"
 * resume job (worker/queue/continue-extract-consumer.js).
 *
 * Reads any existing books/{id}/checkpoint.json, extracts remaining chapters
 * one at a time (extract -> repair -> attribute -> compile -> persist), and
 * on a chapter's provider chain being fully exhausted, stops cleanly and
 * returns { status: "partial", ... } instead of throwing — whatever chapters
 * already checkpointed stay readable via GET /books/:id. Only throws for
 * genuine bugs/infra errors (missing upload, R2 failure, etc.), which the
 * caller should treat as retryable exactly like today's whole-book path.
 *
 * Once every chapter succeeds, runs image generation exactly as the legacy
 * whole-book path did (unchanged — parallel per-chapter imaging is Phase 2,
 * deferred).
 */
import { extractEpubText } from "./epub-text.js";
import { extractEpubImages } from "./epub-images.js";
import { persistEpubImages } from "./reference-images.js";
import { loadStoredEpubBytes } from "./book-extract-pipeline.js";
import { freemiumExtractBookByChapter } from "./freemium-extract.js";
import { repairAnalysis } from "./dialogue-repair.js";
import { attributeAnalysis } from "./dialogue-attribute.js";
import { compileChapterPlayback } from "./compile-playback.js";
import {
  getCheckpoint, putCheckpoint, emptyCheckpoint, putChapterPack,
} from "./book-checkpoint.js";
import { putBookIndex } from "./jobs-kv.js";
import { runEdgeImaging } from "./edge-imaging.js";
import { countImagingSteps } from "./ingest-progress.js";
import { normalizeIllustrationMode, applyDirectIllustrations } from "./illustrations.js";
import { PHASE } from "./phase-debug.js";

async function readJsonR2(env, key) {
  const obj = await env.VAE_PACKS.get(key);
  if (!obj) return null;
  return JSON.parse(await obj.text());
}

async function writeJsonR2(env, key, data) {
  await env.VAE_PACKS.put(key, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function runCheckpointedExtraction({
  env, job_id, book_id, art_style, narrator_gender, illustration_mode,
  dry_run, generate_art, byo_mode, prefer_provider, report, dbg,
}) {
  const wantArt = generate_art !== false && !dry_run && !byo_mode;

  dbg.log(PHASE.P1_PARSE, "start");
  await report("parsing", 0, { detail: "Loading EPUB from storage" });

  const bytes = await loadStoredEpubBytes(env, book_id);
  if (!bytes) throw new Error("upload missing from R2");

  const maxChars = parseInt(env.VAE_EPUB_MAX_CHARS || "800000", 10) || 800000;
  const parsed = extractEpubText(bytes, { maxChars });
  const illusCap = parseInt(env.VAE_EPUB_MAX_IMAGES || "0", 10);
  const epubExtract = extractEpubImages(bytes, { maxImages: illusCap > 0 ? illusCap : null });
  const epubImages = epubExtract.images;
  let illustrationUrls = {};
  if (epubImages.length && env.VAE_PACKS) {
    illustrationUrls = await persistEpubImages(env, book_id, epubImages);
  }
  const title = parsed.title || book_id;
  const author = parsed.author || "";
  dbg.log(PHASE.P1_PARSE, "epub parsed", {
    title, chars: parsed.chars, chapters: parsed.chapter_count,
  });
  await report("parsing", 1, { detail: `Parsed ${parsed.chars} chars · ${parsed.chapter_count} chapters` });

  // Match each extracted plate's source spine file to the chapter it belongs
  // to, so the extraction prompt can tell the model which illustration index
  // is near the text it's currently reading (see freemium-extract.js's
  // getChapterIllustrations / ILLUSTRATION PLATES prompt section).
  const illustrationsByChapterPos = new Map();
  for (const meta of epubExtract.imageMeta || []) {
    if (!meta.sourcePath) continue;
    const chapterPos = parsed.chapters.findIndex((c) => c.spine_path === meta.sourcePath);
    if (chapterPos < 0) continue;
    if (!illustrationsByChapterPos.has(chapterPos)) illustrationsByChapterPos.set(chapterPos, []);
    illustrationsByChapterPos.get(chapterPos).push({ index: meta.index, textContext: meta.textContext });
  }

  let checkpoint = await getCheckpoint(env, book_id);
  const isResume = Boolean(checkpoint?.chapters_done?.length);
  if (!checkpoint) checkpoint = emptyCheckpoint(parsed.chapters.length);

  await putBookIndex(env, book_id, {
    book_id, title, author, status: "processing", stage: "parsing",
    progress: isResume ? checkpoint.chapters_done.length / checkpoint.total_chapters : 0.07,
    job_id, art_style, phase: "parsing", phase_label: "Reading EPUB",
  });

  // Running accumulators — seeded from whatever's already on disk when resuming.
  let knownCharacters = {};
  let mergedScenes = [];
  let mergedAnalysisCharacters = [];
  let mergedAnalysisScenes = [];
  if (isResume) {
    const pb = await readJsonR2(env, `books/${book_id}.json`);
    if (pb) {
      knownCharacters = pb.characters || {};
      mergedScenes = pb.scenes || [];
    }
    const an = await readJsonR2(env, `books/${book_id}.analysis.json`);
    if (an) {
      mergedAnalysisCharacters = an.characters || [];
      mergedAnalysisScenes = an.scenes || [];
    }
  }

  await report("extracting", checkpoint.chapters_done.length / Math.max(checkpoint.total_chapters, 1), {
    detail: isResume
      ? `Resuming at chapter ${checkpoint.next_chapter_idx + 1}/${checkpoint.total_chapters}`
      : "Starting script extraction",
  });

  const { isAttrLlmEnabled, attributeAnalysisLLM } = await import("./dialogue-attribute-llm.js");
  const attrLlmOn = isAttrLlmEnabled(env);

  let provider = checkpoint.provider_used || prefer_provider;
  let model = "";
  let stopDetail = null;

  const extractConcurrency = parseInt(env.VAE_EXTRACT_CONCURRENCY ?? "3", 10) || 1;

  dbg.log(PHASE.P2_EXTRACT, "start", {
    startChapterPos: checkpoint.next_chapter_idx,
    totalChapters: checkpoint.total_chapters,
    preferProvider: provider,
    concurrency: extractConcurrency,
  });

  // chapterPos -> latest progress snapshot for chapters currently being
  // extracted concurrently — surfaced to the UI as `workers` so a
  // concurrency > 1 run shows every in-flight chapter, not just whichever
  // onProgress call happened to fire last.
  const inFlightWorkers = new Map();

  try {
    await freemiumExtractBookByChapter(
      { book_id, title, author, chapters: parsed.chapters },
      {
        env,
        preferProvider: provider,
        startChapterPos: checkpoint.next_chapter_idx,
        concurrency: extractConcurrency,
        getKnownCharacters: () => mergedAnalysisCharacters,
        getChapterIllustrations: (chapterPos) => illustrationsByChapterPos.get(chapterPos) || null,
        onProgress: ({
          chapterPos, chapterIndex, chapterTitle, chapterOfTotal, totalChapters, chunk, totalChunks, provider: p,
        }) => {
          inFlightWorkers.set(chapterPos, {
            chapterPos, chapterIndex, chapterTitle, chapterOfTotal, totalChapters, chunk, totalChunks, provider: p,
          });
          report("extracting", chapterOfTotal / Math.max(totalChapters, 1), {
            detail: `Chapter ${chapterOfTotal}/${totalChapters} · chunk ${chunk}/${totalChunks}${p ? ` (${p})` : ""}`,
            step: "extract",
            stepIndex: chapterOfTotal,
            stepTotal: totalChapters,
            sub: { provider: p },
            workers: [...inFlightWorkers.values()].sort((a, b) => a.chapterOfTotal - b.chapterOfTotal),
          }).catch(() => {});
        },
        onChapterComplete: async (chapterPos, chapterAnalysis, meta) => {
          inFlightWorkers.delete(chapterPos);
          provider = meta.provider;
          model = meta.model || model;
          dbg.log(PHASE.P2_EXTRACT, "chapter done", { chapterPos, provider });

          for (const s of chapterAnalysis.scenes || []) s.chapter = chapterAnalysis.chapterIndex;

          let repaired = attributeAnalysis(repairAnalysis(chapterAnalysis));
          if (attrLlmOn) {
            repaired = await attributeAnalysisLLM(repaired, { env, preferProvider: provider });
          }

          const {
            scenes, newCharactersOut, nextLineIdx, updatedVoiceState,
          } = compileChapterPlayback(repaired, {
            art_style,
            narrator_gender,
            voiceState: checkpoint.voice_state,
            knownCharacters,
            startingLineIdx: checkpoint.next_line_idx,
          });

          await putChapterPack(env, book_id, chapterPos, { scenes, characters: newCharactersOut });

          knownCharacters = { ...knownCharacters, ...newCharactersOut };
          mergedScenes = [...mergedScenes, ...scenes];
          const seenIds = new Set(mergedAnalysisCharacters.map((c) => c.id));
          mergedAnalysisCharacters = [
            ...mergedAnalysisCharacters,
            ...(repaired.characters || []).filter((c) => c.id && !seenIds.has(c.id)),
          ];
          mergedAnalysisScenes = [...mergedAnalysisScenes, ...(repaired.scenes || [])];

          checkpoint = {
            ...checkpoint,
            chapters_done: [...checkpoint.chapters_done, chapterPos],
            next_chapter_idx: chapterPos + 1,
            voice_state: updatedVoiceState,
            next_line_idx: nextLineIdx,
            provider_used: provider,
          };
          await putCheckpoint(env, book_id, checkpoint);

          const chaptersReady = checkpoint.chapters_done.length;
          const progress = chaptersReady / Math.max(checkpoint.total_chapters, 1);

          await writeJsonR2(env, `books/${book_id}.json`, {
            book_id,
            title,
            author,
            art_style,
            characters: knownCharacters,
            status: chaptersReady >= checkpoint.total_chapters ? "processing" : "partial",
            stage: "extracting",
            progress,
            chapters_ready: chaptersReady,
            total_chapters: checkpoint.total_chapters,
            scenes: mergedScenes,
          });
          await writeJsonR2(env, `books/${book_id}.analysis.json`, {
            book_id, title, author, characters: mergedAnalysisCharacters, scenes: mergedAnalysisScenes,
          });

          await putBookIndex(env, book_id, {
            book_id,
            title,
            author,
            status: "partial",
            stage: "extracting",
            progress,
            chapters_ready: chaptersReady,
            total_chapters: checkpoint.total_chapters,
            scenes: mergedScenes.length,
            lines: mergedScenes.reduce((n, s) => n + (s.lines?.length || 0), 0),
            art_style,
            extract_provider: provider,
            job_id,
            phase: "extracting",
            phase_label: "Extracting script",
            detail: `Chapter ${chaptersReady}/${checkpoint.total_chapters} ready`,
          });
        },
      },
    );
  } catch (e) {
    if (!e.providerExhausted) throw e;
    stopDetail = String(e.message || e).slice(0, 300);
  }

  if (stopDetail) {
    const chaptersReady = checkpoint.chapters_done.length;
    await putBookIndex(env, book_id, {
      book_id,
      status: "partial",
      stage: "extracting",
      progress: chaptersReady / Math.max(checkpoint.total_chapters, 1),
      chapters_ready: chaptersReady,
      total_chapters: checkpoint.total_chapters,
      detail: `Stalled at chapter ${checkpoint.next_chapter_idx + 1}/${checkpoint.total_chapters}: ${stopDetail}`,
      job_id,
      active_job_id: null,
      imaging_locked: false,
    });
    dbg.log("PARTIAL", stopDetail, { chaptersReady, total: checkpoint.total_chapters });
    return { status: "partial", checkpoint, provider, detail: stopDetail };
  }

  // Every chapter succeeded — finalize the full analysis + playback, then run
  // imaging exactly as the legacy whole-book path (unchanged for this phase).
  const analysis = {
    book_id, title, author, characters: mergedAnalysisCharacters, scenes: mergedAnalysisScenes,
  };
  if (Object.keys(illustrationUrls).length) {
    analysis.illustration_urls = illustrationUrls;
    analysis.illustration_count = Object.keys(illustrationUrls).length;
    if (epubExtract.cover_index != null) analysis.cover_illustration_ref = epubExtract.cover_index;
  }
  await writeJsonR2(env, `books/${book_id}.analysis.json`, analysis);

  await report("compiling", 0, { detail: "Building playback JSON" });
  const plateCount = Object.keys(illustrationUrls).length;
  const illusMode = normalizeIllustrationMode(illustration_mode || env.ILLUSTRATION_MODE, art_style, plateCount);

  let playback = {
    book_id,
    title,
    author,
    art_style,
    characters: knownCharacters,
    chapters: parsed.chapters.map((c) => ({ index: c.index, title: c.title })),
    scenes: mergedScenes,
  };
  playback.illustration_mode = illusMode;
  if (byo_mode && !dry_run) {
    playback.byo_mode = true;
    playback.illustration_urls = illustrationUrls;
    if (epubExtract.cover_index != null) playback.cover_illustration_ref = epubExtract.cover_index;
    for (const c of analysis.characters || []) {
      if (c.illustration_ref != null && playback.characters?.[c.id]) {
        playback.characters[c.id].illustration_ref = c.illustration_ref;
      }
    }
  }
  if (illusMode === "direct-use" && plateCount > 0) {
    const applied = applyDirectIllustrations(playback, analysis, illustrationUrls);
    playback = applied.playback;
    dbg.log(PHASE.P2_COMPILE, "direct-use", applied.counts);
  }

  playback.status = "ready";
  playback.stage = wantArt ? "imaging" : "done";
  playback.progress = wantArt ? 0.55 : 1;
  playback.chapters_ready = checkpoint.total_chapters;
  playback.total_chapters = checkpoint.total_chapters;
  await writeJsonR2(env, `books/${book_id}.json`, playback);

  const earlyLines = mergedScenes.reduce((n, s) => n + (s.lines?.length || 0), 0);
  await putBookIndex(env, book_id, {
    book_id,
    title: playback.title,
    author: playback.author,
    status: wantArt ? "processing" : "ready",
    stage: wantArt ? "imaging" : "done",
    progress: wantArt ? 0.55 : 1,
    chapters_ready: checkpoint.total_chapters,
    total_chapters: checkpoint.total_chapters,
    scenes: playback.scenes?.length || 0,
    lines: earlyLines,
    art_style,
    extract_provider: provider,
    job_id,
    phase: "compiling",
    phase_label: "Building playback",
  });
  dbg.log(PHASE.P2_COMPILE, "done", { scenes: playback.scenes?.length, lines: earlyLines });

  let imagingStats = null;
  if (wantArt) {
    const imgPlan = await countImagingSteps(analysis, env);
    let globalStep = 0;
    await putBookIndex(env, book_id, {
      imaging_locked: true, active_job_id: job_id, stage: "imaging", status: "processing",
    });
    dbg.log(PHASE.P3_IMAGES, "start", { art_style, plan: imgPlan });
    await report("imaging", 0, {
      detail: `Generating art (0/${imgPlan.total})`, step: "imaging", stepIndex: 0, stepTotal: imgPlan.total,
    });

    const img = await runEdgeImaging({
      env,
      book_id,
      analysis,
      art_style,
      narrator_gender,
      dbg,
      onCoverReady: (coverUrl) => {
        putBookIndex(env, book_id, { cover: coverUrl }).catch(() => {});
      },
      onProgress: ({ kind, index, total, id, reused }) => {
        globalStep += 1;
        report("imaging", globalStep / Math.max(imgPlan.total, 1), {
          detail: `${kind} · ${id}${reused ? " (reused)" : ` · ${globalStep}/${imgPlan.total}`}`,
          step: kind, stepIndex: globalStep, stepTotal: imgPlan.total,
          sub: { kind, localIndex: index, localTotal: total, id, reused: Boolean(reused) },
        }).catch(() => {});
      },
      onProviderAttempt: (p, { kind, id }) => {
        report("imaging", globalStep / Math.max(imgPlan.total, 1), {
          detail: `Trying ${p} for ${kind} · ${id}`, step: kind, stepIndex: globalStep, stepTotal: imgPlan.total,
        }).catch(() => {});
      },
      onProviderWait: (p, { kind, id, waitMs }) => {
        const secs = Math.max(1, Math.round((waitMs || 0) / 1000));
        report("imaging", globalStep / Math.max(imgPlan.total, 1), {
          detail: `Waiting on ${p} for ${kind} · ${id} (${secs}s)`, step: kind, stepIndex: globalStep, stepTotal: imgPlan.total,
        }).catch(() => {});
      },
      onImageFailure: ({ kind, id, error }) => {
        report("imaging", globalStep / Math.max(imgPlan.total, 1), {
          detail: `Failed ${kind} · ${id}: ${String(error || "unknown").slice(0, 220)}`,
          step: kind, stepIndex: globalStep, stepTotal: imgPlan.total,
        }).catch(() => {});
      },
    });
    if ((img.stats?.ok ?? 0) === 0 && (img.stats?.stock ?? 0) === 0 && imgPlan.total > 0) {
      throw new Error("All images failed — set GEMINI_API_KEY (wrangler secret) or configure freemium image providers");
    }
    playback = img.playback;
    playback.status = "ready";
    playback.stage = "done";
    playback.progress = 1;
    playback.chapters_ready = checkpoint.total_chapters;
    playback.total_chapters = checkpoint.total_chapters;
    imagingStats = img.stats;
    dbg.log(PHASE.P3_IMAGES, "done", imagingStats);
    await report("imaging", 1, {
      detail: `Art complete · ${imagingStats?.ok ?? 0} ok, ${imagingStats?.fail ?? 0} failed`,
      step: "imaging", stepIndex: imgPlan.total, stepTotal: imgPlan.total,
    });
  } else {
    dbg.log(PHASE.P3_IMAGES, "skipped", { dry_run, generate_art });
  }

  await writeJsonR2(env, `books/${book_id}.json`, playback);

  const lines = (playback.scenes || []).reduce((n, s) => n + (s.lines?.length || 0), 0);
  await putBookIndex(env, book_id, {
    book_id,
    title: playback.title,
    author: playback.author,
    status: "ready",
    stage: "done",
    progress: 1,
    chapters_ready: checkpoint.total_chapters,
    total_chapters: checkpoint.total_chapters,
    scenes: playback.scenes.length,
    lines,
    art_style,
    extract_provider: provider,
    phase: "done",
    phase_label: "Ready",
    detail: dry_run
      ? `Dry run complete (${provider})`
      : byo_mode
        ? `Ready · BYO mode — copy prompts in Replace art (${provider})`
        : wantArt
          ? `Ready · extract=${provider} · images ok=${imagingStats?.ok ?? 0}`
          : `Ready · extract=${provider} (no art)`,
    imaging_locked: false,
    active_job_id: null,
    cover: playback.cover || null,
    byo_mode: Boolean(byo_mode && !dry_run),
  });

  return {
    status: "ready", checkpoint, provider, model, imagingStats, scenes: playback.scenes.length, lines,
  };
}
