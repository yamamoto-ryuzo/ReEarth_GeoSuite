// E2E churn test for #17 — proves hubExternalize's status/sources/POST chain
// runs inside the persistent basemap-widget iframe, not the panel iframe that
// safeShowUI churn recreates.
//
// Method: a stub geosuite-hub logs every request and delays POST /vector/sources
// by 4s. While the POST is in-flight we fire a burst of layer-add bridge calls
// (each result triggers safeShowUI -> panel iframe recreate).
//   host route  => exactly 1 POST, and the result arrives (externalized:true)
//   own route   => POST killed mid-flight -> ownReq resend => POST count > 1
//
// usage: node workbench/hub_churn_test.js   (requires `npm run dev` on :8787)
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const HUB_PORT = Number(process.env.STUB_HUB_PORT || 8899);
const POST_DELAY_MS = Number(process.env.STUB_POST_DELAY || 4000);
const GEOJSON_URL =
  "https://assets.cms.reearth.io/assets/ef/b1d062-e44b-4a19-8ebe-5fafeeba05f2/%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%9F%9F.geojson";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- stub geosuite-hub ----------
const hubLog = [];
const sources = {};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Private-Network": "true",
};
const hub = http.createServer((req, res) => {
  const t = new Date().toISOString().slice(11, 23);
  const send = (code, obj) => {
    res.writeHead(code, { ...cors, "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (req.method === "GET" && req.url === "/vector/status") {
    hubLog.push(`${t} GET /vector/status`);
    return send(200, { ok: true });
  }
  if (req.method === "GET" && req.url === "/vector/sources") {
    hubLog.push(`${t} GET /vector/sources`);
    return send(200, { ok: true, sources });
  }
  if (req.method === "POST" && req.url === "/vector/sources") {
    let b = "";
    req.on("data", (c) => (b += c)).on("end", () => {
      hubLog.push(`${t} POST /vector/sources ${b.slice(0, 90)}`);
      setTimeout(() => {
        try { const r = JSON.parse(b); sources[r.name] = r; } catch (e) {}
        send(200, { ok: true });
      }, POST_DELAY_MS);
    });
    return;
  }
  send(404, { ok: false, error: "not found" });
});

// ---------- bridge serve subprocess (JSONL stdio) ----------
function startBridge() {
  const proc = spawn("node", [path.join(__dirname, "bridge.js"), "serve"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    proc.stderr.on("data", (d) => {
      const s = String(d);
      process.stderr.write(s);
      if (/bridge ready/.test(s)) resolve();
      if (/FATAL|not found/.test(s)) reject(new Error(s.trim()));
    });
    proc.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m;
        try { m = JSON.parse(line); } catch (e) { continue; }
        if (m && m.reqId && pending.has(m.reqId)) {
          pending.get(m.reqId)(m.result);
          pending.delete(m.reqId);
        }
      }
    });
  });
  const call = (name, args) => new Promise((resolve) => {
    const reqId = "t" + Math.random().toString(36).slice(2, 9);
    pending.set(reqId, resolve);
    proc.stdin.write(JSON.stringify({ reqId, name, args }) + "\n");
  });
  return { proc, ready, call };
}

async function main() {
  await new Promise((r) => hub.listen(HUB_PORT, "127.0.0.1", r));
  const bridge = startBridge();
  await bridge.ready;
  console.log("bridge ready — stub hub on :" + HUB_PORT);

  // Point vectorHub at the stub.
  await bridge.call("applyInspectorText", {
    text: "vectorHub: http://127.0.0.1:" + HUB_PORT + "\nbackground: #ffffff",
  });
  console.log("vectorHub -> stub applied");

  // Kick off the externalize (do NOT await — the POST sleeps 4s on the stub).
  const ext = bridge.call("addDuckDbLayer", {
    url: GEOJSON_URL, title: "churn-test-gj",
  });
  await sleep(600); // let status+sources+POST reach the stub

  // Churn burst: each layer add fires safeShowUI -> panel iframe recreate.
  for (let i = 1; i <= 5; i++) {
    bridge.call("addGeoJsonLayer", {
      title: "churn-" + i, url: GEOJSON_URL,
    }).then((r) => console.log("churn-" + i + " result:", JSON.stringify(r).slice(0, 90)));
    await sleep(700);
  }

  const res = await ext;
  console.log("addDuckDbLayer result:", JSON.stringify(res).slice(0, 200));
  await sleep(800); // let stragglers land
  bridge.proc.kill();
  hub.close();

  const posts = hubLog.filter((l) => l.includes("POST /vector/sources")).length;
  console.log("--- stub hub log ---");
  for (const l of hubLog) console.log("  " + l);
  const externalized = !!(res && res.externalized === true);
  const pass = posts === 1 && externalized;
  console.log(
    (pass ? "PASS" : "FAIL") +
      `  POST count=${posts} (host route must be 1) externalized=${externalized}`
  );
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); try { hub.close(); } catch (_) {} process.exit(1); });
