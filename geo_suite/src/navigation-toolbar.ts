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
    .status{font-size:10px;color:#333;margin-top:6px;text-align:center}
    button#syncBtn{margin-top:8px;font-size:11px;padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,0.06);background:linear-gradient(rgba(255,255,255,0.5), rgba(245,247,251,0.5));cursor:pointer}
  </style>
  <div style="width:100%;display:flex;justify-content:flex-end;padding:6px 4px 6px 6px;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
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
      </div>
      <button id="syncBtn">Sync</button>
      <div class="status"><div id="last">--</div></div>
    </div>
  </div>
  <script>
    (function(){
      var lastHeading = NaN;

      function setLastText(t){ try { var el = document.getElementById('last'); if(el) el.textContent = t; } catch(e){} }

      function updateCompass(headingRadians){
        try {
          if (typeof headingRadians !== 'number') return;
          var deg = headingRadians * (180/Math.PI);
          var wrap = document.getElementById('needleWrap');
          if (wrap) wrap.style.transform = 'rotate(' + (-deg) + 'deg)';
          lastHeading = headingRadians;
          setLastText('heading: ' + (deg.toFixed(1)) + '°');
        } catch (e) { }
      }

      // unify behavior: locally reset needle, update display, then notify host
      function doResetAndSend() {
        try {
          var wrap = document.getElementById('needleWrap');
          if (wrap) wrap.style.transform = 'rotate(0deg)';
          try { var last = document.getElementById('last'); if (last) last.textContent = 'heading: 0.0°'; } catch(_){ }
          if (typeof window.parent !== 'undefined' && window.parent && typeof window.parent.postMessage === 'function') {
            window.parent.postMessage({ action: 'setHeading', payload: { heading: 0 } }, '*');
          }
        } catch (e) { }
      }

      window.addEventListener('message', function(e){
        try{
          var d = e && e.data;
          if(!d) return;
          if(d.type === 'cameraUpdate') updateCompass(d.payload && d.payload.heading);
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
              var syncBtn = document.getElementById('syncBtn'); if(syncBtn) syncBtn.style.display = 'none';
              comp.style.width = '28px'; comp.style.height = '28px';
              var n = document.getElementById('nlabel'); if(n){ n.style.fontSize = '16px'; n.style.top = '50%'; }
            }catch(e){}
          }
          function restoreUI(){
            try{
              var wrap = document.getElementById('needleWrap'); if(wrap) wrap.style.display = '';
              var syncBtn = document.getElementById('syncBtn'); if(syncBtn) syncBtn.style.display = '';
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

      // Sync button: request host to send current camera state
      try{
        var sync = document.getElementById('syncBtn');
        if(sync){
          sync.addEventListener('click', function(){
            try{
              if (typeof window.parent !== 'undefined' && window.parent && typeof window.parent.postMessage === 'function') {
                window.parent.postMessage({ action: 'requestCamera' }, '*');
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

export const onMessage = (msg: any): void => {
  if (!msg || !msg.action) return;
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
    } catch (e) {}
  }
  if (msg.action === 'requestCamera') {
    try{
      const cur2 = (typeof reearth !== 'undefined' && reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
      const h = cur2 && typeof cur2.heading === 'number' ? cur2.heading : undefined;
      postToUI({ type: 'cameraUpdate', payload: { heading: h } });
    }catch(e){}
  }
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

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.show === 'function') {
    reearth.ui.show(html, { width: 120, height: 120, visible: true, position: 'top-right' });
  }
} catch (e) {}
