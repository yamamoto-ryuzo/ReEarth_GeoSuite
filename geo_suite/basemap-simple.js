/*
  Basemap Simple (JS): Re:Earth のシーンから可能な限りベースマップURLを収集してリスト表示する最小ウィジェット。
  - TS版のロジックを手動移植した純JS版（Node/tsc不要）
*/

function pickUrl(obj) {
  if (!obj) return undefined;
  if (typeof obj === "string") return obj;
  var candidates = [
    obj.url,
    obj.uri,
    obj.urlTemplate,
    obj.templateUrl,
    obj.sourceUrl,
    obj.resource,
    obj.href,
    obj.endpoint,
    obj.serviceUrl,
  ];
  for (var i = 0; i < candidates.length; i++) {
    var u = candidates[i];
    if (typeof u === "string" && u) return u;
  }
}

function normalizeTiles(property, source) {
  if (source === void 0) source = "scene";
  if (!property) return [];
  var name = property.name;
  var items = [];

  var tilesAny = property.tiles;
  if (Array.isArray(tilesAny)) {
    for (var i = 0; i < tilesAny.length; i++) {
      var url = pickUrl(tilesAny[i]);
      if (url) items.push({ name: name, url: url, source: source });
    }
  } else if (tilesAny) {
    var url2 = pickUrl(tilesAny);
    if (url2) items.push({ name: name, url: url2, source: source });
  }

  var ip = property.imageryProvider;
  if (ip) {
    var ipUrl = pickUrl(ip);
    if (ipUrl) items.push({ name: name, url: ipUrl, source: source });
  }

  var tile = property.tile;
  if (tile && tile.url) items.push({ name: name, url: tile.url, source: source });

  var prov = property.options && property.options.provider;
  var provUrl = pickUrl(prov);
  if (provUrl) items.push({ name: name, url: provUrl, source: source });

  var src = property.source;
  var srcUrl = pickUrl(src);
  if (srcUrl) items.push({ name: name, url: srcUrl, source: source });
  var srcImagery = src && src.imagery ? pickUrl(src.imagery) : undefined;
  if (srcImagery) items.push({ name: name, url: srcImagery, source: source });
  var srcTile = src && src.tile ? pickUrl(src.tile) : undefined;
  if (srcTile) items.push({ name: name, url: srcTile, source: source });
  var srcProvider = src && src.provider ? pickUrl(src.provider) : undefined;
  if (srcProvider) items.push({ name: name, url: srcProvider, source: source });

  return items;
}

function collectDeepCandidates(obj, source) {
  var results = [];
  var stack = [{ value: obj, depth: 0 }];
  var maxDepth = 3;
  while (stack.length) {
    var cur = stack.pop();
    var value = cur.value, depth = cur.depth;
    if (!value || typeof value !== "object") continue;
    var url = pickUrl(value);
    if (url) results.push({ url: url, source: source });
    if (value.imageryProvider) {
      var ipUrl = pickUrl(value.imageryProvider);
      if (ipUrl) results.push({ url: ipUrl, source: source });
    }
    if (depth < maxDepth) {
      for (var k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) {
          stack.push({ value: value[k], depth: depth + 1 });
        }
      }
    }
  }
  return results;
}

function uniqByUrl(items) {
  var seen = Object.create(null);
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!seen[it.url]) {
      seen[it.url] = 1;
      out.push(it);
    }
  }
  return out;
}

function getAllTilesFromLayers() {
  var layersRoot = (typeof reearth !== "undefined" && reearth.layers && reearth.layers.layers) ? reearth.layers.layers : [];
  var out = [];
  var stack = layersRoot.slice();
  while (stack.length) {
    var l = stack.pop();
    if (l.layers && l.layers.length) stack.push.apply(stack, l.layers);
    var type = (l.type || "").toLowerCase();
    var name = l.title || (l.property && l.property.name);
    var prop = l.property;
    if (!prop) continue;
    if (["tiles", "tile", "raster", "imagery", "map", "webmap"].includes(type)) {
      var items = normalizeTiles(prop, "layer:" + type);
      for (var i = 0; i < items.length; i++) out.push(Object.assign({}, items[i], { name: name }));
    } else {
      var deep = collectDeepCandidates(prop, "layer:" + type);
      for (var j = 0; j < deep.length; j++) out.push(Object.assign({}, deep[j], { name: name }));
    }
  }
  return out;
}

function gatherBasemaps() {
  var sceneProp = (typeof reearth !== "undefined" && reearth.scene) ? reearth.scene.property : undefined;
  var vizProp = (typeof reearth !== "undefined" && reearth.visualizer) ? reearth.visualizer.property : undefined;
  var sceneItems = normalizeTiles(sceneProp, "scene");
  var vizItems = normalizeTiles(vizProp, "visualizer");
  var deepScene = collectDeepCandidates(sceneProp, "scene:deep");
  var layerItems = getAllTilesFromLayers();
  var items = uniqByUrl([].concat(sceneItems, vizItems, deepScene, layerItems));
  return {
    items: items,
    counts: {
      scene: sceneItems.length,
      visualizer: vizItems.length,
      sceneDeep: deepScene.length,
      layers: layerItems.length,
      total: items.length,
    },
  };
}

function renderAndWireUI() {
  var uiReady = false;
  var buffer = [];
  function safePost(msg) {
    if (!uiReady) buffer.push(msg);
    else reearth.ui.postMessage(msg);
  }

  reearth.ui.on("message", function (msg) {
    if (!msg) return;
    if (msg.type === "ready") {
      uiReady = true;
      if (buffer.length) {
        for (var i = 0; i < buffer.length; i++) reearth.ui.postMessage(buffer[i]);
        buffer.length = 0;
      }
      var initial = gatherBasemaps();
      safePost({ type: "basemaps", items: initial.items, counts: initial.counts });
    } else if (msg.type === "refresh") {
      var refreshed = gatherBasemaps();
      safePost({ type: "basemaps", items: refreshed.items, counts: refreshed.counts });
    }
  });

  reearth.on("message", function (msg) {
    if (msg && msg.type === "refresh") {
      var refreshed = gatherBasemaps();
      safePost({ type: "basemaps", items: refreshed.items, counts: refreshed.counts });
    }
  });

  var html = (
    "<style>" +
    "body{font-family:system-ui,sans-serif;margin:0;}" +
    ".wrap{padding:12px;}" +
    ".status{font-size:12px;color:#666;margin-bottom:8px;}" +
    "table{border-collapse:collapse;width:100%;}" +
    "th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px;}" +
    "th{background:#f5f5f5;text-align:left;}" +
    ".actions{margin-bottom:8px;}" +
    "button{font-size:12px;padding:4px 8px;}" +
    "</style>" +
    "<div class=\"wrap\">" +
    "<div class=\"actions\"><button id=\"refresh\">更新</button></div>" +
    "<div id=\"status\" class=\"status\">初期化中…</div>" +
    "<table><thead><tr><th>名前</th><th>URL</th><th>由来</th></tr></thead><tbody id=\"tbody\"></tbody></table>" +
    "</div>" +
    "<script>" +
    "const status=document.getElementById('status');" +
    "const tbody=document.getElementById('tbody');" +
    "const refreshBtn=document.getElementById('refresh');" +
    "function post(msg){parent.postMessage(msg,'*');}" +
    "function esc(s){return (s||'').toString().replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}" +
    "function render(items){tbody.innerHTML=items.map(i=>`<tr><td>${esc(i.name||'')}</td><td>${esc(i.url)}</td><td>${esc(i.source||'')}</td></tr>`).join('');}" +
    "window.addEventListener('message',(e)=>{const msg=e.data;if(!msg)return;if(msg.type==='basemaps'){const c=msg.counts||{};status.textContent=`scene:${c.scene||0} visualizer:${c.visualizer||0} sceneDeep:${c.sceneDeep||0} layers:${c.layers||0} total:${c.total||0}`;render(msg.items||[]);}});" +
    "refreshBtn.addEventListener('click',()=>post({type:'refresh'}));" +
    "post({type:'ready'});" +
    "setTimeout(()=>post({type:'ready'}),400);" +
    "setTimeout(()=>{if(status.textContent.includes('初期化中'))status.textContent='待機中（データ未受信）';},1500);" +
    "</script>"
  );

  reearth.ui.show(html);
  setTimeout(function () {
    var data = gatherBasemaps();
    reearth.ui.postMessage({ type: "basemaps", items: data.items, counts: data.counts });
  }, 250);
}

function basemapSimpleEntry(reearthInstance) {
  // reearth はグローバルに提供される想定だが、環境によっては引数経由のため受け取りのみ
  if (typeof reearth === "undefined" && reearthInstance) {
    // 参照をグローバルへ（Re:Earth 実行環境では通常不要）
    // eslint-disable-next-line no-global-assign
    reearth = reearthInstance;
  }
  renderAndWireUI();
}

// Re:Earth の QuickJS 環境では ES Modules の `export` が未サポートの場合があるため CommonJS を併用
if (typeof module !== "undefined" && module.exports) {
  module.exports = basemapSimpleEntry;
} else {
  // グローバルに公開（環境依存）
  this.basemapSimpleEntry = basemapSimpleEntry;
}
// Simplified: list all basemap tiles from scene.property.tiles with minimal UI and robust ready sync.
(function(){
  function pickUrl(obj){
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj !== "object") return "";
    const direct = obj.url || obj.uri || obj.urlTemplate || obj.sourceUrl || obj.resource || obj.href;
    if (typeof direct === "string") return direct;
    const tiles0 = Array.isArray(obj.tiles) ? obj.tiles[0] : undefined;
    if (typeof tiles0 === "string") return tiles0;
    const src = obj.source || obj.imagery || obj.tile || obj.options || obj.provider || obj.style || {};
    const nested = src.url || src.urlTemplate || src.uri || src.sourceUrl || src.resource || (Array.isArray(src.tiles) ? src.tiles[0] : undefined);
    if (typeof nested === "string") return nested;
    // Known Cesium providers
    const ip = obj.imageryProvider || src.imageryProvider || {};
    const ipu = ip.url || ip.resource || ip.uri;
    if (typeof ipu === "string") return ipu;
    return typeof nested === "string" ? nested : "";
  }

  function getSceneTiles(scene){
    try {
      const tiles = scene && scene.property ? scene.property.tiles : undefined;
      if (!tiles) return [];
      const arr = Array.isArray(tiles) ? tiles : [tiles];
      return arr.map((t, i) => {
        const url = pickUrl(t) || pickUrl((t && t.property) || {});
        const name = (t && t.name) || `scene-tile-${i+1}`;
        return { name, url };
      }).filter(t => t.url);
    } catch(_){ return []; }
  }

  function getVisualizerTiles(){
    try {
      const vis = (reearth && reearth.visualizer) ? reearth.visualizer : null;
      const prop = vis && vis.property ? vis.property : null;
      const tiles = prop && prop.tiles ? prop.tiles : [];
      const arr = Array.isArray(tiles) ? tiles : [];
      return arr.map((t, i) => ({ name: t && t.name ? t.name : `visualizer-tile-${i+1}`, url: pickUrl(t) || pickUrl((t && t.property) || {}) }))
               .filter(t => t.url);
    } catch(_){ return []; }
  }

  function collectDeepCandidates(obj, maxDepth){
    const out = [];
    const seen = new Set();
    function walk(o, d){
      if (!o || typeof o !== 'object' || d <= 0) return;
      if (seen.has(o)) return; seen.add(o);
      const u = pickUrl(o);
      if (typeof u === 'string' && u) out.push({ name: o.name || 'base', url: u });
      try { Object.values(o).forEach(v => walk(v, d-1)); } catch(_){}
    }
    walk(obj, maxDepth||3);
    return out;
  }

  function uniqByUrl(items){
    const seen = new Set();
    const out = [];
    for (const it of items){
      const u = (it && it.url) || '';
      if (!u || seen.has(u)) continue;
      seen.add(u); out.push(it);
    }
    return out;
  }

  function getAllSceneTilesFromLayers(){
    const results = [];
    try {
      const layersApi = (reearth && reearth.layers && Array.isArray(reearth.layers.layers)) ? reearth.layers.layers : [];
      function walk(layer){
        if (!layer) return;
        try {
          const type = layer.type || layer.layerType || '';
          const tiles = layer.tiles || (layer.data && layer.data.tiles) || (layer.property && layer.property.tiles);
          if (type === 'tiles' && tiles) {
            const arr = Array.isArray(tiles) ? tiles : [tiles];
            arr.forEach((tile, index) => {
              const url = pickUrl(tile) || pickUrl(tile && tile.property || {});
              if (typeof url === 'string' && url) {
                results.push({ name: layer.name || layer.id || ('layer-tile-'+(index+1)), url });
              }
            });
          }
        } catch(_) {}
        const children = layer.children || layer.layers || [];
        if (Array.isArray(children)) children.forEach(walk);
      }
      layersApi.forEach(walk);
    } catch(_) {}
    return results;
  }

  const html = `
        <style>
          body{font-family:sans-serif;margin:0;padding:12px;}
          table{width:100%;border-collapse:collapse}
          th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
          th{background:#f5f5f5}
          .break-all{word-break:break-all}
          .empty{color:#666}
          .bar{margin-bottom:8px;display:flex;gap:12px;align-items:center}
          .banner{background:#eef;color:#223;padding:6px 8px;border:1px solid #99c;border-radius:4px;margin-bottom:8px}
        </style>
        <div>
          <div class="bar">
            <button id="refresh">更新</button>
          </div>
          <div id="status" class="banner">status: init</div>
          <div style="font-weight:bold;margin-bottom:6px;">ベースタイル一覧</div>
          <div id="content"><div class="empty">読み込み中...</div></div>
        </div>
        <script>
          (function(){
            // Send ready twice to mitigate races
            try { setTimeout(function(){ (window.parent||window).postMessage({ type: 'ready' }, '*'); }, 0); } catch(_){}
            try { setTimeout(function(){ (window.parent||window).postMessage({ type: 'ready' }, '*'); }, 500); } catch(_){}

            var received = false;

            function setStatus(text){
              var s = document.getElementById('status');
              if (s) s.textContent = text;
            }
            function render(items){
              var cont = document.getElementById('content');
              if (!Array.isArray(items) || !items.length) { cont.innerHTML = '<div class="empty">なし</div>'; return; }
              var rows = items.map(function(it){
                return '<tr><td>'+ (it && it.name ? it.name : '') + '</td><td class="break-all">'+ (it && it.url ? it.url : '') +'</td></tr>';
              }).join('');
              cont.innerHTML = '<table><thead><tr><th>名称</th><th>URL</th></tr></thead><tbody>'+rows+'</tbody></table>';
            }

            // Initial fallback: show empty list and waiting status
            setStatus('status: waiting for basemaps...');
            render([]);

            window.addEventListener('message', function(ev){
              try {
                var data = ev.data || {};
                if (data.type === 'basemaps') {
                  received = true;
                  setStatus('scene:'+ (data.sceneCount||0) + ' visualizer:'+ (data.visualizerCount||0) + ' layers:'+ (data.layersCount||0) + ' total:'+ (Array.isArray(data.items)?data.items.length:0));
                  render(Array.isArray(data.items) ? data.items : []);
                }
              } catch(_){}
            });

            var btn = document.getElementById('refresh');
            if (btn) { btn.addEventListener('click', function(){ try { (window.parent||window).postMessage({ type: 'refresh' }, '*'); } catch(_){} }); }

            // Timeout fallback: if nothing received after 2s, keep empty with a note
            try {
              setTimeout(function(){
                try { if (!received) setStatus('status: no basemaps received (showing empty)'); } catch(_){}
              }, 2000);
            } catch(_){}
          })();
        </script>
      `;

  let uiReady = false;
  const buffer = [];
  function safePost(msg){ try { if (uiReady) reearth.ui.postMessage(msg); else buffer.push(msg); } catch(_){} }

  function pushBasemaps(){
    try {
      const scene = reearth.scene;
      const sceneTiles = getSceneTiles(scene);
      const knownFromProp = collectDeepCandidates(scene && scene.property, 3);
      const visTiles = getVisualizerTiles();
      const layerTiles = getAllSceneTilesFromLayers();
      let combined = [].concat(sceneTiles, knownFromProp, visTiles, layerTiles);
      combined = uniqByUrl(combined);
      safePost({ type: 'basemaps', items: combined, sceneCount: sceneTiles.length + knownFromProp.length, visualizerCount: visTiles.length, layersCount: layerTiles.length });
    } catch(e){ safePost({ type: 'basemaps', items: [] }); }
  }

  try {
    const onmsg = (msg) => {
      if (!msg) return;
      if (msg.type === 'ready' || msg === 'ready') {
        if (!uiReady) {
          uiReady = true;
          if (buffer.length) { buffer.splice(0).forEach(m => { try{ reearth.ui.postMessage(m); }catch(_){}}); }
          pushBasemaps();
        }
      } else if (msg.type === 'refresh') {
        pushBasemaps();
      }
    };
    reearth.ui.on('message', onmsg);
    try { if (typeof reearth.on === 'function') reearth.on('message', onmsg); } catch(_){}
    try { reearth.ui.onmessage = onmsg; } catch(_){}
  } catch(_){}

  try { reearth.ui.show(html); } catch(_){}
  // Nudge: attempt a re-push shortly after show to overcome races
  try { setTimeout(function(){ try { pushBasemaps(); } catch(_){} }, 200); } catch(_){}
  try {
    setTimeout(function(){
      if (!uiReady) {
        uiReady = true;
        if (buffer.length) { buffer.splice(0).forEach(m => { try{ reearth.ui.postMessage(m); }catch(_){}}); }
        pushBasemaps();
      }
    }, 1500);
  } catch(_){}
  pushBasemaps();
})();
