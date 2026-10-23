// FLY playback smoke test via CDP. No npm deps (Node>=22).
// Injects a test route into the FLY tab, presses Play, and verifies that
// flySetView camera updates stream to the parent and progress advances.
//
// usage: node workbench/fly_test.js [url]
//   default url: http://localhost:8787/
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT || 9333);
const url = process.argv[2] || "http://localhost:8787/";

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
  `--user-data-dir=${path.join(ROOT, ".chrome-profile")}`,
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
  // wait for browser
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      targets = await getJson("/json/list");
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  const top = cdp(page.webSocketDebuggerUrl);
  await top.ready;
  await top.send("Runtime.enable");
  await top.send("Page.enable");
  await top.send("Page.navigate", { url });
  console.log("navigated:", url);

  // Collect flySetView messages observed by the top page
  await top.evaluate(`window._flyMsgs=[];window.addEventListener('message',function(e){var d=e.data; if(d&&d.action==='flySetView'){window._flyMsgs.push({t:Date.now(),lat:d.lat,lng:d.lng,h:d.height,hd:d.heading,p:d.pitch});}});true`);

  // Wait for the plugin widget iframe target to appear (OOPIF)
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
          c.evaluate(`!!document.getElementById('fly-play-btn')`),
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
    console.log("FAIL: widget iframe with fly-play-btn not found");
    console.log("top logs:", top.logs.slice(-20).join("\n"));
    browser.kill();
    process.exit(1);
  }
  console.log("widget iframe found");
  const probe = await widget.evaluate(`(function(){
    return JSON.stringify({
      flyPlay: typeof flyPlay,
      flyDrawnCache: typeof flyDrawnCache,
      fly: typeof fly,
      t: typeof t,
      scripts: document.scripts.length,
      scriptLens: Array.prototype.map.call(document.scripts, function(s){ return (s.textContent||'').length; }),
      i18n: typeof window._GEO_I18N,
      debug: window._DEBUG_LOG,
      syntaxErrs: Array.prototype.map.call(document.scripts, function(s){
        try { new Function(s.textContent || ''); return null; } catch (e) { return String(e.message).slice(0, 200); }
      })
    });
  })()`);
  console.log("probe:", probe);
  if (widget.logs.length) console.log("widget logs:\n" + widget.logs.join("\n"));

  // Switch to FLY tab if needed (play button already found => tab html exists)
  // Inject a test drawn route and press Play
  const geojson = JSON.stringify({
    type: "Feature",
    properties: { fly: { speed: 300, height: 500, pitch: -30, loop: false, view: "camera" } },
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
      var sel = document.getElementById('fly-route-select');
      flyDrawnCache['__cdp_test'] = ${JSON.stringify(geojson)};
      flyAddDrawnOption('__cdp_test');
      sel.value = 'd:__cdp_test';
      // disable terrain sampling dependency: report caps
      var caps = JSON.stringify(window._flyCaps||{});
      flyPlay();
      return 'playing caps=' + caps + ' status=' + (document.getElementById('fly-status')||{}).textContent;
    } catch (e) { return 'ERR ' + e.message; }
  })()`);
  console.log("play:", setup);

  // Observe for ~12s
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    const st = await widget.evaluate(`(document.getElementById('fly-status')||{}).textContent`).catch(() => "?");
    const n = await top.evaluate(`window._flyMsgs.length`).catch(() => -1);
    samples.push({ i, status: st, msgs: n });
    console.log(`t=${i + 1}s status="${st}" flySetView_msgs=${n}`);
  }

  const msgs = await top.evaluate(`window._flyMsgs`);
  const errs = top.logs.concat(widget.logs).filter((l) => /error|exception/i.test(l));
  console.log("--- summary ---");
  console.log("flySetView count:", msgs.length);
  if (msgs.length >= 2) {
    const a = msgs[0], b = msgs[msgs.length - 1];
    console.log("first:", JSON.stringify(a));
    console.log("last :", JSON.stringify(b));
    const moved = Math.abs(a.lat - b.lat) > 1e-6 || Math.abs(a.lng - b.lng) > 1e-6;
    console.log("camera moved:", moved);
    // heading in radians ~ toward route direction
    console.log("ok:", moved && msgs.length > 30 ? "PASS" : "SUSPICIOUS");
  } else {
    console.log("ok: FAIL (no/too few camera updates)");
  }
  if (errs.length) console.log("errors:\n" + errs.slice(0, 10).join("\n"));
  browser.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); browser.kill(); process.exit(1); });
