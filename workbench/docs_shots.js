// Screenshot helper for docs: drives the Workbench UI via CDP and captures
// states that plain shot.js cannot reach (clicks inside plugin OOPIF iframes).
//
// usage: node workbench/docs_shots.js   (requires `npm run dev` on :8787)
//   writes PNGs to the OS temp dir and prints their paths.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT || 9334);
const URL_ = process.argv[2] || "http://localhost:8787/";
const OUT_DIR = process.argv[3] || os.tmpdir();
const WAIT_MS = Number(process.argv[4] || 35000);

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) { console.error("no Chrome/Edge found"); process.exit(1); }

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
    `--user-data-dir=${path.join(ROOT, ".chrome-profile-docs")}`,
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
        r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
      })
      .on("error", rej);
  });

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
  return new Promise((res) => ws.addEventListener("open", () => res({ ws, send })));
};

const evalOn = async (send, expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval error"
    );
  return r.result.value;
};

async function shot(send, file) {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  console.log("saved:", file);
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
  const { send } = await connect(page.webSocketDebuggerUrl);
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: URL_ });
  console.log("waiting", WAIT_MS, "ms for plugin load...");
  await sleep(WAIT_MS);

  // Classify plugin OOPIF targets by probing for marker elements.
  async function findIframes() {
    targets = await getJson("/json/list");
    const iframes = targets.filter((t) => t.type === "iframe");
    const found = {};
    for (const f of iframes) {
      try {
        const c = await connect(f.webSocketDebuggerUrl);
        await c.send("Runtime.enable");
        const kind = await evalOn(c.send, `(() => {
          if (document.getElementById('basemap-select')) return 'basemap';
          if (document.getElementById('manage-open-btn')) return 'panel';
          if (document.getElementById('ai-provider')) return 'aichat';
          if (window.__geoBridge) return 'nav';
          return '';
        })()`);
        c.ws.close();
        if (kind && !found[kind]) found[kind] = f;
      } catch (e) {}
    }
    return found;
  }

  let found = {};
  for (let i = 0; i < 30; i++) {
    found = await findIframes();
    if (found.panel && found.basemap) break;
    await sleep(1000);
  }
  console.log("iframes:", Object.keys(found).join(", ") || "(none)");

  // 1) Basemap widget: click the Ext button -> promo row opens.
  if (found.basemap) {
    const c = await connect(found.basemap.webSocketDebuggerUrl);
    await c.send("Runtime.enable");
    const st = await evalOn(c.send, `(() => {
      const b = document.getElementById('hub-ext-btn');
      if (!b) return 'no-ext-btn';
      b.click();
      return 'clicked';
    })()`).catch((e) => String(e));
    console.log("basemap ext click:", st);
    await sleep(2500);
    c.ws.close();
  }
  await shot(send, path.join(OUT_DIR, "geosuite-ext-promo.png"));

  // 2) Layers panel: open Manage (⚙️) then the Ext sub-tab.
  if (found.panel) {
    const c = await connect(found.panel.webSocketDebuggerUrl);
    await c.send("Runtime.enable");
    const st = await evalOn(c.send, `(() => {
      const m = document.getElementById('manage-open-btn');
      if (!m) return 'no-manage-btn';
      m.click();
      const t = document.getElementById('manage-ext-tab');
      if (!t) return 'no-ext-tab';
      t.click();
      return 'clicked';
    })()`).catch((e) => String(e));
    console.log("panel manage>ext click:", st);
    await sleep(2500);
    c.ws.close();
  }
  await shot(send, path.join(OUT_DIR, "geosuite-ext-pane.png"));

  browser.kill();
  process.exit(0);
}

main().catch((e) => { console.error(e); browser.kill(); process.exit(1); });
