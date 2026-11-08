// Pages feature verification (issue #7): drives the Workbench via CDP and
// exercises save/apply/delete of layer-visibility pages in the Layers tab.
//
// usage: node workbench/page_verify.js [url] [out.png] [waitMs]
//   requires `npm run dev` on :8787. Writes evidence PNG + prints PASS/FAIL.
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = __dirname;
const DEBUG_PORT = Number(process.env.PAGE_VERIFY_DEBUG_PORT || 9356);
const URL_ = process.argv[2] || "http://localhost:8787/";
const OUT_PNG = process.argv[3] || path.join(ROOT, "page_verify.png");
const WAIT_MS = Number(process.argv[4] || 20000);

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
  "--hide-scrollbars",
  "--enable-unsafe-swiftshader",
  "--use-angle=swiftshader",
  `--user-data-dir=${path.join(ROOT, ".chrome-profile-pageverify")}`,
  "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { browser.kill(); } catch (e) {} });

const getJson = (p) => new Promise((res, rej) => {
  http.get({ host: "127.0.0.1", port: DEBUG_PORT, path: p }, (r) => {
    let d = "";
    r.on("data", (c) => (d += c));
    r.on("end", () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on("error", rej);
});

const connect = (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
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
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "eval error");
  return r.result.value;
};

// The layers-panel iframe is an OOPIF target; safeShowUI recreates it after
// every save/delete, so re-resolve before each step.
async function findPanel() {
  const targets = await getJson("/json/list");
  const iframes = targets.filter((t) => t.type === "iframe");
  for (const f of iframes) {
    try {
      const c = await connect(f.webSocketDebuggerUrl);
      await c.send("Runtime.enable");
      const kind = await evalOn(c.send,
        `(() => document.getElementById('page-select') ? 'panel' : '')()`).catch(() => "");
      if (kind === "panel") return c;
      c.ws.close();
    } catch (e) {}
  }
  return null;
}
async function waitPanel(tries = 40) {
  for (let i = 0; i < tries; i++) {
    const c = await findPanel();
    if (c) return c;
    await sleep(500);
  }
  return null;
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: URL_ });
  console.log("waiting", WAIT_MS, "ms for plugin load...");
  await sleep(WAIT_MS);

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok });
    console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  — " + detail : ""));
  };

  // --- Step 1: baseline + save a page -------------------------------------
  let c = await waitPanel();
  check("panel iframe found", !!c);
  if (!c) { await shot(send); process.exit(1); }

  const base = await evalOn(c.send, `(() => {
    const boxes = Array.from(document.querySelectorAll('input.layer-checkbox'));
    return {
      checked: boxes.filter(b => b.checked).length,
      total: boxes.length,
      firstTitle: (() => { const b = boxes.find(x => x.checked); const s = b && b.closest('.layer-item'); const n = s && s.querySelector('.layer-name'); return n ? n.textContent : ''; })(),
      pageOpts: Array.from(document.getElementById('page-select').options).map(o => o.value)
    };
  })()`);
  console.log("baseline:", JSON.stringify(base));
  check("layers listed", base.total > 0, base.checked + "/" + base.total + " checked");

  await evalOn(c.send, `(() => {
    document.getElementById('page-name-input').value = 'TestPage1';
    document.getElementById('page-save-btn').click();
    return true;
  })()`);
  console.log("saved page TestPage1; waiting for re-render...");
  await sleep(4000);
  c.ws.close();

  // --- Step 2: page appears + settings text holds the theme: line ----------
  c = await waitPanel();
  const afterSave = await evalOn(c.send, `(() => ({
    opts: Array.from(document.getElementById('page-select').options).map(o => o.value),
    sel: document.getElementById('page-select').value
  }))()`).catch(() => null);
  console.log("after save:", JSON.stringify(afterSave));
  check("page listed after save", afterSave && afterSave.opts.indexOf("TestPage1") >= 0, JSON.stringify(afterSave && afterSave.opts));

  // settings text check via Manage > Set textarea
  const manageText = await evalOn(c.send, `(() => {
    document.getElementById('manage-open-btn').click();
    return new Promise(res => setTimeout(() => {
      const t = document.getElementById('manage-inspector-text');
      res(t ? t.value : null);
    }, 800));
  })()`).catch(() => null);
  check("theme: line persisted in settings text", manageText != null && /(^|\n)\s*theme:TestPage1\b/.test(manageText), manageText == null ? "manage text unavailable" : "");
  // close manage panel back to layers tab
  await evalOn(c.send, `(() => { const b = document.querySelector('.tab[data-target="layers-panel"]'); if (b) b.click(); return true; })()`).catch(() => {});
  await sleep(1500);
  c.ws.close();

  // --- Step 3: uncheck a layer, then apply the page ------------------------
  c = await waitPanel();
  const toggleRes = await evalOn(c.send, `(() => {
    const b = document.querySelector('input.layer-checkbox:checked');
    if (!b) return null;
    const li = b.closest('.layer-item');
    const name = li && li.querySelector('.layer-name') ? li.querySelector('.layer-name').textContent : '';
    b.click();
    return name;
  })()`);
  console.log("unchecked layer:", toggleRes);
  await sleep(2500);
  c.ws.close();

  c = await waitPanel();
  const afterHide = await evalOn(c.send, `(() => ({
    checked: document.querySelectorAll('input.layer-checkbox:checked').length
  }))()`).catch(() => null);
  check("layer unchecked", afterHide && afterHide.checked === base.checked - 1, "checked=" + (afterHide && afterHide.checked));

  await evalOn(c.send, `(() => {
    const sel = document.getElementById('page-select');
    sel.value = 'TestPage1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()`);
  console.log("applied page TestPage1; waiting for re-render...");
  await sleep(4000);
  c.ws.close();

  c = await waitPanel();
  const afterApply = await evalOn(c.send, `(() => ({
    checked: document.querySelectorAll('input.layer-checkbox:checked').length,
    sel: document.getElementById('page-select').value
  }))()`).catch(() => null);
  check("page applied (visibility restored)", afterApply && afterApply.checked === base.checked, "checked=" + (afterApply && afterApply.checked) + "/" + base.checked);

  // --- Step 4: delete the page ---------------------------------------------
  await evalOn(c.send, `(() => {
    const sel = document.getElementById('page-select');
    sel.value = 'TestPage1';
    const del = document.getElementById('page-del-btn');
    const opt = sel.options[sel.selectedIndex];
    const state = { disabled: del.disabled, hasDel: opt ? opt.getAttribute('data-del') : null };
    if (!del.disabled) del.click();
    return state;
  })()`).then((r) => console.log("delete click:", JSON.stringify(r))).catch(() => {});
  console.log("deleted page; waiting for re-render...");
  await sleep(4000);
  c.ws.close();

  c = await waitPanel();
  const afterDel = await evalOn(c.send, `(() => ({
    opts: Array.from(document.getElementById('page-select').options).map(o => o.value)
  }))()`).catch(() => null);
  check("page removed after delete", afterDel && afterDel.opts.indexOf("TestPage1") < 0, JSON.stringify(afterDel && afterDel.opts));

  // evidence screenshot
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(OUT_PNG, Buffer.from(r.data, "base64"));
  console.log("saved:", OUT_PNG);

  const fails = results.filter((x) => !x.ok).length;
  console.log(fails === 0 ? "ALL CHECKS PASSED" : fails + " CHECK(S) FAILED");
  process.exit(fails === 0 ? 0 : 1);
}

async function shot(send) {
  try {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(OUT_PNG, Buffer.from(r.data, "base64"));
    console.log("saved:", OUT_PNG);
  } catch (e) {}
}

main().catch((e) => { console.error(e); process.exit(1); });
