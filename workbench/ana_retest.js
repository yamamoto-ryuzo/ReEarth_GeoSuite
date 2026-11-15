// Focused retest for issue #28: (a) steady-state lineOfSight AI call,
// (b) lineOfSight while a concurrent layer add forces safeShowUI iframe churn.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const DEBUG_PORT = 9462;
const URL_ = process.argv[2] || "http://localhost:8787/";
const PROFILE = path.join(os.tmpdir(), "geosuite-anaret-profile");
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*", "--window-size=1600,1000", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });
const getJson = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej); });
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); try { ws.send(JSON.stringify({ id: i, method: m, params: p })); } catch (e) { pending.delete(i); rej(e); } });
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
  const evalJs = async (expr) => { const r = await Promise.race([send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }), sleep(20000).then(() => { throw new Error("eval timeout"); })]); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return r.result.value; };
  return Promise.race([new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("ws error")); }), sleep(5000).then(() => { throw new Error("ws open timeout"); })]).then(async () => { await send("Runtime.enable"); return { ws, send, evalJs }; });
}
async function findIframe(expr) { const list = await getJson("/json/list"); for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) { try { const c = await connect(t.webSocketDebuggerUrl); if (await c.evalJs(expr).catch(() => false)) return c; try { c.ws.close(); } catch (e) {} } catch (e) {} } return null; }
async function main() {
  let page;
  for (let i = 0; i < 150; i++) { try { const ts = await getJson("/json/list"); page = ts.find((t) => t.type === "page"); if (page) break; } catch (e) {} await sleep(200); }
  const main = await connect(page.webSocketDebuggerUrl);
  await main.send("Page.enable"); await main.send("Page.navigate", { url: URL_ });
  let ai = null;
  for (let i = 0; i < 180 && !ai; i++) { ai = await findIframe("!!document.querySelector('.ai-wrap')"); if (!ai) await sleep(1000); }
  if (!ai) { console.log("FATAL: no ai iframe"); process.exit(1); }
  // let startup churn settle
  await sleep(25000);
  await ai.evalJs(`window.__res={}; window.addEventListener('message',function(e){var d=e&&e.data; if(d&&d.action==='aiToolResult'&&d.reqId) window.__res[d.reqId]=d.result;}); window.__call=function(n,a){var id='v'+Math.random().toString(36).slice(2); window.parent.postMessage({action:'aiToolCall',reqId:id,name:n,args:a||{}},'*'); return id;}; 'ok'`);
  const callTool = async (name, args, timeoutMs) => {
    const rid = await ai.evalJs(`window.__call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await ai.evalJs(`window.__res[${JSON.stringify(rid)}] === undefined ? null : JSON.stringify(window.__res[${JSON.stringify(rid)}])`).catch(() => null);
      if (v !== null) { try { return JSON.parse(v); } catch (e) { return v; } }
      await sleep(500);
    }
    return { error: "test-timeout" };
  };
  // (a) steady-state LOS
  const los1 = await callTool("lineOfSight", { observer: { lng: 138.7274, lat: 35.3606 }, target: { lng: 138.7350, lat: 35.3650 }, observerHeight: 2, samples: 96 }, 120000);
  console.log("steady LOS =>", JSON.stringify(los1).slice(0, 300));
  // (b) LOS + concurrent churn: fire a second tool that adds a layer right after
  const churn = ai.evalJs(`window.__call('flyTo', {lat:35.36, lng:138.73, height:3000, addMarker:true})`).catch(() => null);
  const los2 = await callTool("lineOfSight", { observer: { lng: 138.7274, lat: 35.3606 }, target: { lng: 138.80, lat: 35.42 }, observerHeight: 2, samples: 128 }, 60000);
  // fire the churning call nearly simultaneously is racy; instead also test sequential second call
  console.log("LOS#2 =>", JSON.stringify(los2).slice(0, 300));
  console.log("DONE");
  process.exit(0);
}
main().catch((e) => { console.log("FATAL:", e); process.exit(1); });
