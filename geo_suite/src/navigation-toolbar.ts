// Navigation Toolbar Plugin (TypeScript)
// Derived from geo_suite/navigation-toolbar.js
// Minimal typing; exports the HTML and sets up host-side handlers.
declare const reearth: any;

export const html: string = `
  <style>
    html,body{margin:0;padding:0}
    .compass{width:64px;height:64px;display:flex;align-items:center;justify-content:center;position:relative;border-radius:50%;background:radial-gradient(circle at 30% 28%, rgba(255,255,255,0.5), rgba(246,249,255,0.5) 28%, rgba(233,242,255,0.5) 100%);box-shadow:0 8px 18px rgba(10,20,40,0.18);border:1px solid rgba(14,32,64,0.06);overflow:visible;transition:transform 180ms ease}
    .compass:hover{transform:scale(1.06)}
    .needle-wrap{position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;pointer-events:none;transition:transform 320ms cubic-bezier(.22,1,.36,1)}
    .needle-svg{width:20px;height:40px;position:absolute;left:0;top:0;transform:translate(-50%,-100%);pointer-events:none}
    .nlabel{position:absolute;top:25%;left:50%;transform:translate(-50%,-50%);font-weight:700;color:#222;font-size:21px;letter-spacing:0.4px;text-shadow:0 1px 0 rgba(255,255,255,0.6)}
    .cap{position:absolute;left:50%;top:34px;transform:translateX(-50%);width:8px;height:8px;border-radius:50%;background:linear-gradient(#fff,#f0f4fb);box-shadow:0 2px 4px rgba(2,8,23,0.25)}
    .gloss{position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(60% 40% at 30% 25%, rgba(255,255,255,0.5), rgba(255,255,255,0.06) 40%, transparent 60%)}
    /* status removed */
  </style>
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px 6px 6px;width:80px;box-sizing:border-box;margin:0 auto;">
    <div style="position:relative;display:flex;align-items:center;justify-content:center">
      <div class="compass" id="compass">
        <div id="needleWrap" class="needle-wrap">
          <svg id="needle" class="needle-svg" viewBox="0 0 24 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <polygon points="12,2 20,18 12,14 4,18" fill="#ff4d4d" />
            <rect x="10" y="16" width="4" height="24" fill="#c70000" rx="2" />
          </svg>
        </div>
        <div id="nlabel" class="nlabel">N</div>
      </div>
    </div>
    <button id="topDownBtn" style="margin-top:6px;font-size:11px;padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:linear-gradient(rgba(255,255,255,0.5), rgba(245,247,251,0.5));cursor:pointer">2D</button>
    
    <button id="rotateRightBtn" style="margin-top:6px;font-size:11px;padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:linear-gradient(rgba(255,255,255,0.5), rgba(245,247,251,0.5));cursor:pointer">↻</button>
  </div>
  <script>
    (function(){
      var lastHeading = NaN;

      function updateCompass(headingRadians){
        try {
          if (typeof headingRadians !== 'number') return;
          var deg = headingRadians * (180/Math.PI);
          var wrap = document.getElementById('needleWrap');
          if (wrap) wrap.style.transform = 'rotate(' + (-deg) + 'deg)';
          lastHeading = headingRadians;
        } catch (e) { }
      }

      

      // unify behavior: locally reset needle, update display, then notify host
      function doResetAndSend() {
        try {
          var wrap = document.getElementById('needleWrap');
          if (wrap) wrap.style.transform = 'rotate(0deg)';
          // status text removed
          if (typeof window.parent !== 'undefined' && window.parent && typeof window.parent.postMessage === 'function') {
            window.parent.postMessage({ action: 'setHeading', payload: { heading: 0 } }, '*');
          }
        } catch (e) { }
      }

      // ---------- external bridge client ----------
      // Lets a local harness (workbench/bridge_server.js via SSE, or the CDP
      // driver workbench/bridge.js via window.__geoBridge.call) invoke map
      // tools through this persistent iframe. Inert unless a harness endpoint
      // is configured ("bridge:" inspector line) or a local harness answers
      // the one-shot probe below — no effect on the map UI either way.
      var _bridge = { pending: {}, seq: 0, url: null, qs: '', es: null, off: false, probing: false };
      var BRIDGE_DEFAULT_URL = 'http://127.0.0.1:8977';
      function bridgePostParent(data) {
        try { if (window.parent && data) window.parent.postMessage(data, '*'); } catch(e) {}
      }
      function bridgeCallRaw(name, args) {
        return new Promise(function(resolve) {
          var reqId = 'b' + (++_bridge.seq) + '.' + Math.random().toString(36).slice(2, 8);
          var timer = setTimeout(function() {
            if (_bridge.pending[reqId]) { delete _bridge.pending[reqId]; resolve({ error: 'bridge timeout' }); }
          }, 90000);
          _bridge.pending[reqId] = function(result) { clearTimeout(timer); resolve(result); };
          bridgePostParent({ action: 'bridgeCall', reqId: reqId, name: name, args: args || {} });
        });
      }
      var _bridgeApi = (typeof Proxy === 'function') ? new Proxy({}, {
        get: function(t, n) { return function(a) { return bridgeInvoke(String(n), a || {}); }; }
      }) : {};
      function bridgeRunCode(args) {
        return new Promise(function(resolve) {
          var code = String((args && args.code) || '');
          var done = false;
          var fin = function(v) { if (!done) { done = true; resolve(v); } };
          setTimeout(function() { fin({ error: 'runCode timeout (30s)' }); }, 30000);
          try {
            var fn = new Function('api', 'fetch', '"use strict"; return (async function(){ ' + code + ' })();');
            Promise.resolve(fn(_bridgeApi, fetch.bind(window))).then(function(v) { fin({ result: v === undefined ? null : v }); }).catch(function(e) { fin({ error: String(e && e.message || e) }); });
          } catch (e) { fin({ error: String(e && e.message || e) }); }
        });
      }
      function bridgeInvoke(name, args) {
        if (name === 'runCode') return bridgeRunCode(args);
        return bridgeCallRaw(name, args);
      }
      function bridgePostResult(reqId, result) {
        try {
          if (!_bridge.url) return;
          // text/plain keeps this a CORS "simple request" (no preflight) —
          // the server parses the JSON body regardless of content type.
          fetch(_bridge.url + '/result' + _bridge.qs, {
            method: 'POST', headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ reqId: reqId, result: result })
          }).catch(function() {});
        } catch (e) {}
      }
      function bridgeConnect(url) {
        try {
          var u = String(url || '');
          var qi = u.indexOf('?');
          _bridge.qs = qi >= 0 ? u.substring(qi) : '';
          if (qi >= 0) u = u.substring(0, qi);
          while (u.charAt(u.length - 1) === '/') u = u.substring(0, u.length - 1);
          if (!u) return;
          _bridge.url = u;
          try { if (_bridge.es) _bridge.es.close(); } catch (e) {}
          _bridge.es = new EventSource(u + '/events' + _bridge.qs);
          _bridge.es.onmessage = function(ev) {
            try {
              var cmd = JSON.parse(ev.data);
              if (!cmd || !cmd.reqId) return;
              Promise.resolve(bridgeInvoke(String(cmd.name || ''), cmd.args || {})).then(function(res) {
                bridgePostResult(String(cmd.reqId), res);
              }).catch(function(e2) {
                bridgePostResult(String(cmd.reqId), { error: String(e2 && e2.message || e2) });
              });
            } catch (e) {}
          };
        } catch (e) {}
      }
      function bridgeDisconnect() {
        try { if (_bridge.es) _bridge.es.close(); } catch (e) {}
        _bridge.es = null; _bridge.url = null;
      }
      function bridgeProbe() {
        // One-shot probe of the default local endpoint. Silent when no harness
        // is running; a single failed fetch may show in DevTools console.
        if (_bridge.off || _bridge.es || _bridge.probing) return;
        _bridge.probing = true;
        fetch(BRIDGE_DEFAULT_URL + '/status').then(function(r) { return r.json(); }).then(function(j) {
          if (j && j.geosuiteBridge && !_bridge.off && !_bridge.es) bridgeConnect(BRIDGE_DEFAULT_URL);
        }).catch(function() {}).then(function() { _bridge.probing = false; });
      }
      function bridgeConfigure(url) {
        // 'off' disables; 'on' probes the default endpoint once; a URL connects
        // directly; '' (unset) stays fully inert — no probe, no traffic.
        if (url === 'off') { _bridge.off = true; bridgeDisconnect(); return; }
        if (!url) return;
        _bridge.off = false;
        if (url !== 'on') { bridgeConnect(url); return; }
        bridgeProbe();
      }
      // CDP/dev-driver entry point + diagnostics.
      window.__geoBridge = {
        call: bridgeInvoke,
        pending: _bridge.pending,
        configure: bridgeConfigure,
        status: function() { return { connected: !!_bridge.es, url: _bridge.url, off: _bridge.off }; }
      };
      try { bridgePostParent({ action: 'requestBridgeConfig' }); } catch (e) {}
      // No auto-probe: the bridge stays inert until enabled via the inspector
      // "bridge:" line or an explicit __geoBridge.configure() call (CDP).

      window.addEventListener('message', function(e){
        try{
          var d = e && e.data;
          if(!d) return;
          // external bridge: tool results + endpoint config
          if(d.action === 'bridgeResult') {
            try {
              var bp = _bridge.pending[String(d.reqId || '')];
              if (bp) { delete _bridge.pending[String(d.reqId || '')]; bp(d.result); }
            } catch (e2) {}
            return;
          }
          if(d.action === 'bridgeConfig') {
            try { bridgeConfigure(String(d.url || '')); } catch (e2) {}
            return;
          }
          // support cameraUpdate for compass needle + 2D label auto-reset
          if(d.type === 'cameraUpdate') {
            updateCompass(d.payload && d.payload.heading);
            var p = d.payload && d.payload.pitch;
            if (typeof p === 'number' && _viewMode2D && Date.now() > _pitchResetAfter) {
              var pDeg = Math.abs(p) <= Math.PI ? p * 180 / Math.PI : p;
              if (pDeg > -80) setTopDownLabel(false);
            }
          }
          // explicit view-mode confirmation from the host
          if(d.type === 'viewMode' && d.payload) setTopDownLabel(!!d.payload.is2D);
          // support updateCameraFields if it carries heading
          if(d.action === 'updateCameraFields' && d.camera && typeof d.camera.heading === 'number') {
            updateCompass(d.camera.heading);
          }
        }catch(err){ }
      });

      // Make compass clickable: locally reset then notify host (unified)
      try {
        var comp = document.getElementById('compass');
        if (comp) {
          comp.style.cursor = 'pointer';
          comp.addEventListener('click', function(){
            try { doResetAndSend(); } catch (e) { }
          });
          // double-click toggles minimized "N-only" view
          var _minimized = false;
          function minimizeUI(){
            try{
              var wrap = document.getElementById('needleWrap'); if(wrap) wrap.style.display = 'none';
              comp.style.width = '28px'; comp.style.height = '28px';
              var n = document.getElementById('nlabel'); if(n){ n.style.fontSize = '16px'; n.style.top = '50%'; }
            }catch(e){}
          }
          function restoreUI(){
            try{
              var wrap = document.getElementById('needleWrap'); if(wrap) wrap.style.display = '';
              comp.style.width = '64px'; comp.style.height = '64px';
              var n = document.getElementById('nlabel'); if(n){ n.style.fontSize = '21px'; n.style.top = '25%'; }
            }catch(e){}
          }
          comp.addEventListener('dblclick', function(ev){
            try{ ev.stopPropagation && ev.stopPropagation(); _minimized = !_minimized; if(_minimized) minimizeUI(); else restoreUI(); }catch(e){}
          });
        }
      } catch (e) { }

      // N label click: unified with compass click (local reset -> host)
      try {
        var nlabel = document.getElementById('nlabel');
        if (nlabel) {
          nlabel.style.cursor = 'pointer';
          nlabel.addEventListener('click', function(ev){
            try { ev.stopPropagation && ev.stopPropagation(); doResetAndSend(); } catch (e) { }
          });
        }
      } catch (e) { }

      // add decorative center cap/gloss
      try {
        var cap = document.createElement('div'); cap.className = 'cap';
        var gloss = document.createElement('div'); gloss.className = 'gloss';
        var compassEl = document.getElementById('compass');
        if (compassEl) {
          cap.style.left = '50%'; cap.style.top = '50%'; cap.style.transform = 'translate(-50%,-50%)';
          compassEl.appendChild(cap);
          compassEl.appendChild(gloss);
        }
      } catch (e) {}

      // 2D/3D toggle (kasugai top-down-button): "2D" flies to top-down and
      // remembers the pose, "3D" restores it. The label reverts to 2D on its
      // own when the user manually tilts away from top-down (see pitch check
      // in the cameraUpdate handler).
      var _viewMode2D = false;
      var _pitchResetAfter = 0; // grace period so the flyTo animation doesn't auto-reset the label
      function setTopDownLabel(is2D){
        try{
          _viewMode2D = !!is2D;
          var b = document.getElementById('topDownBtn');
          if (b) b.textContent = _viewMode2D ? '3D' : '2D';
        }catch(e){}
      }
      try{
        var topDown = document.getElementById('topDownBtn');
        if(topDown){
          topDown.addEventListener('click', function(){
            try{
              if (typeof window.parent === 'undefined' || !window.parent || typeof window.parent.postMessage !== 'function') return;
              if (_viewMode2D) {
                window.parent.postMessage({ action: 'restoreView' }, '*');
                setTopDownLabel(false);
                return;
              }
              try{
                var w = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 0;
                var h = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 0;
                var cx = Math.round(w/2);
                var cy = Math.round(h/2);
                window.parent.postMessage({ action: 'topDown', payload: { mode: 'screenCenter', screen: { x: cx, y: cy } } }, '*');
              }catch(e){
                window.parent.postMessage({ action: 'topDown', payload: { mode: 'screenCenter' } }, '*');
              }
              setTopDownLabel(true);
              _pitchResetAfter = Date.now() + 1500;
            }catch(e){}
          });
        }
      }catch(e){}
      
      
      // Rotate right button: request host to rotate camera by +45 degrees
      try{
        var rotateRight = document.getElementById('rotateRightBtn');
        if(rotateRight){
          rotateRight.addEventListener('click', function(){
            try{
              if (typeof window.parent !== 'undefined' && window.parent && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage({ action: 'rotateBy', payload: { delta: 45 } }, '*');
              }
            }catch(e){}
          });
        }
      }catch(e){}
      

      
    })();
  </script>
`;

export function postToUI(msg: any): void {
  try {
    if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') {
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
    if (typeof (globalThis as any).parent !== 'undefined' && (globalThis as any).parent && typeof (globalThis as any).parent.postMessage === 'function')
      (globalThis as any).parent.postMessage(msg, '*');
  } catch (e) {}
}

// Normalize a heading value (radians or degrees) to degrees in [0,360)
function normalizeHeadingDeg(h: any): number {
  try {
    if (typeof h !== 'number' || isNaN(h)) return 0;
    var deg = h;
    // If value looks like radians, convert to degrees
    if (Math.abs(h) <= 2 * Math.PI) {
      deg = h * 180 / Math.PI;
    }
    // Normalize to [0,360)
    deg = ((deg % 360) + 360) % 360;
    return deg;
  } catch (e) { return 0; }
}

// Compute intersection point at altitude 0 (mean sea level) from camera position and orientation.
// Uses a local ENU approximation (meters) — accurate for moderate distances.
function groundPointFromCamera(cameraPos: any): { lat: number, lng: number } | null {
  try {
    if (!cameraPos) return null;
    // Prefer platform API if available (accounts for terrain)
    try {
      if (typeof reearth !== 'undefined' && reearth && reearth.camera && typeof reearth.camera.getGlobeIntersection === 'function') {
        const inter = reearth.camera.getGlobeIntersection({ withTerrain: true });
        if (inter && inter.center && typeof inter.center.lat === 'number' && typeof inter.center.lng === 'number') {
          return { lat: inter.center.lat, lng: inter.center.lng };
        }
      }
    } catch (e) {}

    // Fallback: local ENU straight-line intersection with z=0 (legacy behavior)
    const lat0 = typeof cameraPos.lat === 'number' ? cameraPos.lat : undefined;
    const lng0 = typeof cameraPos.lng === 'number' ? cameraPos.lng : undefined;
    const h = typeof cameraPos.height === 'number' ? cameraPos.height : undefined;
    var heading = typeof cameraPos.heading === 'number' ? cameraPos.heading : 0;
    var pitch = typeof cameraPos.pitch === 'number' ? cameraPos.pitch : 0;
    var origHeading = heading;
    var origPitch = pitch;
    // Auto-detect degrees vs radians: convert if values look like degrees
    try {
      if (Math.abs(heading) > 2 * Math.PI) {
        heading = heading * Math.PI / 180;
      }
      if (Math.abs(pitch) > Math.PI) {
        pitch = pitch * Math.PI / 180;
      }
    } catch (e) {}
    if (lat0 === undefined || lng0 === undefined || h === undefined) return null;

    // Direction vector in local ENU coordinates
    const cosPitch = Math.cos(pitch);
    const dirE = Math.sin(heading) * cosPitch; // east component
    const dirN = Math.cos(heading) * cosPitch; // north component
    const dirU = Math.sin(pitch); // up component

    // If not looking downwards, no intersection with ground
    if (dirU >= 0) return null;

    // Guard against extremely small dirU (nearly horizontal)
    if (Math.abs(dirU) < 1e-6) return null;

    // Solve for t where z = 0: h + t*dirU = 0 => t = -h/dirU
    const t = -h / dirU;
    if (!isFinite(t) || t < 0) return null;

    // Cap maximum distance to avoid extreme far-field results
    const MAX_DISTANCE_METERS = 1e7; // 10,000 km
    if (t > MAX_DISTANCE_METERS) return null;

    const eastMeters = dirE * t;
    const northMeters = dirN * t;

    // Convert meter offsets to lat/lng deltas
    const latRad = lat0 * Math.PI / 180;
    const metersPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad) - 0.0023 * Math.cos(6 * latRad);
    const metersPerDegLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad) + 0.118 * Math.cos(5 * latRad);
    const dLat = northMeters / metersPerDegLat;
    const dLng = eastMeters / metersPerDegLon;

    const result = { lat: lat0 + dLat, lng: lng0 + dLng };
    try {
      postToUI({ type: 'groundDebug', payload: {
        input: { lat: lat0, lng: lng0, height: h, heading: origHeading, pitch: origPitch },
        converted: { headingRad: heading, pitchRad: pitch },
        dir: { E: dirE, N: dirN, U: dirU },
        t: t,
        meters: { east: eastMeters, north: northMeters },
        result: result
      } });
    } catch (e) {}

    return result;
  } catch (e) {
    return null;
  }
}

// ---------- external bridge relay ----------
// The external bridge client lives in this widget's persistent iframe. This
// extension context is intentionally used as the relay: it stays lightweight,
// unlike basemap-widget which shuttles large DuckDB/GPKG wasm payloads through
// the same QuickJS runtime and can die under memory pressure.
let _aiChatWidgetId: string | null = null;
let _navLayerPanelId: string | null = null;
// Last bridge endpoint forwarded from the layer panel ("bridge:" inspector line).
let _bridgeCfg: string = '';

function findWidgetIdByExt(extensionId: string): string | null {
  try {
    const list = (reearth && reearth.extension && reearth.extension.list) || [];
    const target = list.find((ex: any) => ex && ex.extensionId === extensionId);
    return target ? target.id : null;
  } catch (e) { return null; }
}

function bridgePostToExt(targetId: string | null, msg: any): boolean {
  try {
    if (targetId && reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, msg);
      return true;
    }
  } catch (e) {}
  return false;
}

// Measurement state managed on extension side

// Last rotate-button target heading in degrees (0,45,90,...), or null before first use
let _lastRotateTargetDeg: number | null = null;

// Camera pose saved before entering top-down, restored by the "3D" button
let _savedBefore2D: any = null;


export const onMessage = (msg: any): void => {
  (async () => {
    if (!msg || !msg.action) return;

    // External bridge: relay tool calls from this widget's iframe client to
    // the ai-chat extension, which owns the tool dispatcher. Results arrive
    // back as 'bridgeResult' extension messages.
    if (msg.action === 'bridgeCall') {
      try {
        const aiId = _aiChatWidgetId || findWidgetIdByExt('ai-chat');
        if (!aiId) {
          postToUI({ action: 'bridgeResult', reqId: msg.reqId, result: { error: 'ai-chat extension unavailable' } });
        } else {
          _aiChatWidgetId = aiId;
          const sent = bridgePostToExt(aiId, { action: 'bridgeCall', reqId: msg.reqId, name: msg.name, args: msg.args || {} });
          if (!sent) {
            _aiChatWidgetId = null;
            postToUI({ action: 'bridgeResult', reqId: msg.reqId, result: { error: 'ai-chat unreachable' } });
          }
        }
      } catch (e) {}
      return;
    }
    if (msg.action === 'requestBridgeConfig') {
      try {
        postToUI({ action: 'bridgeConfig', url: _bridgeCfg || '' });
        // Also pull fresh config from the layer panel (covers init races).
        const panelId = _navLayerPanelId || findWidgetIdByExt('layers-and-tiles-list');
        if (panelId) {
          _navLayerPanelId = panelId;
          bridgePostToExt(panelId, { action: 'requestBridgeConfig' });
        }
      } catch (e) {}
      return;
    }

    if (msg.action === 'setHeading') {
    try {
      const target: any = { heading: msg.payload && typeof msg.payload.heading === 'number' ? msg.payload.heading : 0 };
      const cur = (typeof reearth !== 'undefined' && reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
      if (cur) {
        if (typeof cur.pitch === 'number') target.pitch = cur.pitch;
        if (typeof cur.roll === 'number') target.roll = cur.roll;
        if (typeof cur.lat === 'number') target.lat = cur.lat;
        if (typeof cur.lng === 'number') target.lng = cur.lng;
        if (typeof cur.height === 'number') target.height = cur.height;
      }
      try { if (reearth && reearth.camera && typeof reearth.camera.flyTo === 'function') reearth.camera.flyTo(target, { duration: 0.8 }); } catch (e) {}
      try { postToUI({ type: 'cameraUpdate', payload: { heading: target.heading } }); } catch (e) {}
    } catch (e) {}
  }
  if (msg.action === 'topDown') {
    try {
      const cur3 = (typeof reearth !== 'undefined' && reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
      const target: any = {};
      if (!cur3 || typeof cur3.lat !== 'number' || typeof cur3.lng !== 'number') {
        try{ postToUI({ type: 'topDownResult', payload: { success: false, reason: 'no_camera_position' } }); }catch(e){}
        return;
      }
      // Compute ground intersection at altitude 0 from camera orientation; fallback to camera lat/lng if not available
      const ground = groundPointFromCamera(cur3);
      if (ground) {
        target.lat = ground.lat;
        target.lng = ground.lng;
      } else {
        target.lat = cur3.lat;
        target.lng = cur3.lng;
      }
      if (typeof cur3.height === 'number') target.height = cur3.height;
      if (typeof cur3.heading === 'number') target.heading = cur3.heading;
      // straight top-down: pitch to -90 degrees and reset roll
      try { target.pitch = -Math.PI / 2; } catch (e) { target.pitch = -1.5707963267948966; }
      try { target.roll = 0; } catch (e) { target.roll = 0; }
      // Remember the pose so the button can toggle back to 3D (kasugai 2D/3D toggle)
      try { _savedBefore2D = { lat: cur3.lat, lng: cur3.lng, height: cur3.height, heading: cur3.heading, pitch: cur3.pitch, roll: cur3.roll }; } catch (e) {}
      try { if (reearth && reearth.camera && typeof reearth.camera.flyTo === 'function') reearth.camera.flyTo(target, { duration: 0.8 }); } catch (e) {}
      try{ postToUI({ type: 'topDownResult', payload: { success: true, lat: target.lat, lng: target.lng } }); }catch(e){}
    } catch (e) {}
  }

  // Restore the pose saved before top-down (kasugai 2D→3D toggle).
  // No saved pose: fall back to a -30° oblique view of the same position.
  if (msg.action === 'restoreView') {
    try {
      const cur = (typeof reearth !== 'undefined' && reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
      let target: any = null;
      if (_savedBefore2D && typeof _savedBefore2D.lat === 'number' && typeof _savedBefore2D.lng === 'number') {
        target = _savedBefore2D;
      } else if (cur && typeof cur.lat === 'number' && typeof cur.lng === 'number') {
        target = { lat: cur.lat, lng: cur.lng, height: cur.height, heading: cur.heading, pitch: -30 * Math.PI / 180, roll: 0 };
      }
      _savedBefore2D = null;
      if (target) {
        try { if (reearth && reearth.camera && typeof reearth.camera.flyTo === 'function') reearth.camera.flyTo(target, { duration: 0.8 }); } catch (e) {}
      }
      try{ postToUI({ type: 'viewMode', payload: { is2D: false } }); }catch(e){}
    } catch (e) {}
  }

  // Rotate camera counterclockwise to the previous `stepDeg` multiple (...,90,45,0,315,...)
  if (msg.action === 'rotateBy') {
    try {
      const stepDeg = msg.payload && typeof msg.payload.delta === 'number' ? msg.payload.delta : 45;
      const cur = (typeof reearth !== 'undefined' && reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
      if (!cur) {
        try { postToUI({ type: 'rotateResult', payload: { success: false, reason: 'no_camera_position' } }); } catch (e) {}
        return;
      }
      const heading = typeof cur.heading === 'number' ? cur.heading : 0;
      const headingDeg = normalizeHeadingDeg(heading);

      // Step back through the target multiple sequence deterministically.
      // If the camera heading has diverged from the last target (user dragged the map),
      // re-derive the sequence from the actual heading; otherwise continue from the last target.
      let baseDeg = headingDeg;
      if (_lastRotateTargetDeg !== null && Math.abs(headingDeg - _lastRotateTargetDeg) < 1) {
        baseDeg = _lastRotateTargetDeg;
      }
      let nextDeg = Math.floor(baseDeg / stepDeg) * stepDeg;
      if (baseDeg - nextDeg < 1e-6) nextDeg -= stepDeg;
      const nextDegNorm = ((nextDeg % 360) + 360) % 360;
      _lastRotateTargetDeg = nextDegNorm;
      const newHeadingRad = nextDegNorm * Math.PI / 180;

      // Set an absolute heading via flyTo so each press reliably lands on 0/45/90/...
      const target: any = { heading: newHeadingRad };
      if (typeof cur.pitch === 'number') target.pitch = cur.pitch;
      if (typeof cur.roll === 'number') target.roll = cur.roll;
      if (typeof cur.lat === 'number') target.lat = cur.lat;
      if (typeof cur.lng === 'number') target.lng = cur.lng;
      if (typeof cur.height === 'number') target.height = cur.height;
      try { if (reearth && reearth.camera && typeof reearth.camera.flyTo === 'function') reearth.camera.flyTo(target, { duration: 0.5 }); } catch (e) {}
      try { postToUI({ type: 'cameraUpdate', payload: { heading: newHeadingRad } }); } catch (e) {}
      try { postToUI({ type: 'rotateResult', payload: { success: true, method: 'flyTo', heading: newHeadingRad, headingDeg: nextDegNorm } }); } catch (e) {}
    } catch (e) {}
    }
  })();
};

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('message', onMessage);
  } else if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.on === 'function') {
    reearth.ui.on('message', onMessage);
  } else if (typeof reearth !== 'undefined' && reearth && typeof reearth.on === 'function') {
    reearth.on('message', onMessage);
  }
} catch (e) {}

// Inter-extension messages for the bridge relay: tool results from the
// ai-chat dispatcher go down to the iframe; bridgeConfig from the layer
// panel is cached and forwarded.
try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('extensionMessage', (msg: any) => {
      try {
        const data = (msg && msg.data !== undefined) ? msg.data : msg;
        if (!data || !data.action) return;
        if (data.action === 'bridgeResult') {
          try { postToUI({ action: 'bridgeResult', reqId: data.reqId, result: data.result }); } catch (e) {}
        } else if (data.action === 'bridgeConfig') {
          _bridgeCfg = (typeof data.url === 'string') ? data.url : '';
          try { postToUI({ action: 'bridgeConfig', url: _bridgeCfg }); } catch (e) {}
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// Lightweight real-time compass updates: throttle by time and heading delta (no setTimeout/tick)
try {
  const getTime = () => (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
  const HEADING_EPS = 0.05;

  // Update while the camera is moving, but at most once per 300ms and only when heading visibly changed
  if (typeof reearth !== 'undefined' && reearth && reearth.camera && typeof reearth.camera.on === 'function') {
    let lastPost = 0;
    let lastHeading: number | null = null;
    reearth.camera.on('move', (camera: any) => {
      try {
        const h = (camera && typeof camera.heading === 'number') ? camera.heading : null;
        if (h === null) return;
        const now = getTime();
        if (now - lastPost < 300) return;
        if (lastHeading !== null && Math.abs(h - lastHeading) < HEADING_EPS) return;
        lastPost = now;
        lastHeading = h;
        postToUI({ type: 'cameraUpdate', payload: { heading: h, pitch: camera.pitch } });
      } catch (e) {}
    });
  }

  // Update at the end of a drag/click on the viewer, throttled to 50ms
  if (typeof reearth !== 'undefined' && reearth && reearth.viewer && typeof reearth.viewer.on === 'function') {
    let lastPost = 0;
    let lastHeading: number | null = null;
    reearth.viewer.on('mouseUp', () => {
      try {
        const cur = (reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
        const h = (cur && typeof cur.heading === 'number') ? cur.heading : null;
        if (h === null) return;
        const now = getTime();
        if (now - lastPost < 50) return;
        if (lastHeading !== null && Math.abs(h - lastHeading) < HEADING_EPS) return;
        lastPost = now;
        lastHeading = h;
        postToUI({ type: 'cameraUpdate', payload: { heading: h, pitch: cur.pitch } });
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.show === 'function') {
    reearth.ui.show(html, { width: 80, height: 120, visible: true, position: 'top-right' });
  }
} catch (e) {}
