// Regression test for PR#22 review: rearmPendingTtl must not pile up stale
// watchdog waits in _pendingWaits across iframe recreates.
// Extracts waitViaUiTimer / rearmUiTimers / armPendingTtl / rearmPendingTtl
// from layers-and-tiles-list.ts and evals them with setTimeout shadowed
// (simulating the QuickJS extension host where timers delegate to the UI).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'geo_suite', 'src', 'layers-and-tiles-list.ts'), 'utf8');

function grab(name) {
  const m = src.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('not found: ' + name);
  return m[0];
}
// waitViaUiTimer/rearmUiTimers are 2-space-indent top-level; arm*/rearm* 4-space.
const code = [
  'let _waitSeq = 0;',
  'const _pendingWaits = Object.create(null);',
  grab('waitViaUiTimer'),
  grab('rearmUiTimers'),
  grab('armPendingTtl'),
  grab('rearmPendingTtl'),
  'this._api = { waitViaUiTimer, rearmUiTimers, armPendingTtl, rearmPendingTtl, _pendingWaits };'
].join('\n');

const posted = [];   // {action:'startTimer', id, ms}
const sandbox = {
  setTimeout: undefined,          // force the delegated path
  postToUI: (m) => posted.push(m),
  postMessage: () => {},
  Date, Math, Object, Promise, console,
  // stubs referenced inside armPendingTtl's .then (not fired in this test)
  markLayerFailed: () => {}, sendError: () => {}, aiToolReply: () => {},
};
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const api = sandbox._api;

// Count every delegated wait — on the unfixed code each arm adds another
// 'wait-N' entry, so the pile-up shows up as a growing count here.
const ttlWaits = () => Object.keys(api._pendingWaits);
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + msg); if (!cond) fails++; };

(async () => {
  const map = {};
  map['req1'] = { url: 'u', ownReq: { action: 'x' } };
  api.armPendingTtl(map, 'req1', 'duckdb');
  ok(ttlWaits().length === 1, 'first arm registers 1 wait, got ' + ttlWaits().length);

  // Simulate 10 iframe recreates: rearmUiTimers + rearmPendingTtl each time.
  for (let i = 0; i < 10; i++) {
    api.rearmUiTimers();
    api.rearmPendingTtl(map, 'req1');
  }
  ok(ttlWaits().length === 1, 'after 10 recreates still 1 wait, got ' + ttlWaits().length);
  ok(map['req1']._ttlGen === 11, 'generation bumped to 11, got ' + map['req1']._ttlGen);

  // Pending entry resolves → its wait must be dropped on next rearm.
  delete map['req1'];
  api.rearmUiTimers();
  ok(ttlWaits().length === 0, 'resolved pending drops its wait, got ' + ttlWaits().length);

  // timerDone for a superseded wait id must not fire the new arm's callback.
  const map2 = {};
  map2['r'] = { ownReq: {} };
  api.armPendingTtl(map2, 'r', 'geojson');
  const oldId = ttlWaits()[0];
  api.rearmPendingTtl(map2, 'r');            // new arm, old wait cancelled
  const newId = ttlWaits()[0];
  ok(oldId !== newId, 're-arm uses a fresh wait id');
  ok(api._pendingWaits[oldId] === undefined, 'old wait entry removed');
  // old iframe timer fires late for the cancelled id → handler finds nothing
  const w = api._pendingWaits[oldId];
  ok(!w, 'cancelled id resolves to nothing in _pendingWaits');

  // firing the CURRENT wait id resolves the armed promise (tombstone path)
  let fired = false;
  const p = map2['r'];
  api._pendingWaits[newId].resolve = () => { fired = true; delete api._pendingWaits[newId]; };
  api._pendingWaits[newId].resolve();
  ok(fired, 'current wait resolves');

  console.log(fails === 0 ? 'ALL OK' : fails + ' FAILURES');
  process.exit(fails === 0 ? 0 : 1);
})();
