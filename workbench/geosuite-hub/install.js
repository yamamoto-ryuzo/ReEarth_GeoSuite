// Registers the geosuite-hub:// URL protocol for the current user.
// HKCU only — no administrator rights required. Run once:
//   node workbench/geosuite-hub/install.js
// Written via a .reg import so embedded quotes/backslashes can't corrupt the
// command line the way raw `reg add /d` quoting can.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

if (process.platform !== 'win32') {
    console.error('geosuite-hub: protocol registration is Windows-only (WebView2 target).');
    process.exit(1);
}

const cmd = path.join(__dirname, 'geosuite-hub.cmd').replace(/\//g, '\\');
// Value stored in (Default): "cmd" /c ""geosuite-hub.cmd" "%1"
const openCmd = `"C:\\Windows\\System32\\cmd.exe" /c ""${cmd}" "%1"`;
// Escape for .reg syntax: \ -> \\ and " -> \"
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const reg =
    'Windows Registry Editor Version 5.00\r\n\r\n' +
    '[HKEY_CURRENT_USER\\Software\\Classes\\geosuite-hub]\r\n' +
    '@="URL:GeoSuite Hub Protocol"\r\n' +
    '"URL Protocol"=""\r\n\r\n' +
    '[HKEY_CURRENT_USER\\Software\\Classes\\geosuite-hub\\shell\\open\\command]\r\n' +
    `@="${esc(openCmd)}"\r\n`;

const tmp = path.join(os.tmpdir(), 'geosuite-hub-register.reg');
fs.writeFileSync(tmp, reg, 'ascii');
execSync(`reg import "${tmp}"`, { stdio: 'inherit' });
fs.unlinkSync(tmp);
console.log('geosuite-hub:// registered -> ' + cmd);
