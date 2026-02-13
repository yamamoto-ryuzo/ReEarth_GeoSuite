// Copied to repository root for GitHub archive installation
// Implementation is same as `plugin/layers-and-tiles-list.js`
"use strict";
// @ts-nocheck
const _pluginAddedLayerIds = new Set();
let _lastInspectorUrl = null;
let _lastInspectorApply = null;
let _lastInspectorLayersJson = null;
let _lastInfoUrl = null;
const generateLayerItem = (layer, isPreset) => `
    <li>
      <span id="layer-name">${layer.title}</span>
      <div class="actions">
        <input type="checkbox" id="show-hide-layer" data-layer-id="${layer.id}" data-is-plugin-added="${!isPreset}" ${layer.visible ? "checked" : ""} />
        <button class="btn-primary p-8 move-btn" data-layer-id="${layer.id}" aria-label="Move"></button>
      </div>
    </li>`;
function getUI(){
  const layers = (reearth.layers && reearth.layers.layers) || [];
  const presetLayers = [];
  const userLayers = [];
  layers.forEach(layer=>{ if(_pluginAddedLayerIds.has(layer.id)) userLayers.push(layer); else presetLayers.push(layer); });
  const presetLayerItems = presetLayers.map(layer=>generateLayerItem(layer,true)).join('');
  const userLayerItems = userLayers.map(layer=>generateLayerItem(layer,false)).join('');
  return `
<div>Layers UI (placeholder)</div>`;
}
reearth.ui.show(getUI());
