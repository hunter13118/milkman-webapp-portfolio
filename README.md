# milkman-webapp-portfolio

Engineer portfolio for the **AI-era job security** narrative — resume sections, skills, experience, and embedded project showcases (scroll tours + preview cards).

| Project | Showcase | Live (optional) |
|---------|----------|-------------------|
| MilkMan Audiobook Generator | In-page scroll/card embed | `VITE_MILKMAN_APP_URL` |
| War Council | In-page scroll/card embed | `VITE_WAR_COUNCIL_URL` |
| CloudPilot | `/projects/cloudpilot/` (Clerk-gated) | built into portfolio deploy |
| Copilot TTS | GitHub link | repo URL in env |

## Auth boundary

**`/` (this resume site) is always public** — no `ClerkProvider`, no sign-in gate. Clerk is the shared identity provider for embedded tools only:

| Path | Auth |
|------|------|
| `/` | Public portfolio |
| `/projects/cloudpilot/` | Clerk required |
| `/projects/*/` | Clerk required (each sub-app embeds its own gate) |

The publishable key in `wrangler.toml` is baked into **sub-app builds** at integrate time, not into the portfolio shell.

## Mobile / iOS troubleshooting

If the site works on desktop but **not on your phone**:

1. **Use `https://hunterthemilkman.com` (no `www`)** — `www.hunterthemilkman.com` has no DNS record yet. iOS autofill often adds `www`, which fails with “server not found”.
2. **Add a `www` CNAME in Cloudflare DNS** (optional): `www` → `hunterthemilkman.com`, proxied — the worker then redirects www → apex.
3. **Enable “Always Use HTTPS”** in Cloudflare → SSL/TLS → Edge Certificates (worker also forces http → https).
4. **`/projects/*` sign-in** uses redirect-based Clerk (not modal) for iOS Safari compatibility.

## Local dev

```powershell
cd D:\milkman-portfolio
npm install
npm run dev
```

Open **http://localhost:5180/** — Vite proxies sibling showcase assets when `../personal webapp portfolio` and `../war-council` exist.

Refresh vendored showcase files from siblings:

```powershell
npm run sync:showcase
```

Full local stack (portfolio + Battle Log on `:3737`):

```powershell
npm run dev:stack
```

Copy `.env.example` → `.env` and set live URLs for local demos:

```env
VITE_MILKMAN_APP_URL=http://localhost:3000
VITE_WAR_COUNCIL_URL=http://localhost:3737/command-center
```

## Cloudflare Workers Builds (Git — recommended)

Cloudflare runs **build**, then **deploy**, as separate steps. In **Settings → Build**:

| Field | Command |
|-------|---------|
| **Build command** | `npm run build` |
| **Deploy command** (production branch) | `npx wrangler deploy` |
| **Non-production branch deploy command** | `npx wrangler versions upload` |

Set **Node version** to `20` (`NODE_VERSION=20`). Enable **Builds for non-production branches** for PR preview URLs.

Preview branches use `versions upload` — same build, preview URL only, production untouched.

Optional env vars:

| Variable | Purpose |
|----------|---------|
| `VITE_MILKMAN_APP_URL` | Live audiobook app link |
| `VITE_WAR_COUNCIL_URL` | Live Command Center link |
| `VITE_CLERK_PUBLISHABLE_KEY` | CloudPilot Clerk key (baked in at build) |

Worker **secrets** (dashboard, not build): `GEMINI_API_KEY`, `CLERK_JWKS_URL`, optional `CLERK_ISSUER` — see `D:/CloudPilot/docs/CLERK_SETUP.md`.

### Manual deploy (Wrangler CLI — source of truth)

One-shot setup (login → Clerk secrets → build → deploy):

```powershell
cd D:\milkman-portfolio
npm run cf:setup
```

Or step-by-step after `npm run cf:login`:

```powershell
npm run cf:secrets   # upload CLERK_JWKS_URL + CLERK_ISSUER (GEMINI optional)
npm run cf:deploy    # build + wrangler deploy
npm run cf:verify    # whoami + secret list
```

Validate config locally without Cloudflare auth:

```powershell
npx wrangler deploy --dry-run
```

Legacy Pages deploy (deprecated — no Worker API routes):

```powershell
npm run pages:deploy
```

## Cloudflare Pages (legacy Git-only UI)

## Project structure

```
src/
  App.jsx              # Single-page layout (nav, hero, projects, experience)
  config/site.js       # VITE_* URL resolution
  components/          # MilkmanShowcase, WarCouncilShowcase embeds
  data/                # profile, projects, experience, testimonials
public/
  showcase/wc/         # Vendored web component scripts (synced at build)
  showcase/screenshots/
wrangler.toml          # Workers static assets + SPA routing
```

## Cursor workspace

Add `D:\milkman-portfolio` alongside `personal webapp portfolio`, `war-council`, and `copilot-tts` for full local showcase refresh via `npm run sync:showcase`.
