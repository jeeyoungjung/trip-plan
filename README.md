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

## Known TODOs

- Saturday morning + afternoon (stops 8, 9) — still TBD
- Sunday morning (stop 11) — still TBD
- Consider serving Leaflet inline if hosting on a sandbox-restricted environment (iOS Files preview, etc.)
- Add print stylesheet variant for offline reference
