#!/usr/bin/env node
/**
 * Vendors showcase web components + screenshots into public/ for Vite build
 * and Cloudflare Pages (no sibling repos on CI).
 *
 * Locally, refreshes from ../personal webapp portfolio and ../war-council when present.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicRoot = path.join(root, 'public');

const siblingShowcase = path.resolve(root, '../personal webapp portfolio/showcase');
const siblingE2e = path.resolve(root, '../personal webapp portfolio/milkman-portfolio/e2e/screenshots');
const siblingWcAudit = path.resolve(root, '../war-council/.war-council/audit-screens');

const targets = {
  wcJs: path.join(publicRoot, 'showcase/wc'),
  milkmanScreenshots: path.join(publicRoot, 'showcase/screenshots'),
  wcScreenshots: path.join(publicRoot, 'showcase/war-council-screenshots'),
};

const showcaseScripts = [
  'voxnovel-card.js',
  'voxnovel-scroll.js',
  'war-council-card.js',
  'war-council-scroll.js',
];

/** Map scroll component filenames → available audit PNGs */
const wcScreenshotAliases = {
  '04-command-center-routing.png': 'index.desktop.png',
  '07-tournament-judge-verdict.png': 'arbitration-court.desktop.png',
  '22-dag-theater-completed.png': 'knowledge-graph-viz.desktop.png',
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return 0;
  ensureDir(destDir);
  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      count += copyTree(src, dest);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
      count += 1;
    }
  }
  return count;
}

function syncShowcaseScripts() {
  ensureDir(targets.wcJs);
  let copied = 0;
  for (const file of showcaseScripts) {
    const src = path.join(siblingShowcase, file);
    const dest = path.join(targets.wcJs, file);
    if (copyFile(src, dest)) {
      copied += 1;
      console.log(`  ✓ ${file}`);
    } else if (fs.existsSync(dest)) {
      console.log(`  · ${file} (using vendored copy)`);
      copied += 1;
    } else {
      console.warn(`  ✗ missing ${file}`);
    }
  }
  return copied;
}

function syncMilkmanScreenshots() {
  if (fs.existsSync(siblingE2e)) {
    const n = copyTree(siblingE2e, targets.milkmanScreenshots);
    console.log(`  ✓ milkman screenshots (${n} files)`);
    return n;
  }
  const existing = fs.existsSync(targets.milkmanScreenshots)
    ? fs.readdirSync(targets.milkmanScreenshots, { recursive: true }).length
    : 0;
  console.log(`  · milkman screenshots (${existing} vendored entries)`);
  return existing;
}

function syncWarCouncilScreenshots() {
  ensureDir(targets.wcScreenshots);
  let copied = 0;

  if (fs.existsSync(siblingWcAudit)) {
    for (const [alias, source] of Object.entries(wcScreenshotAliases)) {
      if (copyFile(path.join(siblingWcAudit, source), path.join(targets.wcScreenshots, alias))) {
        copied += 1;
        console.log(`  ✓ ${alias} ← ${source}`);
      }
    }
    for (const file of fs.readdirSync(siblingWcAudit)) {
      if (!file.endsWith('.png')) continue;
      const dest = path.join(targets.wcScreenshots, file);
      if (!fs.existsSync(dest) && copyFile(path.join(siblingWcAudit, file), dest)) {
        copied += 1;
      }
    }
  }

  for (const alias of Object.keys(wcScreenshotAliases)) {
    if (fs.existsSync(path.join(targets.wcScreenshots, alias))) copied += 1;
  }

  if (copied === 0) {
    console.warn('  ✗ no War Council screenshots — scroll tour images will 404');
  } else {
    console.log(`  ✓ war-council screenshots (${copied} usable)`);
  }
  return copied;
}

console.log('Syncing showcase assets…');
syncShowcaseScripts();
syncMilkmanScreenshots();
syncWarCouncilScreenshots();
console.log('Done.');
