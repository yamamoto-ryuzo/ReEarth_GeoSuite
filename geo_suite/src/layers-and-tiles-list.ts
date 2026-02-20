// @ts-nocheck
// Track layer IDs added by this plugin
const _pluginAddedLayerIds = new Set();
// Store user-defined visibility state to restore it if story/other plugins change it
const _userLayerVisibility = new Map();

// Track last values for polling
let _lastInspectorUrl = null;
let _lastInspectorApply = null;
let _lastInspectorLayersJson = null;
let _lastInfoUrl = null;
let _lastInspectorBackground = null;
let _cameraPresets = [];
let _inspectorNonCamLines = [];  // non-cam lines from inspector text, preserved for rebuild
let _baseUrl = null; // Base URL for permalink
let _parsedBaseTiles = []; // parsed base: entries for UI dropdown
let _inspectorLegendUrls = []; // cached legend URLs from inspector for initial UI render
let _lastAddedBasemapUrl = null; // encoded URL of the last-added basemap

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

  // Separate preset layers and plugin-added layers, but exclude basemap layers
  const presetLayers = [];
  const userLayers = [];
  layers.forEach(layer => {
    try {
      if (layer && layer.data && layer.data.isBasemap) {
        // skip basemap layers from both lists (they are handled by the Basemap dropdown)
        return;
      }
    } catch (e) {}
    if (_pluginAddedLayerIds.has(layer.id)) {
      userLayers.push(layer);
    } else {
      presetLayers.push(layer);
    }
  });
  
  const presetLayerItems = presetLayers.map(layer => generateLayerItem(layer, true)).join('');
  const userLayerItems = userLayers.map(layer => generateLayerItem(layer, false)).join('');

  // Basemap dropdown (show parsed base: entries if present)
  let basemapSelectHtml = '';
  try {
    if (_parsedBaseTiles && _parsedBaseTiles.length) {
      // determine currently active basemap url (visible layer flagged as basemap)
      const layersAll = (reearth.layers && reearth.layers.layers) || [];
      // Prefer last-added basemap URL (reliable), otherwise fall back to visible basemap layer
      let currentBasemapUrl = _lastAddedBasemapUrl || '';
      if (!currentBasemapUrl) {
        for (let i = 0; i < layersAll.length; i++) {
          const l = layersAll[i];
          if (l && l.data && l.data.isBasemap && l.visible) { currentBasemapUrl = l.data.url || ''; break; }
        }
      }

      // Build a deduplicated list of base entries using the same encoding used when creating layers
      const seen = new Set();
      const uniq = [];
      _parsedBaseTiles.forEach(b => {
        try {
          const encoded = encodeNonAscii((b && b.url) ? b.url : '');
          if (!encoded) return;
          if (seen.has(encoded)) return;
          seen.add(encoded);
          uniq.push({ url: b.url, encodedUrl: encoded, title: b.title });
        } catch (e) {}
      });

      basemapSelectHtml = `<div style="margin-bottom:8px;">
        <select id="basemap-select" style="width:100%;border:1px solid #ccc;border-radius:4px;padding:6px;background:#fff;">
          <option value="">(None)</option>
          ${uniq.map(b => {
            const titleAttr = (b.title||'').replace(/"/g,'&quot;');
            const display = (b.title||b.url);
              const selected = urlsEqual(b.encodedUrl, currentBasemapUrl) || urlsEqual(decodeURIComponent(currentBasemapUrl || ''), b.url || '') ? 'selected' : '';
            return `<option value="${b.encodedUrl}" data-title="${titleAttr}" ${selected}>${display}</option>`;
          }).join('')}
        </select>
      </div>`;
    }
  } catch(e) { basemapSelectHtml = ''; }

  // Generate camera preset buttons
  const camButtons = _cameraPresets.map((cam, i) => `
    <li class="cam-item" data-cam-index="${i}" title="FlyTo ${cam.title}">
      <span class="cam-title">${cam.title}</span>
      <div class="actions">
        <span style="font-size:0.8em;color:#888;">▶</span>
      </div>
    </li>
  `).join('');

  // Information panel content
  // (Info content will be loaded from configured URL and injected into #info-content)
  // Prepare legend HTML for initial render from cached inspector legend URLs
  const legendContentHtml = (_inspectorLegendUrls && _inspectorLegendUrls.length) ? _inspectorLegendUrls.map(u => `<img src="${u}" style="display:block;max-width:100%;margin-bottom:8px;border:1px solid #ccc;border-radius:4px;">`).join('') : '';
  
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

  /* Restore/Refresh button */
  .restore-all-btn {
    padding: 2px 8px;
    height: 1.6em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font-size: 0.85em;
    line-height: 1;
    cursor: pointer;
    background: #f0f0f0;
    border: 1px solid #ccc;
    color: #333;
  }
  .restore-all-btn:hover {
    background: #e0e0e0;
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
  .cam-item {
    cursor: pointer;
    transition: background-color 0.2s;
  }
  .cam-item:hover {
    background-color: rgba(230, 230, 230, 0.9);
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
    <button class="tab" data-target="legend-panel" aria-selected="false">Legend</button>
    <button class="tab" data-target="cams-panel" aria-selected="false">Cams</button>
    <button class="tab" data-target="info-panel" aria-selected="false">info</button>
    <button class="tab" data-target="share-panel" aria-selected="false">Share</button>
    <button class="tab" data-target="settings-panel" aria-selected="false">Set</button>
  </div>

  <div id="share-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;">Share / Permalink</div>
    <div style="margin-bottom:8px;">
        <p style="font-size:0.85em;color:#555;margin:4px 0;">Current Camera & Layer State</p>
        <button id="generate-permalink-btn" class="btn-primary p-8" style="width:100%;">Generate Link</button>
    </div>
    <div style="display:flex;gap:4px;">
        <input type="text" id="permalink-output" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:4px;font-size:0.85em;" readonly />
        <button id="copy-permalink-btn" class="btn-primary p-8" style="min-width:60px;">Copy</button>
    </div>
    
    <div style="margin-top:12px;border-top:1px solid #ddd;padding-top:8px;">
        <p style="font-size:0.85em;color:#555;margin:4px 0;">Import Permalink</p>
        <div style="display:flex;gap:4px;">
            <input type="text" id="import-permalink-input" placeholder="Paste URL or ?lat=..." style="flex:1;border:1px solid #ccc;border-radius:4px;padding:4px;font-size:0.85em;" />
            <button id="load-permalink-btn" class="btn-primary p-8" style="min-width:60px;">Load</button>
        </div>
        <div style="margin-top:6px;display:flex;gap:4px;">
            <button id="reload-from-url-btn" class="btn-primary p-8" style="width:100%;font-size:0.85em;">Reload from Browser URL</button>
        </div>
    </div>
  </div>

  <div id="layers-panel">
    ${basemapSelectHtml}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;">Layers</div>
      <div style="flex:0 0 auto; display:flex; gap:8px; align-items:center;">
        <a href="https://re-earth-geo-suite.vercel.app/#system-layer-note" target="_blank" rel="noopener noreferrer" style="font-size:0.85em;color:#000;text-decoration:none;border:1px solid #ccc;padding:2px 6px;border-radius:4px;">注意</a>
        <button class="restore-all-btn" id="restore-user-layers" title="Force Refresh User Layers">Refresh</button>
      </div>
    </div>
    
    <ul class="layers-list">
      ${presetLayerItems}
    </ul>
    ${userLayerItems ? `<div style="font-weight:600;margin-top:12px;margin-bottom:8px;">UserLayers</div><ul class="layers-list">${userLayerItems}</ul>` : ''}
  </div>

  <div id="cams-panel" style="display:none;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;">Camera Presets</div>
      <div style="flex:0 0 auto; display:flex; gap:8px; align-items:center;">
        <button id="cam-flyto-current" class="btn-primary p-8" title="Fly to Current Location">Fly to Current Location</button>
      </div>
    </div>
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

    <!-- Depth Test row: compact, placed under Shadow -->
    <div class="primary-background terrain-row rounded-sm" style="margin-bottom:8px;">
      <div class="text-md" id="depth-status">Depth Test: ON</div>
      <label class="toggle" id="depth-toggle" aria-label="Depth Test toggle">
        <input type="checkbox" id="toggleDepthSwitch">
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

  <div id="legend-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;">Legend</div>
    <div id="legend-content">${legendContentHtml}</div>
    <div id="legend-instruction" class="text-sm" style="color:#888;padding:8px 0;font-size:0.8em;">
      Add "legend: ImageURL" to inspector text.
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
              ['layers-panel','cams-panel','info-panel','settings-panel','legend-panel','share-panel'].forEach(id => {
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

            // Depth Test toggle
            const toggleDepth = document.getElementById('toggleDepthSwitch');
            const depthStatus = document.getElementById('depth-status');
            
            if (toggleDepth && depthStatus) {
              toggleDepth.addEventListener('change', function() {
                const checked = !!this.checked;
                depthStatus.textContent = checked ? 'Depth Test: ON' : 'Depth Test: OFF';
                if (window.parent) {
                  window.parent.postMessage({ action: "toggleDepthTest", enabled: checked }, "*");
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
                } else if (msg.action === 'depthTestState') {
                  const on = !!msg.enabled;
                  if (toggleDepth) toggleDepth.checked = on;
                  if (depthStatus) depthStatus.textContent = on ? 'Depth Test: ON' : 'Depth Test: OFF';
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
                } else if (msg.action === 'updateLegends') {
                  const container = document.getElementById('legend-content');
                  if(container && msg.urls) {
                    container.innerHTML = msg.urls.map(function(u){return '<img src="'+u+'" style="display:block;max-width:100%;margin-bottom:8px;border:1px solid #ccc;border-radius:4px;">'}).join('');
                    const instruction = document.getElementById('legend-instruction');
                    if (instruction) {
                      instruction.style.display = msg.urls.length > 0 ? 'none' : 'block';
                    }
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

        
      // Add event listener for 'Restore All' button
      const restoreBtn = document.getElementById("restore-user-layers");
      if (restoreBtn) {
        restoreBtn.addEventListener("click", () => {
          // Collect current checkbox states
          const requests = {};
          Array.from(document.querySelectorAll('input[data-layer-id]')).forEach(checkbox => {
             const id = checkbox.getAttribute('data-layer-id');
             if (id) requests[id] = !!checkbox.checked;
          });
          // Send restore command with current UI state
          parent.postMessage({ action: 'restoreUserLayers', requests: requests }, '*');
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

      // Add event listener for camera preset 'FlyTo' buttons (row click)
      document.querySelectorAll(".cam-item").forEach(item => {
        item.addEventListener("click", () => {
          const camIndex = item.getAttribute("data-cam-index");
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

      // FlyTo current geolocation (browser) -> send to parent as manual flyTo
      const flyToCurrentBtn = document.getElementById('cam-flyto-current');
      if (flyToCurrentBtn) {
        flyToCurrentBtn.addEventListener('click', function() {
            flyToCurrentBtn.textContent = 'Getting...';
            parent.postMessage({ action: 'requestGeolocation' }, '*');
            setTimeout(() => {
                 if(flyToCurrentBtn.textContent === 'Getting...') {
                     flyToCurrentBtn.textContent = 'Fly to Current Location';
                 }
            }, 8000);
        });
      }

      // Camera Refresh button: request current camera from extension
            // Basemap select handler: forward selection to extension
            try {
              const basel = document.getElementById('basemap-select');
              if (basel) {
                basel.addEventListener('change', function() {
                  const sel = this;
                  const url = sel.value || null;
                  const title = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].dataset.title : null;
                  parent.postMessage({ action: 'setBasemap', url: url, title: title }, '*');
                });
              }
            } catch(e) {}
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
          try { console.log('[UI] window.message received:', msg); } catch(e){}
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
          } else if (msg.action === 'geolocationResult') {
            const btn = document.getElementById('cam-flyto-current');
            if (msg.success) {
                if (btn) btn.textContent = 'Fly to Current Location';
                if (msg.layerId) {
                    setTimeout(() => {
                        parent.postMessage({ action: 'removeLayer', layerId: msg.layerId }, '*');
                    }, 5000);
                }
            } else {
                if (btn) {
                    btn.textContent = 'Error';
                    setTimeout(() => { btn.textContent = 'Fly to Current Location'; }, 2000);
                }
            }
          } else if (msg.action === 'permalinkGenerated') {
            const output = document.getElementById('permalink-output');
            if (output) {
                // Construct URL in UI context
                let baseUrl = msg.baseUrl; // Use base URL passed from extension if available
                
                if (!baseUrl) {
                    try {
                        // Try to get parent URL
                        if (document.referrer && document.referrer.startsWith('http')) {
                            baseUrl = document.referrer;
                        } else {
                            // If window.location.href is available and http (not about:srcdoc), use it
                            if (window.location.href && window.location.href.startsWith('http')) {
                                baseUrl = window.location.href;
                            } else {
                                // Fallback for srcdoc/sandbox
                                baseUrl = "https://reearth.io/";
                            }
                        }
                    } catch(e) {
                         baseUrl = "https://reearth.io/";
                    }
                }
                
                try {
                    const urlObj = new URL(baseUrl);
                    if (msg.lat != null) urlObj.searchParams.set('lat', msg.lat);
                    if (msg.lng != null) urlObj.searchParams.set('lng', msg.lng);
                    if (msg.height != null) urlObj.searchParams.set('height', msg.height);
                    if (msg.heading != null) urlObj.searchParams.set('heading', msg.heading);
                    if (msg.pitch != null) urlObj.searchParams.set('pitch', msg.pitch);
                    if (msg.layers) urlObj.searchParams.set('layers', msg.layers);
                    
                    output.value = urlObj.toString();
                } catch(e) {
                    output.value = baseUrl + "?error=url_construction_failed";
                }
            }
          }
        } catch(e){}
      });

      // Forward external applyPermalinkState messages to extension (with debug log)
      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data ? e.data : null;
          try { console.log('[UI] forward listener got message:', msg); } catch(e){}
          if (!msg || !msg.action) return;
          if (msg.action === 'applyPermalinkState') {
            try {
              try { console.log('[UI] forwarding applyPermalinkState to parent:', msg); } catch(e){}
              parent.postMessage(msg, '*');
            } catch(_){ try { console.error('[UI] forward to parent failed', _); } catch(e){} }
          }
        } catch (e) { try { console.error('[UI] forward listener error', e); } catch(err){} }
      });

      
      // Permalink UI handlers
      const generateBtn = document.getElementById('generate-permalink-btn');
      const copyBtn = document.getElementById('copy-permalink-btn');
      const output = document.getElementById('permalink-output');

      if (generateBtn) {
        generateBtn.addEventListener('click', function() {
            if (output) output.value = 'Generating...';
            // Send request to extension
            parent.postMessage({ action: 'generatePermalink' }, '*');
        });
      }

      if (copyBtn && output) {
        copyBtn.addEventListener('click', function() {
            output.select();
            document.execCommand('copy');
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = originalText; }, 2000);
        });
      }

      // Permalink Import Handler
      const importBtn = document.getElementById('load-permalink-btn');
      const importInput = document.getElementById('import-permalink-input');
      
      if (importBtn && importInput) {
          importBtn.addEventListener('click', function() {
              const val = importInput.value;
              if (!val) return;
              try {
                  // Attempt to parse params from input string
                  let params = null;
                  try {
                    if (val.indexOf('?') !== -1) {
                         const searchPart = val.substring(val.indexOf('?'));
                         params = new URLSearchParams(searchPart);
                    } else if (val.startsWith('http')) {
                         const urlObj = new URL(val);
                         params = urlObj.searchParams;
                    } else {
                         // assume it is just query string without ?
                         params = new URLSearchParams('?' + val);
                    }
                  } catch(e) {}

                  if (params) {
                      const payload = { action: 'applyPermalinkState' };
                      if (params.has('lat')) payload.lat = parseFloat(params.get('lat'));
                      if (params.has('lng')) payload.lng = parseFloat(params.get('lng'));
                      if (params.has('height')) payload.height = parseFloat(params.get('height'));
                      if (params.has('heading')) payload.heading = parseFloat(params.get('heading'));
                      if (params.has('pitch')) payload.pitch = parseFloat(params.get('pitch'));
                      if (params.has('layers')) payload.layers = params.get('layers');
                      
                      if (payload.lat !== undefined && !isNaN(payload.lat)) {
                          parent.postMessage(payload, '*');
                          importInput.value = ''; 
                          const originalText = importBtn.textContent;
                          importBtn.textContent = 'Loaded!';
                          setTimeout(() => { importBtn.textContent = originalText; }, 2000);
                      } else {
                          // alert('Invalid permalink: lat/lng parameters missing');
                          const originalText = importBtn.textContent;
                          importBtn.textContent = 'Invalid Data';
                          setTimeout(() => { importBtn.textContent = originalText; }, 2000);
                      }
                  } else {
                      // alert('Could not parse URL parameters');
                      const originalText = importBtn.textContent;
                      importBtn.textContent = 'Parse Error';
                      setTimeout(() => { importBtn.textContent = originalText; }, 2000);
                  }
              } catch(e) {
                  console.error('Failed to parse permalink', e);
                  // alert('Failed to parse URL');
                  const originalText = importBtn.textContent;
                  importBtn.textContent = 'Error';
                  setTimeout(() => { importBtn.textContent = originalText; }, 2000);
              }
          });
      }
      
      // Helper to parse query from string (handles ? and #)
      const parseParams = (str) => {
        try {
            const url = new URL(str, "https://dummy.com");
            // Merge search and hash params
            const params = new URLSearchParams(url.search);
            if (url.hash && url.hash.includes('?')) {
                const hashParams = new URLSearchParams(url.hash.substring(url.hash.indexOf('?')));
                hashParams.forEach((v, k) => params.set(k, v));
            } else if (url.hash && url.hash.includes('=')) {
                // simple hash params #k=v&k2=v2
                const hashParams = new URLSearchParams(url.hash.substring(1));
                hashParams.forEach((v, k) => params.set(k, v));
            }
            return params;
        } catch(e) { return null; }
      };

      // Helper to try reading params from window/parent
      const tryReadParams = () => {
          let p = null;
          // 1. Try window.location
          try { p = parseParams(window.location.href); } catch(e){}
          if (p && (p.has('lat') || p.has('layers'))) return p;

          // 2. Try parent location (if accessible)
          if (window.parent !== window) {
              try { p = parseParams(window.parent.location.href); } catch(e){}
              if (p && (p.has('lat') || p.has('layers'))) return p;
          }

          // 3. Try referrer
          if (document.referrer) {
               try { p = parseParams(document.referrer); } catch(e){}
               if (p && (p.has('lat') || p.has('layers'))) return p;
          }
          return null;
      };

      // Reload from URL button
      const reloadBtn = document.getElementById('reload-from-url-btn');
      if (reloadBtn) {
          reloadBtn.addEventListener('click', function() {
              const p = tryReadParams();
              if (p) {
                  const payload = { action: 'applyPermalinkState' };
                  if (p.has('lat')) payload.lat = parseFloat(p.get('lat'));
                  if (p.has('lng')) payload.lng = parseFloat(p.get('lng'));
                  if (p.has('height')) payload.height = parseFloat(p.get('height'));
                  if (p.has('heading')) payload.heading = parseFloat(p.get('heading'));
                  if (p.has('pitch')) payload.pitch = parseFloat(p.get('pitch'));
                  if (p.has('layers')) payload.layers = p.get('layers');
                  
                  if (payload.lat !== undefined && !isNaN(payload.lat)) {
                      parent.postMessage(payload, '*');
                      const originalText = reloadBtn.textContent;
                      reloadBtn.textContent = 'Restored!';
                      setTimeout(() => { reloadBtn.textContent = originalText; }, 2000);
                  } else {
                      // alert('URL found but no valid lat/lng parameters.');
                      const originalText = reloadBtn.textContent;
                      reloadBtn.textContent = 'No Lat/Lng';
                      setTimeout(() => { reloadBtn.textContent = originalText; }, 2000);
                  }
              } else {
                  // alert('Could not read URL parameters from browser address bar or referrer.');
                  const originalText = reloadBtn.textContent;
                  reloadBtn.textContent = 'No Params';
                  setTimeout(() => { reloadBtn.textContent = originalText; }, 2000);
              }
          });
      }

  });

  // On-screen plugin log removed (logs go to console only)

  // Initialize Permalink Logic (Apply state from URL)
  try {
    setTimeout(() => {
        // Simple heuristic for parsing params
        // Check standard URLSearchParams first
        let params = null;
        try {
            // Check location search
            params = new URLSearchParams(window.location.search);
        } catch(e) {}
        
        // Check hash if search failed or empty
        if ((!params || !params.has('lat')) && window.location.hash) {
             try {
                 // handle #lat=... or #/path?lat=...
                 let h = window.location.hash;
                 if (h.includes('?')) h = h.substring(h.indexOf('?'));
                 else if (h.startsWith('#')) h = h.substring(1);
                 const hashP = new URLSearchParams(h);
                 if (hashP.has('lat')) params = hashP;
             } catch(e){}
        }

        // Try parent URL if in iframe and same origin or accessible
        if ((!params || !params.has('lat')) && window.parent !== window) {
            try {
                // Parent search
                params = new URLSearchParams(window.parent.location.search);
                // Parent hash
                if (!params.has('lat') && window.parent.location.hash) {
                     let h = window.parent.location.hash;
                     if (h.includes('?')) h = h.substring(h.indexOf('?'));
                     else if (h.startsWith('#')) h = h.substring(1);
                     const hashP = new URLSearchParams(h);
                     if (hashP.has('lat')) params = hashP;
                }
            } catch(e){}
        }

        // Also try reading from document.referrer if parameters are missing
        if ((!params || !params.has('lat')) && document.referrer) {
             try {
                 const refUrl = new URL(document.referrer);
                 params = refUrl.searchParams;
                 // check hash in referrer too
                 if (!params.has('lat') && refUrl.hash) {
                     let h = refUrl.hash;
                     if (h.includes('?')) h = h.substring(h.indexOf('?'));
                     else if (h.startsWith('#')) h = h.substring(1);
                     const hashP = new URLSearchParams(h);
                     if (hashP.has('lat')) params = hashP;
                 }
             } catch(e){}
        }

        if (params && (params.has('lat') || params.has('layers'))) {
            const payload = { action: 'applyPermalinkState' };
            if (params.has('lat')) payload.lat = parseFloat(params.get('lat'));
            if (params.has('lng')) payload.lng = parseFloat(params.get('lng'));
            if (params.has('height')) payload.height = parseFloat(params.get('height'));
            if (params.has('heading')) payload.heading = parseFloat(params.get('heading'));
            if (params.has('pitch')) payload.pitch = parseFloat(params.get('pitch'));
            if (params.has('layers')) payload.layers = params.get('layers');
            
            parent.postMessage(payload, '*');
        }
    }, 500);
  } catch(e) { console.error(e); }

</script>
`;
}

// Initial render
// Ensure we process inspector property before first UI render so dropdown and layers reflect inspector
try { if (typeof tryInitFromProperty === 'function') tryInitFromProperty(); } catch(e) {}
// Also process full inspector text (multiline) if provided in widget/block property so getUI() reflects it
try {
  const propInit = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
  const textInit = (propInit.settings && propInit.settings.inspectorText) || propInit.inspectorText;
  const textToProcess = (textInit && typeof textInit === 'string' && textInit.trim()) ? textInit : _defaultInspectorText;
  if (textToProcess && textToProcess.trim()) {
    try { processInspectorText(textToProcess); } catch(e) { try { sendError('[init] processInspectorText failed', e); } catch(_){} }
  }
} catch(e) {}
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
    try { sendLog('[init] sending depthTest state to UI', { enabled: depthTest }); } catch(e){}
    reearth.ui.postMessage({ action: 'depthTestState', enabled: depthTest });
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

// Fallback-safe UI message sender: prefer reearth.ui.postMessage, fallback to parent.postMessage
function postToUI(msg) {
  try {
    if (reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') {
      try { sendLog('[postToUI] using reearth.ui.postMessage', msg && msg.action ? msg.action : msg); } catch (e) {}
      reearth.ui.postMessage(msg);
      return;
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && window.parent && typeof window.parent.postMessage === 'function') {
      try { sendLog('[postToUI] falling back to window.parent.postMessage', msg && msg.action ? msg.action : msg); } catch (e) {}
      window.parent.postMessage(msg, '*');
      return;
    }
  } catch (e) {}
  try {
    if (typeof parent !== 'undefined' && parent && typeof parent.postMessage === 'function') {
      try { sendLog('[postToUI] falling back to parent.postMessage', msg && msg.action ? msg.action : msg); } catch (e) {}
      parent.postMessage(msg, '*');
    }
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

// Normalize/compare URLs for basemap matching
function encodeNonAscii(u) {
  try {
    if (!u || typeof u !== 'string') return u;
    return u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  } catch (e) { return u; }
}

function tryDecode(u) {
  try { return decodeURIComponent(u); } catch (e) { return u; }
}

function urlsEqual(a, b) {
  if (a === b) return true;
  try {
    const da = tryDecode(a || '');
    const db = tryDecode(b || '');
    if (da === db) return true;
  } catch (e) {}
  try {
    if (encodeNonAscii(a || '') === encodeNonAscii(b || '')) return true;
  } catch (e) {}
  return false;
}

// Try multiple available APIs to set layer visibility, then re-render UI
function setLayerVisibility(layerId, visible) {
  if (!layerId) return false;
  try {
    // Prefer the show/hide API which works for system/preset layers in most runtimes
    if (reearth.layers && typeof reearth.layers.show === 'function' && typeof reearth.layers.hide === 'function') {
      if (visible) reearth.layers.show(layerId); else reearth.layers.hide(layerId);
      try { sendLog('[setLayerVisibility] used layers.show/hide', layerId, visible); } catch(_){}
      try { if (reearth.ui && typeof reearth.ui.show === 'function') reearth.ui.show(getUI()); } catch(_){}
      return true;
    }
    // Fallback: try update if available
    if (reearth.layers && typeof reearth.layers.update === 'function') {
      try {
        reearth.layers.update({ id: layerId, visible: !!visible });
        try { sendLog('[setLayerVisibility] used layers.update', layerId, visible); } catch(_){}
        try { if (reearth.ui && typeof reearth.ui.show === 'function') reearth.ui.show(getUI()); } catch(_){}
        return true;
      } catch (e) {
        try { sendError('[setLayerVisibility] layers.update threw', e); } catch(_){}
      }
    }
  } catch (e) {
    try { sendError('[setLayerVisibility] unexpected error', e); } catch(_){}
  }
  try { if (reearth.ui && typeof reearth.ui.show === 'function') reearth.ui.show(getUI()); } catch(_){}
  return false;
}

// Documentation on Extension "on" event: https://visualizer.developer.reearth.io/plugin-api/extension/#message-1
reearth.extension.on("message", async (msg) => {
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
    } else if (msg.action === "toggleDepthTest") {
      const bg = _lastInspectorBackground || "#ffffff";
      reearth.viewer.overrideProperty({
        globe: { depthTestAgainstTerrain: msg.enabled, baseColor: bg },
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
    } else if (msg.action === "restoreUserLayers") {
      restoreUserLayers(msg.requests, true);
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
    } else if (msg.action === "requestGeolocation") {
      try {
        const myLocation = await reearth.viewer.tools.getCurrentLocationAsync();
        if (myLocation) {
            reearth.camera.flyTo({
                lat: myLocation.lat,
                lng: myLocation.lng,
                height: 1000,
                heading: 0,
                pitch: -1.57,
                roll: 0,
            }, { duration: 2 });

            // Show temporary target marker (Modern Reticle Scope Style via CZML Billboard)
            let layerId;
            try {
                // Create SVG Reticle (Scope) - Simplified for robustness
                // Removed filters to avoid loading errors, using encodeURIComponent for data URI
                const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <!-- Outer Ring -->
  <circle cx="128" cy="128" r="110" fill="none" stroke="#00ffff" stroke-width="6" />
  <circle cx="128" cy="128" r="118" fill="none" stroke="#00ffff" stroke-width="2" opacity="0.5" />
  
  <!-- Crosshair -->
  <line x1="128" y1="60" x2="128" y2="196" stroke="#00ffff" stroke-width="3" />
  <line x1="60" y1="128" x2="196" y2="128" stroke="#00ffff" stroke-width="3" />
  
  <!-- Thick Posts -->
  <line x1="128" y1="0" x2="128" y2="60" stroke="#00ffff" stroke-width="14" />
  <line x1="128" y1="196" x2="128" y2="256" stroke="#00ffff" stroke-width="14" />
  <line x1="0" y1="128" x2="60" y2="128" stroke="#00ffff" stroke-width="14" />
  <line x1="196" y1="128" x2="256" y2="128" stroke="#00ffff" stroke-width="14" />
  
  <!-- Center Dot -->
  <circle cx="128" cy="128" r="4" fill="#ffffff" />
</svg>`.trim();

                // Use encodeURIComponent to create safe Data URI without base64 dependency
                const imageUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

                const czml = [
                  { "id": "document", "version": "1.0" },
                  {
                    "id": "current-location-scope",
                    "position": {
                      "cartographicDegrees": [myLocation.lng, myLocation.lat, 50] // 50m relative height
                    },
                    "billboard": {
                      "image": imageUri
                    }
                  }
                ];
                
                // Manual JSON stringify and base64 for the CZML data URL (not the image)
                // We still need base64 for the CZML file content itself because it's passed as data:application/json;base64,...
                const str = JSON.stringify(czml);
                let base64 = "";
                if (typeof btoa === 'function') {
                    base64 = btoa(str);
                } else if (typeof Buffer !== 'undefined') {
                    base64 = Buffer.from(str).toString('base64');
                } else {
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
                    for (let i = 0; i < str.length; i += 3) {
                        const c1 = str.charCodeAt(i), c2 = str.charCodeAt(i+1), c3 = str.charCodeAt(i+2);
                        base64 += chars.charAt(c1 >> 2);
                        base64 += chars.charAt(((c1 & 3) << 4) | ((c2 & 0xF0) >> 4));
                        base64 += chars.charAt(((c2 & 0xF) << 2) | ((c3 & 0xC0) >> 6));
                        base64 += chars.charAt(c3 & 0x3F);
                    }
                }

                const dataUrl = "data:application/json;base64," + base64;
                
                layerId = reearth.layers.add({
                    type: "simple",
                    title: "Current Location Scope",
                    data: {
                        type: "czml",
                        url: dataUrl
                    }
                });

                // Track this temporary layer so plugin can remove it later
                try { if (layerId) _pluginAddedLayerIds.add(layerId); } catch(e) {}

                // Note: We send layerId to UI, and UI will request removal after delay.
            } catch(e) {
                console.error("Failed to add CZML marker", e);
            }

            try { reearth.ui.postMessage({ action: 'geolocationResult', success: true, lat: myLocation.lat, lng: myLocation.lng, layerId: layerId }); } catch (e) { }
            try { sendLog('[requestGeolocation] flew to', myLocation.lat, myLocation.lng); } catch (e) { }
        } else {
             try { sendError('[requestGeolocation] location not found'); } catch (e) { }
             try { reearth.ui.postMessage({ action: 'geolocationResult', success: false, reason: 'not_found' }); } catch (e) { }
        }
      } catch (e) {
          try { sendError('[requestGeolocation] error:', e); } catch (err) { }
          try { reearth.ui.postMessage({ action: 'geolocationResult', success: false, reason: 'error' }); } catch (e) { }
      }
    } else if (msg.action === "removeLayer") {
        if (msg.layerId) {
            try { reearth.layers.delete(msg.layerId); } catch(e) {}
        }
    } else if (msg.action === 'setBasemap') {
      try {
        const url = msg.url || null;
        const title = msg.title || null;
        // Hide all existing basemap layers
        try {
          const layersAll = (reearth.layers && reearth.layers.layers) || [];
          for (let i = 0; i < layersAll.length; i++) {
            const l = layersAll[i];
            try {
              if (l && l.data && l.data.isBasemap && l.id) {
                if (typeof reearth.layers.hide === 'function') reearth.layers.hide(l.id);
                else if (typeof reearth.layers.update === 'function') reearth.layers.update({ id: l.id, visible: false });
              }
            } catch(e) {}
          }
        } catch(e) {}

        if (!url) {
          // none selected
          try { _lastAddedBasemapUrl = null; } catch(e){}
          try { reearth.ui.postMessage({ action: 'basemapChanged', url: null }); } catch(e){}
          try { reearth.ui.show(getUI()); } catch(e){}
          return;
        }

        // Try to find existing basemap layer with same URL
        const existing = (reearth.layers && reearth.layers.layers) || [];
        let found = null;
        for (let i = 0; i < existing.length; i++) {
          const l = existing[i];
          try {
            if (l && l.data && l.data.isBasemap && l.data.url && urlsEqual(l.data.url, url)) { found = l; break; }
          } catch(e){}
        }
        if (found) {
          try {
            if (typeof reearth.layers.show === 'function') reearth.layers.show(found.id);
            else if (typeof reearth.layers.update === 'function') reearth.layers.update({ id: found.id, visible: true });
            try { _lastAddedBasemapUrl = found.data && found.data.url ? found.data.url : _lastAddedBasemapUrl; } catch(e){}
          } catch(e){}
        } else {
          // add new basemap layer
          try { addXyzLayer(url, title || null, 'tiles', true); } catch(e){}
        }
        try { _lastAddedBasemapUrl = encodeNonAscii(url); } catch(e){}
        try { reearth.ui.postMessage({ action: 'basemapChanged', url: url }); } catch(e){}
        try { reearth.ui.show(getUI()); } catch(e){}
      } catch(e) {
        try { sendError('[setBasemap] error:', e); } catch(_){ }
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
      } else if (msg.action === "generatePermalink") {
        try {
            // 1. Get Camera
            let cur = null;
            try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch(e){}
            if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch(e){}
            if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch(e){}
            if (!cur) try { cur = (reearth.view && reearth.view.camera) ? reearth.view.camera : null; } catch(e){}
            if (!cur) try { cur = reearth.camera || null; } catch(e){}
            
            // 2. Get Layers Visibility
            const layers = (reearth.layers && reearth.layers.layers) || [];
            const visibleLayers = layers.filter(l => l.visible).map(l => l.id).join(',');
            
            const payload = {
                action: 'permalinkGenerated',
                layers: visibleLayers,
                baseUrl: _baseUrl // Pass configured base URL if available
            };

            if (cur) {
                  const rad2deg = (r) => typeof r === 'number' ? Math.round(r * 180 / Math.PI * 100000) / 100000 : 0;
                  const lat = cur.lat ?? cur.latitude ?? null;
                  const lng = cur.lng ?? cur.longitude ?? cur.lon ?? null;
                  const h = cur.height ?? cur.altitude ?? cur.alt ?? null;
                  const heading = cur.heading ?? cur.yaw ?? null;
                  const pitch = cur.pitch ?? cur.tilt ?? null;
                  
                  if (typeof lat === 'number') payload.lat = Math.round(lat * 1000000) / 1000000;
                  if (typeof lng === 'number') payload.lng = Math.round(lng * 1000000) / 1000000;
                  if (typeof h === 'number') payload.height = Math.round(h * 10) / 10;
                  if (typeof heading === 'number') payload.heading = rad2deg(heading);
                  if (typeof pitch === 'number') payload.pitch = rad2deg(pitch);
            }
            
            if (reearth.ui) {
                reearth.ui.postMessage(payload);
            }
        } catch (e) {
            try { sendError('[generatePermalink] error:', e); } catch(err){}
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
      } else if (msg.action === "applyPermalinkState") {
          try {
              // Apply camera immediately if provided
              if (msg.lat != null && msg.lng != null) {
                  try {
                    reearth.camera.flyTo({
                      lat: msg.lat,
                      lng: msg.lng,
                      height: msg.height || 1000,
                      heading: (msg.heading || 0) * Math.PI / 180,
                      pitch: (msg.pitch || -30) * Math.PI / 180,
                      roll: 0,
                    }, { duration: 0.1 });
                  } catch(e) { try { sendError('[applyPermalinkState] camera flyTo failed', e); } catch(err){} }
              }

              // Apply layers with retry in case layers are not yet loaded
              const applyLayersWithRetry = (layersStr, attempt = 1) => {
                try {
                  const maxAttempts = 8;
                  const delayMs = 800;
                  if (!layersStr) return;
                  const ids = layersStr.split(',').map(s => s.trim()).filter(Boolean);
                  if (!ids.length) return;

                  const layersApiAvailable = reearth.layers && Array.isArray(reearth.layers.layers);
                  if (!layersApiAvailable || (reearth.layers.layers && reearth.layers.layers.length === 0)) {
                    if (attempt <= maxAttempts) {
                      try { sendLog('[applyPermalinkState] layers not ready, retry', attempt); } catch(e){}
                      setTimeout(() => applyLayersWithRetry(layersStr, attempt + 1), delayMs);
                      return;
                    } else {
                      try { sendError('[applyPermalinkState] layers unavailable after retries'); } catch(e){}
                      try { reearth.ui.postMessage({ action: 'permalinkApplied', success: false, reason: 'layers_unavailable' }); } catch(e){}
                      return;
                    }
                  }

                  const layers = reearth.layers.layers || [];
                  const visibleIds = new Set(ids);
                  let applied = 0;
                  let found = 0;
                  for (let i = 0; i < layers.length; i++) {
                    const l = layers[i];
                    if (!l || !l.id) continue;
                    if (visibleIds.has(l.id)) {
                      found++;
                      if (!l.visible) {
                        try { reearth.layers.show(l.id); applied++; } catch(e) {}
                      }
                    } else {
                      if (l.visible) {
                        try { reearth.layers.hide(l.id); } catch(e) {}
                      }
                    }
                  }

                  try { sendLog('[applyPermalinkState] applied layers', { requested: ids.length, found: found, changed: applied }); } catch(e){}
                  try { reearth.ui.postMessage({ action: 'permalinkApplied', success: true, requested: ids.length, found: found, changed: applied }); } catch(e){}
                } catch(e) {
                  if (attempt <= 8) setTimeout(() => applyLayersWithRetry(layersStr, attempt + 1), 800);
                  else try { sendError('[applyPermalinkState] unexpected error applying layers', e); } catch(err){}
                }
              };

              if (msg.layers) applyLayersWithRetry(msg.layers);
          } catch(e) {
             try { sendError('[applyPermalinkState] error:', e); } catch(err){}
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
      try {
        setLayerVisibility(msg.layerId, false);
        _userLayerVisibility.set(msg.layerId, false);
      } catch (e) {
        try { sendError('[hide] error setting visibility', msg.layerId, e); } catch(_){}
      }
      break;
    case "show":
      try {
        setLayerVisibility(msg.layerId, true);
        _userLayerVisibility.set(msg.layerId, true);
      } catch (e) {
        try { sendError('[show] error setting visibility', msg.layerId, e); } catch(_){}
      }
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
    try { sendLog('[init] raw property object:', prop); } catch(e) {}
    try {
      // send property to UI for debugging (UI console will show it)
      try { postToUI({ action: 'debugInspectorProperty', prop: prop }); } catch(e) {}
    } catch(e) {}
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

function addXyzLayer(url, title, layerType, isBase = false) {
  if (!url || typeof url !== "string") return;
  const type = layerType || "tiles";
  let titleToUse = title;
  if (!titleToUse || typeof titleToUse !== 'string' || !titleToUse.trim()) {
    if (type === '3dtiles') titleToUse = `3D Tiles: ${url}`;
    else if (type === 'geojson') titleToUse = `GeoJSON: ${url}`;
    else if (type === 'tiles' && isBase) titleToUse = `Basemap: ${url}`;
    else titleToUse = `XYZ: ${url}`;
  } else {
    titleToUse = titleToUse.trim();
  }
  
  // Encode only non-ASCII characters but keep template braces {z}/{x}/{y} intact
  const encodedUrl = url.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  const layer = {
    type: "simple",
    title: titleToUse,
    visible: true,
    data: {
      type: type,
      url: encodedUrl,
    }
  };
  
  // Only add tiles property for XYZ layers
  if (type === "tiles") {
    layer.tiles = {};
  }

  // Mark as basemap when requested
  if (isBase) {
    try { sendLog('[addXyzLayer] marking as basemap'); } catch(e){}
    if (!layer.data) layer.data = { type: type, url: encodedUrl };
    layer.data.isBasemap = true;
    if (layer.tiles) layer.tiles.isBasemap = true;
  }

  // Add default styles for GeoJSON to ensure visibility
  if (type === 'geojson') {
    layer.marker = { pointColor: "#3388ff", pointSize: 10 };
    layer.polyline = { strokeColor: "#3388ff", strokeWidth: 2, clampToGround: true };
    layer.polygon = { fillColor: "#3388ff44", strokeColor: "#3388ff", strokeWidth: 2, heightReference: "clamp" };
  }

  try {
    sendLog("[addXyzLayer] received url:", url);
    sendLog("[addXyzLayer] encoded url:", encodedUrl);
    sendLog("[addXyzLayer] layer object:", layer);
    const newId = reearth.layers.add(layer);
    // Track this layer as plugin-added
    if (newId) {
      _pluginAddedLayerIds.add(newId);
    }
    sendLog(isBase ? "Added Basemap layer, id:" : "Added XYZ layer, id:", newId, "(src:", url, ")");
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
const _defaultInspectorText = `3dtiles: 東京都千代田区（建築物LOD1） | https://assets.cms.plateau.reearth.io/assets/0e/e5948a-e95c-4e31-be85-1f8c066ed996/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod1/tileset.json
geojson: 行政区域 | https://assets.cms.reearth.io/assets/ef/b1d062-e44b-4a19-8ebe-5fafeeba05f2/%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%9F%9F.geojson
background: #ffffff
info: https://re-earth-geo-suite.vercel.app/ryu.html
cam:東京駅|35.653108|139.761449|h=2200.6|p=-30
cam:富士山|35.139595|138.713803|h=9807.7|p=-24.72
cam:大阪城|34.658425|135.524574|h=2533.5||p=-40.37
base: OpenStreetMap | https://tile.openstreetmap.org/{z}/{x}/{y}.png
base: 地理院タイル 標準地図 | https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png 
base: 地理院タイル 淡色地図 | https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png
base: 地理院タイル 全国最新写真 | https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg`;

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
  // reset parsed base tiles to avoid duplicates when called repeatedly
  try { _parsedBaseTiles = []; } catch(e) {}
  // Handle various newline formats
  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
  const tiles = [];
  let infoUrlFound = null;
  const camsFound = [];
  const legends = [];
  const nonCamLines = [];  // preserve non-cam lines for rebuild

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
      // Legend: "legend: https://..."
      if (lowerLine.startsWith('legend:')) {
        const url = line.substring(7).trim();
        if (url) legends.push(encodeNonAscii(url));
        nonCamLines.push(line);
        return;
      }

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
            try { sendError('[processInspectorText] failed to apply background color', e); } catch(_){ }
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
        infoUrlFound = encodeNonAscii(url);
        try { sendLog('[processInspectorText] found INFO url:', infoUrlFound); } catch(e){}
      }
      nonCamLines.push(line);
      return;
    }

    // Base URL for permalink: "baseurl: https://..."
    if (lowerLine.startsWith('baseurl:')) {
      const url = line.substring(8).trim();
      if (url && /^https?:\/\//.test(url)) {
          _baseUrl = url;
          try { sendLog('[processInspectorText] found Base URL:', url); } catch(e){}
      }
      nonCamLines.push(line);
      return;
    }

    // Camera preset: "cam:タイトル|緯度|経度" + optional h=高度 d=方位° p=傾き°
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
          const extras = parts.slice(3);
          const hasNamedParam = extras.some(e => /^[hdp]=/i.test(e));
          if (hasNamedParam) {
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
            if (extras.length > 0 && extras[0] !== '') height = parseFloat(extras[0]);
            if (extras.length > 1 && extras[1] !== '') heading = parseFloat(extras[1]) * Math.PI / 180;
            if (extras.length > 2 && extras[2] !== '') pitch = parseFloat(extras[2]) * Math.PI / 180;
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

    // 3D Tiles
    if (lowerLine.startsWith('3dtiles:') || lowerLine.startsWith('3d-tiles:')) {
      const tileStr = line.substring(line.indexOf(':') + 1).trim();
      let url = null;
      let title = null;
      if (tileStr.indexOf('|') !== -1) {
        const parts = tileStr.split('|').map(p => p.trim());
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
      } else {
        if (tileStr.startsWith('http')) url = tileStr;
      }
      if (url) tiles.push({ url, title, type: '3dtiles' });
      nonCamLines.push(line);
      return;
    }

    // GeoJSON
    if (lowerLine.startsWith('geojson:')) {
      const geoStr = line.substring(8).trim();
      let url = null;
      let title = null;
      if (geoStr.indexOf('|') !== -1) {
        const parts = geoStr.split('|').map(p => p.trim());
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
      } else {
        if (geoStr.startsWith('http')) url = geoStr;
      }
      if (url) tiles.push({ url, title, type: 'geojson' });
      nonCamLines.push(line);
      return;
    }

    // Tile: xyz/tile/base
    let tileStr = line;
    let isBase = false;
    if (lowerLine.startsWith('xyz:')) tileStr = line.substring(4).trim();
    else if (lowerLine.startsWith('tile:')) tileStr = line.substring(5).trim();
    else if (lowerLine.startsWith('base:')) { tileStr = line.substring(5).trim(); isBase = true; }

    let url = null;
    let title = null;
    if (tileStr.indexOf('|') !== -1) {
      const parts = tileStr.split('|').map(p => p.trim());
      if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
      else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
    } else {
      if (tileStr.startsWith('http')) url = tileStr;
    }

    if (url) {
      tiles.push({ url, title, type: 'tiles', isBase: isBase });
      if (isBase) _parsedBaseTiles.push({ url, title });
    }
    nonCamLines.push(line);
  });

  // Defer sending legend/info messages until after UI is (re)rendered below

  _inspectorNonCamLines = nonCamLines;
  _cameraPresets = camsFound;
  try { _inspectorLegendUrls = (legends && legends.length) ? legends.map(u => { try { return encodeNonAscii(u); } catch(e){ return u; } }) : []; } catch(e) {}

  if (tiles.length > 0) {
    try { sendLog('[processInspectorText] applying tiles:', tiles.length); } catch(e){}
    addXyzLayersFromArray(tiles);
    // If no basemap has been selected via other means (permalink / UI),
    // prefer the first declared `base:` entry in inspector text as initial selection.
    try {
      if ((!_lastAddedBasemapUrl || _lastAddedBasemapUrl === '') && _parsedBaseTiles && _parsedBaseTiles.length) {
        try { _lastAddedBasemapUrl = encodeNonAscii(_parsedBaseTiles[0].url); } catch(e) {}
      }
    } catch(e) {}
    // If we chose an initial basemap URL, ensure only that basemap is visible
    try {
      if (_lastAddedBasemapUrl) {
        const layersAll = (reearth.layers && reearth.layers.layers) || [];
        for (let i = 0; i < layersAll.length; i++) {
          const l = layersAll[i];
          try {
            if (l && l.data && l.data.isBasemap && l.id) {
              if (urlsEqual(l.data.url, _lastAddedBasemapUrl)) {
                if (typeof reearth.layers.show === 'function') reearth.layers.show(l.id);
                else if (typeof reearth.layers.update === 'function') reearth.layers.update({ id: l.id, visible: true });
              } else {
                if (typeof reearth.layers.hide === 'function') reearth.layers.hide(l.id);
                else if (typeof reearth.layers.update === 'function') reearth.layers.update({ id: l.id, visible: false });
              }
            }
          } catch(e) {}
        }
        try { reearth.ui.show(getUI()); } catch(e) {}
      }
    } catch(e) {}
  }

  try { reearth.ui.show(getUI()); } catch(e){}

  // After UI render, send legend and info messages so iframe listeners are ready.
  // Use a short timeout to allow iframe initialization; log actions so we can debug.
  try {
    if (typeof setTimeout === 'function') {
      setTimeout(function() {
        try { sendLog('[processInspectorText] sending legends count:', legends ? legends.length : 0); } catch(e) {}
        try {
          if (legends && legends.length > 0) postToUI({ action: 'updateLegends', urls: legends });
        } catch(e) { try { sendError('[processInspectorText] updateLegends post failed', e); } catch(_) {} }

        try {
          if (infoUrlFound && infoUrlFound !== _lastInfoUrl) {
            try { sendLog('[processInspectorText] applying INFO url (deferred):', infoUrlFound); } catch(e) {}
            _lastInfoUrl = infoUrlFound;
            postToUI({ action: 'loadInfoUrl', url: infoUrlFound });
          }
        } catch(e) { try { sendError('[processInspectorText] loadInfoUrl post failed', e); } catch(_) {} }
      }, 50);
    } else {
      try { sendLog('[processInspectorText] sending legends count (no timeout):', legends ? legends.length : 0); } catch(e) {}
      try { if (legends && legends.length > 0) postToUI({ action: 'updateLegends', urls: legends }); } catch(e) {}
      try {
        if (infoUrlFound && infoUrlFound !== _lastInfoUrl) {
          try { sendLog('[processInspectorText] applying INFO url (immediate):', infoUrlFound); } catch(e) {}
          _lastInfoUrl = infoUrlFound;
          postToUI({ action: 'loadInfoUrl', url: infoUrlFound });
        }
      } catch(e) {}
    }
  } catch(e) { try { sendError('[processInspectorText] deferred post error', e); } catch(_) {} }
}

function restoreUserLayers(userRequests, force = false) {
  if (!reearth.layers || !reearth.layers.layers) return;
  try {
    const currentLayers = reearth.layers.layers;
    // Create a map for faster lookup (O(1) instead of O(N) inside loop)
    const layerMap = new Map();
    if (Array.isArray(currentLayers)) {
      for (let i = 0; i < currentLayers.length; i++) {
        const l = currentLayers[i];
        if (l && l.id) layerMap.set(l.id, l);
      }
    }

    // Apply visibility based on requests from UI
    if (userRequests && typeof userRequests === 'object') {
        for (const [id, desired] of Object.entries(userRequests)) {
             // update internal state
             _userLayerVisibility.set(id, desired);
        }
    }

    // Restore from internal state
    for (const [id, desired] of _userLayerVisibility.entries()) {
      const layer = layerMap.get(id);
      if (layer) {
        // If force is true, update regardless of current state.
        // If force is false (auto-check), only update if state differs.
        if (force || layer.visible !== desired) {
            if (typeof reearth.layers.show === 'function' && typeof reearth.layers.hide === 'function') {
                if (desired) reearth.layers.show(id);
                else reearth.layers.hide(id);
            } else if (typeof reearth.layers.update === 'function') {
                reearth.layers.update({ id: id, visible: !!desired });
            }
        }
      }
    }
  } catch(e) {
    // ignore errors during restore
  }
}

// Poll for property changes (Inspector edits) and react to URL changes
// Use a resilient polling mechanism that works even if setInterval is not available (e.g. in some sandbox envs)
(function startPolling() {
  
  // Note: Automatic restoration via events (update, cameramove, etc.) was attempted but found unreliable in Story mode.
  // Therefore, we rely solely on the manual "Refresh" button for restoring user layers.
  // This keeps the plugin simple and performant.

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
    const type = it.type || "tiles";
    const isBase = !!it.isBase;
    if (!u) continue;
    if (!/^https?:\/\//.test(u)) continue;
    const encoded = u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
    const dup = existing.find(l => l && l.data && l.data.url && (l.data.url === encoded || (typeof l.data.url === 'string' && l.data.url.indexOf(encoded) !== -1)));
    if (dup) {
      try { sendLog('[addXyzLayersFromArray] skip duplicate:', u); } catch(e){}
      continue;
    }
    addXyzLayer(u, t, type, isBase);
  }
}

// Send info URL to UI to load in iframe
function loadInfoUrl(url) {
  if (!url || typeof url !== 'string') return;
  try {
    try { sendLog('[loadInfo] sending URL to UI:', url); } catch(e){}
    try { postToUI({ action: 'loadInfoUrl', url: url }); } catch(e) {}
  } catch (e) {
    try { sendError('[loadInfo] ERROR:', e); } catch(err){}
  }
}

// --- Permalink Restoration Logic ---
// Note: This logic has been moved to UI initialization (see getUI script)
// because extension sandbox cannot access window.location.
// However, we still need a handler for 'applyPermalinkState' (added below).
