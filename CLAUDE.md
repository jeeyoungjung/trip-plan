# Claude Code Context

Working notes for iterating on this itinerary site.

## What this is

A shareable, mobile-friendly trip itinerary for a 4-person NYC trip (May 28—31, 2026). Map-centric layout — the map is the primary view, the stop list supports it.

## Design intent

- **Editorial, neutral, calm.** Warm cream backgrounds, charcoal text, Fraunces serif for display. No bright accent colors — day differentiation is dark/medium/light gray scale only.
- **Map is the hero.** On desktop it occupies the full right column. On mobile it's sticky under the tabs so it stays visible while scrolling the list.
- **Bilingual but Korean-first for notes.** UI chrome is mostly English (eyebrows, labels, dates) but stop notes are in Korean. `--kr` font variable applied to `.ko` class.
- **Two-way interaction.** Tap a stop in the list → map flies to it + popup opens + list item highlights. Tap a marker → list scrolls to it (desktop) + list item highlights. Day filter tabs filter both views in sync.

## Code patterns

- Single HTML file, no build step. All state lives in DOM + a top-level `itinerary` array.
- Map setup is wrapped in `initMap()` with try/catch — if Leaflet fails to load (sandboxed previews, offline), a fallback message renders in the `#map` div.
- Tile layer has its own error counter — falls back from CARTO to OSM after 3 tile errors.
- `isMobile()` checked at click time, not cached, so layout transitions work without reload.
- `map.invalidateSize()` called at 100/500/1500ms after init to handle sticky-container measurement quirks, and on scroll/resize (debounced).

## Editing stops

All trip data is in the `itinerary` array at the top of the script. Re-order by changing `num`, change day by `day`, add a new stop by appending. Lat/lng pairs come from Google Maps right-click → "What's here". `null` lat/lng renders as a TBD card in the sidebar with no map marker.

## Open questions / next moves

1. Fill Saturday (stops 8, 9) and Sunday morning (11). Options shortlisted in the notes — Brooklyn day, Whitney + Little Island, Met + Central Park, LES + Chinatown.
2. Consider a "share view" — single URL state for which day tab is active, which stop is focused.
3. Maybe add a small day-of weather pill once dates get closer.
4. If hosting somewhere static (Vercel, Netlify, GitHub Pages), the CDN dependencies (Leaflet, Google Fonts) load fine. If embedding inside a sandboxed preview (iOS Files, certain chat apps), inline Leaflet — see the inline script in the conversation history.

## Don't

- Don't add localStorage / sessionStorage. State is intentionally ephemeral. If state persistence is needed, use URL params.
- Don't add accent colors. The neutral palette is the brief.
- Don't introduce a framework. Vanilla is the point — it's a single shareable HTML file.
