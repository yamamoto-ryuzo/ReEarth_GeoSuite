// External bridge harness server for geo_suite — the dial-out target for the
// in-plugin bridge client hosted in the basemap-widget iframe. No npm deps.
//
// Endpoints (all CORS-open; the plugin iframe has an opaque origin):
//   GET  /status   -> { geosuiteBridge:1, connected, pending }
//   GET  /events   -> SSE stream of commands { reqId, name, args } for the plugin iframe
//   POST /result   -> { reqId, result } posted back by the plugin iframe
//   POST /call     -> { name, args, timeoutMs? } held until the result -> { ok, result }
//   GET  /tools    -> issues a live "describe" call and returns the catalog
//
// Usage:
//   node workbench/bridge_server.js                          # serve on 127.0.0.1:8977
//   node workbench/bridge_server.js call <name> '<jsonArgs>' # RPC against a running server
//   node workbench/bridge_server.js tools                    # print tool catalog
//
// Optional shared secret: set BRIDGE_TOKEN to require ?token=<t> on GET routes
// and a matching "token" field in POST bodies. Pass the token to the plugin via
// the inspector line "bridge: http://127.0.0.1:8977/?token=<t>".
//
// NOTE: binds 127.0.0.1 only. Anyone able to reach this port can drive the map
// of any connected plugin instance — treat it as a local dev/agent endpoint.

const http = require("http");

const PORT = process.env.BRIDGE_PORT ? Number(process.env.BRIDGE_PORT) : 8977;
const TOKEN = process.env.BRIDGE_TOKEN || "";
const VERSION = "21.3.0";

const sseClients = new Set(); // plugin iframes (usually exactly one)
const pending = new Map();    // reqId -> { res, timer }
let seq = 0;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  // Plugin iframes have an opaque origin -> Chrome treats requests to this
  // loopback server as private-network requests requiring PNA preflight.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function sendJson(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 4e6) req.destroy(); });
    req.on("end", () => {
      try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); }
    });
  });
}

function tokenOk(req, body) {
  if (!TOKEN) return true;
  const u = new URL(req.url, "http://x");
  if (u.searchParams.get("token") === TOKEN) return true;
  return !!(body && body.token === TOKEN);
}

function pushCommand(reqId, name, args) {
  const line = "data: " + JSON.stringify({ reqId, name, args }) + "\n\n";
  for (const res of sseClients) {
    try { res.write(line); } catch (e) {}
  }
}

function issueCall(name, args, timeoutMs, res) {
  if (!sseClients.size) {
    sendJson(res, 503, { ok: false, error: "no plugin iframe connected" });
    return;
  }
  const reqId = "c" + (++seq) + "." + Math.random().toString(36).slice(2, 8);
  const timer = setTimeout(() => {
    if (pending.has(reqId)) {
      pending.delete(reqId);
      sendJson(res, 504, { ok: false, error: "bridge call timeout" });
    }
  }, Math.min(Math.max(timeoutMs || 30000, 1000), 120000));
  pending.set(reqId, { res, timer });
  pushCommand(reqId, name, args);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;

  if (req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

  if (req.method === "GET" && p === "/status") {
    if (!tokenOk(req)) return sendJson(res, 403, { error: "bad token" });
    return sendJson(res, 200, { geosuiteBridge: 1, version: VERSION, connected: sseClients.size > 0, pending: pending.size });
  }

  if (req.method === "GET" && p === "/events") {
    if (!tokenOk(req)) return sendJson(res, 403, { error: "bad token" });
    cors(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch (e) {} }, 15000);
    req.on("close", () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }

  if (req.method === "POST" && p === "/result") {
    const body = await readBody(req);
    if (!tokenOk(req, body)) return sendJson(res, 403, { error: "bad token" });
    const pend = pending.get(String(body.reqId || ""));
    if (pend) {
      pending.delete(String(body.reqId || ""));
      clearTimeout(pend.timer);
      sendJson(pend.res, 200, { ok: true, result: body.result === undefined ? null : body.result });
    }
    res.writeHead(204); res.end();
    return;
  }

  if (req.method === "POST" && p === "/call") {
    const body = await readBody(req);
    if (!tokenOk(req, body)) return sendJson(res, 403, { error: "bad token" });
    if (!body.name) return sendJson(res, 400, { ok: false, error: "name required" });
    return issueCall(String(body.name), body.args || {}, body.timeoutMs, res);
  }

  if (req.method === "GET" && p === "/tools") {
    if (!tokenOk(req)) return sendJson(res, 403, { error: "bad token" });
    return issueCall("describe", {}, 10000, res);
  }

  sendJson(res, 404, { error: "not found" });
});

function clientPost(pathname, obj) {
  return new Promise((resolve, reject) => {
    const r = http.request(
      { host: "127.0.0.1", port: PORT, path: pathname, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({ raw: d }); } });
      }
    );
    r.on("error", reject);
    r.end(JSON.stringify(obj));
  });
}

async function cli() {
  const mode = process.argv[2];
  try {
    if (mode === "call") {
      const name = process.argv[3];
      if (!name) { console.error("usage: node workbench/bridge_server.js call <name> '<jsonArgs>'"); process.exit(2); }
      let args = {};
      try { args = process.argv[4] ? JSON.parse(process.argv[4]) : {}; } catch (e) { console.error("bad args JSON:", e.message); process.exit(2); }
      const out = await clientPost("/call" + (TOKEN ? "?token=" + encodeURIComponent(TOKEN) : ""), { name, args, token: TOKEN || undefined });
      console.log(JSON.stringify(out, null, 2));
      process.exit(out && out.ok ? 0 : 1);
    }
    if (mode === "tools") {
      const out = await clientPost("/call" + (TOKEN ? "?token=" + encodeURIComponent(TOKEN) : ""), { name: "describe", args: {}, timeoutMs: 10000, token: TOKEN || undefined });
      console.log(JSON.stringify(out, null, 2));
      process.exit(out && out.ok ? 0 : 1);
    }
  } catch (e) {
    console.error("cannot reach bridge server on 127.0.0.1:" + PORT + " — start it with: node workbench/bridge_server.js");
    process.exit(1);
  }
  console.error("usage: node workbench/bridge_server.js [call <name> '<jsonArgs>' | tools]");
  process.exit(2);
}

if (process.argv[2]) {
  cli();
} else {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[bridge] http://127.0.0.1:${PORT}/  (POST /call {name,args} -> tool result; /events = plugin SSE)`);
    console.log("[bridge] waiting for the geo_suite bridge iframe (navigation-toolbar) to connect...");
  });
}
