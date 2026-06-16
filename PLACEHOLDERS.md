# Placeholders — fill these for a production-ready portfolio

## Profile (`src/data/profile.js`)

| Field | Status |
|-------|--------|
| Name | Fixed: **Hunter Uhr** |
| `location` | PLACEHOLDER |
| `email` | PLACEHOLDER |
| `github` | PLACEHOLDER |
| `linkedin` | PLACEHOLDER |
| `resumeUrl` | Optional **non-CGI** PDF in `public/` only — do not publish confidential CGI templates |
| `metrics[0].value` (Years shipping) | PLACEHOLDER |

## Experience (`src/data/projects.js` → `experience`)

- Replace role, company, period, and bullets with real history.

## Per-project gaps

### MilkMan Audiobook Generator

- Public demo URL (ngrok or hosted)
- Quantified case study (e.g. clips generated, time saved)

### War Council

- Hosted Command Center demo (optional)
- Document `ollama pull qwen2.5-coder:7b` (and other arsenal models) in README

### Copilot TTS

- Dedicated hero screenshot in `public/assets/`
- One-paragraph product pitch in `projects.js`

## Workspace

Add this folder as a fourth root in your Cursor workspace:

`D:\milkman-portfolio`

Copy `.cursor/mcp.json` pattern from sibling repos after first commit.

## Testimonials (`src/data/testimonials.js`)

Replace both `PLACEHOLDER` testimony blocks with real workplace quotes.

## Optional polish

- OG image + favicon
- Analytics (privacy-friendly)
- Testimonials section
- Blog / writing samples link
