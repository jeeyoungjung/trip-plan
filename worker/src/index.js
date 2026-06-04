// Cloudflare Worker — proxies browser chat calls to Azure AI Foundry so the
// Azure key lives server-side. The static site (e.g. GitHub Pages) fetches
// this Worker URL; the Worker adds the api-key + pins agent_reference and
// forwards the body to the Azure Responses endpoint.
//
// Required secrets (set via `wrangler secret put`):
//   AZURE_ENDPOINT   — full URL ending in /openai/v1/responses
//   AZURE_KEY        — Azure api-key value
//   AGENT_NAME       — e.g. "jeeyoungbot"
//   AGENT_VERSION    — e.g. "2"
// Optional:
//   ALLOWED_ORIGIN   — exact origin to allow (e.g. https://jeeyoungjung.github.io)
//                      Defaults to "*" if unset.

const REQUIRED = ['AZURE_ENDPOINT', 'AZURE_KEY', 'AGENT_NAME', 'AGENT_VERSION'];

const STATE_KEY_DEFAULT = 'shared';    // legacy bucket (NYC trip)
const TRIPS_INDEX_KEY = 'trips:index'; // JSON array of trip metadata
const EMPTY_STATE = { added: [], hidden: [], brief: {} };

// Maps a trip slug to its KV state key. The NYC trip keeps the legacy
// 'shared' key for backward compatibility; new trips use 'trip:<slug>'.
function stateKeyForTrip(slug) {
  if (!slug || slug === 'nyc-may-2026') return STATE_KEY_DEFAULT;
  // Strict slug shape — kebab-case alnum, max 64 chars.
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(slug)) return null;
  return 'trip:' + slug.toLowerCase();
}

// GET  /state[?trip=<slug>] → current { added, hidden, brief }
// POST /state[?trip=<slug>] → overwrite with the posted { added, hidden, brief }
async function handleState(request, env, headers) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('trip');
  const key = stateKeyForTrip(slug);
  if (key === null) {
    return new Response(JSON.stringify({ error: { message: 'Invalid trip slug' } }), { status: 400, headers });
  }
  if (request.method === 'GET') {
    if (!env.TRIP_STATE) return new Response(JSON.stringify(EMPTY_STATE), { status: 200, headers });
    const raw = await env.TRIP_STATE.get(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (!parsed.brief || typeof parsed.brief !== 'object') parsed.brief = {};
        return new Response(JSON.stringify(parsed), { status: 200, headers });
      } catch { /* fall through to empty */ }
    }
    return new Response(JSON.stringify(EMPTY_STATE), { status: 200, headers });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { body = null; }
    if (!body || typeof body !== 'object') {
      return new Response(JSON.stringify({ error: { message: 'Invalid body' } }), { status: 400, headers });
    }
    let brief = (body.brief && typeof body.brief === 'object') ? body.brief : {};
    const briefStr = JSON.stringify(brief);
    if (briefStr.length > 16 * 1024) {
      return new Response(JSON.stringify({ error: { message: 'brief exceeds 16 KB' } }), { status: 413, headers });
    }
    const clean = {
      added: Array.isArray(body.added) ? body.added.slice(0, 300) : [],
      hidden: Array.isArray(body.hidden) ? body.hidden.slice(0, 1000) : [],
      brief,
      v: 2,
      updated: Date.now(),
    };
    if (env.TRIP_STATE) await env.TRIP_STATE.put(key, JSON.stringify(clean));
    return new Response(JSON.stringify({ ok: true, stored: !!env.TRIP_STATE, key }), { status: 200, headers });
  }
  return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), { status: 405, headers });
}

// GET  /trips → list of trip metadata (array of { slug, title, ... })
// POST /trips → overwrite the index with the posted array
async function handleTrips(request, env, headers) {
  if (request.method === 'GET') {
    if (!env.TRIP_STATE) return new Response('[]', { status: 200, headers });
    const raw = await env.TRIP_STATE.get(TRIPS_INDEX_KEY);
    return new Response(raw || '[]', { status: 200, headers });
  }
  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { body = null; }
    if (!Array.isArray(body)) {
      return new Response(JSON.stringify({ error: { message: 'Body must be an array of trip metadata' } }), { status: 400, headers });
    }
    const clean = body.slice(0, 50);  // cap at 50 trips
    const cleanStr = JSON.stringify(clean);
    if (cleanStr.length > 32 * 1024) {
      return new Response(JSON.stringify({ error: { message: 'trips index exceeds 32 KB' } }), { status: 413, headers });
    }
    if (env.TRIP_STATE) await env.TRIP_STATE.put(TRIPS_INDEX_KEY, cleanStr);
    return new Response(JSON.stringify({ ok: true, stored: !!env.TRIP_STATE }), { status: 200, headers });
  }
  return new Response(JSON.stringify({ error: { message: 'Method not allowed' } }), { status: 405, headers });
}

function corsHeaders(origin, allowed) {
  const allow = (allowed && allowed !== '*' && origin && origin === allowed) ? origin : (allowed || '*');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGIN || '*';
    const baseHeaders = { ...corsHeaders(origin, allowed), 'Content-Type': 'application/json' };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: baseHeaders });
    }

    // Universal origin gate — applies to /state, chat POST, and any future
    // route. When ALLOWED_ORIGIN is configured, every non-OPTIONS request
    // must carry an Origin header that matches exactly. A direct curl/fetch
    // without an Origin header is rejected (closes the previous bypass).
    // The /health GET is exempt so the user can manually verify config.
    const url = new URL(request.url);
    const isHealthCheck = request.method === 'GET' && (url.pathname === '/' || url.pathname === '');
    if (!isHealthCheck && allowed !== '*' && (!origin || origin !== allowed)) {
      return new Response(
        JSON.stringify({ error: { message: 'Origin not allowed' } }),
        { status: 403, headers: baseHeaders }
      );
    }

    // Per-trip state (saved/hidden pins + brief) — persisted in KV so all
    // devices viewing the same trip see the same map. ?trip=<slug> selects
    // which trip; slug 'nyc-may-2026' (or no slug) maps to the legacy 'shared'
    // key for backward compatibility.
    if (url.pathname === '/state' || url.pathname === '/state/') {
      return handleState(request, env, baseHeaders);
    }
    // Trip index — list of trips the homepage shows.
    if (url.pathname === '/trips' || url.pathname === '/trips/') {
      return handleTrips(request, env, baseHeaders);
    }

    // Health check — GET returns whether secrets are configured.
    if (request.method === 'GET') {
      const missing = REQUIRED.filter(k => !env[k]);
      return new Response(
        JSON.stringify({ ok: true, configured: missing.length === 0, missing }),
        { status: 200, headers: baseHeaders }
      );
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: { message: 'Method not allowed. Use POST.' } }),
        { status: 405, headers: baseHeaders }
      );
    }

    const missing = REQUIRED.filter(k => !env[k]);
    if (missing.length) {
      return new Response(
        JSON.stringify({ error: { message: 'Server not configured: missing ' + missing.join(', ') } }),
        { status: 500, headers: baseHeaders }
      );
    }

    let body;
    try { body = await request.json(); } catch { body = {}; }
    if (!body || typeof body !== 'object' || !Array.isArray(body.input)) {
      return new Response(
        JSON.stringify({ error: { message: 'Body must include an `input` array of messages' } }),
        { status: 400, headers: baseHeaders }
      );
    }

    // Pin the agent — the client can't choose a different agent through this proxy.
    body.agent_reference = {
      type: 'agent_reference',
      name: env.AGENT_NAME,
      version: String(env.AGENT_VERSION),
    };
    delete body.model;

    try {
      const upstream = await fetch(env.AZURE_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': env.AZURE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await upstream.text();
      const upstreamCt = upstream.headers.get('content-type') || 'application/json';
      return new Response(text, {
        status: upstream.status,
        headers: { ...baseHeaders, 'Content-Type': upstreamCt },
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: { message: e.message || 'Upstream error' } }),
        { status: 502, headers: baseHeaders }
      );
    }
  },
};
