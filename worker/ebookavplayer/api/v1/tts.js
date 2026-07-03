import { json } from "../../_shared/jobs-kv.js";
import { synthesizeEdgeMp3 } from "../../_shared/edge-tts.js";

/** POST /tts — Edge neural voices (no Fly/Python backend required). */
export async function onTtsPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "expected JSON body" }, 400);
  }

  const text = String(body.text || "").trim();
  if (!text) return new Response(null, { status: 204 });

  const voice = body.voice || "en-US-AndrewMultilingualNeural";
  const rate = body.rate || "+0%";
  const pitch = body.pitch || "+0Hz";
  const volume = body.volume || "+0%";

  try {
    const audio = await synthesizeEdgeMp3(text, voice, { rate, pitch, volume });
    if (!audio?.length) return new Response(null, { status: 204 });
    return new Response(audio, {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
