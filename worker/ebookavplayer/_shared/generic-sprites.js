/** Line-attribution heuristics: low-dialogue side chars → generic stock sprites. */

function thresholds(env = {}) {
  const minLines = parseInt(env.VAE_CUSTOM_SPRITE_MIN_LINES ?? "3", 10);
  const minShare = parseFloat(env.VAE_CUSTOM_SPRITE_MIN_SHARE ?? "0.015");
  return {
    minLines: Number.isFinite(minLines) ? minLines : 3,
    minShare: Number.isFinite(minShare) ? minShare : 0.015,
  };
}

/** Dialogue + thought lines per character (excludes narrator narration). */
export function countCharacterLines(analysis) {
  const counts = Object.create(null);
  for (const scene of analysis.scenes || []) {
    for (const line of scene.lines || []) {
      const cid = line.character_id;
      if (!cid || cid === "narrator") continue;
      const kind = (line.kind || "dialogue").toLowerCase();
      if (kind === "narration") continue;
      counts[cid] = (counts[cid] || 0) + 1;
    }
  }
  return counts;
}

export function useStockSprite(character, lineCount, totalAttributed, env = {}) {
  const { minLines, minShare } = thresholds(env);
  const imp = (character.importance || "secondary").toLowerCase();
  if (imp === "background") return true;
  if (imp === "primary" && lineCount >= minLines) return false;
  if (lineCount < minLines) return true;
  if (totalAttributed >= 20 && lineCount / totalAttributed < minShare) return true;
  return false;
}

/** Split characters into custom-gen vs generic stock pools. */
export function planCharacterImaging(analysis, env = {}) {
  const lineCounts = countCharacterLines(analysis);
  const totalLines = Object.values(lineCounts).reduce((a, b) => a + b, 0);
  const toGenerate = [];
  const fromStock = [];

  for (const c of analysis.characters || []) {
    if (!c.id || c.id === "narrator") continue;
    const n = lineCounts[c.id] || 0;
    if (useStockSprite(c, n, totalLines, env)) fromStock.push(c);
    else toGenerate.push(c);
  }

  return { toGenerate, fromStock, lineCounts, totalLines };
}

/** Deterministic gendered stock URL — matches Python sprite_plan.stock_sprite_url. */
export async function stockSpriteUrl(characterId, gender, env = {}) {
  const poolRaw = env.VAE_STOCK_POOL_SIZE ?? env.STOCK_POOL_SIZE ?? "12";
  const poolSize = parseInt(poolRaw, 10) || 12;
  const g = (gender || "n").charAt(0).toLowerCase();
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(characterId));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const h = Number(BigInt(`0x${hex}`) % BigInt(poolSize));
  return `/media/stock/${g}${String(h).padStart(2, "0")}.png`;
}
