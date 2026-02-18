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
    console.log("NavToolbar: UI script loaded");

    // Communication with Parent
    function send(action, payload) {
      console.log("NavToolbar: Sending " + action, payload);
      parent.postMessage({ action: action, payload: payload }, "*");
    }

    window.addEventListener("message", function(e) {
      if (e.source !== parent) return;
      if (e.data.type === "cameraUpdate") {
        updateCompass(e.data.payload.heading);
      }
      if (e.data.type === "sceneModeUpdate") {
        updateModeDisplay(e.data.payload.mode);
      }
    });

    // Compass
    const compassIcon = document.getElementById('icon-compass');
    document.getElementById('btn-compass').addEventListener('click', function() {
      send('setCamera', { heading: 0, pitch: -90, roll: 0 });
    });
    
    function updateCompass(headingRadians) {
       if (typeof headingRadians !== 'number') return;
       const deg = headingRadians * (180 / Math.PI);
       // Use string concatenation to avoid template literal nesting issues
       compassIcon.style.transform = "rotate(" + (-deg) + "deg)";
    }

    // Zoom
    document.getElementById('btn-zoom-in').addEventListener('click', function() {
      send('zoom', { amount: 0.5 });
    });
    
    document.getElementById('btn-zoom-out').addEventListener('click', function() {
      send('zoom', { amount: 2.0 });
    });
    
    // Home
    document.getElementById('btn-home').addEventListener('click', function() {
      send('flyHome');
    });

    // Mode
    const modeBtn = document.getElementById('btn-mode');
    const modeText = document.getElementById('mode-text');
    let currentMode = '3d'; 
    const modes = ['3d', '2d', 'columbus'];
    
    modeBtn.addEventListener('click', function() {
        const currentIndex = modes.indexOf(currentMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        const nextMode = modes[nextIndex];
        send('setSceneMode', { mode: nextMode });
    });

    function updateModeDisplay(mode) {
        currentMode = mode;
        let label = '3D';
        if (mode === '2d') label = '2D';
        if (mode === 'columbus') label = '2.5D';
        modeText.textContent = label;
    }
  </script>
`;
// Plugin Logic
// Update Loop
const onUpdate = () => {
    // Check if camera is available
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
