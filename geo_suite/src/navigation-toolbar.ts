// Navigation Toolbar Plugin (TypeScript)
// @ts-nocheck
declare const reearth: any;

const styles = `
  .reearth-nav-toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: transparent;
    padding: 0;
    font-family: sans-serif;
    color: #333;
    user-select: none;
  }
  .reearth-nav-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 4px;
    background: #fff;
    color: #333;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    transition: background 0.2s;
  }
  .reearth-nav-btn:hover { background: #f0f0f0; }
  .reearth-nav-btn:active { background: #e0e0e0; }
  .reearth-nav-compass { font-weight: bold; color: #d32f2f; transform-origin: center; transition: transform 0.1s linear; }
  .reearth-mode-select { width: 32px; height: 32px; border: none; border-radius: 4px; background: #fff; color: #333; font-size: 10px; font-weight: bold; cursor: pointer; text-align: center; padding: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
`;

const html = `
  <style>${styles}</style>
  <div class="reearth-nav-toolbar">
    <button class="reearth-nav-btn" id="btn-compass" title="Reset North">
      <div class="reearth-nav-compass" id="icon-compass">N</div>
    </button>
    <button class="reearth-nav-btn" id="btn-zoom-in" title="Zoom In"><span>+</span></button>
    <button class="reearth-nav-btn" id="btn-zoom-out" title="Zoom Out"><span>-</span></button>
    <button class="reearth-nav-btn" id="btn-home" title="Go Home"><span>🏠</span></button>
    <button class="reearth-nav-btn" id="btn-mode" title="Toggle 2D/3D"><span id="mode-text">3D</span></button>
  </div>
  <script>
    function send(action, payload) { parent.postMessage({ action, payload }, "*"); }
    window.addEventListener("message", function(e) {
      if (e.source !== parent) return;
      if (e.data.type === "cameraUpdate") updateCompass(e.data.payload.heading);
      if (e.data.type === "sceneModeUpdate") updateModeDisplay(e.data.payload.mode);
    });
    const compassIcon = document.getElementById('icon-compass');
    document.getElementById('btn-compass').addEventListener('click', function() { send('setCamera', { heading: 0, pitch: -90, roll: 0 }); });
    function updateCompass(headingRadians) { if (typeof headingRadians !== 'number') return; const deg = headingRadians * (180 / Math.PI); compassIcon.style.transform = "rotate(" + (-deg) + "deg)"; }
    document.getElementById('btn-zoom-in').addEventListener('click', function() { send('zoom', { amount: 0.5 }); });
    document.getElementById('btn-zoom-out').addEventListener('click', function() { send('zoom', { amount: 2.0 }); });
    document.getElementById('btn-home').addEventListener('click', function() { send('flyHome'); });
    const modeBtn = document.getElementById('btn-mode'); const modeText = document.getElementById('mode-text'); let currentMode = '3d'; const modes = ['3d','2d','columbus'];
    modeBtn.addEventListener('click', function() { const currentIndex = modes.indexOf(currentMode); const nextIndex = (currentIndex + 1) % modes.length; const nextMode = modes[nextIndex]; send('setSceneMode', { mode: nextMode }); });
    function updateModeDisplay(mode) { currentMode = mode; let label = '3D'; if (mode === '2d') label = '2D'; if (mode === 'columbus') label = '2.5D'; modeText.textContent = label; }
  </script>
`;

// --- Plugin runtime logic (host side) ---
// Helper: robust post to UI (try reearth.ui.postMessage, fall back to parent.postMessage)
function postToUI(msg: any) {
  try {
    if (reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') {
      reearth.ui.postMessage(msg);
      return;
    }
  } catch (e) {}
  try { if (typeof window !== 'undefined' && window.parent && typeof window.parent.postMessage === 'function') window.parent.postMessage(msg, '*'); } catch (e) {}
}

try {
  // Send initial camera heading if available
  const postHeading = (heading: number | undefined) => {
    postToUI({ type: 'cameraUpdate', payload: { heading } });
  };

  // Prefer camera.on if available
  if (reearth && reearth.camera && typeof reearth.camera.on === 'function') {
    try {
      reearth.camera.on(() => {
        try {
          const heading = reearth.camera && reearth.camera.position && reearth.camera.position.heading;
          postHeading(heading);
        } catch (e) {}
      });
      console.log('NavToolbar: camera.on registered');
    } catch (e) { console.error('NavToolbar: camera.on registration failed', e); }
  } else {
    // fallback: use viewer/update loop
    const onUpdate = () => { if (reearth.camera && reearth.camera.position) postHeading(reearth.camera.position.heading); };
    if (reearth.viewer && reearth.viewer.on) reearth.viewer.on('update', onUpdate);
    else if (reearth.on) reearth.on('update', onUpdate);
  }

  // Message handler from UI
  const onMessage = (msg: any) => {
    if (!reearth.camera) return;
    if (msg.action === 'setCamera') {
      reearth.camera.flyTo({ heading: msg.payload.heading, pitch: msg.payload.pitch, roll: msg.payload.roll }, { duration: 1 });
    }
    if (msg.action === 'flyHome') {
      reearth.camera.flyTo({ lat: 35.68, lng: 139.76, height: 20000000, heading: 0, pitch: -90, roll: 0 }, { duration: 2 });
    }
    if (msg.action === 'zoom') {
      if (reearth.camera.position && typeof reearth.camera.position.height === 'number') {
        const currentHeight = reearth.camera.position.height;
        let newHeight = currentHeight;
        if (msg.payload.amount < 1) newHeight = currentHeight * 0.5; else newHeight = currentHeight * 2.0;
        reearth.camera.flyTo({ height: newHeight }, { duration: 0.5 });
      }
    }
    if (msg.action === 'setSceneMode') {
      if (reearth.viewer && reearth.viewer.overrideProperty) {
        reearth.viewer.overrideProperty({ scene: { mode: msg.payload.mode } });
      }
      reearth.ui.postMessage({ type: 'sceneModeUpdate', payload: { mode: msg.payload.mode } });
    }
  };

  if (reearth && reearth.ui && typeof reearth.ui.on === 'function') reearth.ui.on('message', onMessage);
  else if (reearth.extension && typeof reearth.extension.on === 'function') reearth.extension.on('message', onMessage);
  else if (typeof reearth.on === 'function') reearth.on('message', onMessage);

  // Safe show helper (capture stack for debugging like layers-and-tiles-list.ts)
  function safeShowUI(context?: any) {
    try {
      try { console.log('[safeShowUI] context:', context); } catch (e) {}
      try { console.log('[safeShowUI] stack:', (new Error()).stack); } catch (e) {}
      if (reearth && reearth.ui && typeof reearth.ui.show === 'function') {
        try { reearth.ui.show(html, { width: 60, height: 240, visible: true, position: 'top-right' }); } catch (e) { console.error('[safeShowUI] show failed', e); }
      }
    } catch (e) { console.error('[safeShowUI] unexpected', e); }
  }

  // Show the UI
  safeShowUI('navigation-toolbar');
} catch (e) {
  console.error('NavToolbar: initialization failed', e);
}
