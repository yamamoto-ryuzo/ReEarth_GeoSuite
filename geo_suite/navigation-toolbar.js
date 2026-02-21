"use strict";
// Navigation Toolbar Plugin for Re:Earth
// @ts-nocheck
// Debug log for reearth object structure
try {
    console.log("NavToolbar: Plugin script executing");
    console.log("NavToolbar: reearth available:", !!reearth);
    if (reearth) {
        console.log("NavToolbar: reearth keys:", Object.keys(reearth));
        if (reearth.extension)
            console.log("NavToolbar: reearth.extension keys:", Object.keys(reearth.extension));
        if (reearth.ui)
            console.log("NavToolbar: reearth.ui keys:", Object.keys(reearth.ui));
    }
}
catch (e) {
    console.error("NavToolbar: Failed to log reearth object", e);
}
const styles = `
  .reearth-nav-toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: rgba(255,255,255,0.95);
    padding: 8px;
    border-radius: 6px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    font-family: sans-serif;
    color: #333;
    user-select: none;
    border: 1px solid rgba(0,0,0,0.06);
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

  .reearth-nav-btn:hover {
    background: #f0f0f0;
  }

  .reearth-nav-btn:active {
    background: #e0e0e0;
  }
  
  .reearth-nav-compass {
    font-weight: bold;
    color: #d32f2f;
    transform-origin: center;
    transition: transform 0.1s linear;
  }
  
  .reearth-mode-select {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 4px;
    background: #fff;
    color: #333;
    font-size: 10px;
    font-weight: bold;
    cursor: pointer;
    text-align: center;
    padding: 0;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  }
`;
const html = `
  <style>${styles}</style>
  <div class="reearth-nav-toolbar">
    <!-- Compass -->
    <button class="reearth-nav-btn" id="btn-compass" title="Reset North">
      <div class="reearth-nav-compass" id="icon-compass">N</div>
    </button>
    
    <!-- Zoom In -->
    <button class="reearth-nav-btn" id="btn-zoom-in" title="Zoom In">
      <span>+</span>
    </button>
    
    <!-- Zoom Out -->
    <button class="reearth-nav-btn" id="btn-zoom-out" title="Zoom Out">
      <span>-</span>
    </button>
    
    <!-- Home -->
    <button class="reearth-nav-btn" id="btn-home" title="Go Home">
      <span>🏠</span>
    </button>
    
    <!-- Scene Mode -->
    <button class="reearth-nav-btn" id="btn-mode" title="Toggle 2D/3D">
        <span id="mode-text">3D</span>
    </button>
  </div>
  
  <script>
    (function(){
      try {
        console.log("NavToolbar: UI script loaded");
        function send(action, payload) { try { parent.postMessage({ action: action, payload: payload }, "*"); } catch(e) { console.warn('NavToolbar: parent.postMessage failed', e); } }

        window.addEventListener("message", function(e) {
          try {
            if (e.source !== parent) return;
            if (e.data.type === "cameraUpdate") updateCompass(e.data.payload.heading);
            if (e.data.type === "sceneModeUpdate") updateModeDisplay(e.data.payload.mode);
          } catch (e) {}
        });

        document.addEventListener('DOMContentLoaded', function(){
          try {
            const compassIcon = document.getElementById('icon-compass');
            const btnCompass = document.getElementById('btn-compass');
            const btnZoomIn = document.getElementById('btn-zoom-in');
            const btnZoomOut = document.getElementById('btn-zoom-out');
            const btnHome = document.getElementById('btn-home');
            const modeBtn = document.getElementById('btn-mode');
            const modeText = document.getElementById('mode-text');
            if (btnCompass) btnCompass.addEventListener('click', function() { send('setCamera', { heading: 0, pitch: -90, roll: 0 }); });
            if (btnZoomIn) btnZoomIn.addEventListener('click', function() { send('zoom', { amount: 0.5 }); });
            if (btnZoomOut) btnZoomOut.addEventListener('click', function() { send('zoom', { amount: 2.0 }); });
            if (btnHome) btnHome.addEventListener('click', function() { send('flyHome'); });

            let currentMode = '3d';
            const modes = ['3d','2d','columbus'];
            if (modeBtn) modeBtn.addEventListener('click', function() { const currentIndex = modes.indexOf(currentMode); const nextIndex = (currentIndex + 1) % modes.length; const nextMode = modes[nextIndex]; send('setSceneMode', { mode: nextMode }); });
            function updateModeDisplay(mode) { currentMode = mode; let label = '3D'; if (mode === '2d') label = '2D'; if (mode === 'columbus') label = '2.5D'; if (modeText) modeText.textContent = label; }
            window.updateModeDisplay = updateModeDisplay; // expose for message handler safety

            function updateCompass(headingRadians) { if (typeof headingRadians !== 'number' || !compassIcon) return; const deg = headingRadians * (180 / Math.PI); compassIcon.style.transform = "rotate(" + (-deg) + "deg)"; }
            window.updateCompass = updateCompass;
          } catch (e) { console.error('NavToolbar: UI init failed', e); }
        });
      } catch (e) { console.error('NavToolbar: UI script wrapper error', e); }
    })();
  </script>
`;
// Plugin Logic
// Camera listener: prefer reearth.camera.on if available, otherwise fallback to update loop
if (reearth && reearth.camera && typeof reearth.camera.on === 'function') {
  try {
    reearth.camera.on(function() {
      try {
        const heading = reearth.camera && reearth.camera.position && reearth.camera.position.heading;
        reearth.ui.postMessage({
          type: 'cameraUpdate',
          payload: { heading }
        });
      }
      catch (e) {
        // swallow per-frame errors
      }
    });
    console.log("NavToolbar: Registered camera.on listener");
  }
  catch (e) {
    console.error("NavToolbar: Failed to register camera.on", e);
  }
}
else {
  // fallback update loop
  const onUpdate = () => {
    if (reearth.camera && reearth.camera.position) {
      reearth.ui.postMessage({
        type: 'cameraUpdate',
        payload: {
          heading: reearth.camera.position.heading
        }
      });
    }
  };
  if (reearth.viewer && reearth.viewer.on) {
    reearth.viewer.on('update', onUpdate);
  }
  else if (reearth.on) {
    reearth.on('update', onUpdate);
  }
}
// Message Handler
const onMessage = (msg) => {
    console.log("NavToolbar: Received message", msg);
    if (!reearth.camera) {
        console.error("NavToolbar: reearth.camera is not available");
        return;
    }
    if (msg.action === 'setCamera') {
        reearth.camera.flyTo({
            heading: msg.payload.heading,
            pitch: msg.payload.pitch,
            roll: msg.payload.roll
        }, { duration: 1 });
    }
    if (msg.action === 'flyHome') {
        reearth.camera.flyTo({
            lat: 35.68, lng: 139.76, height: 20000000, heading: 0, pitch: -90, roll: 0
        }, { duration: 2 });
    }
    if (msg.action === 'zoom') {
        if (reearth.camera.position && typeof reearth.camera.position.height === 'number') {
            const currentHeight = reearth.camera.position.height;
            let newHeight = currentHeight;
            if (msg.payload.amount < 1) {
                // Zoom In
                newHeight = currentHeight * 0.5;
            }
            else {
                // Zoom Out
                newHeight = currentHeight * 2.0;
            }
            reearth.camera.flyTo({
                height: newHeight
            }, { duration: 0.5 });
        }
    }
    if (msg.action === 'setSceneMode') {
        console.log("NavToolbar: Switching mode to " + msg.payload.mode);
        // Attempt to switch scene mode via overrideProperty
        // Note: ReEarth Visualizer might currently only support '3d' in its types, 
        // but passing '2d' or 'columbus' might work if mapped to Cesium underneath.
        if (reearth.viewer && reearth.viewer.overrideProperty) {
            reearth.viewer.overrideProperty({
                scene: {
                    mode: msg.payload.mode // '2d', '3d', or 'columbus'
                }
            });
        }
        reearth.ui.postMessage({
            type: 'sceneModeUpdate',
            payload: { mode: msg.payload.mode }
        });
    }
};
// Register Event Listeners
try {
    if (reearth.extension && typeof reearth.extension.on === 'function') {
        reearth.extension.on('message', onMessage);
        console.log("NavToolbar: Registered message listener via reearth.extension.on");
    }
    else if (reearth.ui && typeof reearth.ui.on === 'function') {
        reearth.ui.on('message', onMessage);
        console.log("NavToolbar: Registered message listener via reearth.ui.on");
    }
    else if (typeof reearth.on === 'function') {
        reearth.on('message', onMessage);
        console.log("NavToolbar: Registered message listener via reearth.on");
    }
    else {
        console.error("NavToolbar: No suitable 'on' method found for message listener");
    }
}
catch (e) {
    console.error("NavToolbar: Failed to register message listener", e);
}
// Show UI
try {
    // Show the widget UI
    reearth.ui.show(html, { width: 60, height: 240, visible: true });
}
catch (e) {
    console.error("NavToolbar: Failed to show UI", e);
}
