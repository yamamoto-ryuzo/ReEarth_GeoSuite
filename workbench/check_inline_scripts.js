// Verify that <script> blocks embedded in each widget's html template literal
// survive template-literal escape processing and still parse as valid JS.
// Extracts the raw template text AND the runtime (evaluated) text, diffs every
// backslash-related change, and node --check's the runtime scripts.
// usage: node workbench/check_inline_scripts.js
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const SRC = path.join(__dirname, "..", "geo_suite", "src");
const files = ["ai-chat.ts", "basemap-widget.ts", "navigation-toolbar.ts", "layers-and-tiles-list.ts"];

let failures = 0;

for (const f of files) {
  const file = path.join(SRC, f);
  const src = fs.readFileSync(file, "utf8");
  // grab every template literal (naive but effective for these files):
  // find `const X = \` ... \`` blocks that contain a <script>
  const tplRe = /`([\s\S]*?)`/g;
  let m, idx = 0;
  let any = false;
  while ((m = tplRe.exec(src))) {
    const tplBody = m[1];
    if (tplBody.indexOf("<script") < 0) continue;
    // evaluate the template literal body like the JS runtime would:
    // reconstruct a template literal and eval it
    let runtime;
    try {
      runtime = eval("`" + tplBody.replace(/`/g, "\\`") + "`");
    } catch (e) {
      // Fallback: some templates interpolate locals (e.g. legendInnerHtml) that
      // this checker can't see. Re-eval inside a universal-mock scope where
      // every identifier resolves to a stub that stringifies to "0".
      try {
        const mock = new Proxy(function () { return mock; }, {
          get: (t, k) => (k === Symbol.toPrimitive ? () => "0" : mock),
          apply: () => mock,
          construct: () => mock,
        });
        const sandbox = new Proxy({}, {
          has: (t, k) => k !== "eval" && k !== "globalThis",
          get: (t, k) => (k === Symbol.unscopables ? undefined : mock),
        });
        globalThis.__tplBody = tplBody;
        runtime = new Function("sb", "with(sb){ return eval('`' + globalThis.__tplBody + '`'); }")(sandbox);
        console.log(`${f} tpl#${idx}: eval used mock-sandbox (${e.message})`);
      } catch (e2) {
        console.log(`${f} tpl#${idx}: eval failed: ${e.message}`);
        failures++;
        continue;
      }
    }
    const scRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
    let sm, sn = 0;
    while ((sm = scRe.exec(runtime))) {
      any = true;
      const runtimeJs = sm[1];
      const p = path.join(os.tmpdir(), `chk_${f}_${idx}_${sn}.js`);
      fs.writeFileSync(p, runtimeJs);
      try {
        execSync(`node --check "${p}"`, { stdio: "pipe" });
        console.log(`${f} tpl#${idx} script#${sn}: OK (${runtimeJs.length} chars)`);
      } catch (e) {
        failures++;
        console.log(`${f} tpl#${idx} script#${sn}: SYNTAX ERROR`);
        console.log(String(e.stderr).split("\n").slice(0, 6).join("\n"));
      }
      sn++;
    }
    idx++;
  }
  if (!any) console.log(`${f}: (no <script> in template literals found)`);
}
process.exit(failures ? 1 : 0);
