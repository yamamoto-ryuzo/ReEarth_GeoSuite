// feature-verify batch driver: call geo_suite tools via nav-toolbar __geoBridge.
// Spawns one headless Chrome, navigates to the workbench, then runs the call
// list below and writes results JSON to verify/results/bridge_batch.json.
// usage: node verify/run_bridge_batch.js [url]
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEBUG_PORT = 9566;
const URL_ = process.argv[2] || "http://localhost:8787/";
const PROFILE = path.join(os.tmpdir(), "geosuite-verify-profile");
const OUT = path.join(__dirname, "results", "bridge_batch.json");

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-allow-origins=*", "--window-size=1600,1000",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
  `--user-data-dir=${PROFILE}`, "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });

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
  const evalJs = async (expr, timeoutMs = 120000) => {
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

async function findBridge(timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    let list = [];
    try { list = await getJson("/json/list"); } catch (e) {}
    for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) {
      try {
        const c = await connect(t.webSocketDebuggerUrl);
        const has = await c.evalJs("typeof window.__geoBridge === 'object' && typeof window.__geoBridge.call === 'function'", 8000).catch(() => false);
        if (has) return c;
      } catch (e) {}
    }
    await sleep(1000);
  }
  return null;
}

// [name, args] or [name, (ctx)=>args] — ctx carries earlier results.
const GEOJSON_URL = "https://assets.cms.reearth.io/assets/ef/b1d062-e44b-4a19-8ebe-5fafeeba05f2/%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%9F%9F.geojson";
const CALLS = [
  ["describe", {}],
  ["runCode", { code: "var l=await api.listLayers(); return l.count;" }],
  ["listLayers", {}],
  ["listThemes", {}],
  ["applyKascTheme", (ctx) => ({ name: (ctx.themes && ctx.themes[0] && ctx.themes[0].name) || "__none__" })],
  ["attrStats", {}],
  ["attrStats", (ctx) => ({ layer: ctx.vectorLayer, groupBy: "N03_001" })],
  ["zoomToExtent", { west: 139.6, south: 35.6, east: 139.9, north: 35.8 }],
  ["getLayerGeoJson", (ctx) => ({ layer: ctx.vectorLayer })],
  ["exportLayer", (ctx) => ({ layer: ctx.vectorLayer, format: "geojson" })],
  ["add3dTilesLayer", { title: "vfy-3d", url: "https://assets.cms.plateau.reearth.io/assets/0e/e5948a-e95c-4e31-be85-1f8c066ed996/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod1/tileset.json" }],
  ["removeLayer", { layer: "vfy-3d" }],
  ["searchLocation", { query: "東京駅", limit: 3 }],
  ["flyToUrl", { url: "?lat=35.68&lng=139.75&height=2000" }],
  ["flyToCurrentLocation", {}],
  ["setToolMaxSteps", { steps: 10 }],
  ["aiChatStatus", {}],
  ["aiChatSet", { provider: "gemini", model: "gemini-2.0-flash", persist: false }],
  ["aiChatSend", { text: "ping" }],
  ["showReport", { title: "verify", markdown: "# verify\nok" }],
  ["measureDistance", { coords: [{ lat: 35.68, lng: 139.75 }, { lat: 35.69, lng: 139.76 }] }],
  ["measureArea", { coords: [{ lat: 35.68, lng: 139.75 }, { lat: 35.681, lng: 139.751 }, { lat: 35.68, lng: 139.752 }] }],
  ["measureBearing", { from: { lat: 35.68, lng: 139.75 }, to: { lat: 35.75, lng: 139.8 } }],
  ["measureStart", { mode: "distance" }],
  ["measureAddPoint", { lat: 35.68, lng: 139.75 }],
  ["measureAddPoint", { lat: 35.69, lng: 139.76 }],
  ["measureAddPoint", { lat: 35.70, lng: 139.75 }],
  ["measureFinish", {}],
  ["clearMeasurements", {}],
  ["listInstructions", { kind: "agents" }],
  ["listInstructions", { kind: "skills" }],
  ["saveInstruction", { kind: "skills", id: "verify_tmp", text: "verify note", enabled: false }],
  ["readInstruction", { kind: "skills", id: "verify_tmp" }],
  ["deleteInstruction", { kind: "skills", id: "verify_tmp" }],
  ["selectAgents", { ids: [] }],
];

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch (e) {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  const main = await connect(page.webSocketDebuggerUrl);
  await main.send("Page.enable").catch(() => {});
  await main.send("Page.navigate", { url: URL_ });
  process.stderr.write("waiting for __geoBridge...\n");
  const conn = await findBridge();
  if (!conn) { console.error("FATAL: bridge iframe not found"); process.exit(1); }
  process.stderr.write("bridge ready\n");

  const ctx = {};
  const results = [];
  const call = (name, args, timeoutMs = 60000) =>
    conn.evalJs(`window.__geoBridge.call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`, timeoutMs + 30000);

  for (const [name, argOrFn] of CALLS) {
    let args;
    try { args = typeof argOrFn === "function" ? argOrFn(ctx) : argOrFn; } catch (e) { args = {}; }
    // contextual picks
    if (name === "attrStats" || name === "getLayerGeoJson" || name === "exportLayer") {
      if (!ctx.vectorLayer) {
        const ll = results.find((r) => r.name === "listLayers" && r.result && r.result.layers);
        const vec = ll && ll.result.layers.find((l) => /geojson|vector|csv|duckdb|fgb|parquet|gpkg/i.test(String(l.type || "")));
        ctx.vectorLayer = vec ? (vec.title || vec.id) : (ll && ll.result.layers[0] && (ll.result.layers[0].title || ll.result.layers[0].id));
        if (typeof argOrFn === "function") args = argOrFn(ctx);
      }
    }
    if (name === "applyKascTheme") {
      const th = results.find((r) => r.name === "listThemes");
      ctx.themes = th && Array.isArray(th.result && th.result.themes) ? th.result.themes : (Array.isArray(th && th.result) ? th.result : []);
      args = argOrFn(ctx);
    }
    let result, err = null;
    try { result = await call(name, args, name === "aiChatSend" ? 90000 : 60000); }
    catch (e) { err = String(e && e.message || e); }
    const entry = { name, args, result: err ? { error: err } : result };
    results.push(entry);
    const okFlag = result && (result.ok === true || result.error === undefined);
    console.log(`${okFlag ? "PASS" : "INFO"}  ${name}  ${JSON.stringify(err ? { error: err } : result).slice(0, 160)}`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), url: URL_, results }, null, 2));
  console.log("wrote", OUT);
  try { browser.kill(); } catch (e) {}
  process.exit(0);
}
main().catch((e) => { console.error(String(e && e.stack || e)); try { browser.kill(); } catch (_) {} process.exit(1); });
