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

## Cloudflare Pages

The site is **fully static** after `npm run build` — no backend required. Showcases use vendored web components + Playwright screenshots under `public/showcase/`.

### Connect GitHub (recommended)

1. Push this repo to GitHub (`milkman-webapp-portfolio`).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version:** `20` (or set `NODE_VERSION=20` env var)
4. Optional environment variables (Production + Preview):

   | Variable | Purpose |
   |----------|---------|
   | `VITE_MILKMAN_APP_URL` | Live audiobook app link (CTA + health badge) |
   | `VITE_WAR_COUNCIL_URL` | Live Command Center link |
   | `VITE_*_REPO_URL` | GitHub fallbacks when live URLs are empty |

When live URLs are unset, CTAs fall back to GitHub repos — scroll tours still work from bundled screenshots.

### Manual deploy (Wrangler)

```powershell
npm run pages:deploy
```

Requires `npx wrangler login` once.

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
wrangler.toml          # Pages output dir
```

## Cursor workspace

Add `D:\milkman-portfolio` alongside `personal webapp portfolio`, `war-council`, and `copilot-tts` for full local showcase refresh via `npm run sync:showcase`.
