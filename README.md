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

## Deploy (Vercel)

The chat ("Ask Jeeyoung-bot") needs the Azure key to live server-side so visitors don't have to paste a key (and the key never ships in the browser). `api/chat.js` is a Vercel-style serverless function that holds the key and forwards to Azure.

1. Push the repo to GitHub.
2. Import the repo on [vercel.com](https://vercel.com/new) — no build step, framework preset "Other".
3. In **Settings → Environment Variables**, add:
   - `AZURE_ENDPOINT` — full URL, e.g. `https://travel-planning-bot-resource.services.ai.azure.com/api/projects/travel-planning-bot/openai/v1/responses`
   - `AZURE_KEY` — the api-key from Azure AI Foundry
   - `AGENT_NAME` — `jeeyoungbot`
   - `AGENT_VERSION` — `2`
   - `ALLOWED_ORIGIN` — once you know the prod URL, set this to it (e.g. `https://trip-plan.vercel.app`). Defaults to `*` if unset, which is open to anyone.
4. Deploy. The site loads at the Vercel URL; chat hits `/api/chat` automatically.

### Rotate the Azure key

Generate a new key in the Azure portal, update `AZURE_KEY` in Vercel, redeploy. The old key can then be deleted. The browser bundle never references the key, so rotations don't require a code change.

### Local development

For local iteration, drop a `config.local.js` (gitignored) at the repo root to short-circuit the proxy and call Azure directly from the browser:

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
