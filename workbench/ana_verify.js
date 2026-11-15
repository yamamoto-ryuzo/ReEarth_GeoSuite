// Issue #28 re-verification: lineOfSight / viewshed via AI tool path + panel UI.
// CDP-driven; posts {action:'aiToolCall'} inside the ai-chat iframe (same path
// as ai_tool_test.js), then exercises the Analysis tab in the panel iframe.
// usage: node workbench/ana_verify.js [url]
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEBUG_PORT = 9461;
const URL_ = process.argv[2] || "http://localhost:8787/";
const PROFILE = path.join(os.tmpdir(), "geosuite-anaver-profile");
const OUT_PNG = path.join(os.tmpdir(), "ana_verify.png");
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*",
  "--window-size=1600,1000", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
  `--user-data-dir=${PROFILE}`, "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });

const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c));
    r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});
const consoleErrors = [];
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
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 250));
  };
  const evalJs = async (expr, awaitP = true) => {
    const r = await Promise.race([
      send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: awaitP }),
      sleep(20000).then(() => { throw new Error("eval timeout"); }),
    ]);
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    return r.result.value;
  };
  const open = Promise.race([
    new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); }),
    sleep(5000).then(() => { throw new Error("ws open timeout"); }),
  ]).then(async () => {
    await Promise.race([send("Runtime.enable"), sleep(5000).then(() => { throw new Error("re timeout"); })]);
    return { ws, send, evalJs };
  });
  return open;
}
async function findIframe(markerExpr) {
  const list = await getJson("/json/list");
  for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) {
    try {
      const c = await connect(t.webSocketDebuggerUrl);
      if (await c.evalJs(markerExpr).catch(() => false)) return c;
      try { c.ws.close(); } catch (e) {}
    } catch (e) {}
  }
  return null;
}
const findPanel = () => findIframe("!!document.getElementById('analysis-panel')");
const findAi = () => findIframe("!!document.querySelector('.ai-wrap')");

async function main() {
  let page;
  for (let i = 0; i < 150; i++) {
    try { const ts = await getJson("/json/list"); page = ts.find((t) => t.type === "page"); if (page) break; } catch (e) {}
    await sleep(200);
  }
  if (!page) { console.log("FATAL: no page target"); process.exit(1); }
  const main = await connect(page.webSocketDebuggerUrl);
  await main.send("Page.enable");
  await main.send("Page.navigate", { url: URL_ });
  console.log("navigated:", URL_);

  // wait for server/plugin iframes
  let ai = null, panel = null;
  for (let i = 0; i < 120 && (!ai || !panel); i++) {
    if (!ai) ai = await findAi();
    if (!panel) panel = await findPanel();
    if (!ai || !panel) await sleep(1000);
  }
  console.log("ai iframe:", !!ai, "panel iframe:", !!panel);
  if (!ai || !panel) { console.log("FATAL: plugin iframes missing"); process.exit(1); }

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
    }; 'ok'`);

  const callTool = async (name, args, timeoutMs) => {
    const rid = await ai.evalJs(`window.__call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`);
    const t0 = Date.now();
    while (Date.now() - t0 < (timeoutMs || 120000)) {
      const v = await ai.evalJs(`window.__res[${JSON.stringify(rid)}] === undefined ? null : JSON.stringify(window.__res[${JSON.stringify(rid)}])`);
      if (v !== null) { try { return JSON.parse(v); } catch (e) { return v; } }
      await sleep(500);
    }
    return { error: "test-timeout" };
  };

  // ---- AI tool path ----
  // Mt. Fuji area: observer on the rim, target across the crater (~7.5 km).
  const los = await callTool("lineOfSight", {
    observer: { lng: 138.7274, lat: 35.3606 }, target: { lng: 138.7350, lat: 35.3650 },
    observerHeight: 2, targetHeight: 0, samples: 96,
  }, 120000);
  console.log("TOOL lineOfSight =>", JSON.stringify(los).slice(0, 400));

  const vs = await callTool("viewshed", {
    observer: { lng: 138.7274, lat: 35.3606 }, observerHeight: 2,
    radiusMeters: 1500, azimuths: 24, samples: 24,
  }, 180000);
  console.log("TOOL viewshed =>", JSON.stringify(vs).slice(0, 400));

  // clamp check: huge request must shrink to <=6144 pts, not crash
  const vsClamp = await callTool("viewshed", {
    observer: { lng: 138.7274, lat: 35.3606 },
    radiusMeters: 999999, azimuths: 999, samples: 999,
  }, 200000);
  console.log("TOOL viewshed(clamp) =>", JSON.stringify(vsClamp).slice(0, 400));

  const layers = await callTool("listLayers", {}, 20000);
  const titles = (layers && layers.layers ? layers.layers : []).map((l) => l.title || l.name || "");
  console.log("analysis layers:", JSON.stringify(titles.filter((t) => /LOS|Viewshed/i.test(t))));

  // ---- UI path ----
  let p = await findPanel();
  if (p) {
    // switch to Analysis tab
    await p.evalJs(`(function(){var b=document.querySelector('.tab[data-target="analysis-panel"]'); if(b) b.click(); return !!b;})()`);
    await sleep(400);
    const visible = await p.evalJs(`(function(){var d=document.getElementById('analysis-panel'); return d && getComputedStyle(d).display !== 'none';})()`).catch(() => null);
    console.log("analysis tab visible:", visible);
    // empty-input guard first (no layer add -> iframe survives)
    await p.evalJs(`document.getElementById('ana-los-run').click(); 'ok'`).catch(() => {});
    await sleep(600);
    const guard = await p.evalJs(`(document.getElementById('ana-status')||{}).textContent`).catch(() => null);
    console.log("empty-input status:", JSON.stringify(guard));
    // real run
    await p.evalJs(`
      document.getElementById('ana-los-obs').value='139.60,35.55';
      document.getElementById('ana-los-tgt').value='139.62,35.57';
      document.getElementById('ana-los-run').click(); 'ok'`).catch(() => {});
    let status = null;
    for (let i = 0; i < 240; i++) {
      await sleep(500);
      const c = await findPanel();
      if (!c) continue;
      status = await c.evalJs(`(document.getElementById('ana-status')||{}).textContent`).catch(() => null);
      if (status && !/Running|計算中/.test(status)) break;
      p = c;
    }
    console.log("UI LOS status:", JSON.stringify(status));
    // layers list should now show LOS entries after safeShowUI re-render
    const c2 = await findPanel();
    if (c2) {
      const body = await c2.evalJs(`(document.body.innerText||'').split('\\n').filter(function(l){return /LOS|Viewshed/.test(l)}).slice(0,8)`).catch(() => null);
      console.log("panel LOS rows:", JSON.stringify(body));
    }
  }
  // screenshot of whole page
  try {
    const shot = await main.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(OUT_PNG, Buffer.from(shot.data, "base64"));
    console.log("screenshot:", OUT_PNG);
  } catch (e) { console.log("screenshot failed:", String(e)); }
  if (consoleErrors.length) console.log("console errors:", JSON.stringify(consoleErrors.slice(0, 8)));
  console.log("DONE");
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", e); process.exit(1); });
