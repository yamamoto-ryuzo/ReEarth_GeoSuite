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
        proxyRes.on('end', async () => {
          // forward status and body
          res.statusCode = proxyRes.statusCode || 200;
          // Ensure response is JSON
          res.setHeader('Content-Type', 'application/json');
          const debugEnabled = (process.env.DEBUG_YAHOO === '1') || (payload && payload.debug && String(payload.debug) !== '');
          let parsed;
          try { parsed = JSON.parse(data); } catch (e) { parsed = null; }

          // If debug mode, return proxied URL and parsed body
          if (debugEnabled) {
            const bodyOut = parsed !== null ? parsed : data;
            res.end(JSON.stringify({ proxiedUrl: endpoint, body: bodyOut }));
            return;
          }

          // Attempt geocoding fallback first and prefer its coordinates if available
          try {
            const geoEndpoint = 'https://map.yahooapis.jp/geocode/V1/geoCoder?appid=' + encodeURIComponent(appid) + '&query=' + encodeURIComponent(q) + '&output=json';
            const geoUrl = new URL(geoEndpoint);
            const geoOptions = { hostname: geoUrl.hostname, path: geoUrl.pathname + geoUrl.search, method: 'GET' };
            const geoData = await new Promise((resolve, reject) => {
              const r = https.request(geoOptions, gr => {
                let buf = '';
                gr.on('data', c => { buf += c; });
                gr.on('end', () => resolve(buf));
                gr.on('error', e => reject(e));
              });
              r.on('error', e => reject(e));
              r.end();
            });
            let parsedGeo = null;
            try { parsedGeo = JSON.parse(geoData); } catch (e) { parsedGeo = null; }

            // Try to extract coordinates from parsedGeo
            let coords = null;
            try {
              if (parsedGeo && parsedGeo.Feature && parsedGeo.Feature.length) {
                const f0 = parsedGeo.Feature[0];
                if (f0.Geometry && f0.Geometry.Coordinates) coords = f0.Geometry.Coordinates;
                else if (f0.geometry && f0.geometry.coordinates) coords = Array.isArray(f0.geometry.coordinates) ? f0.geometry.coordinates.join(',') : String(f0.geometry.coordinates);
                else if (f0.Point && f0.Point.coordinates) coords = Array.isArray(f0.Point.coordinates) ? f0.Point.coordinates.join(',') : String(f0.Point.coordinates);
              }
            } catch (e) { coords = null; }

            if (coords) {
              // Build a minimal Feature response compatible with client expectations
              const feature = {
                Id: (parsedGeo.Feature && parsedGeo.Feature[0] && (parsedGeo.Feature[0].Id || parsedGeo.Feature[0].Gid)) || 'geocode-1',
                Name: (parsedGeo.Feature && parsedGeo.Feature[0] && (parsedGeo.Feature[0].Name || (parsedGeo.Feature[0].Property && parsedGeo.Feature[0].Property.Address))) || q,
                Geometry: { Type: 'point', Coordinates: coords },
                Property: (parsedGeo.Feature && parsedGeo.Feature[0] && parsedGeo.Feature[0].Property) || {}
              };
              const out = { ResultInfo: { Count: 1, Total: 1, Start: 1, Status: 200 }, Feature: [feature] };
              res.end(JSON.stringify(out));
              return;
            }
          } catch (e) {
            // geocode failed — continue to check localSearch
          }

          // If localSearch returned results, forward them.
          if (parsed && parsed.ResultInfo && parsed.ResultInfo.Count && parsed.ResultInfo.Count > 0) {
            res.end(data);
            return;
          }

          // Fallback: return original localSearch response (likely empty)
          res.end(data);
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
