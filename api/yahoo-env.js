// Simple endpoint to indicate whether server-side YAHOO_APPID is configured
module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const has = Boolean(process.env.YAHOO_APPID && String(process.env.YAHOO_APPID).trim());
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ hasAppId: has }));
};
