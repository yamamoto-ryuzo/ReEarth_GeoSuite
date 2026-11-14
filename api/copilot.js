const https = require('https');
const { URL } = require('url');

// Server-side relay for the "GitHub Copilot (API)" chat provider.
//
// The plugin widget iframe cannot reach two endpoint families directly:
//   - github.com OAuth device-flow endpoints (no CORS at all)
//   - *.githubcopilot.com /responses (OPTIONS is not implemented, so the
//     CORS preflight itself fails)
// so those calls are relayed through this function. Other Copilot API calls
// go direct from the browser (api.github.com / api.githubcopilot.com answer
// CORS preflights) and only fall back to this relay on network failure.
//
// GET|POST /api/copilot?url=<target>
//
// Target URLs are restricted to the hosts/paths the provider actually needs —
// this is a BYO-token relay (the visitor's own GitHub token is forwarded in
// the Authorization header), not a key store and not an open proxy:
//   POST https://github.com/login/device/code
//   POST https://github.com/login/oauth/access_token
//   GET  https://api.github.com/copilot_internal/*
//   GET  https://*.githubcopilot.com/models
//   POST https://*.githubcopilot.com/chat/completions
//   POST https://*.githubcopilot.com/responses
//
// NOTE: this endpoint is intentionally public — sandboxed plugin iframes send
// Origin: null, so referrer-based filtering is impossible (same trade-off as
// /api/gemini). Abuse surface is small: the allowlist only covers GitHub/
// Copilot API hosts and every upstream call still needs the caller's own
// GitHub credential.

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 55000;

// Headers forwarded to the upstream target (everything else is dropped).
const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'accept',
  'editor-version',
  'editor-plugin-version',
  'copilot-integration-id',
  'openai-intent',
  'openai-beta',
  'x-github-api-version',
  'copilot-vision-request',
];

function targetAllowed(method, url) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  if (method === 'POST' && host === 'github.com') {
    return path === '/login/device/code' || path === '/login/oauth/access_token';
  }
  if (method === 'GET' && host === 'api.github.com') {
    return path.indexOf('/copilot_internal/') === 0;
  }
  if (host === 'api.githubcopilot.com' || /(^|\.)githubcopilot\.com$/.test(host)) {
    if (method === 'GET') return path === '/models';
    if (method === 'POST') return path === '/chat/completions' || path === '/responses';
  }
  return false;
}

module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  // Echo the requested headers so browser preflights for Authorization and
  // the Copilot Editor-* headers succeed (same idea as the Canvas /api/mcp
  // relay, which is same-origin and needs no preflight handling at all).
  const reqHeaders = req.headers['access-control-request-headers'];
  res.setHeader(
    'Access-Control-Allow-Headers',
    reqHeaders || ('Content-Type,' + FORWARD_HEADERS.join(','))
  );
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  const sendJson = function (status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  if (req.method !== 'GET' && req.method !== 'POST') {
    sendJson(405, { error: 'method not allowed' });
    return;
  }

  let target;
  try {
    const self = new URL(req.url, 'http://localhost');
    target = new URL(String(self.searchParams.get('url') || ''));
  } catch (e) {
    sendJson(400, { error: 'invalid url' });
    return;
  }
  if (target.protocol !== 'https:') {
    sendJson(400, { error: 'https only' });
    return;
  }
  if (!targetAllowed(req.method, target)) {
    sendJson(403, { error: 'target not allowed' });
    return;
  }

  let body = '';
  let tooBig = false;
  req.on('data', chunk => {
    body += chunk;
    if (!tooBig && body.length > MAX_BODY_BYTES) {
      tooBig = true;
      sendJson(413, { error: 'payload too large' });
    }
  });
  req.on('end', () => {
    if (tooBig || res.writableEnded) return;

    const headers = {};
    FORWARD_HEADERS.forEach(h => {
      if (req.headers[h] !== undefined) headers[h] = req.headers[h];
    });
    // api.github.com rejects requests without a User-Agent.
    headers['user-agent'] = 'geo_suite-copilot-relay';
    if (body.length && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    const upstream = https.request({
      hostname: target.hostname,
      port: 443,
      path: target.pathname + target.search,
      method: req.method,
      headers: headers,
      timeout: UPSTREAM_TIMEOUT_MS,
    }, up => {
      const chunks = [];
      let size = 0;
      let overflow = false;
      up.on('data', c => {
        size += c.length;
        if (size > MAX_RESPONSE_BYTES) { overflow = true; up.destroy(); return; }
        chunks.push(c);
      });
      up.on('end', () => {
        if (overflow) { sendJson(502, { error: 'upstream response too large' }); return; }
        res.statusCode = up.statusCode || 502;
        const ct = up.headers['content-type'];
        if (ct) res.setHeader('Content-Type', ct);
        res.end(Buffer.concat(chunks));
      });
      up.on('error', e => { sendJson(502, { error: String(e && e.message || e) }); });
    });
    upstream.on('timeout', () => {
      upstream.destroy();
      sendJson(504, { error: 'upstream timeout' });
    });
    upstream.on('error', e => { sendJson(502, { error: String(e && e.message || e) }); });
    if (body.length) upstream.write(body);
    upstream.end();
  });
};
