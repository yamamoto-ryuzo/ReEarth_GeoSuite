const https = require('https');

// Server-side proxy for Gemini generateContent so the API key can live in
// process.env.GEMINI_API_KEY instead of the plugin's client storage /
// inspector text (both of which are exposed to site visitors).
//
// POST JSON: { model: 'gemini-...', request: <generateContent request body> }
//
// NOTE: this endpoint is intentionally public — sandboxed plugin iframes send
// Origin: null, so referrer-based filtering is impossible. Anyone who finds
// the URL can spend the project's quota, so restrict the key in Google Cloud
// (Generative Language API only + per-day quota limits).
module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  const sendJson = function (status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  if (req.method !== 'POST') { sendJson(405, { error: 'method not allowed' }); return; }

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) { sendJson(503, { error: 'server key not configured' }); return; }

  let body = '';
  let tooBig = false;
  req.on('data', chunk => {
    body += chunk;
    if (!tooBig && body.length > 512 * 1024) {
      tooBig = true;
      sendJson(413, { error: 'payload too large' });
    }
  });
  req.on('end', () => {
    if (tooBig || res.writableEnded) return;
    try {
      let payload = {};
      try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }

      const model = (payload && payload.model) ? String(payload.model) : '';
      const request = (payload && payload.request && typeof payload.request === 'object') ? payload.request : null;

      // Whitelist model names so the path can't be manipulated, and the body
      // must be a generateContent request object.
      if (!/^gemini-[a-zA-Z0-9._-]{1,60}$/.test(model) || !request) {
        sendJson(400, { error: 'invalid model or request' });
        return;
      }

      const upstream = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: '/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, up => {
        let data = '';
        let overLimit = false;
        up.on('data', d => {
          data += d;
          if (!overLimit && data.length > 4 * 1024 * 1024) {
            overLimit = true;
            sendJson(502, { error: 'upstream response too large' });
            try { up.destroy(); } catch (e) {}
          }
        });
        up.on('end', () => {
          if (overLimit || res.writableEnded) return;
          res.statusCode = up.statusCode || 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        });
      });

      upstream.on('error', err => {
        sendJson(502, { error: 'upstream request failed', detail: String(err && err.message || err) });
      });

      upstream.write(JSON.stringify(request));
      upstream.end();
    } catch (e) {
      sendJson(500, { error: 'internal error', detail: String(e) });
    }
  });
};
