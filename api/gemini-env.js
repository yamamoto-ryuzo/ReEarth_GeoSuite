// Indicates whether server-side GEMINI_API_KEY is configured.
// The AI Chat widget calls this to decide whether it can use /api/gemini
// (key kept server-side) or must fall back to a visitor-supplied key.
module.exports = function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
  const has = Boolean(process.env.GEMINI_API_KEY && String(process.env.GEMINI_API_KEY).trim());
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ hasKey: has }));
};
