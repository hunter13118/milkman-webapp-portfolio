/** Serve completed pack zips from R2 when available (edge download, no origin hop). */

const CACHE_PREFIX = "packs/cache/";
const JOB_PREFIX = "packs/jobs/";

export async function tryPackFromR2(env, { cacheKey, jobId }) {
  if (!env.VAE_PACKS) return null;
  const keys = [];
  if (cacheKey) keys.push(`${CACHE_PREFIX}${cacheKey}.vaepack`);
  if (jobId) keys.push(`${JOB_PREFIX}${jobId}.vaepack`);
  for (const key of keys) {
    const obj = await env.VAE_PACKS.get(key);
    if (obj) return { key, obj };
  }
  return null;
}

export function packDownloadResponse(obj, filename) {
  const headers = new Headers();
  headers.set("Content-Type", "application/zip");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(obj.body, { status: 200, headers });
}
