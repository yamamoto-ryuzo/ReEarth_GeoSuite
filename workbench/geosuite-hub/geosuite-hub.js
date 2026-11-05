// geosuite-hub:// protocol handler — GeoSuite-dedicated launcher.
// Windows invokes this via the registered URL protocol when a browser opens
//   geosuite-hub://open?url=<scene>
// Resolution order:
//   1. bridge-hub.exe --view <url>  (LNA-disabled WebView2 window — the
//      intended path; --view contract is the same one kasugai-hub://open
//      forwarded to)
//   2. bare `open` (no url) or missing bridge-hub -> default browser opens
//      the scene URL or the hub status page
// Install: node workbench/geosuite-hub/install.js  (HKCU, no admin needed)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const arg = process.argv[2] || '';
const m = /[?&]url=([^&]+)/i.exec(arg);
const target = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
const hubExe = path.join(process.env.LOCALAPPDATA || '', 'kasugai', 'bridge-hub', 'bridge-hub.exe');

function launchDetached(cmd, args) {
    try {
        const p = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
        p.unref();
        return true;
    } catch (e) { return false; }
}

if (fs.existsSync(hubExe)) {
    // Bare `open` (no url) opens the hub status page in the viewer — same
    // fallback contract as kasugai-hub://open.
    launchDetached(hubExe, ['--view', target || 'http://127.0.0.1:8511/']);
} else {
    launchDetached('cmd', ['/c', 'start', '', target || 'http://127.0.0.1:8511/']);
}
