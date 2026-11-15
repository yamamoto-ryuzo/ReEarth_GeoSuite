import io

def load(f):
    raw = io.open(f, 'rb').read()
    crlf = b'\r\n' in raw
    return raw.decode('utf-8').replace('\r\n', '\n'), crlf

def save(f, s, crlf):
    if crlf:
        s = s.replace('\n', '\r\n')
    io.open(f, 'wb').write(s.encode('utf-8'))

F = 'geo_suite/src/layers-and-tiles-list.ts'
s, crlf = load(F)

def rep(old, new):
    global s
    assert s.count(old) == 1, 'anchor not unique: %r' % old[:70]
    s = s.replace(old, new, 1)

# 1) tab-bar: measure action button before manage button
rep('    <button class="action-btn" id="manage-open-btn"',
    '    <button class="action-btn" data-target="measure-panel" aria-pressed="false" title="Measure" aria-label="Measure" data-i18n-title="measureTitle" data-i18n-aria="measureTitle">\U0001F4D0</button>\n    <button class="action-btn" id="manage-open-btn"')

# 2) measure panel before share-panel
rep('    <div id="share-panel" style="display:none;">',
    '''    <div id="measure-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;" data-i18n="measureTitle">Measure</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
      <button id="measure-bearing-btn" class="btn-primary p-8" style="flex:1;" data-i18n="measureBearing">Bearing</button>
      <button id="measure-clear-btn" class="btn-primary p-8" data-i18n="measureClear">Clear</button>
    </div>
    <div id="measure-readout" style="font-size:0.85em;color:#333;min-height:1.4em;"></div>
    <div id="measure-values" style="display:none;font-size:0.95em;color:#222;">
      <span data-i18n="measureAz">Az</span> <b id="mr-az"></b>&deg; &middot; <span data-i18n="measureBackAz">Back</span> <b id="mr-back"></b>&deg; &middot; <b id="mr-dist"></b>
    </div>
    </div>

    <div id="share-panel" style="display:none;">''')

# 3) route sketch create to measure mode
rep('''                        if (line.length >= 2) {
                            postToUI({ action: 'flyDrawn', geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { source: 'draw' }, geometry: { type: 'LineString', coordinates: line } }] } });
                        }''',
    '''                        if (line.length >= 2) {
                            if (_measureMode) {
                                measureFinishDrawn(line);
                            }
                            else {
                                postToUI({ action: 'flyDrawn', geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { source: 'draw' }, geometry: { type: 'LineString', coordinates: line } }] } });
                            }
                        }''')

# 4) extension dispatch
rep("      else if (msg.action === 'flyDrawStart') {",
    """      else if (msg.action === 'measureStart') {
          try {
              measureStartMode(msg.mode || 'bearing');
          }
          catch (e) { }
      }
      else if (msg.action === 'measureClear') {
          try {
              measureClearMode();
          }
          catch (e) { }
      }
      else if (msg.action === 'flyDrawStart') {""")

# 5) state vars
rep('let _measureOverlayLayerId = null;',
    'let _measureOverlayLayerId = null;\nlet _measureMode = null;\nlet _measureLastResult = null;')

# 6) measure-mode functions
rep('function handleAiToolRequest(senderId, data) {',
    '''// ---------- Interactive measure mode (sketch UI, issue #41) ----------
// Shared framework for the Measure panel modes: while _measureMode is set,
// the sketch 'create' handler in flyStartSketch routes drawn lines to
// measureFinishDrawn() instead of the fly route. Distance (#39) and area
// (#40) modes can plug into the same path later.
const _MEASURE_WGS84_A = 6378137.0;
const _MEASURE_WGS84_F = 1 / 298.257223563;

// Vincenty inverse on WGS84 -- port of kasugai_canvas
// web/shared/spatial-ops.js geodesicInverse(). Returns { dist (m), az1, az2 }.
function measureGeodesicInverse(a, b) {
  const RAD = Math.PI / 180, DEG = 180 / Math.PI;
  const f1 = a.lat * RAD, f2 = b.lat * RAD, L = (b.lng - a.lng) * RAD;
  const U1 = Math.atan((1 - _MEASURE_WGS84_F) * Math.tan(f1));
  const U2 = Math.atan((1 - _MEASURE_WGS84_F) * Math.tan(f2));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
  let lam = L;
  for (let i = 0; i < 100; i++) {
    const sinL = Math.sin(lam), cosL = Math.cos(lam);
    const sinSig = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSig === 0) return { dist: 0, az1: 0, az2: 0 };
    const cosSig = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    const sig = Math.atan2(sinSig, cosSig);
    const sinA = cosU1 * cosU2 * sinL / sinSig;
    const cos2A = 1 - sinA * sinA;
    const cos2Sm = cos2A !== 0 ? cosSig - 2 * sinU1 * sinU2 / cos2A : 0;
    const C = _MEASURE_WGS84_F / 16 * cos2A * (4 + _MEASURE_WGS84_F * (4 - 3 * cos2A));
    const prev = lam;
    lam = L + (1 - C) * _MEASURE_WGS84_F * sinA * (sig + C * sinSig * (cos2Sm + C * cosSig * (-1 + 2 * cos2Sm ** 2)));
    if (Math.abs(lam - prev) < 1e-12) {
      const u2 = cos2A * (_MEASURE_WGS84_A ** 2 - (_MEASURE_WGS84_A * (1 - _MEASURE_WGS84_F)) ** 2) / (_MEASURE_WGS84_A * (1 - _MEASURE_WGS84_F)) ** 2;
      const A = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const B = u2 / 1024 * (256 + cos2A * (-128 + u2 * (74 - 47 * u2)));
      const dSig = B * sinSig * (cos2Sm + B / 4 * (cosSig * (-1 + 2 * cos2Sm ** 2)
        - B / 6 * cos2Sm * (-3 + 4 * cos2Sm ** 2) * (-3 + 4 * cos2Sm ** 2)));
      const az1 = Math.atan2(cosU2 * Math.sin(lam), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lam));
      const az2 = Math.atan2(cosU1 * Math.sin(lam), -sinU1 * cosU2 + cosU1 * sinU2 * Math.cos(lam));
      return { dist: _MEASURE_WGS84_A * (1 - _MEASURE_WGS84_F) * A * (sig - dSig), az1: az1 * DEG, az2: az2 * DEG };
    }
  }
  // near-antipodal non-convergence: spherical fallback (same as Canvas)
  return { dist: measureSegmentMeters(a, b), az1: measureHeadingDeg(a, b), az2: (measureHeadingDeg(b, a) + 180) % 360 };
}
function measureDeg360(d) { return (d + 360) % 360; }
function measureStartMode(mode) {
  if (!(reearth.sketch && typeof reearth.sketch.setTool === 'function')) return;
  _measureMode = mode;
  flyStartSketch();
}
function measureClearMode() {
  _measureMode = null;
  _measureLastResult = null;
  flyStopSketch();
  try {
    if (_measureOverlayLayerId && reearth.layers.findById && reearth.layers.findById(_measureOverlayLayerId))
      reearth.layers.hide(_measureOverlayLayerId);
  } catch (e) { }
}
function measureFinishDrawn(line) {
  const pts = measureNormCoords(line);
  if (_measureMode === 'bearing' && pts.length >= 2) {
    const from = pts[0], to = pts[pts.length - 1];
    const g = measureGeodesicInverse(from, to);
    const az1 = measureDeg360(g.az1), az2 = measureDeg360(g.az2);
    measureShowOverlay([
      { type: 'Feature', properties: { kind: 'bearing' }, geometry: { type: 'LineString', coordinates: [[from.lng, from.lat], [to.lng, to.lat]] } },
      { type: 'Feature', properties: { kind: 'label', title: az1.toFixed(1) + '\\u00b0' }, geometry: { type: 'Point', coordinates: [(from.lng + to.lng) / 2, (from.lat + to.lat) / 2] } }
    ]);
    _measureLastResult = { mode: 'bearing', az1: az1, az2: az2, dist: g.dist };
    postToUI({ action: 'measureResult', mode: 'bearing', az1: az1, az2: az2, dist: g.dist });
  }
  _measureMode = null;
}

function handleAiToolRequest(senderId, data) {''')

# 7) marker label for midpoint azimuth label
rep("      marker: { pointColor: '#ff8800', pointSize: 12 },",
    "      marker: { pointColor: '#ff8800', pointSize: 12, label: true },")

# 8) UI-side measureResult handler before kascThemes branch
rep("                if (msg.action === 'kascThemes') {",
    """                if (msg.action === 'measureResult') { try { measureShowResult(msg); } catch (e) {} return; }
                if (msg.action === 'kascThemes') {""")

# 9) bindings + persisted result before the window message listener
i = s.index("if (msg.action === 'kascThemes')")
j = s.rfind("window.addEventListener('message', function(e) {", 0, i)
assert j > 0, 'listener anchor missing'
ls = s.rfind('\n', 0, j) + 1
BIND = '''      window._MEASURE_RESULT = ${JSON.stringify(_measureLastResult || null)};
      function measureFmtDist(d) { return (d >= 1000) ? (d / 1000).toFixed(2) + ' km' : d.toFixed(1) + ' m'; }
      function measureShowResult(r) {
        var ro = document.getElementById('measure-readout'), vv = document.getElementById('measure-values');
        if (!r) { if (ro) ro.textContent = ''; if (vv) vv.style.display = 'none'; return; }
        var e1 = document.getElementById('mr-az'), e2 = document.getElementById('mr-back'), e3 = document.getElementById('mr-dist');
        if (e1) e1.textContent = (r.az1 || 0).toFixed(1);
        if (e2) e2.textContent = (r.az2 || 0).toFixed(1);
        if (e3) e3.textContent = measureFmtDist(r.dist || 0);
        if (vv) vv.style.display = 'block';
        if (ro) ro.textContent = '';
      }
      var _measureBrgBtn = document.getElementById('measure-bearing-btn'), _measureClrBtn = document.getElementById('measure-clear-btn');
      if (_measureBrgBtn) _measureBrgBtn.addEventListener('click', function() {
        measureShowResult(null);
        var ro = document.getElementById('measure-readout');
        if (ro) ro.textContent = t('measureHint2pt');
        try { parent.postMessage({ action: 'measureStart', mode: 'bearing' }, '*'); } catch (e) {}
      });
      if (_measureClrBtn) _measureClrBtn.addEventListener('click', function() {
        measureShowResult(null);
        try { parent.postMessage({ action: 'measureClear' }, '*'); } catch (e) {}
      });
      try { if (window._MEASURE_RESULT) measureShowResult(window._MEASURE_RESULT); } catch (e) {}
'''
s = s[:ls] + BIND + s[ls:]

# 10) i18n keys for all 20 locales
LOC = [
 ('en',   "Measure", "Bearing", "Clear", "Draw a line between two points on the map (double-click to finish)", "Az", "Back az"),
 ('ja',   "計測", "方位角", "消去", "地図上で2点間の線を描画（ダブルクリックで確定）", "方位", "逆方位"),
 ('zh-CN', "测量", "方位角", "清除", "在地图上绘制两点连线（双击完成）", "方位", "反方位"),
 ('zh-TW', "量測", "方位角", "清除", "在地圖上繪製兩點連線（雙擊完成）", "方位", "反方位"),
 ('ko',   "측정", "방위각", "지우기", "지도에서 두 지점을 잇는 선을 그리세요 (더블클릭으로 완료)", "방위", "역방위"),
 ('es',   "Medición", "Acimut", "Borrar", "Dibuja una línea entre dos puntos del mapa (doble clic para terminar)", "Acimut", "Acimut inv."),
 ('fr',   "Mesure", "Azimut", "Effacer", "Tracez une ligne entre deux points sur la carte (double-clic pour terminer)", "Azimut", "Azimut inv."),
 ('de',   "Messung", "Kurswinkel", "Löschen", "Zeichnen Sie eine Linie zwischen zwei Punkten auf der Karte (Doppelklick zum Abschließen)", "Kurs", "Gegenkurs"),
 ('it',   "Misura", "Azimut", "Cancella", "Disegna una linea tra due punti sulla mappa (doppio clic per terminare)", "Azimut", "Azimut inv."),
 ('pt',   "Medição", "Azimute", "Limpar", "Desenhe uma linha entre dois pontos no mapa (clique duplo para concluir)", "Azimute", "Azimute inv."),
 ('ru',   "Измерение", "Азимут", "Очистить", "Нарисуйте линию между двумя точками на карте (двойной щелчок для завершения)", "Азимут", "Обрат. азимут"),
 ('nl',   "Meten", "Koershoek", "Wissen", "Teken een lijn tussen twee punten op de kaart (dubbelklik om te voltooien)", "Koers", "Terugkoers"),
 ('pl',   "Pomiar", "Azymut", "Wyczyść", "Narysuj linię między dwoma punktami na mapie (podwójne kliknięcie kończy)", "Azymut", "Azymut odwr."),
 ('uk',   "Вимірювання", "Азимут", "Очистити", "Намалюйте лінію між двома точками на карті (подвійне клацання для завершення)", "Азимут", "Зворот. азимут"),
 ('tr',   "Ölçüm", "İleri azimut", "Temizle", "Haritada iki nokta arasında bir çizgi çizin (bitirmek için çift tıklayın)", "Azimut", "Geri azimut"),
 ('ar',   "قياس", "سمت", "مسح", "ارسم خطا بين نقطتين على الخريطة (انقر نقرا مزدوجا للإنهاء)", "السمت", "السمت العكسي"),
 ('hi',   "मापन", "दिक्कोण", "साफ़ करें", "मानचित्र पर दो बिंदुओं के बीच रेखा खींचें (समाप्त करने के लिए डबल-क्लिक करें)", "दिक्कोण", "विपरीत दिक्कोण"),
 ('id',   "Pengukuran", "Azimut", "Hapus", "Gambar garis antara dua titik di peta (klik dua kali untuk selesai)", "Azimut", "Azimut balik"),
 ('th',   "การวัด", "อะซิมุท", "ล้าง", "วาดเส้นระหว่างสองจุดบนแผนที่ (ดับเบิลคลิกเพื่อเสร็จสิ้น)", "อะซิมุท", "อะซิมุทย้อนกลับ"),
 ('vi',   "Đo lường", "Phương vị", "Xóa", "Vẽ đường giữa hai điểm trên bản đồ (nhấp đúp để kết thúc)", "Phương vị", "Phương vị ngược"),
]
for loc, t0, t1, t2, t3, t4, t5 in LOC:
    a = "  '%s': {" % loc if loc.startswith('zh') else "  %s: {" % loc
    rep(a, a + "\n    measureTitle:'%s', measureBearing:'%s', measureClear:'%s', measureHint2pt:'%s', measureAz:'%s', measureBackAz:'%s'," % (t0, t1, t2, t3, t4, t5))

save(F, s, crlf)
print('PATCH_TS_OK')

for f, old, new in [
    ('package.json', '"version": "22.17.0"', '"version": "22.18.0"'),
    ('plugin/reearth.yml', 'version: "22.17.0"', 'version: "22.18.0"'),
]:
    t, c = load(f)
    assert t.count(old) == 1, 'version anchor: ' + f
    save(f, t.replace(old, new, 1), c)
    print('VER_OK', f)

cl, c2 = load('CHANGELOG.md')
entry = '''# Changelog

## v22.18.0
- 新規: **計測パネル＋方位角計測モード**（issue #41、KASUGAI Canvas `web/cesium/geo-tools.js` measureBearing + `web/shared/spatial-ops.js` geodesicInverse の移植）
  - タブバーに 📐 Measure パネルを追加。計測モードの枠組み（モードボタン + Clear + readout）を新設し、今回は Bearing モードのみ実装（#39 距離 / #40 面積が同枠組みに後続追加可能）
  - Bearing: sketch ポリライン（2点・ダブルクリック確定、2点超は両端を使用）→ WGS84 Vincenty 逆解法で始点方位角 az1・終点方位角 az2・地表距離 dist を算出しパネルに表示。結果は「AI Measure」オーバーレイに線分＋中点方位角ラベルとして描画、Clear でオーバーレイ消去＋モード解除
  - sketch 'create' 経路は fly ルート描画と共有し `_measureMode` で振り分け。計測結果は `window._MEASURE_RESULT` に保持し、safeShowUI による iframe 再生成後も readout を復元
  - 新規 i18n キー measureTitle/measureBearing/measureClear/measureHint2pt/measureAz/measureBackAz を全20ロケールへ追加
'''
assert cl.startswith('# Changelog')
save('CHANGELOG.md', cl.replace('# Changelog\n', entry, 1), c2)
print('CHANGELOG_OK')
