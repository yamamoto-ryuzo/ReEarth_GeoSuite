// Verification of the "属性・値一覧" export feature (issue #32 port).
// Drives the real pipeline: UI iframe -> exportLayerRequest -> extension
// exportSourcesFor -> exportLayerSource -> iframe fetch/convert/download.
//
// usage: node workbench/export_verify.js   (requires `npm run dev` on :8787)
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEBUG_PORT = 9455;
const URL_ = "http://localhost:8787/";
const FIXTURE_PORT = 8801;
const PROFILE = path.join(os.tmpdir(), "geosuite-exportverify-profile");

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- fixture data server: /ok.geojson (CORS *), /nocors.geojson (no CORS) ---
const FC = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { name: "pt-A", 値: 1.5, note: 'a"b,c' }, geometry: { type: "Point", coordinates: [139.0, 35.0] } },
    { type: "Feature", properties: { name: "pt-B", 値: null }, geometry: { type: "LineString", coordinates: [[139.0, 35.0], [139.01, 35.01, 7]] } },
  ],
};
const fixture = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x").pathname;
  if (u === "/ok.geojson") {
    res.writeHead(200, { "content-type": "application/geo+json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(FC));
  } else if (u === "/nocors.geojson") {
    res.writeHead(200, { "content-type": "application/geo+json" }); // no ACAO
    res.end(JSON.stringify(FC));
  } else { res.writeHead(404); res.end(); }
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
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const evalJs = async (expr, timeoutMs = 20000) => {
    const r = await Promise.race([
      send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }),
      sleep(timeoutMs).then(() => { throw new Error("eval timeout"); }),
    ]);
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails;
      throw new Error((ex.exception && ex.exception.description) || ex.text || "eval failed");
    }
    return r.result && r.result.value;
  };
  return new Promise((res, rej) => {
    ws.onopen = async () => { await send("Runtime.enable"); res({ ws, send, evalJs }); };
    ws.onerror = () => rej(new Error("ws error"));
  });
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + String(detail).slice(0, 160) : ""}`);
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

async function main() {
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
    await main.send("Page.navigate", { url: URL_ });
    console.log("navigated; waiting for plugin iframes...");
    await sleep(30000);

    let ai = null;
    for (let i = 0; i < 90 && !ai; i++) {
      if (!ai) ai = await findIframe("!!document.querySelector('.ai-wrap')");
      if (!ai) await sleep(1000);
    }
    console.log("ai iframe:", !!ai);
    if (!ai) { console.log("FATAL: ai iframe not found"); process.exit(1); }

    // The panel iframe is recreated on every reearth.ui.show() — always
    // re-resolve the live target before evaluating.
    const evalPanel = async (expr, timeoutMs = 20000) => {
      for (let i = 0; i < 10; i++) {
        const c = await findIframe("!!document.getElementById('vector-attr-export-run')");
        if (c) {
          try {
            const v = await c.evalJs(expr, timeoutMs);
            return v;
          } catch (e) { /* target may die mid-eval; retry */ }
        }
        await sleep(800);
      }
      return null;
    };

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

    // ---------- unit-level: synthetic exportLayerSource inside the iframe ----------
    const valueSrc = { id: "v1", title: "Value", type: "geojson", value: FC };
    const okSrc = { id: "u1", title: "Ok", type: "geojson", url: `http://127.0.0.1:${FIXTURE_PORT}/ok.geojson` };
    const ncSrc = { id: "u2", title: "NC", type: "geojson", url: `http://127.0.0.1:${FIXTURE_PORT}/nocors.geojson` };

    const unit = async (label, msg) => {
      const r = await evalPanel(`(async function(){
        window.__dl = []; window.__blobs = [];
        if (!window.__capInstalled) {
          window.__capInstalled = true;
          HTMLAnchorElement.prototype.click = function(){ window.__dl.push({download:this.download}); };
          var ou = URL.createObjectURL;
          URL.createObjectURL = function(b){ window.__blobs.push(b); return ou.call(this, b); };
        }
        var st = document.getElementById('vector-attr-export-status');
        if (st) st.textContent = '…';
        window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(msg)} }));
        for (var i=0;i<150;i++){ await new Promise(r=>setTimeout(r,100));
          if (window.__dl.length || (st.textContent && st.textContent!=='…')) break; }
        var head=''; if (window.__blobs.length){ try{ head = await window.__blobs[0].text(); }catch(e){} }
        return { status: st.textContent, dl: window.__dl.slice(), head: head.slice(0,160) };
      })()`);
      return r || { status: null, dl: [], head: "" };
    };

    let r = await unit("x", { action: "exportLayerSource", exId: "ui1", format: "csv", baseName: "valuetest", sources: [valueSrc] });
    check("unit: value-source CSV export", /valuetest\.csv/.test(String(r.status)), `${r.status} dl=${JSON.stringify(r.dl)}`);
    check("unit: csv has BOM+WKT header+rows", /WKT,name/.test(r.head) && /pt-A/.test(r.head), JSON.stringify(r.head.slice(0, 60)));

    r = await unit("x", { action: "exportLayerSource", exId: "ui2", format: "kml", baseName: "kmltest", sources: [valueSrc] });
    check("unit: value-source KML export", /kmltest\.kml/.test(String(r.status)) && /<kml/.test(r.head), `${r.status}`);

    r = await unit("x", { action: "exportLayerSource", exId: "ui3", format: "geojson", baseName: "gjtest", sources: [valueSrc] });
    check("unit: value-source GeoJSON export", /gjtest\.geojson/.test(String(r.status)) && /FeatureCollection/.test(r.head), `${r.status}`);

    r = await unit("x", { action: "exportLayerSource", exId: "ui4", format: "csv", baseName: "urltest", sources: [okSrc] });
    check("unit: url-source (fetchable) export", /urltest\.csv/.test(String(r.status)) && /pt-B/.test(r.head), `${r.status}`);

    r = await unit("x", { action: "exportLayerSource", exId: "ui5", format: "csv", baseName: "nctest", sources: [ncSrc] });
    check("unit: url-source (no CORS) fails naming the source", /NC: Failed to fetch/.test(String(r.status)), String(r.status));

    r = await unit("x", { action: "exportLayerSource", exId: "ui6", format: "csv", baseName: "mixed", sources: [okSrc, ncSrc] });
    check("unit: mixed sources -> partial export + skipped source named", /mixed\.csv/.test(String(r.status)) && /NC/.test(String(r.status)), String(r.status));

    r = await unit("x", { action: "exportLayerSource", exId: "ui7", format: "csv", sources: [] });
    check("unit: empty sources -> error", /失敗|fail/i.test(String(r.status)), String(r.status));

    // ---------- end-to-end via real layers (AI tool path) ----------
    const rAdd = await callTool("addGeoJsonLayer", { title: "ExpOK", url: `http://127.0.0.1:${FIXTURE_PORT}/ok.geojson` });
    check("e2e: addGeoJsonLayer (cors ok)", !(rAdd && rAdd.error), JSON.stringify(rAdd).slice(0, 120));
    await sleep(5000);

    const rExp1 = await callTool("exportLayer", { layer: "ExpOK", format: "csv" });
    check("e2e: exportLayer csv on url layer", !!(rExp1 && rExp1.file === "ExpOK.csv" && rExp1.count === 2), JSON.stringify(rExp1).slice(0, 140));

    // value-based layer via measure overlay (data.value, no url)
    const rM = await callTool("measureDistance", { coords: [{ lat: 35, lng: 139 }, { lat: 35.01, lng: 139.01 }] });
    check("e2e: measureDistance creates overlay", !!(rM && (rM.ok !== false)), JSON.stringify(rM).slice(0, 120));
    await sleep(2500);
    const rExpM = await callTool("exportLayer", { layer: "AI Measure", format: "geojson" });
    check("e2e: exportLayer on value-source (AI Measure)", !!(rExpM && rExpM.file === "AI Measure.geojson"), JSON.stringify(rExpM).slice(0, 140));

    // unreachable-for-iframe URL layer (no CORS). Engine may not load it either,
    // but the data.url source persists and the export fetch fails.
    const rAddNc = await callTool("addGeoJsonLayer", { title: "ExpNC", url: `http://127.0.0.1:${FIXTURE_PORT}/nocors.geojson` });
    check("e2e: addGeoJsonLayer (no cors) registers layer", !(rAddNc && rAddNc.error), JSON.stringify(rAddNc).slice(0, 120));
    await sleep(5000);
    const rExpNc = await callTool("exportLayer", { layer: "ExpNC", format: "csv" });
    // If the engine could not load the layer either, export still fails —
    // but now the error names the layer. If computed features exist, the
    // fallback exports them and lists the layer in `fallback` instead.
    const ncOk = !!(rExpNc && (
      (rExpNc.error && /ExpNC/.test(String(rExpNc.error))) ||
      (rExpNc.file && Array.isArray(rExpNc.fallback) && rExpNc.fallback.join(",").indexOf("ExpNC") >= 0)));
    check("e2e: exportLayer on no-cors layer -> named error or computed fallback", ncOk, JSON.stringify(rExpNc).slice(0, 200));

    // all-layers export: does one bad source poison the merged export?
    const rExpAll = await callTool("exportLayer", { format: "csv" });
    check("e2e: merged export tolerates bad source", !!(rExpAll && rExpAll.file), JSON.stringify(rExpAll).slice(0, 160));

    // ---------- UI button path ----------
    const rUi = await evalPanel(`(async function(){
      window.__dl = []; window.__blobs = [];
      if (!window.__capInstalled) {
        window.__capInstalled = true;
        HTMLAnchorElement.prototype.click = function(){ window.__dl.push({download:this.download}); };
        var ou = URL.createObjectURL;
        URL.createObjectURL = function(b){ window.__blobs.push(b); return ou.call(this, b); };
      }
      var sel = document.getElementById('vector-attr-widget-layer');
      var fmt = document.getElementById('vector-attr-export-format');
      var run = document.getElementById('vector-attr-export-run');
      var st = document.getElementById('vector-attr-export-status');
      if (!sel || !fmt || !run) return { err: 'ui elements missing: ' + [!!sel,!!fmt,!!run].join(',') };
      var opt = [...sel.options].find(o => /ExpOK/.test(o.textContent));
      if (opt) sel.value = opt.value; else sel.value = '__all__';
      fmt.value = 'csv';
      run.click();
      for (var i=0;i<60;i++){ await new Promise(r=>setTimeout(r,200));
        if (window.__dl.length || (st.textContent && st.textContent!=='…')) break; }
      return { selected: sel.value, status: st.textContent, dl: window.__dl.slice() };
    })()`, 30000);
    check("e2e: UI export button -> status+download", !!(rUi && rUi.dl && rUi.dl.length), JSON.stringify(rUi).slice(0, 200));

    // ---------- stale-URL repro (loaded ok, then server killed) ----------
    const rAdd2 = await callTool("addGeoJsonLayer", { title: "ExpStale", url: `http://127.0.0.1:${FIXTURE_PORT}/ok.geojson` });
    check("e2e: addGeoJsonLayer (stale-test)", !(rAdd2 && rAdd2.error), JSON.stringify(rAdd2).slice(0, 100));
    await sleep(5000);
    fixture.close();
    const rStale = await callTool("exportLayer", { layer: "ExpStale", format: "csv" });
    check("e2e: stale URL -> computed-features fallback exports anyway", !!(rStale && rStale.file === "ExpStale.csv" && rStale.count === 2), JSON.stringify(rStale).slice(0, 200));
    check("e2e: stale export reports fallback usage", !!(rStale && Array.isArray(rStale.fallback) && rStale.fallback.join(",").indexOf("ExpStale") >= 0), JSON.stringify(rStale).slice(0, 160));

    // getLayerGeoJson still resolves the same layer via computed features
    const rIdx = await callTool("getLayerGeoJson", { layer: "ExpStale" });
    check("note: computed features survive dead URL", !!(rIdx && rIdx.features > 0), JSON.stringify(rIdx).slice(0, 100));
  } finally {
    try { fixture.close(); } catch (e) {}
  }

  const fails = results.filter((x) => !x.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
