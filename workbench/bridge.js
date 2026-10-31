// CDP driver for the geo_suite external bridge — invoke map tools from the
// shell against a running Workbench. No npm deps (Node>=22).
//
//   node workbench/bridge.js serve [--url U]         # persistent JSONL stdio session
//   node workbench/bridge.js call <name> '<args>'    # one-shot tool call
//   node workbench/bridge.js list                    # print tool catalog (describe)
//
// serve mode: read {"reqId":"x","name":"flyTo","args":{...}} lines on stdin,
// write {"reqId":"x","result":{...}} lines on stdout (QGIS JSONL-bridge style).
//
// Attach to an already-running debug Chrome instead of spawning a new one:
//   BRIDGE_ATTACH=<debugPort> node workbench/bridge.js ...   (skips spawn+navigate)
// Env: BRIDGE_CDP_PORT (default 9555), BRIDGE_URL or --url (default http://localhost:8787/)
//
// Two call paths, tried in order:
//   1. window.__geoBridge.call(name,args) inside the basemap-widget iframe
//      (the persistent bridge host — works even when the AI Chat widget is closed)
//   2. legacy: post {action:'aiToolCall'} inside the AI Chat widget iframe
//      (older plugin builds without __geoBridge; requires the widget to be open)

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const ATTACH = process.env.BRIDGE_ATTACH ? Number(process.env.BRIDGE_ATTACH) : 0;
const DEBUG_PORT = ATTACH || Number(process.env.BRIDGE_CDP_PORT || 9555);
const argUrlIdx = process.argv.indexOf("--url");
const URL_ = (argUrlIdx >= 0 && process.argv[argUrlIdx + 1]) || process.env.BRIDGE_URL || "http://localhost:8787/";
const PROFILE = path.join(os.tmpdir(), "geosuite-bridge-profile");
const EVAL_TIMEOUT_MS = 120000;

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser = null;
if (!ATTACH) {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) { console.error("no Chrome/Edge found"); process.exit(1); }
  browser = spawn(exe, [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-allow-origins=*",
    "--window-size=1600,1000",
    "--hide-scrollbars",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    `--user-data-dir=${PROFILE}`,
    "about:blank",
  ], { stdio: "ignore" });
  process.on("exit", () => { try { browser.kill(); } catch (e) {} });
}

const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c));
    r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    try { ws.send(JSON.stringify({ id: i, method, params })); }
    catch (e) { pending.delete(i); rej(e); }
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const evalJs = async (expr, timeoutMs = EVAL_TIMEOUT_MS) => {
    const r = await Promise.race([
      send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }),
      sleep(timeoutMs).then(() => { throw new Error("eval timeout"); }),
    ]);
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails;
      throw new Error((ex.exception && ex.exception.description) || ex.text || "eval failed");
    }
    return r.result.value;
  };
  const open = Promise.race([
    new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); }),
    sleep(5000).then(() => { throw new Error("ws open timeout"); }),
  ]).then(async () => {
    await Promise.race([send("Runtime.enable"), sleep(5000).then(() => { throw new Error("Runtime.enable timeout"); })]);
    return { ws, send, evalJs };
  });
  return open;
}

// Find the bridge host iframe (basemap-widget, has window.__geoBridge).
// Plugin UI iframes are sandboxed (opaque origin) -> separate CDP targets.
async function findBridgeConn(timeoutMs = 60000) {
  const t0 = Date.now();
  let legacyConn = null;
  while (Date.now() - t0 < timeoutMs) {
    let list = [];
    try { list = await getJson("/json/list"); } catch (e) {}
    for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) {
      try {
        const c = await connect(t.webSocketDebuggerUrl);
        const has = await c.evalJs("typeof window.__geoBridge === 'object' && typeof window.__geoBridge.call === 'function'", 8000).catch(() => false);
        if (has) return { conn: c, mode: "bridge" };
        if (!legacyConn) {
          const isAi = await c.evalJs("!!document.querySelector('.ai-wrap')", 8000).catch(() => false);
          if (isAi) legacyConn = c;
        }
      } catch (e) {}
    }
    await sleep(1000);
  }
  if (legacyConn) {
    await legacyConn.evalJs(`
      window.__res = {};
      window.addEventListener('message', function(e){
        var d = e && e.data;
        if (d && d.action === 'aiToolResult' && d.reqId) window.__res[d.reqId] = d.result;
      });
      window.__call = function(name, args){
        var id = 'v' + Math.random().toString(36).slice(2);
        window.parent.postMessage({ action:'aiToolCall', reqId:id, name:name, args:args||{} }, '*');
        return id;
      };
      'ok'
    `);
    return { conn: legacyConn, mode: "legacy" };
  }
  return null;
}

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch (e) {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) { console.error("no page target"); process.exit(1); }
  const main = await connect(page.webSocketDebuggerUrl);
  if (!ATTACH) {
    await main.send("Page.enable").catch(() => {});
    await main.send("Page.navigate", { url: URL_ });
  }
  process.stderr.write("waiting for the geo_suite bridge iframe...\n");
  const found = await findBridgeConn();
  if (!found) { console.error("FATAL: bridge iframe not found (rebuild the plugin / open AI Chat widget)"); process.exit(1); }
  const { conn, mode } = found;
  process.stderr.write(`bridge ready (${mode === "bridge" ? "nav-toolbar __geoBridge" : "legacy ai-chat iframe"})\n`);
  // Explicitly enable the SSE transport too — opt-in by design, so the
  // dial-out path becomes available to bridge_server without inspector edits.
  if (mode === "bridge") {
    conn.evalJs(`try { window.__geoBridge.configure('http://127.0.0.1:8977'); } catch (e) {}`, 8000).catch(() => {});
  }

  const callTool = async (name, args, timeoutMs = 90000) => {
    if (mode === "bridge") {
      return conn.evalJs(`window.__geoBridge.call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`, timeoutMs + 30000);
    }
    const rid = await conn.evalJs(`window.__call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await conn.evalJs(`window.__res[${JSON.stringify(rid)}] === undefined ? null : window.__res[${JSON.stringify(rid)}]`, 10000);
      if (v !== null && v !== undefined) return v;
      await sleep(400);
    }
    return { error: "bridge-timeout" };
  };

  const raw = process.argv.slice(2);
  const argv = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "--url") { i++; continue; }
    argv.push(raw[i]);
  }
  const cliMode = argv[0] || "serve";

  if (cliMode === "call" || cliMode === "list") {
    const name = cliMode === "list" ? "describe" : argv[1];
    if (!name) { console.error("usage: node workbench/bridge.js call <name> '<jsonArgs>'"); process.exit(2); }
    let args = {};
    if (cliMode === "call" && argv[2]) {
      try { args = JSON.parse(argv[2]); } catch (e) { console.error("bad args JSON:", e.message); process.exit(2); }
    }
    const result = await callTool(name, args);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result && result.error ? 1 : 0);
  }

  if (cliMode !== "serve") { console.error("unknown mode: " + cliMode); process.exit(2); }

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    const s = line.trim();
    if (!s) return;
    let out;
    try {
      const cmd = JSON.parse(s);
      const reqId = cmd.reqId !== undefined ? cmd.reqId : null;
      try {
        const result = await callTool(String(cmd.name || ""), cmd.args || {});
        out = { reqId, result };
      } catch (e) {
        out = { reqId, result: { error: String(e && e.message || e) } };
      }
    } catch (e) {
      out = { reqId: null, result: { error: "bad json: " + String(e && e.message || e) } };
    }
    process.stdout.write(JSON.stringify(out) + "\n");
  });
  rl.on("close", () => process.exit(0));
}

main().catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
