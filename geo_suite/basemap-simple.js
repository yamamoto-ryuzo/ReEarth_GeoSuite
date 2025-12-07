// Removed: compiled artifact deleted from repository
// This file was intentionally left blank and will be removed.

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
      // File removed: compiled artifact
      // This file no longer contains the plugin implementation.
      // If you need the original code, restore from Git history or the TypeScript source `basemap-simple.ts`.
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
