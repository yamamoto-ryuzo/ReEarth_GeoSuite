// Minimap verification: click the "Map" toggle in the basemap widget iframe,
// wait for Leaflet, confirm the view geometry is drawn, then synthesize a
// click on the minimap and confirm the camera moved (geometry re-rendered).
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DEBUG_PORT = 9361;
const URL_ = "http://localhost:8787/";
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*", "--window-size=1600,1000", "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--user-data-dir=${path.join(ROOT, ".chrome-profile-mm")}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });
const getJson = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej); });
const connect = (wsUrl) => { const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; return new Promise((res) => ws.addEventListener("open", () => res({ ws, send }))); };
const evalOn = async (send, expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
async function findBasemap() { const targets = await getJson("/json/list"); for (const f of targets.filter((t) => t.type === "iframe")) { try { const c = await connect(f.webSocketDebuggerUrl); await c.send("Runtime.enable"); const k = await evalOn(c.send, `(() => document.getElementById('minimap-btn') ? 'basemap' : '')()`).catch(() => ""); if (k === "basemap") return c; c.ws.close(); } catch (e) {} } return null; }
async function waitBasemap(n = 40) { for (let i = 0; i < n; i++) { const c = await findBasemap(); if (c) return c; await sleep(500); } return null; }

const probe = `(() => {
  const wrap = document.getElementById('minimap-wrap');
  const el = document.getElementById('minimap');
  const path = document.querySelector('#minimap .leaflet-overlay-pane path');
  const pane = document.querySelector('#minimap .leaflet-map-pane');
  const img = document.querySelector('#minimap .leaflet-tile-pane img');
  return {
    wrapDisplay: wrap ? wrap.style.display : 'no-wrap',
    leaflet: !!window.L,
    container: !!document.querySelector('#minimap.leaflet-container'),
    geomPath: path ? path.getAttribute('d') : null,
    paneTransform: pane ? pane.style.transform : null,
    tileSrc: img ? img.src.split('/').slice(0, 5).join('/') : null
  };
})()`;

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) { try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === "page");
  const { send: psend } = await connect(page.webSocketDebuggerUrl);
  await psend("Page.enable");
  await psend("Page.navigate", { url: URL_ });
  await sleep(16000);

  const c = await waitBasemap();
  console.log("basemap iframe:", !!c);
  if (!c) process.exit(1);

  const before = await evalOn(c.send, probe);
  console.log("before toggle:", JSON.stringify(before));

  await evalOn(c.send, `(() => { document.getElementById('minimap-btn').click(); return true; })()`);
  await sleep(9000);
  const after = await evalOn(c.send, probe);
  console.log("after toggle:", JSON.stringify(after));

  // screenshot evidence
  const shot = await psend("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("mm_open.png", Buffer.from(shot.data, "base64"));
  console.log("saved mm_open.png");

  // click near a corner of the minimap -> minimapFlyTo -> camera recenters
  await evalOn(c.send, `(() => {
    const el = document.querySelector('#minimap.leaflet-container');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width * 0.15, y = r.top + r.height * 0.15;
    for (const t of ['pointerdown','mousedown','pointerup','mouseup','click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y, button: 0 }));
    }
    return { x: x, y: y };
  })()`);
  await sleep(4000);
  const afterClick = await evalOn(c.send, probe);
  console.log("after minimap click:", JSON.stringify(afterClick));
  console.log("geometry changed:", after.geomPath !== afterClick.geomPath || after.paneTransform !== afterClick.paneTransform);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
