/**
 * Configure Clerk redirect URLs + portfolio JWT template via Backend API.
 *
 * Usage:
 *   $env:CLERK_SECRET_KEY = "sk_test_…"
 *   node scripts/configure-clerk.mjs
 *
 * Reads optional CLERK_SECRET_KEY from D:/war-council/.env if not in environment.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SPA_PROJECTS } from "./projects.manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLERK_API = "https://api.clerk.com/v1";

function loadSecret() {
  if (process.env.CLERK_SECRET_KEY) return process.env.CLERK_SECRET_KEY;
  const wc = resolve(process.env.WAR_COUNCIL_ROOT || "D:/war-council", ".env");
  if (!existsSync(wc)) return null;
  for (const line of readFileSync(wc, "utf8").split(/\r?\n/)) {
    const m = line.match(/^CLERK_SECRET_KEY=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

function buildRedirectUrls() {
  const hosts = [
    "https://hunterthemilkman.com",
    "https://milkman-webapp-portfolio.hunter13118.workers.dev",
    "http://localhost:5173",
    "http://localhost:5180",
    "http://localhost:8787",
  ];
  const paths = [
    "",
    "/",
    "/projects/cloudpilot/",
    ...SPA_PROJECTS.map((p) => `/projects/${p.slug}/`),
  ];
  const urls = new Set();
  for (const host of hosts) {
    for (const p of paths) {
      urls.add(`${host}${p}`);
      if (p.endsWith("/")) urls.add(`${host}${p.slice(0, -1)}`);
    }
  }
  return [...urls].sort();
}

async function clerkFetch(secret, path, { method = "GET", body } = {}) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return data;
}

async function ensurePortfolioJwtTemplate(secret) {
  const templates = await clerkFetch(secret, "/jwt_templates");
  const existing = (templates || []).find((t) => t.name === "portfolio");
  const claims = {
    role: "{{user.public_metadata.role}}",
    tier: "{{user.public_metadata.tier}}",
  };
  if (existing) {
    await clerkFetch(secret, `/jwt_templates/${existing.id}`, {
      method: "PATCH",
      body: { name: "portfolio", claims },
    });
    console.log("Updated JWT template: portfolio");
    return;
  }
  await clerkFetch(secret, "/jwt_templates", {
    method: "POST",
    body: { name: "portfolio", claims },
  });
  console.log("Created JWT template: portfolio");
}

async function patchInstanceOrigins(secret) {
  const inst = await clerkFetch(secret, "/instance");
  const origins = new Set(inst.allowed_origins || []);
  origins.add("https://hunterthemilkman.com");
  origins.add("https://milkman-webapp-portfolio.hunter13118.workers.dev");
  origins.add("http://localhost:5173");
  origins.add("http://localhost:5180");
  origins.add("http://localhost:8787");
  await clerkFetch(secret, "/instance", {
    method: "PATCH",
    body: {
      home_url: "https://hunterthemilkman.com",
      allowed_origins: [...origins],
    },
  });
  console.log(`Updated instance home_url + ${origins.size} allowed origin(s).`);
}

async function ensureRedirectUrls(secret, urls) {
  const listed = await clerkFetch(secret, "/redirect_urls");
  const rows = Array.isArray(listed) ? listed : listed.data || [];
  const existing = new Set(rows.map((r) => r.url));
  let created = 0;
  for (const url of urls) {
    if (existing.has(url)) continue;
    await clerkFetch(secret, "/redirect_urls", { method: "POST", body: { url } });
    existing.add(url);
    created += 1;
  }
  console.log(`Redirect URLs: ${existing.size} total (${created} newly created).`);
}

async function patchRedirectUrls(secret, urls) {
  // Legacy instance field (may be ignored on newer Clerk API — harmless if so)
  try {
    await clerkFetch(secret, "/instance", {
      method: "PATCH",
      body: {
        home_url: "https://hunterthemilkman.com",
        allowed_redirect_urls: urls,
      },
    });
  } catch {
    /* optional */
  }
  await ensureRedirectUrls(secret, urls.filter((u) => u.startsWith("https://")));
  await patchInstanceOrigins(secret);
}

async function main() {
  const secret = loadSecret();
  if (!secret) {
    console.error("Set CLERK_SECRET_KEY in env or D:/war-council/.env");
    process.exit(1);
  }

  const urls = buildRedirectUrls();
  console.log("Redirect URLs to register:\n", urls.join("\n"), "\n");

  await patchRedirectUrls(secret, urls);
  await ensurePortfolioJwtTemplate(secret);

  console.log("\nDone. Trusted Gemini users: publicMetadata.role=operator OR tier in personal_friend|friend|admin|owner");
  console.log(
    "\n iOS Safari: add Clerk DNS CNAME (clerk.hunterthemilkman.com) in Cloudflare → Clerk Dashboard → DNS for first-party session cookies."
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
