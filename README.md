# Trip Plan

A map-first, AI-assisted **trip itinerary** as a single static HTML page.
Built for a 4-person NYC weekend (May 29–31, 2026); easy to fork for any trip.

> 🗺️ **Live demo:** https://jeeyoungjung.github.io/trip-plan/

---

## What it does

- **Map + sidebar** stay in sync — tap a stop, the map flies; tap a marker, the list scrolls.
- An **AI travel assistant** ("Travel Bot" in EN, "현서비서" in KO) backed by Azure AI Foundry, proxied through a Cloudflare Worker so the API key never ships in the browser.
- **Favorites + Trash** persist across devices via Cloudflare KV — every traveler sees the same map.
- A **Trip Brief** captures purpose, travelers, preferences, constraints; the AI reads it on every reply.
- **Localized** — English / Korean toggle, persisted in the URL.
- **PWA** — installable, offline-capable app shell.

---

## Feature tour

| Area | What you can do |
|---|---|
| Header | Day tabs (auto-jumps to today during the trip), language toggle, **Trip Brief** modal |
| Map | Pulsing **📍 Locate me**, **Directions →** link in every popup, favorited markers raised to the top, collapsible legend, **Trash** mode reveals deleted pins for restore |
| Sidebar list | Click any place → marker pops above its neighbors; **Now / Next** badges during the trip; favorite ★ / remove 🗑 per place |
| Chat (👤 bottom-right) | Suggestion chips, **📍 Near you** chips when you've shared location (coffee · pizza · shopping · restroom), agent gets your location + NYC current time + Trip Brief automatically |
| "+ Add a place" | Search popover that calls the agent and returns clickable matches with coords pre-filled |
| Trip Brief → All places | Read-only metadata table of every itinerary place, plus editable Favorite cards |

---

## Fork it for your own trip

You'll need:

- A **GitHub** account (free) — to host the static site
- A **Cloudflare** account (free) — to run the Worker proxy + KV store
- An **Azure** account with access to **Azure AI Foundry** — to serve the LLM
- **Node.js 18+** locally — to run the Wrangler CLI

The whole setup takes ~30 minutes if you've never done it before.

### Step 1 — Fork + enable GitHub Pages

1. Fork this repo on GitHub.
2. In your fork: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push any commit (or the included Pages workflow runs on the next push). Your site lands at `https://<your-username>.github.io/trip-plan/`.

### Step 2 — Set up your Azure LLM

The site talks to an **Azure AI Foundry Responses API** endpoint. You can use a plain model deployment or a Foundry **Agent** (gives you tools like web_search). The repo defaults to the Agent path.

1. Sign in to **Azure AI Foundry** at https://ai.azure.com.
2. **Create a project** (or pick an existing one).
3. **Deploy a model** under the project — `gpt-4o-mini` is a good default. Note the deployment name; we won't use it directly but it backs your Agent.
4. *(Recommended)* **Create an Agent**: Agents tab → New Agent. Give it instructions ("You are a concise travel assistant…"), attach tools (e.g. **web_search** so it can look up real places), then **Publish**. Note:
   - The Agent **name** (e.g. `my-trip-bot`)
   - The Agent **version** (starts at `1`)
5. Grab credentials from the project's **Overview / API keys** pane:
   - **Endpoint** — looks like `https://<your-resource>.services.ai.azure.com/api/projects/<your-project>/openai/v1/responses` *(note the path ends in `/v1/responses` — do not add `?api-version=…`)*
   - **API Key** — one of the two `key1` / `key2` values

Keep both nearby; you'll paste them into the Cloudflare Worker as secrets in Step 3.

> 💡 If you'd rather skip the Agent and use a plain model, set `agent: null` in `config.local.js` (local dev) and adjust the Worker accordingly. The repo's default path uses an Agent because it lets the bot use web_search.

### Step 3 — Deploy the Cloudflare Worker (proxy + KV)

The Worker keeps your Azure key server-side, locks requests to your site's origin, and persists your favorites/brief in Cloudflare KV so all travelers see the same map.

```bash
# Install Wrangler if you haven't
npm install -g wrangler

# Log in to Cloudflare (browser flow)
wrangler login

# Set secrets (you'll be prompted to paste each value)
cd worker
wrangler secret put AZURE_ENDPOINT
#   Paste the /v1/responses URL from Step 2
wrangler secret put AZURE_KEY
#   Paste key1 or key2 from Step 2
wrangler secret put AGENT_NAME
#   Paste your Agent name (e.g. my-trip-bot)
wrangler secret put AGENT_VERSION
#   Paste the Agent version (e.g. 1)

# ⚠️ Lock the Worker to YOUR GitHub Pages origin (closes the open proxy)
wrangler secret put ALLOWED_ORIGIN
#   Paste e.g. https://your-username.github.io

# Create the KV namespace for shared favorites + brief
npx wrangler kv namespace create TRIP_STATE
#   Copy the printed id = "..." line into worker/wrangler.toml
#   (replacing REPLACE_WITH_KV_NAMESPACE_ID)

# Deploy
wrangler deploy
```

`wrangler deploy` prints a URL like `https://<your-worker-name>.<your-cf-subdomain>.workers.dev`. **Copy it.**

### Step 4 — Point the site at your Worker

In your fork's `index.html`, search for `PROXY_URL` (one line near the chat code) and replace it with the URL from Step 3:

```js
const PROXY_URL = 'https://<your-worker-name>.<your-cf-subdomain>.workers.dev';
```

Commit + push. GitHub Pages rebuilds, and the chat now uses your Worker → your Azure key → your model/Agent.

### Verify it works

```bash
# Health check — should print { ok: true, configured: true, missing: [] }
curl https://<your-worker-name>.<your-cf-subdomain>.workers.dev

# Should be 403 (origin locked)
curl -X POST https://<your-worker-name>.<your-cf-subdomain>.workers.dev/state \
  -H 'Content-Type: application/json' -d '{}'

# Should be 200 (your origin allowed)
curl -X POST https://<your-worker-name>.<your-cf-subdomain>.workers.dev/state \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://<your-username>.github.io' \
  -d '{}'
```

Then open the live site, click the 👤 chat button, send "where can I get coffee near Times Square?" — you should get a reply with map markers.

### Rotate the Azure key

`wrangler secret put AZURE_KEY` again with the new value — secrets update live, no redeploy needed. Nothing in the browser changes.

---

## Local development (no Wrangler needed)

For iterating without the Worker, drop a **`config.local.js`** at the repo root (it's gitignored — never committed):

```js
window.TRIP_CONFIG = {
  provider: 'azure-responses',
  endpoint: 'https://<your-resource>.services.ai.azure.com/api/projects/<your-project>/openai/v1/responses',
  apiKey: '<your-azure-api-key>',
  agent: { name: '<your-agent-name>', version: '1', displayName: 'Travel Bot' },
};
```

Then serve locally:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

The chat calls Azure directly from your browser. **Never commit this file** — it contains a live key.

---

## Customize the itinerary

The itinerary is a JS array at the top of `index.html`'s inline `<script>`. Each stop has the shape:

```js
{
  day: 1,                                   // 1, 2, or 3
  num: 6,                                   // sequential
  time: '5:30 PM',
  name: 'Raku Soho',                        // string OR { ko, en } for bilingual
  lat: 40.7272479, lng: -74.0025495,        // null for TBD stops
  address: '48 MacDougal St',
  transit: { ko: '…', en: '…' },            // optional
  note: { ko: '…', en: '…' },
  gmaps: 'https://maps.google.com/?q=…',
  featured: true,                           // optional, ring around marker
  tag: 'Reserved',                          // optional pill text
  points: [                                 // optional sub-points (Coffee/Food/Shopping/Books/Design)
    { name: '…', lat: …, lng: …, category: 'Coffee', addr: '…', note: { ko, en } }
  ],
  routeOptions: [                           // optional Walk/Subway/Uber details
    { mode: 'walk', label: 'Walk', time: '25 min', cost: 'Free', best: true, detail: '…' }
  ]
}
```

Other knobs worth knowing:

- **Trip dates** — `TRIP_DATES` constant maps day-tabs to ISO dates for the auto-today-tab feature.
- **Language default** — `let LANG = … || 'en'` near the top of the script.
- **Brief defaults** — first-open seeds in `seedBriefDefaultsIfEmpty()`; edit to match your trip.

---

## How the parts talk

```
                 GitHub Pages (static)
                 ┌──────────────────────┐
   browser ───►  │  index.html          │
                 │  ├─ Leaflet (CDN)    │
                 │  ├─ service worker   │
                 │  └─ inline JS/CSS    │
                 └──────────┬───────────┘
                            │ fetch
                            ▼
                 Cloudflare Worker
                 ┌──────────────────────┐
                 │  POST /          ──► Azure AI Foundry (chat)
                 │  GET/POST /state ──► KV (favorites + brief + hidden)
                 │  Origin gate         │
                 └──────────────────────┘
```

- **No backend database** of your own — Cloudflare KV is the only stateful piece, and the schema is a single shared bucket per trip.
- **No build step** — `index.html` ships as-is. The GitHub Actions workflow stamps the service-worker version with the commit SHA so deploys invalidate stale clients.
- **No localStorage / sessionStorage** — state lives in the URL hash (deep links) or KV (cross-device sync). Add `config.local.js` for dev-only API keys.

---

## Security notes

- The Azure key never enters the browser — it's a Worker secret. Rotations don't require a code change.
- `ALLOWED_ORIGIN` blocks anyone else from POSTing to your Worker. The check covers `/state` and the chat path; an absent Origin header is rejected too.
- Origin headers are forgeable from `curl` if someone really wants to. For a personal trip app this is acceptable; if you need stronger protection, swap to a shared-secret header or move the model behind a login.
- `config.local.js` is gitignored — if you ever copy it into a tracked location by accident, rotate your Azure key.

---

## Repo layout

```
trip-plan/
├─ index.html              # the whole app (HTML + CSS + JS inline)
├─ manifest.json           # PWA manifest
├─ service-worker.js       # network-first for HTML, cache for assets
├─ icon.svg                # Statue-of-Liberty favicon
├─ worker/
│  ├─ src/index.js         # Cloudflare Worker — proxies chat + serves /state
│  ├─ wrangler.toml        # Worker config (set KV namespace id here)
│  └─ README.md            # Worker-specific notes
├─ .github/workflows/
│  └─ pages.yml            # builds + deploys to GitHub Pages
└─ README.md               # this file
```

---

## License

MIT — fork freely. Credit appreciated, not required.
