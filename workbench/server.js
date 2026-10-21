// Local dev server for Re:Earth Visualizer Workbench (geo_suite)
//
//   /                 -> 302 to /workbench.html?dev-plugin=http://localhost:PORT/plugin
//   /plugin/reearth.yml -> repo plugin/reearth.yml (edited live, no copy step)
//   /plugin/<ext>.js  -> workbench/plugin-build/ (tsc --watch output)
//   /plugin/events    -> SSE; emits "event: change" when plugin sources change
//   (else)            -> workbench/dist-workbench/ static files
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = __dirname; // workbench/
const REPO = path.join(ROOT, "..");
const WORKBENCH_DIR = path.join(ROOT, "dist-workbench");
const PLUGIN_BUILD_DIR = path.join(ROOT, "plugin-build");
const PLUGIN_SRC_DIR = path.join(REPO, "plugin");
const PLUGIN_YML = path.join(PLUGIN_SRC_DIR, "reearth.yml");
const PREPARE_SCRIPT = path.join(REPO, "scripts", "prepare_default_inspector.js");
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const sseClients = new Set();
let debounceTimer = null;

function notifyChange() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const payload = `event: change\ndata: ${Date.now()}\n\n`;
    for (const res of sseClients) res.write(payload);
  }, 300);
}

// reearth.yml changed -> sync _defaultInspectorText into TS source
// (tsc --watch then rebuilds; plugin-build watch below fires the reload)
let ymlTimer = null;
try {
  fs.watch(PLUGIN_SRC_DIR, (ev, name) => {
    if (name !== "reearth.yml") return;
    clearTimeout(ymlTimer);
    ymlTimer = setTimeout(() => {
      const r = spawnSync(process.execPath, [PREPARE_SCRIPT], { cwd: REPO });
      if (r.status !== 0)
        console.error("[workbench] prepare_default_inspector failed:", String(r.stderr || ""));
      notifyChange();
    }, 300);
  });
} catch (e) {
  console.warn("[workbench] cannot watch", PLUGIN_SRC_DIR, e.message);
}

// rebuilt JS changed -> reload
fs.mkdirSync(PLUGIN_BUILD_DIR, { recursive: true });
try {
  fs.watch(PLUGIN_BUILD_DIR, { recursive: true }, notifyChange);
} catch (e) {
  console.warn("[workbench] cannot watch", PLUGIN_BUILD_DIR, e.message);
}

function serveFile(res, filePath) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  // SSE endpoint consumed by EventSource(`${devPlugin}/events`) in the workbench
  if (pathname === "/plugin/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
    return;
  }

  if (pathname === "/plugin/reearth.yml") {
    serveFile(res, PLUGIN_YML);
    return;
  }

  if (pathname.startsWith("/plugin/")) {
    serveFile(res, path.join(PLUGIN_BUILD_DIR, pathname.slice("/plugin/".length)));
    return;
  }

  if (pathname === "/") {
    res.writeHead(302, {
      Location:
        "/workbench.html?dev-plugin=" +
        encodeURIComponent(`http://localhost:${PORT}/plugin`),
    });
    res.end();
    return;
  }

  const filePath = path.join(WORKBENCH_DIR, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(WORKBENCH_DIR)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[workbench] http://localhost:${PORT}/`);
});
