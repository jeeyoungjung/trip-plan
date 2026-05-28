# Cloudflare Worker — Jeeyoung-bot chat proxy

This worker forwards browser chat requests to Azure AI Foundry. The Azure API key lives in the worker (as a secret), so it never ships in the browser bundle. The static site (GitHub Pages) calls the worker's URL.

## One-time setup

```bash
# 1. Install wrangler
npm install -g wrangler

# 2. Sign in to Cloudflare (free account is fine)
wrangler login

# 3. From this directory, set secrets one-by-one
cd worker
wrangler secret put AZURE_ENDPOINT
# Paste: https://travel-planning-bot-resource.services.ai.azure.com/api/projects/travel-planning-bot/openai/v1/responses

wrangler secret put AZURE_KEY
# Paste the Azure api-key

wrangler secret put AGENT_NAME
# Paste: jeeyoungbot

wrangler secret put AGENT_VERSION
# Paste: 2

# Optional: lock the worker to your GitHub Pages origin (recommended for prod)
wrangler secret put ALLOWED_ORIGIN
# Paste: https://jeeyoungjung.github.io

# 4. Create the KV namespace for shared saved/hidden pins (one-time)
npx wrangler kv namespace create TRIP_STATE
# Copy the printed `id = "..."` into wrangler.toml under [[kv_namespaces]]
# (replace REPLACE_WITH_KV_NAMESPACE_ID).

# 5. Deploy
wrangler deploy
```

## Shared trip state (saved / hidden pins)

The site stores the group's added (★) pins and hidden ("trashed") places in
Cloudflare KV so everyone sees the same map on any device. The worker exposes:

- `GET /state` → `{ added: [...], hidden: [...] }`
- `POST /state` → overwrite with the posted state

It's one shared bucket (`shared`) — fine for a private 4-person trip. If the KV
binding isn't set up yet, `GET` returns empty state and `POST` is a no-op, so the
site still works in-session (it just won't sync across devices until KV exists).

`wrangler deploy` prints a URL like `https://jeeyoungbot-proxy.<your-cloudflare-subdomain>.workers.dev`. Copy it.

## Wire the static site

Open `../index.html` and find the `PROXY_URL` constant near the chat section (one line, search for "PROXY_URL"). Replace it with the URL from the previous step, commit, push — GitHub Pages will redeploy.

## Verify

Open your Worker URL in a browser (a `GET`). You should see:

```json
{"ok": true, "configured": true, "missing": []}
```

If `configured` is `false`, the response lists which secrets are missing.

## Update or rotate

- **Update code**: edit `src/index.js`, run `wrangler deploy`.
- **Rotate Azure key**: generate a new key in the Azure portal, then `wrangler secret put AZURE_KEY` again. No redeploy needed — secrets update live.

## Free-tier notes

Workers Free includes ~100k requests/day and 10ms CPU/request, which is more than enough for a 4-person trip's chat traffic. Cold starts on Workers are sub-50ms, so the chat feels instant.
