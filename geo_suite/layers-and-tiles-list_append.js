"use strict";
// Missing message handler logic extracted from release/layers-and-tiles-list.js
// This should be appended to src/layers-and-tiles-list.ts
// Try multiple available APIs to set layer visibility, then re-render UI
function setLayerVisibility(layerId, visible) {
    if (!layerId)
        return false;
    try {
        if (reearth.layers && typeof reearth.layers.show === 'function' && typeof reearth.layers.hide === 'function') {
            if (visible)
                reearth.layers.show(layerId);
            else
                reearth.layers.hide(layerId);
            try {
                if (reearth.ui && typeof reearth.ui.show === 'function')
                    reearth.ui.show(getUI());
            }
            catch (_) { }
            return true;
        }
        if (reearth.layers && typeof reearth.layers.update === 'function') {
            reearth.layers.update({ id: layerId, visible: !!visible });
            try {
                if (reearth.ui && typeof reearth.ui.show === 'function')
                    reearth.ui.show(getUI());
            }
            catch (_) { }
            return true;
        }
    }
    catch (e) { }
    try {
        if (reearth.ui && typeof reearth.ui.show === 'function')
            reearth.ui.show(getUI());
    }
    catch (_) { }
    return false;
}
const onExtensionMessage = (msg) => {
    if (!msg)
        return;
    // Handle action-based messages
    if (msg.action === "activateTerrain") {
        const bg = _lastInspectorBackground || "#ffffff";
        reearth.viewer.overrideProperty({ terrain: { enabled: true }, globe: { depthTestAgainstTerrain: true, baseColor: bg }, scene: { backgroundColor: bg } });
    }
    else if (msg.action === "deactivateTerrain") {
        const bg = _lastInspectorBackground || "#ffffff";
        reearth.viewer.overrideProperty({ terrain: { enabled: false }, globe: { depthTestAgainstTerrain: false, baseColor: bg }, scene: { backgroundColor: bg } });
    }
    else if (msg.action === "activateShadow") {
        const bg = _lastInspectorBackground || "#ffffff";
        reearth.viewer.overrideProperty({ scene: { shadow: { enabled: true }, backgroundColor: bg }, globe: { baseColor: bg } });
    }
    else if (msg.action === "deactivateShadow") {
        const bg = _lastInspectorBackground || "#ffffff";
        reearth.viewer.overrideProperty({ scene: { shadow: { enabled: false }, backgroundColor: bg }, globe: { baseColor: bg } });
    }
    else if (msg.action === "toggleDepthTest") {
        const bg = _lastInspectorBackground || "#ffffff";
        reearth.viewer.overrideProperty({ globe: { depthTestAgainstTerrain: msg.enabled, baseColor: bg } });
    }
    else if (msg.action === "flyToManual") {
        reearth.camera.flyTo({
            lat: msg.lat, lng: msg.lng, height: msg.height,
            heading: msg.heading * Math.PI / 180, pitch: msg.pitch * Math.PI / 180, roll: 0,
        }, { duration: 2 });
    }
    else if (msg.action === "flyToCamera") {
        // Simplified flyToCamera logic
        const idx = msg.camIndex;
        if (typeof idx === 'number' && _cameraPresets[idx]) {
            const cam = _cameraPresets[idx];
            reearth.camera.flyTo({
                lat: cam.lat, lng: cam.lng, height: cam.height || 1000,
                heading: cam.heading || 0, pitch: cam.pitch || -Math.PI / 6, roll: 0,
            }, { duration: 2 });
        }
    }
    // Legacy type handling
    if (msg.type === "flyTo") {
        reearth.camera.flyTo(msg.layerId, { duration: 2 });
    }
    else if (msg.type === "hide") {
        setLayerVisibility(msg.layerId, false);
    }
    else if (msg.type === "show") {
        setLayerVisibility(msg.layerId, true);
    }
};
if (reearth.extension && reearth.extension.on) {
    reearth.extension.on("message", onExtensionMessage);
}
else if (reearth.ui && reearth.ui.on) {
    reearth.ui.on("message", onExtensionMessage);
}
else if (reearth.on) {
    reearth.on("message", onExtensionMessage);
}
