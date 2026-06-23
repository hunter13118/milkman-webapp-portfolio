import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  SPA_PROJECTS,
  projectBasePath,
} from "./projects.manifest.mjs";
import { resolveClerkPublishableKey } from "./clerk-key.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioRoot = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

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

const TEMPLATE_FILES = [
  "ErrorBoundary.jsx",
  "portfolioAuth.jsx",
  "portfolioClerk.jsx",
  "geminiCapability.js",
  "GeminiKeyModal.jsx",
];

function syncPortfolioTemplates(appRoot) {
  const libDir = path.join(appRoot, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  for (const file of TEMPLATE_FILES) {
    const from = path.join(__dirname, "templates", file);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(libDir, file));
  }
}

/** PWAs register SW scoped to /projects/<slug>/ — stale SWs cause blank screens on iOS. */
function stripEmbeddedPwa(distDir) {
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, "utf8");
    html = html.replace(/<script[^>]*registerSW\.js[^>]*><\/script>/gi, "");
    html = html.replace(/<link[^>]*manifest\.webmanifest[^>]*>/gi, "");
    fs.writeFileSync(indexPath, html);
  }
  for (const name of ["registerSW.js", "sw.js"]) {
    const p = path.join(distDir, name);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith("workbox-")) {
      fs.unlinkSync(path.join(distDir, entry.name));
    }
  }
}

loadEnvFile(path.join(portfolioRoot, ".env"));
const clerkKey = resolveClerkPublishableKey();

let integrated = 0;

for (const project of SPA_PROJECTS) {
  const repoRoot = path.resolve(portfolioRoot, project.root);
  const appRoot =
    project.appDir === "." ? repoRoot : path.join(repoRoot, project.appDir);

  if (!fs.existsSync(appRoot)) {
    console.warn(`Skip ${project.slug}: not found at ${appRoot}`);
    continue;
  }

  const nodeModules = path.join(appRoot, "node_modules");
  if (!fs.existsSync(nodeModules)) {
    console.log(`Installing deps in ${appRoot}…`);
    const install = spawnSync("npm install", {
      cwd: appRoot,
      shell: true,
      stdio: "inherit",
    });
    if (install.status !== 0) process.exit(install.status ?? 1);
  }

  const basePath = projectBasePath(project.slug);
  console.log(`\nIntegrate ${project.slug} → ${basePath}`);

  if (project.clerk) syncPortfolioTemplates(appRoot);

  const buildEnv = {
    ...process.env,
    VITE_BASE_PATH: basePath,
    BASE_URL: basePath,
    ...(project.clerk ? { VITE_CLERK_PUBLISHABLE_KEY: clerkKey } : {}),
    ...(project.slug === "ebookavplayer"
      ? { VITE_API_BASE: `${basePath.replace(/\/$/, "")}/api` }
      : {}),
  };

  const buildCmd = project.buildCmd || "npm run build";
  const build = spawnSync(buildCmd, {
    cwd: appRoot,
    env: buildEnv,
    shell: true,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    console.error(`Build failed for ${project.slug}`);
    process.exit(build.status ?? 1);
  }

  const distSrc = path.join(appRoot, "dist");
  stripEmbeddedPwa(distSrc);
  const distDest = path.join(portfolioRoot, "public/projects", project.slug);
  rmrf(distDest);
  copyDir(distSrc, distDest);
  console.log(`Copied UI → public/projects/${project.slug}`);
  integrated += 1;
}

console.log(`\nSPA integrate done (${integrated} project(s)).`);
