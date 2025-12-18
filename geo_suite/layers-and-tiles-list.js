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

reearth.ui.show(`
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

</style>

<div class="primary-background p-16 rounded-sm">
  <div class="primary-background flex-column align-center p-16 rounded-sm gap-16" style="margin-bottom:8px;">
      <label class="toggle">
        <input type="checkbox" id="toggleSwitch">
        <span class="slider"></span>
      </label>
      <div class="text-md" id="status">Terrain: OFF</div>
  </div>

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
</script>
`);



// Documentation on Extension "on" event: https://visualizer.developer.reearth.io/plugin-api/extension/#message-1
reearth.extension.on("message", (msg) => {
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
    default:
  }
});
