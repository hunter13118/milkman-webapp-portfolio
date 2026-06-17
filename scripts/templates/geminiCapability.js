const SESSION_KEY = "portfolio.byok.gemini";

let capability = {
  getToken: async () => null,
  isTrusted: () => false,
  getKey: () => (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null),
};

export function isTrustedClerkUser(user) {
  if (!user) return false;
  const role = user.publicMetadata?.role;
  const tier = user.publicMetadata?.tier;
  if (role === "operator") return true;
  return ["personal_friend", "friend", "admin", "owner"].includes(String(tier || ""));
}

export function configureGeminiCapability(partial) {
  capability = { ...capability, ...partial };
}

export function setByokGeminiKey(key) {
  if (key) sessionStorage.setItem(SESSION_KEY, key);
  else sessionStorage.removeItem(SESSION_KEY);
}

export function getByokGeminiKey() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function geminiCapabilityMode() {
  if (capability.isTrusted?.()) return "operator";
  if (capability.getKey?.()) return "byok";
  return "needs_key";
}

export async function getGeminiAuthHeaders() {
  const headers = {};
  const token = await capability.getToken?.();
  if (!token) return null;
  headers.Authorization = `Bearer ${token}`;

  if (capability.isTrusted?.()) return headers;

  const key = capability.getKey?.();
  if (!key) return null;
  headers["X-Gemini-Key"] = key;
  return headers;
}

export function apiUrl(path) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  return `${base}/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}
