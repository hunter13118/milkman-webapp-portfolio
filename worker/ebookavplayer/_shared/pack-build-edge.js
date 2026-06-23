/**
 * Phase 4 — assemble vae-offline-pack ZIP on the edge (visual + audiobook).
 */
import { zipSync, strToU8 } from "fflate";
import { synthesizeEdgeMp3 } from "./edge-tts.js";
import { r2MediaKey } from "./edge-imaging.js";

const FORMAT_ID = "vae-offline-pack";
const FORMAT_VERSION = 1;
const MANIFEST_NAME = "vae/manifest.json";
const BOOK_NAME = "vae/book.json";
const VOICES_NAME = "vae/voices.json";
const MEDIA_INDEX_NAME = "vae/media/index.json";
const MEDIA_PREFIX = "vae/media/files/";
const AUDIO_MANIFEST_NAME = "vae/audio/manifest.json";
const AUDIO_PREFIX = "vae/audio/lines/";
const TIER_VISUAL = "visual";
const TIER_AUDIOBOOK = "audiobook";

function intEnv(env, key, fallback) {
  const v = parseInt(env[key], 10);
  return Number.isFinite(v) ? v : fallback;
}

function collectMediaUrls(book) {
  const raw = JSON.stringify(book);
  const re = /\/media\/[^"'\s)]+/g;
  const found = new Set();
  for (const m of raw.match(re) || []) found.add(m.split("?")[0]);
  return [...found];
}

function packMediaPath(url) {
  return `${MEDIA_PREFIX}${url.replace(/^\/media\//, "")}`;
}

function lineAudioName(idx) {
  return `${AUDIO_PREFIX}${String(idx).padStart(6, "0")}.mp3`;
}

async function loadR2Media(env, url, style) {
  if (!env.VAE_PACKS || !url?.startsWith("/media/")) return null;
  const rel = url.replace(/^\/media\//, "");
  return env.VAE_PACKS.get(`media/${rel}`);
}

/** Build pack bytes; onProgress(0..1, detail). */
export async function buildPackOnEdge({
  env,
  book,
  tier,
  style,
  dbg,
  onProgress,
}) {
  const bookId = book.book_id || "unknown";
  const files = {};
  const bookCopy = JSON.parse(JSON.stringify(book));

  dbg?.log("P4_PACK", "collect media urls");
  const mediaUrls = collectMediaUrls(bookCopy);
  const mediaIndex = {};

  let mi = 0;
  for (const url of mediaUrls) {
    const obj = await loadR2Media(env, url, style);
    if (obj) {
      const bytes = new Uint8Array(await obj.arrayBuffer());
      const packPath = packMediaPath(url);
      files[packPath] = bytes;
      mediaIndex[url] = packPath;
    }
    mi += 1;
    onProgress?.(0.05 + (mi / Math.max(mediaUrls.length, 1)) * 0.35, `media ${mi}/${mediaUrls.length}`);
    dbg?.log("P4_PACK", `media ${mi}/${mediaUrls.length}`, { url, hit: Boolean(obj) });
  }

  files[BOOK_NAME] = strToU8(JSON.stringify(bookCopy, null, 2));
  files[VOICES_NAME] = strToU8(JSON.stringify(book.voice_overrides || {}, null, 2));
  files[MEDIA_INDEX_NAME] = strToU8(JSON.stringify(mediaIndex, null, 2));

  const linesFlat = [];
  for (const scene of bookCopy.scenes || []) {
    for (const ln of scene.lines || []) linesFlat.push(ln);
  }

  let audioEngine = null;
  const audioManifest = [];

  if (tier === TIER_AUDIOBOOK) {
    audioEngine = "edge-tts";
    const maxLines = intEnv(env, "VAE_PACK_TTS_MAX_LINES", 0);
    const speakable = linesFlat.filter((ln) => (ln.text || "").trim());
    const toSynth = maxLines > 0 ? speakable.slice(0, maxLines) : speakable;

    dbg?.log("P4_PACK", `tts start lines=${toSynth.length}`, { maxLines: maxLines || "all" });

    let ti = 0;
    for (const ln of toSynth) {
      ti += 1;
      const idx = ln.idx ?? ti - 1;
      const voice = ln.voice || "en-US-AndrewMultilingualNeural";
      try {
        const mp3 = await synthesizeEdgeMp3(ln.text, voice, { pitch: ln.pitch || "+0Hz" });
        if (mp3?.length) {
          const name = lineAudioName(idx);
          files[name] = mp3;
          audioManifest.push({ line_idx: idx, path: name, voice });
          dbg?.log("P4_PACK", `tts ok line ${idx}`);
        }
      } catch (e) {
        dbg?.log("P4_PACK", `tts fail line ${idx}`, { error: String(e.message || e).slice(0, 80) });
      }
      onProgress?.(0.4 + (ti / Math.max(toSynth.length, 1)) * 0.55, `tts ${ti}/${toSynth.length}`);
    }
    files[AUDIO_MANIFEST_NAME] = strToU8(JSON.stringify(audioManifest, null, 2));
  }

  const manifest = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    book_id: bookId,
    tier,
    style: style || book.art_style || "semi-real",
    created_at: new Date().toISOString(),
    audio_engine: audioEngine,
    line_count: linesFlat.length,
    media_count: Object.keys(mediaIndex).length,
    audio_line_count: audioManifest.length,
  };
  files[MANIFEST_NAME] = strToU8(JSON.stringify(manifest, null, 2));

  dbg?.log("P4_PACK", "zip", {
    files: Object.keys(files).length,
    tier,
    audio_lines: audioManifest.length,
  });

  onProgress?.(0.98, "compressing");
  const zipped = zipSync(files, { level: 6 });
  onProgress?.(1, "done");
  return { bytes: zipped, manifest, mediaIndex, audioManifest };
}

export { TIER_VISUAL, TIER_AUDIOBOOK };
