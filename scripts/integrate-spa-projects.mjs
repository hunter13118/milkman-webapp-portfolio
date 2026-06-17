import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  CLERK_PUBLISHABLE_FALLBACK,
  SPA_PROJECTS,
  projectBasePath,
} from "./projects.manifest.mjs";

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

loadEnvFile(path.join(portfolioRoot, ".env"));
const clerkKey =
  process.env.VITE_CLERK_PUBLISHABLE_KEY || CLERK_PUBLISHABLE_FALLBACK;

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

  const buildEnv = {
    ...process.env,
    VITE_BASE_PATH: basePath,
    BASE_URL: basePath,
    ...(project.clerk ? { VITE_CLERK_PUBLISHABLE_KEY: clerkKey } : {}),
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
  const distDest = path.join(portfolioRoot, "public/projects", project.slug);
  rmrf(distDest);
  copyDir(distSrc, distDest);
  console.log(`Copied UI → public/projects/${project.slug}`);
  integrated += 1;
}

console.log(`\nSPA integrate done (${integrated} project(s)).`);
