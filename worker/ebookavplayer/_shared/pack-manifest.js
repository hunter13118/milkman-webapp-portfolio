/** vae-offline-pack manifest — must match server/pack/build.py and web/src/offline/packFormat.js */

export const FORMAT_ID = "vae-offline-pack";
export const FORMAT_VERSION = 1;

export function buildPackManifest({
  bookId,
  title,
  author,
  tier,
  style,
  audioEngine = null,
  lineCount = 0,
  mediaCount = 0,
  audioLineCount = 0,
  createdAt,
}) {
  const resolvedStyle = style || "semi-real";
  const id = bookId || "unknown";
  return {
    format: FORMAT_ID,
    format_version: FORMAT_VERSION,
    pack_id: `${id}@${resolvedStyle}@${tier}`,
    book_id: id,
    title: title || id,
    author: author || "",
    tier,
    style: resolvedStyle,
    audio_engine: audioEngine,
    created_at: createdAt || new Date().toISOString(),
    media_count: mediaCount,
    audio_line_count: audioLineCount,
    line_count: lineCount,
  };
}

/** Client-side validation mirror (packFormat.validateManifest). */
export function validatePackManifest(m) {
  if (!m || m.format !== FORMAT_ID) throw new Error("not a vae-offline-pack");
  if (m.format_version !== FORMAT_VERSION) throw new Error("unsupported pack format version");
  if (!m.book_id || !m.pack_id) throw new Error("invalid pack manifest");
  return m;
}
