// @ts-nocheck
// Basemap selector and attribution widget
// Reads basemap layers already added to the scene and shows a selector at the bottom-left.
declare const reearth: any;

function sendLog(...args: any[]): void {
  try { console.log.apply(console, args); } catch (e) {}
}

function sendError(...args: any[]): void {
  try { console.error.apply(console, args); } catch (e) {}
}

function postToUI(msg: any): void {
  try {
    if (reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') {
      reearth.ui.postMessage(msg);
      return;
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && (window as any).parent && typeof (window as any).parent.postMessage === 'function') {
      (window as any).parent.postMessage(msg, '*');
      return;
    }
  } catch (e) {}
  try {
    if (typeof (globalThis as any).parent !== 'undefined' && (globalThis as any).parent && typeof (globalThis as any).parent.postMessage === 'function') {
      (globalThis as any).parent.postMessage(msg, '*');
    }
  } catch (e) {}
}

function encodeNonAscii(u: string): string {
  try {
    if (!u || typeof u !== 'string') return u;
    return u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  } catch (e) {
    return u;
  }
}

function tryDecode(u: string): string {
  try { return decodeURIComponent(u); } catch (e) { return u; }
}

function urlsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const da = tryDecode(a || '');
    const db = tryDecode(b || '');
    if (da === db) return true;
    const ea = encodeNonAscii(da);
    const eb = encodeNonAscii(db);
    return ea === eb;
  } catch (e) {
    return false;
  }
}

function normalizeLayers(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    try { return Object.values(raw); } catch (e) { return []; }
  }
  return [];
}

function findLayerPanelWidgetId(): string | null {
  try {
    const list = (reearth && reearth.extension && reearth.extension.list) || [];
    const target = list.find((ex: any) => ex && ex.extensionId === 'layers-and-tiles-list');
    return target ? target.id : null;
  } catch (e) { return null; }
}

function postToLayerPanel(msg: any): void {
  const targetId = _layerPanelId || findLayerPanelWidgetId();
  if (!targetId) return;
  try {
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, msg);
    }
  } catch (e) {}
}

function requestBaseList(): void {
  try {
    _layerPanelId = findLayerPanelWidgetId();
    if (_layerPanelId) postToLayerPanel({ action: 'requestBaseList' });
  } catch (e) {}
}

let _lastBasemapsHash = '';
let _parsedBaseTiles: any[] = [];
// null = no selection yet (auto-select first base entry); '' = user selected "(なし)"
let _lastSelectedBasemapUrl: string | null = null;
let _layerPanelId: string | null = null;

const BASEMAP_TILE_ID = 'geo-suite-basemap';

function sendBasemapsToUI(): void {
  try {
    const items = _parsedBaseTiles.map((b: any) => ({
      url: b.encodedUrl || encodeNonAscii(b.url),
      title: b.title,
      attribution: b.attribution
    }));
    let selectedUrl = (_lastSelectedBasemapUrl !== null) ? _lastSelectedBasemapUrl : (items[0] ? items[0].url : '');
    const hash = JSON.stringify(items) + '|' + selectedUrl;
    if (hash === _lastBasemapsHash) return;
    _lastBasemapsHash = hash;
    postToUI({ action: 'basemaps', items: items, selectedUrl: selectedUrl });
  } catch (e) {
    sendError('[sendBasemapsToUI] error:', e);
  }
}

// Hide legacy basemap layers added by older versions of this plugin (they were
// regular tile layers marked with data.isBasemap and rendered above overlays).
function hideLegacyBasemapLayers(): void {
  try {
    const all = (reearth && reearth.layers && reearth.layers.layers) ? reearth.layers.layers : [];
    const arr = normalizeLayers(all);
    arr.forEach((l: any) => {
      if (!l || !l.data || !l.data.isBasemap || !l.id) return;
      try {
        if (typeof reearth.layers.hide === 'function') reearth.layers.hide(l.id);
        else if (typeof reearth.layers.override === 'function') reearth.layers.override(l.id, { visible: false });
      } catch (e) {}
    });
  } catch (e) {}
}

// Switch the basemap via the viewer property `tiles` (Re:Earth's official
// basemap mechanism). Scene tiles are always kept at the BOTTOM of Cesium's
// imagery layer collection by the engine, so overlay tile layers added by the
// layer panel are never hidden — regardless of when the basemap is switched.
function showBasemapByUrl(url: string | null): void {
  if (url === null || url === undefined) return;
  _lastSelectedBasemapUrl = url;
  try {
    const tiles: any[] = [];
    if (url !== '') {
      const entry = _parsedBaseTiles.find((b: any) => urlsEqual(b.encodedUrl, url) || urlsEqual(b.url, url));
      const encodedUrl = entry ? entry.encodedUrl : encodeNonAscii(url);
      const tile: any = { id: BASEMAP_TILE_ID, type: 'url', url: encodedUrl };
      const minL = (entry && typeof entry.minLevel === 'number' && !isNaN(entry.minLevel)) ? entry.minLevel : null;
      let maxL = (entry && typeof entry.maxLevel === 'number' && !isNaN(entry.maxLevel)) ? entry.maxLevel : null;
      if (maxL === null) maxL = defaultMaxLevelForUrl(encodedUrl);
      if (maxL !== null) tile.zoomLevelForURL = [minL !== null ? minL : 0, maxL];
      else if (minL !== null) tile.zoomLevelForURL = [minL];
      tiles.push(tile);
    }
    if (reearth && reearth.viewer && typeof reearth.viewer.overrideProperty === 'function') {
      reearth.viewer.overrideProperty({ tiles: tiles });
    } else {
      sendError('[showBasemapByUrl] reearth.viewer.overrideProperty is not available');
    }
    hideLegacyBasemapLayers();
  } catch (e) {
    sendError('[showBasemapByUrl] error:', e);
  }
}

function defaultMaxLevelForUrl(url: string): number | null {
  try {
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\/(gazo[1-4]|ort_old10|ort_riku10)\//.test(url)) return 17;
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\//.test(url)) return 18;
    if (/tile\.openstreetmap\.org\//.test(url)) return 19;
  } catch (e) {}
  return null;
}

function applyBaseList(items: any[]): void {
  if (!Array.isArray(items)) return;
  try {
    _parsedBaseTiles = items.map((b: any) => {
      const url = (b && b.url) ? String(b.url) : '';
      const title = (b && b.title) ? String(b.title) : '';
      const attribution = (b && b.attribution) ? String(b.attribution) : '';
      const encodedUrl = encodeNonAscii(url);
      return { url, encodedUrl, title, attribution, minLevel: (b && typeof b.minLevel === 'number') ? b.minLevel : null, maxLevel: (b && typeof b.maxLevel === 'number') ? b.maxLevel : null };
    }).filter((b: any) => b.url);
    if (!_parsedBaseTiles.length) return;

    if (_lastSelectedBasemapUrl === null && _parsedBaseTiles[0]) {
      _lastSelectedBasemapUrl = _parsedBaseTiles[0].encodedUrl;
    }
    showBasemapByUrl(_lastSelectedBasemapUrl);
    _lastBasemapsHash = '';
    sendBasemapsToUI();
  } catch (e) {
    sendError('[applyBaseList] error:', e);
  }
}

const html: string = `
  <style>
    html, body { margin: 0; padding: 0; width: 300px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .basemap-wrap { background-color: rgba(255, 255, 255, 0.3); padding: 5px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); backdrop-filter: blur(4px); width: 291px; margin-left: 9px; box-sizing: border-box; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .basemap-select { flex: 1; border: 1px solid #ccc; border-radius: 4px; padding: 6px; font-size: 0.9em; background: #fff; box-sizing: border-box; }
    .basemap-globe { flex: 0 0 auto; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.1em; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff; user-select: none; }
    .basemap-globe:hover { background: #f0f4fb; }
    .basemap-attribution { font-size: 0.7em; color: #333; margin-top: 4px; min-height: 1.2em; overflow-wrap: break-word; word-break: break-word; flex-basis: 100%; }
  </style>
  <div class="basemap-wrap">
    <div id="basemap-globe" class="basemap-globe" title="Open current view in Google Earth" data-i18n-title="openInGoogleEarth" role="button" aria-label="Open current view in Google Earth" data-i18n-aria="openInGoogleEarth">🌐</div>
    <select id="basemap-select" class="basemap-select">
      <option value="" data-i18n="none">(None)</option>
    </select>
    <div id="basemap-attribution" class="basemap-attribution"></div>
  </div>
  <script>
    (function(){
      // --- i18n: English-base dictionary (missing keys fall back to en) ---
      var GEO_I18N = {
        en: { none:'(None)', openInGoogleEarth:'Open current view in Google Earth' },
        ja: { none:'(なし)', openInGoogleEarth:'Google Earth で現在の表示を開く' },
        'zh-CN': { none:'（无）', openInGoogleEarth:'在 Google 地球中打开当前视图' },
        'zh-TW': { none:'（無）', openInGoogleEarth:'在 Google 地球中開啟目前檢視' },
        ko: { none:'(없음)', openInGoogleEarth:'Google 어스에서 현재 뷰 열기' },
        es: { none:'(Ninguno)', openInGoogleEarth:'Abrir vista actual en Google Earth' },
        fr: { none:'(Aucun)', openInGoogleEarth:'Ouvrir la vue actuelle dans Google Earth' },
        de: { none:'(Keine)', openInGoogleEarth:'Aktuelle Ansicht in Google Earth öffnen' },
        it: { none:'(Nessuna)', openInGoogleEarth:'Apri vista corrente in Google Earth' },
        pt: { none:'(Nenhum)', openInGoogleEarth:'Abrir vista atual no Google Earth' },
        ru: { none:'(Нет)', openInGoogleEarth:'Открыть текущий вид в Google Earth' },
        nl: { none:'(Geen)', openInGoogleEarth:'Huidige weergave openen in Google Earth' },
        pl: { none:'(Brak)', openInGoogleEarth:'Otwórz bieżący widok w Google Earth' },
        uk: { none:'(Немає)', openInGoogleEarth:'Відкрити поточний вигляд у Google Earth' },
        tr: { none:'(Yok)', openInGoogleEarth:'Geçerli görünümü Google Earth’te aç' },
        ar: { none:'(لا شيء)', openInGoogleEarth:'فتح العرض الحالي في Google Earth' },
        hi: { none:'(कोई नहीं)', openInGoogleEarth:'Google Earth में वर्तमान दृश्य खोलें' },
        id: { none:'(Tidak ada)', openInGoogleEarth:'Buka tampilan saat ini di Google Earth' },
        th: { none:'(ไม่มี)', openInGoogleEarth:'เปิดมุมมองปัจจุบันใน Google Earth' },
        vi: { none:'(Không có)', openInGoogleEarth:'Mở chế độ xem hiện tại trong Google Earth' }
      };
      var GEO_SUPPORTED = ['en','ja','zh-CN','zh-TW','ko','es','fr','de','it','pt','ru','nl','pl','uk','tr','ar','hi','id','th','vi'];
      var GEO_LANG = 'en';
      function resolveLang() {
        try {
          var conf = String(window._GEO_LANG_CONF || 'auto').toLowerCase().trim();
          var cand = (conf && conf !== 'auto') ? conf : String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
          if (cand.indexOf('zh') === 0) {
            return (cand.indexOf('tw') > -1 || cand.indexOf('hk') > -1 || cand.indexOf('mo') > -1 || cand.indexOf('hant') > -1) ? 'zh-TW' : 'zh-CN';
          }
          var i;
          for (i = 0; i < GEO_SUPPORTED.length; i++) { if (GEO_SUPPORTED[i].toLowerCase() === cand) return GEO_SUPPORTED[i]; }
          var base = cand.split('-')[0];
          for (i = 0; i < GEO_SUPPORTED.length; i++) { if (GEO_SUPPORTED[i].toLowerCase().split('-')[0] === base) return GEO_SUPPORTED[i]; }
        } catch (e) {}
        return 'en';
      }
      GEO_LANG = resolveLang();
      function t(key) {
        return (GEO_I18N[GEO_LANG] && GEO_I18N[GEO_LANG][key]) || (GEO_I18N.en && GEO_I18N.en[key]) || key;
      }
      function applyI18n() {
        try {
          try { document.documentElement.lang = GEO_LANG; } catch (e) {}
          var apply = function(sel, fn) {
            try {
              var nodes = document.querySelectorAll(sel);
              for (var i = 0; i < nodes.length; i++) { try { fn(nodes[i]); } catch (e) {} }
            } catch (e) {}
          };
          apply('[data-i18n]', function(el) { el.textContent = t(el.getAttribute('data-i18n')); });
          apply('[data-i18n-title]', function(el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
          apply('[data-i18n-aria]', function(el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
        } catch (e) {}
      }
      try { applyI18n(); } catch (e) {}

      const select = document.getElementById('basemap-select');
      const attrEl = document.getElementById('basemap-attribution');
      const globeBtn = document.getElementById('basemap-globe');

      function postToParent(data) {
        try {
          if (window.parent && data) window.parent.postMessage(data, '*');
        } catch(e) {}
      }

      function requestBaseListFromUI() {
        postToParent({ action: 'requestBaseList' });
      }

      function updateAttribution() {
        try {
          const opt = select && select.options[select.selectedIndex];
          if (!opt || !attrEl) return;
          let attr = (opt && opt.dataset.attribution) ? opt.dataset.attribution : '';
          try { attr = decodeURIComponent(attr); } catch(e){}
          const div = document.createElement('div');
          div.innerHTML = attr;
          attrEl.textContent = div.textContent || div.innerText || '';
        } catch(e) {}
      }

      function renderOptions(items, selectedUrl) {
        if (!select) return;
        select.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = t('none');
        select.appendChild(noneOpt);
        if (items && items.length > 0) {
          items.forEach(function(b) {
            const opt = document.createElement('option');
            opt.value = b.url || '';
            opt.textContent = b.title || b.url || '';
            opt.setAttribute('data-attribution', encodeURIComponent(b.attribution || ''));
            select.appendChild(opt);
          });
        }
        if (select) {
          select.value = (selectedUrl !== undefined && selectedUrl !== null) ? String(selectedUrl) : '';
        }
        updateAttribution();
      }

      if (select) {
        select.addEventListener('change', function() {
          updateAttribution();
          if (window.parent) {
            window.parent.postMessage({ action: 'selectBasemap', url: select.value }, '*');
          }
        });
        select.addEventListener('focus', function() {
          // ドロップダウンが空（(なし) だけ）の場合、レイヤーパネルに再読み込みを依頼
          if (select.options.length <= 1) {
            requestBaseListFromUI();
          }
        });
      }

      if (globeBtn) {
        globeBtn.addEventListener('click', function() {
          if (window.parent) {
            window.parent.postMessage({ action: 'openGoogleEarth' }, '*');
          }
        });
      }

      // WKB(ISO/EWKB) -> GeoJSON geometry (shared decoder; kasugai vector-decode.js port)
      var vecWkbToGeoJson = function(bytes) {
        if (!bytes || !bytes.byteLength) return null;
        var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        var pos = 0;
        var readGeometry = function() {
          var littleEndian = view.getUint8(pos) === 1; pos += 1;
          var raw = view.getUint32(pos, littleEndian); pos += 4;
          var base = raw & 0xffff;
          var hasZ = (raw & 0x80000000) !== 0;
          var hasM = (raw & 0x40000000) !== 0;
          var hasSrid = (raw & 0x20000000) !== 0;
          if (!hasZ && !hasM && raw >= 1000) {
            var variant = Math.floor(raw / 1000);
            hasZ = variant === 1 || variant === 3;
            hasM = variant === 2 || variant === 3;
            base = raw % 1000;
          }
          if (hasSrid) pos += 4;
          var count = function() { var n = view.getUint32(pos, littleEndian); pos += 4; return n; };
          var point = function() {
            var c = [view.getFloat64(pos, littleEndian), view.getFloat64(pos + 8, littleEndian)];
            pos += 16;
            if (hasZ) { c.push(view.getFloat64(pos, littleEndian)); pos += 8; }
            if (hasM) pos += 8;
            return c;
          };
          var points = function() { var a = new Array(count()); for (var i = 0; i < a.length; i++) a[i] = point(); return a; };
          var rings = function() { var a = new Array(count()); for (var i = 0; i < a.length; i++) a[i] = points(); return a; };
          var children = function() { var a = new Array(count()); for (var i = 0; i < a.length; i++) a[i] = readGeometry(); return a; };
          switch (base) {
            case 1: return { type: 'Point', coordinates: point() };
            case 2: return { type: 'LineString', coordinates: points() };
            case 3: return { type: 'Polygon', coordinates: rings() };
            case 4: return { type: 'MultiPoint', coordinates: children().map(function(g) { return g && g.coordinates; }) };
            case 5: return { type: 'MultiLineString', coordinates: children().map(function(g) { return g && g.coordinates; }) };
            case 6: return { type: 'MultiPolygon', coordinates: children().map(function(g) { return g && g.coordinates; }) };
            case 7: return { type: 'GeometryCollection', geometries: children().filter(Boolean) };
            default: return null;
          }
        };
        try { return readGeometry(); } catch (e) { return null; }
      };

      // kasczip:// lazy member fetch — the zip is fetched+unzipped inside
      // THIS iframe (persistent, so the cache survives panel refreshes),
      // never crossing the extension context as giant base64 payloads.
      var _zipCache = {};
      var kascB64ToBytes = function(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      };
      var zipOrB64 = function(msg) {
        if (msg.dataB64) return Promise.resolve(kascB64ToBytes(msg.dataB64));
        if (!msg.zipPath) return Promise.reject(new Error('no zip member data'));
        var c = _zipCache[msg.zipId];
        if (c && c.zfiles && c.zfiles[msg.zipPath]) return Promise.resolve(c.zfiles[msg.zipPath]);
        var url = msg.zipUrl || (c && c.url);
        if (!url) return Promise.reject(new Error('no zip source for ' + msg.zipPath));
        var zipP = window._fflateModule || (window._fflateModule = import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm'));
        return zipP.then(function(ff) {
          return fetch(url, { mode: 'cors' }).then(function(res) {
            if (!res || !res.ok) throw new Error('zip HTTP ' + (res && res.status));
            return res.arrayBuffer();
          }).then(function(ab) {
            var zfiles = ff.unzipSync(new Uint8Array(ab));
            _zipCache[msg.zipId] = { url: url, zfiles: zfiles };
            var b = zfiles[msg.zipPath];
            if (!b) throw new Error('member missing: ' + msg.zipPath);
            return b;
          });
        });
      };

      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data;
          if (!msg || !msg.action) return;
          if (msg.action === 'basemaps') {
            renderOptions(msg.items, msg.selectedUrl);
          } else if (msg.action === 'lang') {
            try {
              window._GEO_LANG_CONF = String(msg.lang || 'auto');
              GEO_LANG = resolveLang();
              applyI18n();
            } catch (e) {}
          } else if (msg.action === 'ddbLoad') {
            // DuckDB-Wasm query host. This iframe persists across panel
            // re-renders, so the wasm instance stays warm between queries
            // (unlike the layer panel iframe which is recreated by ui.show).
            (function() {
              try { postToParent({ action: 'ddbAck', vecId: msg.vecId }); } catch (e) {}
              var reply = function(geojson, error) {
                try {
                  if (geojson) {
                    geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                      return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                    }));
                  }
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; try { console.log('[gj-size/ddb] ' + Math.round(sz / 104857.6) / 10 + 'MB'); } catch (e2) {} if (sz > 8 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded) — host DATA/ and use qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'ddbResult', vecId: msg.vecId, layerId: msg.layerId || null, geojson: geojson, error: error });
                } catch (e) {}
              };
              var qi = function(n) { return '"' + String(n).replace(/"/g, '""') + '"'; };
              var ql = function(v) { return "'" + String(v).replace(/'/g, "''") + "'"; };
              var boundsSql = function(b) {
                if (!b || !b.ranges || !b.ranges.length) return null;
                var env = function(r) { return 'ST_MakeEnvelope(' + Number(r.west) + ',' + Number(b.south) + ',' + Number(r.east) + ',' + Number(b.north) + ')'; };
                return b.ranges.length === 1 ? env(b.ranges[0]) : 'ST_Union(' + env(b.ranges[0]) + ', ' + env(b.ranges[1]) + ')';
              };
              try {
                if (!window._ddbModule) {
                  var loading = import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm').then(function(duckdb) {
                    return duckdb.selectBundle(duckdb.getJsDelivrBundles()).then(function(bundle) {
                      var workerUrl = URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(bundle.mainWorker) + ');'], { type: 'text/javascript' }));
                      var worker = new Worker(workerUrl);
                      var logger = duckdb.VoidLogger ? new duckdb.VoidLogger() : new duckdb.ConsoleLogger();
                      var db = new duckdb.AsyncDuckDB(logger, worker);
                      return db.instantiate(bundle.mainModule, bundle.pthreadWorker).then(function() {
                        try { URL.revokeObjectURL(workerUrl); } catch (e) {}
                        return db.connect();
                      }).then(function(conn) {
                        var st = { conn: conn, db: db, spatial: false };
                        return conn.query('INSTALL httpfs; LOAD httpfs;').catch(function() {})
                          .then(function() { return conn.query('INSTALL spatial; LOAD spatial;').then(function() { st.spatial = true; }).catch(function() {}); })
                          .then(function() { return conn.query('INSTALL parquet; LOAD parquet;').catch(function() {}); })
                          .then(function() { return st; });
                      });
                    });
                  });
                  loading.catch(function() { if (window._ddbModule === loading) window._ddbModule = null; });
                  window._ddbModule = loading;
                }
                window._ddbModule.then(function(st) {
                  var conn = st.conn, spatial = st.spatial;
                  var format = String(msg.format || '').toLowerCase();
                  var literal = ql(msg.url);
                  var isParquet = format === 'parquet' || (!format && /\\.parquet([?#]|$)/i.test(msg.url || ''));
                  // dataB64 (kasczip:// member) — register the bytes as a
                  // virtual file and point the SQL at that name.
                  var prep = Promise.resolve();
                  if (msg.dataB64 || msg.zipPath) {
                    if (!(st.db && typeof st.db.registerFileBuffer === 'function')) throw new Error('dataB64 source not supported by this duckdb-wasm build');
                    var vext = (/\\.([a-z0-9]{1,8})([?#].*)?$/i.exec(msg.zipName || msg.zipPath || msg.url || '') || [null, 'bin'])[1];
                    var vname = 'kasczip_' + String(msg.vecId || 'f') + '.' + String(vext).toLowerCase();
                    literal = ql(vname);
                    prep = zipOrB64(msg).then(function(by) { return st.db.registerFileBuffer(vname, by); });
                  }
                  // sql: raw query mode wraps the query as a subquery source.
                  var source;
                  if (msg.query) {
                    var q0 = String(msg.query).replace(/;+\\s*$/, '');
                    if (/:bbox\\b/i.test(q0)) {
                      if (!spatial) throw new Error('sql: :bbox requires the spatial extension');
                      q0 = q0.replace(/:bbox\\b/gi, boundsSql(msg.bounds) || 'ST_MakeEnvelope(-180,-90,180,90)');
                    }
                    source = '(' + q0 + ')';
                  } else {
                    source = format === 'parquet' ? 'read_parquet(' + literal + ')'
                      : (format === 'csv' || format === 'tsv') ? 'read_csv_auto(' + literal + ')'
                      : (format === 'json' || format === 'geojson') ? 'read_json_auto(' + literal + ')'
                      : literal; // replacement scan infers reader from the extension
                  }
                  var ctx = {};
                  return prep.then(function() {
                    return conn.query('DESCRIBE SELECT * FROM ' + source).then(function(table) {
                    ctx.columns = table.toArray().map(function(row) {
                      var p = (typeof row.toJSON === 'function') ? row.toJSON() : row;
                      return { name: String(p.column_name), type: String(p.column_type || '').toUpperCase() };
                    });
                    var geomCol = null;
                    if (msg.geom) {
                      geomCol = ctx.columns.filter(function(c) { return c.name === msg.geom; })[0] || null;
                      if (!geomCol) throw new Error('geom= column not found: ' + msg.geom);
                    } else {
                      geomCol = ctx.columns.filter(function(c) { return c.type.indexOf('GEOMETRY') >= 0 || c.type.indexOf('WKB') >= 0; })[0]
                        || ctx.columns.filter(function(c) { return /^(geometry|geom|wkb|the_geom)$/i.test(c.name); })[0]
                        || ctx.columns.filter(function(c) { return c.type === 'BLOB' || c.type === 'BINARY'; })[0]
                        || null;
                    }
                    ctx.geomCol = geomCol;
                    ctx.lonlat = null;
                    if (!geomCol) {
                      var findCol = function(explicit, re) {
                        if (explicit) {
                          if (!ctx.columns.some(function(c) { return c.name === explicit; })) throw new Error('column not found: ' + explicit);
                          return explicit;
                        }
                        var c = ctx.columns.filter(function(c) { return re.test(c.name); })[0];
                        return c ? c.name : null;
                      };
                      var lon = findCol(msg.lon, /^(lon|lng|longitude)$/i);
                      var lat = findCol(msg.lat, /^(lat|latitude)$/i);
                      if ((lon || lat) && !(lon && lat)) throw new Error('lon/lat columns could not be resolved (specify lon= and lat=)');
                      if (lon && lat) ctx.lonlat = { lon: lon, lat: lat };
                    }
                    if (!geomCol && !ctx.lonlat) throw new Error('geometry column not found (use geom= or lon=/lat=)');
                    // covering bbox columns: covering= > geo metadata > conventional names
                    ctx.covering = null;
                    if (msg.bounds && Array.isArray(msg.covering) && msg.covering.length === 4) {
                      ctx.covering = { refs: { xmin: qi(msg.covering[0]), xmax: qi(msg.covering[1]), ymin: qi(msg.covering[2]), ymax: qi(msg.covering[3]) }, exclude: msg.covering.slice() };
                      return null;
                    }
                    if (msg.bounds && isParquet) {
                      return conn.query("SELECT key, value FROM parquet_kv_metadata(" + literal + ") WHERE key = 'geo'").then(function(t2) {
                        try {
                          var row = t2.toArray()[0];
                          var raw = row && (typeof row.toJSON === 'function' ? row.toJSON() : row).value;
                          var text = (typeof raw === 'string') ? raw : new TextDecoder().decode(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
                          var geo = JSON.parse(text);
                          var cov = geo && geo.columns && geo.columns[geo.primary_column] && geo.columns[geo.primary_column].covering && geo.columns[geo.primary_column].covering.bbox;
                          if (cov && cov.xmin && cov.xmax && cov.ymin && cov.ymax) {
                            var ref = function(p) { return Array.isArray(p) && p.length ? p.map(qi).join('.') : null; };
                            var refs = { xmin: ref(cov.xmin), xmax: ref(cov.xmax), ymin: ref(cov.ymin), ymax: ref(cov.ymax) };
                            if (refs.xmin && refs.xmax && refs.ymin && refs.ymax) {
                              ctx.covering = { refs: refs, exclude: [cov.xmin[0], cov.xmax[0], cov.ymin[0], cov.ymax[0]] };
                            }
                          }
                        } catch (e) {}
                      }).catch(function() {});
                    }
                    return null;
                    });
                  }).then(function() {
                    if (msg.bounds && !ctx.covering) {
                      var fc = function(n) { var c = ctx.columns.filter(function(c) { return c.name.toLowerCase() === n; })[0]; return c ? c.name : null; };
                      var n = { xmin: fc('xmin'), xmax: fc('xmax'), ymin: fc('ymin'), ymax: fc('ymax') };
                      if (n.xmin && n.xmax && n.ymin && n.ymax) {
                        ctx.covering = { refs: { xmin: qi(n.xmin), xmax: qi(n.xmax), ymin: qi(n.ymin), ymax: qi(n.ymax) }, exclude: [] };
                      }
                    }
                    var geomExpr = null;
                    if (ctx.geomCol) {
                      var gname = qi(ctx.geomCol.name);
                      var cast = ctx.geomCol.type.indexOf('GEOMETRY') >= 0 ? gname
                        : (ctx.geomCol.type === 'BLOB' || ctx.geomCol.type === 'BINARY' || ctx.geomCol.type.indexOf('WKB') >= 0) ? 'TRY(ST_GeomFromWKB(' + gname + '))'
                        : 'COALESCE(TRY(ST_GeomFromText(' + gname + ')), TRY(ST_GeomFromGeoJSON(' + gname + ')))';
                      ctx.geomCast = cast;
                      geomExpr = spatial ? ('ST_AsWKB(' + cast + ') AS "__geom__"') : (gname + ' AS "__geom__"');
                    }
                    var selCols = null;
                    if (Array.isArray(msg.columns) && msg.columns.length) {
                      var missingCols = msg.columns.filter(function(n) { return !ctx.columns.some(function(c) { return c.name === n; }); });
                      if (missingCols.length) throw new Error('columns= not found: ' + missingCols.join(','));
                      selCols = msg.columns.map(qi).join(', ');
                    }
                    var excludeList = [];
                    if (ctx.geomCol) excludeList.push(ctx.geomCol.name);
                    if (ctx.covering) excludeList = excludeList.concat(ctx.covering.exclude);
                    var select = ctx.geomCol
                      ? (selCols ? 'SELECT ' + selCols + ', ' + geomExpr : 'SELECT * EXCLUDE (' + excludeList.map(qi).join(', ') + '), ' + geomExpr)
                      : 'SELECT *';
                    var preds = [];
                    var envSql = msg.query ? null : boundsSql(msg.bounds);
                    if (!msg.query && msg.where) preds.push('(' + msg.where + ')');
                    if (envSql) {
                      if (ctx.covering) {
                        var b = msg.bounds;
                        var lonPred = b.ranges.map(function(r) {
                          return '(' + ctx.covering.refs.xmax + ' >= ' + Number(r.west) + ' AND ' + ctx.covering.refs.xmin + ' <= ' + Number(r.east) + ')';
                        }).join(' OR ');
                        preds.push('((' + lonPred + ') AND ' + ctx.covering.refs.ymax + ' >= ' + Number(b.south) + ' AND ' + ctx.covering.refs.ymin + ' <= ' + Number(b.north) + ')');
                      }
                      var operand = ctx.geomCol ? (spatial ? ctx.geomCast : null)
                        : (spatial && ctx.lonlat ? 'ST_Point(' + qi(ctx.lonlat.lon) + ', ' + qi(ctx.lonlat.lat) + ')' : null);
                      if (operand) preds.push('ST_Intersects(' + operand + ', ' + envSql + ')');
                    }
                    var sql = select + ' FROM ' + source;
                    if (preds.length) sql += ' WHERE ' + preds.join(' AND ');
                    var lim = msg.query ? 0 : Math.floor(Number(msg.limit) || 0);
                    if (lim > 0) sql += ' LIMIT ' + lim;
                    return conn.query(sql).then(function(table) {
                      var fields = table.schema.fields.map(function(f) { return f.name; });
                      var geomKey = fields.indexOf('__geom__') >= 0 ? '__geom__' : null;
                      var features = [];
                      var rows = table.toArray();
                      for (var i = 0; i < rows.length; i++) {
                        var row = rows[i];
                        var geometry = null;
                        if (geomKey) {
                          var v = row[geomKey];
                          if (v instanceof Uint8Array) geometry = vecWkbToGeoJson(v);
                          else if (v && typeof v === 'object' && typeof v.type === 'string' && ('coordinates' in v || 'geometries' in v)) geometry = v;
                          else if (typeof v === 'string' && v.trim().charAt(0) === '{') {
                            try { var g = JSON.parse(v); geometry = g && typeof g.type === 'string' ? g : null; } catch (e) {}
                          }
                        }
                        if (!geometry && ctx.lonlat) {
                          var x = Number(row[ctx.lonlat.lon]), y = Number(row[ctx.lonlat.lat]);
                          if (isFinite(x) && isFinite(y)) geometry = { type: 'Point', coordinates: [x, y] };
                        }
                        if (!geometry) continue;
                        var props = {};
                        for (var j = 0; j < fields.length; j++) { if (fields[j] !== geomKey) props[fields[j]] = row[fields[j]]; }
                        features.push({ type: 'Feature', geometry: geometry, properties: props });
                      }
                      return { type: 'FeatureCollection', features: features };
                    });
                  });
                }).then(function(fc) { reply(fc, null); }, function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          } else if (msg.action === 'gpkgLoad') {
            // GeoPackage decode via sql.js (mirror of the layer-panel iframe
            // handler). DBs stay open per url so bbox=auto re-queries do not
            // re-download the file.
            (function() {
              var reply = function(geojson, error, qml) {
                try {
                  if (geojson) {
                    geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                      return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                    }));
                  }
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; try { console.log('[gj-size/gpkg] ' + Math.round(sz / 104857.6) / 10 + 'MB'); } catch (e2) {} if (sz > 8 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded) — host DATA/ and use qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'gpkgResult', vecId: msg.vecId, layerId: msg.layerId || null, geojson: geojson, error: error, qml: qml || null });
                } catch (e) {}
              };
              var b64ToBytes = function(b64) {
                var bin = atob(b64);
                var out = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out;
              };
              var gpkgBinToWkb = function(value) {
                if (!(value instanceof Uint8Array) || value.length < 8 || value[0] !== 0x47 || value[1] !== 0x50) return null;
                var envelopeBytes = [0, 32, 48, 48, 64][(value[3] >> 1) & 0x07] || 0;
                var wkb = value.subarray(8 + envelopeBytes);
                return wkb.length ? wkb : null;
              };
              var gpkgBinEnvelope = function(value) {
                if (!(value instanceof Uint8Array) || value.length < 40 || value[0] !== 0x47 || value[1] !== 0x50) return null;
                var t = (value[3] >> 1) & 0x07;
                if (t < 1 || t > 4) return null;
                var little = (value[3] & 1) === 1;
                var view = new DataView(value.buffer, value.byteOffset, value.byteLength);
                try { return { west: view.getFloat64(8, little), east: view.getFloat64(16, little), south: view.getFloat64(24, little), north: view.getFloat64(32, little) }; } catch (e) { return null; }
              };
              var gpkgEnvIntersects = function(env, bbox) {
                if (!env || !bbox) return true;
                var south = Number(bbox.south), north = Number(bbox.north);
                if (!(env.north >= south && env.south <= north)) return false;
                return (bbox.ranges || []).some(function(r) { return env.east >= Number(r.west) && env.west <= Number(r.east); });
              };
              try { postToParent({ action: 'gpkgAck', vecId: msg.vecId }); } catch (e) {}
              try {
                if (!window._sqljsModule) {
                  var lp = import('https://cdn.jsdelivr.net/npm/sql.js@1.13.0/+esm').then(function(mod) {
                    var init = mod.default || mod.initSqlJs || mod;
                    return init({ locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/' + f; } });
                  });
                  lp.catch(function() { if (window._sqljsModule === lp) window._sqljsModule = null; });
                  window._sqljsModule = lp;
                }
                if (!window._gpkgDbs) window._gpkgDbs = {};
                var dbKey = (msg.dataB64 || msg.zipPath) ? ('bytes:' + (msg.zipPath || msg.url)) : msg.url;
                var dbP = window._gpkgDbs[dbKey];
                if (!dbP) {
                  dbP = window._sqljsModule.then(function(SQL) {
                    var bufP = (msg.dataB64 || msg.zipPath)
                      ? zipOrB64(msg)
                      : fetch(msg.url, { mode: 'cors' }).then(function(res) {
                          if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                          return res.arrayBuffer();
                        }).then(function(buf) { return new Uint8Array(buf); });
                    return bufP.then(function(bytes) { return new SQL.Database(bytes); });
                  });
                  dbP.catch(function() { if (window._gpkgDbs[dbKey] === dbP) delete window._gpkgDbs[dbKey]; });
                  window._gpkgDbs[dbKey] = dbP;
                }
                dbP.then(function(db) {
                  var qIdent = function(n) { return '"' + String(n).replace(/"/g, '""') + '"'; };
                  var qLit = function(v) { return "'" + String(v).replace(/'/g, "''") + "'"; };
                  var tableName = msg.table || null;
                  if (!tableName) {
                    var r0 = db.exec('SELECT table_name FROM gpkg_geometry_columns ORDER BY rowid LIMIT 1');
                    tableName = r0[0] && r0[0].values && r0[0].values[0] && r0[0].values[0][0] || null;
                  }
                  if (!tableName) throw new Error('feature table not found');
                  var gres = db.exec('SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ' + qLit(tableName) + ' LIMIT 1');
                  var geomCol = (gres[0] && gres[0].values && gres[0].values[0] && gres[0].values[0][0]) || 'geom';
                  var cols = Array.isArray(msg.columns) && msg.columns.length ? msg.columns.map(qIdent) : null;
                  var selectCols = cols ? cols.concat([qIdent(geomCol)]).join(', ') : '*';
                  var sql = 'SELECT ' + selectCols + ' FROM ' + qIdent(tableName)
                    + (msg.where ? ' WHERE (' + msg.where + ')' : '')
                    + (Number.isInteger(msg.limit) && msg.limit > 0 ? ' LIMIT ' + Math.floor(msg.limit) : '');
                  var stmt = db.prepare(sql);
                  var colNames = stmt.getColumnNames();
                  var features = [];
                  while (stmt.step()) {
                    var row = stmt.get();
                    var rec = {};
                    colNames.forEach(function(c, i) { rec[c] = row[i]; });
                    if (msg.bounds && !gpkgEnvIntersects(gpkgBinEnvelope(rec[geomCol]), msg.bounds)) continue;
                    var wkb = gpkgBinToWkb(rec[geomCol]);
                    var geometry = wkb ? vecWkbToGeoJson(wkb) : null;
                    if (!geometry) continue;
                    var properties = {};
                    for (var i = 0; i < colNames.length; i++) { var c = colNames[i]; if (c !== geomCol) properties[c] = rec[c]; }
                    features.push({ type: 'Feature', geometry: geometry, properties: properties });
                  }
                  stmt.free();
                  var qml = null;
                  try {
                    var sres = db.exec('SELECT styleQML FROM layer_styles WHERE f_table_name = ' + qLit(tableName) + ' ORDER BY useAsDefault DESC');
                    var qv = sres[0] && sres[0].values && sres[0].values[0] && sres[0].values[0][0];
                    if (typeof qv === 'string' && qv.trim()) qml = qv;
                  } catch (e) {}
                  reply({ type: 'FeatureCollection', features: features }, null, qml);
                }, function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          }
        } catch(e) {}
      });

      requestBaseListFromUI();
      try {
        if (typeof setTimeout === 'function') {
          setTimeout(function() {
            if (select && select.options.length <= 1) {
              requestBaseListFromUI();
            }
          }, 3000);
          setTimeout(function() {
            if (select && select.options.length <= 1) {
              requestBaseListFromUI();
            }
          }, 10000);
        }
      } catch(e) {}
    })();
  </script>
`;

function openGoogleEarthInNewWindow(): void {
  try {
    const pos = (reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
    if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') {
      sendLog('[openGoogleEarth] no camera position');
      return;
    }
    const cameraLat = pos.lat;
    const cameraLng = pos.lng;
    const height = (typeof pos.height === 'number' && !isNaN(pos.height)) ? Math.max(0, pos.height) : 1000;
    const headingRad = (typeof pos.heading === 'number' && !isNaN(pos.heading)) ? pos.heading : 0;
    const pitchRad = (typeof pos.pitch === 'number' && !isNaN(pos.pitch)) ? pos.pitch : -Math.PI / 2;

    // Convert Cesium/Re:Earth pitch to Google Earth tilt (nadir -PI/2 -> 0, horizon 0 -> 90)
    const tiltRad = Math.max(0, Math.min(Math.PI / 2, pitchRad + Math.PI / 2));
    const tiltDeg = tiltRad * 180 / Math.PI;
    const headingDeg = ((headingRad * 180 / Math.PI) % 360 + 360) % 360;

    // Compute the ground target point that the camera is looking at, using the same
    // back-calculation logic as KASUGAI Canvas's flyToFeature.
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(cameraLat * Math.PI / 180);
    let targetLat = cameraLat;
    let targetLng = cameraLng;
    let distance = height;
    if (tiltRad > 0.01) {
      const horizontalDistance = height * Math.tan(tiltRad);
      targetLat = cameraLat + (horizontalDistance * Math.cos(headingRad)) / metersPerDegLat;
      targetLng = cameraLng + (horizontalDistance * Math.sin(headingRad)) / (metersPerDegLng || 1);
      distance = height / Math.cos(tiltRad);
    }

    const url = `https://earth.google.com/web/@${targetLat.toFixed(6)},${targetLng.toFixed(6)},0a,${distance.toFixed(2)}d,35y,${headingDeg.toFixed(1)}h,${tiltDeg.toFixed(1)}t,0r`;
    if (reearth && reearth.viewer && typeof reearth.viewer.open === 'function') {
      reearth.viewer.open(url);
    } else {
      sendLog('[openGoogleEarth] reearth.viewer.open is not available');
    }
  } catch (e) {
    sendError('[openGoogleEarth] error:', e);
  }
}

// DuckDB query host routing: vecId -> requesting extension id. Replies
// (ddbAck/ddbResult) from the UI iframe are forwarded to that extension.
const _ddbSenders: { [key: string]: string } = {};
function ddbReplyToSender(vecId: string, payload: any, forget: boolean): void {
  try {
    const targetId = _ddbSenders[vecId];
    if (!targetId) return;
    if (forget) { try { delete _ddbSenders[vecId]; } catch (e) {} }
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, payload);
    }
  } catch (e) {}
}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('message', (msg: any) => {
      try {
        if (!msg || !msg.action) return;
        if (msg.action === 'ddbAck' || msg.action === 'ddbResult') {
          try { ddbReplyToSender(String(msg.vecId || ''), { action: msg.action, vecId: msg.vecId, layerId: msg.layerId || null, geojson: msg.geojson || null, error: msg.error || null }, msg.action === 'ddbResult'); } catch (e) {}
          return;
        }
        if (msg.action === 'gpkgAck' || msg.action === 'gpkgResult') {
          try { ddbReplyToSender(String(msg.vecId || ''), { action: msg.action, vecId: msg.vecId, layerId: msg.layerId || null, geojson: msg.geojson || null, error: msg.error || null, qml: msg.qml || null }, msg.action === 'gpkgResult'); } catch (e) {}
          return;
        }
        if (msg.action === 'requestBasemaps') {
          sendBasemapsToUI();
        } else if (msg.action === 'selectBasemap') {
          try {
            showBasemapByUrl(typeof msg.url === 'string' ? msg.url : null);
            // Re-sync UI after a short delay
            if (typeof setTimeout === 'function') {
              setTimeout(() => { sendBasemapsToUI(); }, 150);
            } else {
              sendBasemapsToUI();
            }
          } catch (e) { sendError('[selectBasemap] error:', e); }
        } else if (msg.action === 'openGoogleEarth') {
          try { openGoogleEarthInNewWindow(); } catch (e) { sendError('[openGoogleEarth] error:', e); }
        } else if (msg.action === 'requestBaseList') {
          try { requestBaseList(); } catch (e) { sendError('[requestBaseList] error:', e); }
        }
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('extensionMessage', (msg: any) => {
      try {
        const data = (msg && msg.data !== undefined) ? msg.data : msg;
        if (!data || !data.action) return;
        if (data.action === 'baseList') {
          applyBaseList(data.items);
        } else if (data.action === 'lang') {
          // Language override forwarded from the layer panel (inspector "lang:" line)
          try { postToUI({ action: 'lang', lang: data.lang || 'auto' }); } catch (e) {}
        } else if (data.action === 'ddbExec') {
          // DuckDB-Wasm query request from the layer panel. This widget's iframe
          // is long-lived (ui.show runs once), so the wasm instance stays warm —
          // unlike the panel iframe which is recreated on every ui.show.
          try {
            if (data.vecId && msg.sender) _ddbSenders[String(data.vecId)] = String(msg.sender);
            postToUI({
              action: 'ddbLoad', vecId: data.vecId, layerId: data.layerId || null,
              url: data.url, format: data.format || null, where: data.where || null,
              limit: data.limit || null, geom: data.geom || null, lon: data.lon || null, lat: data.lat || null,
              columns: data.columns || null, covering: data.covering || null, bounds: data.bounds || null,
              query: data.query || null, dataB64: data.dataB64 || null, zipName: data.zipName || null,
              zipId: data.zipId || null, zipUrl: data.zipUrl || null, zipPath: data.zipPath || null
            });
          } catch (e) {}
        } else if (data.action === 'gpkgExec') {
          // GeoPackage query request from the layer panel (same host pattern
          // as ddbExec — this iframe's sql.js instance and open DBs persist).
          try {
            if (data.vecId && msg.sender) _ddbSenders[String(data.vecId)] = String(msg.sender);
            postToUI({
              action: 'gpkgLoad', vecId: data.vecId, layerId: data.layerId || null,
              url: data.url, dataB64: data.dataB64 || null,
              zipId: data.zipId || null, zipUrl: data.zipUrl || null, zipPath: data.zipPath || null,
              table: data.table || null,
              where: data.where || null, limit: data.limit || null,
              columns: data.columns || null, bounds: data.bounds || null
            });
          } catch (e) {}
        } else if (data.action === 'requestBaseList') {
          // If asked by layer panel (unexpected direction), respond with current list
          _layerPanelId = msg.sender || _layerPanelId;
          if (_parsedBaseTiles.length) {
            try {
              if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function' && _layerPanelId) {
                reearth.extension.postMessage(_layerPanelId, { action: 'baseList', items: _parsedBaseTiles });
              }
            } catch (e) {}
          }
        } else if (data.action === 'selectBasemap') {
          // Basemap switch requested by another widget (e.g. ai-chat tool).
          // Accepts a URL or a basemap title.
          try {
            const ref = (typeof data.url === 'string') ? data.url : ((typeof data.name === 'string') ? data.name : '');
            let url = ref;
            if (ref) {
              const rl = ref.toLowerCase();
              const hit = _parsedBaseTiles.find((b: any) => String(b.title || '').toLowerCase() === rl)
                || _parsedBaseTiles.find((b: any) => String(b.title || '').toLowerCase().indexOf(rl) >= 0)
                || _parsedBaseTiles.find((b: any) => urlsEqual(b.url, ref) || urlsEqual(b.encodedUrl, ref));
              if (hit) url = hit.encodedUrl || hit.url;
            }
            showBasemapByUrl(url === '' ? '' : url);
            if (typeof setTimeout === 'function') {
              setTimeout(() => { sendBasemapsToUI(); }, 150);
            } else {
              sendBasemapsToUI();
            }
          } catch (e) { sendError('[selectBasemap/ext] error:', e); }
        }
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.show === 'function') {
    reearth.ui.show(html, { width: 300, visible: true, position: 'bottom-left' });
  }
} catch (e) {}


