// geosuite-hub:// protocol handler — GeoSuite-dedicated launcher.
// Windows invokes this via the registered URL protocol when a browser opens
//   geosuite-hub://open?url=<scene>
// Resolution order:
//   1. geosuite-hub.exe --view <url>  (GeoSuite-dedicated hub on :8514 —
//      the renamed bridge-hub binary installed by geosuite-hub-install.cmd;
//      --view contract is the same one kasugai-hub://open forwarded to)
//   2. KASUGAI bridge-hub.exe --view (shared install fallback, :8511)
//   3. bare `open` (no url) or missing binary -> default browser opens
//      the scene URL or the geosuite-hub status page (:8514)
// Install: node workbench/geosuite-hub/install.js  (HKCU, no admin needed)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const arg = process.argv[2] || '';
const m = /[?&]url=([^&]+)/i.exec(arg);
const target = m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
const lad = process.env.LOCALAPPDATA || '';
const gsExe = path.join(lad, 'geosuite-hub', 'geosuite-hub.exe');
const ksExe = path.join(lad, 'kasugai', 'bridge-hub', 'bridge-hub.exe');
const STATUS_URL = 'http://127.0.0.1:8514/';

function launchDetached(cmd, args, env) {
    try {
        const p = spawn(cmd, args, {
            detached: true, stdio: 'ignore', windowsHide: true,
            env: Object.assign({}, process.env, env || {}),
        });
        p.unref();
        return true;
    } catch (e) { return false; }
}

// Bare `open` (no url) opens the hub status page in the viewer — same
// fallback contract as kasugai-hub://open.
const view = target || STATUS_URL;
if (fs.existsSync(gsExe)) {
    launchDetached(gsExe, ['--view', view], { BRIDGE_HUB_PORT: '8514' });
} else if (fs.existsSync(ksExe)) {
    launchDetached(ksExe, ['--view', view]);
} else {
    launchDetached('cmd', ['/c', 'start', '', view]);
}
