// Injects the vendored QML style engine + translator into
// geo_suite/src/layers-and-tiles-list.ts inside the UI iframe <script>
// block, between the // __QML_INLINE_BEGIN__/END__ markers
// (same mechanism as prepare_default_inspector.js).
//
//   node scripts/build_qml_inline.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TARGET = path.join(ROOT, "geo_suite", "src", "layers-and-tiles-list.ts");
const FILES = [
  path.join(ROOT, "geo_suite", "vendor", "qml-style.js"),
  path.join(ROOT, "geo_suite", "vendor", "qml-to-reearth.js"),
];
const BEGIN = "// __QML_INLINE_BEGIN__";
const END = "// __QML_INLINE_END__";

function escapeForTemplate(src) {
  return src
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

let body = "";
for (const f of FILES) {
  const raw = fs.readFileSync(f, "utf8").replace(/^export /gm, "");
  body += `// --- ${path.basename(f)} (vendored, do not edit inline) ---\n` + raw + "\n";
}

let ts = fs.readFileSync(TARGET, "utf8");
const re = new RegExp(BEGIN.replace(/[.]/g, "\\.") + "[\\s\\S]*?" + END.replace(/[.]/g, "\\."));
if (!re.test(ts)) {
  console.error("markers not found in " + TARGET);
  process.exit(1);
}
ts = ts.replace(re, () => BEGIN + "\n" + escapeForTemplate(body) + END);
fs.writeFileSync(TARGET, ts);
console.log(`injected ${body.length} bytes into ${TARGET}`);
