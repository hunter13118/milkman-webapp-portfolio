# milkman-webapp-portfolio

Engineer portfolio for the **AI-era job security** narrative — resume sections, skills, experience, and embedded project showcases (scroll tours + preview cards).

| Project | Showcase | Live (optional) |
|---------|----------|-------------------|
| MilkMan Audiobook Generator | In-page scroll/card embed | `VITE_MILKMAN_APP_URL` |
| War Council | In-page scroll/card embed | `VITE_WAR_COUNCIL_URL` |
| Copilot TTS | GitHub link | repo URL in env |

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

### Manual deploy (Wrangler CLI)

```powershell
npm run pages:deploy
```

Uses legacy `wrangler pages deploy dist`.

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
  _redirects           # SPA fallback for Cloudflare
wrangler.toml          # Workers static assets config
```

## Cursor workspace

Add `D:\milkman-portfolio` alongside `personal webapp portfolio`, `war-council`, and `copilot-tts` for full local showcase refresh via `npm run sync:showcase`.
