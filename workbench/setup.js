// Download + verify + extract the Re:Earth Visualizer Workbench release artifact
// into workbench/dist-workbench/. No external deps (system tar required).
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

// Pin the workbench build here. Releases live under the normal v* tags.
const WORKBENCH_VERSION = "v1.0.0-beta.16.28";
const BASE = `https://github.com/reearth/reearth-visualizer/releases/download/${WORKBENCH_VERSION}`;
const NAME = `reearth-viz-workbench_${WORKBENCH_VERSION}.tar.gz`;

const ROOT = __dirname;
const TARBALL = path.join(ROOT, NAME);
const OUT_DIR = path.join(ROOT, "dist-workbench");

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (!redirects) return reject(new Error("too many redirects"));
          return resolve(download(res.headers.location, dest, redirects - 1));
        }
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function main() {
  if (fs.existsSync(path.join(OUT_DIR, "workbench.html"))) {
    console.log("workbench already present:", OUT_DIR);
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("downloading", `${BASE}/${NAME}`);
  await download(`${BASE}/${NAME}`, TARBALL);
  const shaFile = TARBALL + ".sha256";
  await download(`${BASE}/${NAME}.sha256`, shaFile);

  const expected = fs.readFileSync(shaFile, "utf8").trim().split(/\s+/)[0];
  const actual = sha256(TARBALL);
  if (expected !== actual)
    throw new Error(`sha256 mismatch: expected ${expected}, got ${actual}`);
  console.log("sha256 verified:", actual);

  const r = spawnSync("tar", ["-xzf", TARBALL, "-C", OUT_DIR], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("tar extraction failed");

  fs.rmSync(TARBALL, { force: true });
  fs.rmSync(shaFile, { force: true });
  const manifest = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, "workbench-manifest.json"), "utf8")
  );
  console.log(
    `workbench ready: version=${manifest.version} pluginApi=${manifest.pluginApiVersion}`
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
