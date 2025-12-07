// Lists all layers and basemap tiles with name, type, and URL

function collectLayers(layer, out) {
  if (!layer) return;
  out.push(layer);
  const children = layer.children || layer.layers || [];
  for (const c of children) collectLayers(c, out);
}
function getLayerRoots(scene){
  try {
    if (!scene) return [];
    if (Array.isArray(scene.layers)) return scene.layers;
    if (scene.root && Array.isArray(scene.root.children)) return scene.root.children;
  } catch(_) {}
  return [];
}

function flattenAllLayers(scene){
  var all = [];
  try {
    var flat = (reearth.layers && Array.isArray(reearth.layers.layers)) ? reearth.layers.layers : [];
    if (flat && flat.length) {
      for (var i=0;i<flat.length;i++) collectLayers(flat[i], all);
      return all;
    }
  } catch(_) {}
  var roots = getLayerRoots(scene);
  for (var j=0;j<roots.length;j++) collectLayers(roots[j], all);
  return all;
}

function getBasemapsFromVisualizer(){
  // Prefer viewer-level tiles if available (safe guarded), otherwise fall back to visualizer.property.tiles
  var vis = (reearth && reearth.visualizer) ? reearth.visualizer : null;
  var viewerProp = {};
  try {
    if (typeof (reearth && reearth.viewer && reearth.viewer.getViewerProperty) === 'function') {
      viewerProp = reearth.viewer.getViewerProperty() || {};
    } else if (reearth && reearth.viewer && reearth.viewer.property) {
      viewerProp = reearth.viewer.property || {};
    }
  } catch (_) { viewerProp = {}; }

  var tiles = (viewerProp && viewerProp.tiles) ? viewerProp.tiles : (vis && vis.property && vis.property.tiles ? vis.property.tiles : []);
  // Debug: show what tiles we detected (can be removed later)
  try { if (typeof console !== 'undefined' && console.log) console.log('getBasemapsFromVisualizer - tiles:', tiles); } catch(_) {}

  var arr = [];
  if (Array.isArray(tiles)) {
    for (var i=0;i<tiles.length;i++) {
      var t = tiles[i] || {};
      var url = pickUrl(t) || pickUrl(t.property || {}) || '';
      arr.push({ name: t.name || ('tile-'+(i+1)), url: url, type: detailType(t), zoom: pickZoom(t), opacity: pickOpacity(t) });
    }
  }
  return arr;
}

function pickUrl(obj) {
  if (!obj || typeof obj !== "object") return "";
  const direct = obj.url || obj.uri || obj.urlTemplate;
  if (typeof direct === "string") return direct;
  const tiles0 = Array.isArray(obj.tiles) ? obj.tiles[0] : undefined;
  if (typeof tiles0 === "string") return tiles0;
  const src = obj.source || obj.imagery || obj.tile || {};
  const nested = src.url || src.urlTemplate || (Array.isArray(src.tiles) ? src.tiles[0] : undefined);
  return typeof nested === "string" ? nested : "";
}

function isIonUrl(url){
  try { return typeof url === 'string' && /api\.cesium\.com/i.test(url); } catch(_) { return false; }
}

function layerInfo(layer) {
  const type = layer.type || layer.layerType || "";
  const data = layer.data || layer.tile || layer.property || {};
  const url = pickUrl(data);
  const name = layer.title || layer.name || layer.id || "";
  return { name, type, url };
}

function render(list, basemaps) {
  // Prepare rows showing only layer names (with tooltip for full name)
  const truncate = function(s, n){ if (!s) return ""; return s.length > n ? s.slice(0, n-1) + '…' : s; };
  const rows = list.map((info) => {
    const nameFull = (info && (info.name || info.title || info.id)) || "";
    const nameShort = truncate(nameFull, 60);
    return `<tr><td class="col-name" title="${escapeHtml(nameFull)}">${escapeHtml(nameShort)}</td></tr>`;
  });

  const baseRows = (basemaps || []).map((b, i) => {
    const name = b.name || `Base ${i + 1}`;
    const type = b.type || "";
    const url = b.url || "";
    return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(type)}</td><td class="break-all">${escapeHtml(url)}</td></tr>`;
  });

  const html = `
  <style>
    .container { padding: 12px; font-family: sans-serif; }
    .banner { background:#eef; color:#223; padding:6px 8px; border:1px solid #99c; border-radius:4px; margin-bottom:8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
    .break-all { word-break: break-all; }
    .empty { padding: 8px 0; color: #666; }
    .actions { display:flex; gap:8px; }
    /* compact truncation styles */
    .col-name { max-width: 240px; }
    .col-type { max-width: 120px; }
    .col-url { max-width: 420px; }
    td.col-name, td.col-type, td.col-url { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  </style>
  <div class="container">
    <div class="banner">Widget is active — UI heartbeat <span id="clickCount">0</span></div>
    <div class="actions" style="margin-bottom:12px;">
      <button id="refresh">更新</button>
      <button id="inspect">構造を表示</button>
    </div>
    <div style="font-weight:bold;margin-bottom:6px;">レイヤー</div>
    ${rows.length === 0
      ? `<div class="empty">ない</div>`
      : `<table>
           <thead><tr><th class="col-name">レイヤー名</th></tr></thead>
           <tbody>${rows.join('')}</tbody>
         </table>`}

    <div style="font-weight:bold;margin-top:16px;margin-bottom:6px;">ベースタイル</div>
    ${baseRows.length === 0
      ? `<div class="empty">ない</div>`
      : `<table>
           <thead><tr><th>名称</th><th>タイプ</th><th>URL</th></tr></thead>
           <tbody>${baseRows.join("")}</tbody>
         </table>`}
  </div>`;

  const withScript = html + `
    <script>
    (function(){
      // Notify WASM side that iframe UI is ready
      try { window.parent.postMessage({ type: 'ready' }, '*'); } catch(_) {}
      const btn = document.getElementById('refresh');
      if(btn){
        btn.addEventListener('click', function(){
          try { const cc = document.getElementById('clickCount'); if (cc) cc.textContent = String(Number(cc.textContent||'0')+1); } catch(e) {}
          try { window.parent.postMessage({ type: 'refresh' }, '*'); } catch(e) {}
        });
      }
      const inspect = document.getElementById('inspect');
      if(inspect){
        inspect.addEventListener('click', function(){
          try { const cc = document.getElementById('clickCount'); if (cc) cc.textContent = String(Number(cc.textContent||'0')+1); } catch(e) {}
          // Show waiting box immediately
          try {
            let box = document.getElementById('inspect-result');
            if (!box) {
              box = document.createElement('div');
              box.id = 'inspect-result';
              box.className = 'mt-8';
              box.innerHTML = '<div style="font-weight:bold;margin-top:12px;margin-bottom:6px;">シーン構造サマリ</div><pre id="inspect-pre" style="white-space:pre-wrap;word-break:break-word;background:#fff;color:#222;padding:8px;border:1px solid #ddd;border-radius:4px">waiting...</pre>';
              document.querySelector('.container').appendChild(box);
            } else {
              const pre = document.getElementById('inspect-pre');
              if (pre) pre.textContent = 'waiting...';
            }
          } catch(_) {}
          // Send inspect request
          try { window.parent.postMessage({ type: 'inspect' }, '*'); } catch(e) {}
          // Fallback timeout message if no response in 1500ms
          try {
            setTimeout(function(){
              const pre = document.getElementById('inspect-pre');
              if (pre && pre.textContent === 'waiting...') {
                pre.textContent = 'timeout: no inspect-result message received';
              }
            }, 1500);
          } catch(_) {}
        });
      }
      window.addEventListener('message', function(ev){
        try {
          const data = ev.data || {};
          if (data && data.type === 'inspect-result') {
            let box = document.getElementById('inspect-result');
            if (!box) {
              box = document.createElement('div');
              box.id = 'inspect-result';
              box.className = 'mt-8';
              box.innerHTML = '<div style="font-weight:bold;margin-top:12px;margin-bottom:6px;">シーン構造サマリ</div><pre id="inspect-pre" style="white-space:pre-wrap;word-break:break-word;background:#fff;color:#222;padding:8px;border:1px solid #ddd;border-radius:4px"></pre>';
              document.querySelector('.container').appendChild(box);
            }
            const pre = document.getElementById('inspect-pre') || box.querySelector('pre');
            pre.textContent = JSON.stringify(data.summary || data.error || {}, null, 2);
          }
        } catch(_){}
      });
    })();
    </script>
  `;
    // Buffer messages until iframe signals 'ready'
    let uiReady = false;
    let messageBuffer = [];
    function safePost(msg){
      try {
        if (uiReady) {
          reearth.ui.postMessage(msg);
        } else {
          messageBuffer.push(msg);
        }
      } catch(_) {}
    }
  try { reearth.ui.show(withScript); } catch(_) {}
}

function escapeHtml(str) {
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function guessType(obj){
  if (!obj || typeof obj !== 'object') return '';
  return (obj.type || obj.format || obj.kind || '').toString();
}

function collectBaseMaps(sceneProp) {
  const basemaps = [];
  try {
    if (!sceneProp || typeof sceneProp !== "object") return basemaps;
    for (const [key, val] of Object.entries(sceneProp)) {
      const url = pickUrl(val);
      if (typeof url === 'string' && url) basemaps.push({ name: key, url, type: guessType(val) });
    }
    const known = [sceneProp.baseMap, sceneProp.tiles, sceneProp.imagery];
    for (const k of known) {
      const url = pickUrl(k);
      if (typeof url === 'string' && url) basemaps.push({ name: k && k.name ? k.name : "base", url, type: guessType(k) });
    }
    // Recursive scan up to depth 3
    const seen = new Set();
    function walk(obj, depth) {
      if (!obj || typeof obj !== 'object' || depth <= 0) return;
      if (seen.has(obj)) return;
      seen.add(obj);
      const url = pickUrl(obj);
      if (typeof url === 'string' && url) {
        basemaps.push({ name: obj.name || 'base', url, type: guessType(obj) });
      }
      for (const v of Object.values(obj)) {
        walk(v, depth - 1);
      }
    }
    walk(sceneProp, 3);
  } catch (_) {}
  return basemaps;
}

function getSceneTilesSync() {
  try {
    var scene = (reearth && reearth.scene) ? reearth.scene : null;
    var prop = scene && scene.property ? scene.property : null;
    var tiles = prop && prop.tiles ? prop.tiles : null;
    if (!tiles) return [];
    if (Array.isArray(tiles)) return tiles;
    if (typeof tiles === 'string') return [ { name: 'scene-tile-1', url: tiles } ];
    if (typeof tiles === 'object') {
      var u = tiles.url || tiles.urlTemplate || tiles.uri;
      if (typeof u === 'string' && u) return [ { name: tiles.name || 'scene-tile-1', url: u } ];
    }
  } catch (_) {}
  return [];
}

function detailType(obj){
  const t = guessType(obj);
  const fmt = (obj && (obj.format || obj.style || obj.scheme)) || '';
  return [t, fmt].filter(Boolean).join(':');
}

function pickZoom(obj){
  if (!obj || typeof obj !== 'object') return undefined;
  const z = obj.zoomLevel ?? obj.zoom ?? obj.maxZoom ?? obj.minZoom;
  return typeof z === 'number' ? z : undefined;
}

function pickOpacity(obj){
  if (!obj || typeof obj !== 'object') return undefined;
  const o = obj.opacity ?? obj.alpha ?? obj.transparency;
  return typeof o === 'number' ? o : undefined;
}

async function refresh() {
  const scene = reearth.scene;
  var all = flattenAllLayers(scene);
  const infos = all.map(layerInfo);
  const basemaps = collectBaseMaps((scene && scene.property) || {});
  // enrich basemaps with zoom/opacity if present
  const enrichedBase = basemaps.map(function(b){
    const zm = pickZoom(b);
    const op = pickOpacity(b);
    return Object.assign({}, b, { zoom: zm, opacity: op, type: detailType(b) });
  });
  // merge visualizer tiles as basemap candidates if not detected
  var visualTiles = getBasemapsFromVisualizer();
  var finalBase = enrichedBase;
  if (!finalBase.length && visualTiles.length) finalBase = visualTiles;
  // Prefer non-Ion URLs to avoid 401 noise
  var nonIon = finalBase.filter(function(b){ return !isIonUrl(b && b.url); });
  if (nonIon.length) finalBase = nonIon;
  render(infos, finalBase);
  // Also push inspect summary proactively so UI can show without a button
  try {
    const prop = (scene && scene.property) || {};
    const excerpt = {};
    const keys = Object.keys(prop).slice(0, 100);
    for (const k of keys) excerpt[k] = prop[k];
    const basemapCandidatesRaw = collectBaseMaps(prop);
    const basemapCandidates = basemapCandidatesRaw.map(b => ({
      name: b.name,
      url: b.url,
      type: detailType(b),
      zoom: pickZoom(b),
      opacity: pickOpacity(b)
    }));
    var tiles = getSceneTilesSync();
    if (!tiles.length && visualTiles.length) {
      // fall back to visualizer-derived tiles as candidates
      tiles = visualTiles;
    }
    const tileSummary = tiles.map(t => ({
      id: t.id || t.name || '',
      url: pickUrl(t),
      type: detailType(t),
      zoom: pickZoom(t),
      opacity: pickOpacity(t)
    }));
    const summary = {
      sceneId: (scene && scene.id) || '',
      sceneName: (scene && scene.name) || '',
      sceneKeys: Object.keys(scene || {}),
      hasLayers: Array.isArray(scene && scene.layers),
      layerCount: Array.isArray(scene && scene.layers) ? scene.layers.length : (((scene && scene.root && scene.root.children) ? scene.root.children.length : 0)),
      propertyKeys: Object.keys(prop),
      propertyExcerpt: excerpt,
      basemapCandidates: basemapCandidates,
      tiles: tileSummary
    };
    safePost({ type: 'inspect-result', summary });
  } catch(_) {}
}

try {
  if (reearth.ui && typeof reearth.ui.on === "function") {
    const handler = async (msg) => {
      if (msg && msg.type === "refresh") refresh();
      else if (msg && msg.type === "inspect") {
        try {
          const scene = reearth.scene || {};
          const prop = scene.property || {};
          const excerpt = {};
          const keys = Object.keys(prop).slice(0, 100);
          for (const k of keys) excerpt[k] = prop[k];
          const basemapCandidatesRaw = collectBaseMaps(prop);
          const basemapCandidates = basemapCandidatesRaw.map(b => ({
            name: b.name,
            url: b.url,
            type: detailType(b),
            zoom: pickZoom(b),
            opacity: pickOpacity(b)
          }));
          var tiles = getSceneTilesSync();
          if (!tiles.length) {
            tiles = getBasemapsFromVisualizer();
          }
          const tileSummary = tiles.map(t => ({
            id: t.id || t.name || '',
            url: pickUrl(t),
            type: detailType(t),
            zoom: pickZoom(t),
            opacity: pickOpacity(t)
          }));
          const summary = {
            sceneId: (scene && scene.id) || '',
            sceneName: (scene && scene.name) || '',
            sceneKeys: Object.keys(scene),
            hasLayers: Array.isArray(scene.layers),
            layerCount: Array.isArray(scene.layers) ? scene.layers.length : (((scene && scene.root && scene.root.children) ? scene.root.children.length : 0)),
            propertyKeys: Object.keys(prop),
            propertyExcerpt: excerpt,
            basemapCandidates: basemapCandidates,
            tiles: tileSummary
          };
          safePost({ type: 'inspect-result', summary });
        } catch (e) {
          safePost({ type: 'inspect-result', error: String(e) });
        }
      }
    };
    reearth.ui.on("message", handler);
    // Mark UI ready and flush buffer on 'ready'
    reearth.ui.on("message", msg => {
      if (msg && (msg.type === 'ready' || msg === 'ready')) {
        uiReady = true;
        if (messageBuffer.length) {
          const toSend = messageBuffer.slice();
          messageBuffer = [];
          toSend.forEach(m => { try { reearth.ui.postMessage(m); } catch(_) {} });
        }
      }
    });
    // Fallback for environments using onmessage instead of event emitter API
    try { reearth.ui.onmessage = handler; } catch(_) {}
  }
} catch (_) {}

refresh();
// Disable auto-refresh to avoid message port timing issues
