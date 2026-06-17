import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioRoot = path.resolve(__dirname, "..");
const cloudPilotRoot = path.resolve(portfolioRoot, "../CloudPilot");
const basePath = process.env.VITE_CLOUDPILOT_BASE || "/projects/cloudpilot/";

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

loadEnvFile(path.join(portfolioRoot, ".env"));

const clerkPublishableKey =
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  "pk_test_YnVyc3RpbmctdGFycG9uLTY1LmNsZXJrLmFjY291bnRzLmRdiQ";

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

console.log("CloudPilot integrate →", basePath);

if (!fs.existsSync(cloudPilotRoot)) {
  console.warn("Skip: CloudPilot repo not found at", cloudPilotRoot);
  process.exit(0);
}

const frontendDir = path.join(cloudPilotRoot, "frontend");
const buildEnv = {
  ...process.env,
  VITE_BASE_PATH: basePath,
  VITE_CLERK_PUBLISHABLE_KEY: clerkPublishableKey,
};

console.log("Building CloudPilot frontend…");
const build = spawnSync("npm run build", {
  cwd: frontendDir,
  env: buildEnv,
  shell: true,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const distSrc = path.join(frontendDir, "dist");
const distDest = path.join(portfolioRoot, "public/projects/cloudpilot");
rmrf(distDest);
copyDir(distSrc, distDest);
console.log("Copied UI → public/projects/cloudpilot");

const fnSrc = path.join(cloudPilotRoot, "functions");
const fnDest = path.join(portfolioRoot, "worker/cloudpilot");
rmrf(fnDest);
copyDir(fnSrc, fnDest);
console.log("Copied edge handlers → worker/cloudpilot");

const heroSrc = path.join(cloudPilotRoot, "screenshots/01-mission-control-canvas.png");
const heroDest = path.join(portfolioRoot, "public/assets/cloudpilot-hero.png");
if (fs.existsSync(heroSrc)) {
  fs.mkdirSync(path.dirname(heroDest), { recursive: true });
  fs.copyFileSync(heroSrc, heroDest);
  console.log("Copied hero screenshot → public/assets/cloudpilot-hero.png");
}

console.log("CloudPilot integrate done.");
