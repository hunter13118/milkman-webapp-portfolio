import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioRoot = path.resolve(__dirname, "..");
const vaeRoot = path.resolve(portfolioRoot, "../ebookavplayer");

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

console.log("EbookAVPlayer edge integrate…");

if (!fs.existsSync(vaeRoot)) {
  console.warn("Skip: ebookavplayer repo not found at", vaeRoot);
  process.exit(0);
}

const workerSrc = path.join(vaeRoot, "worker");
const workerDest = path.join(portfolioRoot, "worker/ebookavplayer");
if (!fs.existsSync(workerSrc)) {
  console.warn("Skip: no worker/ in ebookavplayer");
  process.exit(0);
}

rmrf(workerDest);
copyDir(workerSrc, workerDest);
console.log("Copied edge handlers → worker/ebookavplayer");
