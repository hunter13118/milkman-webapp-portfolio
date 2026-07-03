/** Edge TTS (Microsoft read-aloud) via WebSocket — works from Cloudflare Workers. */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "1-133.0.3065.92";
const UA_EDGE_VERSION = "133.0.3065.92";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const WS_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function computeSecMsGec() {
  const ticks = (BigInt(Math.floor(Date.now() / 1000)) + 11644473600n) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  const payload = new TextEncoder().encode(`${rounded.toString()}${TRUSTED_CLIENT_TOKEN}`);
  const hash = await crypto.subtle.digest("SHA-256", payload);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function concatChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function buildSsml(text, voice, { rate = "+0%", pitch = "+0Hz" } = {}) {
  const lang = String(voice).split("-").slice(0, 2).join("-") || "en-US";
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${escapeXml(voice)}'>` +
    `<prosody rate='${rate}' pitch='${pitch}'>${escapeXml(text)}</prosody>` +
    `</voice></speak>`
  );
}

function wsConnectUrl(connectionId, gec) {
  return (
    "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
    `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=${encodeURIComponent(SEC_MS_GEC_VERSION)}` +
    `&ConnectionId=${connectionId}`
  );
}

export async function synthesizeEdgeMp3(text, voice = "en-US-AndrewMultilingualNeural", opts = {}) {
  const t = String(text || "").trim();
  if (!t) return null;

  const rate = opts.rate || "+0%";
  const pitch = opts.pitch || "+0Hz";
  const connectionId = crypto.randomUUID().replace(/-/g, "");
  const requestId = crypto.randomUUID().replace(/-/g, "");
  const gec = await computeSecMsGec();

  const resp = await fetch(wsConnectUrl(connectionId, gec), {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      Origin: WS_ORIGIN,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        `(KHTML, like Gecko) Chrome/${UA_EDGE_VERSION} Safari/537.36 Edg/${UA_EDGE_VERSION}`,
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (resp.status !== 101) {
    throw new Error(`edge-tts WS HTTP ${resp.status}`);
  }

  const ws = resp.webSocket;
  if (!ws) throw new Error("edge-tts WS missing");

  ws.accept();

  const ssml = buildSsml(t, voice, { rate, pitch });
  ws.send(
    "Content-Type:application/json; charset=utf-8\r\n" +
    "Path:speech.config\r\n\r\n" +
    JSON.stringify({
      context: {
        synthesis: {
          audio: {
            metadataoptions: {
              sentenceBoundaryEnabled: "false",
              wordBoundaryEnabled: "false",
            },
            outputFormat: OUTPUT_FORMAT,
          },
        },
      },
    }),
  );
  ws.send(
    `X-RequestId:${requestId}\r\n` +
    "Content-Type:application/ssml+xml\r\n" +
    `X-Timestamp:${new Date().toISOString()}\r\n` +
    "Path:ssml\r\n\r\n" +
    ssml,
  );

  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const finish = (data, err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      if (err) reject(err);
      else resolve(data);
    };

    const timer = setTimeout(() => finish(null, new Error("edge-tts timeout")), 25000);

    ws.addEventListener("message", (evt) => {
      if (typeof evt.data === "string") {
        if (evt.data.includes("Path:turn.end")) {
          const out = concatChunks(chunks);
          finish(out.length ? out : null, out.length ? null : new Error("edge-tts empty audio"));
        }
        return;
      }

      const buf = evt.data instanceof ArrayBuffer
        ? new Uint8Array(evt.data)
        : new Uint8Array(evt.data.buffer || evt.data);
      if (buf.length < 2) return;
      const headerLen = (buf[0] << 8) | buf[1];
      if (buf.length < 2 + headerLen) return;
      const audio = buf.subarray(2 + headerLen);
      if (audio.length) chunks.push(audio);
    });

    ws.addEventListener("error", () => finish(null, new Error("edge-tts ws error")));
    ws.addEventListener("close", () => {
      if (settled) return;
      const out = concatChunks(chunks);
      if (out.length) finish(out);
    });
  });
}
