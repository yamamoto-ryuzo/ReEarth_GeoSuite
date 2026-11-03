// Smoke test: attach to ALL CDP targets (incl. sandboxed plugin iframes) and
// dump console messages. Verifies plugin extensions boot without errors after
// the _ddbHostDead rework. Requires `npm run dev` on :8787.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = __dirname;
const DEBUG_PORT = Number(process.env.SHOT_DEBUG_PORT || 9334);
const url = process.argv[2] || "http://localhost:8787/";
const waitMs = Number(process.argv[3] || 35000);
const BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const BROWSER = BROWSERS.find((p) => fs.existsSync(p));
if (!BROWSER) { console.error("no browser"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(BROWSER, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`,
  "--remote-allow-origins=*", "--window-size=1600,1000",
  "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
  `--user-data-dir=${path.join(ROOT, ".chrome-smoke-profile")}`, "about:blank",
], { stdio: "ignore" });
const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
    let d = ""; r.on("data", (c) => (d += c));
    r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});
async function main() {
  let targets;
  for (let i = 0; i < 100; i++) {
    try { targets = await getJson("/json/list"); if (targets.some((t) => t.type === "page")) break; } catch {}
    await sleep(200);
  }
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const sessions = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (m.method === "Target.attachedToTarget") {
      const sid = m.params.sessionId;
      const t = m.params.targetInfo;
      sessions.set(sid, t);
      console.log(`[attach] ${t.type} ${(t.url || "").slice(0, 120)}`);
      send("Runtime.enable", {}, sid).catch(() => {});
      return;
    }
    if (m.method === "Runtime.consoleAPICalled") {
      const t = sessions.get(m.sessionId);
      const tag = t ? (t.url || "").slice(-40) : m.sessionId;
      const text = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      console.log(`[console.${m.params.type}|${tag}]`, text.slice(0, 400));
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send("Page.enable");
  await send("Page.navigate", { url });
  console.log(`navigated ${url}, collecting ${waitMs}ms...`);
  await sleep(waitMs);
  console.log("done.");
  ws.close(); browser.kill(); process.exit(0);
}
main().catch((e) => { console.error(e); browser.kill(); process.exit(1); });
