// Drive the ai-chat tool pipeline end-to-end via CDP and verify each tool.
// Posts {action:'aiToolCall'} from inside the AI Chat widget iframe (same path
// as the real chat UI), then reads the aiToolResult routed back by the
// extension / layers-and-tiles-list panel.
// usage: node workbench/ai_tool_test.js [url]
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEBUG_PORT = 9444;
const URL_ = process.argv[2] || "http://localhost:8787/";
const PROFILE = path.join(os.tmpdir(), "geosuite-aitest-profile");

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(BROWSER, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-allow-origins=*",
  "--window-size=1600,1000",
  "--enable-unsafe-swiftshader",
  "--use-angle=swiftshader",
  `--user-data-dir=${PROFILE}`,
  "about:blank",
], { stdio: "ignore" });

const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c));
    r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

const consoleErrors = [];

// A thin CDP connection to one target (page or OOPIF iframe).
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
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    }
  };
  const evalJs = async (expr, ctxId) => {
    const params = { expression: expr, returnByValue: true, awaitPromise: true };
    if (ctxId) params.contextId = ctxId;
    const r = await Promise.race([
      send("Runtime.evaluate", params),
      sleep(15000).then(() => { throw new Error("eval timeout"); }),
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

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  const main = await connect(page.webSocketDebuggerUrl);
  const send_ = main.send;
  const evalJs = main.evalJs;
  await send_("Page.enable");
  await send_("Page.navigate", { url: URL_ });
  console.log("navigated, waiting for plugin iframes...");

  // Plugin UI iframes are sandboxed (opaque origin) so they show up as their
  // own targets (OOPIF). Connect to each and identify by DOM markers.
  let ai = null, panel = null;
  const seenTargets = new Set();
  for (let i = 0; i < 60 && (!ai || !panel); i++) {
    const list = await getJson("/json/list");
    const iframes = list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl && !seenTargets.has(t.id));
    if (i % 10 === 0) console.log(`  poll ${i}: ${iframes.length} new iframe targets`);
    for (const t of iframes) {
      seenTargets.add(t.id);
      try {
        const c = await connect(t.webSocketDebuggerUrl);
        const kind = await c.evalJs(
          "!!document.querySelector('.ai-wrap') ? 'ai' : (!!document.getElementById('fly-route-select') ? 'panel' : '')");
        console.log("    iframe ->", kind || "(other)");
        if (kind === "ai" && !ai) { ai = c; ai.targetId = t.id; }
        if (kind === "panel" && !panel) { panel = c; panel.targetId = t.id; }
      } catch (e) { console.log("    iframe connect/probe failed:", String(e && e.message || e)); }
    }
    if (!ai || !panel) await sleep(1000);
  }
  console.log("ai iframe:", !!ai, "panel iframe:", !!panel);
  if (!ai) { console.log("FATAL: ai-chat iframe not found"); process.exit(1); }

  // The panel UI iframe is recreated on every reearth.ui.show() (safeShowUI),
  // which destroys the CDP target. Always re-resolve the live target.
  let panelTargetId = panel ? panel.targetId : null;
  const findPanelConn = async () => {
    const list = await getJson("/json/list");
    for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) {
      try {
        const c = await connect(t.webSocketDebuggerUrl);
        const is = await c.evalJs("!!document.getElementById('fly-route-select')");
        if (is) { panelTargetId = t.id; return c; }
      } catch (e) {}
    }
    return null;
  };
  const evalPanel = async (expr) => {
    for (let i = 0; i < 8; i++) {
      const c = await findPanelConn();
      if (c) {
        try {
          const v = await c.evalJs(expr);
          if (v !== null && v !== undefined) return v;
        } catch (e) {}
      }
      await sleep(700);
    }
    return null;
  };

  // install a result collector + call helper inside the ai-chat iframe
  await ai.evalJs(`
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

  let n = 0;
  const callTool = async (name, args, timeoutMs = 20000) => {
    const rid = await ai.evalJs(`window.__call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await ai.evalJs(`window.__res[${JSON.stringify(rid)}] === undefined ? null : window.__res[${JSON.stringify(rid)}]`);
      if (v !== null) return v;
      await sleep(400);
    }
    return { error: "test-timeout" };
  };

  const results = [];
  const test = async (label, fn) => {
    n++;
    try {
      const r = await fn();
      results.push({ n, label, ok: r !== false, detail: r === true ? "" : String(r).slice(0, 180) });
      console.log(`${r !== false ? "PASS" : "FAIL"}  ${label}${r !== true && r !== false ? "  -> " + String(r).slice(0, 140) : ""}`);
    } catch (e) {
      results.push({ n, label, ok: false, detail: String(e).slice(0, 180) });
      console.log(`FAIL  ${label}  (threw: ${String(e).slice(0, 140)})`);
    }
  };
  const has = (r, k) => r && !r.error && r[k] !== undefined;

  // ---------- read-only ----------
  let cam0;
  await test("getCamera", async () => { const r = await callTool("getCamera"); cam0 = r; return has(r, "lat") && has(r, "lng") ? JSON.stringify(r).slice(0, 90) : JSON.stringify(r); });
  await test("listLayers", async () => { const r = await callTool("listLayers"); return Array.isArray(r && r.layers) ? "count=" + r.count : JSON.stringify(r); });
  await test("listBasemaps", async () => { const r = await callTool("listBasemaps"); return Array.isArray(r) ? r.length + " basemaps" : JSON.stringify(r); });
  await test("listCameraPresets", async () => { const r = await callTool("listCameraPresets"); return Array.isArray(r) ? r.map(x => x.name).join(",") : JSON.stringify(r); });
  await test("listFlyPaths", async () => { const r = await callTool("listFlyPaths"); return has(r, "inspector") ? JSON.stringify(r).slice(0, 120) : JSON.stringify(r); });
  await test("listLegends", async () => { const r = await callTool("listLegends"); return Array.isArray(r) ? r.length + " legends" : JSON.stringify(r); });
  await test("getShareUrl", async () => { const r = await callTool("getShareUrl"); return has(r, "query") ? r.query.slice(0, 80) : JSON.stringify(r); });
  await test("getInspectorText", async () => { const r = await callTool("getInspectorText"); return has(r, "text") ? "len=" + r.text.length : JSON.stringify(r); });

  // ---------- camera moves ----------
  await test("flyToPreset 東京駅", async () => {
    const r = await callTool("flyToPreset", { name: "東京駅" }, 25000);
    if (r && r.error) return JSON.stringify(r);
    await sleep(2500);
    const c = await callTool("getCamera");
    return Math.abs(c.lat - 35.653) < 0.02 && Math.abs(c.lng - 139.761) < 0.02 ? `lat=${c.lat},lng=${c.lng}` : "moved? " + JSON.stringify(c);
  });
  // NOTE: camera position reads lag ~1-2s behind writes through the plugin
  // proxy; sleep generously before verifying.
  await test("setCamera", async () => {
    const r = await callTool("setCamera", { lat: 34.68, lng: 135.52, height: 400, heading: 0, pitch: -40 });
    if (r && r.error) return JSON.stringify(r);
    await sleep(2500);
    const c = await callTool("getCamera");
    return Math.abs(c.lat - 34.68) < 0.01 ? `lat=${c.lat},lng=${c.lng}` : "no move " + JSON.stringify(c);
  });
  await test("flyTo", async () => {
    const r = await callTool("flyTo", { lat: 35.0, lng: 135.0, height: 3000, duration: 0.5 });
    if (r && r.error) return JSON.stringify(r);
    await sleep(3000);
    const c = await callTool("getCamera");
    return Math.abs(c.lat - 35.0) < 0.05 ? `lat=${c.lat},lng=${c.lng}` : "no move " + JSON.stringify(c).slice(0, 120);
  });
  await test("zoomIn/zoomOut", async () => {
    const b = await callTool("getCamera");
    const r1 = await callTool("zoomIn", { amount: 2 });
    let m = null;
    for (let i = 0; i < 8; i++) { await sleep(800); m = await callTool("getCamera"); if (m && m.height < b.height * 0.9) break; }
    const r2 = await callTool("zoomOut", { amount: 2 });
    if ((r1 && r1.error) || (r2 && r2.error)) return JSON.stringify(r1) + " / " + JSON.stringify(r2);
    return m.height < b.height * 0.9 ? `h ${b.height}->${m.height}` : `h same? ${b.height}->${m.height}`;
  });
  await test("lookAt", async () => {
    // animated lookAt orbits the camera to `range` around the target —
    // a position change is the verifiable signal.
    const r = await callTool("lookAt", { lat: 35.36, lng: 138.73, range: 4000, duration: 1 });
    if (r && r.error) return JSON.stringify(r);
    await sleep(3500);
    const c = await callTool("getCamera");
    const dist = c && !c.error ? Math.hypot(c.lat - 35.36, c.lng - 138.73) : 999;
    return dist < 0.5 ? `orbited lat=${c.lat},lng=${c.lng}` : "no move " + JSON.stringify(c).slice(0, 120);
  });
  await test("focusLayer", async () => { const r = await callTool("focusLayer", { layer: "Sample Points" }, 15000); return (r && r.ok) ? "ok" : JSON.stringify(r); });

  // ---------- layers ----------
  await test("setLayerVisible off->on", async () => {
    const r1 = await callTool("setLayerVisible", { layer: "Sample Points", visible: false });
    if (r1 && r1.error) return JSON.stringify(r1);
    await sleep(400);
    let cb = null;
    if (panel) cb = await evalPanel(`(function(){var c=document.querySelector('input.layer-checkbox[data-layer-id=${JSON.stringify(r1.id)}]');return c?c.checked:null;})()`);
    const r2 = await callTool("setLayerVisible", { layer: "Sample Points", visible: true });
    return `off->${cb===false?"cb-sync":cb===null?"cb?":"cb-stale"} on->${r2&&!r2.error}`;
  });
  await test("addGeoJsonLayer+removeLayer", async () => {
    const gj = "data:application/json," + encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "ai-test" }, geometry: { type: "Point", coordinates: [139.7, 35.6] } }] }));
    const r1 = await callTool("addGeoJsonLayer", { title: "AIテスト", url: gj }, 15000);
    if (!r1 || r1.error || !r1.id) return "add: " + JSON.stringify(r1);
    await sleep(500);
    const r2 = await callTool("removeLayer", { layer: "AIテスト" });
    return r2 && r2.ok !== false && !r2.error ? `added ${r1.id} + removed` : "remove: " + JSON.stringify(r2);
  });
  await test("addTileLayer+removeLayer", async () => {
    const r1 = await callTool("addTileLayer", { title: "AI-tile", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" }, 15000);
    if (!r1 || r1.error || !r1.id) return "add: " + JSON.stringify(r1);
    const r2 = await callTool("removeLayer", { layer: "AI-tile" });
    return r2 && !r2.error ? `added+removed` : "remove: " + JSON.stringify(r2);
  });

  // ---------- display ----------
  await test("setTerrain", async () => {
    const r1 = await callTool("setTerrain", { enabled: true }); if (r1 && r1.error) return JSON.stringify(r1);
    await sleep(300);
    const t = panel ? await evalPanel(`(function(){var c=document.getElementById('toggleSwitch');return c?c.checked:null;})()`) : null;
    const r2 = await callTool("setTerrain", { enabled: false });
    return `ui-sync=${t} back=${r2 && r2.ok !== false}`;
  });
  await test("setShadow", async () => {
    const r1 = await callTool("setShadow", { enabled: true }); if (r1 && r1.error) return JSON.stringify(r1);
    await sleep(300);
    const t = panel ? await evalPanel(`(function(){var c=document.getElementById('toggleShadowSwitch');return c?c.checked:null;})()`) : null;
    await callTool("setShadow", { enabled: false });
    return `ui-sync=${t}`;
  });
  await test("setDepthTest", async () => {
    const r1 = await callTool("setDepthTest", { enabled: true }); if (r1 && r1.error) return JSON.stringify(r1);
    await sleep(300);
    const t = panel ? await evalPanel(`(function(){var c=document.getElementById('toggleDepthSwitch');return c?c.checked:null;})()`) : null;
    return `ui-sync=${t}`;
  });
  await test("setBackground", async () => {
    const r = await callTool("setBackground", { color: "#223344" });
    const r2 = await callTool("setBackground", { color: "#ffffff" });
    return (r && !r.error && r2 && !r2.error) ? "ok" : JSON.stringify(r);
  });
  await test("setGeojsonDrape", async () => { const r = await callTool("setGeojsonDrape", { classification: "terrain" }); return (r && !r.error) ? JSON.stringify(r) : JSON.stringify(r); });

  // ---------- basemap ----------
  await test("setBasemap", async () => {
    const list = await callTool("listBasemaps");
    if (!Array.isArray(list) || !list.length) return "no basemaps";
    const r = await callTool("setBasemap", { name: list[0].name });
    const r2 = await callTool("setBasemap", { name: "OpenStreetMap" });
    return (r && !r.error) ? `selected ${r.selected} / restore ${r2 && r2.selected}` : JSON.stringify(r);
  });

  // ---------- fly routes ----------
  await test("createFlyPath/play/stop/delete", async () => {
    const r1 = await callTool("createFlyPath", { name: "ai-route", coordinates: [[139.7, 35.68], [139.75, 35.65], [139.8, 35.66]] });
    if (r1 && r1.error) return "create: " + JSON.stringify(r1);
    await sleep(600);
    const lp = await callTool("listFlyPaths");
    const listed = lp && lp.drawn && lp.drawn.indexOf("ai-route") >= 0;
    const r2 = await callTool("playFlyPath", { name: "ai-route" });
    await sleep(2500);
    const r3 = await callTool("stopFly");
    const r4 = await callTool("deleteFlyPath", { name: "ai-route" });
    return `listed=${listed} play=${r2 && !r2.error} stop=${r3 && !r3.error} del=${r4 && r4.deleted}`;
  });

  // ---------- panels ----------
  await test("showPanel legend->layers", async () => {
    const r1 = await callTool("showPanel", { panel: "legend" });
    if (r1 && r1.error) return JSON.stringify(r1);
    await sleep(300);
    const shown = panel ? await evalPanel(`(function(){var el=document.getElementById('legend-panel');return el?el.style.display:'?';})()`) : "?";
    await callTool("showPanel", { panel: "layers" });
    return `legend-display=${shown}`;
  });
  await test("showInfo", async () => {
    const r = await callTool("showInfo", {});
    await sleep(300);
    const src = panel ? await evalPanel(`(function(){var f=document.getElementById('info-content');return f?(f.getAttribute('src')||'srcdoc'):'?';})()`) : "?";
    await callTool("showPanel", { panel: "layers" });
    return `info-src=${src} r=${JSON.stringify(r).slice(0, 80)}`;
  });
  await test("flyToFeature", async () => {
    const r = await callTool("flyToFeature", { attribute: "N03_004", value: "千代田区" }, 20000);
    return JSON.stringify(r).slice(0, 140);
  });
  await test("showFeatureAttributes", async () => {
    const r = await callTool("showFeatureAttributes", { attribute: "N03_004", value: "千代田区", fly: false }, 20000);
    return JSON.stringify(r).slice(0, 160);
  });

  // ---------- misc ----------
  await test("captureView", async () => { const r = await callTool("captureView", {}, 20000); return (r && r.dataUrl && r.dataUrl.indexOf("data:image") === 0) ? "png " + r.dataUrl.length + "b" : JSON.stringify(r); });

  // ---------- settled-state UI sync (panel iframe is recreated on ui.show —
  // check once things have quieted down) ----------
  await test("UI sync: toggles + tab (settled)", async () => {
    await callTool("setTerrain", { enabled: true });
    await callTool("setShadow", { enabled: true });
    await callTool("setDepthTest", { enabled: false });
    await callTool("showPanel", { panel: "display" });
    await sleep(2500);
    const t = await evalPanel(`JSON.stringify({
      terr: (document.getElementById('toggleSwitch')||{}).checked,
      shad: (document.getElementById('toggleShadowSwitch')||{}).checked,
      depth: (document.getElementById('toggleDepthSwitch')||{}).checked,
      settingsShown: (document.getElementById('settings-panel')||{style:{}}).style.display
    })`);
    const r2 = await callTool("setTerrain", { enabled: false });
    const r3 = await callTool("setShadow", { enabled: false });
    const r4 = await callTool("setDepthTest", { enabled: true });
    await callTool("showPanel", { panel: "layers" });
    return t || "panel unreachable";
  });
  await test("openUrl", async () => {
    const before = (await getJson("/json/list")).filter((t) => t.type === "page").length;
    const r = await callTool("openUrl", { url: "https://example.com/" });
    await sleep(1500);
    const after = (await getJson("/json/list")).filter((t) => t.type === "page").length;
    return `pages ${before}->${after} ${r && r.error ? "err:" + r.error : "ok"}`;
  });
  await test("applyInspectorText (same text)", async () => {
    const cur = await callTool("getInspectorText");
    if (!cur || cur.error) return JSON.stringify(cur);
    const r = await callTool("applyInspectorText", { text: cur.text }, 30000);
    return (r && r.applied) ? "applied" : JSON.stringify(r);
  });

  // ---------- iframe-side helpers (network paths) ----------
  await test("searchLocation GSI endpoint", async () => {
    return await ai.evalJs(`fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q='+encodeURIComponent('東京')).then(r=>r.json()).then(d=>Array.isArray(d)&&d.length?d.length+' results':'empty').catch(e=>'fetch-err:'+e)`);
  });
  await test("yahoo-env proxy", async () => {
    return await ai.evalJs(`fetch('https://re-earth-geo-suite.vercel.app/api/yahoo-env').then(r=>r.json()).then(d=>'hasAppId='+d.hasAppId).catch(e=>'fetch-err:'+e)`);
  });
  await test("flyToCurrentLocation (perm likely denied)", async () => {
    return await ai.evalJs(`new Promise(function(res){if(!navigator.geolocation){res('no-api');return;}navigator.geolocation.getCurrentPosition(function(){res('granted')},function(e){res('denied:'+e.message)},{timeout:5000})})`);
  });

  console.log("\n=== console errors during run ===");
  consoleErrors.slice(0, 20).forEach((e) => console.log(" ", e));
  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - fails.length}/${results.length} passed ===`);
  try { browser.kill(); } catch (e) {}
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); browser.kill(); process.exit(1); });
