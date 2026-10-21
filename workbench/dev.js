// Fully automated local dev loop for the geo_suite plugin:
//   1. ensure the workbench build exists (runs setup.js if missing)
//   2. initial tsc build -> workbench/plugin-build/
//   3. tsc --watch (rebuild on src/*.ts save)
//   4. node server.js (workbench + plugin server + SSE reload)
//
// Editing geo_suite/src/*.ts -> recompile -> workbench auto-reloads.
// Editing plugin/reearth.yml -> inspector default syncs into TS -> recompile -> reload.
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const WORKBENCH_DIR = __dirname;
const OUT_DIR = path.join(WORKBENCH_DIR, "plugin-build");
const TSC = require.resolve("typescript/bin/tsc");

if (!fs.existsSync(path.join(WORKBENCH_DIR, "dist-workbench", "workbench.html"))) {
  console.log("[dev] dist-workbench missing, running setup...");
  const r = spawnSync(process.execPath, [path.join(WORKBENCH_DIR, "setup.js")], {
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
console.log("[dev] initial compile...");
const first = spawnSync(
  process.execPath,
  [TSC, "-p", "geo_suite/tsconfig.json", "--outDir", "workbench/plugin-build"],
  { cwd: ROOT, stdio: "inherit" }
);
if (first.status !== 0) process.exit(first.status ?? 1);

const tsc = spawn(
  process.execPath,
  [
    TSC,
    "-p",
    "geo_suite/tsconfig.json",
    "--outDir",
    "workbench/plugin-build",
    "--watch",
    "--preserveWatchOutput",
  ],
  { cwd: ROOT, stdio: "inherit" }
);
const server = spawn(process.execPath, [path.join(WORKBENCH_DIR, "server.js")], {
  cwd: ROOT,
  stdio: "inherit",
});

function shutdown() {
  tsc.kill();
  server.kill();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
