/** Edge TTS (Microsoft read-aloud) — best-effort from Worker; no Python edge-tts. */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function synthesizeEdgeMp3(text, voice = "en-US-AndrewMultilingualNeural", opts = {}) {
  const t = String(text || "").trim();
  if (!t) return null;

  const rate = opts.rate || "+0%";
  const pitch = opts.pitch || "+0Hz";
  const volume = opts.volume || "+0%";

  const ssml =
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">` +
    `<voice name="${escapeXml(voice)}">` +
    `<prosody rate="${rate}" pitch="${pitch}" volume="${volume}">${escapeXml(t)}</prosody>` +
    `</voice></speak>`;

  const url =
    `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/ssml+xml",
      "x-microsoft-outputformat": "audio-24khz-48kbitrate-mono-mp3",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    },
    body: ssml,
  });

  if (!res.ok) {
    throw new Error(`edge-tts HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
