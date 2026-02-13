const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function resolvePython() {
  const venvWin = path.join(repoRoot, ".venv", "Scripts", "python.exe");
  const venvPosix = path.join(repoRoot, ".venv", "bin", "python");

  if (fs.existsSync(venvWin)) return venvWin;
  if (fs.existsSync(venvPosix)) return venvPosix;

  return null;
}

function runPythonScript(scriptPath) {
  const venvPython = resolvePython();
  if (venvPython) {
    runCommand(venvPython, [scriptPath], { cwd: repoRoot });
    return;
  }

  const tryCommands = ["python3", "python"];
  for (const cmd of tryCommands) {
    const result = spawnSync(cmd, [scriptPath], { cwd: repoRoot, stdio: "inherit" });
    if ((result.status ?? 1) === 0) {
      return;
    }
  }

  console.error("Python is not available. Install Python 3 or create .venv.");
  process.exit(1);
}

function main() {
  runCommand(process.execPath, [path.join("scripts", "build_ts_if_present.js")], {
    cwd: repoRoot,
  });

  const distDir = path.join(repoRoot, "dist");
  ensureDir(distDir);

  const geoSuiteDir = path.join(repoRoot, "geo_suite");
  copyDir(geoSuiteDir, path.join(distDir, "geo_suite"));

  const ryuHtml = path.join(repoRoot, "ryu.html");
  if (fs.existsSync(ryuHtml)) {
    fs.copyFileSync(ryuHtml, path.join(distDir, "ryu.html"));
  }

  const indexHtml = path.join(repoRoot, "index.html");
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, path.join(distDir, "index.html"));
  }

  runPythonScript(path.join("scripts", "package_geo_suite.py"));

  const artifactsDir = path.join(repoRoot, "artifacts");
  if (fs.existsSync(artifactsDir)) {
    copyDir(artifactsDir, path.join(distDir, "artifacts"));
  }
}

main();
