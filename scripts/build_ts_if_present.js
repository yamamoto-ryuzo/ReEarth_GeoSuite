const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const searchRoot = path.join(repoRoot, "geo_suite");
const ignoreDirs = new Set([
  "node_modules",
  ".git",
  ".vscode",
  "dist",
  "artifacts",
]);

function hasTsFiles(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    return false;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }
      if (hasTsFiles(fullPath)) {
        return true;
      }
      continue;
    }

    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      return true;
    }
  }

  return false;
}

function runTsc() {
  const tsconfigPath = path.join(searchRoot, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    console.error("tsconfig.json not found at geo_suite/tsconfig.json");
    process.exit(1);
  }

  const tscPath = path.join(
    repoRoot,
    "node_modules",
    "typescript",
    "bin",
    "tsc"
  );

  if (!fs.existsSync(tscPath)) {
    console.error("TypeScript is not installed. Run: npm install");
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    [tscPath, "-p", "geo_suite"],
    { cwd: repoRoot, stdio: "inherit" }
  );

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }

  const buildDir = path.join(searchRoot, "build");
  if (!fs.existsSync(buildDir)) {
    console.error("Build output not found at geo_suite/build");
    process.exit(1);
  }

  copyDir(buildDir, searchRoot);
}

function copyDir(srcDir, destDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyDir(srcPath, destPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (hasTsFiles(searchRoot)) {
  console.log("TypeScript sources detected. Running tsc...");
  runTsc();
} else {
  console.log("No TypeScript sources found. Skipping tsc.");
}
