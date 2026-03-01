// @ts-nocheck
// Track layer IDs added by this plugin
const _pluginAddedLayerIds = new Set();
// Track layers that need to be hidden shortly after creation (workaround for initial load issues)
const _layersPendingHide = new Set();
// Store user-defined visibility state to restore it if story/other plugins change it
const _userLayerVisibility = new Map();
// Marker TTL and map of scheduled timers by layerId
const MARKER_TTL_MS = 8000;
const _markerTimers = Object.create(null);

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
let _inspectorYahooAppId = null; // optional yahooAppId read from inspector text

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

const generateLayerItem = (layer, isPreset, displayName) => {
  const name = (typeof displayName === 'string' && displayName.trim()) ? displayName.trim() : (layer && layer.title ? layer.title : 'Layer');
  // Check if this layer is pending hide (was added visible:true but requested OFF)
  const isPendingHide = layer && layer.id && _layersPendingHide.has(layer.id);
  // If pending hide, show as unchecked (OFF) in UI
  const isChecked = !isPendingHide && layer.visible;
  
  return `
    <li class="layer-item">
      <div class="layer-item-left">
        <input
          class="layer-checkbox"
          type="checkbox"
          data-layer-id="${layer.id}"
          data-is-plugin-added="${!isPreset}"
          ${isChecked ? "checked" : ""}
          ${isPendingHide ? 'data-pending-hide="true"' : ""}
        />
        <span class="layer-name" title="${name}">${name}</span>
      </div>
      <div class="actions">
        <button class="btn-icon move-btn" data-layer-id="${layer.id}" aria-label="Move" title="Move Camera">📍</button>
      </div>
    </li>
  `;
};

// Note: preset layer items are generated dynamically inside getUI()

function getUI() {
  try {
    // Build layer items from current layers so UI reflects runtime changes
    // Coerce `reearth.layers.layers` into a real array to guard against Proxy/iterable-like objects
    let layers = [];
    try {
      const raw = (reearth.layers && reearth.layers.layers);
      if (!raw) {
        layers = [];
      } else if (Array.isArray(raw)) {
        layers = raw;
      } else if (typeof raw.forEach === 'function') {
        // array-like with forEach
        layers = raw;
      } else if (typeof raw === 'object') {
        try { layers = Object.values(raw); } catch(e) { layers = [] }
      } else {
        layers = [];
      }
    } catch (e) {
      layers = [];
    }
  
  // Check if layers are available
  if (!layers.length) {
    console.warn('[getUI] No layers found.');
    // Do not return early here — still render the UI so users can add layers
    // even when there are currently no layers present.
  }

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

  // Helper: build nested tree from layers using either layer.data.group (preferred)
  // or fallback to title split by '/'. Returns a root node.
  // Parse group string allowing '//' to indicate exclusive (radio) grouping between segments.
  const parseGroupPath = (groupStr) => {
    // returns array of { seg, sepChar, sepCount, exclusiveAfter, expandAfter }
    // sepChar: '/' or '\\' (string), sepCount: number of separators after this segment
    // exclusiveAfter: true if separator count >= 2 (// or \\\\)
    // expandAfter: true if separator char is backslash (\\) => expand children by default
    const res = [];
    if (!groupStr || typeof groupStr !== 'string') return res;
    let i = 0;
    let cur = '';
    while (i < groupStr.length) {
      const ch = groupStr[i];
      if (ch === '/' || ch === "\\") {
        // count repeated same-type separators
        let j = i;
        while (j < groupStr.length && groupStr[j] === ch) j++;
        const sepCount = j - i;
        if (cur !== '') {
          res.push({ seg: cur, sepChar: ch, sepCount: sepCount, exclusiveAfter: (sepCount >= 2), expandAfter: (ch === "\\") });
          cur = '';
        }
        i = j;
      } else {
        cur += ch;
        i++;
      }
    }
    if (cur !== '') res.push({ seg: cur, sepChar: null, sepCount: 0, exclusiveAfter: false, expandAfter: false });
    return res;
  };

  const buildTree = (arr) => {
    const root = { name: null, children: new Map(), layers: [], allLayerIds: [], exclusive: false };
    arr.forEach(layer => {
      try {
        // Determine path segments with exclusive markers
        let parsed = [];
        if (layer && layer.data && typeof layer.data.group === 'string' && layer.data.group.trim()) {
          parsed = parseGroupPath(layer.data.group.trim());
        } else if (layer && typeof layer.title === 'string' && (layer.title.indexOf('/') !== -1 || layer.title.indexOf('\\') !== -1)) {
          // Fallback: parse title with same parser
          const temp = parseGroupPath(layer.title.trim()).filter(p => p && p.seg).map(p => ({ seg: p.seg.trim(), exclusiveAfter: p.exclusiveAfter, expandAfter: p.expandAfter }));
          // For title-based grouping, the last segment is the layer name itself, not a group folder.
          if (temp.length > 0) temp.pop();
          parsed = temp;
        } else {
          parsed = [];
        }

        // Insert into tree, honoring exclusiveAfter flags
        let node = root;
        if (layer && layer.id) root.allLayerIds.push(layer.id);
        for (let k = 0; k < parsed.length; k++) {
          const seg = (parsed[k].seg || '').trim();
          const exclusiveAfter = !!parsed[k].exclusiveAfter;
          const expandAfter = !!parsed[k].expandAfter;

          // Normalize group identity by segment name only so mixed separators
          // ("/" vs "\\") yield the same group when the name matches.
          const key = seg;

          if (!node.children.has(key)) {
             node.children.set(key, {
               name: seg,
               children: new Map(),
               layers: [],
               allLayerIds: [],
               exclusive: exclusiveAfter,
               expanded: expandAfter
             });
          } else {
            // Merge semantics when the same-named group appears with different
            // separators: exclusive is true if any appearance is exclusive;
            // expanded is true if any appearance used backslash (expandAfter).
            const existing = node.children.get(key);
            existing.exclusive = existing.exclusive || exclusiveAfter;
            existing.expanded = existing.expanded || expandAfter;
          }

          node = node.children.get(key);
          if (layer && layer.id) node.allLayerIds.push(layer.id);
        }
        node.layers.push(layer);
      } catch (e) {}
    });
    return root;
  };

  // Helper: render tree to nested HTML. `pathPrefix` is used to compute data-group-path
  const renderNode = (node, pathPrefix = '') => {
    // Add exclusive class if this node is marked exclusive (meaning its children are exclusive)
    const isExclusiveNode = !!node.exclusive;
    // Determine collapsed state based on node.expanded (root is always expanded)
    const collapsed = pathPrefix ? !node.expanded : false;
    const style = collapsed ? 'style="display:none;"' : '';
    let html = `<ul class="layers-list ${isExclusiveNode ? 'exclusive-list' : ''}" ${style}>`;
    // First render direct layers at this node
    node.layers.forEach(layer => {
      // If title contained '/', and node path came from title, use last segment as displayName
      let displayName = null;
      try {
        if ((!layer.data || !layer.data.group) && layer.title && layer.title.indexOf('/') !== -1) {
          const parts = layer.title.split('/').map(s => s.trim()).filter(Boolean);
          if (parts.length) displayName = parts[parts.length - 1];
        }
      } catch (e) {}
      // include parent group path so layer checkbox handlers can detect exclusive groups
      html += generateLayerItem(layer, _pluginAddedLayerIds.has(layer.id) ? false : true, displayName).replace('<input', `<input data-parent-group-path="${pathPrefix}"`);
    });

    // Then render child groups
    for (const [seg, child] of node.children) {
      try {
        const groupPath = pathPrefix ? (pathPrefix + '/' + seg) : seg;
        const childIds = (child.allLayerIds && child.allLayerIds.length) ? child.allLayerIds.join(',') : '';
        const isExclusive = !!child.exclusive;

        const childCollapsed = !child.expanded;
        html += `
          <li class="layer-group">
            <div class="group-header ${childCollapsed ? 'collapsed' : ''}">
                <input type="checkbox" class="group-checkbox" data-group-path="${groupPath}" data-child-ids="${childIds}" data-exclusive="${isExclusive ? 'true' : 'false'}" checked />
                <span class="group-name">${child.name}</span>
            </div>
            ${renderNode(child, groupPath)}
          </li>
        `;
      } catch (e) {}
    }

    html += '</ul>';
    return html;
  };

  const combinedLayerItems = renderNode(buildTree(presetLayers.concat(userLayers)));

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
          uniq.push({ url: b.url, encodedUrl: encoded, title: b.title, attribution: b.attribution });
        } catch (e) {}
      });

      basemapSelectHtml = `<div style="margin-bottom:8px;">
        <select id="basemap-select" style="width:100%;border:1px solid #ccc;border-radius:4px;padding:6px;background:#fff;">
          <option value="">(None)</option>
          ${uniq.map(b => {
            const titleAttr = (b.title||'').replace(/"/g,'&quot;');
            const attributionAttr = encodeURIComponent(b.attribution||'');
            const display = (b.title||b.url);
              const selected = urlsEqual(b.encodedUrl, currentBasemapUrl) || urlsEqual(decodeURIComponent(currentBasemapUrl || ''), b.url || '') ? 'selected' : '';
            return `<option value="${b.encodedUrl}" data-title="${titleAttr}" data-attribution="${attributionAttr}" ${selected}>${display}</option>`;
          }).join('')}
        </select>
        <div id="basemap-attribution" style="font-size:0.7em;color:#000000;margin-top:2px;min-height:1em;padding-left:2px;overflow-wrap:break-word;"></div>
      </div>`;
    }
  } catch(e) { basemapSelectHtml = ''; }

  // Generate camera preset buttons
  const camButtons = _cameraPresets.map((cam, i) => `
    <li class="cam-item" data-cam-index="${i}" title="FlyTo ${cam.title}">
      <span class="cam-title">${cam.title}</span>
      <div class="actions">
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
  .primary-background.minimized #info-panel,
  .primary-background.minimized #legend-panel,
  .primary-background.minimized #share-panel { display:none !important; }

  /* Generic styling system that provides consistent UI components and styling across all plugins */

  /* Panel Scroll Configuration */
  /* Limit panels to fixed height to ensure scrollbar appears even if window auto-resizes */
  #layers-panel, #cams-panel, #settings-panel, #search-panel {
    max-height: 600px;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 4px;
  }

  /* List itself creates no scrollbar, the panel does */
  .layers-list {
    overflow: visible;
    padding-right: 0;
  }
  
  /* Keep search results contained */
  #search-results {
    max-height: 50vh;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); border-radius: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }

  @import url("https://reearth.github.io/visualizer-plugin-sample-data/public/css/preset-ui.css");

  /* Plugin-specific styling */
  .layers-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  
  /* layer items (rows) */
  .layer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 1px 0;
    padding: 3px 6px;
    line-height: 1.2;
    background-color: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(4px);
    min-height: 1.6em;
    border-radius: 6px;
    transition: background-color 0.15s, transform 0.1s;
    border: 1px solid rgba(0,0,0,0.05);
  }
  .layer-item:hover {
    background-color: rgba(255, 255, 255, 0.95);
    border-color: rgba(0,0,0,0.1);
  }

  .layer-item-left {
    display: flex;
    align-items: center;
    flex: 1;
    overflow: hidden;
    gap: 4px;
  }

  .layer-name{
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
    font-size: 0.9em;
    font-weight: 500;
    color: #333;
    cursor: pointer;
  }
  .layer-name:hover {
    color: #000;
  }

  /* nested lists: indent to show tree structure */
  .layers-list ul {
    /* Further tighten nested list left spacing */
    margin-left: 4px;
    padding-left: 4px;
    border-left: none;
    margin-top: 4px;
    margin-bottom: 4px;
  }
  
  /* Group Header Styling */
  .group-header {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 3px 4px;
    margin-top: 2px;
    margin-bottom: 1px;
    background-color: rgba(240, 242, 245, 0.8);
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.15s;
    user-select: none;
    gap: 4px;
  }
  .group-header:hover {
    background-color: rgba(230, 235, 240, 0.9);
  }
  
  .group-name {
    font-weight: 600;
    font-size: 0.9em;
    color: #444;
    flex: 1;
  }

  /* Custom triangle for open/close using CSS border */
  .group-header .group-name:before {
    content: "";
    display: inline-block;
    width: 0; 
    height: 0; 
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid #666; /* pointing down */
    margin-right: 8px;
    transform: rotate(0deg);
    transition: transform 0.2s ease;
    vertical-align: middle;
    opacity: 0.7;
  }
  /* Collapsed state: pointing right */
  .group-header.collapsed .group-name:before {
    transform: rotate(-90deg);
  }

  /* Exclusive group styling */
  /* Indicator on group name -> Badge style */
  input[data-exclusive="true"] + .group-name::after {
    content: "Exclusive";
    display: inline-block;
    font-size: 0.7em;
    background-color: #667eea;
    color: white;
    padding: 1px 5px;
    border-radius: 4px;
    margin-left: 8px;
    vertical-align: middle;
    font-weight: normal;
    opacity: 0.8;
  }
  
  /* Make children of exclusive groups look like radio buttons */
  .exclusive-list .layer-checkbox {
    border-radius: 50%;
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border: 1.5px solid #bbb;
    background-color: #fff;
    display: inline-block;
    position: relative;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .exclusive-list .layer-checkbox:checked {
    border-color: #667eea;
    background-color: #fff;
  }
  .exclusive-list .layer-checkbox:checked::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: #667eea;
  }
  
  /* Standard Checkbox styling */
  .layer-checkbox, .group-checkbox {
    cursor: pointer;
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: #667eea; 
  }

  .actions{
    display: flex;
    gap: 6px;
    align-items: center;
  }
  
  .btn-icon.move-btn {
    border: none;
    background: transparent;
    color: #666;
    cursor: pointer;
    opacity: 0.6;
    font-size: 1.2em;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }
  .btn-icon.move-btn:hover {
    opacity: 1;
    color: #333;
    background: rgba(0,0,0,0.05);
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
    <button class="tab" data-target="search-panel" aria-selected="false">Search</button>
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

  <div id="search-panel" style="display:none;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;">Search (Yahoo)</div>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;">
      <input type="text" id="search-query" placeholder="検索ワードを入力" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;" />
      <button id="search-btn" class="btn-primary p-8">Search</button>
    </div>
    <div id="search-results" style="max-height:320px;overflow:auto;">
      <ul id="search-results-list" style="list-style:none;padding:0;margin:0;"></ul>
    </div>
    <div style="font-size:0.9em;color:#a33;margin-top:8px;">注意: yahooAppIdは漏洩する可能性があります。公開サイトでは使用しないでください。</div>
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
      ${combinedLayerItems}
    </ul>
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
  // Inject inspector-provided AppID into UI (only source of AppID)
  try { window._yahooAppId = ${JSON.stringify(_inspectorYahooAppId || '')}; } catch(e) {}
  // Terrain toggle: send action messages to parent
  document.addEventListener('DOMContentLoaded', function() {
      // Process pending hides (layers that were added as visible:true but need to be hidden)
      try {
        const pendingHides = document.querySelectorAll('input[data-pending-hide="true"]');
        if (pendingHides.length > 0) {
           setTimeout(() => {
             pendingHides.forEach(el => {
                const id = el.getAttribute('data-layer-id');
                if (id) {
                   // Send hide message to parent (Extension)
                   // Extension handles the actual reearth.layers.hide call
                   try { 
                     // Also ensure checkbox is unchecked (it should be already due to template logic)
                     el.checked = false;
                     // Send message
                     if (window.parent) window.parent.postMessage({ type: 'hide', layerId: id }, '*');
                   } catch(e){}
                }
             });
           }, 500); // 500ms delay to allow initial load in Cesium
        }
      } catch(e) { console.error('pending hide processing failed', e); }

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
              ['layers-panel','legend-panel','search-panel','cams-panel','info-panel','share-panel','settings-panel'].forEach(id => {
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

        
      const toggleLayer = (layerId, isVisible) => {
        try {
          if (layerId) {
            parent.postMessage({ type: isVisible ? 'show' : 'hide', layerId: layerId }, '*');
          }
        } catch(e) {}
      };

      const refreshUserLayers = () => {
          // Iterate UI checkboxes. First hide all layers that are checked (to force reset),
          // then after a short delay, show them sequentially.
          const checkboxes = Array.from(document.querySelectorAll('input[data-layer-id]'));
          
          // 1. Ensure all unchecked layers are hidden, and momentarily hide checked layers too.
          checkboxes.forEach(checkbox => {
            const id = checkbox.getAttribute('data-layer-id');
            if (id) toggleLayer(id, false);
          });

          // 2. After a delay, show the checked layers from top to bottom sequentially.
          // Increase initial delay to 300ms to mimic manual operation.
          let delay = 300;
          for (let i = 0; i < checkboxes.length; i++) {
            const checkbox = checkboxes[i];
            const id = checkbox.getAttribute('data-layer-id');
            if (id && checkbox.checked) {
               setTimeout(() => toggleLayer(id, true), delay);
            }
          }
      };

      // Add event listener for 'Restore All' button
      const restoreBtn = document.getElementById("restore-user-layers");
      if (restoreBtn) {
        restoreBtn.addEventListener("click", () => {
           refreshUserLayers();
        });
      }

      // Add event listener for 'Show/Hide' for all layers (preset + plugin-added)
      Array.from(document.querySelectorAll('input[data-layer-id]')).forEach(checkbox => {
        try {
          // Allow clicking layer name to toggle checkbox
          const layerName = checkbox.nextElementSibling;
          if (layerName && layerName.classList.contains('layer-name')) {
            layerName.addEventListener('click', (e) => {
               e.preventDefault();
               checkbox.click();
            });
          }

          checkbox.addEventListener('change', event => {
            try {
              const layerId = event.target.getAttribute('data-layer-id');
              const isVisible = !!event.target.checked;
              
              toggleLayer(layerId, isVisible);
              
              // If a child is turned ON, ensure the parent group checkbox is visually ON.
              // This is a UI-only update and does not trigger the group's change event (no messages sent).
              try {
                if (isVisible) {
                  const parentPath = event.target.getAttribute('data-parent-group-path') || '';
                  if (parentPath) {
                    // Find direct parent group checkbox
                    const groupEl = document.querySelector('input[data-group-path="' + parentPath + '"]');
                    if (groupEl && !groupEl.checked) {
                      groupEl.checked = true;
                    }
                    // Also ensure ancestors are checked if needed (optional, but good for consistency)
                     const parts = parentPath.split('/');
                     let currentPath = '';
                     parts.forEach(part => {
                       currentPath = currentPath ? currentPath + '/' + part : part;
                       const ancestor = document.querySelector('input[data-group-path="' + currentPath + '"]');
                       if (ancestor && !ancestor.checked) ancestor.checked = true;
                     });
                  }
                }
              } catch(e){}

              // Enforce exclusivity: if this layer was turned ON and its parent group is exclusive, hide siblings
              try {
                if (isVisible) {
                  const parentPath = event.target.getAttribute('data-parent-group-path') || '';
                  if (parentPath) {
                    const groupEl = document.querySelector('input[data-group-path="' + parentPath + '"]');
                    if (groupEl && groupEl.getAttribute('data-exclusive') === 'true') {
                      // hide all other siblings in same parent group
                      Array.from(document.querySelectorAll('input[data-parent-group-path="' + parentPath + '"]')).forEach(cb => {
                        try {
                          const otherId = cb.getAttribute('data-layer-id');
                          if (otherId && otherId !== layerId) {
                            cb.checked = false;
                            try { parent.postMessage({ type: 'hide', layerId: otherId }, '*'); } catch(e){}
                          }
                        } catch(e){}
                      });
                    }
                  }
                }
              } catch(e){}
            } catch (e) {}
          });
        } catch (e) {}
      });

      // Add event listener for group toggles (checkboxes that control descendant layers)
      Array.from(document.querySelectorAll('input[data-group-path]')).forEach(gcb => {
        try {
          gcb.addEventListener('change', event => {
            try {
              const checked = !!event.target.checked;
              const isExclusive = event.target.getAttribute('data-exclusive') === 'true';

              // Restrict affected checkboxes to those inside this group's DOM subtree
              // This avoids touching unrelated checkboxes that may have been included
              // in data-child-ids due to parsing/aggregation.
              const groupItem = event.target.closest('.layer-group');
              if (!groupItem) return;

              // Find checkboxes for child layers inside this group's nested list
              const childCheckboxes = Array.from(groupItem.querySelectorAll('input[data-layer-id]'));

              if (isExclusive && checked) {
                // Enable only the first visible child checkbox, disable others
                let firstFound = null;
                for (let i = 0; i < childCheckboxes.length; i++) {
                  try {
                    const cb = childCheckboxes[i];
                    const id = cb.getAttribute('data-layer-id');
                    if (!id) continue;
                    if (firstFound === null) {
                      firstFound = id;
                      cb.checked = true;
                      try { parent.postMessage({ type: 'show', layerId: id }, '*'); } catch(e){}
                    } else {
                      cb.checked = false;
                      try { parent.postMessage({ type: 'hide', layerId: id }, '*'); } catch(e){}
                    }
                  } catch(e){}
                }
                // Ensure group checkbox remains checked
                event.target.checked = true;
              } else {
                // Non-exclusive group: set all descendant child checkboxes to the group's state
                childCheckboxes.forEach(cb => {
                  try {
                    const id = cb.getAttribute('data-layer-id');
                    if (!id) return;
                    cb.checked = checked;
                    try { parent.postMessage({ type: checked ? 'show' : 'hide', layerId: id }, '*'); } catch(e){}
                  } catch(e){}
                });
              }
            } catch (e) {}
          });
        } catch (e) {}
      });

      // Add click-to-collapse behavior for group headers (toggle visibility of nested UL)
      Array.from(document.querySelectorAll('.group-header')).forEach(header => {
        try {
          header.addEventListener('click', function(e) {
            // Ignore clicks on the checkbox inside header
            try {
              const tgt = e.target || e.srcElement;
              if (tgt && (tgt.tagName === 'INPUT' || tgt.type === 'checkbox')) return;
            } catch (err) {}
            try {
              const next = this.nextElementSibling;
              if (!next) return;
              const collapsed = this.classList.toggle('collapsed');
              next.style.display = collapsed ? 'none' : '';
            } catch (err) {}
          });
        } catch (e) {}
      });

      // Initialize group checkbox states based on descendant layer checkboxes
      try {
        Array.from(document.querySelectorAll('input[data-group-path]')).forEach(gcb => {
          try {
            const idsAttr = gcb.getAttribute('data-child-ids') || '';
            const ids = idsAttr.split(',').map(s => s.trim()).filter(Boolean);
            if (!ids.length) return;
            const isExclusive = gcb.getAttribute('data-exclusive') === 'true';

            if (isExclusive) {
               // For exclusive groups:
               // 1. Find which children are currently checked
               const checkedChildren = ids.filter(id => {
                  const cb = document.querySelector('input[data-layer-id="' + id + '"]');
                  return cb ? !!cb.checked : false;
               });

               if (checkedChildren.length === 0) {
                 // CASE: No child is ON -> Force First Child ON
                 if (ids.length > 0) {
                   const firstId = ids[0];
                   const cb = document.querySelector('input[data-layer-id="' + firstId + '"]');
                   if (cb) cb.checked = true;
                   parent.postMessage({ type: 'show', layerId: firstId }, '*');
                 }
               } else {
                 // CASE: One or more children are ON
                 if (checkedChildren.length === 1) {
                   // already exactly one ON: keep as is
                 } else {
                   // 2つ以上ONの場合: 先頭の子 (ids[0]) をON にし、他は全てOFF
                   const firstId = ids[0];
                   ids.forEach(id => {
                     try {
                       const cb = document.querySelector('input[data-layer-id="' + id + '"]');
                       if (!cb) return;
                       if (id === firstId) {
                         if (!cb.checked) {
                           cb.checked = true;
                           parent.postMessage({ type: 'show', layerId: id }, '*');
                         }
                       } else {
                         if (cb.checked) {
                           cb.checked = false;
                           parent.postMessage({ type: 'hide', layerId: id }, '*');
                         }
                       }
                     } catch(e){}
                   });
                 }
               }
               // Exclusive group is always ON (as one child is enforced ON)
               gcb.checked = true;
               // Ensure ancestor group checkboxes reflect the enforced state
               try {
                 const parentPath = gcb.getAttribute('data-group-path') || '';
                 if (parentPath) {
                   const parts = parentPath.split('/');
                   let currentPath = '';
                   parts.forEach(part => {
                     currentPath = currentPath ? currentPath + '/' + part : part;
                     const ancestor = document.querySelector('input[data-group-path="' + currentPath + '"]');
                     if (ancestor && !ancestor.checked) ancestor.checked = true;
                   });
                 }
               } catch(e) {}

            } else {
              // Normal group: If any child is checked, set group to checked
              const anyChecked = ids.some(id => {
                const cb = document.querySelector('input[data-layer-id="' + id + '"]');
                return cb ? !!cb.checked : false;
              });
              gcb.checked = anyChecked;
            }
          } catch(e){}
        });
      } catch(e) {}

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
      const manualFlyToBtn = document.getElementById('cam-manual-flyto');
      if (manualFlyToBtn) {
        manualFlyToBtn.addEventListener('click', function() {
            try {
               const latIn = document.getElementById('cam-lat');
               const lngIn = document.getElementById('cam-lng');
               const hIn = document.getElementById('cam-height');
               const headIn = document.getElementById('cam-heading');
               const pitchIn = document.getElementById('cam-pitch');
               
               if (latIn && lngIn) {
                   const lat = parseFloat(latIn.value);
                   const lng = parseFloat(lngIn.value);
                   const height = hIn ? parseFloat(hIn.value) : 1000;
                   const headingDeg = headIn ? parseFloat(headIn.value) : 0;
                   const pitchDeg = pitchIn ? parseFloat(pitchIn.value) : -90;
                   
                   if (!isNaN(lat) && !isNaN(lng)) {
                      parent.postMessage({
                         action: "flyToManual",
                         lat: lat,
                         lng: lng,
                         height: isNaN(height) ? 1000 : height,
                         heading: isNaN(headingDeg) ? 0 : headingDeg * Math.PI / 180, // to Radians
                         pitch: isNaN(pitchDeg) ? -Math.PI/2 : pitchDeg * Math.PI / 180 // to Radians
                      }, "*");
                   }
               }
            } catch(e) {}
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
              
              // Helper to update attribution display
              const updateAttr = () => {
                const sel = document.getElementById('basemap-select');
                const attrEl = document.getElementById('basemap-attribution');
                if (sel && attrEl) {
                  const opt = sel.options[sel.selectedIndex];
                  let attr = (opt && opt.dataset.attribution) ? opt.dataset.attribution : '';
                  try { attr = decodeURIComponent(attr); } catch(e){}
                  
                  // Ensure we have a string
                  if (!attr) attr = '';

                  // Remove any HTML tags to disable links (requested behavior)
                  // This keeps the text content (e.g. "OpenStreetMap contributors") but removes the clickable link.
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = attr;
                  attr = tempDiv.textContent || tempDiv.innerText || '';

                  attrEl.innerHTML = attr;
                  attrEl.style.pointerEvents = 'none'; // Ensure no interaction even if something remains
                }
              };

              if (basel) {
                // Initialize attribution on load
                updateAttr();

                basel.addEventListener('change', function() {
                  const sel = this;
                  const url = sel.value || null;
                  const title = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].dataset.title : null;
                  
                  updateAttr();
                  
                  parent.postMessage({ action: 'setBasemap', url: url, title: title }, '*');
                  
                  // Trigger layer refresh/reset when basemap changes
                  try { refreshUserLayers(); } catch(e){}
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
      
      // UI-managed map of scheduled removal timers for temporary marker layers
      const _uiMarkerRemovalTimers = Object.create(null);
      function scheduleLayerRemoval(layerId, ttlMs = 8000) {
        try {
          if (!layerId) return;
          // clear existing timer for this layer if present
          if (_uiMarkerRemovalTimers[layerId]) {
            try { clearTimeout(_uiMarkerRemovalTimers[layerId]); } catch(e) {}
            try { delete _uiMarkerRemovalTimers[layerId]; } catch(e) {}
          }
          try { console.log('[UI] scheduleLayerRemoval', layerId, ttlMs); } catch(e) {}
          _uiMarkerRemovalTimers[layerId] = setTimeout(() => {
            try { parent.postMessage({ action: 'removeLayer', layerId: layerId }, '*'); } catch(e) {}
            try { delete _uiMarkerRemovalTimers[layerId]; } catch(e) {}
          }, ttlMs);
        } catch(e) {}
      }

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
            try {
              const btn = document.getElementById('cam-flyto-current');
              try { console.log('[UI] geolocationResult received:', msg); } catch(e) {}
              if (msg.success) {
                if (btn) btn.textContent = 'Fly to Current Location';
                try {
                  if (msg.layerId) {
                    // Use shared scheduler so search and geolocation both trigger removal
                    scheduleLayerRemoval(msg.layerId, 8000);
                  }
                } catch(e) {}
              } else {
                if (btn) {
                  btn.textContent = 'Error';
                  setTimeout(() => { btn.textContent = 'Fly to Current Location'; }, 2000);
                }
              }
            } catch(e) { try { console.error('[UI] btn update error', e); } catch(_){} }

                // (deprecated) 'searchFlyMarker' handling removed; geolocationResult now used uniformly

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

      // --- Search (Yahoo API) handlers ---
      try {
        const searchInput = document.getElementById('search-query');
        const searchBtn = document.getElementById('search-btn');
        const resultsList = document.getElementById('search-results-list');

        const renderSearchResults = (items) => {
          if (!resultsList) return;
          resultsList.innerHTML = '';
          if (!items || !items.length) {
            const li = document.createElement('li');
            li.style.padding = '8px';
            li.style.color = '#666';
            li.textContent = 'No results';
            resultsList.appendChild(li);
            return;
          }
          items.forEach((it, i) => {
            try {
              const li = document.createElement('li');
              li.style.padding = '8px';
              li.style.borderBottom = '1px solid #eee';
              li.style.display = 'flex';
              li.style.justifyContent = 'space-between';
              li.style.alignItems = 'center';

              const info = document.createElement('div');
              info.style.flex = '1';
              info.style.marginRight = '8px';
              const title = document.createElement('div');
              title.style.fontWeight = '600';
              title.style.fontSize = '0.95em';
              title.textContent = it.name || it.title || '';
              const addr = document.createElement('div');
              addr.style.fontSize = '0.85em';
              addr.style.color = '#555';
              addr.textContent = it.address || it.Address || '';
              info.appendChild(title);
              info.appendChild(addr);

              const actions = document.createElement('div');
              actions.style.display = 'flex';
              actions.style.gap = '6px';

              const flyBtn = document.createElement('button');
              flyBtn.className = 'btn-primary p-6';
              flyBtn.textContent = 'Fly';
              flyBtn.addEventListener('click', () => {
                try {
                  const coords = it.coordinates || it.Coordinates || it.geometry || it.Geometry || null;
                  let lat = null, lng = null;
                  if (it.geometry && it.geometry.coordinates) {
                    // GeoJSON style [lng, lat]
                    lng = parseFloat(it.geometry.coordinates[0]);
                    lat = parseFloat(it.geometry.coordinates[1]);
                  } else if (it.Geometry && it.Geometry.Coordinates) {
                    const parts = String(it.Geometry.Coordinates || it.coordinates || '').split(',');
                    if (parts.length >= 2) { lng = parseFloat(parts[0]); lat = parseFloat(parts[1]); }
                  } else if (it.coordinates && typeof it.coordinates === 'string') {
                    const parts = it.coordinates.split(','); if (parts.length>=2) { lng = parseFloat(parts[0]); lat = parseFloat(parts[1]); }
                  } else if (it.lon && it.lat) { lat = parseFloat(it.lat); lng = parseFloat(it.lon); }

                  if (!isNaN(lat) && !isNaN(lng)) {
                    // send heading/pitch in degrees: heading 0 = north, pitch -90 = top-down
                    // For search-origin flies we do not create a temporary marker (use plain flyTo)
                    parent.postMessage({ action: 'flyMoveMarkAndNotify', lat: lat, lng: lng, height: 1000, heading: 0, pitch: -90, addMarker: false }, '*');
                  }
                } catch (e) { console.error('search fly error', e); }
              });

              actions.appendChild(flyBtn);
              li.appendChild(info);
              li.appendChild(actions);
              resultsList.appendChild(li);
            } catch (e) {}
          });
        };

        const performSearch = async (q) => {
          if (!q || !q.trim()) { renderSearchResults([]); return; }
          // Check whether server has a configured YAHOO_APPID; if so, prefer server-side key and
          // do not send inspector AppID from the client. If not, fall back to inspector-provided AppID.
          let serverHasAppId = false;
          try {
            const envRes = await fetch('https://re-earth-geo-suite.vercel.app/api/yahoo-env');
            if (envRes && envRes.ok) {
              const envJson = await envRes.json();
              serverHasAppId = !!(envJson && envJson.hasAppId);
            }
          } catch (e) { /* ignore, assume no server-side key */ }

          const inspectorAppId = (window && window._yahooAppId) ? window._yahooAppId : null;
          if (!serverHasAppId && !inspectorAppId) {
            resultsList.innerHTML = '<li style="padding:8px;color:#a00;">AppIDが設定されていません。プラグインのインスペクターに次の行を追加してください：<div style="margin-top:6px;padding:6px;background:#fff;color:#111;border-radius:4px;font-family:monospace;display:inline-block;">yahooAppId: あなたのYahoo AppID</div></li>';
            return;
          }

          // Call server proxy using GET to avoid CORS preflight. If server has key, do not include appid in query.
          const proxyEndpoint = 'https://re-earth-geo-suite.vercel.app/api/yahoo-search';
          try {
            // expose query for debugging and notify parent that search started
            try { window._lastYahooQuery = q; if (window.parent) window.parent.postMessage({ action: 'yahooDebug', event: 'search-start', query: q }, '*'); } catch(e){}
            resultsList.innerHTML = '<li style="padding:8px;color:#666;">Searching...</li>';
            const url = proxyEndpoint + '?query=' + encodeURIComponent(q) + (serverHasAppId ? '' : ('&appid=' + encodeURIComponent(inspectorAppId || '')));
            const res = await fetch(url, { method: 'GET' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            // Yahoo Local Search returns Feature array
            const features = (data && data.Feature) ? data.Feature : [];
            const items = features.map(f => {
              const coord = (f && f.Geometry && f.Geometry.Coordinates) ? String(f.Geometry.Coordinates) : (f && f.geometry && f.geometry.coordinates ? f.geometry.coordinates.join(',') : null);
              const addr = (f && f.Property && f.Property.Address) ? f.Property.Address : (f && f.Property && f.Property.Address) ? f.Property.Address : '';
              return { name: (f.Name || f.name || (f.Property && f.Property.Title) || ''), address: addr, Geometry: f.Geometry, geometry: f.geometry, coordinates: coord };
            });
            // notify parent with basic result info for debugging
            try { if (window.parent) window.parent.postMessage({ action: 'yahooDebug', event: 'search-result', query: q, count: (items && items.length) || 0, raw: data }, '*'); } catch(e){}
            renderSearchResults(items);
          } catch (e) {
            try { console.error('Yahoo search failed', e); } catch(_){ }
            try { if (window.parent) window.parent.postMessage({ action: 'yahooDebug', event: 'search-error', query: q, detail: String(e) }, '*'); } catch(_){}
            if (resultsList) resultsList.innerHTML = '<li style="padding:8px;color:#900;">検索に失敗しました。AppID設定やネットワーク（CORS）を確認してください。</li>';
          }
        };

        if (searchBtn && searchInput) {
          searchBtn.addEventListener('click', () => performSearch(String(searchInput.value || '')));
          searchInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); performSearch(String(searchInput.value || '')); } });
        }
      } catch (e) { console.error('search init failed', e); }

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
  } catch (e) {
    try {
      sendError('[getUI] unexpected error', e, {
        reearthLayersType: typeof (reearth && reearth.layers && reearth.layers.layers),
        sample: safeStringify((reearth && reearth.layers && reearth.layers.layers) ? (Array.isArray(reearth.layers.layers) ? (reearth.layers.layers.slice ? reearth.layers.layers.slice(0,5) : reearth.layers.layers) : Object.keys(reearth.layers.layers || {}).slice(0,10)) : null)
      });
    } catch (_) {}
    return `<div style="padding:8px;color:#c00;">UI error</div>`;
  }
}

// Initial render
// Ensure we process inspector property before first UI render so dropdown and layers reflect inspector
try { if (typeof tryInitFromProperty === 'function') tryInitFromProperty(); } catch(e) {}
// Also process full inspector text (multiline) if provided in widget/block property so getUI() reflects it
try {
  const propInit = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
  const textInit = (propInit.settings && propInit.settings.inspectorText) || propInit.inspectorText;
  // If inspector property exists (even empty string), prefer it. Only fall back to _defaultInspectorText when property is undefined.
  const textToProcess = (typeof textInit === 'string') ? textInit : _defaultInspectorText;
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
    // Do NOT send yahooAppId via postMessage; only use inspector-provided `yahooAppId:` line
  
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

// Wrapper for reearth.ui.show(getUI()) that logs caller stack for debugging
function safeShowUI(context) {
  try {
    try { sendLog('[safeShowUI] context:', context); } catch(e){}
    // capture stack to help identify call sites at runtime
    try { sendLog('[safeShowUI] stack:', (new Error()).stack); } catch(e){}
    if (reearth && reearth.ui && typeof reearth.ui.show === 'function') {
      try { reearth.ui.show(getUI()); } catch(e) { try { sendError('[safeShowUI] show failed', e); } catch(_){} }
    }
  } catch (e) {
    try { sendError('[safeShowUI] unexpected', e); } catch(_){}
  }
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
function setLayerVisibility(layerId, visible, renderUI = true) {
  if (!layerId) return false;
  try {
    // Prefer update API first to avoid potential show() side-effects (like moving layer to top).
    if (reearth.layers && typeof reearth.layers.update === 'function') {
      try {
        reearth.layers.update({ id: layerId, visible: !!visible });
        try { sendLog('[setLayerVisibility] used layers.update', layerId, visible); } catch(_){ }
        try { if (renderUI) safeShowUI('setLayerVisibility'); } catch(_){ }
        return true;
      } catch (e) {
        try { sendError('[setLayerVisibility] layers.update threw', e); } catch(_){ }
      }
    }
    // Fallback: use show/hide if update is not available
    if (reearth.layers && typeof reearth.layers.show === 'function' && typeof reearth.layers.hide === 'function') {
      if (visible) reearth.layers.show(layerId); else reearth.layers.hide(layerId);
      try { sendLog('[setLayerVisibility] used layers.show/hide', layerId, visible); } catch(_){ }
      try { if (renderUI) safeShowUI('setLayerVisibility'); } catch(_){ }
      return true;
    }
  } catch (e) {
    try { sendError('[setLayerVisibility] unexpected error', e); } catch(_){ }
  }
  try { if (renderUI) safeShowUI('setLayerVisibility'); } catch(_){ }
  return false;
}
// Utility: add a temporary target marker (returns layerId or null)
async function addTargetMarker(lat, lng) {
  try {
    const svg = [
'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
'  <!-- Outer Ring -->',
'  <circle cx="128" cy="128" r="110" fill="none" stroke="#00ffff" stroke-width="6" />',
'  <circle cx="128" cy="128" r="118" fill="none" stroke="#00ffff" stroke-width="2" opacity="0.5" />',
'  ',
'  <!-- Crosshair -->',
'  <line x1="128" y1="60" x2="128" y2="196" stroke="#00ffff" stroke-width="3" />',
'  <line x1="60" y1="128" x2="196" y2="128" stroke="#00ffff" stroke-width="3" />',
'  ',
'  <!-- Thick Posts -->',
'  <line x1="128" y1="0" x2="128" y2="60" stroke="#00ffff" stroke-width="14" />',
'  <line x1="128" y1="196" x2="128" y2="256" stroke="#00ffff" stroke-width="14" />',
'  <line x1="0" y1="128" x2="60" y2="128" stroke="#00ffff" stroke-width="14" />',
'  <line x1="196" y1="128" x2="256" y2="128" stroke="#00ffff" stroke-width="14" />',
'  ',
'  <!-- Center Dot -->',
'  <circle cx="128" cy="128" r="4" fill="#ffffff" />',
'</svg>'
    ].join('\n').trim();

    const imageUri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

    const feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: [lng, lat] }
    };

    let layerId = null;
    try {
      try { sendLog('[addTargetMarker] adding marker at', lat, lng); } catch(e){}
      layerId = reearth.layers.add({
        type: "simple",
        title: "Target Marker",
        data: {
          type: "geojson",
          value: {
            type: "FeatureCollection",
            features: [feature]
          }
        },
        marker: {
          style: "image",
          image: imageUri,
          imageSize: 0.6,
          heightReference: "clamp",
          height: 0
        }
      });
      try { sendLog('[addTargetMarker] reearth.layers.add returned', layerId); } catch(e){}
    } catch (e) {
      try { sendError('[addTargetMarker] reearth.layers.add threw:', e); } catch(_) {}
    }

    if (layerId) {
      try { _pluginAddedLayerIds.add(layerId); } catch (_) {}
    }
    return layerId || null;
  } catch (e) {
    try { sendError('[addTargetMarker] error:', e); } catch(_) {}
    return null;
  }
}

// (Removed token-based pending flow; UI will receive `searchFlyMarker` with `layerId` and schedule removal)


// Utility: remove a target marker by layerId (safe wrapper)
function removeTargetMarker(layerId) {
  try {
    if (!layerId) {
      try { sendLog('[removeTargetMarker] no layerId provided'); } catch(_){}
      return false;
    }

    try { sendLog('[removeTargetMarker] attempting to remove layerId:', layerId); } catch(_){}

    // List layers before removal for diagnostics
    try {
      if (reearth && reearth.layers) {
        const listFn = (typeof reearth.layers.list === 'function') ? reearth.layers.list : null;
        const layersBefore = listFn ? listFn() : (reearth.layers.layers || []);
        try { sendLog('[removeTargetMarker] layers before remove count:', (layersBefore && layersBefore.length) || 0); } catch(_){}
        try { sendLog('[removeTargetMarker] layers before sample:', safeStringify((layersBefore || []).slice(-5).map(l => ({ id: l && l.id, title: l && l.title })))); } catch(_){}
      }
    } catch (e) {
      try { sendError('[removeTargetMarker] error listing layers before remove', e); } catch(_){}
    }

    let removed = false;

    // Try removal attempts (multiple immediate tries to handle environment quirks)
    try {
      if (reearth && reearth.layers) {
        const tryRemoveOnce = () => {
          try {
            if (typeof reearth.layers.delete === 'function') {
              try { reearth.layers.delete(layerId); } catch (e) { try { sendError('[removeTargetMarker] delete threw', e); } catch(_){} }
            } else if (typeof reearth.layers.remove === 'function') {
              try { reearth.layers.remove(layerId); } catch (e) { try { sendError('[removeTargetMarker] remove threw', e); } catch(_){} }
            } else {
              try { sendError('[removeTargetMarker] no delete/remove API available on reearth.layers'); } catch(_){}
            }
          } catch (e) { try { sendError('[removeTargetMarker] tryRemoveOnce error', e); } catch(_){} }
        };

        // Initial attempt + a few immediate retries
        tryRemoveOnce();
        for (let i = 0; i < 2; i++) tryRemoveOnce();
      }
    } catch (e) {
      try { sendError('[removeTargetMarker] remove attempt error', e); } catch(_){}
    }

    // clear any scheduled timer for this layer
    try {
      if (_markerTimers && _markerTimers[layerId]) {
        try { clearTimeout(_markerTimers[layerId]); } catch(e) {}
        try { delete _markerTimers[layerId]; } catch(e) {}
      }
    } catch(e) {}

    try { _pluginAddedLayerIds.delete(layerId); } catch (e) {}

    // Verify whether the layer still exists; if so, try a fallback (hide via update)
    try {
      const listFn = (reearth && reearth.layers && typeof reearth.layers.list === 'function') ? reearth.layers.list : null;
      const layersAfter = listFn ? listFn() : (reearth && reearth.layers && reearth.layers.layers ? reearth.layers.layers : []);
      const existsAfter = Array.isArray(layersAfter) && layersAfter.some(l => l && l.id === layerId);
      try { sendLog('[removeTargetMarker] existsAfter initial check?', existsAfter); } catch(_){}
      if (!existsAfter) {
        removed = true;
      } else {
        // Fallback: try hide (update) if available
        try {
          if (reearth && reearth.layers && typeof reearth.layers.update === 'function') {
            try { reearth.layers.update({ id: layerId, visible: false }); } catch (e) { try { sendError('[removeTargetMarker] update threw', e); } catch(_){} }
            try { sendLog('[removeTargetMarker] fallback update visible:false called for', layerId); } catch(_){}
          }
        } catch (e) { try { sendError('[removeTargetMarker] fallback update error', e); } catch(_){} }

        // Re-check presence
        const layersFinal = listFn ? listFn() : (reearth && reearth.layers && reearth.layers.layers ? reearth.layers.layers : []);
        const existsFinal = Array.isArray(layersFinal) && layersFinal.some(l => l && l.id === layerId);
        try { sendLog('[removeTargetMarker] existsAfter final check?', existsFinal); } catch(_){}
        removed = !existsFinal;
      }
    } catch (e) {
      try { sendError('[removeTargetMarker] error verifying existence', e); } catch(_){}
      removed = false;
    }

    // List layers after removal for diagnostics
    try {
      if (reearth && reearth.layers) {
        const listFn2 = (typeof reearth.layers.list === 'function') ? reearth.layers.list : null;
        const layersAfter2 = listFn2 ? listFn2() : (reearth.layers.layers || []);
        try { sendLog('[removeTargetMarker] layers after remove count:', (layersAfter2 && layersAfter2.length) || 0); } catch(_){}
        try { sendLog('[removeTargetMarker] layers after sample:', safeStringify((layersAfter2 || []).slice(-5).map(l => ({ id: l && l.id, title: l && l.title })))); } catch(_){}
      }
    } catch (e) {
      try { sendError('[removeTargetMarker] error listing layers after remove', e); } catch(_){}
    }

    try { sendLog('[removeTargetMarker] removed?', removed); } catch(_){}
    return removed;
  } catch (e) {
    try { sendError('[removeTargetMarker] error', e); } catch(_){}
    return false;
  }
}

// Helper: obtain current location in a runtime-safe way
async function getCurrentLocation() {
  try {
    // Prefer viewer.tools.getCurrentLocationAsync when available
    if (reearth && reearth.viewer && reearth.viewer.tools && typeof reearth.viewer.tools.getCurrentLocationAsync === 'function') {
      try { sendLog('[getCurrentLocation] using viewer.tools.getCurrentLocationAsync'); } catch(e){}
      const loc = await reearth.viewer.tools.getCurrentLocationAsync();
      if (loc && (loc.lat != null || loc.lng != null)) return loc;
    }

    // Fallbacks: try common camera/location properties
    try { sendLog('[getCurrentLocation] trying fallback location sources'); } catch(e){}
    let cur = null;
    try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch(e){}
    if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch(e){}
    if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch(e){}
    if (!cur) try { cur = (reearth.view && reearth.view.camera) ? reearth.view.camera : null; } catch(e){}
    if (!cur) try { cur = reearth.camera || null; } catch(e){}
    if (cur && (cur.lat != null || cur.latitude != null)) {
      const lat = cur.lat ?? cur.latitude ?? null;
      const lng = cur.lng ?? cur.longitude ?? cur.lon ?? null;
      if (lat != null && lng != null) return { lat, lng };
    }
    return null;
  } catch (e) {
    try { sendError('[getCurrentLocation] error:', e); } catch(_){}
    return null;
  }
}

// Helper: fly camera to coordinates, optionally add marker and notify UI
// opts: { height, headingRad, pitchRad, duration, addMarker, postSearchFlyMarker }
async function flyToAndNotify(lat, lng, opts) {
  // Use opts if provided, otherwise fallback to defaults (height=1000, pitch=-90deg)
  const duration = (opts && typeof opts.duration === 'number') ? opts.duration : 2;
  const addMarkerFlag = !(opts && opts.addMarker === false);
  try { sendLog('[flyToAndNotify] addMarkerFlag:', addMarkerFlag); } catch(e){}

  try {
    const dest = { lat: lat, lng: lng };
    
    // Defaults: for pinpoint (search) flies we prefer a top-down view.
    // If no camera params are provided in `opts` (common for search-origin flows),
    // set sensible defaults so the camera looks straight down at the coordinate.
    const defaultHeight = 1000;
    const defaultHeading = 0;
    const defaultPitch = -Math.PI / 2; // top-down
    const defaultRoll = 0;

    const hasCameraParams = opts && (typeof opts.height === 'number' || typeof opts.heading === 'number' || typeof opts.pitch === 'number' || typeof opts.roll === 'number');
    if (!opts || !hasCameraParams) {
      dest.height = defaultHeight;
      dest.heading = defaultHeading;
      dest.pitch = defaultPitch;
      dest.roll = defaultRoll;
    } else {
      // Respect explicitly provided camera params and only override missing ones.
      if (typeof opts.height === 'number') dest.height = opts.height; else dest.height = defaultHeight;
      if (typeof opts.heading === 'number') dest.heading = opts.heading; else dest.heading = defaultHeading;
      if (typeof opts.pitch === 'number') dest.pitch = opts.pitch; else dest.pitch = defaultPitch;
      if (typeof opts.roll === 'number') dest.roll = opts.roll; else dest.roll = defaultRoll;
    }

    try { sendLog('[flyToAndNotify] flying to', dest); } catch(e){}
    try {
      if (reearth && reearth.camera && typeof reearth.camera.flyTo === 'function') {
        reearth.camera.flyTo(dest, { duration: duration });
      }
    } catch(e) { try { sendError('[flyToAndNotify] flyTo threw', e); } catch(_){} }

    try {
      const waitMs = Math.round(duration * 1000) + 300;
      try { sendLog('[flyToAndNotify] waiting', waitMs, 'ms before addTargetMarker'); } catch(e){}
      if (typeof setTimeout === 'function') {
        await new Promise(res => setTimeout(res, waitMs));
        try { sendLog('[flyToAndNotify] wait complete'); } catch(e){}
      } else {
        try { sendError('[flyToAndNotify] setTimeout not available in this runtime; skipping wait'); } catch(e){}
      }
    } catch(e) {
      try { sendError('[flyToAndNotify] wait threw', e); } catch(_){}
    }
    try { sendLog('[flyToAndNotify] proceeding to addTargetMarker (post-wait)'); } catch(e){}

    let layerId = null;

    if (addMarkerFlag && typeof addTargetMarker === 'function' && !isNaN(lat) && !isNaN(lng)) {
      try {
        layerId = await addTargetMarker(lat, lng);
      } catch(e) {
        try { sendError('[flyToAndNotify] addTargetMarker threw', e); } catch(_){}
        layerId = null;
      }
    }

    try { sendLog('[flyToAndNotify] completed for', lat, lng); } catch(e){}
    return { success: true, layerId: layerId };
  } catch (e) {
    try { sendError('[flyToAndNotify] error:', e); } catch(_){}
    return { success: false, layerId: null };
  }
}

// Simple wrapper: move to given coordinates, add marker and notify UI
async function moveToCoordinates(lat, lng) {
  try {
    const res = await flyToAndNotify(lat, lng);
    try { sendLog('[moveToCoordinates] result', lat, lng, res); } catch (e) {}
    try { sendLog('[moveToCoordinates] posting geolocationResult', { lat, lng, layerId: res && res.layerId, success: res && res.success }); } catch (e) {}
    try { postToUI({ action: 'geolocationResult', success: res && res.success, lat: lat, lng: lng, layerId: res && res.layerId }); } catch (e) {}
    return res;
  } catch (e) {
    try { sendError('[moveToCoordinates] error:', e); } catch (err) {}
    try { postToUI({ action: 'geolocationResult', success: false, reason: 'error' }); } catch (e) {}
    return { success: false, layerId: null };
  }
}

// Helper: move to coordinates and log the action. Uses a unified log tag.
async function moveToCoordsAndLog(lat, lng) {
  try { sendLog('[moveToCoords] called', lat, lng); } catch (e) {}
  try {
    const res = await moveToCoordinates(lat, lng);
    try { sendLog('[moveToCoords] moved to', lat, lng); } catch (e) {}
    return res;
  } catch (e) {
    try { sendError('[moveToCoords] error:', e); } catch (err) {}
    try { postToUI({ action: 'geolocationResult', success: false, reason: 'error' }); } catch (e) {}
    return { success: false, layerId: null };
  }
}

// Orchestrator: obtain current location, fly, add marker and notify UI
async function performGeolocationAndNotify() {
  try {
    const myLocation = await getCurrentLocation();
    if (myLocation) {
      // delegate to extracted helper that accepts lat,lng
      return await moveToCoordsAndLog(myLocation.lat, myLocation.lng, 'performGeolocationAndNotify');
    } else {
      try { sendError('[performGeolocationAndNotify] location not found'); } catch (e) {}
      try { postToUI({ action: 'geolocationResult', success: false, reason: 'not_found' }); } catch (e) {}
      return { success: false };
    }
  } catch (e) {
    try { sendError('[performGeolocationAndNotify] error:', e); } catch (err) {}
    try { postToUI({ action: 'geolocationResult', success: false, reason: 'error' }); } catch (e) {}
    return { success: false };
  }
}

// Wrapper: move, mark, and notify UI for different call sites
async function flyMoveMarkAndNotify(lat, lng, kind) {
  // Kept for compatibility: delegate to moveToCoordinates which implements the simple two-step flow
  try {
    return await moveToCoordinates(lat, lng);
  } catch (e) {
    try { sendError('[flyMoveMarkAndNotify] delegate error:', e); } catch (_) {}
    try { postToUI({ action: 'geolocationResult', success: false, reason: 'error' }); } catch (_) {}
    return { success: false, layerId: null };
  }
}

  // wrappers removed; normalize in message handler and call flyToAndNotify directly

// Documentation on Extension "on" event: https://visualizer.developer.reearth.io/plugin-api/extension/#message-1
// Fallback listener: also listen for raw window messages (parent.postMessage from UI)
try {
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('message', function(e) {
      try {
        const msg = e && e.data ? e.data : null;
        if (!msg) return;
        // Only handle removeLayer here to avoid duplicating full message handling
        if (msg.action === 'removeLayer' && msg.layerId) {
          try { sendLog('[window.message listener] forwarding removeLayer for', msg.layerId); } catch(e) {}
          try { removeTargetMarker(msg.layerId); } catch(e) { try { sendError('[window.message listener] removeTargetMarker threw', e); } catch(_){} }
        }
      } catch (e) {}
    });
  }
} catch(e) {}

// Debug helper: allow posting a geolocationResult from the console to test UI TTL flow
try {
  if (typeof window !== 'undefined') {
    window.__debug_postGeolocation = function(obj) {
      try { sendLog('[__debug_postGeolocation] posting geolocationResult', obj); } catch(_){}
      try {
        const payload = Object.assign({ action: 'geolocationResult' }, obj || {});
        try { postToUI(payload); } catch(e) { try { sendError('[__debug_postGeolocation] postToUI threw', e); } catch(_){} }
      } catch (e) {
        try { sendError('[__debug_postGeolocation] error', e); } catch(_){}
      }
    };
  }
} catch(e) {}

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
            try { safeShowUI('updateCamPreset'); } catch(e){}
            try { sendLog('[updateCamPreset] updated preset', idx, _cameraPresets[idx].title); } catch(e){}
          }
        }
      } catch(e) {
        try { sendError('[updateCamPreset] error:', e); } catch(err){}
      }
    }

    else if (msg.action === "requestGeolocation") {
      try {
        await performGeolocationAndNotify();
      } catch (e) {
        try { sendError('[requestGeolocation] performGeolocationAndNotify failed', e); } catch(_) {}
      }
    } else if (msg.action === "flyMoveMarkAndNotify") {
      try {
        try { sendLog('[message] flyMoveMarkAndNotify received', msg && msg.lat, msg && msg.lng, 'addMarker:', msg && msg.addMarker); } catch(e){}
        // Use flyToAndNotify directly and honor the addMarker flag from the UI
        const res = await flyToAndNotify(msg.lat, msg.lng, { addMarker: !!(msg && msg.addMarker) });
        try { sendLog('[message] flyMoveMarkAndNotify result', res); } catch(e){}
        // Ensure UI receives geolocationResult for search-origin flows
        try {
          try { postToUI({ action: 'geolocationResult', success: res && res.success, lat: msg.lat, lng: msg.lng, layerId: res && res.layerId }); } catch(e){}
        } catch(e) { try { sendError('[flyMoveMarkAndNotify] postToUI fallback threw', e); } catch(_){} }
      } catch(e) {
        try { sendError('[flyMoveMarkAndNotify] flyToAndNotify error:', e); } catch(err) {}
      }

    } else if (msg.action === "removeLayer") {
      if (msg.layerId) {
        try {
          try { sendLog('[removeLayer] requested for', msg.layerId); } catch(e) {}
          removeTargetMarker(msg.layerId);
        } catch(e) { try { sendError('[removeLayer] failed to delete layer:', e); } catch(err) {} }
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
      } catch(e) {
        try { sendError('[setBasemap] error:', e); } catch(_){ }
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
          // Delegate camera preset flyTo to flyToAndNotify for consistent logging
          try { await flyToAndNotify(cam.lat, cam.lng, { height: cam.height, heading: cam.heading, pitch: cam.pitch, duration: 2, addMarker: false }); } catch(e) { try { sendError('[flyToAndNotify] flyToCamera failed', e); } catch(_){} }
        }
      } catch(e) {
        try { sendError('[flyToAndNotify] flyToCamera outer error:', e); } catch(err){}
      }
    } else if (msg.action === "flyToManual") {
      try {
        await flyToAndNotify(msg.lat, msg.lng, { 
          height: msg.height, 
          heading: msg.heading, 
          pitch: msg.pitch, 
          duration: 2, 
          addMarker: false 
        });
      } catch(e) { try { sendError('[flyToAndNotify] flyToManual failed', e); } catch(_){} }
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
    case "flyTo":
      try {
        // Backward-compatible: allow UI to request flyTo by layerId
        try { reearth.camera.flyTo(msg.layerId, { duration: 2 }); } catch(e) { try { sendError('[flyToAndNotify] flyTo by layer failed', e); } catch(_){} }
      } catch (e) {}
      break;
    case "hide":
      try {
        // Called from UI: suppress full UI re-render to avoid re-initialization side-effects
        setLayerVisibility(msg.layerId, false, false);
        _userLayerVisibility.set(msg.layerId, false);
      } catch (e) {
        try { sendError('[hide] error setting visibility', msg.layerId, e); } catch(_){ }
      }
      break;
    case "show":
      try {
        // Called from UI: suppress full UI re-render to avoid re-initialization side-effects
        setLayerVisibility(msg.layerId, true, false);
        _userLayerVisibility.set(msg.layerId, true);
      } catch (e) {
        try { sendError('[show] error setting visibility', msg.layerId, e); } catch(_){ }
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

function addXyzLayer(url, title, layerType, isBase = false, visible = true) {
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
  
  // ReEarth issue workaround: Always add as visible:true to ensure resource loading,
  // then hide immediately if requested (OFF).
  const layer = {
    type: "simple",
    title: titleToUse,
    visible: true, // Always true initially
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
      
      // If requested OFF, do NOT hide immediately in Extension side (avoid setTimeout issues).
      // Instead, mark it as pending hide. The UI side will pick this up and send a 'hide' message
      // after a short delay (using UI's working setTimeout).
      if (!visible) {
         _layersPendingHide.add(newId);
      }
    }
    sendLog(isBase ? "Added Basemap layer, id:" : "Added XYZ layer, id:", newId, "(src:", url, ")");
    try {
      // Re-render the widget UI so the new (non-basemap) layer appears in the list.
      // Avoid full UI re-render when adding basemap layers to prevent UI re-initialization side-effects.
      if (!isBase) {
        try { safeShowUI('addXyzLayer'); } catch (e) { try { sendError('[addXyzLayer] failed to re-render UI:', e); } catch (err) {} }
      }
    } catch (e) {
      try { sendError('[addXyzLayer] unexpected error during UI update:', e); } catch (err) {}
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
const _defaultInspectorText = ``;

// Also process any inspector text/config present at init
try {
  const propInit = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
  const textInit = (propInit.settings && propInit.settings.inspectorText) || propInit.inspectorText;
  // If inspector property exists (even empty string), prefer it. Only fall back to _defaultInspectorText when property is undefined.
  const textToProcess = (typeof textInit === 'string') ? textInit : _defaultInspectorText;
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
  // reset inspector-sourced yahooAppId each time we parse inspector text
  try { _inspectorYahooAppId = null; } catch(e) {}
  const tiles = [];

  // Helper to extract visible flag from parts array (modifies parts in place)
  const extractVisible = (parts) => {
    let v = true;
    if (!Array.isArray(parts)) return v;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].toLowerCase();
      if (p === 'off') {
        v = false;
        parts.splice(i, 1);
        i--;
      } else if (p === 'on') {
        v = true;
        parts.splice(i, 1);
        i--;
      }
    }
    return v;
  };

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

    // Inspector-provided Yahoo AppID: "yahooAppId: YOUR_APP_ID"
    if (/^yahooappid\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim();
        if (val) {
          _inspectorYahooAppId = val;
          try { sendLog('[processInspectorText] found inspector yahooAppId'); } catch(e){}
        }
      } catch(e){}
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
      let visible = true;
      if (tileStr.indexOf('|') !== -1) {
        const parts = tileStr.split('|').map(p => p.trim());
        visible = extractVisible(parts);
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
      } else {
        if (tileStr.startsWith('http')) url = tileStr;
      }
      if (url) tiles.push({ url, title, type: '3dtiles', visible });
      nonCamLines.push(line);
      return;
    }

    // GeoJSON
    if (lowerLine.startsWith('geojson:')) {
      const geoStr = line.substring(8).trim();
      let url = null;
      let title = null;
      let visible = true;
      if (geoStr.indexOf('|') !== -1) {
        const parts = geoStr.split('|').map(p => p.trim());
        visible = extractVisible(parts);
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
      } else {
        if (geoStr.startsWith('http')) url = geoStr;
      }
      if (url) tiles.push({ url, title, type: 'geojson', visible });
      nonCamLines.push(line);
      return;
    }

    // NOTE: 'yahoo:' inspector lines are ignored - only 'yahooAppId:' line is used for AppID.

    // Tile: xyz/tile/base
    let tileStr = line;
    let isBase = false;
    if (lowerLine.startsWith('xyz:')) tileStr = line.substring(4).trim();
    else if (lowerLine.startsWith('tile:')) tileStr = line.substring(5).trim();
    else if (lowerLine.startsWith('base:')) { tileStr = line.substring(5).trim(); isBase = true; }

    let url = null;
    let title = null;
    let attribution = null;
    let visible = true;

    if (tileStr.indexOf('|') !== -1) {
      const parts = tileStr.split('|').map(p => p.trim());
      visible = extractVisible(parts);
      // Handle optional 3rd part as attribution
      if (parts.length >= 3) {
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; attribution = parts[2]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; attribution = parts[2]; }
      } else {
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
      }
    } else {
      if (tileStr.startsWith('http')) url = tileStr;
    }

    if (url) {
      // Fix: Ensure attribution links have target="_blank" and use HTTPS to prevent blocking
      if (attribution && typeof attribution === 'string') {
        // Upgrade HTTP to HTTPS for OSM
        attribution = attribution.replace(/http:\/\/www\.openstreetmap\.org/g, 'https://www.openstreetmap.org');
        // Inject target="_blank" if missing
        if (attribution.indexOf('<a ') !== -1 && attribution.indexOf('target=') === -1) {
           attribution = attribution.replace('<a ', '<a target="_blank" ');
        }
      }

      tiles.push({ url, title, type: 'tiles', isBase: isBase, visible });
      if (isBase) _parsedBaseTiles.push({ url, title, attribution });
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
        try { safeShowUI('processInspectorText: initial basemap apply'); } catch(e) {}
      }
    } catch(e) {}
  }

  try { safeShowUI('processInspectorText: final render'); } catch(e){}

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
    // If UI provided explicit ordered requests, apply them in that order using show/hide
    // to reflect UI stacking behavior. Otherwise, fall back to stored _userLayerVisibility.
    const applyShowHide = (id, desired) => {
      try {
        if (desired) {
          // First hide (or update to false) to force a reset, then show (or update to true)
          try {
            if (typeof reearth.layers.hide === 'function') {
              reearth.layers.hide(id);
            } else if (typeof reearth.layers.update === 'function') {
              reearth.layers.update({ id: id, visible: false });
            }
          } catch (e) {}
          try {
            if (typeof reearth.layers.show === 'function') {
              reearth.layers.show(id);
            } else if (typeof reearth.layers.update === 'function') {
              reearth.layers.update({ id: id, visible: true });
            }
          } catch (e) {}
        } else {
          // Simply hide (or update to false)
          try {
            if (typeof reearth.layers.hide === 'function') {
              reearth.layers.hide(id);
            } else if (typeof reearth.layers.update === 'function') {
              reearth.layers.update({ id: id, visible: false });
            }
          } catch (e) {}
        }
      } catch (e) {}
    };

    if (userRequests && typeof userRequests === 'object') {
      // Honor UI-sent order (Object.entries preserves insertion order)
      for (const [id, desired] of Object.entries(userRequests)) {
        const layer = layerMap.get(id);
        if (!layer) continue;
        // Update internal state
        try { _userLayerVisibility.set(id, !!desired); } catch(e) {}
        applyShowHide(id, !!desired);
      }
      return;
    }

    // No ordered requests provided; apply from internal state (in insertion order)
    for (const [id, desired] of _userLayerVisibility.entries()) {
      const layer = layerMap.get(id);
      if (!layer) continue;
      applyShowHide(id, desired);
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
    const visible = (it.visible !== undefined) ? it.visible : true;
    if (!u) continue;
    if (!/^https?:\/\//.test(u)) continue;
    const encoded = u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
    const dup = existing.find(l => l && l.data && l.data.url && (l.data.url === encoded || (typeof l.data.url === 'string' && l.data.url.indexOf(encoded) !== -1)));
    if (dup) {
      try { sendLog('[addXyzLayersFromArray] skip duplicate:', u); } catch(e){}
      continue;
    }
    addXyzLayer(u, t, type, isBase, visible);
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
