# NYC Trip Itinerary

Interactive map-based itinerary site for a NYC trip, May 28—31, 2026.

## Files

- `index.html` — Single-file site, all CSS + JS inline. Uses Leaflet CDN for the map.
- `CLAUDE.md` — Working notes for AI-assisted iteration.

## Run

```bash
# Just open it
open index.html

# Or serve locally (so external resources load reliably)
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Stack

- Leaflet 1.9.4 (CDN) for the map
- CARTO Positron tiles (neutral light theme) with OpenStreetMap fallback on tile errors
- Vanilla JS, no build step
- Fonts: Fraunces (display) + DM Sans + Noto Sans KR + JetBrains Mono via Google Fonts

## Layout

CSS Grid with named areas (`hero / tabs / map / list / info`):
- Desktop: two-column, sidebar left + map right, sidebar scrolls independently
- Mobile (≤900px): single column, tabs sticky at top, map sticky below tabs, list scrolls underneath

## Data

Itinerary stops are defined in the `itinerary` array at the top of the `<script>` block. Each stop:

```js
{
  day: 1,                          // 1, 2, or 3
  num: 6,                          // sequential 1—12 across all days
  time: '5:30 PM',
  name: 'Raku Soho',
  lat: 40.7272479, lng: -74.0025495,  // null for TBD stops
  address: '48 MacDougal St',
  note: '...',                     // Korean note
  gmaps: 'https://...',            // optional Google Maps link
  featured: true,                  // optional, adds ring around marker
  tag: 'Reserved',                 // optional pill text
  tbd: false                       // optional, dashed marker + italic name
}
```

## Color tokens

Neutral palette in `:root`:
- `--bg` / `--panel` / `--card` — warm cream backgrounds
- `--ink` / `--ink-2/3/4` — text scale, charcoal to soft gray
- `--day-1` / `--day-2` / `--day-3` — dark / medium / light gray for day differentiation
- `--rule` / `--rule-soft` — borders

## Deploy

The static site lives on **GitHub Pages**. The chat needs a separate server-side proxy so visitors don't have to paste an API key — GitHub Pages can't run server code, so the proxy lives on a free **Cloudflare Worker**.

### 1. Static site → GitHub Pages

Settings → Pages → Deploy from a branch → `main` / root. The site lands at `https://<you>.github.io/trip-plan/`.

### 2. Chat proxy → Cloudflare Worker

Full instructions in [`worker/README.md`](worker/README.md). Short version:

```bash
npm install -g wrangler
wrangler login
cd worker
wrangler secret put AZURE_ENDPOINT  # paste full URL
wrangler secret put AZURE_KEY       # paste Azure api-key
wrangler secret put AGENT_NAME      # paste: jeeyoungbot
wrangler secret put AGENT_VERSION   # paste: 2
wrangler secret put ALLOWED_ORIGIN  # paste your GitHub Pages origin
wrangler deploy
```

`wrangler deploy` prints a URL. Open `index.html`, find the `PROXY_URL` constant, paste the URL, commit, push. The Pages site picks up the new URL on its next deploy. Visit the Worker URL in a browser (`GET`) to confirm it returns `{"ok":true,"configured":true}`.

### Rotate the Azure key

Generate a new key in the Azure portal → `wrangler secret put AZURE_KEY` again. Secrets update live; no redeploy needed. The browser bundle never references the key, so rotations don't require a code change.

### Local development

For local iteration without the Worker, drop a `config.local.js` (gitignored) at the repo root to short-circuit the proxy and call Azure directly from the browser:

```js
window.TRIP_CONFIG = {
  provider: 'azure-responses',
  endpoint: 'https://travel-planning-bot-resource.services.ai.azure.com/api/projects/travel-planning-bot/openai/v1/responses',
  apiKey: 'YOUR_AZURE_KEY',
  agent: { name: 'jeeyoungbot', version: '2' },
};
```

Then `python3 -m http.server 8000` and visit `http://localhost:8000`. This file is gitignored — never commit it.

## Known TODOs

- Stop 14 (Saturday afternoon) — three options listed as sub-points; final pick is day-of
- Consider serving Leaflet inline if hosting on a sandbox-restricted environment (iOS Files preview, etc.)
- Add print stylesheet variant for offline reference
