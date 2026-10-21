// End-to-end behavior test for the geo_suite workbench dev loop.
// Proves: (a) plugin loads, (b) widget DOM is inspectable & clickable,
// (c) src save -> tsc watch -> SSE -> workbench auto-reload.
//
// usage: node workbench/test.js   (requires `npm run dev` running on :8787)
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const REPO = path.join(ROOT, "..");
const SRC = path.join(REPO, "geo_suite", "src", "basemap-widget.ts");
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT || 9333);
const URL_ = "http://localhost:8787/";

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(
  BROWSER,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-allow-origins=*",
    "--window-size=1600,1000",
    "--hide-scrollbars",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
    `--user-data-dir=${path.join(ROOT, ".chrome-profile")}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const getJson = (p) =>
  new Promise((res, rej) => {
    http
      .get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch (e) {
            rej(e);
          }
        });
      })
      .on("error", rej);
  });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
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
  const page = targets.find((t) => t.type === "page");
  const connect = (wsUrl) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
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
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return new Promise((res) =>
      ws.addEventListener("open", () => res({ ws, send }))
    );
  };
  const evalOn = async (send, expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description ||
          r.exceptionDetails.text ||
          "eval error"
      );
    return r.result.value;
  };

  const { ws, send } = await connect(page.webSocketDebuggerUrl);
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evalMain = (expression) => evalOn(send, expression);
  const shot = async (name) => {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const f = path.join(os.tmpdir(), name);
    fs.writeFileSync(f, Buffer.from(data, "base64"));
    return f;
  };

  // ---- 1. load ----
  await send("Page.navigate", { url: URL_ });
  console.log("navigated; waiting for workbench + plugin...");
  await sleep(30000);

  const topbar = await evalMain(
    `(() => {
      const b = document.body.innerText;
      return {
        title: document.title,
        live: /ライブ|Live/.test(b),
        plugin: /Layers & Tiles/.test(b),
        widgets: [...document.querySelectorAll('*')].length
      };
    })()`
  );
  check("workbench loaded", !!topbar.title, topbar.title);
  check("live status (SSE connected)", topbar.live === true);

  // ---- 2. plugin widgets present (iframes) ----
  const frames = await evalMain(
    `[...document.querySelectorAll('iframe')].map(f => ({src: (f.src||'').slice(0,120), w: f.offsetWidth, h: f.offsetHeight}))`
  );
  check("widget iframes exist", frames.length >= 2, `${frames.length} iframes`);

  // Widget iframes are sandboxed OOPIFs: attach to each target's own WS.
  const allTargets = await getJson("/json/list");
  const frameTargets = allTargets.filter(
    (t) => t.id !== page.id && ["iframe", "page", "other"].includes(t.type)
  );
  const widgetInfo = [];
  const widgetSends = [];
  for (const t of frameTargets) {
    try {
      const c = await connect(t.webSocketDebuggerUrl);
      await c.send("Runtime.enable");
      const info = await evalOn(
        c.send,
        `({href: location.href.slice(0,80), text: (document.body?document.body.innerText:'').slice(0,60)})`
      );
      widgetInfo.push({ type: t.type, ...info });
      widgetSends.push(c.send);
    } catch {}
  }
  check(
    "widget contexts reachable",
    widgetSends.length >= 1,
    `${frameTargets.length} targets: ${widgetInfo
      .map((w) => w.text.split("\n")[0])
      .join(" | ")
      .slice(0, 120)}`
  );

  const before = await shot("wb-test-1.png");
  console.log("screenshot:", before);

  // ---- 3. click a tab inside the layers widget iframe ----
  let clicked = false;
  if (widgetSends.length) {
    // find the layers widget target (the one with the most tab-like buttons)
    let layersSend = widgetSends[0];
    for (const s of widgetSends) {
      try {
        const n = await evalOn(
          s,
          `document.body.innerText.includes('レイヤー') || document.body.innerText.includes('共有')`
        );
        if (n) {
          layersSend = s;
          break;
        }
      } catch {}
    }
    clicked = await evalOn(
      layersSend,
      `(() => {
        const els = [...document.querySelectorAll('button,[role=tab]')];
        const t = els.find(e => /共有|Share|SHARE|検索|Search|カメラ/.test((e.innerText||'').trim()) && e.offsetParent);
        if (!t) return 'no tab found: ' + els.map(e=>(e.innerText||'').trim()).filter(Boolean).slice(0,20).join(',');
        t.click();
        return 'clicked ' + t.innerText.trim();
      })()`
    );
  }
  check("clicked a widget tab", /^clicked/.test(String(clicked)), String(clicked).slice(0, 120));
  await sleep(3000);
  const after = await shot("wb-test-2.png");
  console.log("screenshot:", after);

  // ---- 4. live reload: touch source -> SSE change -> reload ----
  const stampRe = `(document.body.innerText.match(/(\\d{2}:\\d{2}:\\d{2})\\s*に(?:再)?読み込み|Reloaded\\s*(\\d{2}:\\d{2}:\\d{2})/) || ['',''])[0]`;
  const stampBefore = await evalMain(stampRe);
  const marker = "\n// wb-test-marker\n";
  fs.appendFileSync(SRC, marker);
  console.log("touched", path.basename(SRC), "— waiting for auto reload...");
  await sleep(22000);
  const stampAfter = await evalMain(stampRe);
  check(
    "auto reload on save (SSE)",
    stampAfter !== stampBefore && !!stampAfter,
    `"${stampBefore}" -> "${stampAfter}"`
  );
  fs.writeFileSync(SRC, fs.readFileSync(SRC, "utf8").replace(marker, ""));
  await shot("wb-test-3.png").then((f) => console.log("screenshot:", f));

  const fails = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
  ws.close();
  browser.kill();
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  browser.kill();
  process.exit(1);
});
