// FLY GeoJSON save (download) test via CDP. No npm deps (Node>=22).
// Injects a drawn route, clicks the GeoJSON button, and verifies that a
// .geojson file is actually downloaded into a temp directory.
//
// usage: node workbench/fly_save_test.js [url]
//   default url: http://localhost:8787/
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT || 9334);
const url = process.argv[2] || "http://localhost:8787/";
const DL_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "flydl-"));

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) { console.error("no Chrome/Edge found"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-allow-origins=*",
  "--window-size=1600,1000",
  "--enable-unsafe-swiftshader",
  "--use-angle=swiftshader",
  `--user-data-dir=${path.join(ROOT, ".chrome-profile-save")}`,
  "about:blank",
], { stdio: "ignore" });

const getJson = (p) =>
  new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const logs = [];
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === "Runtime.consoleAPICalled") {
      logs.push(`[console.${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300));
    } else if (m.method === "Runtime.exceptionThrown") {
      logs.push(`[exception] ` + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const evaluate = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  return { ws, ready, send, evaluate, logs };
}

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await getJson("/json/list");
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await sleep(200);
  }

  // Browser-level session: allow downloads into DL_DIR
  const ver = await getJson("/json/version");
  const br = cdp(ver.webSocketDebuggerUrl);
  await br.ready;
  try {
    await br.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL_DIR });
    console.log("download dir:", DL_DIR);
  } catch (e) {
    console.log("Browser.setDownloadBehavior failed:", e.message);
  }

  const page = targets.find((t) => t.type === "page");
  const top = cdp(page.webSocketDebuggerUrl);
  await top.ready;
  await top.send("Runtime.enable");
  await top.send("Page.enable");
  await top.send("Page.navigate", { url });
  console.log("navigated:", url);

  // Find the widget iframe that hosts the FLY panel
  let widget = null;
  for (let i = 0; i < 120; i++) {
    targets = await getJson("/json/list");
    for (const t of targets) {
      if (t.type !== "iframe" && t.type !== "page") continue;
      if (t.id === page.id) continue;
      try {
        const c = cdp(t.webSocketDebuggerUrl);
        await Promise.race([c.ready, sleep(2000).then(() => { throw new Error("ws open timeout"); })]);
        await c.send("Runtime.enable");
        const has = await Promise.race([
          c.evaluate(`!!document.getElementById('fly-copygeo-btn')`),
          sleep(3000).then(() => false),
        ]).catch(() => false);
        if (has) { widget = c; break; }
        c.ws.close();
      } catch (e) {}
    }
    if (widget) break;
    await sleep(500);
  }
  if (!widget) {
    console.log("FAIL: widget iframe with fly-copygeo-btn not found");
    browser.kill();
    process.exit(1);
  }
  console.log("widget iframe found");

  // Inject a drawn route named "dl-test" so the button is enabled
  const geojson = JSON.stringify({
    type: "Feature",
    properties: { fly: { speed: 60, height: 100, pitch: -30, loop: false, view: "camera" } },
    geometry: {
      type: "LineString",
      coordinates: [
        [139.70, 35.60],
        [139.76, 35.66],
        [139.82, 35.60],
      ],
    },
  });
  const setup = await widget.evaluate(`(function(){
    try {
      var g = ${JSON.stringify(geojson)};
      window.dispatchEvent(new MessageEvent('message', { data: { action: 'flyDrawn', name: 'dl-test', geojson: g } }));
      var sel = document.getElementById('fly-route-select');
      var opt = null;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value.indexOf('d:') === 0) opt = sel.options[i].value;
      }
      if (!opt) return 'ERR no drawn option';
      sel.value = opt;
      sel.dispatchEvent(new Event('change'));
      return 'route=' + opt;
    } catch (e) { return 'ERR ' + e.message; }
  })()`);
  console.log("setup:", setup);
  await sleep(1500); // let the route load + preview

  // Click the GeoJSON (save) button
  const click = await widget.evaluate(`(function(){
    var b = document.getElementById('fly-copygeo-btn');
    if (!b) return 'ERR no button';
    if (b.disabled) return 'ERR button disabled';
    b.click();
    return 'clicked';
  })()`);
  console.log("click:", click);
  await sleep(2500);

  const status = await widget.evaluate(`(document.getElementById('fly-status')||{}).textContent`).catch(() => "?");
  console.log("status:", JSON.stringify(status));

  // Check the download dir
  const files = fs.readdirSync(DL_DIR).filter((f) => !f.endsWith(".crdownload"));
  console.log("downloaded files:", JSON.stringify(files));
  let pass = false;
  const gj = files.find((f) => f.endsWith(".geojson"));
  if (gj) {
    const content = fs.readFileSync(path.join(DL_DIR, gj), "utf8");
    try {
      const parsed = JSON.parse(content);
      pass = parsed.type === "Feature" && parsed.geometry && parsed.geometry.type === "LineString";
      console.log("file:", gj, "type:", parsed.type, "geometry:", parsed.geometry && parsed.geometry.type,
        "coords:", parsed.geometry && parsed.geometry.coordinates && parsed.geometry.coordinates.length);
    } catch (e) {
      console.log("downloaded file is not valid JSON:", e.message);
    }
  }
  if (widget.logs.length) console.log("widget logs:\n" + widget.logs.join("\n"));
  console.log("ok:", pass ? "PASS" : "FAIL");
  browser.kill();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); browser.kill(); process.exit(1); });
