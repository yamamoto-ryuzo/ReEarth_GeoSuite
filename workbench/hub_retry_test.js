// Simulate the patched hubExternalize iframe handler (basemap copy) to prove:
//  A) transient failures retry then succeed -> done(true)
//  B) server refusal {ok:false} -> done(false) immediately, no retry
//  C) persistent failure -> done(false) after exactly HUB_TRIES attempts
const fs = require('fs');
const src = fs.readFileSync('geo_suite/src/basemap-widget.ts', 'utf8');
const m = src.match(/\(function\(\) \{\n              var done = function\(ok, err\)[\s\S]*?hubAttempt\(\);\n            \}\)\(\);/);
if (!m) { console.error('handler block not found'); process.exit(1); }
const handler = m[0];

const calls = [];
const retryMsgs = [];
const msg = { reqId: 'r1', vecId: 'r1', endpoint: 'http://hub:8514/', register: { name: 'gs_x', src: 'http://x/test.fgb', kind: 'fgb' } };
let doneRes = null;
const postToParent = (o) => { if (o.action === 'hubResult') doneRes = o; if (o.action === 'hubRetry') retryMsgs.push(o); };

// fire only the 5s retry gap synchronously; abort timers never fire
const realSetTimeout = setTimeout;
global.setTimeout = (fn, ms) => { if (ms === 5000) { fn(); return 0; } return 0; };
global.clearTimeout = () => {};

const ok = (j) => ({ ok: true, status: 200, json: () => Promise.resolve(j) });
async function run(name, fetchImpl, expect) {
  calls.length = 0; retryMsgs.length = 0; doneRes = null;
  global.fetch = fetchImpl;
  eval('(function(){' + 'var msg=' + JSON.stringify(msg) + ';var postToParent=' + postToParent.toString() + ';' + handler + '})()');
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
  const cnt = (u) => calls.filter((c) => c === u).length;
  const total = calls.length;
  const pass = expect(doneRes, cnt, total);
  console.log((pass ? 'PASS' : 'FAIL') + ' ' + name + ' -> ' + JSON.stringify(doneRes) + ' calls=' + total +
    ' [status:' + cnt('http://hub:8514/vector/status') + ' sources:' + cnt('http://hub:8514/vector/sources') + ']');
  return pass;
}
const rec = (u, impl) => { calls.push(u); return impl(); };
const U = 'http://hub:8514';

(async () => {
  let all = true;
  // A: two transient failures (502 on probe), then success
  let n = 0;
  all &= await run('A: transient 502 x2 then ok', (u, o) => rec(u + (o && o.method === 'POST' ? ' POST' : ''), () => {
    if (o && o.method === 'POST') return Promise.resolve(ok({ ok: true }));
    if (u.endsWith('/status')) { n++; return n <= 2 ? Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) }) : Promise.resolve(ok({})); }
    return Promise.resolve(ok({ sources: {} }));
  }), (d) => d && d.ok === true && calls.length === 5);
  // B: POST returns explicit refusal {ok:false}
  all &= await run('B: register rejected', (u, o) => rec(u, () => {
    if (o && o.method === 'POST') return Promise.resolve(ok({ ok: false, error: 'unsupported kind' }));
    if (u.endsWith('/status')) return Promise.resolve(ok({}));
    return Promise.resolve(ok({ sources: {} }));
  }), (d) => d && d.ok === false && /unsupported kind/.test(d.error || '') && calls.length === 3);
  // C: permanently down -> done(false) after 3 attempts
  all &= await run('C: hub down', (u, o) => rec(u, () => Promise.reject(new Error('Failed to fetch'))),
    (d) => d && d.ok === false && /Failed to fetch/.test(d.error || '') && calls.length === 3);
  // D: already-fresh source (sources contains same name) -> done(true), no POST
  all &= await run('D: already registered', (u, o) => rec(u, () => {
    if (u.endsWith('/status')) return Promise.resolve(ok({}));
    return Promise.resolve(ok({ sources: { gs_x: { src: 'http://x/test.fgb', kind: 'fgb' } } }));
  }), (d) => d && d.ok === true && calls.length === 2);
  // E: POST 502 (transient ingest failure) is retried -> done(true), hubRetry posted
  n = 0;
  all &= await run('E: POST 502 then ok', (u, o) => rec(u + (o && o.method === 'POST' ? ' POST' : ''), () => {
    if (o && o.method === 'POST') { n++; return Promise.resolve(n === 1 ? { ok: false, status: 502, json: () => Promise.resolve({ error: 'locked' }) } : ok({ ok: true })); }
    if (u.endsWith('/status')) return Promise.resolve(ok({}));
    return Promise.resolve(ok({ sources: {} }));
  }), (d) => d && d.ok === true && retryMsgs.length === 1);
  // F: POST 404 (permanent) -> done(false) immediately, no retry
  all &= await run('F: POST 404 permanent', (u, o) => rec(u, () => {
    if (o && o.method === 'POST') return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'unknown source' }) });
    if (u.endsWith('/status')) return Promise.resolve(ok({}));
    return Promise.resolve(ok({ sources: {} }));
  }), (d) => d && d.ok === false && /unknown source/.test(d.error || '') && calls.length === 3 && retryMsgs.length === 0);
  global.setTimeout = realSetTimeout;
  process.exit(all ? 0 : 1);
})();
