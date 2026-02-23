const https = require('https');
const { URL } = require('url');

// Simple serverless proxy handler for Vercel / Netlify-style functions
// Expects POST JSON: { query: string, appid?: string }
// If `appid` is provided in the request body it will be used; otherwise fallback to process.env.YAHOO_APPID
// Returns JSON from Yahoo and sets CORS header.

module.exports = function (req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // parse body (support both GET query and POST JSON)
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      let payload = {};
      if (req.method === 'GET') {
        const u = new URL(req.url, 'http://localhost');
        payload.query = u.searchParams.get('query') || '';
        payload.appid = u.searchParams.get('appid') || '';
        payload.debug = u.searchParams.get('debug') || '';
      } else {
        if (body && body.length) {
          try { payload = JSON.parse(body); } catch(e) { payload = {}; }
        }
      }

      const q = (payload && payload.query) ? String(payload.query) : '';
      let appid = (payload && payload.appid) ? String(payload.appid) : (process.env.YAHOO_APPID || '');

      if (!q) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing query' }));
        return;
      }

      if (!appid) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing appid' }));
        return;
      }

      const endpoint = 'https://map.yahooapis.jp/search/local/V1/localSearch?appid=' + encodeURIComponent(appid) + '&query=' + encodeURIComponent(q) + '&output=json';
      const url = new URL(endpoint);

      const reqOptions = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET'
      };

      const proxyReq = https.request(reqOptions, proxyRes => {
        let data = '';
        proxyRes.on('data', d => { data += d; });
        proxyRes.on('end', () => {
          // forward status and body
          res.statusCode = proxyRes.statusCode || 200;
          // Ensure response is JSON
          res.setHeader('Content-Type', 'application/json');
          const debugEnabled = (process.env.DEBUG_YAHOO === '1') || (payload && payload.debug && String(payload.debug) !== '');
          if (debugEnabled) {
            let parsed;
            try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
            res.end(JSON.stringify({ proxiedUrl: endpoint, body: parsed }));
          } else {
            res.end(data);
          }
        });
      });

      proxyReq.on('error', err => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'proxy request failed', detail: String(err) }));
      });

      proxyReq.end();
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'internal error', detail: String(e) }));
    }
  });
};
