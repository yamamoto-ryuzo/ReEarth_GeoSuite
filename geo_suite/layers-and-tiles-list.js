const layers = reearth.layers.layers

// filter layers (show all preset layers)
const presetLayers = layers;

const generateLayerItem = (layer, isPreset) => {
  return `
    <li>
      <span id="layer-name">${layer.title}</span>
      <div class="actions">
        <input
          type="checkbox"
          id="show-hide-layer"
          data-layer-id="${layer.id}"
          ${layer.visible ? "checked" : ""}
        />
        <button class="btn-primary p-8 move-btn" data-layer-id="${layer.id}" aria-label="Move"></button>
        ${!isPreset
            ? `<button class="btn-danger p-8"  data-layer-id="${layer.id}">Delete</button>`
            : "" }
      </div>
    </li>
  `;
};

const presetLayerItems = presetLayers.map(layer => generateLayerItem(layer, true)).join('');

function getUI() {
  return `
<style>
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

  /* Move button: square, minimal height */
  .move-btn{
    padding: 0;
    width: 1.6em;
    height: 1.6em;
    min-width: 1.6em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
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
  .toggle { margin-left: 8px; }

</style>

<div class="primary-background p-16 rounded-sm">
  <div class="primary-background terrain-row rounded-sm" style="margin-bottom:8px;">
      <div class="text-md" id="status">Terrain: OFF</div>
      <label class="toggle" id="terrain-toggle" aria-label="Terrain toggle">
        <input type="checkbox" id="toggleSwitch">
        <span class="slider"></span>
      </label>
  </div>

  <!-- Debug button removed -->


  <ul class="layers-list">
    ${presetLayerItems}
  </ul>

</div>

<script>
  // Terrain toggle: send action messages to parent
  document.addEventListener('DOMContentLoaded', function() {
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

      // Add event listener for 'Show/Hide'
      document.querySelectorAll("#show-hide-layer").forEach(checkbox => {
        checkbox.addEventListener("change", event => {
          const layerId = event.target.getAttribute("data-layer-id");
          const isVisible = event.target.checked;

          if (layerId) {
            // Send a message to the parent window for show/hide action
            parent.postMessage({
              type: isVisible ? "show" : "hide",
              layerId: layerId
            }, "*");
          }
        });
      });

      // Add event listener for 'FlyTo' button
      document.querySelectorAll(".btn-primary").forEach(button => {
        button.addEventListener("click", event => {
          const layerId = event.target.getAttribute("data-layer-id");
          if (layerId) {
            // Send a message to the parent window for 'FlyTo' action
            parent.postMessage({
              type: "flyTo",
              layerId: layerId
            }, "*");
          }
        });
      });

      
  });

  // On-screen plugin log removed (logs go to console only)
</script>
`;
}

// Initial render
reearth.ui.show(getUI());



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
      reearth.viewer.overrideProperty({
        terrain: { enabled: true },
        globe: { depthTestAgainstTerrain: true },
      });
    } else if (msg.action === "deactivateTerrain") {
      reearth.viewer.overrideProperty({
        terrain: { enabled: false },
        globe: { depthTestAgainstTerrain: false },
      });
    }
    return;
  }

  // Backward-compatible handling for messages using `type`
  switch (msg.type) {
    case "delete":
      reearth.layers.delete(msg.layerId);
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
        try {
          // If the inspector sent an encoded URL, decode to show original characters
          url = decodeURIComponent(v);
        } catch (e) {
          // ignore decode errors and keep original
          url = v;
        }
        if (url && /^https?:\/\//.test(url)) {
          addXyzLayer(url);
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
    try { sendLog('[init] property:', prop); } catch(e){}
    if (url && typeof url === "string" && /^https?:\/\//.test(url)) {
      try { sendLog('[init] found URL -> add layer', url); } catch(e){}
      addXyzLayer(url);
    } else {
      try { sendLog('[init] no valid URL found in property'); } catch(e){}
    }
  } catch (e) {
    // ignore
  }
}

function addXyzLayer(url) {
  if (!url || typeof url !== "string") return;
  const title = `XYZ: ${url}`;
  // Encode only non-ASCII characters but keep template braces {z}/{x}/{y} intact
  const encodedUrl = url.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  const layer = {
    type: "simple",
    title: title,
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
    sendLog("Added XYZ layer, id:", newId, "(src:", url, ")");
    return newId;
  } catch (e) {
    try { sendError("Failed to add XYZ layer:", e); } catch (err) {}
    try { sendError("Layer object was:", layer); } catch (err) {}
    return null;
  }
}

tryInitFromProperty();

// Poll for property changes (Inspector edits) and react to URL changes
let _lastInspectorUrl = null;
let _lastInspectorApply = null;
// Poll for property changes more frequently so inspector edits reflect faster.
setInterval(() => {
  try {
    const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
    const url = prop?.inspectorUrl || prop?.inspectorText || prop?.settings?.inspectorUrl || prop?.settings?.inspectorText;
    if (url && typeof url === "string" && /^https?:\/\//.test(url)) {
      if (url !== _lastInspectorUrl) {
        sendLog('[poll] detected URL change ->', url, '(last:', _lastInspectorUrl, ')');
        _lastInspectorUrl = url;
        addXyzLayer(url);
      }
    }
    // inspectorApply trigger handling removed (debugging helper no longer present)
  } catch (e) {
    // ignore
  }
}, 300);
