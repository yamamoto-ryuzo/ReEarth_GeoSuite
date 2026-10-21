// Headless-browser screenshot + console capture via CDP. No npm deps (Node>=22).
// Lets an agent verify plugin UI/behavior without asking the user for captures.
//
// usage: node workbench/shot.js [url] [out.png] [waitMs]
//   defaults: url=http://localhost:8787/  out=workbench/shot.png  waitMs=30000
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
// 9222 is commonly taken by other apps (e.g. QGIS QtWebEngine); use a rare port.
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT || 9333);
const url = process.argv[2] || "http://localhost:8787/";
// default output goes to the OS temp dir so agents can read it
// (workbench/*.png is gitignored, and ignored files are unreadable by agents)
const out = path.resolve(process.argv[3] || path.join(os.tmpdir(), "geosuite-shot.png"));
const waitMs = Number(process.argv[4] || 30000);

const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) {
  console.error("no Chrome/Edge found");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(
  BROWSER,
  [
    "--headless=new",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--remote-allow-origins=*",
    "--window-size=1600,1000",
    "--hide-scrollbars",
    "--enable-unsafe-swiftshader", // software WebGL for Cesium in headless
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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
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
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === "Runtime.consoleAPICalled") {
      const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      console.log(`[console.${m.params.type}]`, text.slice(0, 500));
    } else if (m.method === "Log.entryAdded") {
      const e = m.params.entry;
      console.log(`[${e.source}.${e.level}]`, (e.text || "").slice(0, 500), e.url || "");
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  console.log(`navigated to ${url}, waiting ${waitMs}ms...`);
  await sleep(waitMs);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out, Buffer.from(data, "base64"));
  console.log("saved:", out);
  ws.close();
  browser.kill();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  browser.kill();
  process.exit(1);
});
