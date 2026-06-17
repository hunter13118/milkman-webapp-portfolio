/**
 * Pull AI API keys from war-council/.env into portfolio + CloudPilot dev files,
 * and optionally upload Worker secrets via Wrangler.
 *
 * Usage (from milkman-portfolio root):
 *   node scripts/sync-secrets-from-war-council.mjs           # local .dev.vars only
 *   node scripts/sync-secrets-from-war-council.mjs --cloud   # + wrangler secret put
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORTFOLIO_ROOT = resolve(__dirname, "..");
const WC_ROOT = process.env.WAR_COUNCIL_ROOT || "D:/war-council";
const CLOUDPILOT_ROOT = process.env.CLOUDPILOT_ROOT || "D:/CloudPilot";

const AI_KEYS = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY"];
const CLOUD_WORKER_SECRETS = ["GEMINI_API_KEY"];

function parseEnvFile(filePath) {
  const out = {};
  if (!existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertDevVars(filePath, vars, header) {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf-8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return true;
    const key = t.split("=")[0]?.trim();
    return !AI_KEYS.includes(key);
  });
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const block = [
    header,
    ...AI_KEYS.filter((k) => vars[k]).map((k) => `${k}=${vars[k]}`),
    "",
  ];
  writeFileSync(filePath, [...kept, ...block].join("\n"), "utf-8");
}

function putWranglerSecret(name, value) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", name], {
    cwd: PORTFOLIO_ROOT,
    input: value,
    encoding: "utf-8",
    shell: true,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    throw new Error(`wrangler secret put ${name} failed (exit ${r.status})`);
  }
}

const wcEnv = parseEnvFile(resolve(WC_ROOT, ".env"));
const pulled = Object.fromEntries(
  AI_KEYS.filter((k) => wcEnv[k]).map((k) => [k, wcEnv[k]]),
);

if (!Object.keys(pulled).length) {
  console.error(`No AI keys found in ${resolve(WC_ROOT, ".env")}`);
  process.exit(1);
}

console.log(`Pulled from war-council: ${Object.keys(pulled).join(", ")}`);

upsertDevVars(
  resolve(PORTFOLIO_ROOT, ".dev.vars"),
  pulled,
  "# AI keys synced from war-council/.env — never commit.",
);

upsertDevVars(
  resolve(CLOUDPILOT_ROOT, ".dev.vars"),
  pulled,
  "# AI keys synced from war-council/.env — never commit.",
);

console.log("Updated .dev.vars in milkman-portfolio and CloudPilot");

if (process.argv.includes("--cloud")) {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.warn("CLOUDFLARE_API_TOKEN not set — skipping wrangler secret upload");
  } else {
    for (const name of CLOUD_WORKER_SECRETS) {
      if (!pulled[name]) continue;
      console.log(`Uploading Worker secret ${name}...`);
      putWranglerSecret(name, pulled[name]);
    }
    console.log("Cloud Worker secrets updated.");
  }
}
