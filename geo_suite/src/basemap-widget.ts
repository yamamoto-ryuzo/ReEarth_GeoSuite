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

interface BasemapInfo {
  id: string;
  url: string;
  title: string;
  attribution: string;
  visible: boolean;
}

let _lastBasemapsHash = '';
let _parsedBaseTiles: any[] = [];
let _lastSelectedBasemapUrl = '';
let _layerPanelId: string | null = null;

function getBasemapLayers(): BasemapInfo[] {
  const result: BasemapInfo[] = [];
  try {
    const all = (reearth && reearth.layers && reearth.layers.layers) ? reearth.layers.layers : [];
    const arr = normalizeLayers(all);
    arr.forEach((l: any) => {
      if (!l || !l.data || !l.data.isBasemap) return;
      result.push({
        id: l.id || '',
        url: l.data.url || '',
        title: l.title || '',
        attribution: (l.data && l.data.attribution) || '',
        visible: !!l.visible
      });
    });
  } catch (e) {
    sendError('[getBasemapLayers] error:', e);
  }
  return result;
}

function sendBasemapsToUI(): void {
  try {
    const basemapLayers = getBasemapLayers();
    const items = _parsedBaseTiles.map((b: any) => ({
      url: b.encodedUrl || encodeNonAscii(b.url),
      title: b.title,
      attribution: b.attribution
    }));
    const hash = JSON.stringify(items) + JSON.stringify(basemapLayers.map((b) => b.visible));
    if (hash === _lastBasemapsHash) return;
    _lastBasemapsHash = hash;
    const visible = basemapLayers.find((b) => b.visible);
    let selectedUrl = visible ? visible.url : _lastSelectedBasemapUrl;
    if (!selectedUrl && items[0]) selectedUrl = items[0].url;
    postToUI({ action: 'basemaps', items: items, selectedUrl: selectedUrl });
  } catch (e) {
    sendError('[sendBasemapsToUI] error:', e);
  }
}

function showBasemapByUrl(url: string | null): void {
  if (url === null || url === undefined) return;
  _lastSelectedBasemapUrl = url;
  try {
    const all = (reearth && reearth.layers && reearth.layers.layers) ? reearth.layers.layers : [];
    const arr = normalizeLayers(all);
    let targetId: string | null = null;
    arr.forEach((l: any) => {
      if (!l || !l.data || !l.data.isBasemap || !l.id) return;
      if (urlsEqual(l.data.url, url)) targetId = l.id;
    });
    arr.forEach((l: any) => {
      if (!l || !l.data || !l.data.isBasemap || !l.id) return;
      const isMatch = (url !== '' && l.id === targetId);
      try {
        if (isMatch) {
          if (typeof reearth.layers.show === 'function') reearth.layers.show(l.id);
          else if (typeof reearth.layers.override === 'function') reearth.layers.override(l.id, { visible: true });
        } else {
          if (typeof reearth.layers.hide === 'function') reearth.layers.hide(l.id);
          else if (typeof reearth.layers.override === 'function') reearth.layers.override(l.id, { visible: false });
        }
      } catch (e) {}
    });
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

function addBasemapLayer(url: string, title: string, attribution: string, minLevel?: number | null, maxLevel?: number | null): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const encodedUrl = encodeNonAscii(url);
    const all = (reearth && reearth.layers && reearth.layers.layers) ? reearth.layers.layers : [];
    const arr = normalizeLayers(all);
    const dup = arr.find((l: any) => l && l.data && l.data.isBasemap && urlsEqual(l.data.url, encodedUrl));
    if (dup) return dup.id || null;

    const raster: any = {};
    if (typeof minLevel === 'number' && !isNaN(minLevel)) raster.minimumLevel = minLevel;
    let maxL = (typeof maxLevel === 'number' && !isNaN(maxLevel)) ? maxLevel : null;
    if (maxL === null) maxL = defaultMaxLevelForUrl(encodedUrl);
    if (typeof maxL === 'number' && !isNaN(maxL)) raster.maximumLevel = maxL;

    const layer: any = {
      type: 'simple',
      title: title || `Basemap: ${url}`,
      visible: true,
      data: { type: 'tiles', url: encodedUrl, isBasemap: true, attribution: attribution || '' },
      tiles: { isBasemap: true }
    };
    if (Object.keys(raster).length > 0) layer.raster = raster;

    const newId = reearth.layers.add(layer);
    return newId || null;
  } catch (e) {
    sendError('[addBasemapLayer] error:', e);
    return null;
  }
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

    _parsedBaseTiles.forEach((b: any) => {
      addBasemapLayer(b.url, b.title, b.attribution, b.minLevel, b.maxLevel);
    });

    if (!_lastSelectedBasemapUrl && _parsedBaseTiles[0]) {
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
    .basemap-wrap { background-color: rgba(255, 255, 255, 0.3); border-radius: 8px; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); backdrop-filter: blur(4px); width: 100%; box-sizing: border-box; }
    .basemap-select { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 6px; font-size: 0.9em; background: #fff; box-sizing: border-box; }
    .basemap-attribution { font-size: 0.7em; color: #333; margin-top: 4px; min-height: 1.2em; overflow-wrap: break-word; word-break: break-word; }
  </style>
  <div class="basemap-wrap">
    <select id="basemap-select" class="basemap-select">
      <option value="">(なし)</option>
    </select>
    <div id="basemap-attribution" class="basemap-attribution"></div>
  </div>
  <script>
    (function(){
      const select = document.getElementById('basemap-select');
      const attrEl = document.getElementById('basemap-attribution');

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
        noneOpt.textContent = '(なし)';
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
      }

      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data;
          if (!msg || !msg.action) return;
          if (msg.action === 'basemaps') {
            renderOptions(msg.items, msg.selectedUrl);
          }
        } catch(e) {}
      });

      if (window.parent) window.parent.postMessage({ action: 'requestBasemaps' }, '*');
    })();
  </script>
`;

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('message', (msg: any) => {
      try {
        if (!msg || !msg.action) return;
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
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// Poll for basemap layer changes so the selector stays in sync
(function startPolling() {
  const poll = function() {
    try { sendBasemapsToUI(); } catch (e) {}
  };
  try {
    if (typeof setInterval === 'function') {
      setInterval(poll, 1000);
    } else if (typeof setTimeout === 'function') {
      (function loop() { poll(); setTimeout(loop, 1000); })();
    } else {
      poll();
    }
  } catch (e) {}
})();

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.show === 'function') {
    reearth.ui.show(html, { extended: true });
  }
} catch (e) {}

try {
  if (reearth && reearth.ui && typeof reearth.ui.resize === 'function') {
    reearth.ui.resize(300, undefined, false);
  }
} catch (e) {}

try {
  requestBaseList();
  if (typeof setTimeout === 'function') {
    setTimeout(() => { requestBaseList(); }, 500);
    setTimeout(() => { requestBaseList(); }, 1500);
  }
} catch (e) {}
