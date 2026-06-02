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

const STATE_KEY = 'shared';        // single shared bucket for this trip
const EMPTY_STATE = { added: [], hidden: [], brief: {} };

// GET  /state → current { added, hidden, brief }
// POST /state → overwrite with the posted { added, hidden, brief }
// Backed by the KV namespace bound as TRIP_STATE. If the binding is missing
// (not yet created), GET returns empty state and POST is a no-op so the client
// degrades gracefully instead of erroring.
async function handleState(request, env, headers) {
  if (request.method === 'GET') {
    if (!env.TRIP_STATE) return new Response(JSON.stringify(EMPTY_STATE), { status: 200, headers });
    const raw = await env.TRIP_STATE.get(STATE_KEY);
    // Patch missing brief on older stored payloads so the client always sees the field.
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
    // Trip brief — free-form object with size cap; reject anything > 16 KB
    // to keep KV writes bounded.
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
    if (env.TRIP_STATE) await env.TRIP_STATE.put(STATE_KEY, JSON.stringify(clean));
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

    // Shared trip state (saved/hidden pins) — persisted in KV so all devices
    // sharing this trip see the same map. Single shared bucket; this is a
    // private 4-person trip app, not multi-tenant.
    if (url.pathname === '/state' || url.pathname === '/state/') {
      return handleState(request, env, baseHeaders);
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
