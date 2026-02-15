// @ts-nocheck
// Track layer IDs added by this plugin
const _pluginAddedLayerIds = new Set();

// Track last values for polling
let _lastInspectorUrl = null;
let _lastInspectorApply = null;
let _lastInspectorLayersJson = null;
let _lastInfoUrl = null;
let _lastInspectorBackground = null;
let _cameraPresets = [];
let _inspectorNonCamLines = [];  // non-cam lines from inspector text, preserved for rebuild

// Ensure globe and scene background are white before any tiles are applied
try {
  if (typeof reearth !== "undefined" && reearth.viewer && reearth.viewer.overrideProperty) {
    reearth.viewer.overrideProperty({
      globe: { baseColor: "#ffffff" },
      scene: { backgroundColor: "#ffffff" }
    });
  }
} catch (e) {
  console.warn("Failed to set globe/background color to white:", e);
}

const generateLayerItem = (layer, isPreset) => {
  return `
    <li>
      <span id="layer-name">${layer.title}</span>
      <div class="actions">
        <input
          type="checkbox"
          id="show-hide-layer"
          data-layer-id="${layer.id}"
          data-is-plugin-added="${!isPreset}"
          ${layer.visible ? "checked" : ""}
        />
        <button class="btn-primary p-8 move-btn" data-layer-id="${layer.id}" aria-label="Move"></button>
      </div>
    </li>
  `;
};

// Note: preset layer items are generated dynamically inside getUI()

function getUI() {
  // Build layer items from current layers so UI reflects runtime changes
  const layers = (reearth.layers && reearth.layers.layers) || [];
  
  // Separate preset layers and plugin-added layers
  const presetLayers = [];
  const userLayers = [];
  layers.forEach(layer => {
    if (_pluginAddedLayerIds.has(layer.id)) {
      userLayers.push(layer);
    } else {
      presetLayers.push(layer);
    }
  });
  
  const presetLayerItems = presetLayers.map(layer => generateLayerItem(layer, true)).join('');
  const userLayerItems = userLayers.map(layer => generateLayerItem(layer, false)).join('');

  // Generate camera preset buttons
  const camButtons = _cameraPresets.map((cam, i) => `
    <li>
      <span class="cam-title">${cam.title}</span>
      <div class="actions">
        <button class="btn-primary p-8 cam-btn" data-cam-index="${i}" aria-label="FlyTo ${cam.title}">▶</button>
      </div>
    </li>
  `).join('');

  // Information panel content
  // (Info content will be loaded from configured URL and injected into #info-content)
  
  return `
<style>
  /* Tabs + styling */
  .tab-bar{ display:flex; gap:8px; margin-bottom:12px; align-items:center; padding-bottom:4px; flex-wrap:wrap; }
  .tab{ padding:6px 10px; border-radius:6px; background:rgba(255,255,255,0.12); border:1px solid rgba(0,0,0,0.05); cursor:pointer; flex:0 0 auto; white-space:nowrap; }
  .tab.active{ background:rgba(255,255,255,0.9); color:#111; }
  .tab.minimize{ width:32px; padding:4px 6px; text-align:center; }
  .tab.minimize[aria-pressed="true"]{ background:rgba(255,255,255,0.9); }

  /* Minimized state: shrink padding and hide panels */
  .primary-background.minimized{ padding:6px; }
  .primary-background.minimized #layers-panel,
  .primary-background.minimized #cams-panel,
  .primary-background.minimized #settings-panel,
  .primary-background.minimized #info-panel{ display:none !important; }

  /* Generic styling system that provides consistent UI components and styling across all plugins */

  @import url("https://reearth.github.io/visualizer-plugin-sample-data/public/css/preset-ui.css");

  /* Plugin-specific styling */
  .layers-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .layers-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 4px 0;
    padding: 2px 8px;
    line-height: 1;
    background-color: rgba(248, 249, 250, 0.6);
    min-height: 1.2em;
    border-radius: 4px;
  }

  #layer-name{
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0
  }
  .actions{
    display: flex;
    gap: 8px;
    align-items: center;
    }

  /* Make primary background semi-transparent */
  .primary-background {
    background-color: rgba(255, 255, 255, 0.3);
  }

  /* Info panel expands to use available height */
  #info-panel {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
  }

  #info-panel iframe {
    flex: 1;
    align-self: stretch;
  }

  /* Move button: square, minimal height */
  .move-btn{
    padding: 0;
    width: 1.6em;
    height: 1.6em;
    min-width: 1.6em;
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
  }

  /* center content inside the move button */
  .move-btn { justify-content: center; }

  /* Camera preset button */
  .cam-btn{
    padding: 2px 8px;
    min-width: 2em;
    height: 1.6em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 0.85em;
    cursor: pointer;
  }
  .cam-title{
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  /* Camera current state display - compact 2-col layout */
  .cam-current{
    background: rgba(248,249,250,0.8);
    border-radius: 6px;
    padding: 6px;
    margin-top: 10px;
    box-sizing: border-box;
    width: 100%;
    overflow: hidden;
  }
  .cam-grid{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .cam-grid .cam-cell{
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }
  .cam-grid .cam-cell.full{ grid-column: 1 / -1; }
  .cam-current label{
    font-size: 0.7em;
    color: #555;
    min-width: 2.2em;
    max-width: 2.2em;
    text-align: right;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .cam-current input{
    flex: 1;
    min-width: 0;
    width: 0;
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 1px 3px;
    font-size: 0.75em;
    height: 20px;
    background: #fff;
    box-sizing: border-box;
  }
  .cam-current input:focus{
    outline: 2px solid #667eea;
    border-color: #667eea;
  }
  .cam-flyto-btn{
    margin-top: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
  }

  /* Terrain row: compact, text left, toggle right */
  .terrain-row{
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    min-height: 28px;
    justify-content: space-between;
  }
  .terrain-row .text-md{ font-size: 14px; margin: 0; }
  .terrain-row .text-md{ font-size: 14px; margin: 0; flex: 0 1 auto; white-space: nowrap; }
  .toggle { margin-left: 8px; display: inline-flex; align-items: center; gap:6px; white-space: nowrap; }
  .toggle input { width: auto; margin: 0; vertical-align: middle; }
  .terrain-row{ display:flex; align-items:center; gap:8px; padding:4px 8px; min-height:28px; justify-content:space-between; flex-wrap:nowrap; }
  /* prevent long labels or external CSS forcing block layout */
  .terrain-row .text-md, .toggle { display:inline-flex; align-items:center; }

</style>

<div class="primary-background p-16 rounded-sm">
    <div class="tab-bar" role="tablist">
    <button class="tab minimize" data-action="minimize" aria-pressed="false" title="Minimize">—</button>
    <button class="tab active" data-target="layers-panel" aria-selected="true">Layers</button>
    <button class="tab" data-target="cams-panel" aria-selected="false">Cams</button>
    <button class="tab" data-target="info-panel" aria-selected="false">info</button>
    <button class="tab" data-target="settings-panel" aria-selected="false">Set</button>
  </div>

  <div id="layers-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;">Layers</div>
    </div>
    <ul class="layers-list">
      ${presetLayerItems}
    </ul>
    ${userLayerItems ? `<div style="font-weight:600;margin-top:12px;margin-bottom:8px;">UserLayers</div><ul class="layers-list">${userLayerItems}</ul>` : ''}
  </div>

  <div id="cams-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;">Camera Presets</div>
    ${_cameraPresets.length > 0 ? `<ul class="layers-list">${camButtons}</ul>` : '<div class="text-sm" style="color:#888;padding:8px 0;">cam:タイトル|緯度|経度<br>cam:タイトル|緯度|経度|h=高度m<br>cam:タイトル|緯度|経度|h=高度|d=方位°|p=傾き°<br><br>例: cam:東京駅|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定のパラメータは現在のカメラ設定を維持</div>'}
    <div class="cam-current">
      <div style="font-weight:600;margin-bottom:4px;font-size:0.85em;">Current Camera</div>
      <div class="cam-grid">
        <div class="cam-cell"><label>Lat</label><input type="number" step="any" id="cam-lat" value="0"></div>
        <div class="cam-cell"><label>Lng</label><input type="number" step="any" id="cam-lng" value="0"></div>
        <div class="cam-cell"><label>Dir°</label><input type="number" step="any" id="cam-heading" value="0"></div>
        <div class="cam-cell"><label>Tilt°</label><input type="number" step="any" id="cam-pitch" value="0"></div>
        <div class="cam-cell full"><label>H(m)</label><input type="number" step="any" id="cam-height" value="1000"></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <button class="btn-primary cam-flyto-btn" id="cam-refresh" style="flex:1;">🔄 Refresh</button>
        <button class="btn-primary cam-flyto-btn" id="cam-manual-flyto" style="flex:1;">▶ FlyTo</button>
      </div>
    </div>
  </div>

  <div id="info-panel" style="display:none;">
    <iframe id="info-content" style="width:100%;border:1px solid #ccc;background:#fff;overflow:auto;"></iframe>
  </div>

  <div id="settings-panel" style="display:none;">
    <div class="primary-background terrain-row rounded-sm" style="margin-bottom:8px;">
      <div class="text-md" id="status">Terrain: OFF</div>
      <label class="toggle" id="terrain-toggle" aria-label="Terrain toggle">
        <input type="checkbox" id="toggleSwitch">
        <span class="slider"></span>
      </label>
    </div>

    <!-- Shadow row: compact, placed under Terrain -->
    <div class="primary-background terrain-row rounded-sm" style="margin-bottom:8px;">
      <div class="text-md" id="shadow-status">Shadow: OFF</div>
      <label class="toggle" id="shadow-toggle" aria-label="Shadow toggle">
        <input type="checkbox" id="toggleShadowSwitch">
        <span class="slider"></span>
      </label>
    </div>

    <!-- Time row: start / stop / current + Apply (hidden unless Shadow ON) -->
    <div id="time-row" class="primary-background terrain-row rounded-sm" style="margin-bottom:8px; gap:6px; flex-wrap:wrap; display:none;">
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="text-sm" for="startTime">Start</label>
        <input type="datetime-local" id="startTime" style="height:28px;" />
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="text-sm" for="stopTime">Stop</label>
        <input type="datetime-local" id="stopTime" style="height:28px;" />
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="text-sm" for="currentTime">Current</label>
        <input type="datetime-local" id="currentTime" style="height:28px;" />
      </div>
      <button id="applyTimeBtn" class="btn-primary p-8" style="min-height:28px;">Apply</button>
      <div id="time-status" class="text-sm" style="margin-left:8px; color:#333;">&nbsp;</div>
    </div>
  </div>

 
</div>

<script>
  // Terrain toggle: send action messages to parent
  document.addEventListener('DOMContentLoaded', function() {
      // Tab switching: handle normal tabs and a minimize-action tab
      try {
        const tabs = document.querySelectorAll('.tab-bar .tab');
        if (tabs && tabs.length) {
          tabs.forEach(btn => {
            btn.addEventListener('click', function() {
              const action = this.getAttribute('data-action');
              // minimize action handled here
              if (action === 'minimize') {
                const root = document.querySelector('.primary-background');
                if (!root) return;
                const pressed = this.getAttribute('aria-pressed') === 'true';
                if (pressed) {
                  root.classList.remove('minimized');
                  this.setAttribute('aria-pressed', 'false');
                  this.textContent = '—';
                  this.title = 'Minimize';
                } else {
                  root.classList.add('minimized');
                  this.setAttribute('aria-pressed', 'true');
                  this.textContent = '+';
                  this.title = 'Restore';
                }
                return;
              }
              const target = this.getAttribute('data-target');
              if (!target) return;
              tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
              this.classList.add('active'); this.setAttribute('aria-selected','true');
              ['layers-panel','cams-panel','info-panel','settings-panel'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                el.style.display = (id === target) ? '' : 'none';
                // Adjust iframe height when info panel is shown
                if (id === 'info-panel' && id === target) {
                  try {
                    const iframe = document.getElementById('info-content');
                    const infoPanel = document.getElementById('info-panel');
                    if (iframe && infoPanel) {
                      const screenHeight = (window.screen && window.screen.availHeight) || (window.screen && window.screen.height) || window.innerHeight;
                      const tabBarHeight = document.querySelector('.tab-bar')?.offsetHeight || 50;
                      let availableHeight = screenHeight - tabBarHeight - 100;
                      // Apply min-height: 400px, max-height: 800px
                      availableHeight = Math.max(400, Math.min(800, availableHeight));
                      infoPanel.style.height = availableHeight + 'px';
                      iframe.style.height = availableHeight + 'px';
                    }
                  } catch(e) {}
                }
              });
            });
          });
          // Adjust tab-bar height when tabs wrap into multiple rows (max 3 rows)
          const tabBar = document.querySelector('.tab-bar');
          const updateTabRows = () => {
            if (!tabBar) return;
            const tabsArr = Array.from(tabBar.querySelectorAll('.tab'));
            if (!tabsArr.length) return;
            const offsetTops = Array.from(new Set(tabsArr.map(t => t.offsetTop)));
            const rows = offsetTops.length || 1;
            const tabHeight = tabsArr[0].offsetHeight || 32;
            const gap = 8; // matches CSS gap
            const rowHeight = tabHeight + gap;
            const maxRows = 3;
            if (rows <= 1) {
              tabBar.style.maxHeight = '';
              tabBar.style.overflowY = '';
            } else if (rows <= maxRows) {
              tabBar.style.maxHeight = (rows * rowHeight) + 'px';
              tabBar.style.overflowY = 'visible';
            } else {
              tabBar.style.maxHeight = (maxRows * rowHeight) + 'px';
              tabBar.style.overflowY = 'auto';
            }
          };
          // run on load and resize, and when tab children change
          try { updateTabRows(); } catch (e) {}
          window.addEventListener('resize', () => { try { updateTabRows(); } catch (e) {} });
          try {
            const mo = new MutationObserver(() => { try { updateTabRows(); } catch (e) {} });
            if (tabBar) mo.observe(tabBar, { childList: true, subtree: true });
          } catch (e) {}
        }
      } catch (e) {}
      const toggleSwitch = document.getElementById('toggleSwitch');
      const status = document.getElementById('status');

      if (toggleSwitch && status) {
          toggleSwitch.addEventListener('change', function() {
              if (this.checked) {
                  status.textContent = 'Terrain: ON';
                  if (window.parent) {
                      window.parent.postMessage({ action: "activateTerrain" }, "*");
                  }
              } else {
                  status.textContent = 'Terrain: OFF';
                  if (window.parent) {
                      window.parent.postMessage({ action: "deactivateTerrain" }, "*");
                  }
              }
          });
      }

        // Shadow toggle: similar compact handler under Terrain
            const toggleShadow = document.getElementById('toggleShadowSwitch');
            const shadowStatus = document.getElementById('shadow-status');
            const timeRow = document.getElementById('time-row');
            const updateTimeRowVisibility = (visible) => {
              if (!timeRow) return;
              timeRow.style.display = visible ? 'flex' : 'none';
            };

            // Always hide time row initially to avoid flash
            if (timeRow) timeRow.style.display = 'none';

            if (toggleShadow && shadowStatus) {
              // initialize visibility explicitly based on checked state
              updateTimeRowVisibility(Boolean(toggleShadow.checked));
              shadowStatus.textContent = toggleShadow.checked ? 'Shadow: ON' : 'Shadow: OFF';

              toggleShadow.addEventListener('change', function() {
                const checked = !!this.checked;
                shadowStatus.textContent = checked ? 'Shadow: ON' : 'Shadow: OFF';
                updateTimeRowVisibility(checked);
                if (window.parent) {
                  window.parent.postMessage({ action: checked ? "activateShadow" : "deactivateShadow" }, "*");
                }
              });
            }

            // Sync UI if parent sends actions (keep iframe in sync with external changes)
            window.addEventListener('message', function(e) {
              try {
                const msg = e && e.data ? e.data : null;
                if (!msg || !msg.action) return;
                
                // handle info URL - load HTML into iframe
                if (msg.action === 'loadInfoUrl') {
                  try {
                    const url = msg.url;
                    const iframe = document.getElementById('info-content');
                    if (!iframe) return;
                    if (!url) {
                      iframe.srcdoc = '<div style="padding:16px;color:#666;">No URL configured</div>';
                      return;
                    }
                    iframe.src = url;
                  } catch (e) { console.error('[UI] loadInfoUrl failed', e); }
                  return;
                }
                if (msg.action === 'activateShadow' || msg.action === 'deactivateShadow') {
                  const on = msg.action === 'activateShadow';
                  if (toggleShadow) toggleShadow.checked = on;
                  if (shadowStatus) shadowStatus.textContent = on ? 'Shadow: ON' : 'Shadow: OFF';
                  updateTimeRowVisibility(on);
                } else if (msg.action === 'terrainState') {
                  // message from extension to initialize/sync terrain toggle
                  const on = !!msg.enabled;
                  if (toggleSwitch) toggleSwitch.checked = on;
                  if (status) status.textContent = on ? 'Terrain: ON' : 'Terrain: OFF';
                } else if (msg.action === 'shadowState') {
                  // message from extension to initialize/sync shadow toggle
                  const on = !!msg.enabled;
                  if (toggleShadow) toggleShadow.checked = on;
                  if (shadowStatus) shadowStatus.textContent = on ? 'Shadow: ON' : 'Shadow: OFF';
                  updateTimeRowVisibility(on);
                } else if (msg.action === 'cameraState') {
                  // message from extension to initialize/sync camera info
                  const cam = msg.camera || null;
                  if (cam) {
                    const posEl = document.getElementById('camera-position');
                    const rotEl = document.getElementById('camera-rotation');
                    try {
                      const p = cam.position || cam.pos || cam.center || null;
                      if (posEl) posEl.textContent = 'Position: ' + (p ? JSON.stringify(p) : JSON.stringify(cam));
                      const h = cam.heading || cam.yaw || cam.h || null;
                      const pch = cam.pitch || cam.pitchDeg || cam.pitchDegree || null;
                      const r = cam.roll || cam.r || null;
                      if (rotEl) rotEl.textContent = 'Heading/Pitch/Roll: ' + [h, pch, r].map(v => v == null ? '—' : String(v)).join(' / ');
                    } catch (e) {}
                  }
                }
              } catch (e) {}
            });

          // Time inputs: send start/stop/current to parent when Apply clicked
          const startInput = document.getElementById('startTime');
          const stopInput = document.getElementById('stopTime');

      
          const currentInput = document.getElementById('currentTime');
          const applyBtn = document.getElementById('applyTimeBtn');
            const timeStatus = document.getElementById('time-status');
            if (applyBtn) {
              applyBtn.addEventListener('click', function() {
                const msg = { action: 'setTime' };
                // datetime-local gives local date-time without timezone; send raw value
                  if (startInput && startInput.value) msg.start = startInput.value;
                  if (stopInput && stopInput.value) msg.stop = stopInput.value;
                  if (currentInput && currentInput.value) msg.current = currentInput.value;
                  // If current not specified, default it to start (or stop) so timeline current moves
                  if (!msg.current && (msg.start || msg.stop)) {
                    msg.current = msg.start || msg.stop;
                    if (timeStatus) timeStatus.textContent = 'Sent (current set)';
                  }
                try {
                  console.log('[UI] posting setTime message', msg);
                  if (window.parent) {
                    window.parent.postMessage(msg, "*");
                  }
                  if (timeStatus) {
                    timeStatus.textContent = 'Sent';
                    setTimeout(() => { if (timeStatus) timeStatus.textContent = '\u00A0'; }, 2000);
                  }
                } catch (e) {
                  console.error('[UI] failed to post setTime', e);
                  if (timeStatus) timeStatus.textContent = 'Send failed';
                }
              });
            }

        
      // Add event listener for 'Show/Hide' for all layers (preset + plugin-added)
      Array.from(document.querySelectorAll('input[data-layer-id]')).forEach(checkbox => {
        try {
          checkbox.addEventListener('change', event => {
            try {
              const layerId = event.target.getAttribute('data-layer-id');
              const isVisible = !!event.target.checked;
              if (layerId) {
                parent.postMessage({ type: isVisible ? 'show' : 'hide', layerId: layerId }, '*');
              }
            } catch (e) {}
          });
        } catch (e) {}
      });

      // Add event listener for 'FlyTo' button (layer move)
      document.querySelectorAll(".move-btn").forEach(button => {
        button.addEventListener("click", event => {
          const layerId = event.target.getAttribute("data-layer-id");
          if (layerId) {
            parent.postMessage({
              type: "flyTo",
              layerId: layerId
            }, "*");
          }
        });
      });

      // Add event listener for camera preset 'FlyTo' buttons
      document.querySelectorAll(".cam-btn").forEach(button => {
        button.addEventListener("click", event => {
          const camIndex = event.target.getAttribute("data-cam-index");
          if (camIndex !== null && camIndex !== undefined) {
            parent.postMessage({
              action: "flyToCamera",
              camIndex: parseInt(camIndex)
            }, "*");
          }
        });
      });

      // Manual FlyTo from editable camera fields
      const manualFlyBtn = document.getElementById('cam-manual-flyto');
      if (manualFlyBtn) {
        manualFlyBtn.addEventListener('click', function() {
          const lat = parseFloat(document.getElementById('cam-lat').value);
          const lng = parseFloat(document.getElementById('cam-lng').value);
          const height = parseFloat(document.getElementById('cam-height').value);
          const heading = parseFloat(document.getElementById('cam-heading').value);
          const pitch = parseFloat(document.getElementById('cam-pitch').value);
          parent.postMessage({
            action: 'flyToManual',
            lat: isNaN(lat) ? 0 : lat,
            lng: isNaN(lng) ? 0 : lng,
            height: isNaN(height) ? 1000 : height,
            heading: isNaN(heading) ? 0 : heading,
            pitch: isNaN(pitch) ? 0 : pitch,
          }, '*');
        });
      }

      // Camera Refresh button: request current camera from extension
      const refreshBtn = document.getElementById('cam-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
          parent.postMessage({ action: 'requestCamera' }, '*');
        });
      }

      // Listen for camera state updates from the extension
      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data ? e.data : null;
          if (!msg) return;
          if (msg.action === 'updateCameraFields') {
            const c = msg.camera;
            if (!c) return;
            const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
            setVal('cam-lat', c.lat);
            setVal('cam-lng', c.lng);
            setVal('cam-height', c.height);
            setVal('cam-heading', c.heading);
            setVal('cam-pitch', c.pitch);
          }
        } catch(e){}
      });

      
  });

  // On-screen plugin log removed (logs go to console only)
</script>
`;
}

// Initial render
const uiHTML = getUI();
try { sendLog('[render] UI HTML length:', uiHTML ? uiHTML.length : 0, 'preview:', uiHTML ? uiHTML.substring(0, 200) : 'null'); } catch(e){}
reearth.ui.show(uiHTML);
// Send initial terrain state to the UI so the toggle reflects current viewer settings
try {
  const viewerProp = (reearth.viewer && reearth.viewer.property) ? reearth.viewer.property : (reearth.viewer && typeof reearth.viewer.getViewerProperty === 'function' ? reearth.viewer.getViewerProperty() : null);
  const terrainEnabled = !!(viewerProp && viewerProp.terrain && viewerProp.terrain.enabled);
  const depthTest = !!(viewerProp && viewerProp.globe && viewerProp.globe.depthTestAgainstTerrain);
  const shadowEnabled = !!(viewerProp && viewerProp.scene && viewerProp.scene.shadow && viewerProp.scene.shadow.enabled);
  try { sendLog('[init] sending terrain state to UI', { enabled: terrainEnabled, depthTestAgainstTerrain: depthTest }); } catch(e){}
  if (reearth.ui && typeof reearth.ui.postMessage === 'function') {
    reearth.ui.postMessage({ action: 'terrainState', enabled: terrainEnabled, depthTestAgainstTerrain: depthTest });
    try { sendLog('[init] sending shadow state to UI', { enabled: shadowEnabled }); } catch(e){}
    reearth.ui.postMessage({ action: 'shadowState', enabled: shadowEnabled });
    // Attempt to send initial camera state if available
    try {
      const cam = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : (reearth.view && (reearth.view.camera || reearth.view.getCamera && reearth.view.getCamera && typeof reearth.view.getCamera === 'function' ? reearth.view.getCamera() : null));
      if (cam) {
        reearth.ui.postMessage({ action: 'cameraState', camera: cam });
      }
    } catch (e) {}
  }
} catch (e) {
  try { sendError('[init] failed to send terrain state', e); } catch(err){}
}



// Helper: forward logs from extension to the UI log panel
function sendLog(...args) {
  try {
    console.log.apply(console, args);
  } catch (e) {}
}

function sendError(...args) {
  try {
    console.error.apply(console, args);
  } catch (e) {}
}

// Safe stringify for debug logging (handles circular refs and functions)
function safeStringify(obj) {
  try {
    const seen = [];
    return JSON.stringify(obj, function(k, v) {
      if (typeof v === 'function') return '[Function]';
      if (v && typeof v === 'object') {
        if (seen.indexOf(v) !== -1) return '[Circular]';
        seen.push(v);
      }
      return v;
    }, 2);
  } catch (e) {
    try { return String(obj); } catch (e2) { return '[unstringifiable]'; }
  }
}

// Documentation on Extension "on" event: https://visualizer.developer.reearth.io/plugin-api/extension/#message-1
reearth.extension.on("message", (msg) => {
  try { sendLog("[extension.message] received:", msg); } catch(e){}
  // Handle action-based messages from the UI (terrain toggle)
  if (msg && msg.action) {
    if (msg.action === "activateTerrain") {
      const bg = _lastInspectorBackground || "#ffffff";
      reearth.viewer.overrideProperty({
        terrain: { enabled: true },
        globe: { depthTestAgainstTerrain: true, baseColor: bg },
        scene: { backgroundColor: bg },
      });
    } else if (msg.action === "deactivateTerrain") {
      const bg = _lastInspectorBackground || "#ffffff";
      reearth.viewer.overrideProperty({
        terrain: { enabled: false },
        globe: { depthTestAgainstTerrain: false, baseColor: bg },
        scene: { backgroundColor: bg },
      });
    }
    else if (msg.action === "activateShadow") {
      const bg = _lastInspectorBackground || "#ffffff";
      reearth.viewer.overrideProperty({
        scene: { shadow: { enabled: true }, backgroundColor: bg },
        globe: { baseColor: bg },
      });
    } else if (msg.action === "deactivateShadow") {
      const bg = _lastInspectorBackground || "#ffffff";
      reearth.viewer.overrideProperty({
        scene: { shadow: { enabled: false }, backgroundColor: bg },
        globe: { baseColor: bg },
      });
    } else if (msg.action === "requestCamera") {
      // UIからのカメラ情報リクエスト：現在のカメラ位置を取得してUIに返す
      try {
        let cur = null;
        try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch(e){}
        if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch(e){}
        if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch(e){}
        if (!cur) try { cur = (reearth.view && reearth.view.camera) ? reearth.view.camera : null; } catch(e){}
        if (!cur) try { cur = reearth.camera || null; } catch(e){}
        sendLog('[requestCamera] raw camera object:', cur ? JSON.stringify(cur) : 'null');
        if (cur && reearth.ui && typeof reearth.ui.postMessage === 'function') {
          const rad2deg = (r) => typeof r === 'number' ? Math.round(r * 180 / Math.PI * 100) / 100 : 0;
          const lat = cur.lat ?? cur.latitude ?? null;
          const lng = cur.lng ?? cur.longitude ?? cur.lon ?? null;
          const h = cur.height ?? cur.altitude ?? cur.alt ?? null;
          const heading = cur.heading ?? cur.yaw ?? null;
          const pitch = cur.pitch ?? cur.tilt ?? null;
          reearth.ui.postMessage({
            action: 'updateCameraFields',
            camera: {
              lat: typeof lat === 'number' ? Math.round(lat * 1000000) / 1000000 : 0,
              lng: typeof lng === 'number' ? Math.round(lng * 1000000) / 1000000 : 0,
              height: typeof h === 'number' ? Math.round(h * 10) / 10 : 1000,
              heading: rad2deg(heading),
              pitch: rad2deg(pitch),
            }
          });
        }
      } catch(e) {
        try { sendError('[requestCamera] error:', e); } catch(err){}
      }
    } else if (msg.action === "updateCamPreset") {
      // プリセットを現在のカメラ位置で更新し、inspectorText も書き換える
      try {
        const idx = msg.camIndex;
        if (typeof idx === 'number' && _cameraPresets[idx]) {
          // 現在のカメラ取得
          let cur = null;
          try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch(e){}
          if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch(e){}
          if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch(e){}
          if (!cur) try { cur = (reearth.view && reearth.view.camera) ? reearth.view.camera : null; } catch(e){}
          if (!cur) try { cur = reearth.camera || null; } catch(e){}
          if (cur) {
            const rad2deg = (r) => typeof r === 'number' ? Math.round(r * 180 / Math.PI * 100) / 100 : 0;
            const lat = cur.lat ?? cur.latitude ?? 0;
            const lng = cur.lng ?? cur.longitude ?? cur.lon ?? 0;
            const h = cur.height ?? cur.altitude ?? cur.alt ?? 1000;
            const heading = cur.heading ?? cur.yaw ?? 0;
            const pitch = cur.pitch ?? cur.tilt ?? 0;
            // プリセット更新
            _cameraPresets[idx].lat = typeof lat === 'number' ? Math.round(lat * 1000000) / 1000000 : 0;
            _cameraPresets[idx].lng = typeof lng === 'number' ? Math.round(lng * 1000000) / 1000000 : 0;
            _cameraPresets[idx].height = typeof h === 'number' ? Math.round(h * 10) / 10 : 1000;
            _cameraPresets[idx].heading = heading;
            _cameraPresets[idx].pitch = pitch;
            // inspectorText を再構築
            rebuildInspectorText();
            // UI 再レンダリング
            try { reearth.ui.show(getUI()); } catch(e){}
            try { sendLog('[updateCamPreset] updated preset', idx, _cameraPresets[idx].title); } catch(e){}
          }
        }
      } catch(e) {
        try { sendError('[updateCamPreset] error:', e); } catch(err){}
      }
    } else if (msg.action === "flyToManual") {
      try {
        reearth.camera.flyTo({
          lat: msg.lat,
          lng: msg.lng,
          height: msg.height,
          heading: msg.heading * Math.PI / 180,
          pitch: msg.pitch * Math.PI / 180,
          roll: 0,
        }, { duration: 2 });
        try { sendLog('[flyToManual]', msg.lat, msg.lng, msg.height, msg.heading, msg.pitch); } catch(e){}
      } catch(e) {
        try { sendError('[flyToManual] error:', e); } catch(err){}
      }
    } else if (msg.action === "flyToCamera") {
      try {
        const idx = msg.camIndex;
        if (typeof idx === 'number' && _cameraPresets[idx]) {
          const cam = _cameraPresets[idx];
          // 現在のカメラ情報を取得（未指定パラメータのデフォルトに使用）
          let curHeight = 1000, curHeading = 0, curPitch = -Math.PI / 6, curRoll = 0;
          try {
            let cur = null;
            try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch(e){}
            if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch(e){}
            if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch(e){}
            if (!cur) try { cur = (reearth.view && reearth.view.camera) ? reearth.view.camera : null; } catch(e){}
            if (!cur) try { cur = reearth.camera || null; } catch(e){}
            if (cur) {
              const h = cur.height ?? cur.altitude ?? cur.alt ?? null;
              const hd = cur.heading ?? cur.yaw ?? cur.h ?? null;
              const p = cur.pitch ?? cur.tilt ?? cur.p ?? null;
              const r = cur.roll ?? cur.r ?? null;
              if (typeof h === 'number') curHeight = h;
              if (typeof hd === 'number') curHeading = hd;
              if (typeof p === 'number') curPitch = p;
              if (typeof r === 'number') curRoll = r;
            }
          } catch(e){}
          reearth.camera.flyTo({
            lat: cam.lat,
            lng: cam.lng,
            height: cam.height !== null ? cam.height : curHeight,
            heading: cam.heading !== null ? cam.heading : curHeading,
            pitch: cam.pitch !== null ? cam.pitch : curPitch,
            roll: curRoll,
          }, { duration: 2 });
          try { sendLog('[flyToCamera] flying to:', cam.title, cam.lat, cam.lng); } catch(e){}
        }
      } catch(e) {
        try { sendError('[flyToCamera] error:', e); } catch(err){}
      }
      } else if (msg.action === "setTime") {
        try {
          // If values are provided, convert to Date objects.
          const buildDate = (v) => (typeof v === 'string' && v ? new Date(v) : null);
          const start = buildDate(msg.start);
          const stop = buildDate(msg.stop);
          const current = buildDate(msg.current);
          const payload = {};
          if (start instanceof Date && !isNaN(start)) payload.start = start;
          if (stop instanceof Date && !isNaN(stop)) payload.stop = stop;
          if (current instanceof Date && !isNaN(current)) payload.current = current;
          try { sendLog('[setTime] parsed payload:', payload, 'rawMsg:', msg); } catch(e){}
          // Only call if at least one valid date provided
          if (Object.keys(payload).length) {
            try {
              reearth.timeline.setTime(payload);
              try { sendLog('[setTime] reearth.timeline.setTime called'); } catch(e){}
            } catch (e) {
              try { sendError('[setTime] reearth.timeline.setTime failed', e); } catch(err){}
            }
          } else {
            try { sendError('[setTime] no valid dates parsed', msg); } catch(e){}
          }
        } catch (e) {
          try { sendError('[setTime] invalid date payload', msg, e); } catch(err){}
        }
      }
    return;
  }

  // Backward-compatible handling for messages using `type`
  switch (msg.type) {
    case "delete":
      reearth.layers.delete(msg.layerId);
      break;
    case "refreshLayers":
      try {
        if (reearth.ui && typeof reearth.ui.show === 'function') {
          reearth.ui.show(getUI());
        }
      } catch (e) {}
      break;
    case "flyTo":
      reearth.camera.flyTo(msg.layerId, { duration: 2 });
      break;
    case "hide":
      reearth.layers.hide(msg.layerId);
      break;
    case "show":
      reearth.layers.show(msg.layerId);
      break;
    case "inspectorText":
      try {
        const v = msg.value || "";
        sendLog("inspectorText:", v);
        let url = v;
        // optional title can be provided in the message
        const mtitle = msg && (msg.title || msg.layerTitle) ? (msg.title || msg.layerTitle) : null;
        try {
          // If the inspector sent an encoded URL, decode to show original characters
          url = decodeURIComponent(v);
        } catch (e) {
          // ignore decode errors and keep original
          url = v;
        }
        if (url && /^https?:\/\//.test(url)) {
          addXyzLayer(url, mtitle);
        }
      } catch (e) {
        // ignore
      }
      break;
    default:
  }
});

// Read initial inspector property and add layer if URL present
function tryInitFromProperty() {
  try {
    try { sendLog('[init] extension.widget:', reearth.extension.widget); } catch(e){}
    const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
    // property may nest inspector values under `settings` (e.g. { settings: { inspectorUrl: "..." } })
    const url = prop?.inspectorUrl || prop?.inspectorText || prop?.settings?.inspectorUrl || prop?.settings?.inspectorText;
    const title = prop?.inspectorTitle || prop?.settings?.inspectorTitle || null;
    try { sendLog('[init] property FULL:', JSON.stringify(prop, null, 2)); } catch(e){ try { sendLog('[init] property:', prop); } catch(e2){} }
    if (url && typeof url === "string" && /^https?:\/\//.test(url)) {
      try { sendLog('[init] found URL -> add layer', url); } catch(e){}
      addXyzLayer(url, title);
    } else {
      try { sendLog('[init] no valid URL found in property'); } catch(e){}
    }

    // Info URL handling: load HTML into iframe
    try {
      try { sendLog('[init] checking infoUrl - prop.info?.infoUrl:', prop.info?.infoUrl, 'prop.infoUrl:', prop.infoUrl); } catch(e){}
      const infoUrl = prop?.info?.infoUrl || prop?.infoUrl || prop?.settings?.infoUrl || null;
      try { sendLog('[init] infoUrl extracted:', infoUrl, 'type:', typeof infoUrl); } catch(e){}
      if (infoUrl && typeof infoUrl === 'string' && /^https?:\/\//.test(infoUrl)) {
        try { sendLog('[init] valid infoUrl found, calling loadInfoUrl...'); } catch(e){}
        _lastInfoUrl = infoUrl;
        loadInfoUrl(infoUrl);
      } else {
        try { sendLog('[init] no valid infoUrl found or invalid format'); } catch(e){}
      }
    } catch(e) {
      try { sendError('[init] infoUrl handling error:', e); } catch(err){}
    }

    // If inspector provides a collection of layers, add them too
    try {
      const arr = prop?.layers || prop?.settings?.layers;
      if (Array.isArray(arr) && arr.length) {
        try { sendLog('[init] found inspector.layers -> processing', arr.length); } catch(e){}
        addXyzLayersFromArray(arr);
      }
    } catch(e) {
      // ignore
    }
  } catch (e) {
    // ignore
  }
}

function addXyzLayer(url, title) {
  if (!url || typeof url !== "string") return;
  const titleToUse = (title && typeof title === 'string' && title.trim()) ? title.trim() : `XYZ: ${url}`;
  // Encode only non-ASCII characters but keep template braces {z}/{x}/{y} intact
  const encodedUrl = url.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  const layer = {
    type: "simple",
    title: titleToUse,
    visible: true,
    data: {
      type: "tiles",
      url: encodedUrl,
    },
    tiles: {},
  };

  try {
    sendLog("[addXyzLayer] received url:", url);
    sendLog("[addXyzLayer] encoded url:", encodedUrl);
    sendLog("[addXyzLayer] layer object:", layer);
    const newId = reearth.layers.add(layer);
    // Track this layer as plugin-added
    if (newId) {
      _pluginAddedLayerIds.add(newId);
    }
    sendLog("Added XYZ layer, id:", newId, "(src:", url, ")");
    try {
      // Re-render the widget UI so the new layer appears in the list
      reearth.ui.show(getUI());
    } catch (e) {
      try { sendError('[addXyzLayer] failed to re-render UI:', e); } catch (err) {}
    }
    return newId;
  } catch (e) {
    try { sendError("Failed to add XYZ layer:", e); } catch (err) {}
    try { sendError("Layer object was:", layer); } catch (err) {}
    return null;
  }
}

tryInitFromProperty();

// Default inspector text (matches reearth.yml defaultValue)
const _defaultInspectorText = `xyz: OpenStreetMap | https://tile.openstreetmap.org/{z}/{x}/{y}.png
xyz: 地理院タイル 標準地図 | https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
background: #ffffff
info: https://re-earth-geo-suite.vercel.app/ryu.html
cam:東京駅|35.653108|139.761449|h=2200.6|p=-30
cam:富士山|35.139595|138.713803|h=14425.5|p=-40.37
cam:大阪城|34.658425|135.524574|h=2533.5||p=-40.37`;

// Also process any inspector text/config present at init
try {
  const propInit = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
  const textInit = (propInit.settings && propInit.settings.inspectorText) || propInit.inspectorText;
  // Use default text if no user-configured text exists
  const textToProcess = (textInit && typeof textInit === 'string' && textInit.trim()) ? textInit : _defaultInspectorText;
  if (textToProcess && textToProcess.trim()) {
    try { sendLog('[init] processing inspector text at startup, length:', textToProcess.length, 'isDefault:', textToProcess === _defaultInspectorText); } catch(e){}
    processInspectorText(textToProcess);
  }
} catch(e) {}

// Rebuild inspectorText from non-cam lines + current _cameraPresets
function rebuildInspectorText() {
  try {
    const lines = [];
    // Non-cam lines first (background, info, tiles)
    _inspectorNonCamLines.forEach(function(l) { lines.push(l); });
    // Cam presets
    _cameraPresets.forEach(function(cam) {
      const rad2deg = function(r) { return typeof r === 'number' ? Math.round(r * 180 / Math.PI * 100) / 100 : 0; };
      let camLine = 'cam:' + (cam.title || 'Camera') + '|' + cam.lat + '|' + cam.lng;
      if (cam.height !== null && cam.height !== undefined) camLine += '|h=' + cam.height;
      if (cam.heading !== null && cam.heading !== undefined) camLine += '|d=' + rad2deg(cam.heading);
      if (cam.pitch !== null && cam.pitch !== undefined) camLine += '|p=' + rad2deg(cam.pitch);
      lines.push(camLine);
    });
    const newText = lines.join('\n');
    // Update cache so polling doesn't re-parse the same text we just wrote
    _lastInspectorLayersJson = newText;
    // Write back to property
    try {
      if (reearth.extension && reearth.extension.widget && typeof reearth.extension.widget.setPropertyValue === 'function') {
        reearth.extension.widget.setPropertyValue('settings', 'inspectorText', newText);
      }
    } catch(e2) {
      try { sendLog('[rebuildInspectorText] setPropertyValue not available, cache only'); } catch(_){}
    }
    try { sendLog('[rebuildInspectorText] rebuilt:', newText.substring(0, 200)); } catch(e){}
  } catch(e) {
    try { sendError('[rebuildInspectorText] error:', e); } catch(_){}
  }
}

// Parse and apply settings from text
function processInspectorText(text) {
  if (!text || typeof text !== 'string') return;
  // Handle various newline formats
  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
  const tiles = [];
  let infoUrlFound = null;
  const camsFound = [];
  const nonCamLines = [];  // preserve non-cam lines for rebuild

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
    // Background color setting: "background: #ffffff" or "bg: #fff"
    if (lowerLine.startsWith('background:') || lowerLine.startsWith('bg:')) {
      const col = line.substring(line.indexOf(':') + 1).trim();
      if (col) {
        try { sendLog('[processInspectorText] found BACKGROUND color:', col); } catch(e){}
        if (col !== _lastInspectorBackground) {
          _lastInspectorBackground = col;
          try {
            if (reearth && reearth.viewer && typeof reearth.viewer.overrideProperty === 'function') {
              reearth.viewer.overrideProperty({ globe: { baseColor: col }, scene: { backgroundColor: col } });
            }
          } catch (e) {
            try { sendError('[processInspectorText] failed to apply background color', e); } catch(_){}
          }
        }
      }
      nonCamLines.push(line);
      return;
    }
    // Info URL: "info: https://..." or "info:https://..."
    if (lowerLine.startsWith('info:')) {
      const url = line.substring(5).trim();
      if (url) {
        infoUrlFound = url;
        try { sendLog('[processInspectorText] found INFO url:', url); } catch(e){}
      }
      nonCamLines.push(line);
      return;
    }

    // Camera preset: "cam:タイトル|緯度|経度" + optional h=高度 d=方位° p=傾き°
    // Named params (any order): cam:タイトル|緯度|経度|h=5000|d=90|p=-30
    // Positional (backward compat): cam:タイトル|緯度|経度|高度|方位|傾き
    if (lowerLine.startsWith('cam:')) {
      const camStr = line.substring(4).trim();
      const parts = camStr.split('|').map(p => p.trim());
      if (parts.length >= 3) {
        const lat = parseFloat(parts[1]);
        const lng = parseFloat(parts[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          let height = null;
          let heading = null;
          let pitch = null;
          // Check remaining parts for named or positional params
          const extras = parts.slice(3);
          const hasNamedParam = extras.some(e => /^[hdp]=/i.test(e));
          if (hasNamedParam) {
            // Named parameter mode: h=高度 d=方位° p=傾き°
            extras.forEach(e => {
              const m = e.match(/^([hdp])=(.+)$/i);
              if (m) {
                const key = m[1].toLowerCase();
                const val = parseFloat(m[2]);
                if (!isNaN(val)) {
                  if (key === 'h') height = val;
                  else if (key === 'd') heading = val * Math.PI / 180;
                  else if (key === 'p') pitch = val * Math.PI / 180;
                }
              }
            });
          } else {
            // Positional mode (backward compat): 高度|方位|傾き
            if (extras.length > 0 && extras[0] !== '') height = parseFloat(extras[0]);
            if (extras.length > 1 && extras[1] !== '') heading = parseFloat(extras[1]) * Math.PI / 180;
            if (extras.length > 2 && extras[2] !== '') pitch = parseFloat(extras[2]) * Math.PI / 180;
            // NaN check
            if (height !== null && isNaN(height)) height = null;
            if (heading !== null && isNaN(heading)) heading = null;
            if (pitch !== null && isNaN(pitch)) pitch = null;
          }
          const cam = {
            title: parts[0] || ('Camera ' + (camsFound.length + 1)),
            lat: lat,
            lng: lng,
            height: height,
            heading: heading,
            pitch: pitch,
          };
          camsFound.push(cam);
          try { sendLog('[processInspectorText] found CAM:', cam.title, cam.lat, cam.lng, 'h:', cam.height, 'd:', cam.heading, 'p:', cam.pitch); } catch(e){}
        }
      }
      return;
    }
    
    // Tile: "xyz: Name | URL" or just "Name | URL" or "URL"
    let tileStr = line;
    if (lowerLine.startsWith('xyz:')) {
      tileStr = line.substring(4).trim();
    } else if (lowerLine.startsWith('tile:')) {
        // backward compatibility
        tileStr = line.substring(5).trim();
    }
    
    // Parse tile string
    let url = null;
    let title = null;
    
    if (tileStr.indexOf('|') !== -1) {
      const parts = tileStr.split('|').map(p => p.trim());
      // simple heuristic: which part looks like a URL?
      if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
      else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
    } else {
      if (tileStr.startsWith('http')) url = tileStr;
    }

    if (url) {
      tiles.push({ url, title });
    }
    nonCamLines.push(line);
  });

  // Apply Info URL
  if (infoUrlFound && infoUrlFound !== _lastInfoUrl) {
    try { sendLog('[processInspectorText] applying INFO url:', infoUrlFound); } catch(e){}
    _lastInfoUrl = infoUrlFound;
    loadInfoUrl(infoUrlFound);
  }

  // Preserve non-cam lines for rebuild
  _inspectorNonCamLines = nonCamLines;

  // Apply Camera Presets
  _cameraPresets = camsFound;

  // Apply Tiles
  if (tiles.length > 0) {
    try { sendLog('[processInspectorText] applying tiles:', tiles.length); } catch(e){}
    addXyzLayersFromArray(tiles);
  }

  // Re-render UI to reflect camera presets and other changes
  try { reearth.ui.show(getUI()); } catch(e){}
}

// Poll for property changes (Inspector edits) and react to URL changes
// Use a resilient polling mechanism that works even if setInterval is not available (e.g. in some sandbox envs)
(function startPolling() {
  const poll = function() {
    try {
      const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
      
      // Check inspectorText (Unified settings)
      const text = (prop.settings && prop.settings.inspectorText) || prop.inspectorText;
      
      if (text && typeof text === 'string' && text !== _lastInspectorLayersJson) {
         _lastInspectorLayersJson = text; // use text as cache key
         try { sendLog('[poll] inspector text changed, length:', text.length); } catch(e){}
         processInspectorText(text);
      }

      // Legacy/Direct checks (fallback)
      const url = prop?.inspectorUrl || prop?.inspectorText; // fallback if just a url string
      if (url && typeof url === "string" && /^https?:\/\//.test(url) && url !== _lastInspectorUrl) {
          _lastInspectorUrl = url;
          addXyzLayer(url, prop?.inspectorTitle);
      }
    } catch (e) {
      // ignore
    }
  };

  if (typeof setInterval === 'function') {
    setInterval(poll, 500);
  } else if (typeof setTimeout === 'function') {
    (function loop() { poll(); setTimeout(loop, 500); })();
  } else {
    // Fallback: run once if no timing APIs are available
    try { poll(); } catch (e) {}
  }
})();

// Add multiple layers from an array of inspector entries
function addXyzLayersFromArray(items) {
  if (!items || !Array.isArray(items)) return;
  const existing = (reearth.layers && reearth.layers.layers) || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const u = (it.url || it.inspectorUrl || "").trim();
    const t = (it.title || it.inspectorTitle || null);
    if (!u) continue;
    if (!/^https?:\/\//.test(u)) continue;
    const encoded = u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
    const dup = existing.find(l => l && l.data && l.data.url && (l.data.url === encoded || (typeof l.data.url === 'string' && l.data.url.indexOf(encoded) !== -1)));
    if (dup) {
      try { sendLog('[addXyzLayersFromArray] skip duplicate:', u); } catch(e){}
      continue;
    }
    addXyzLayer(u, t);
  }
}

// Send info URL to UI to load in iframe
function loadInfoUrl(url) {
  if (!url || typeof url !== 'string') return;
  try {
    try { sendLog('[loadInfo] sending URL to UI:', url); } catch(e){}
    if (reearth.ui && typeof reearth.ui.postMessage === 'function') {
      reearth.ui.postMessage({ action: 'loadInfoUrl', url: url });
    }
  } catch (e) {
    try { sendError('[loadInfo] ERROR:', e); } catch(err){}
  }
}
