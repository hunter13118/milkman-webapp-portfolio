import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const portfolioRoot = path.resolve(__dirname, "..");

/** Must decode to *.clerk.accounts.dev$ */
export const CLERK_PUBLISHABLE_FALLBACK =
  "pk_test_YnVyc3RpbmctdGFycG9uLTY1LmNsZXJrLmFjY291bnRzLmRldiQ";

export function decodeClerkDomain(publishableKey) {
  const payload = publishableKey.replace(/^pk_(test|live)_/, "");
  return Buffer.from(payload, "base64").toString("utf8");
}

export function assertValidClerkKey(key, label = "Clerk key") {
  const domain = decodeClerkDomain(key);
  if (!domain.endsWith(".dev$") && !domain.endsWith(".com$")) {
    throw new Error(`${label} decodes to invalid domain "${domain}" (expected *.clerk.accounts.dev$)`);
  }
  return domain;
}

/** Prefer env → wrangler.toml → documented fallback (single source of truth). */
export function resolveClerkPublishableKey() {
  if (process.env.VITE_CLERK_PUBLISHABLE_KEY) {
    assertValidClerkKey(process.env.VITE_CLERK_PUBLISHABLE_KEY, "VITE_CLERK_PUBLISHABLE_KEY");
    return process.env.VITE_CLERK_PUBLISHABLE_KEY;
  }
  const tomlPath = path.join(portfolioRoot, "wrangler.toml");
  if (fs.existsSync(tomlPath)) {
    const toml = fs.readFileSync(tomlPath, "utf8");
    const m = toml.match(/VITE_CLERK_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/);
    if (m?.[1]) {
      assertValidClerkKey(m[1], "wrangler.toml VITE_CLERK_PUBLISHABLE_KEY");
      return m[1];
    }
  }
  assertValidClerkKey(CLERK_PUBLISHABLE_FALLBACK, "CLERK_PUBLISHABLE_FALLBACK");
  return CLERK_PUBLISHABLE_FALLBACK;
}
