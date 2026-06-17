# One-shot Cloudflare setup for milkman-webapp-portfolio (Wrangler CLI)
# Run from repo root:  npm run cf:setup
#
# 1. Logs in via browser (approve the popup immediately)
# 2. Uploads Clerk JWKS secrets for CloudPilot edge auth
# 3. Deploys the worker and hits the health endpoint

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$wcEnv = Join-Path (if ($env:WAR_COUNCIL_ROOT) { $env:WAR_COUNCIL_ROOT } else { "D:\war-council" }) ".env"
if (Test-Path $wcEnv) {
  Write-Host "`n=== Step 0: Sync AI keys from war-council ===" -ForegroundColor Cyan
  node scripts/sync-secrets-from-war-council.mjs --cloud
} else {
  Write-Host "war-council .env not found at $wcEnv — skipping key sync" -ForegroundColor Yellow
}

$CLERK_JWKS = "https://bursting-tarpon-65.clerk.accounts.dev/.well-known/jwks.json"
$CLERK_ISSUER = "https://bursting-tarpon-65.clerk.accounts.dev"

Write-Host "`n=== Step 1: Wrangler login ===" -ForegroundColor Cyan
Write-Host "A browser tab will open — click Allow / Authorize right away.`n"
npx wrangler login
if ($LASTEXITCODE -ne 0) { throw "wrangler login failed" }

Write-Host "`n=== Step 2: Who am I? ===" -ForegroundColor Cyan
npx wrangler whoami

Write-Host "`n=== Step 3: Upload secrets ===" -ForegroundColor Cyan
$CLERK_JWKS | npx wrangler secret put CLERK_JWKS_URL
$CLERK_ISSUER | npx wrangler secret put CLERK_ISSUER

$gemini = $env:GEMINI_API_KEY
if ($gemini) {
  $gemini | npx wrangler secret put GEMINI_API_KEY
  Write-Host "GEMINI_API_KEY set from environment." -ForegroundColor Green
} else {
  Write-Host "Skipping GEMINI_API_KEY (set `$env:GEMINI_API_KEY first, or run: npx wrangler secret put GEMINI_API_KEY)" -ForegroundColor Yellow
}

Write-Host "`n=== Step 4: Build + deploy ===" -ForegroundColor Cyan
npm run build
npx wrangler deploy

Write-Host "`n=== Step 5: Verify ===" -ForegroundColor Cyan
npx wrangler secret list
Write-Host "`nDeployed. Test CloudPilot health (replace host if custom domain differs):" -ForegroundColor Green
Write-Host "  curl https://hunterthemilkman.com/projects/cloudpilot/api/v1/health"
Write-Host "  curl https://milkman-webapp-portfolio.<your-subdomain>.workers.dev/projects/cloudpilot/api/v1/health"
Write-Host ""
