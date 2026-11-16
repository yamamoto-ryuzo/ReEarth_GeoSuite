// Probe: verify terrain stays enabled after a partial overrideProperty
// (shadow toggle) that previously wiped the extension's override slot.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DEBUG_PORT = 9358;
const URL_ = "http://localhost:8787/";
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*", "--window-size=1600,1000", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--user-data-dir=${path.join(ROOT, ".chrome-profile-terrain")}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });
const getJson = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej); });
const connect = (wsUrl) => { const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; return new Promise((res) => ws.addEventListener("open", () => res({ ws, send }))); };
const evalOn = async (send, expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
const prop = `(function(){const p = (window.reearth && window.reearth.viewer && window.reearth.viewer.property) || {}; return JSON.stringify({terrain: p.terrain || null, depthTest: p.globe && p.globe.depthTestAgainstTerrain, shadow: p.scene && p.scene.shadow, baseColor: p.globe && p.globe.baseColor});})()`;
async function findPanel() { const targets = await getJson("/json/list"); for (const f of targets.filter((t) => t.type === "iframe")) { try { const c = await connect(f.webSocketDebuggerUrl); await c.send("Runtime.enable"); const k = await evalOn(c.send, `(() => document.getElementById('toggleSwitch') ? 'panel' : '')()`).catch(() => ""); if (k === "panel") return c; c.ws.close(); } catch (e) {} } return null; }

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) { try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === "page");
  const { send } = await connect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Page.navigate", { url: URL_ });
  await sleep(20000);

  console.log("property after init:", await evalOn(send, prop));

  const post = async (expr, label) => {
    const panel = await findPanel();
    if (!panel) { console.log(label + ": panel not found"); return; }
    await evalOn(panel.send, expr).catch((e) => console.log(label + " post err:", e.message));
    try { panel.ws.close(); } catch (e) {}
    await sleep(3000);
    console.log("property after " + label + ":", await evalOn(send, prop));
  };
  await post(`window.parent.postMessage({action:'activateShadow'}, '*')`, "activateShadow");
  await post(`window.parent.postMessage({action:'deactivateShadow'}, '*')`, "deactivateShadow");
  await post(`window.parent.postMessage({action:'toggleDepthTest', enabled:false}, '*')`, "toggleDepthTest(false)");
  await post(`window.parent.postMessage({action:'toggleDepthTest', enabled:true}, '*')`, "toggleDepthTest(true)");

  browser.kill();
  process.exit(0);
}
main().catch((e) => { console.error(e); try { browser.kill(); } catch (_) {} process.exit(1); });
