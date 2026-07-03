/**
 * Edge-detected sprite backdrop purge (port of server/images/white_key.py).
 */
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const OPAQUE_CONTENT_TYPES = new Set(["image/jpeg", "image/jpg", "image/bmp"]);

function quantizeRgb(rgb, step = 16) {
  const s = Math.max(1, step);
  return rgb.slice(0, 3).map((c) => Math.min(255, Math.floor(c / s) * s));
}

function edgePixels(rgba, w, h, border) {
  const b = Math.max(1, Math.min(border, Math.floor(w / 4), Math.floor(h / 4)));
  const coords = new Set();
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < b; y++) {
      coords.add(`${x},${y}`);
      coords.add(`${x},${h - 1 - y}`);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      coords.add(`${x},${y}`);
      coords.add(`${w - 1 - x},${y}`);
    }
  }
  const samples = [];
  for (const key of coords) {
    const [x, y] = key.split(",").map(Number);
    const i = (y * w + x) * 4;
    samples.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  return samples;
}

export function detectEdgeBackgroundColor(rgba, w, h, { border = 2, quantizeStep = 16 } = {}) {
  const samples = edgePixels(rgba, w, h, border);
  if (!samples.length) return { bg: [255, 255, 255], dominance: 1 };
  const counts = new Map();
  for (const s of samples) {
    const q = quantizeRgb(s, quantizeStep).join(",");
    counts.set(q, (counts.get(q) || 0) + 1);
  }
  let best = "255,255,255";
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return { bg: best.split(",").map(Number), dominance: bestN / samples.length };
}

function colorDistance(rgb, bg) {
  return Math.max(
    Math.abs(rgb[0] - bg[0]),
    Math.abs(rgb[1] - bg[1]),
    Math.abs(rgb[2] - bg[2]),
  );
}

function transparentRatio(rgba, alphaCutoff = 250) {
  if (!rgba.length) return 0;
  let transparent = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < alphaCutoff) transparent += 1;
  }
  return transparent / (rgba.length / 4);
}

export function transparentRatioFromBytes(imageBytes, contentType, { alphaCutoff = 250 } = {}) {
  if (!imageBytes?.length) return 0;
  const { rgba } = decodeImage(imageBytes, contentType);
  return transparentRatio(rgba, alphaCutoff);
}

export function isTransparentEnough(imageBytes, contentType, minRatio = 0.12) {
  return transparentRatioFromBytes(imageBytes, contentType) >= minRatio;
}

export function imageNeedsBackgroundPurge(imageBytes, contentType, { minExistingTransparency = 0.02 } = {}) {
  if (!imageBytes?.length) return false;
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (OPAQUE_CONTENT_TYPES.has(ct)) return true;
  const { rgba } = decodeImage(imageBytes, contentType);
  if (transparentRatio(rgba) >= minExistingTransparency) return false;
  return true;
}

function idx(x, y, w) {
  return y * w + x;
}

function floodEdgeBackground(dist, w, h, tol) {
  const n = w * h;
  const connected = new Uint8Array(n);
  if (!n) return connected;

  const candidate = (i) => dist[i] <= tol;
  const queue = [];

  const trySeed = (x, y) => {
    const i = idx(x, y, w);
    if (!connected[i] && candidate(i)) {
      connected[i] = 1;
      queue.push([x, y]);
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (queue.length) {
    const [x, y] = queue.shift();
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = idx(nx, ny, w);
      if (!connected[i] && candidate(i)) {
        connected[i] = 1;
        queue.push([nx, ny]);
      }
    }
  }
  return connected;
}

function neighborConnected(connected, x, y, w, h) {
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && connected[idx(nx, ny, w)]) return true;
  }
  return false;
}

function toUint8Array(imageBytes) {
  if (imageBytes instanceof Uint8Array) return imageBytes;
  if (imageBytes instanceof ArrayBuffer) return new Uint8Array(imageBytes);
  return new Uint8Array(imageBytes);
}

/** pngjs sync path needs full Node Buffer (missing/broken under some workerd builds). */
function bufferAvailable() {
  try {
    if (typeof Buffer === "undefined") return false;
    const probe = Buffer.from([137, 80, 78, 71]);
    return probe?.length === 4 && typeof probe.readUInt32BE === "function";
  } catch {
    return false;
  }
}

function decodeImage(imageBytes, contentType) {
  const buf = toUint8Array(imageBytes);
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct === "image/jpeg" || ct === "image/jpg") {
    const { data, width, height } = jpeg.decode(buf, { useTArray: true });
    return { rgba: data, width, height };
  }
  if (!bufferAvailable()) {
    throw new Error("sprite purge: Node Buffer unavailable in this runtime");
  }
  const png = PNG.sync.read(Buffer.from(buf));
  const rgba = new Uint8Array(png.width * png.height * 4);
  rgba.set(png.data);
  return { rgba, width: png.width, height: png.height };
}

function encodePng(rgba, w, h) {
  if (!bufferAvailable()) {
    throw new Error("sprite purge: Node Buffer unavailable in this runtime");
  }
  const png = new PNG({ width: w, height: h });
  png.data = Buffer.from(rgba);
  const out = PNG.sync.write(png);
  return new Uint8Array(out);
}

export function purgeSpriteBackground(imageBytes, {
  bgColor = null,
  tolerance = 22,
  softness = 12,
  border = 2,
  quantizeStep = 16,
  minEdgeDominance = 0.35,
  contentType = null,
} = {}) {
  if (!imageBytes?.length) throw new Error("purgeSpriteBackground: empty input");

  const tol = Math.max(0, Math.min(255, tolerance | 0));
  const soft = Math.max(0, softness | 0);
  const minDom = Math.max(0, Math.min(1, minEdgeDominance));

  const { rgba, width: w, height: h } = decodeImage(imageBytes, contentType);
  let detected = bgColor;
  let dominance = 1;
  if (!detected) {
    const edge = detectEdgeBackgroundColor(rgba, w, h, { border, quantizeStep });
    detected = edge.bg;
    dominance = edge.dominance;
    if (dominance < minDom) {
      throw new Error(`edge background ambiguous (dominance=${dominance.toFixed(2)} < ${minDom})`);
    }
  }
  const bg = detected.slice(0, 3).map((c) => c | 0);

  const dist = new Int32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      dist[idx(x, y, w)] = colorDistance([rgba[i], rgba[i + 1], rgba[i + 2]], bg);
    }
  }

  const connected = floodEdgeBackground(dist, w, h, tol);
  let removed = 0;
  let feathered = 0;
  let preservedIslands = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = idx(x, y, w);
      const i = pi * 4;
      const d = dist[pi];
      const a = rgba[i + 3];

      if (connected[pi]) {
        if (a) removed += 1;
        rgba[i + 3] = 0;
        continue;
      }

      if (d <= tol) {
        preservedIslands += 1;
        continue;
      }

      if (soft && d > tol && d <= tol + soft && neighborConnected(connected, x, y, w, h)) {
        const t = (d - tol) / soft;
        const newA = Math.round(a * t);
        if (newA < a) feathered += 1;
        rgba[i + 3] = newA;
      }
    }
  }

  const out = encodePng(rgba, w, h);
  const meta = {
    width: w,
    height: h,
    background_rgb: bg,
    edge_dominance: Math.round(dominance * 10000) / 10000,
    tolerance: tol,
    softness: soft,
    pixels_removed: removed,
    pixels_feathered: feathered,
    pixels_preserved_islands: preservedIslands,
    flood_connected: connected.reduce((s, v) => s + v, 0),
    auto_detected: bgColor == null,
    method: "edge_flood",
  };
  return { bytes: out, meta };
}

export function maybePurgeSpriteBackground(imageBytes, contentType, purgeOpts = {}) {
  if (!imageNeedsBackgroundPurge(imageBytes, contentType)) return null;
  return purgeSpriteBackground(imageBytes, { ...purgeOpts, contentType });
}

export function purgeOptsFromEnv(env = {}) {
  return {
    tolerance: parseInt(env.SPRITE_BG_PURGE_TOLERANCE ?? "22", 10),
    softness: parseInt(env.SPRITE_BG_PURGE_SOFTNESS ?? "12", 10),
    minEdgeDominance: parseFloat(env.SPRITE_BG_PURGE_MIN_EDGE_DOMINANCE ?? "0.35"),
  };
}

/** Post-process freemium image result for character sprites. */
export function maybePurgeFreemiumImage(result, env) {
  if (!result?.bytes?.length) return result;
  try {
    const purged = maybePurgeSpriteBackground(
      result.bytes,
      result.contentType,
      purgeOptsFromEnv(env),
    );
    if (!purged) return result;
    return {
      ...result,
      bytes: purged.bytes,
      contentType: "image/png",
      background_purged: true,
      background_purge: purged.meta,
    };
  } catch (e) {
    console.warn("background purge failed; keeping original bytes", e?.message || e);
    return result;
  }
}
