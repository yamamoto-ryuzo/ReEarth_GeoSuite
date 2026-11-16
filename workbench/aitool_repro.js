// Minimal repro for issue #49: addGeoJsonLayer executes but aiToolResult
// never reaches the ai-chat iframe. Captures console output from every
// target (page + all plugin iframes/extension contexts) to see where the
// reply chain breaks.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEBUG_PORT = 9446;
const URL_ = process.argv[2] || "http://localhost:8787/";
const PROFILE = path.join(os.tmpdir(), "geosuite-aitool-repro");
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

function connect(wsUrl, tag) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); try { ws.send(JSON.stringify({ id: i, method: m, params: p })); } catch (e) { pending.delete(i); rej(e); } });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === "Runtime.consoleAPICalled") {
      const txt = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300);
      if (/aiTool|aiChat|pending|sender|postMessage|\[la-|\[add|\[ext/i.test(txt)) console.log(`  [console:${tag}:${m.params.type}]`, txt);
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      console.log(`  [EXC:${tag}]`, (d.exception && d.exception.description) || d.text);
    }
  };
  const evalJs = async (expr) => { const r = await Promise.race([send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }), sleep(15000).then(() => { throw new Error("eval timeout"); })]); if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text); return r.result.value; };
  return new Promise((res, rej) => { ws.onopen = async () => { try { await send("Runtime.enable"); res({ ws, send, evalJs }); } catch (e) { rej(e); } }; ws.onerror = () => rej(new Error("ws error")); });
}

async function findIframe(kind) {
  const list = await getJson("/json/list");
  for (const t of list.filter((t) => t.type === "iframe" && t.webSocketDebuggerUrl)) {
    try {
      const c = await connect(t.webSocketDebuggerUrl, t.id.slice(0, 6));
      const probe = kind === "ai" ? "!!document.querySelector('.ai-wrap')" : "!!document.getElementById('fly-route-select')";
      if (await c.evalJs(probe).catch(() => false)) return c;
      c.ws.close();
    } catch (e) {}
  }
  return null;
}

async function main() {
  let targets;
  for (let i = 0; i < 100; i++) { try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch {} await sleep(200); }
  const page = targets.find((t) => t.type === "page");
  const main_ = await connect(page.webSocketDebuggerUrl, "page");
  await main_.send("Page.enable");
  await main_.send("Page.navigate", { url: URL_ });
  console.log("navigated; waiting for iframes...");

  let ai = null;
  for (let i = 0; i < 60 && !ai; i++) { ai = await findIframe("ai"); if (!ai) await sleep(1000); }
  console.log("ai iframe:", !!ai);
  if (!ai) process.exit(1);

  await ai.evalJs(`
    window.__res = {}; window.__seen = [];
    window.addEventListener('message', function(e){
      var d = e && e.data;
      if (d && d.action === 'aiToolResult') { window.__seen.push(JSON.stringify(d).slice(0,200)); if (d.reqId) window.__res[d.reqId] = d.result; }
    });
    window.__call = function(name, args){
      var id = 'v' + Math.random().toString(36).slice(2);
      window.parent.postMessage({ action:'aiToolCall', reqId:id, name:name, args:args||{} }, '*');
      return id;
    };
    'ok'`);

  const call = async (name, args, timeoutMs) => {
    const rid = await ai.evalJs(`window.__call(${JSON.stringify(name)}, ${JSON.stringify(args || {})})`);
    console.log(`call ${name} reqId=${rid}`);
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const v = await ai.evalJs(`window.__res[${JSON.stringify(rid)}] === undefined ? null : window.__res[${JSON.stringify(rid)}]`).catch(() => null);
      if (v !== null) return v;
      await sleep(400);
    }
    return { error: "test-timeout" };
  };

  console.log("-- listBasemaps (control, panel tool) --");
  console.log("result:", JSON.stringify(await call("listBasemaps", {}, 15000)).slice(0, 200));

  console.log("-- addGeoJsonLayer --");
  const gj = "data:application/json," + encodeURIComponent(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "ai-test" }, geometry: { type: "Point", coordinates: [139.7, 35.6] } }] }));
  const r = await call("addGeoJsonLayer", { title: "AIテスト", url: gj }, 15000);
  console.log("result:", JSON.stringify(r));
  console.log("all aiToolResult seen:", JSON.stringify(await ai.evalJs("window.__seen")));

  console.log("-- listLayers (control, local) --");
  console.log("result:", JSON.stringify(await call("listLayers", {}, 10000)).slice(0, 200));

  browser.kill();
  process.exit(0);
}
main().catch((e) => { console.error(e); try { browser.kill(); } catch (_) {} process.exit(1); });
