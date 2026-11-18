// focused retest: addGeoJsonLayer + exportLayer on a CORS-allowed URL layer.
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const DEBUG_PORT = 9488;
const FIXTURE_PORT = 8803;
const PROFILE = path.join(os.tmpdir(), "geosuite-exportretest-profile");
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FC = JSON.stringify({
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "pt-A", v: 1 }, geometry: { type: "Point", coordinates: [139, 35] } },
    { type: "Feature", properties: { name: "pt-B", v: 2 }, geometry: { type: "Point", coordinates: [139.01, 35.01] } },
  ],
});
let hits = 0;
const fixture = http.createServer((req, res) => {
  hits++;
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,OPTIONS", "access-control-allow-private-network": "true", "access-control-allow-headers": "*" });
    return res.end();
  }
  if (new URL(req.url, "http://x").pathname === "/ok.geojson") {
    res.writeHead(200, { "content-type": "application/geo+json", "access-control-allow-origin": "*" });
    return res.end(FC);
  }
  res.writeHead(404); res.end();
});
const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c));
    r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  };
  const evalJs = async (expr, timeoutMs = 15000) => {
    const r = await Promise.race([
      send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }),
      sleep(timeoutMs).then(() => { throw new Error("eval timeout"); }),
    ]);
    if (r.exceptionDetails) { const ex = r.exceptionDetails; throw new Error((ex.exception && ex.exception.description) || ex.text); }
    return r.result && r.result.value;
  };
  return new Promise((res, rej) => { ws.onopen = async () => { await send("Runtime.enable"); res({ ws, send, evalJs }); }; ws.onerror = rej; });
}
async function findIframe(marker) {
  const list = await getJson("/json/list");
  for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) {
    try {
      const c = await connect(t.webSocketDebuggerUrl);
      if (await c.evalJs(marker, 6000)) return c;
    } catch (e) {}
  }
  return null;
}
(async () => {
  await new Promise((res) => fixture.listen(FIXTURE_PORT, "127.0.0.1", res));
  const browser = spawn(BROWSER, [
    "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*",
    "--window-size=1600,1000", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
    `--user-data-dir=${PROFILE}`, "about:blank",
  ], { stdio: "ignore" });
  try {
    let page;
    for (let i = 0; i < 100; i++) {
      try { const ts = await getJson("/json/list"); page = ts.find((t) => t.type === "page"); if (page) break; } catch {}
      await sleep(200);
    }
    const main = await connect(page.webSocketDebuggerUrl);
    await main.send("Page.enable");
    await main.send("Page.navigate", { url: "http://localhost:8787/" });
    await sleep(30000);

    let ai = null;
    for (let i = 0; i < 90 && !ai; i++) { ai = await findIframe("!!document.querySelector('.ai-wrap')"); if (!ai) await sleep(1000); }
    console.log("ai iframe:", !!ai);
    await ai.evalJs(`
      window.__res = {};
      window.addEventListener('message', function(e){ var d=e&&e.data; if(d&&d.action==='aiToolResult'&&d.reqId) window.__res[d.reqId]=d.result; });
      window.__call = function(name,args){ var id='v'+Math.random().toString(36).slice(2); window.parent.postMessage({action:'aiToolCall',reqId:id,name:name,args:args||{}},'*'); return id; }; 'ok'`);
    const callTool = async (name, args, timeoutMs = 30000) => {
      const rid = await ai.evalJs(`window.__call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`);
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        const v = await ai.evalJs(`window.__res[${JSON.stringify(rid)}] === undefined ? null : window.__res[${JSON.stringify(rid)}]`);
        if (v !== null) return v;
        await sleep(400);
      }
      return { error: "test-timeout" };
    };

    const rAdd = await callTool("addGeoJsonLayer", { title: "ExpOK", url: `http://127.0.0.1:${FIXTURE_PORT}/ok.geojson` });
    console.log("add:", JSON.stringify(rAdd));
    await sleep(6000);
    const rList = await callTool("listLayers");
    console.log("layers:", JSON.stringify(rList).slice(0, 300));
    const rExp = await callTool("exportLayer", { layer: "ExpOK", format: "csv" }, 45000);
    console.log("export:", JSON.stringify(rExp));
    const rExp2 = await callTool("exportLayer", { layer: "ExpOK", format: "geojson" }, 30000);
    console.log("export geojson:", JSON.stringify(rExp2));
    console.log("fixture hits:", hits);
  } finally { fixture.close(); }
  process.exit(0);
})();
