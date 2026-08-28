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

interface BasemapInfo {
  id: string;
  url: string;
  title: string;
  attribution: string;
  visible: boolean;
}

let _lastBasemapsHash = '';

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
    const basemaps = getBasemapLayers();
    const hash = JSON.stringify(basemaps);
    if (hash === _lastBasemapsHash) return;
    _lastBasemapsHash = hash;
    const visible = basemaps.find((b) => b.visible);
    const selectedUrl = visible ? visible.url : (basemaps[0] ? basemaps[0].url : '');
    postToUI({ action: 'basemaps', items: basemaps, selectedUrl: selectedUrl });
  } catch (e) {
    sendError('[sendBasemapsToUI] error:', e);
  }
}

function showBasemapByUrl(url: string | null): void {
  if (!url) return;
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
      const isMatch = (l.id === targetId);
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

export const html: string = `
  <style>
    html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .basemap-wrap { background: rgba(255,255,255,0.85); border-radius: 8px; padding: 8px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); backdrop-filter: blur(4px); width: 240px; box-sizing: border-box; }
    .basemap-select { width: 100%; border: 1px solid #ccc; border-radius: 4px; padding: 6px; font-size: 0.9em; background: #fff; }
    .basemap-attribution { font-size: 0.7em; color: #333; margin-top: 4px; min-height: 1.2em; overflow-wrap: break-word; word-break: break-word; }
  </style>
  <div class="basemap-wrap">
    <select id="basemap-select" class="basemap-select">
      <option value="">(None)</option>
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
        if (!items || items.length === 0) {
          const opt = document.createElement('option');
          opt.value = ''; opt.textContent = '(No basemaps)';
          select.appendChild(opt);
        } else {
          items.forEach(function(b) {
            const opt = document.createElement('option');
            opt.value = b.url || '';
            opt.textContent = b.title || b.url || '';
            opt.setAttribute('data-attribution', encodeURIComponent(b.attribution || ''));
            if (selectedUrl && b.url && String(selectedUrl) === String(b.url)) {
              opt.selected = true;
            }
            select.appendChild(opt);
          });
        }
        updateAttribution();
      }

      if (select) {
        select.addEventListener('change', function() {
          updateAttribution();
          const url = select.value;
          if (url && window.parent) {
            window.parent.postMessage({ action: 'selectBasemap', url: url }, '*');
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
            showBasemapByUrl(msg.url || null);
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
    reearth.ui.show(html, { width: 240, height: 80, visible: true, position: 'bottom-left' });
  }
} catch (e) {}
