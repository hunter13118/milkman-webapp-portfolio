/**
 * Runtime URLs for local dev vs Cloudflare Pages.
 * Set VITE_* in Cloudflare Pages → Settings → Environment variables.
 */
const trim = (v) => (typeof v === 'string' ? v.trim() : '');

export const siteUrls = {
  milkmanApp: trim(import.meta.env.VITE_MILKMAN_APP_URL),
  warCouncil: trim(import.meta.env.VITE_WAR_COUNCIL_URL),
  milkmanRepo: trim(import.meta.env.VITE_MILKMAN_REPO_URL) || 'https://github.com/hunter13118/milkman-audiobook-maker',
  warCouncilRepo: trim(import.meta.env.VITE_WAR_COUNCIL_REPO_URL) || 'https://github.com/hunter13118/war-council',
  copilotTtsRepo: trim(import.meta.env.VITE_COPILOT_TTS_REPO_URL) || 'https://github.com/hunter13118/copilot-tts',
};

/** Prefer live app URL, then GitHub repo. */
export function projectHref(liveUrl, repoUrl) {
  return liveUrl || repoUrl || '#';
}

export function isExternalUrl(url) {
  return /^https?:\/\//i.test(url || '');
}
