// Comprehensive bridge test: call every tool in the describe catalog via the
// SSE path (bridge_server /call). PASS = a structured result came back through
// the full chain (proves the bridge path); inner tool errors are reported as info.
const BASE = process.env.BRIDGE_URL || "http://127.0.0.1:8977";
const GEOJSON_URL = "https://assets.cms.reearth.io/assets/ef/b1d062-e44b-4a19-8ebe-5fafeeba05f2/%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%9F%9F.geojson";
const T = [
  // bridge-native
  ["describe", {}],
  ["runCode", { code: "var c=await api.getCamera(); return c.lat;" }],
  // local
  ["getCamera", {}], ["listLayers", {}],
  ["flyTo", { lat: 35.68, lng: 139.69, height: 2500, duration: 1 }],
  ["setCamera", { lat: 35.0, lng: 135.0, height: 5000, pitch: -30 }],
  ["lookAt", { lat: 35.36, lng: 138.73, range: 5000, duration: 1 }],
  ["zoomIn", { amount: 2 }], ["zoomOut", { amount: 2 }],
  ["focusLayer", { layer: "Sample Points" }],
  ["setLayerVisible", { layer: "Sample Points", visible: true }],
  ["getShareUrl", {}],
  ["buildShareUrl", { lat: 35, lng: 139, height: 1000 }],
  ["captureView", {}],
  ["openUrl", { url: "https://example.com" }],
  ["addGeoJsonLayer", { title: "bridgetest-gj", url: GEOJSON_URL }],
  ["addTileLayer", { title: "bridgetest-tile", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxLevel: 19 }],
  ["add3dTilesLayer", { title: "bridgetest-3d", url: "https://assets.cms.plateau.reearth.io/assets/0e/e5948a-e95c-4e31-be85-1f8c066ed996/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod1/tileset.json" }],
  ["removeLayer", { layer: "bridgetest-gj" }],
  // panel
  ["listCameraPresets", {}],
  ["flyToPreset", { name: "東京駅" }],
  ["listBasemaps", {}],
  ["setBasemap", { name: "OpenStreetMap" }],
  ["listFlyPaths", {}],
  ["createFlyPath", { name: "bridgetest-route", coordinates: [[139.7, 35.6], [139.8, 35.7]], speed: 300 }],
  ["setFlySettings", { name: "bridgetest-route", speed: 100 }],
  ["playFlyPath", { name: "bridgetest-route" }],
  ["stopFly", {}],
  ["deleteFlyPath", { name: "bridgetest-route" }],
  ["setTerrain", { enabled: true }],
  ["setTerrain", { enabled: false }],
  ["setShadow", { enabled: true }],
  ["setShadow", { enabled: false }],
  ["setDepthTest", { enabled: true }],
  ["setGeojsonDrape", { classification: "both" }],
  ["setBackground", { color: "#112233" }],
  ["setBackground", { color: "#ffffff" }],
  ["vectorSearch", { query: "東京" }],
  ["searchPlaces", { query: "東京駅" }],
  ["flyToFeature", { attribute: "name", value: "東京" }],
  ["showFeatureAttributes", { attribute: "name", value: "東京", fly: false }],
  ["openStreetView", {}],
  ["showPanel", { panel: "layers" }],
  ["showInfo", {}],
  ["listLegends", {}],
  ["getInspectorText", {}],
  ["addFlatGeobufLayer", { url: "https://invalid.local/x.fgb" }],
  ["addParquetLayer", { url: "https://invalid.local/x.parquet" }],
  ["addDuckDbLayer", { url: "https://invalid.local/x.parquet" }],
];

async function call(name, args, timeoutMs = 60000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs + 10000);
  try {
    const r = await fetch(BASE + "/call", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args, timeoutMs }), signal: ctl.signal });
    return await r.json();
  } catch (e) { return { ok: false, error: "http:" + String(e && e.message || e) }; }
  finally { clearTimeout(t); }
}

(async () => {
  let pass = 0, fail = 0;
  for (const [name, args] of T) {
    const r = await call(name, args);
    const got = r && r.ok;
    if (got) pass++; else fail++;
    const s = JSON.stringify(got ? r.result : r.error);
    console.log((got ? "PASS" : "FAIL") + "  " + name + "  " + String(s).slice(0, 150));
  }
  console.log(`\n${pass}/${T.length} pass`);
})();
