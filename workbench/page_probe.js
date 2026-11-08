// Probe: does the Manage>Set apply path (setPropertyValue+processInspectorText)
// work in Workbench? Appends a theme: line via the manage textarea and checks
// the page select. Also probes savePage message handling.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const DEBUG_PORT = 9357;
const URL_ = "http://localhost:8787/";
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, "--remote-allow-origins=*", "--window-size=1600,1000", "--hide-scrollbars", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", `--user-data-dir=${path.join(ROOT, ".chrome-profile-probe")}`, "about:blank"], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });
const getJson = (p) => new Promise((res, rej) => { http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => { let d = ""; r.on("data", (c) => (d += c)); r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on("error", rej); });
const connect = (wsUrl) => { const ws = new WebSocket(wsUrl); let id = 0; const pending = new Map(); const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); }); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }; return new Promise((res) => ws.addEventListener("open", () => res({ ws, send }))); };
const evalOn = async (send, expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
async function findPanel() { const targets = await getJson("/json/list"); for (const f of targets.filter((t) => t.type === "iframe")) { try { const c = await connect(f.webSocketDebuggerUrl); await c.send("Runtime.enable"); const k = await evalOn(c.send, `(() => document.getElementById('page-select') ? 'panel' : '')()`).catch(() => ""); if (k === "panel") return c; c.ws.close(); } catch (e) {} } return null; }
async function waitPanel(n = 40) { for (let i = 0; i < n; i++) { const c = await findPanel(); if (c) return c; await sleep(500); } return null; }

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) { try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === "page");
  const { send } = await connect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Page.navigate", { url: URL_ });
  await sleep(15000);

  let c = await waitPanel();
  console.log("panel:", !!c);
  const opts = (c2) => evalOn(c2.send, `(() => Array.from(document.getElementById('page-select').options).map(o => o.value))()`);

  // A) Manage>Set apply: append "theme:ProbePage | *" and click Apply
  const r1 = await evalOn(c.send, `(() => {
    document.getElementById('manage-open-btn').click();
    return new Promise(res => setTimeout(() => {
      const t = document.getElementById('manage-inspector-text');
      if (!t) return res('no-textarea');
      t.value = t.value + '\\ntheme:ProbePage | *';
      const b = document.getElementById('manage-apply-btn');
      if (!b) return res('no-apply');
      b.click();
      res('applied');
    }, 1000));
  })()`);
  console.log("manage apply:", r1);
  await sleep(5000);
  c.ws.close();
  c = await waitPanel();
  console.log("opts after manage-apply theme:", JSON.stringify(await opts(c).catch(() => null)));

  // B) direct savePage postMessage from panel iframe
  await evalOn(c.send, `(() => { parent.postMessage({action:'savePage', name:'ProbePage2'}, '*'); return true; })()`);
  await sleep(5000);
  c.ws.close();
  c = await waitPanel();
  console.log("opts after savePage msg:", JSON.stringify(await opts(c).catch(() => null)));

  // C) read manage text to see whether theme: lines persisted
  const mt = await evalOn(c.send, `(() => {
    document.getElementById('manage-open-btn').click();
    return new Promise(res => setTimeout(() => {
      const t = document.getElementById('manage-inspector-text');
      res(t ? t.value.split('\\n').filter(l => /theme|page/i.test(l)) : null);
    }, 1000));
  })()`).catch((e) => String(e));
  console.log("theme/page lines in manage text:", JSON.stringify(mt));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
