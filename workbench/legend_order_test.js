// Verify PR#20 review fix: legend sub-tab order = registration order,
// incl. integer-like group names ('1','2') that break Object.keys ordering.
// Tests BOTH render paths against the actual compiled JS:
//   Path 1: getUI() -> legendInnerHtml (initial render in ui.show html)
//   Path 2: iframe inline script 'updateLegends' message handler
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'plugin-build', 'layers-and-tiles-list.js');

// registration order on purpose: '2' before '1', Default last
const ITEMS = [
  { group: '2', url: 'https://example.com/2.png' },
  { group: '1', url: 'https://example.com/1.png' },
  { group: null, url: 'https://example.com/d.png' },
];
const EXPECTED_IDS = ['legend-sub-Default', 'legend-sub-2', 'legend-sub-1'];

function stub() {
  const fn = function () { return p; };
  const p = new Proxy(fn, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return function () { return 0; };
      if (k === 'then') return undefined;
      if (k === Symbol.iterator) return function* () {};
      return p;
    },
    has() { return true; },
    apply() { return p; },
    set() { return true; },
    construct() { return p; },
  });
  return p;
}

function tabOrder(html) {
  const re = /class="sub-tab[^"]*" data-target="([^"]*)"/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function same(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------- Path 1: initial render ----------
let code = fs.readFileSync(SRC, 'utf8');
const marker = 'let _inspectorLegendItems = [];';
if (!code.includes(marker)) throw new Error('init marker not found');
code = code.replace(marker, 'let _inspectorLegendItems = ' + JSON.stringify(ITEMS) + ';');

let uiHtml = '';
const reearth = new Proxy({
  ui: { show(h) { if (!uiHtml && typeof h === 'string') uiHtml = h; } },
  extension: {
    on(ev, fn) { (this._h = this._h || {})[ev] = fn; },
    list: [],
    widget: {},
    block: {},
    postMessage() {},
  },
}, { get(t, k) { return k in t ? t[k] : stub(); }, set(t, k, v) { t[k] = v; return true; } });

const sandbox1 = {
  reearth, console,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  queueMicrotask: (f) => { try { f(); } catch (e) {} },
  Promise, fetch: () => Promise.reject(new Error('no fetch')),
  TextDecoder, TextEncoder, URL, atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  ArrayBuffer, Uint8Array, Uint8ClampedArray, Int32Array, Float64Array, DataView, DataView,
  JSON, Math, Date, Map, Set, WeakMap, WeakSet, Symbol, Reflect, Proxy, BigInt,
  navigator: { language: 'en', languages: ['en'] },
  location: { href: 'about:blank', search: '', protocol: 'about:' },
  history: {}, document: stub(), window: null, self: null, parent: stub(),
  localStorage: null, sessionStorage: null, indexedDB: null,
  XMLHttpRequest: function () {}, WebSocket: function () {},
  ResizeObserver: function () {}, IntersectionObserver: function () {}, MutationObserver: function () {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  globalThis: null,
};
sandbox1.window = sandbox1;
sandbox1.self = sandbox1;
sandbox1.globalThis = sandbox1;
vm.createContext(sandbox1);
try { vm.runInContext(code, sandbox1, { filename: 'layers-and-tiles-list.js' }); }
catch (e) { console.log('[path1] eval threw (may be ok):', e.message); }

if (!uiHtml) { console.error('[path1] FAIL: no ui.show html captured'); process.exit(1); }
// strip inline <script> source so only rendered tab markup is measured
const order1 = tabOrder(uiHtml.replace(/<script[\s\S]*?<\/script>/gi, ''));
console.log('[path1] initial render tab order:', JSON.stringify(order1));
console.log(same(order1, EXPECTED_IDS) ? '[path1] PASS' : '[path1] FAIL expected ' + JSON.stringify(EXPECTED_IDS));

// ---------- Path 2: updateLegends message handler in inline script ----------
const scripts = [];
const reScript = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = reScript.exec(uiHtml))) {
  if (/<script[^>]*\ssrc=/i.test(m[0])) continue;
  scripts.push(m[1]);
}
console.log('[path2] inline scripts found:', scripts.length);

const listeners = {};
const elCache = {};
function makeEl(id) {
  return {
    _id: id, innerHTML: '', textContent: '', value: '', checked: false,
    hidden: false, disabled: false, style: {}, dataset: {}, children: [],
    className: '', parentNode: null, firstChild: null,
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild(c) { return c; },
    insertAdjacentHTML(pos, h) { this.innerHTML += h; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    remove() {}, click() {}, focus() {}, blur() {},
    closest() { return null; }, contains() { return false; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 }; },
    cloneNode() { return makeEl('clone'); },
  };
}

const document2 = {
  readyState: 'complete',
  documentElement: makeEl('html'),
  body: makeEl('body'),
  head: makeEl('head'),
  getElementById(id) { return elCache[id] || (elCache[id] = makeEl(id)); },
  getElementsByClassName() { return []; },
  getElementsByTagName() { return []; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return makeEl(tag); },
  createTextNode(t) { return { textContent: t }; },
  createDocumentFragment() { return makeEl('frag'); },
  addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') { try { fn(); } catch (e) {} } },
  removeEventListener() {},
};

const sandbox2 = {
  console,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  queueMicrotask: (f) => { try { f(); } catch (e) {} },
  Promise, fetch: () => Promise.reject(new Error('no fetch')),
  TextDecoder, TextEncoder, URL,
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  ArrayBuffer, Uint8Array, Uint8ClampedArray, Int32Array, Float64Array, DataView,
  JSON, Math, Date, Map, Set, WeakMap, WeakSet, Symbol, Reflect, Proxy, BigInt,
  RegExp, Error, TypeError, RangeError, SyntaxError,
  document: document2,
  navigator: { language: 'en', languages: ['en'] },
  location: { href: 'about:blank', search: '', protocol: 'about:', reload() {} },
  history: { pushState() {}, replaceState() {} },
  parent: { postMessage() {} }, top: null, opener: null,
  addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
  removeEventListener() {},
  postMessage() {},
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; },
  WebSocket: function () {},
  ResizeObserver: function () { this.observe = () => {}; },
  IntersectionObserver: function () { this.observe = () => {}; },
  MutationObserver: function () { this.observe = () => {}; },
  Image: function () {}, Audio: function () {},
  alert() {}, confirm() { return false; }, prompt() { return ''; },
  getComputedStyle() { return {}; },
};
sandbox2.window = sandbox2;
sandbox2.self = sandbox2;
sandbox2.globalThis = sandbox2;
sandbox2.top = sandbox2;
Object.defineProperty(sandbox2, 'localStorage', { get() { throw new Error('sandboxed'); } });
Object.defineProperty(sandbox2, 'sessionStorage', { get() { throw new Error('sandboxed'); } });
vm.createContext(sandbox2);

for (let i = 0; i < scripts.length; i++) {
  try { vm.runInContext(scripts[i], sandbox2, { filename: 'inline-script-' + i + '.js' }); }
  catch (e) { console.log('[path2] script#' + i + ' threw (may be ok):', e.message); }
}

const msgHandlers = listeners['message'] || [];
console.log('[path2] message listeners registered:', msgHandlers.length);
if (!msgHandlers.length) { console.error('[path2] FAIL: no message listener'); process.exit(1); }

// dispatch real updateLegends message through every registered handler
msgHandlers.forEach(fn => {
  try { fn({ data: { action: 'updateLegends', items: ITEMS } }); }
  catch (e) { console.log('[path2] handler threw:', e.message); }
});

const legendEl = elCache['legend-content'];
const html2 = legendEl ? legendEl.innerHTML : '';
if (!html2) { console.error('[path2] FAIL: legend-content empty'); process.exit(1); }
const order2 = tabOrder(html2);
console.log('[path2] updateLegends tab order:', JSON.stringify(order2));
console.log(same(order2, EXPECTED_IDS) ? '[path2] PASS' : '[path2] FAIL expected ' + JSON.stringify(EXPECTED_IDS));
