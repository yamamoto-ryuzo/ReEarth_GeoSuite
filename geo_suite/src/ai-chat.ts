// @ts-nocheck
// AI Chat widget — Gemini function calling chat that controls the map.
// The chat UI runs in the widget iframe (fetch/DOM available there); map
// operations are executed here in the extension sandbox via reearth.* API,
// or forwarded to the layers-and-tiles-list widget for inspector-bound state
// (camera presets, basemaps, fly routes, vector feature index).
declare const reearth: any;

const AI_DEBUG = false;

function aiLog(...args: any[]): void {
  try { if (AI_DEBUG) console.log.apply(console, args); } catch (e) {}
}
function aiError(...args: any[]): void {
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
    }
  } catch (e) {}
}

function normalizeLayers(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    try { return Object.values(raw); } catch (e) { return []; }
  }
  return [];
}

function encodeNonAscii(u: string): string {
  try {
    if (!u || typeof u !== 'string') return u;
    return u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  } catch (e) { return u; }
}

function defaultMaxLevelForUrl(url: string): number | null {
  try {
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\/(gazo[1-4]|ort_old10|ort_riku10)\//.test(url)) return 17;
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\//.test(url)) return 18;
    if (/tile\.openstreetmap\.org\//.test(url)) return 19;
  } catch (e) {}
  return null;
}

// ---------- extension wiring ----------

function findWidgetId(extensionId: string): string | null {
  try {
    const list = (reearth && reearth.extension && reearth.extension.list) || [];
    const target = list.find((ex: any) => ex && ex.extensionId === extensionId);
    return target ? target.id : null;
  } catch (e) { return null; }
}

let _layerPanelId: string | null = null;
function postToLayerPanel(msg: any): boolean {
  try {
    const targetId = _layerPanelId || findWidgetId('layers-and-tiles-list');
    if (!targetId) return false;
    _layerPanelId = targetId;
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, msg);
      return true;
    }
  } catch (e) {}
  return false;
}

// Tools executed by the layer panel widget (it owns inspector-bound state).
const PANEL_TOOLS = [
  'listCameraPresets', 'flyToPreset',
  'listBasemaps', 'setBasemap',
  'listFlyPaths', 'playFlyPath', 'stopFly',
  'setTerrain', 'setShadow',
  'openStreetView', 'flyToFeature',
  'setLayerVisible', 'addGeoJsonLayer', 'addTileLayer', 'add3dTilesLayer', 'removeLayer',
  'createFlyPath', 'deleteFlyPath',
  'showPanel', 'showInfo', 'listLegends', 'showFeatureAttributes',
  'getInspectorText', 'applyInspectorText',
  'setDepthTest', 'setGeojsonDrape', 'setBackground'
];

// Panel tools that still work (degraded) without the layer panel.
const LOCAL_FALLBACK = ['setLayerVisible', 'addGeoJsonLayer', 'addTileLayer', 'add3dTilesLayer', 'removeLayer'];

// reqIds currently forwarded to the layer panel; extensionMessage replies are routed back to the UI.
const _pendingForward: any = {};

// Layer IDs added by AI tools (removeLayer is restricted to these).
const _aiAddedLayerIds = new Set();

// Inspector-provided config (forwarded from the layer panel).
let _inspectorGeminiApiKey: string | null = null;
let _inspectorGeminiModel: string | null = null;
let _inspectorYahooAppId: string | null = null;
let _inspectorLang = 'auto';

const AI_STORAGE_KEY = 'geminiApiKey';
const AI_STORAGE_MODEL = 'geminiModel';
const AI_DEFAULT_MODEL = 'gemini-3.1-flash-lite';

async function sendConfig(): Promise<void> {
  let storedKey: any = null;
  let storedModel: any = null;
  try {
    if (reearth && reearth.data && reearth.data.clientStorage && typeof reearth.data.clientStorage.getAsync === 'function') {
      storedKey = await reearth.data.clientStorage.getAsync(AI_STORAGE_KEY);
      storedModel = await reearth.data.clientStorage.getAsync(AI_STORAGE_MODEL);
    }
  } catch (e) {}
  const key = _inspectorGeminiApiKey || (typeof storedKey === 'string' ? storedKey : '');
  const model = _inspectorGeminiModel || (typeof storedModel === 'string' && storedModel ? storedModel : AI_DEFAULT_MODEL);
  postToUI({
    action: 'aiConfig',
    apiKey: key,
    hasKey: !!key,
    keySource: _inspectorGeminiApiKey ? 'inspector' : (storedKey ? 'storage' : 'none'),
    model: model,
    yahooAppId: _inspectorYahooAppId || '',
    lang: _inspectorLang || 'auto'
  });
}

// ---------- camera helpers ----------

function getCameraPos(): any {
  let cur: any = null;
  try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch (e) {}
  if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch (e) {}
  if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch (e) {}
  return cur;
}

function rad2deg(r: any): number | null {
  return (typeof r === 'number' && isFinite(r)) ? Math.round(r * 180 / Math.PI * 100000) / 100000 : null;
}

function cameraResult(): any {
  const c = getCameraPos();
  if (!c) return { error: 'camera unavailable' };
  const out: any = {};
  const lat = c.lat ?? c.latitude;
  const lng = c.lng ?? c.longitude ?? c.lon;
  const h = c.height ?? c.altitude ?? c.alt;
  if (typeof lat === 'number') out.lat = Math.round(lat * 1000000) / 1000000;
  if (typeof lng === 'number') out.lng = Math.round(lng * 1000000) / 1000000;
  if (typeof h === 'number') out.height = Math.round(h * 10) / 10;
  const hd = rad2deg(c.heading ?? c.yaw);
  const pt = rad2deg(c.pitch ?? c.tilt);
  const rl = rad2deg(c.roll);
  if (hd !== null) out.heading = hd;
  if (pt !== null) out.pitch = pt;
  if (rl !== null) out.roll = rl;
  return out;
}

// ---------- local tool implementations ----------

function aiResolveLayer(ref: any): any {
  try {
    if (ref === undefined || ref === null) return null;
    const all = normalizeLayers(reearth && reearth.layers && reearth.layers.layers);
    const r = String(ref);
    let l = all.find((x: any) => x && x.id === r);
    if (l) return l;
    const rl = r.toLowerCase();
    l = all.find((x: any) => x && String(x.title || '').toLowerCase() === rl);
    if (l) return l;
    l = all.find((x: any) => x && String(x.title || '').toLowerCase().indexOf(rl) >= 0);
    return l || null;
  } catch (e) { return null; }
}

function aiFlyTo(args: any): any {
  const lat = Number(args && args.lat);
  const lng = Number(args && args.lng);
  if (!isFinite(lat) || !isFinite(lng)) return { error: 'lat/lng required' };
  const cur = getCameraPos() || {};
  const dest: any = { lat: lat, lng: lng };
  dest.height = isFinite(Number(args.height)) ? Number(args.height) : (typeof cur.height === 'number' ? cur.height : 2000);
  const hd = isFinite(Number(args.heading)) ? Number(args.heading) * Math.PI / 180 : (typeof cur.heading === 'number' ? cur.heading : 0);
  const pt = isFinite(Number(args.pitch)) ? Number(args.pitch) * Math.PI / 180 : (typeof cur.pitch === 'number' ? cur.pitch : -Math.PI / 4);
  dest.heading = hd;
  dest.pitch = pt;
  dest.roll = (typeof cur.roll === 'number') ? cur.roll : 0;
  const duration = isFinite(Number(args.duration)) ? Math.max(0, Number(args.duration)) : 2;
  try {
    reearth.camera.flyTo(dest, { duration: duration });
    return { ok: true, lat: lat, lng: lng, height: dest.height };
  } catch (e) {
    return { error: 'flyTo failed: ' + String(e) };
  }
}

function aiListLayers(): any {
  const all = normalizeLayers(reearth && reearth.layers && reearth.layers.layers);
  const out = all.slice(0, 200).map((l: any) => ({
    id: l && l.id,
    title: (l && (l.title || (l.layer && l.layer.title))) || '',
    type: (l && l.data && l.data.type) || '',
    visible: !!(l && l.visible !== false),
    isBasemap: !!(l && l.data && l.data.isBasemap)
  }));
  return { layers: out, count: all.length };
}

function aiSetLayerVisible(args: any): any {
  const l = aiResolveLayer(args && args.layer);
  if (!l || !l.id) return { error: 'layer not found: ' + String(args && args.layer) };
  const visible = !!(args && args.visible);
  try {
    if (visible) {
      if (typeof reearth.layers.hide === 'function') { try { reearth.layers.hide(l.id); } catch (e) {} }
      if (typeof reearth.layers.show === 'function') reearth.layers.show(l.id);
      else if (typeof reearth.layers.override === 'function') reearth.layers.override(l.id, { visible: true });
    } else {
      if (typeof reearth.layers.hide === 'function') reearth.layers.hide(l.id);
      else if (typeof reearth.layers.override === 'function') reearth.layers.override(l.id, { visible: false });
    }
    return { ok: true, id: l.id, title: l.title, visible: visible };
  } catch (e) {
    return { error: 'setLayerVisible failed: ' + String(e) };
  }
}

function aiFocusLayer(args: any): any {
  const l = aiResolveLayer(args && args.layer);
  if (!l || !l.id) return { error: 'layer not found: ' + String(args && args.layer) };
  try {
    reearth.camera.flyTo(l.id, { duration: 2 });
    return { ok: true, id: l.id, title: l.title };
  } catch (e) {
    return { error: 'focusLayer failed: ' + String(e) };
  }
}

function aiAddLayer(args: any, type: string): any {
  const url = String((args && args.url) || '').trim();
  if (!/^https?:\/\//i.test(url) && !/^data:/i.test(url)) return { error: 'url must be http(s)' };
  const encodedUrl = encodeNonAscii(url);
  const title = String((args && args.title) || url);
  const layer: any = {
    type: 'simple',
    title: title,
    visible: true,
    data: { type: type, url: encodedUrl }
  };
  if (type === 'tiles') {
    layer.tiles = {};
    const minL = isFinite(Number(args && args.minLevel)) ? Number(args.minLevel) : null;
    let maxL = isFinite(Number(args && args.maxLevel)) ? Number(args.maxLevel) : null;
    if (maxL === null) maxL = defaultMaxLevelForUrl(encodedUrl);
    const raster: any = {};
    if (minL !== null) raster.minimumLevel = minL;
    if (maxL !== null) raster.maximumLevel = maxL;
    if (minL !== null || maxL !== null) layer.raster = raster;
  }
  if (type === 'geojson') {
    layer.marker = { pointColor: '#3388ff', pointSize: 10 };
    layer.polyline = { strokeColor: '#3388ff', strokeWidth: 2, clampToGround: true, classificationType: 'terrain' };
    layer.polygon = { fillColor: '#3388ff44', strokeColor: '#3388ff', strokeWidth: 2, heightReference: 'clamp', classificationType: 'terrain' };
  }
  try {
    const id = reearth.layers.add(layer);
    if (id) { try { _aiAddedLayerIds.add(id); } catch (e) {} }
    if (args && args.visible === false && id) {
      try { if (typeof reearth.layers.hide === 'function') reearth.layers.hide(id); } catch (e) {}
    }
    return { ok: true, id: id, title: title };
  } catch (e) {
    return { error: 'layers.add failed: ' + String(e) };
  }
}

function aiRemoveLayer(args: any): any {
  const l = aiResolveLayer(args && args.layer);
  if (!l || !l.id) return { error: 'layer not found: ' + String(args && args.layer) };
  if (!_aiAddedLayerIds.has(l.id)) {
    return { error: 'only layers added by the AI can be removed' };
  }
  try {
    if (typeof reearth.layers.delete === 'function') reearth.layers.delete(l.id);
    else if (typeof reearth.layers.remove === 'function') reearth.layers.remove(l.id);
    else return { error: 'layers.delete unavailable' };
    try { _aiAddedLayerIds.delete(l.id); } catch (e) {}
    return { ok: true, id: l.id, title: l.title };
  } catch (e) {
    return { error: 'removeLayer failed: ' + String(e) };
  }
}

function aiCaptureView(): any {
  try {
    if (reearth.viewer && typeof reearth.viewer.capture === 'function') {
      const dataUrl = reearth.viewer.capture('image/png');
      if (dataUrl) return { ok: true, dataUrl: dataUrl };
      return { error: 'capture returned empty' };
    }
    return { error: 'viewer.capture unavailable' };
  } catch (e) {
    return { error: 'capture failed: ' + String(e) };
  }
}

function aiShareUrl(): any {
  const c = cameraResult();
  if (c.error) return c;
  const params: string[] = [];
  if (typeof c.lat === 'number') params.push('lat=' + c.lat);
  if (typeof c.lng === 'number') params.push('lng=' + c.lng);
  if (typeof c.height === 'number') params.push('height=' + c.height);
  if (typeof c.heading === 'number') params.push('heading=' + c.heading);
  if (typeof c.pitch === 'number') params.push('pitch=' + c.pitch);
  return { ok: true, query: '?' + params.join('&') };
}

function aiSetCamera(args: any): any {
  const lat = Number(args && args.lat);
  const lng = Number(args && args.lng);
  if (!isFinite(lat) || !isFinite(lng)) return { error: 'lat/lng required' };
  const cur = getCameraPos() || {};
  const dest: any = { lat: lat, lng: lng };
  dest.height = isFinite(Number(args.height)) ? Number(args.height) : (typeof cur.height === 'number' ? cur.height : 2000);
  dest.heading = isFinite(Number(args.heading)) ? Number(args.heading) * Math.PI / 180 : (typeof cur.heading === 'number' ? cur.heading : 0);
  dest.pitch = isFinite(Number(args.pitch)) ? Number(args.pitch) * Math.PI / 180 : (typeof cur.pitch === 'number' ? cur.pitch : -Math.PI / 4);
  dest.roll = isFinite(Number(args.roll)) ? Number(args.roll) * Math.PI / 180 : (typeof cur.roll === 'number' ? cur.roll : 0);
  try {
    reearth.camera.setView(dest);
    return { ok: true, lat: lat, lng: lng };
  } catch (e) {
    return { error: 'setView failed: ' + String(e) };
  }
}

function aiLookAt(args: any): any {
  const lat = Number(args && args.lat);
  const lng = Number(args && args.lng);
  if (!isFinite(lat) || !isFinite(lng)) return { error: 'lat/lng required' };
  if (!reearth.camera || typeof reearth.camera.lookAt !== 'function') return { error: 'camera.lookAt unavailable' };
  const dest: any = { lat: lat, lng: lng };
  if (isFinite(Number(args.height))) dest.height = Number(args.height);
  if (isFinite(Number(args.heading))) dest.heading = Number(args.heading) * Math.PI / 180;
  if (isFinite(Number(args.pitch))) dest.pitch = Number(args.pitch) * Math.PI / 180;
  if (isFinite(Number(args.range))) dest.range = Number(args.range);
  // The viewer builds a BoundingSphere from `radius`; without it lookAt is a no-op.
  dest.radius = isFinite(Number(args.radius)) ? Number(args.radius)
    : (isFinite(Number(args.range)) ? Number(args.range) : 500);
  const opts: any = {};
  if (args.instant) opts.withoutAnimation = true;
  else if (isFinite(Number(args.duration))) opts.duration = Number(args.duration);
  try {
    reearth.camera.lookAt(dest, opts);
    return { ok: true, lat: lat, lng: lng };
  } catch (e) {
    return { error: 'lookAt failed: ' + String(e) };
  }
}

function aiZoom(args: any, dir: string): any {
  const amt = isFinite(Number(args && args.amount)) ? Number(args.amount) : 2;
  const fn = dir === 'in' ? reearth.camera && reearth.camera.zoomIn : reearth.camera && reearth.camera.zoomOut;
  if (typeof fn !== 'function') return { error: 'camera.zoom' + (dir === 'in' ? 'In' : 'Out') + ' unavailable' };
  try {
    fn.call(reearth.camera, amt);
    return { ok: true, direction: dir, amount: amt };
  } catch (e) {
    return { error: 'zoom failed: ' + String(e) };
  }
}

function aiOpenUrl(args: any): any {
  const url = String((args && args.url) || '').trim();
  if (!/^https?:\/\//i.test(url)) return { error: 'url must be http(s)' };
  try {
    if (reearth.viewer && typeof reearth.viewer.open === 'function') {
      reearth.viewer.open(url);
      return { ok: true, url: url, note: 'browser may block popups not triggered by a user gesture' };
    }
    return { error: 'viewer.open unavailable' };
  } catch (e) {
    return { error: 'open failed: ' + String(e) };
  }
}

async function execLocalTool(name: string, args: any): Promise<any> {
  try {
    switch (name) {
      case 'getCamera': return cameraResult();
      case 'flyTo': return aiFlyTo(args);
      case 'listLayers': return aiListLayers();
      case 'setLayerVisible': return aiSetLayerVisible(args);
      case 'focusLayer': return aiFocusLayer(args);
      case 'addGeoJsonLayer': return aiAddLayer(args, 'geojson');
      case 'addTileLayer': return aiAddLayer(args, 'tiles');
      case 'add3dTilesLayer': return aiAddLayer(args, '3dtiles');
      case 'removeLayer': return aiRemoveLayer(args);
      case 'captureView': return aiCaptureView();
      case 'getShareUrl': return aiShareUrl();
      case 'setCamera': return aiSetCamera(args);
      case 'lookAt': return aiLookAt(args);
      case 'zoomIn': return aiZoom(args, 'in');
      case 'zoomOut': return aiZoom(args, 'out');
      case 'openUrl': return aiOpenUrl(args);
      default: return { error: 'unknown tool: ' + name };
    }
  } catch (e) {
    return { error: String((e && e.message) || e) };
  }
}

// ---------- message handlers ----------

try {
  if (reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('message', (msg: any) => {
      try {
        if (!msg || !msg.action) return;
        if (msg.action === 'aiToolCall') {
          const reqId = msg.reqId;
          const name = String(msg.name || '');
          const args = msg.args || {};
          if (name === 'removeLayer') {
            const rl = aiResolveLayer(args.layer);
            if (!rl || !rl.id || !_aiAddedLayerIds.has(rl.id)) {
              postToUI({ action: 'aiToolResult', reqId: reqId, result: { error: 'only layers added by the AI can be removed' } });
              return;
            }
            args._layerId = rl.id;
          }
          if (PANEL_TOOLS.indexOf(name) >= 0) {
            _pendingForward[reqId] = { name: name };
            const sent = postToLayerPanel({ action: 'aiToolRequest', reqId: reqId, name: name, args: args });
            if (!sent) {
              delete _pendingForward[reqId];
              if (LOCAL_FALLBACK.indexOf(name) >= 0) {
                execLocalTool(name, args).then((result: any) => {
                  postToUI({ action: 'aiToolResult', reqId: reqId, result: result });
                });
              } else {
                postToUI({ action: 'aiToolResult', reqId: reqId, result: { error: 'layer panel unavailable' } });
              }
            }
          } else {
            execLocalTool(name, args).then((result: any) => {
              postToUI({ action: 'aiToolResult', reqId: reqId, result: result });
            });
          }
        } else if (msg.action === 'aiGetConfig') {
          // Ask the layer panel for inspector-provided values, then reply with merged config.
          try { postToLayerPanel({ action: 'requestAiConfig' }); } catch (e) {}
          sendConfig();
        } else if (msg.action === 'aiSetApiKey') {
          const key = (typeof msg.key === 'string') ? msg.key.trim() : '';
          try {
            if (reearth.data && reearth.data.clientStorage && typeof reearth.data.clientStorage.setAsync === 'function') {
              reearth.data.clientStorage.setAsync(AI_STORAGE_KEY, key);
            }
          } catch (e) {}
          sendConfig();
        } else if (msg.action === 'aiSetModel') {
          const m = (typeof msg.model === 'string') ? msg.model.trim() : '';
          try {
            if (reearth.data && reearth.data.clientStorage && typeof reearth.data.clientStorage.setAsync === 'function') {
              reearth.data.clientStorage.setAsync(AI_STORAGE_MODEL, m);
            }
          } catch (e) {}
          sendConfig();
        }
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  if (reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('extensionMessage', (msg: any) => {
      try {
        const data = (msg && msg.data !== undefined) ? msg.data : msg;
        if (!data || !data.action) return;
        if (data.action === 'aiToolResult' && data.reqId && _pendingForward[data.reqId]) {
          const meta = _pendingForward[data.reqId];
          delete _pendingForward[data.reqId];
          try {
            const r = data.result;
            if (meta && meta.name === 'removeLayer') {
              if (r && !r.error && r.id) _aiAddedLayerIds.delete(r.id);
            } else if (meta && (meta.name === 'addGeoJsonLayer' || meta.name === 'addTileLayer' || meta.name === 'add3dTilesLayer')) {
              if (r && r.id) _aiAddedLayerIds.add(r.id);
            }
          } catch (e) {}
          postToUI({ action: 'aiToolResult', reqId: data.reqId, result: data.result });
        } else if (data.action === 'aiConfig') {
          _inspectorGeminiApiKey = (typeof data.geminiApiKey === 'string' && data.geminiApiKey) ? data.geminiApiKey : null;
          _inspectorGeminiModel = (typeof data.geminiModel === 'string' && data.geminiModel) ? data.geminiModel : null;
          _inspectorYahooAppId = (typeof data.yahooAppId === 'string' && data.yahooAppId) ? data.yahooAppId : null;
          _inspectorLang = (typeof data.lang === 'string' && data.lang) ? data.lang : 'auto';
          sendConfig();
        } else if (data.action === 'lang') {
          _inspectorLang = (typeof data.lang === 'string' && data.lang) ? data.lang : 'auto';
          postToUI({ action: 'lang', lang: _inspectorLang });
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// Request inspector config once at startup (layer panel may reply asynchronously).
try { postToLayerPanel({ action: 'requestAiConfig' }); } catch (e) {}

// ---------- chat UI (runs in the widget iframe) ----------

const html: string = `
<style>
  html, body { margin:0; padding:0; width:320px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .ai-wrap { background:rgba(255,255,255,0.92); border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.2); backdrop-filter:blur(4px); width:312px; display:flex; flex-direction:column; overflow:hidden; box-sizing:border-box; }
  .ai-head { display:flex; align-items:center; gap:6px; padding:6px 8px; border-bottom:1px solid #e3e3e3; background:#f7f9fc; }
  .ai-title { font-size:0.85em; font-weight:600; color:#333; flex:1; }
  .ai-head button { border:1px solid #ccc; background:#fff; border-radius:4px; width:26px; height:24px; font-size:0.85em; cursor:pointer; line-height:1; padding:0; }
  .ai-head button:hover { background:#eef2fa; }
  .ai-msgs { height:300px; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; background:#fff; }
  .ai-msg { max-width:92%; padding:6px 9px; border-radius:10px; font-size:0.82em; line-height:1.45; white-space:pre-wrap; overflow-wrap:break-word; }
  .ai-msg.user { align-self:flex-end; background:#dcf0ff; color:#123; }
  .ai-msg.bot { align-self:flex-start; background:#f1f1f4; color:#222; }
  .ai-msg.sys { align-self:center; background:transparent; color:#888; font-size:0.75em; padding:2px; }
  .ai-msg.tool { align-self:flex-start; background:#eef8ee; color:#475; font-size:0.72em; padding:3px 8px; border:1px solid #d9ead9; font-family:monospace; }
  .ai-msg img { max-width:100%; border-radius:6px; display:block; margin-top:4px; }
  .ai-form { display:flex; gap:6px; padding:8px; border-top:1px solid #e3e3e3; background:#fafafa; }
  .ai-form input { flex:1; border:1px solid #ccc; border-radius:6px; padding:7px 9px; font-size:0.85em; min-width:0; }
  .ai-form button { border:1px solid #3b7bd4; background:#3b7bd4; color:#fff; border-radius:6px; padding:0 14px; font-size:0.85em; cursor:pointer; }
  .ai-form button:disabled { opacity:0.5; cursor:default; }
  .ai-settings { display:none; flex-direction:column; gap:6px; padding:8px; border-top:1px solid #e3e3e3; background:#fdfdf8; font-size:0.78em; }
  .ai-settings.open { display:flex; }
  .ai-settings label { color:#444; font-weight:600; }
  .ai-settings input { border:1px solid #ccc; border-radius:4px; padding:5px 7px; font-size:1em; width:100%; box-sizing:border-box; }
  .ai-settings .row { display:flex; gap:6px; align-items:center; }
  .ai-settings button { border:1px solid #3b7bd4; background:#3b7bd4; color:#fff; border-radius:4px; padding:5px 12px; cursor:pointer; font-size:1em; }
  .ai-key-status { color:#a64; font-size:0.9em; }
  .ai-key-status.ok { color:#4a4; }
  .ai-wrap.minimized .ai-msgs,
  .ai-wrap.minimized .ai-form,
  .ai-wrap.minimized .ai-settings { display:none !important; }
</style>
<div class="ai-wrap">
  <div class="ai-head">
    <div class="ai-title" data-i18n="title">AI Chat</div>
    <button id="ai-settings-btn" data-i18n-title="settings" title="Settings">&#9881;</button>
    <button id="ai-clear-btn" data-i18n-title="clear" title="Clear">&#128465;</button>
    <button id="ai-min-btn" data-i18n-title="minimize" title="Minimize">&mdash;</button>
  </div>
  <div id="ai-msgs" class="ai-msgs"></div>
  <div id="ai-settings" class="ai-settings">
    <div class="row"><label data-i18n="apiKey" style="flex:1;">Gemini API key</label><span id="ai-key-status" class="ai-key-status"></span></div>
    <input id="ai-key" type="password" autocomplete="off" data-i18n-ph="apiKeyPh" placeholder="AIza...">
    <label data-i18n="model">Model</label>
    <input id="ai-model" type="text" placeholder="gemini-3.1-flash-lite">
    <div class="row"><button id="ai-save" data-i18n="save">Save</button><span id="ai-save-msg" style="color:#4a4;"></span></div>
  </div>
  <form id="ai-form" class="ai-form">
    <input id="ai-input" data-i18n-ph="inputPh" placeholder="Ask about the map..." autocomplete="off">
    <button id="ai-send" type="button" data-i18n="send">Send</button>
  </form>
</div>
<script>
(function(){
  // --- i18n (English base; missing keys fall back to en) ---
  var GEO_I18N = {
    en: { title:'AI Chat', settings:'Settings', clear:'Clear chat', apiKey:'Gemini API key', apiKeyPh:'AIza... (stored in plugin storage)', model:'Model', save:'Save', saved:'Saved', send:'Send', inputPh:'Ask about the map...', welcome:'Ask me to fly somewhere, search places, or toggle layers.', noKey:'No API key — open settings (gear) to add one.', noKeySet:'key not set', keySet:'key set', tool:'tool', err:'Error', cleared:'Chat cleared.', timeout:'Tool timed out', noResponse:'(no response)', stepLimit:'(tool step limit reached)' },
    ja: { title:'AIチャット', settings:'設定', clear:'チャットをクリア', apiKey:'Gemini APIキー', apiKeyPh:'AIza...（プラグインストレージに保存）', model:'モデル', save:'保存', saved:'保存しました', send:'送信', inputPh:'地図について聞く...', welcome:'場所への移動・地名検索・レイヤー操作などを頼んでください。', noKey:'APIキー未設定 — 歯車から設定してください。', noKeySet:'キー未設定', keySet:'キー設定済み', tool:'ツール', err:'エラー', cleared:'チャットをクリアしました。', timeout:'ツールがタイムアウトしました', noResponse:'（応答なし）', stepLimit:'（ツール実行の上限に達しました）' },
    'zh-CN': { title:'AI 聊天', settings:'设置', clear:'清空聊天', apiKey:'Gemini API 密钥', apiKeyPh:'AIza...（保存于插件存储）', model:'模型', save:'保存', saved:'已保存', send:'发送', inputPh:'询问地图相关...', welcome:'可以让我飞到某地、搜索地点或切换图层。', noKey:'未设置 API 密钥 — 请在齿轮设置中添加。', noKeySet:'未设密钥', keySet:'密钥已设', tool:'工具', err:'错误', cleared:'已清空聊天。', timeout:'工具超时', noResponse:'（无响应）', stepLimit:'（已达工具调用次数上限）' },
    'zh-TW': { title:'AI 聊天', settings:'設定', clear:'清除聊天', apiKey:'Gemini API 金鑰', apiKeyPh:'AIza...（儲存於外掛儲存空間）', model:'模型', save:'儲存', saved:'已儲存', send:'傳送', inputPh:'詢問地圖相關...', welcome:'可以請我飛到某地、搜尋地點或切換圖層。', noKey:'未設定 API 金鑰 — 請在齒輪設定中新增。', noKeySet:'未設金鑰', keySet:'金鑰已設', tool:'工具', err:'錯誤', cleared:'已清除聊天。', timeout:'工具逾時', noResponse:'（無回應）', stepLimit:'（已達工具呼叫次數上限）' },
    ko: { title:'AI 채팅', settings:'설정', clear:'채팅 지우기', apiKey:'Gemini API 키', apiKeyPh:'AIza...（플러그인 저장소에 저장）', model:'모델', save:'저장', saved:'저장됨', send:'전송', inputPh:'지도에 대해 물어보기...', welcome:'장소로 이동, 장소 검색, 레이어 전환 등을 요청하세요.', noKey:'API 키 없음 — 톱니바퀴 설정에서 추가하세요.', noKeySet:'키 없음', keySet:'키 설정됨', tool:'도구', err:'오류', cleared:'채팅을 지웠습니다.', timeout:'도구 시간 초과', noResponse:'(응답 없음)', stepLimit:'(도구 호출 한도에 도달했습니다)' },
    es: { title:'Chat IA', settings:'Ajustes', clear:'Limpiar chat', apiKey:'Clave API de Gemini', apiKeyPh:'AIza... (guardada en el plugin)', model:'Modelo', save:'Guardar', saved:'Guardado', send:'Enviar', inputPh:'Pregunta sobre el mapa...', welcome:'Pídeme volar a un lugar, buscar sitios o cambiar capas.', noKey:'Sin clave API — añádela en ajustes (engranaje).', noKeySet:'sin clave', keySet:'clave lista', tool:'herramienta', err:'Error', cleared:'Chat limpiado.', timeout:'Herramienta agotó el tiempo', noResponse:'(sin respuesta)', stepLimit:'(límite de pasos de herramientas alcanzado)' },
    fr: { title:'Chat IA', settings:'Paramètres', clear:'Effacer le chat', apiKey:'Clé API Gemini', apiKeyPh:'AIza... (stockée dans le plugin)', model:'Modèle', save:'Enregistrer', saved:'Enregistré', send:'Envoyer', inputPh:'Posez une question sur la carte...', welcome:'Demandez-moi de voler quelque part, chercher un lieu ou gérer les couches.', noKey:'Pas de clé API — ajoutez-la dans les paramètres (engrenage).', noKeySet:'clé absente', keySet:'clé définie', tool:'outil', err:'Erreur', cleared:'Chat effacé.', timeout:'Outil expiré', noResponse:'(pas de réponse)', stepLimit:'(limite d’étapes d’outils atteinte)' },
    de: { title:'KI-Chat', settings:'Einstellungen', clear:'Chat löschen', apiKey:'Gemini API-Schlüssel', apiKeyPh:'AIza... (im Plugin gespeichert)', model:'Modell', save:'Speichern', saved:'Gespeichert', send:'Senden', inputPh:'Frage zur Karte stellen...', welcome:'Lass mich irgendwo hinfliegen, Orte suchen oder Layer umschalten.', noKey:'Kein API-Schlüssel — in den Einstellungen (Zahnrad) hinzufügen.', noKeySet:'kein Schlüssel', keySet:'Schlüssel gesetzt', tool:'Werkzeug', err:'Fehler', cleared:'Chat gelöscht.', timeout:'Werkzeug-Timeout', noResponse:'(keine Antwort)', stepLimit:'(Tool-Schrittlimit erreicht)' },
    it: { title:'Chat IA', settings:'Impostazioni', clear:'Cancella chat', apiKey:'Chiave API Gemini', apiKeyPh:'AIza... (salvata nel plugin)', model:'Modello', save:'Salva', saved:'Salvato', send:'Invia', inputPh:'Chiedi sulla mappa...', welcome:'Chiedimi di volare da qualche parte, cercare luoghi o cambiare layer.', noKey:'Nessuna chiave API — aggiungila nelle impostazioni (ingranaggio).', noKeySet:'chiave assente', keySet:'chiave impostata', tool:'strumento', err:'Errore', cleared:'Chat cancellata.', timeout:'Strumento scaduto', noResponse:'(nessuna risposta)', stepLimit:'(limite di passaggi degli strumenti raggiunto)' },
    pt: { title:'Chat IA', settings:'Configurações', clear:'Limpar chat', apiKey:'Chave API Gemini', apiKeyPh:'AIza... (guardada no plugin)', model:'Modelo', save:'Guardar', saved:'Guardado', send:'Enviar', inputPh:'Pergunte sobre o mapa...', welcome:'Peça-me para voar a um lugar, pesquisar locais ou alternar camadas.', noKey:'Sem chave API — adicione nas configurações (engrenagem).', noKeySet:'sem chave', keySet:'chave definida', tool:'ferramenta', err:'Erro', cleared:'Chat limpo.', timeout:'Ferramenta expirou', noResponse:'(sem resposta)', stepLimit:'(limite de etapas de ferramentas atingido)' },
    ru: { title:'ИИ-чат', settings:'Настройки', clear:'Очистить чат', apiKey:'API-ключ Gemini', apiKeyPh:'AIza... (хранится в плагине)', model:'Модель', save:'Сохранить', saved:'Сохранено', send:'Отправить', inputPh:'Спросите о карте...', welcome:'Попросите меня долететь до места, найти объект или переключить слои.', noKey:'Нет API-ключа — добавьте в настройках (шестерёнка).', noKeySet:'ключа нет', keySet:'ключ задан', tool:'инструмент', err:'Ошибка', cleared:'Чат очищен.', timeout:'Инструмент: таймаут', noResponse:'(нет ответа)', stepLimit:'(достигнут лимит шагов инструментов)' },
    nl: { title:'AI-chat', settings:'Instellingen', clear:'Chat wissen', apiKey:'Gemini API-sleutel', apiKeyPh:'AIza... (opgeslagen in plugin)', model:'Model', save:'Opslaan', saved:'Opgeslagen', send:'Verzenden', inputPh:'Vraag over de kaart...', welcome:'Vraag me ergens heen te vliegen, plaatsen te zoeken of lagen te wisselen.', noKey:'Geen API-sleutel — voeg toe via instellingen (tandwiel).', noKeySet:'geen sleutel', keySet:'sleutel gezet', tool:'hulpmiddel', err:'Fout', cleared:'Chat gewist.', timeout:'Hulpmiddel time-out', noResponse:'(geen antwoord)', stepLimit:'(limiet voor toolstappen bereikt)' },
    pl: { title:'Czat AI', settings:'Ustawienia', clear:'Wyczyść czat', apiKey:'Klucz API Gemini', apiKeyPh:'AIza... (zapisany we wtyczce)', model:'Model', save:'Zapisz', saved:'Zapisano', send:'Wyślij', inputPh:'Zapytaj o mapę...', welcome:'Poproś o przelot w miejsce, wyszukanie lokalizacji lub przełączenie warstw.', noKey:'Brak klucza API — dodaj w ustawieniach (zębatka).', noKeySet:'brak klucza', keySet:'klucz ustawiony', tool:'narzędzie', err:'Błąd', cleared:'Czat wyczyszczony.', timeout:'Przekroczono czas narzędzia', noResponse:'(brak odpowiedzi)', stepLimit:'(osiągnięto limit kroków narzędzi)' },
    uk: { title:'AI-чат', settings:'Налаштування', clear:'Очистити чат', apiKey:'API-ключ Gemini', apiKeyPh:'AIza... (зберігається у плагіні)', model:'Модель', save:'Зберегти', saved:'Збережено', send:'Надіслати', inputPh:'Запитайте про карту...', welcome:'Попросіть мене полетіти кудись, знайти місце або перемкнути шари.', noKey:'Немає API-ключа — додайте в налаштуваннях (шестерня).', noKeySet:'ключа немає', keySet:'ключ задано', tool:'інструмент', err:'Помилка', cleared:'Чат очищено.', timeout:'Інструмент: тайм-аут', noResponse:'(немає відповіді)', stepLimit:'(досягнуто ліміту кроків інструментів)' },
    tr: { title:'AI Sohbet', settings:'Ayarlar', clear:'Sohbeti temizle', apiKey:'Gemini API anahtarı', apiKeyPh:'AIza... (eklenti deposunda saklanır)', model:'Model', save:'Kaydet', saved:'Kaydedildi', send:'Gönder', inputPh:'Harita hakkında sor...', welcome:'Bir yere uçmamı, yer aramamı veya katmanları değiştirmemi isteyin.', noKey:'API anahtarı yok — ayarlardan (dişli) ekleyin.', noKeySet:'anahtar yok', keySet:'anahtar var', tool:'araç', err:'Hata', cleared:'Sohbet temizlendi.', timeout:'Araç zaman aşımı', noResponse:'(yanıt yok)', stepLimit:'(araç adım sınırına ulaşıldı)' },
    ar: { title:'دردشة الذكاء الاصطناعي', settings:'الإعدادات', clear:'مسح الدردشة', apiKey:'مفتاح Gemini API', apiKeyPh:'AIza... (يُحفظ في الإضافة)', model:'النموذج', save:'حفظ', saved:'تم الحفظ', send:'إرسال', inputPh:'اسأل عن الخريطة...', welcome:'اطلب مني الطيران إلى مكان أو البحث عن مواقع أو تبديل الطبقات.', noKey:'لا يوجد مفتاح API — أضفه من الإعدادات (الترس).', noKeySet:'لا مفتاح', keySet:'المفتاح مضبوط', tool:'أداة', err:'خطأ', cleared:'تم مسح الدردشة.', timeout:'انتهت مهلة الأداة', noResponse:'(لا رد)', stepLimit:'(تم بلوغ حد خطوات الأداة)' },
    hi: { title:'AI चैट', settings:'सेटिंग्स', clear:'चैट साफ़ करें', apiKey:'Gemini API कुंजी', apiKeyPh:'AIza... (प्लगइन स्टोरेज में सहेजी जाती है)', model:'मॉडल', save:'सहेजें', saved:'सहेजा गया', send:'भेजें', inputPh:'नक्शे के बारे में पूछें...', welcome:'कहीं उड़ने, स्थान खोजने या लेयर बदलने के लिए कहें।', noKey:'API कुंजी नहीं — सेटिंग्स (गियर) में जोड़ें।', noKeySet:'कुंजी नहीं', keySet:'कुंजी सेट', tool:'उपकरण', err:'त्रुटि', cleared:'चैट साफ़ की गई।', timeout:'उपकरण समय समाप्त', noResponse:'(कोई प्रतिक्रिया नहीं)', stepLimit:'(उपकरण चरण सीमा पहुंची)' },
    id: { title:'Obrolan AI', settings:'Pengaturan', clear:'Bersihkan chat', apiKey:'Kunci API Gemini', apiKeyPh:'AIza... (disimpan di plugin)', model:'Model', save:'Simpan', saved:'Tersimpan', send:'Kirim', inputPh:'Tanya tentang peta...', welcome:'Minta saya terbang ke suatu tempat, mencari lokasi, atau mengganti layer.', noKey:'Belum ada kunci API — tambahkan di pengaturan (roda gigi).', noKeySet:'tanpa kunci', keySet:'kunci terpasang', tool:'alat', err:'Kesalahan', cleared:'Chat dibersihkan.', timeout:'Alat kedaluwarsa', noResponse:'(tidak ada respons)', stepLimit:'(batas langkah alat tercapai)' },
    th: { title:'แชท AI', settings:'การตั้งค่า', clear:'ล้างแชท', apiKey:'คีย์ API ของ Gemini', apiKeyPh:'AIza... (จัดเก็บในปลั๊กอิน)', model:'โมเดล', save:'บันทึก', saved:'บันทึกแล้ว', send:'ส่ง', inputPh:'ถามเกี่ยวกับแผนที่...', welcome:'ขอให้ผมบินไปที่ใดสักแห่ง ค้นหาสถานที่ หรือสลับเลเยอร์ได้', noKey:'ไม่มีคีย์ API — เพิ่มในการตั้งค่า (ฟันเฟือง)', noKeySet:'ไม่มีคีย์', keySet:'ตั้งคีย์แล้ว', tool:'เครื่องมือ', err:'ข้อผิดพลาด', cleared:'ล้างแชทแล้ว', timeout:'เครื่องมือหมดเวลา', noResponse:'(ไม่มีการตอบกลับ)', stepLimit:'(ถึงขีดจำกัดขั้นตอนเครื่องมือแล้ว)' },
    vi: { title:'Trò chuyện AI', settings:'Cài đặt', clear:'Xóa trò chuyện', apiKey:'Khóa API Gemini', apiKeyPh:'AIza... (lưu trong plugin)', model:'Mô hình', save:'Lưu', saved:'Đã lưu', send:'Gửi', inputPh:'Hỏi về bản đồ...', welcome:'Hãy yêu cầu tôi bay đến một nơi, tìm địa điểm hoặc bật/tắt lớp.', noKey:'Chưa có khóa API — thêm trong cài đặt (bánh răng).', noKeySet:'chưa có khóa', keySet:'đã có khóa', tool:'công cụ', err:'Lỗi', cleared:'Đã xóa trò chuyện.', timeout:'Công cụ hết thời gian', noResponse:'(không có phản hồi)', stepLimit:'(đã đạt giới hạn bước công cụ)' }
  };
  (function(){
    var M = {
      en:['Minimize','Restore'], ja:['最小化','元に戻す'], 'zh-CN':['最小化','还原'], 'zh-TW':['最小化','還原'],
      ko:['최소화','복원'], es:['Minimizar','Restaurar'], fr:['Réduire','Restaurer'], de:['Minimieren','Wiederherstellen'],
      it:['Riduci','Ripristina'], pt:['Minimizar','Restaurar'], ru:['Свернуть','Восстановить'], nl:['Minimaliseren','Herstellen'],
      pl:['Minimalizuj','Przywróć'], uk:['Згорнути','Відновити'], tr:['Küçült','Geri yükle'], ar:['تصغير','استعادة'],
      hi:['छोटा करें','पुनर्स्थापित'], id:['Minimalkan','Pulihkan'], th:['ย่อ','คืนค่า'], vi:['Thu nhỏ','Khôi phục']
    };
    for (var k in M) { if (GEO_I18N[k]) { GEO_I18N[k].minimize = M[k][0]; GEO_I18N[k].restore = M[k][1]; } }
  })();
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
      apply('[data-i18n-ph]', function(el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    } catch (e) {}
  }
  applyI18n();

  // ---------- tool declarations for Gemini function calling ----------
  var TOOL_DECLS = [{ functionDeclarations: [
    { name:'getCamera', description:'Get the current camera position/orientation', parameters:{ type:'OBJECT', properties:{} } },
    { name:'flyTo', description:'Fly the camera to a location. lat/lng in degrees, height in meters, heading/pitch in degrees (-90 = straight down). Omit height/heading/pitch to keep current values.', parameters:{ type:'OBJECT', properties:{ lat:{type:'NUMBER'}, lng:{type:'NUMBER'}, height:{type:'NUMBER'}, heading:{type:'NUMBER'}, pitch:{type:'NUMBER'}, duration:{type:'NUMBER', description:'flight seconds'} }, required:['lat','lng'] } },
    { name:'searchLocation', description:'Search for a place or address by keyword (Japan GSI geocoding by default; provider "yahoo" uses Yahoo Local Search, "auto" tries Yahoo then GSI). Returns candidate names with lat/lng — call flyTo afterwards to move.', parameters:{ type:'OBJECT', properties:{ query:{type:'STRING'}, limit:{type:'NUMBER'}, provider:{type:'STRING', description:'gsi (default) | yahoo | auto'} }, required:['query'] } },
    { name:'listLayers', description:'List map layers (id, title, type, visible)', parameters:{ type:'OBJECT', properties:{} } },
    { name:'setLayerVisible', description:'Show or hide a layer by title or id', parameters:{ type:'OBJECT', properties:{ layer:{type:'STRING'}, visible:{type:'BOOLEAN'} }, required:['layer','visible'] } },
    { name:'focusLayer', description:'Fly the camera to a layer extent', parameters:{ type:'OBJECT', properties:{ layer:{type:'STRING'} }, required:['layer'] } },
    { name:'addGeoJsonLayer', description:'Add a GeoJSON layer from a URL', parameters:{ type:'OBJECT', properties:{ title:{type:'STRING'}, url:{type:'STRING'} }, required:['url'] } },
    { name:'addTileLayer', description:'Add an XYZ raster tile layer; url contains {z}/{x}/{y}', parameters:{ type:'OBJECT', properties:{ title:{type:'STRING'}, url:{type:'STRING'}, minLevel:{type:'NUMBER'}, maxLevel:{type:'NUMBER'} }, required:['url'] } },
    { name:'add3dTilesLayer', description:'Add an OGC 3D Tiles layer (tileset.json URL)', parameters:{ type:'OBJECT', properties:{ title:{type:'STRING'}, url:{type:'STRING'} }, required:['url'] } },
    { name:'removeLayer', description:'Remove a layer previously added by the AI', parameters:{ type:'OBJECT', properties:{ layer:{type:'STRING'} }, required:['layer'] } },
    { name:'listCameraPresets', description:'List named camera presets defined in the plugin inspector', parameters:{ type:'OBJECT', properties:{} } },
    { name:'flyToPreset', description:'Fly to a named camera preset', parameters:{ type:'OBJECT', properties:{ name:{type:'STRING'} }, required:['name'] } },
    { name:'listBasemaps', description:'List available basemaps', parameters:{ type:'OBJECT', properties:{} } },
    { name:'setBasemap', description:'Switch the basemap by name; pass empty/none to clear', parameters:{ type:'OBJECT', properties:{ name:{type:'STRING'} }, required:['name'] } },
    { name:'listFlyPaths', description:'List flight routes (fly paths) defined in the inspector or drawn', parameters:{ type:'OBJECT', properties:{} } },
    { name:'playFlyPath', description:'Start an automatic camera flight along a named route', parameters:{ type:'OBJECT', properties:{ name:{type:'STRING'} }, required:['name'] } },
    { name:'stopFly', description:'Stop the current route flight', parameters:{ type:'OBJECT', properties:{} } },
    { name:'setTerrain', description:'Enable or disable 3D terrain', parameters:{ type:'OBJECT', properties:{ enabled:{type:'BOOLEAN'} }, required:['enabled'] } },
    { name:'setShadow', description:'Enable or disable shadows', parameters:{ type:'OBJECT', properties:{ enabled:{type:'BOOLEAN'} }, required:['enabled'] } },
    { name:'openStreetView', description:'Open Google Street View at the map center in a new tab', parameters:{ type:'OBJECT', properties:{} } },
    { name:'flyToFeature', description:'Fly to a vector feature whose attribute matches a value (optionally within a named layer)', parameters:{ type:'OBJECT', properties:{ attribute:{type:'STRING'}, value:{type:'STRING'}, layer:{type:'STRING'} }, required:['attribute','value'] } },
    { name:'captureView', description:'Capture a screenshot of the current map view', parameters:{ type:'OBJECT', properties:{} } },
    { name:'getShareUrl', description:'Get a permalink query string (?lat=...&lng=...) for the current view', parameters:{ type:'OBJECT', properties:{} } },
    { name:'setCamera', description:'Instantly place the camera (no animation). lat/lng in degrees, height in meters, heading/pitch/roll in degrees.', parameters:{ type:'OBJECT', properties:{ lat:{type:'NUMBER'}, lng:{type:'NUMBER'}, height:{type:'NUMBER'}, heading:{type:'NUMBER'}, pitch:{type:'NUMBER'}, roll:{type:'NUMBER'} }, required:['lat','lng'] } },
    { name:'lookAt', description:'Aim the camera at a target point. range = distance in meters, instant = no animation.', parameters:{ type:'OBJECT', properties:{ lat:{type:'NUMBER'}, lng:{type:'NUMBER'}, height:{type:'NUMBER'}, heading:{type:'NUMBER'}, pitch:{type:'NUMBER'}, range:{type:'NUMBER'}, duration:{type:'NUMBER'}, instant:{type:'BOOLEAN'} }, required:['lat','lng'] } },
    { name:'zoomIn', description:'Zoom in by a factor (default 2)', parameters:{ type:'OBJECT', properties:{ amount:{type:'NUMBER'} } } },
    { name:'zoomOut', description:'Zoom out by a factor (default 2)', parameters:{ type:'OBJECT', properties:{ amount:{type:'NUMBER'} } } },
    { name:'openUrl', description:'Open a URL in a new browser tab (e.g. Google Maps or Google Earth links). May be popup-blocked; the URL is returned so it can be shown as a link instead.', parameters:{ type:'OBJECT', properties:{ url:{type:'STRING'} }, required:['url'] } },
    { name:'flyToCurrentLocation', description:'Fly to the user\\'s current geolocation (browser permission required)', parameters:{ type:'OBJECT', properties:{} } },
    { name:'flyToUrl', description:'Parse a shared map URL or a "?lat=..&lng=.." query string and fly the camera there', parameters:{ type:'OBJECT', properties:{ url:{type:'STRING'} }, required:['url'] } },
    { name:'createFlyPath', description:'Create a named fly route from coordinates [[lng,lat,(height)],...]. Saved as a drawn route and playable via playFlyPath.', parameters:{ type:'OBJECT', properties:{ name:{type:'STRING'}, coordinates:{type:'ARRAY', items:{type:'ARRAY', items:{type:'NUMBER'}}}, speed:{type:'NUMBER'}, height:{type:'NUMBER'}, pitch:{type:'NUMBER'}, loop:{type:'BOOLEAN'}, view:{type:'STRING'} }, required:['name','coordinates'] } },
    { name:'deleteFlyPath', description:'Delete a drawn fly route by name (inspector-defined routes cannot be deleted)', parameters:{ type:'OBJECT', properties:{ name:{type:'STRING'} }, required:['name'] } },
    { name:'showPanel', description:'Open a panel in the Layers widget. panel: layers|legend|search|attr|cams|display|info|fly|share|manage', parameters:{ type:'OBJECT', properties:{ panel:{type:'STRING'} }, required:['panel'] } },
    { name:'showInfo', description:'Load a URL into the Info tab iframe and open the tab. Without url, opens the current Info tab.', parameters:{ type:'OBJECT', properties:{ url:{type:'STRING'} } } },
    { name:'listLegends', description:'List legend images defined in the plugin inspector', parameters:{ type:'OBJECT', properties:{} } },
    { name:'showFeatureAttributes', description:'Display a vector feature\\'s attributes in the Attr panel and fly to it (set fly:false to only show the panel)', parameters:{ type:'OBJECT', properties:{ attribute:{type:'STRING'}, value:{type:'STRING'}, layer:{type:'STRING'}, fly:{type:'BOOLEAN'} }, required:['attribute','value'] } },
    { name:'getInspectorText', description:'Get the plugin inspector settings text (layers, cams, routes, basemaps, legends etc.)', parameters:{ type:'OBJECT', properties:{} } },
    { name:'applyInspectorText', description:'Replace the plugin inspector settings text and apply it. Read the current text with getInspectorText first, then modify only the needed lines.', parameters:{ type:'OBJECT', properties:{ text:{type:'STRING'} }, required:['text'] } },
    { name:'setDepthTest', description:'Enable or disable depth test against terrain', parameters:{ type:'OBJECT', properties:{ enabled:{type:'BOOLEAN'} }, required:['enabled'] } },
    { name:'setGeojsonDrape', description:'Set how GeoJSON layers drape: 3dtiles | terrain | both', parameters:{ type:'OBJECT', properties:{ classification:{type:'STRING'} }, required:['classification'] } },
    { name:'setBackground', description:'Set the globe/scene background color as #rgb, #rrggbb or #rrggbbaa', parameters:{ type:'OBJECT', properties:{ color:{type:'STRING'} }, required:['color'] } },
    { name:'runCode', description:'Run sandboxed JavaScript for multi-step tasks. An async "api" object is available with methods: flyTo, setCamera, lookAt, zoomIn, zoomOut, getCamera, listLayers, setLayerVisible, focusLayer, addGeoJsonLayer, addTileLayer, add3dTilesLayer, removeLayer, searchLocation, listCameraPresets, flyToPreset, listBasemaps, setBasemap, setTerrain, setShadow, setDepthTest, setGeojsonDrape, setBackground, captureView, flyToFeature, showFeatureAttributes, playFlyPath, stopFly, createFlyPath, deleteFlyPath, listFlyPaths, openStreetView, openUrl, getShareUrl, flyToUrl, flyToCurrentLocation, showPanel, showInfo, listLegends, getInspectorText, applyInspectorText. Each takes one args object and returns a promise. fetch() is also available. Use return to produce a result.', parameters:{ type:'OBJECT', properties:{ code:{type:'STRING', description:'async function body; use await api.xxx(...)'} }, required:['code'] } }
  ] }];

  var API_METHODS = ['flyTo','getCamera','listLayers','setLayerVisible','focusLayer','addGeoJsonLayer','addTileLayer','add3dTilesLayer','removeLayer','listCameraPresets','flyToPreset','listBasemaps','setBasemap','setTerrain','setShadow','captureView','flyToFeature','playFlyPath','stopFly','openStreetView','getShareUrl','setCamera','lookAt','zoomIn','zoomOut','openUrl','createFlyPath','deleteFlyPath','listFlyPaths','showPanel','showInfo','listLegends','showFeatureAttributes','getInspectorText','applyInspectorText','setDepthTest','setGeojsonDrape','setBackground'];

  var SYSTEM_INSTRUCTION = [
    'You are an AI assistant embedded inside a Re:Earth 3D GIS map viewer (geo_suite plugin).',
    'You control the map through tools. Units: lat/lng in degrees (WGS84), height in meters, heading/pitch in degrees (pitch -90 = straight down, 0 = horizon).',
    'To go to a named place, first call searchLocation to geocode, then flyTo the returned lat/lng.',
    'Layers and basemaps must be referenced by the names returned from listLayers/listBasemaps/listCameraPresets/listFlyPaths — call those first if unsure of exact names.',
    'For multi-step or data-processing tasks, prefer runCode.',
    'Keep answers concise and respond in the same language as the user. Never claim an action succeeded when a tool returned an error.'
  ].join(' ');

  // ---------- state ----------
  var msgsEl = document.getElementById('ai-msgs');
  var inputEl = document.getElementById('ai-input');
  var sendBtn = document.getElementById('ai-send');
  var form = document.getElementById('ai-form');
  var settingsPanel = document.getElementById('ai-settings');
  var keyInput = document.getElementById('ai-key');
  var modelInput = document.getElementById('ai-model');
  var keyStatus = document.getElementById('ai-key-status');
  var saveMsg = document.getElementById('ai-save-msg');

  var _apiKey = '';
  var _model = 'gemini-3.1-flash-lite';
  var _keySource = 'none';
  var _history = [];
  var _reqSeq = 0;
  var _pendingTools = {};
  var _busy = false;

  function postToParent(m) {
    try { if (window.parent) window.parent.postMessage(m, '*'); } catch (e) {}
  }

  function addMsg(cls, text) {
    var d = document.createElement('div');
    d.className = 'ai-msg ' + cls;
    // Linkify URLs in bot messages so openUrl/share results stay clickable
    // even when the browser blocks popup opens.
    if (cls === 'bot' && typeof text === 'string' && text.indexOf('http') >= 0) {
      var parts = text.split(/(https?:\\/\\/[^\\s<>"')]+)/g);
      parts.forEach(function(part) {
        if (/^https?:\\/\\//.test(part)) {
          var a = document.createElement('a');
          a.href = part;
          a.target = '_top';
          a.rel = 'noopener noreferrer';
          a.textContent = part.length > 60 ? part.slice(0, 57) + '...' : part;
          a.style.color = '#3b7bd4';
          a.style.wordBreak = 'break-all';
          d.appendChild(a);
        } else if (part) {
          d.appendChild(document.createTextNode(part));
        }
      });
    } else {
      d.textContent = text;
    }
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }

  function addCapture(dataUrl) {
    var d = document.createElement('div');
    d.className = 'ai-msg bot';
    var img = document.createElement('img');
    img.src = dataUrl;
    d.appendChild(img);
    msgsEl.appendChild(d);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function updateKeyStatus() {
    try {
      keyStatus.textContent = _apiKey ? t('keySet') : t('noKeySet');
      keyStatus.className = 'ai-key-status' + (_apiKey ? ' ok' : '');
    } catch (e) {}
  }

  // ---------- tool execution ----------
  function callHostTool(name, args) {
    return new Promise(function(resolve) {
      var reqId = 't' + (++_reqSeq);
      var done = false;
      var timer = setTimeout(function() {
        if (done) return; done = true;
        delete _pendingTools[reqId];
        resolve({ error: t('timeout') });
      }, 40000);
      _pendingTools[reqId] = function(result) {
        if (done) return; done = true;
        clearTimeout(timer);
        resolve(result);
      };
      postToParent({ action: 'aiToolCall', reqId: reqId, name: name, args: args || {} });
    });
  }

  function toolSearchGsi(args) {
    var q = String((args && args.query) || '').trim();
    var limit = Math.max(1, Math.min(10, Number(args && args.limit) || 5));
    if (!q) return Promise.resolve({ error: 'query required' });
    var url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q);
    return fetch(url).then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function(data) {
      var src = Array.isArray(data) ? data : ((data && (data.features || data.results)) || []);
      var out = src.slice(0, limit).map(function(f) {
        var props = (f && f.properties) || {};
        var geom = (f && f.geometry) || {};
        var coords = geom.coordinates || null;
        return {
          name: f.name || props.title || props.name || '',
          address: props.address || props.title || '',
          lng: (coords && typeof coords[0] === 'number') ? coords[0] : null,
          lat: (coords && typeof coords[1] === 'number') ? coords[1] : null
        };
      }).filter(function(it) { return it.lat !== null && it.lng !== null; });
      return { results: out };
    }).catch(function(e) {
      return { error: 'search failed: ' + String(e && e.message || e) };
    });
  }

  function toolSearchYahoo(args) {
    var q = String((args && args.query) || '').trim();
    var limit = Math.max(1, Math.min(10, Number(args && args.limit) || 5));
    if (!q) return Promise.resolve({ error: 'query required' });
    // Same proxy as the Search tab: uses the server-side key when available,
    // otherwise falls back to the inspector-provided yahooAppId.
    return fetch('https://re-earth-geo-suite.vercel.app/api/yahoo-env').then(function(envRes) {
      return (envRes && envRes.ok) ? envRes.json() : {};
    }).catch(function() { return {}; }).then(function(envJson) {
      var serverHasAppId = !!(envJson && envJson.hasAppId);
      var rawId = String(window._yahooAppId || '').trim().replace(/^"+|"+$/g, '');
      var inspectorAppId = (rawId.length > 0 && !/^(YOUR_APP_ID|undefined|null)$/i.test(rawId) && !/あなた/.test(rawId)) ? rawId : null;
      if (!serverHasAppId && !inspectorAppId) return { error: 'yahooAppId not set (inspector) and no server key' };
      var url = 'https://re-earth-geo-suite.vercel.app/api/yahoo-search?query=' + encodeURIComponent(q) + (serverHasAppId ? '' : ('&appid=' + encodeURIComponent(inspectorAppId || '')));
      return fetch(url).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function(data) {
        var features = (data && data.Feature) ? data.Feature : [];
        var out = features.slice(0, limit).map(function(f) {
          var coords = (f && f.Geometry && f.Geometry.Coordinates) ? String(f.Geometry.Coordinates).split(',') : null;
          var lng = coords && coords.length > 0 ? Number(coords[0]) : null;
          var lat = coords && coords.length > 1 ? Number(coords[1]) : null;
          return {
            name: (f && (f.Name || f.name) || (f && f.Property && f.Property.Title) || ''),
            address: (f && f.Property && f.Property.Address) || '',
            lng: (typeof lng === 'number' && isFinite(lng)) ? lng : null,
            lat: (typeof lat === 'number' && isFinite(lat)) ? lat : null
          };
        }).filter(function(it) { return it.lat !== null && it.lng !== null; });
        return { results: out, provider: 'yahoo' };
      }).catch(function(e) {
        return { error: 'yahoo search failed: ' + String(e && e.message || e) };
      });
    });
  }

  function toolSearchLocation(args) {
    var provider = String((args && args.provider) || 'gsi').toLowerCase();
    if (provider === 'yahoo') return toolSearchYahoo(args);
    if (provider === 'auto') {
      return toolSearchYahoo(args).then(function(r) {
        return (r && r.results && r.results.length) ? r : toolSearchGsi(args);
      });
    }
    return toolSearchGsi(args);
  }

  function toolFlyToCurrentLocation() {
    return new Promise(function(resolve) {
      if (!navigator.geolocation) { resolve({ error: 'geolocation unavailable in this context' }); return; }
      navigator.geolocation.getCurrentPosition(function(pos) {
        callHostTool('flyTo', { lat: pos.coords.latitude, lng: pos.coords.longitude, height: 2000 }).then(function(r) {
          if (r && !r.error) r.accuracy = pos.coords.accuracy;
          resolve(r);
        });
      }, function(err) {
        resolve({ error: 'geolocation failed: ' + String(err && err.message || err) });
      }, { timeout: 10000, enableHighAccuracy: false });
    });
  }

  function toolFlyToUrl(args) {
    var raw = String((args && args.url) || '').trim();
    if (!raw) return Promise.resolve({ error: 'url required' });
    var q = raw.indexOf('?') >= 0 ? raw.slice(raw.indexOf('?')) : raw;
    var m = {};
    try { q.replace(/[?&#]([a-zA-Z_][a-zA-Z0-9_]*)=([^&#]*)/g, function(_, k, v) { try { m[k.toLowerCase()] = decodeURIComponent(v); } catch (e) { m[k.toLowerCase()] = v; } return ''; }); } catch (e) {}
    var lat = parseFloat(m.lat);
    var lng = parseFloat(m.lng !== undefined ? m.lng : m.lon);
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve({ error: 'no lat/lng found in url' });
    var fargs = { lat: lat, lng: lng };
    ['height', 'heading', 'pitch'].forEach(function(k) {
      var v = parseFloat(m[k]);
      if (isFinite(v)) fargs[k] = v;
    });
    return callHostTool('flyTo', fargs);
  }

  function makeApi() {
    var api = {};
    API_METHODS.forEach(function(n) {
      api[n] = function(args) { return callHostTool(n, args || {}); };
    });
    api.searchLocation = function(a) { return toolSearchLocation(typeof a === 'string' ? { query: a } : a); };
    api.flyToUrl = function(a) { return toolFlyToUrl(typeof a === 'string' ? { url: a } : a); };
    api.flyToCurrentLocation = function() { return toolFlyToCurrentLocation(); };
    return api;
  }

  function toolRunCode(args) {
    return new Promise(function(resolve) {
      var code = String((args && args.code) || '');
      var done = false;
      var timer = setTimeout(function() {
        if (done) return; done = true;
        resolve({ error: 'runCode timeout (20s)' });
      }, 20000);
      try {
        var fn = new Function('api', 'fetch', '"use strict"; return (async function(){ ' + code + ' })();');
        Promise.resolve(fn(makeApi(), fetch.bind(window))).then(function(v) {
          if (done) return; done = true;
          clearTimeout(timer);
          resolve({ result: v === undefined ? null : v });
        }).catch(function(e) {
          if (done) return; done = true;
          clearTimeout(timer);
          resolve({ error: String(e && e.message || e) });
        });
      } catch (e) {
        if (done) return; done = true;
        clearTimeout(timer);
        resolve({ error: String(e && e.message || e) });
      }
    });
  }

  function executeTool(name, args) {
    if (name === 'searchLocation') return toolSearchLocation(args);
    if (name === 'flyToUrl') return toolFlyToUrl(args);
    if (name === 'flyToCurrentLocation') return toolFlyToCurrentLocation();
    if (name === 'runCode') return toolRunCode(args);
    return callHostTool(name, args);
  }

  // ---------- Gemini loop ----------
  function trimHistory() {
    // Keep the conversation bounded; drop oldest turns (never leave a dangling
    // functionCall/functionResponse pair at the cut boundary is best-effort).
    var MAX = 40;
    while (_history.length > MAX) _history.shift();
  }

  function callGemini() {
    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(_model) + ':generateContent?key=' + encodeURIComponent(_apiKey);
    var maxSteps = 8;
    var step = 0;
    function next() {
      trimHistory();
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents: _history,
          tools: TOOL_DECLS
        })
      }).then(function(res) {
        return res.json().then(function(data) {
          if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
          return data;
        });
      }).then(function(data) {
        var parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        _history.push({ role: 'model', parts: parts });
        var calls = parts.filter(function(p) { return p && p.functionCall; });
        if (!calls.length) {
          var text = parts.map(function(p) { return (p && p.text) || ''; }).join('').trim();
          return { done: true, text: text };
        }
        if (++step > maxSteps) {
          return { done: true, text: t('stepLimit') };
        }
        var responseParts = [];
        var chain = Promise.resolve();
        calls.forEach(function(part) {
          chain = chain.then(function() {
            var fc = part.functionCall;
            var fname = fc.name;
            var fargs = fc.args || {};
            addMsg('tool', t('tool') + ': ' + fname + ' ' + JSON.stringify(fargs).slice(0, 120));
            return executeTool(fname, fargs).then(function(result) {
              if (fname === 'captureView' && result && result.dataUrl) addCapture(result.dataUrl);
              responseParts.push({ functionResponse: { name: fname, response: { result: result } } });
            });
          });
        });
        return chain.then(function() {
          _history.push({ role: 'user', parts: responseParts });
          return next();
        });
      });
    }
    return next();
  }

  function submit(text) {
    if (_busy) return;
    _history.push({ role: 'user', parts: [{ text: text }] });
    _busy = true;
    sendBtn.disabled = true;
    var thinking = addMsg('sys', '…');
    callGemini().then(function(res) {
      try { thinking.remove(); } catch (e) {}
      addMsg('bot', (res && res.text) ? res.text : t('noResponse'));
    }).catch(function(e) {
      try { thinking.remove(); } catch (e2) {}
      addMsg('bot', t('err') + ': ' + String(e && e.message || e));
    }).then(function() {
      _busy = false;
      sendBtn.disabled = false;
      try { inputEl.focus(); } catch (e) {}
    });
  }

  function doSend() {
    var text = (inputEl.value || '').trim();
    if (!text) return;
    inputEl.value = '';
    addMsg('user', text);
    if (!_apiKey) { addMsg('sys', t('noKey')); return; }
    submit(text);
  }
  form.addEventListener('submit', function(ev) { ev.preventDefault(); });
  sendBtn.addEventListener('click', function() { doSend(); });
  inputEl.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); doSend(); }
  });

  document.getElementById('ai-settings-btn').addEventListener('click', function() {
    settingsPanel.classList.toggle('open');
  });
  document.getElementById('ai-clear-btn').addEventListener('click', function() {
    _history = [];
    msgsEl.innerHTML = '';
    addMsg('sys', t('cleared'));
  });
  document.getElementById('ai-min-btn').addEventListener('click', function() {
    var root = document.querySelector('.ai-wrap');
    var minimized = root.classList.toggle('minimized');
    this.setAttribute('data-i18n-title', minimized ? 'restore' : 'minimize');
    this.title = t(minimized ? 'restore' : 'minimize');
  });
  document.getElementById('ai-save').addEventListener('click', function(ev) {
    ev.preventDefault();
    var k = (keyInput.value || '').trim();
    postToParent({ action: 'aiSetApiKey', key: k });
    var m = (modelInput.value || '').trim();
    if (m && m !== _model) postToParent({ action: 'aiSetModel', model: m });
    saveMsg.textContent = t('saved');
    setTimeout(function() { saveMsg.textContent = ''; }, 2000);
  });

  window.addEventListener('message', function(e) {
    try {
      var msg = e && e.data;
      if (!msg || !msg.action) return;
      if (msg.action === 'aiToolResult') {
        var p = _pendingTools[msg.reqId];
        if (p) { delete _pendingTools[msg.reqId]; p(msg.result); }
      } else if (msg.action === 'aiConfig') {
        _apiKey = (typeof msg.apiKey === 'string') ? msg.apiKey : '';
        _keySource = msg.keySource || 'none';
        if (typeof msg.model === 'string' && msg.model) _model = msg.model;
        window._yahooAppId = (typeof msg.yahooAppId === 'string') ? msg.yahooAppId : '';
        if (_keySource !== 'inspector') keyInput.value = _apiKey;
        modelInput.value = _model;
        updateKeyStatus();
        if (msg.lang) {
          window._GEO_LANG_CONF = String(msg.lang);
          var nl = resolveLang();
          if (nl !== GEO_LANG) { GEO_LANG = nl; applyI18n(); updateKeyStatus(); }
        }
      } else if (msg.action === 'lang') {
        window._GEO_LANG_CONF = String(msg.lang || 'auto');
        var nl2 = resolveLang();
        if (nl2 !== GEO_LANG) { GEO_LANG = nl2; applyI18n(); updateKeyStatus(); }
      }
    } catch (e) {}
  });

  // init
  addMsg('sys', t('welcome'));
  updateKeyStatus();
  postToParent({ action: 'aiGetConfig' });
  setTimeout(function() { postToParent({ action: 'aiGetConfig' }); }, 3000);
})();
</script>
`;

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.show === 'function') {
    reearth.ui.show(html, { width: 320, visible: true, extended: true });
  }
} catch (e) {}
