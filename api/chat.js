// Vercel-style serverless function — Node.js runtime.
// Browser POSTs { input: [...] } here; we add the Azure api-key + the
// agent_reference and forward to the Foundry Responses endpoint.
//
// Required env vars (set in the host dashboard):
//   AZURE_ENDPOINT — full URL ending in /openai/v1/responses
//   AZURE_KEY      — the api-key value
//   AGENT_NAME     — e.g. "jeeyoungbot"
//   AGENT_VERSION  — e.g. "2"
// Optional:
//   ALLOWED_ORIGIN — exact origin to allow (e.g. https://trip-plan.vercel.app).
//                    Defaults to "*" if unset; set this once you know the prod URL.

const REQUIRED_ENVS = ['AZURE_ENDPOINT', 'AZURE_KEY', 'AGENT_NAME', 'AGENT_VERSION'];

function corsHeaders(origin, allowed) {
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || '*';
  const origin = req.headers.origin || '';
  const headers = corsHeaders(origin, allowed);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Health check — `GET /api/chat` returns {ok: true, configured: bool}.
  // Lets the client probe whether the proxy is reachable before sending.
  if (req.method === 'GET') {
    const missing = REQUIRED_ENVS.filter(k => !process.env[k]);
    return res.status(200).json({ ok: true, configured: missing.length === 0, missing });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed. Use POST.' } });
  }

  if (allowed !== '*' && origin && origin !== allowed) {
    return res.status(403).json({ error: { message: 'Origin not allowed' } });
  }

  const missing = REQUIRED_ENVS.filter(k => !process.env[k]);
  if (missing.length) {
    return res.status(500).json({ error: { message: 'Server not configured: missing ' + missing.join(', ') } });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  if (!body || typeof body !== 'object') body = {};
  if (!Array.isArray(body.input)) {
    return res.status(400).json({ error: { message: 'Body must include an `input` array of messages' } });
  }

  // Pin the agent — the client can't pick a different agent/model through this proxy.
  body.agent_reference = {
    type: 'agent_reference',
    name: process.env.AGENT_NAME,
    version: String(process.env.AGENT_VERSION),
  };
  delete body.model;

  try {
    const upstream = await fetch(process.env.AZURE_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': process.env.AZURE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: { message: e.message || 'Upstream error' } });
  }
}
