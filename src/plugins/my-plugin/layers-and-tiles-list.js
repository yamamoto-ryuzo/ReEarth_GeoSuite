// Lists all layers and basemap tiles with name, type, and URL

function collectLayers(layer, out) {
  if (!layer) return;
  out.push(layer);
  const children = layer.children || layer.layers || [];
  for (const c of children) collectLayers(c, out);
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

function layerInfo(layer) {
  const type = layer.type || layer.layerType || "";
  const data = layer.data || layer.tile || layer.property || {};
  const url = pickUrl(data);
  const name = layer.title || layer.name || layer.id || "";
  return { name, type, url };
}

function render(list, basemaps) {
  const rows = list.map((info) => {
    const name = info.name || "";
    const type = info.type || "";
    const url = info.url || "";
    return `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(type)}</td><td class="break-all">${escapeHtml(url)}</td></tr>`;
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
           <thead><tr><th>レイヤー名</th><th>タイプ</th><th>URL</th></tr></thead>
           <tbody>${rows.join("")}</tbody>
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
  reearth.ui.show(withScript);
  reearth.ui.postMessage({ type: "ready" });
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

function refresh() {
  const scene = reearth.scene;
  const all = [];
  try {
    // Prefer flattened API
    const flatLayers = (reearth.layers && Array.isArray(reearth.layers.layers)) ? reearth.layers.layers : [];
    if (flatLayers.length > 0) {
      for (const l of flatLayers) collectLayers(l, all);
    } else {
      const roots = (scene && (scene.layers || scene.root?.children)) || [];
      if (Array.isArray(roots)) {
        for (const r of roots) collectLayers(r, all);
      } else if (roots) {
        collectLayers(roots, all);
      }
    }
  } catch (e) {
    return render([], []);
  }
  const infos = all.map(layerInfo);
  const basemaps = collectBaseMaps(scene?.property);
  render(infos, basemaps);
  // Also push inspect summary proactively so UI can show without a button
  try {
    const prop = scene?.property || {};
    const excerpt = {};
    const keys = Object.keys(prop).slice(0, 100);
    for (const k of keys) excerpt[k] = prop[k];
    const basemapCandidates = collectBaseMaps(prop);
    const summary = {
      sceneKeys: Object.keys(scene||{}),
      hasLayers: Array.isArray(scene?.layers),
      layerCount: Array.isArray(scene?.layers) ? scene.layers.length : (scene?.root?.children?.length || 0),
      propertyKeys: Object.keys(prop),
      propertyExcerpt: excerpt,
      basemapCandidates
    };
    reearth.ui.postMessage({ type: 'inspect-result', summary });
  } catch(_) {}
}

try {
  if (reearth.ui && typeof reearth.ui.on === "function") {
    const handler = (msg) => {
      if (msg && msg.type === "refresh") refresh();
      else if (msg && msg.type === "inspect") {
        try {
          const scene = reearth.scene || {};
          const prop = scene.property || {};
          const excerpt = {};
          const keys = Object.keys(prop).slice(0, 100);
          for (const k of keys) excerpt[k] = prop[k];
          const basemapCandidates = collectBaseMaps(prop);
          const summary = {
            sceneKeys: Object.keys(scene),
            hasLayers: Array.isArray(scene.layers),
            layerCount: Array.isArray(scene.layers) ? scene.layers.length : (scene.root?.children?.length || 0),
            propertyKeys: Object.keys(prop),
            propertyExcerpt: excerpt,
            basemapCandidates
          };
          reearth.ui.postMessage({ type: 'inspect-result', summary });
        } catch (e) {
          reearth.ui.postMessage({ type: 'inspect-result', error: String(e) });
        }
      }
    };
    reearth.ui.on("message", handler);
    // Fallback for environments using onmessage instead of event emitter API
    try { reearth.ui.onmessage = handler; } catch(_) {}
  }
} catch (_) {}

refresh();
// Optional auto-refresh every 5 seconds to keep UI in sync
try { setInterval(refresh, 5000); } catch(_) {}
