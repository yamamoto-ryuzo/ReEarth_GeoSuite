// dist/index.html の #app-version を package.json のバージョンで置き換える
// （npm run build 内で index.html の dist コピー後に実行。起動時の reearth.yml
//   fetch が失敗しても正しいバージョンが出るようにする確定埋め込み）
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ver = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const file = path.join(root, 'dist', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const out = html.replace(/(id="app-version"[^>]*>)[^<]*(<)/, `$1v${ver}$2`);
if (out === html) {
  console.error('[stamp_version] #app-version not found in dist/index.html');
  process.exit(1);
}
fs.writeFileSync(file, out);
console.log(`[stamp_version] dist/index.html -> v${ver}`);
