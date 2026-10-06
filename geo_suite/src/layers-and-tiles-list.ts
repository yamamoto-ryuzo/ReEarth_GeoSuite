// @ts-nocheck
// Debug logging flag: set to true to enable verbose console logging (extension + UI)
const DEBUG_LOG = false;
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
let _parsedBaseTiles = []; // parsed base: entries for UI dropdown
let _inspectorLegendItems = []; // cached legend items from inspector for initial UI render
let _lastAddedBasemapUrl = null; // encoded URL of the last-added basemap
let _inspectorYahooAppId = null; // optional yahooAppId read from inspector text
let _systemLayerSettings = []; // settings for system layers from inspector
let _inspectorAttrUrlOpen = 'newtab'; // attribute panel URL click mode: 'panel' | 'newtab'
let _vectorFeatureIndex = null; // cached index of vector layer features: { attributes: string[], valuesByAttr: { [attr]: string[] }, featureByAttr: { [attr]: { [value]: { lat, lng } } } }

// UI language override from inspector text ("lang: <code>"). 'auto' = detect via navigator.language in the widget iframe.
let _inspectorLang = 'auto';

// Supported UI locales. 'en' is the base language; missing keys fall back to English.
const GEO_SUPPORTED = ['en','ja','zh-CN','zh-TW','ko','es','fr','de','it','pt','ru','nl','pl','uk','tr','ar','hi','id','th','vi'];

// UI translation dictionary (English base). Values may contain {placeholder} tokens
// that are replaced at runtime by t(key, vars). HTML-bearing values (camHelp) are
// applied via data-i18n-html.
const GEO_I18N = {
  en: {
    minimize:'Minimize', restore:'Restore', move:'Move', moveCamera:'Move Camera',
    tabLayers:'Layers', tabLegend:'Legend', tabSearch:'Search', tabCams:'Cams', tabInfo:'Info', tabShare:'Share', tabSet:'Set', tabAttr:'Attr',
    layersTitle:'Layers', note:'Note', refresh:'Refresh', refreshTitle:'Force Refresh User Layers',
    generateLink:'Generate Link', generating:'Generating...', copy:'Copy', copied:'Copied!',
    sharePasteLabel:'Paste a URL below.', sharePastePh:'Paste URL or ?lat=...', load:'Load', loaded:'Loaded!', invalidData:'Invalid Data', parseError:'Parse Error', error:'Error',
    shareReadUrl:'Move to current URL parameters', urlLoadFlyTo:'Load URL & FlyTo', loading:'Loading...',
    shareFlyCurrentLabel:'Move from current location', flyToCurrentLoc:'Fly to Current Location', getting:'Getting...', restored:'Restored!', noLatLng:'No Lat/Lng', noParams:'No Params', imported:'Imported!',
    vectorSearch:'Vector Search', allSelect:'All', selectValue:'Select value', fly:'Fly', textSearchPh:'Search by text', searchGo:'Search', updateVector:'Update vector data', attrValueList:'Attributes & Values', attrsLoaded:'Loaded {n} attributes', noAttrVector:'No vector layers with attributes', noMatch:'No match',
    addrSearch:'Address Search', providerGsi:'GSI', searchPh:'Enter search keyword', searching:'Searching...', noResults:'No results', searchFailCors:'Search failed. Check your network (CORS).', appIdMissing:'yahooAppId is not set. Add the following line to the plugin inspector:', appIdSample:'yahooAppId: your Yahoo AppID', searchFailAppId:'Search failed. Check the AppID setting and network (CORS).', yahooWarn:'Note: yahooAppId may be exposed. Do not use on public sites.',
    camsTitle:'Camera Presets', camHelp:'cam:Title|Lat|Lng<br>cam:Title|Lat|Lng|h=Height(m)<br>cam:Title|Lat|Lng|h=Height|d=Heading&deg;|p=Pitch&deg;<br><br>Ex: cam:Tokyo Station|35.6812|139.7671<br>Ex: cam:Mt. Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Unspecified parameters keep the current camera settings', currentCamera:'Current Camera', positionLabel:'Position', hprLabel:'Heading/Pitch/Roll', flyToTitle:'Fly to {v}',
    terrain:'Terrain', shadow:'Shadow', depthTest:'Depth Test', on:'ON', off:'OFF', geojsonDrape:'GeoJSON 3D Drape',
    start:'Start', stop:'Stop', current:'Current', apply:'Apply', sentCurrent:'Sent (current set)', sent:'Sent', sendFailed:'Send failed',
    legendTitle:'Legend', legendInstr:'Add "legend: ImageURL" to inspector text.', legendMain:'Main',
    attrTitle:'Attributes', noFeature:'No feature selected.', noAttrAvail:'No attributes available or feature deselected.', backToAttrList:'Back to attribute list', openNewTab:'Open in new tab (bypass sandbox)',
    selectLayer:'Select layer', attrOrValuePh:'Search attributes or values', selectLayerPrompt:'Please select a layer', countFmt:'{rows} items / {attrs} attributes', sortTitle:'Click to sort', noMatchingFeatures:'No matching features', clickToFly:'Click to fly', limitSuffix:' (showing up to {n})', closeAria:'Close',
    noUrlConfigured:'No URL configured'
  },
  ja: {
    minimize:'最小化', restore:'元に戻す', move:'移動', moveCamera:'カメラ移動',
    tabLayers:'レイヤー', tabLegend:'凡例', tabSearch:'検索', tabCams:'カメラ', tabInfo:'情報', tabShare:'共有', tabSet:'設定', tabAttr:'属性',
    layersTitle:'レイヤー', note:'注意', refresh:'更新', refreshTitle:'ユーザーレイヤーを強制更新',
    generateLink:'リンクを生成', generating:'生成中...', copy:'コピー', copied:'コピーしました!',
    sharePasteLabel:'URLをペーストして下さい。', sharePastePh:'URL または ?lat=... を貼付', load:'読込', loaded:'読込完了!', invalidData:'無効なデータ', parseError:'解析エラー', error:'エラー',
    shareReadUrl:'現在のURLパラメータを読み取って移動', urlLoadFlyTo:'URL読込 & FlyTo', loading:'読込中...',
    shareFlyCurrentLabel:'現在位置から移動', flyToCurrentLoc:'現在位置から FlyTo', getting:'取得中...', restored:'復元しました!', noLatLng:'緯度経度なし', noParams:'パラメータなし', imported:'インポートしました!',
    vectorSearch:'ベクトル検索', allSelect:'全選択', selectValue:'値を選択', fly:'移動', textSearchPh:'文字で検索', searchGo:'検索', updateVector:'ベクトルデータを更新', attrValueList:'属性・値一覧', attrsLoaded:'{n} 属性を読み込みました', noAttrVector:'属性付きベクトルがありません', noMatch:'該当なし',
    addrSearch:'住所検索', providerGsi:'地理院', searchPh:'検索ワードを入力', searching:'検索中...', noResults:'結果なし', searchFailCors:'検索に失敗しました。ネットワーク（CORS）を確認してください。', appIdMissing:'AppIDが設定されていません。プラグインのインスペクターに次の行を追加してください：', appIdSample:'yahooAppId: あなたのYahoo AppID', searchFailAppId:'検索に失敗しました。AppID設定やネットワーク（CORS）を確認してください。', yahooWarn:'注意: yahooAppIdは漏洩する可能性があります。公開サイトでは使用しないでください。',
    camsTitle:'カメラプリセット', camHelp:'cam:タイトル|緯度|経度<br>cam:タイトル|緯度|経度|h=高度m<br>cam:タイトル|緯度|経度|h=高度|d=方位&deg;|p=傾き&deg;<br><br>例: cam:東京駅|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定のパラメータは現在のカメラ設定を維持', currentCamera:'現在のカメラ', positionLabel:'位置', hprLabel:'方位/傾き/回転', flyToTitle:'{v} へ移動',
    terrain:'地形', shadow:'影', depthTest:'深度テスト', on:'ON', off:'OFF', geojsonDrape:'GeoJSON 3D ドレープ',
    start:'開始', stop:'終了', current:'現在', apply:'適用', sentCurrent:'送信しました（現在時刻設定済）', sent:'送信しました', sendFailed:'送信に失敗しました',
    legendTitle:'凡例', legendInstr:'インスペクターテキストに "legend: 画像URL" を追加してください。', legendMain:'メイン',
    attrTitle:'属性', noFeature:'地物が選択されていません。', noAttrAvail:'属性がないか、地物の選択が解除されました。', backToAttrList:'属性一覧に戻る', openNewTab:'新しいタブで開く（Sandbox回避）',
    selectLayer:'レイヤを選択', attrOrValuePh:'属性または値で検索', selectLayerPrompt:'レイヤを選択してください', countFmt:'{rows} 件 / {attrs} 属性', sortTitle:'クリックで並び替え', noMatchingFeatures:'該当する地物がありません', clickToFly:'クリックで移動', limitSuffix:' （表示上限 {n} 件）', closeAria:'閉じる',
    noUrlConfigured:'URLが設定されていません'
  },
  'zh-CN': {
    minimize:'最小化', restore:'还原', move:'移动', moveCamera:'移动相机',
    tabLayers:'图层', tabLegend:'图例', tabSearch:'搜索', tabCams:'相机', tabInfo:'信息', tabShare:'分享', tabSet:'设置', tabAttr:'属性',
    layersTitle:'图层', note:'注意', refresh:'刷新', refreshTitle:'强制刷新用户图层',
    generateLink:'生成链接', generating:'生成中...', copy:'复制', copied:'已复制！',
    sharePasteLabel:'请在下方粘贴URL。', sharePastePh:'粘贴 URL 或 ?lat=...', load:'加载', loaded:'已加载！', invalidData:'无效数据', parseError:'解析错误', error:'错误',
    shareReadUrl:'读取当前URL参数并移动', urlLoadFlyTo:'加载URL并飞行', loading:'加载中...',
    shareFlyCurrentLabel:'从当前位置移动', flyToCurrentLoc:'飞往当前位置', getting:'获取中...', restored:'已恢复！', noLatLng:'无经纬度', noParams:'无参数', imported:'已导入！',
    vectorSearch:'矢量搜索', allSelect:'全选', selectValue:'选择值', fly:'飞行', textSearchPh:'按文字搜索', searchGo:'搜索', updateVector:'更新矢量数据', attrValueList:'属性与值列表', attrsLoaded:'已加载 {n} 个属性', noAttrVector:'没有带属性的矢量图层', noMatch:'无匹配',
    addrSearch:'地址搜索', providerGsi:'地理院', searchPh:'输入搜索关键词', searching:'搜索中...', noResults:'无结果', searchFailCors:'搜索失败。请检查网络（CORS）。', appIdMissing:'未设置 AppID。请在插件检查器中添加以下行：', appIdSample:'yahooAppId: 您的 Yahoo AppID', searchFailAppId:'搜索失败。请检查 AppID 设置和网络（CORS）。', yahooWarn:'注意：yahooAppId 可能会泄露。请勿在公开网站上使用。',
    camsTitle:'相机预设', camHelp:'cam:标题|纬度|经度<br>cam:标题|纬度|经度|h=高度m<br>cam:标题|纬度|经度|h=高度|d=方位&deg;|p=俯仰&deg;<br><br>例: cam:东京站|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定的参数将保持当前相机设置', currentCamera:'当前相机', positionLabel:'位置', hprLabel:'航向/俯仰/横滚', flyToTitle:'飞往 {v}',
    terrain:'地形', shadow:'阴影', depthTest:'深度测试', on:'开', off:'关', geojsonDrape:'GeoJSON 3D 贴地',
    start:'开始', stop:'结束', current:'当前', apply:'应用', sentCurrent:'已发送（已设置当前时间）', sent:'已发送', sendFailed:'发送失败',
    legendTitle:'图例', legendInstr:'在检查器文本中添加 "legend: 图片URL"。', legendMain:'主图',
    attrTitle:'属性', noFeature:'未选择要素。', noAttrAvail:'没有属性或已取消选择要素。', backToAttrList:'返回属性列表', openNewTab:'在新标签页打开（绕过沙箱）',
    selectLayer:'选择图层', attrOrValuePh:'按属性或值搜索', selectLayerPrompt:'请选择图层', countFmt:'{rows} 项 / {attrs} 个属性', sortTitle:'点击排序', noMatchingFeatures:'没有匹配的要素', clickToFly:'点击移动', limitSuffix:' （最多显示 {n} 项）', closeAria:'关闭',
    noUrlConfigured:'未配置 URL'
  },
  'zh-TW': {
    minimize:'最小化', restore:'還原', move:'移動', moveCamera:'移動相機',
    tabLayers:'圖層', tabLegend:'圖例', tabSearch:'搜尋', tabCams:'相機', tabInfo:'資訊', tabShare:'分享', tabSet:'設定', tabAttr:'屬性',
    layersTitle:'圖層', note:'注意', refresh:'重新整理', refreshTitle:'強制重新整理使用者圖層',
    generateLink:'產生連結', generating:'產生中...', copy:'複製', copied:'已複製！',
    sharePasteLabel:'請在下方貼上 URL。', sharePastePh:'貼上 URL 或 ?lat=...', load:'載入', loaded:'已載入！', invalidData:'無效資料', parseError:'解析錯誤', error:'錯誤',
    shareReadUrl:'讀取目前 URL 參數並移動', urlLoadFlyTo:'載入 URL 並飛行', loading:'載入中...',
    shareFlyCurrentLabel:'從目前位置移動', flyToCurrentLoc:'飛往目前位置', getting:'取得中...', restored:'已還原！', noLatLng:'無經緯度', noParams:'無參數', imported:'已匯入！',
    vectorSearch:'向量搜尋', allSelect:'全選', selectValue:'選擇值', fly:'飛行', textSearchPh:'按文字搜尋', searchGo:'搜尋', updateVector:'更新向量資料', attrValueList:'屬性與值清單', attrsLoaded:'已載入 {n} 個屬性', noAttrVector:'沒有含屬性的向量圖層', noMatch:'無符合項目',
    addrSearch:'地址搜尋', providerGsi:'地理院', searchPh:'輸入搜尋關鍵字', searching:'搜尋中...', noResults:'無結果', searchFailCors:'搜尋失敗。請檢查網路（CORS）。', appIdMissing:'未設定 AppID。請在外掛檢查器中新增以下行：', appIdSample:'yahooAppId: 您的 Yahoo AppID', searchFailAppId:'搜尋失敗。請檢查 AppID 設定與網路（CORS）。', yahooWarn:'注意：yahooAppId 可能會外洩。請勿在公開網站上使用。',
    camsTitle:'相機預設', camHelp:'cam:標題|緯度|經度<br>cam:標題|緯度|經度|h=高度m<br>cam:標題|緯度|經度|h=高度|d=方位&deg;|p=俯仰&deg;<br><br>例: cam:東京車站|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定的參數將維持目前相機設定', currentCamera:'目前相機', positionLabel:'位置', hprLabel:'航向/俯仰/橫滾', flyToTitle:'飛往 {v}',
    terrain:'地形', shadow:'陰影', depthTest:'深度測試', on:'開', off:'關', geojsonDrape:'GeoJSON 3D 貼地',
    start:'開始', stop:'結束', current:'目前', apply:'套用', sentCurrent:'已傳送（已設定目前時間）', sent:'已傳送', sendFailed:'傳送失敗',
    legendTitle:'圖例', legendInstr:'在檢查器文字中新增 "legend: 圖片URL"。', legendMain:'主圖',
    attrTitle:'屬性', noFeature:'未選擇圖徵。', noAttrAvail:'沒有屬性或已取消選擇圖徵。', backToAttrList:'返回屬性清單', openNewTab:'在新分頁開啟（繞過沙箱）',
    selectLayer:'選擇圖層', attrOrValuePh:'按屬性或值搜尋', selectLayerPrompt:'請選擇圖層', countFmt:'{rows} 項 / {attrs} 個屬性', sortTitle:'點擊排序', noMatchingFeatures:'沒有符合的圖徵', clickToFly:'點擊移動', limitSuffix:' （最多顯示 {n} 項）', closeAria:'關閉',
    noUrlConfigured:'未設定 URL'
  },
  ko: {
    minimize:'최소화', restore:'복원', move:'이동', moveCamera:'카메라 이동',
    tabLayers:'레이어', tabLegend:'범례', tabSearch:'검색', tabCams:'카메라', tabInfo:'정보', tabShare:'공유', tabSet:'설정', tabAttr:'속성',
    layersTitle:'레이어', note:'주의', refresh:'새로고침', refreshTitle:'사용자 레이어 강제 새로고침',
    generateLink:'링크 생성', generating:'생성 중...', copy:'복사', copied:'복사됨!',
    sharePasteLabel:'아래에 URL을 붙여넣으세요.', sharePastePh:'URL 또는 ?lat=... 붙여넣기', load:'불러오기', loaded:'불러옴!', invalidData:'잘못된 데이터', parseError:'파싱 오류', error:'오류',
    shareReadUrl:'현재 URL 파라미터로 이동', urlLoadFlyTo:'URL 불러오기 & 이동', loading:'불러오는 중...',
    shareFlyCurrentLabel:'현재 위치에서 이동', flyToCurrentLoc:'현재 위치로 이동', getting:'가져오는 중...', restored:'복원됨!', noLatLng:'위경도 없음', noParams:'파라미터 없음', imported:'가져옴!',
    vectorSearch:'벡터 검색', allSelect:'전체 선택', selectValue:'값 선택', fly:'이동', textSearchPh:'텍스트로 검색', searchGo:'검색', updateVector:'벡터 데이터 업데이트', attrValueList:'속성·값 목록', attrsLoaded:'{n}개 속성을 불러왔습니다', noAttrVector:'속성이 있는 벡터 레이어가 없습니다', noMatch:'일치 없음',
    addrSearch:'주소 검색', providerGsi:'지리원', searchPh:'검색어 입력', searching:'검색 중...', noResults:'결과 없음', searchFailCors:'검색에 실패했습니다. 네트워크(CORS)를 확인하세요.', appIdMissing:'AppID가 설정되어 있지 않습니다. 플러그인 인스펙터에 다음 줄을 추가하세요:', appIdSample:'yahooAppId: Yahoo AppID 입력', searchFailAppId:'검색에 실패했습니다. AppID 설정과 네트워크(CORS)를 확인하세요.', yahooWarn:'주의: yahooAppId가 노출될 수 있습니다. 공개 사이트에서는 사용하지 마세요.',
    camsTitle:'카메라 프리셋', camHelp:'cam:제목|위도|경도<br>cam:제목|위도|경도|h=고도m<br>cam:제목|위도|경도|h=고도|d=방위&deg;|p=기울기&deg;<br><br>예: cam:도쿄역|35.6812|139.7671<br>예: cam:후지산|35.3606|138.7274|h=5000|p=-30<br><br>지정하지 않은 파라미터는 현재 카메라 설정을 유지', currentCamera:'현재 카메라', positionLabel:'위치', hprLabel:'방위/기울기/회전', flyToTitle:'{v}(으)로 이동',
    terrain:'지형', shadow:'그림자', depthTest:'깊이 테스트', on:'켜기', off:'끄기', geojsonDrape:'GeoJSON 3D 드레이프',
    start:'시작', stop:'종료', current:'현재', apply:'적용', sentCurrent:'전송됨(현재 시간 설정)', sent:'전송됨', sendFailed:'전송 실패',
    legendTitle:'범례', legendInstr:'인스펙터 텍스트에 "legend: 이미지URL"을 추가하세요.', legendMain:'메인',
    attrTitle:'속성', noFeature:'선택된 피처가 없습니다.', noAttrAvail:'속성이 없거나 피처 선택이 해제되었습니다.', backToAttrList:'속성 목록으로 돌아가기', openNewTab:'새 탭에서 열기(샌드박스 우회)',
    selectLayer:'레이어 선택', attrOrValuePh:'속성 또는 값으로 검색', selectLayerPrompt:'레이어를 선택하세요', countFmt:'{rows}건 / {attrs}개 속성', sortTitle:'클릭하여 정렬', noMatchingFeatures:'일치하는 피처가 없습니다', clickToFly:'클릭하여 이동', limitSuffix:' (표시 상한 {n}건)', closeAria:'닫기',
    noUrlConfigured:'URL이 설정되지 않았습니다'
  },
  es: {
    minimize:'Minimizar', restore:'Restaurar', move:'Mover', moveCamera:'Mover cámara',
    tabLayers:'Capas', tabLegend:'Leyenda', tabSearch:'Buscar', tabCams:'Cámaras', tabInfo:'Info', tabShare:'Compartir', tabSet:'Ajustes', tabAttr:'Atrib.',
    layersTitle:'Capas', note:'Nota', refresh:'Actualizar', refreshTitle:'Forzar actualización de capas de usuario',
    generateLink:'Generar enlace', generating:'Generando...', copy:'Copiar', copied:'¡Copiado!',
    sharePasteLabel:'Pega una URL abajo.', sharePastePh:'Pegar URL o ?lat=...', load:'Cargar', loaded:'¡Cargado!', invalidData:'Datos no válidos', parseError:'Error de análisis', error:'Error',
    shareReadUrl:'Ir a los parámetros de la URL actual', urlLoadFlyTo:'Cargar URL y volar', loading:'Cargando...',
    shareFlyCurrentLabel:'Mover desde la ubicación actual', flyToCurrentLoc:'Volar a la ubicación actual', getting:'Obteniendo...', restored:'¡Restaurado!', noLatLng:'Sin lat/lng', noParams:'Sin parámetros', imported:'¡Importado!',
    vectorSearch:'Búsqueda vectorial', allSelect:'Todo', selectValue:'Seleccionar valor', fly:'Volar', textSearchPh:'Buscar por texto', searchGo:'Buscar', updateVector:'Actualizar datos vectoriales', attrValueList:'Atributos y valores', attrsLoaded:'{n} atributos cargados', noAttrVector:'No hay capas vectoriales con atributos', noMatch:'Sin coincidencias',
    addrSearch:'Búsqueda de direcciones', providerGsi:'GSI', searchPh:'Introduce palabra clave', searching:'Buscando...', noResults:'Sin resultados', searchFailCors:'Búsqueda fallida. Revisa la red (CORS).', appIdMissing:'AppID no configurado. Añade la siguiente línea al inspector del plugin:', appIdSample:'yahooAppId: tu AppID de Yahoo', searchFailAppId:'Búsqueda fallida. Revisa el AppID y la red (CORS).', yahooWarn:'Nota: yahooAppId puede quedar expuesto. No usar en sitios públicos.',
    camsTitle:'Preajustes de cámara', camHelp:'cam:Título|Lat|Lng<br>cam:Título|Lat|Lng|h=Altura(m)<br>cam:Título|Lat|Lng|h=Altura|d=Rumbo&deg;|p=Inclinación&deg;<br><br>Ej: cam:Estación de Tokio|35.6812|139.7671<br>Ej: cam:Monte Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Los parámetros no especificados mantienen la cámara actual', currentCamera:'Cámara actual', positionLabel:'Posición', hprLabel:'Rumbo/Inclinación/Balance', flyToTitle:'Volar a {v}',
    terrain:'Terreno', shadow:'Sombra', depthTest:'Prueba de profundidad', on:'SÍ', off:'NO', geojsonDrape:'Drapeado 3D GeoJSON',
    start:'Inicio', stop:'Fin', current:'Actual', apply:'Aplicar', sentCurrent:'Enviado (actual fijado)', sent:'Enviado', sendFailed:'Error al enviar',
    legendTitle:'Leyenda', legendInstr:'Añade "legend: URLdeImagen" al texto del inspector.', legendMain:'Principal',
    attrTitle:'Atributos', noFeature:'Ninguna entidad seleccionada.', noAttrAvail:'Sin atributos o entidad deseleccionada.', backToAttrList:'Volver a la lista', openNewTab:'Abrir en nueva pestaña (evitar sandbox)',
    selectLayer:'Seleccionar capa', attrOrValuePh:'Buscar atributos o valores', selectLayerPrompt:'Selecciona una capa', countFmt:'{rows} elementos / {attrs} atributos', sortTitle:'Clic para ordenar', noMatchingFeatures:'No hay entidades coincidentes', clickToFly:'Clic para volar', limitSuffix:' (máx. {n} mostrados)', closeAria:'Cerrar',
    noUrlConfigured:'URL no configurada'
  },
  fr: {
    minimize:'Réduire', restore:'Restaurer', move:'Déplacer', moveCamera:'Déplacer la caméra',
    tabLayers:'Couches', tabLegend:'Légende', tabSearch:'Recherche', tabCams:'Caméras', tabInfo:'Info', tabShare:'Partager', tabSet:'Réglages', tabAttr:'Attr.',
    layersTitle:'Couches', note:'Note', refresh:'Actualiser', refreshTitle:'Forcer l’actualisation des couches',
    generateLink:'Générer le lien', generating:'Génération...', copy:'Copier', copied:'Copié !',
    sharePasteLabel:'Collez une URL ci-dessous.', sharePastePh:'Coller URL ou ?lat=...', load:'Charger', loaded:'Chargé !', invalidData:'Données invalides', parseError:'Erreur d’analyse', error:'Erreur',
    shareReadUrl:'Aller aux paramètres de l’URL actuelle', urlLoadFlyTo:'Charger l’URL et voler', loading:'Chargement...',
    shareFlyCurrentLabel:'Déplacer depuis la position actuelle', flyToCurrentLoc:'Vol vers la position actuelle', getting:'Obtention...', restored:'Restauré !', noLatLng:'Pas de lat/lng', noParams:'Pas de paramètres', imported:'Importé !',
    vectorSearch:'Recherche vectorielle', allSelect:'Tout', selectValue:'Choisir une valeur', fly:'Voler', textSearchPh:'Recherche par texte', searchGo:'Rechercher', updateVector:'Mettre à jour les données vectorielles', attrValueList:'Attributs et valeurs', attrsLoaded:'{n} attributs chargés', noAttrVector:'Aucune couche vectorielle avec attributs', noMatch:'Aucun résultat',
    addrSearch:'Recherche d’adresse', providerGsi:'GSI', searchPh:'Saisir un mot-clé', searching:'Recherche...', noResults:'Aucun résultat', searchFailCors:'Échec de la recherche. Vérifiez le réseau (CORS).', appIdMissing:'AppID non défini. Ajoutez la ligne suivante à l’inspecteur du plugin :', appIdSample:'yahooAppId : votre AppID Yahoo', searchFailAppId:'Échec de la recherche. Vérifiez l’AppID et le réseau (CORS).', yahooWarn:'Note : yahooAppId peut être exposé. Ne pas utiliser sur des sites publics.',
    camsTitle:'Préréglages caméra', camHelp:'cam:Titre|Lat|Lng<br>cam:Titre|Lat|Lng|h=Altitude(m)<br>cam:Titre|Lat|Lng|h=Altitude|d=Cap&deg;|p=Inclinaison&deg;<br><br>Ex : cam:Gare de Tokyo|35.6812|139.7671<br>Ex : cam:Mont Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Les paramètres non spécifiés conservent les réglages actuels', currentCamera:'Caméra actuelle', positionLabel:'Position', hprLabel:'Cap/Inclinaison/Roulis', flyToTitle:'Vol vers {v}',
    terrain:'Terrain', shadow:'Ombre', depthTest:'Test de profondeur', on:'OUI', off:'NON', geojsonDrape:'Drapé 3D GeoJSON',
    start:'Début', stop:'Fin', current:'Actuel', apply:'Appliquer', sentCurrent:'Envoyé (actuel défini)', sent:'Envoyé', sendFailed:'Échec de l’envoi',
    legendTitle:'Légende', legendInstr:'Ajoutez "legend: URLimage" au texte de l’inspecteur.', legendMain:'Principal',
    attrTitle:'Attributs', noFeature:'Aucun objet sélectionné.', noAttrAvail:'Pas d’attributs ou objet désélectionné.', backToAttrList:'Retour à la liste', openNewTab:'Ouvrir dans un nouvel onglet (contourner le sandbox)',
    selectLayer:'Choisir une couche', attrOrValuePh:'Rechercher attributs ou valeurs', selectLayerPrompt:'Veuillez choisir une couche', countFmt:'{rows} éléments / {attrs} attributs', sortTitle:'Cliquer pour trier', noMatchingFeatures:'Aucun objet correspondant', clickToFly:'Cliquer pour voler', limitSuffix:' (affichage limité à {n})', closeAria:'Fermer',
    noUrlConfigured:'Aucune URL configurée'
  },
  de: {
    minimize:'Minimieren', restore:'Wiederherstellen', move:'Verschieben', moveCamera:'Kamera bewegen',
    tabLayers:'Layer', tabLegend:'Legende', tabSearch:'Suche', tabCams:'Kameras', tabInfo:'Info', tabShare:'Teilen', tabSet:'Einst.', tabAttr:'Attr.',
    layersTitle:'Layer', note:'Hinweis', refresh:'Aktualisieren', refreshTitle:'Benutzer-Layer neu laden',
    generateLink:'Link erzeugen', generating:'Erzeuge...', copy:'Kopieren', copied:'Kopiert!',
    sharePasteLabel:'URL unten einfügen.', sharePastePh:'URL oder ?lat=... einfügen', load:'Laden', loaded:'Geladen!', invalidData:'Ungültige Daten', parseError:'Parse-Fehler', error:'Fehler',
    shareReadUrl:'Zu aktuellen URL-Parametern wechseln', urlLoadFlyTo:'URL laden & anfliegen', loading:'Laden...',
    shareFlyCurrentLabel:'Vom aktuellen Standort bewegen', flyToCurrentLoc:'Zum aktuellen Standort fliegen', getting:'Abrufen...', restored:'Wiederhergestellt!', noLatLng:'Kein Lat/Lng', noParams:'Keine Parameter', imported:'Importiert!',
    vectorSearch:'Vektorsuche', allSelect:'Alle', selectValue:'Wert wählen', fly:'Fliegen', textSearchPh:'Nach Text suchen', searchGo:'Suchen', updateVector:'Vektordaten aktualisieren', attrValueList:'Attribute & Werte', attrsLoaded:'{n} Attribute geladen', noAttrVector:'Keine Vektor-Layer mit Attributen', noMatch:'Kein Treffer',
    addrSearch:'Adresssuche', providerGsi:'GSI', searchPh:'Suchbegriff eingeben', searching:'Suche...', noResults:'Keine Ergebnisse', searchFailCors:'Suche fehlgeschlagen. Netzwerk (CORS) prüfen.', appIdMissing:'AppID nicht gesetzt. Fügen Sie folgende Zeile im Plugin-Inspektor hinzu:', appIdSample:'yahooAppId: Ihre Yahoo-AppID', searchFailAppId:'Suche fehlgeschlagen. AppID und Netzwerk (CORS) prüfen.', yahooWarn:'Hinweis: yahooAppId könnte offengelegt werden. Nicht auf öffentlichen Seiten verwenden.',
    camsTitle:'Kamera-Voreinstellungen', camHelp:'cam:Titel|Lat|Lng<br>cam:Titel|Lat|Lng|h=Höhe(m)<br>cam:Titel|Lat|Lng|h=Höhe|d=Kurs&deg;|p=Neigung&deg;<br><br>Bsp.: cam:Bahnhof Tokio|35.6812|139.7671<br>Bsp.: cam:Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Nicht angegebene Parameter behalten die aktuellen Kameraeinstellungen', currentCamera:'Aktuelle Kamera', positionLabel:'Position', hprLabel:'Kurs/Neigung/Roll', flyToTitle:'Flug zu {v}',
    terrain:'Gelände', shadow:'Schatten', depthTest:'Tiefentest', on:'EIN', off:'AUS', geojsonDrape:'GeoJSON-3D-Drape',
    start:'Start', stop:'Ende', current:'Aktuell', apply:'Anwenden', sentCurrent:'Gesendet (aktuell gesetzt)', sent:'Gesendet', sendFailed:'Senden fehlgeschlagen',
    legendTitle:'Legende', legendInstr:'"legend: BildURL" zum Inspektor-Text hinzufügen.', legendMain:'Haupt',
    attrTitle:'Attribute', noFeature:'Kein Objekt ausgewählt.', noAttrAvail:'Keine Attribute oder Auswahl aufgehoben.', backToAttrList:'Zurück zur Liste', openNewTab:'In neuem Tab öffnen (Sandbox umgehen)',
    selectLayer:'Layer wählen', attrOrValuePh:'Attribute oder Werte suchen', selectLayerPrompt:'Bitte Layer wählen', countFmt:'{rows} Einträge / {attrs} Attribute', sortTitle:'Klicken zum Sortieren', noMatchingFeatures:'Keine passenden Objekte', clickToFly:'Klicken zum Anfliegen', limitSuffix:' (max. {n} angezeigt)', closeAria:'Schließen',
    noUrlConfigured:'Keine URL konfiguriert'
  },
  it: {
    minimize:'Riduci', restore:'Ripristina', move:'Sposta', moveCamera:'Sposta camera',
    tabLayers:'Layer', tabLegend:'Legenda', tabSearch:'Cerca', tabCams:'Camere', tabInfo:'Info', tabShare:'Condividi', tabSet:'Impost.', tabAttr:'Attr.',
    layersTitle:'Layer', note:'Nota', refresh:'Aggiorna', refreshTitle:'Forza aggiornamento layer utente',
    generateLink:'Genera link', generating:'Generazione...', copy:'Copia', copied:'Copiato!',
    sharePasteLabel:'Incolla un URL qui sotto.', sharePastePh:'Incolla URL o ?lat=...', load:'Carica', loaded:'Caricato!', invalidData:'Dati non validi', parseError:'Errore di parsing', error:'Errore',
    shareReadUrl:'Vai ai parametri URL correnti', urlLoadFlyTo:'Carica URL e vola', loading:'Caricamento...',
    shareFlyCurrentLabel:'Sposta dalla posizione corrente', flyToCurrentLoc:'Vola alla posizione corrente', getting:'Recupero...', restored:'Ripristinato!', noLatLng:'Nessun lat/lng', noParams:'Nessun parametro', imported:'Importato!',
    vectorSearch:'Ricerca vettoriale', allSelect:'Tutto', selectValue:'Seleziona valore', fly:'Vola', textSearchPh:'Cerca per testo', searchGo:'Cerca', updateVector:'Aggiorna dati vettoriali', attrValueList:'Attributi e valori', attrsLoaded:'{n} attributi caricati', noAttrVector:'Nessun layer vettoriale con attributi', noMatch:'Nessuna corrispondenza',
    addrSearch:'Ricerca indirizzi', providerGsi:'GSI', searchPh:'Inserisci parola chiave', searching:'Ricerca...', noResults:'Nessun risultato', searchFailCors:'Ricerca fallita. Controlla la rete (CORS).', appIdMissing:'AppID non configurato. Aggiungi la riga seguente nell’ispettore del plugin:', appIdSample:'yahooAppId: il tuo AppID Yahoo', searchFailAppId:'Ricerca fallita. Controlla AppID e rete (CORS).', yahooWarn:'Nota: yahooAppId potrebbe essere esposto. Non usare su siti pubblici.',
    camsTitle:'Preset camera', camHelp:'cam:Titolo|Lat|Lng<br>cam:Titolo|Lat|Lng|h=Altezza(m)<br>cam:Titolo|Lat|Lng|h=Altezza|d=Direzione&deg;|p=Inclinazione&deg;<br><br>Es: cam:Stazione di Tokyo|35.6812|139.7671<br>Es: cam:Monte Fuji|35.3606|138.7274|h=5000|p=-30<br><br>I parametri non specificati mantengono le impostazioni attuali', currentCamera:'Camera corrente', positionLabel:'Posizione', hprLabel:'Direzione/Inclinazione/Rollio', flyToTitle:'Vola a {v}',
    terrain:'Terreno', shadow:'Ombra', depthTest:'Test profondità', on:'SÌ', off:'NO', geojsonDrape:'Drappeggio 3D GeoJSON',
    start:'Inizio', stop:'Fine', current:'Corrente', apply:'Applica', sentCurrent:'Inviato (corrente impostato)', sent:'Inviato', sendFailed:'Invio fallito',
    legendTitle:'Legenda', legendInstr:'Aggiungi "legend: URLimmagine" al testo dell’ispettore.', legendMain:'Principale',
    attrTitle:'Attributi', noFeature:'Nessun elemento selezionato.', noAttrAvail:'Nessun attributo o selezione rimossa.', backToAttrList:'Torna all’elenco', openNewTab:'Apri in nuova scheda (aggira sandbox)',
    selectLayer:'Seleziona layer', attrOrValuePh:'Cerca attributi o valori', selectLayerPrompt:'Seleziona un layer', countFmt:'{rows} elementi / {attrs} attributi', sortTitle:'Clicca per ordinare', noMatchingFeatures:'Nessun elemento corrispondente', clickToFly:'Clicca per volare', limitSuffix:' (max {n} mostrati)', closeAria:'Chiudi',
    noUrlConfigured:'URL non configurato'
  },
  pt: {
    minimize:'Minimizar', restore:'Restaurar', move:'Mover', moveCamera:'Mover câmera',
    tabLayers:'Camadas', tabLegend:'Legenda', tabSearch:'Buscar', tabCams:'Câmeras', tabInfo:'Info', tabShare:'Partilhar', tabSet:'Ajustes', tabAttr:'Atr.',
    layersTitle:'Camadas', note:'Nota', refresh:'Atualizar', refreshTitle:'Forçar atualização das camadas',
    generateLink:'Gerar link', generating:'Gerando...', copy:'Copiar', copied:'Copiado!',
    sharePasteLabel:'Cole uma URL abaixo.', sharePastePh:'Colar URL ou ?lat=...', load:'Carregar', loaded:'Carregado!', invalidData:'Dados inválidos', parseError:'Erro de análise', error:'Erro',
    shareReadUrl:'Ir para os parâmetros da URL atual', urlLoadFlyTo:'Carregar URL e voar', loading:'Carregando...',
    shareFlyCurrentLabel:'Mover da localização atual', flyToCurrentLoc:'Voar para localização atual', getting:'Obtendo...', restored:'Restaurado!', noLatLng:'Sem lat/lng', noParams:'Sem parâmetros', imported:'Importado!',
    vectorSearch:'Busca vetorial', allSelect:'Todos', selectValue:'Selecionar valor', fly:'Voar', textSearchPh:'Buscar por texto', searchGo:'Buscar', updateVector:'Atualizar dados vetoriais', attrValueList:'Atributos e valores', attrsLoaded:'{n} atributos carregados', noAttrVector:'Nenhuma camada vetorial com atributos', noMatch:'Sem correspondência',
    addrSearch:'Busca de endereço', providerGsi:'GSI', searchPh:'Digite a palavra-chave', searching:'Buscando...', noResults:'Sem resultados', searchFailCors:'Falha na busca. Verifique a rede (CORS).', appIdMissing:'AppID não configurado. Adicione a linha a seguir ao inspetor do plugin:', appIdSample:'yahooAppId: seu AppID do Yahoo', searchFailAppId:'Falha na busca. Verifique o AppID e a rede (CORS).', yahooWarn:'Nota: o yahooAppId pode ser exposto. Não use em sites públicos.',
    camsTitle:'Predefinições de câmera', camHelp:'cam:Título|Lat|Lng<br>cam:Título|Lat|Lng|h=Altura(m)<br>cam:Título|Lat|Lng|h=Altura|d=Direção&deg;|p=Inclinação&deg;<br><br>Ex: cam:Estação de Tóquio|35.6812|139.7671<br>Ex: cam:Monte Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Parâmetros não especificados mantêm as configurações atuais', currentCamera:'Câmera atual', positionLabel:'Posição', hprLabel:'Direção/Inclinação/Rolagem', flyToTitle:'Voar para {v}',
    terrain:'Terreno', shadow:'Sombra', depthTest:'Teste de profundidade', on:'SIM', off:'NÃO', geojsonDrape:'Drapeado 3D GeoJSON',
    start:'Início', stop:'Fim', current:'Atual', apply:'Aplicar', sentCurrent:'Enviado (atual definido)', sent:'Enviado', sendFailed:'Falha ao enviar',
    legendTitle:'Legenda', legendInstr:'Adicione "legend: URLdaImagem" ao texto do inspetor.', legendMain:'Principal',
    attrTitle:'Atributos', noFeature:'Nenhum elemento selecionado.', noAttrAvail:'Sem atributos ou elemento desmarcado.', backToAttrList:'Voltar à lista', openNewTab:'Abrir em nova aba (contornar sandbox)',
    selectLayer:'Selecionar camada', attrOrValuePh:'Buscar atributos ou valores', selectLayerPrompt:'Selecione uma camada', countFmt:'{rows} itens / {attrs} atributos', sortTitle:'Clique para ordenar', noMatchingFeatures:'Nenhum elemento correspondente', clickToFly:'Clique para voar', limitSuffix:' (mostrando até {n})', closeAria:'Fechar',
    noUrlConfigured:'URL não configurada'
  },
  ru: {
    minimize:'Свернуть', restore:'Восстановить', move:'Переместить', moveCamera:'Переместить камеру',
    tabLayers:'Слои', tabLegend:'Легенда', tabSearch:'Поиск', tabCams:'Камеры', tabInfo:'Инфо', tabShare:'Поделиться', tabSet:'Настр.', tabAttr:'Атр.',
    layersTitle:'Слои', note:'Примечание', refresh:'Обновить', refreshTitle:'Принудительно обновить слои',
    generateLink:'Создать ссылку', generating:'Создание...', copy:'Копировать', copied:'Скопировано!',
    sharePasteLabel:'Вставьте URL ниже.', sharePastePh:'Вставить URL или ?lat=...', load:'Загрузить', loaded:'Загружено!', invalidData:'Неверные данные', parseError:'Ошибка разбора', error:'Ошибка',
    shareReadUrl:'Перейти к параметрам текущего URL', urlLoadFlyTo:'Загрузить URL и перейти', loading:'Загрузка...',
    shareFlyCurrentLabel:'Переместиться от текущего положения', flyToCurrentLoc:'К текущему положению', getting:'Получение...', restored:'Восстановлено!', noLatLng:'Нет координат', noParams:'Нет параметров', imported:'Импортировано!',
    vectorSearch:'Векторный поиск', allSelect:'Все', selectValue:'Выберите значение', fly:'Перейти', textSearchPh:'Поиск по тексту', searchGo:'Поиск', updateVector:'Обновить векторные данные', attrValueList:'Атрибуты и значения', attrsLoaded:'Загружено атрибутов: {n}', noAttrVector:'Нет векторных слоёв с атрибутами', noMatch:'Нет совпадений',
    addrSearch:'Поиск адреса', providerGsi:'GSI', searchPh:'Введите ключевое слово', searching:'Поиск...', noResults:'Нет результатов', searchFailCors:'Поиск не удался. Проверьте сеть (CORS).', appIdMissing:'AppID не задан. Добавьте следующую строку в инспектор плагина:', appIdSample:'yahooAppId: ваш Yahoo AppID', searchFailAppId:'Поиск не удался. Проверьте AppID и сеть (CORS).', yahooWarn:'Внимание: yahooAppId может быть раскрыт. Не используйте на публичных сайтах.',
    camsTitle:'Предустановки камеры', camHelp:'cam:Название|Широта|Долгота<br>cam:Название|Широта|Долгота|h=Высота(м)<br>cam:Название|Широта|Долгота|h=Высота|d=Азимут&deg;|p=Наклон&deg;<br><br>Пример: cam:Токийский вокзал|35.6812|139.7671<br>Пример: cam:Фудзи|35.3606|138.7274|h=5000|p=-30<br><br>Неуказанные параметры сохраняют текущие настройки камеры', currentCamera:'Текущая камера', positionLabel:'Позиция', hprLabel:'Азимут/Наклон/Крен', flyToTitle:'Перейти к {v}',
    terrain:'Рельеф', shadow:'Тень', depthTest:'Тест глубины', on:'ВКЛ', off:'ВЫКЛ', geojsonDrape:'3D-драпировка GeoJSON',
    start:'Начало', stop:'Конец', current:'Текущее', apply:'Применить', sentCurrent:'Отправлено (текущее задано)', sent:'Отправлено', sendFailed:'Ошибка отправки',
    legendTitle:'Легенда', legendInstr:'Добавьте "legend: URLизображения" в текст инспектора.', legendMain:'Основная',
    attrTitle:'Атрибуты', noFeature:'Объект не выбран.', noAttrAvail:'Нет атрибутов или выбор снят.', backToAttrList:'Назад к списку', openNewTab:'Открыть в новой вкладке (обход sandbox)',
    selectLayer:'Выберите слой', attrOrValuePh:'Поиск по атрибутам или значениям', selectLayerPrompt:'Выберите слой', countFmt:'{rows} записей / {attrs} атрибутов', sortTitle:'Нажмите для сортировки', noMatchingFeatures:'Нет подходящих объектов', clickToFly:'Нажмите для перехода', limitSuffix:' (показано до {n})', closeAria:'Закрыть',
    noUrlConfigured:'URL не настроен'
  },
  nl: {
    minimize:'Minimaliseren', restore:'Herstellen', move:'Verplaatsen', moveCamera:'Camera verplaatsen',
    tabLayers:'Lagen', tabLegend:'Legenda', tabSearch:'Zoeken', tabCams:'Camera’s', tabInfo:'Info', tabShare:'Delen', tabSet:'Inst.', tabAttr:'Attr.',
    layersTitle:'Lagen', note:'Let op', refresh:'Vernieuwen', refreshTitle:'Gebruikerslagen geforceerd vernieuwen',
    generateLink:'Link genereren', generating:'Genereren...', copy:'Kopiëren', copied:'Gekopieerd!',
    sharePasteLabel:'Plak hieronder een URL.', sharePastePh:'Plak URL of ?lat=...', load:'Laden', loaded:'Geladen!', invalidData:'Ongeldige gegevens', parseError:'Parsefout', error:'Fout',
    shareReadUrl:'Naar huidige URL-parameters gaan', urlLoadFlyTo:'URL laden & heen vliegen', loading:'Laden...',
    shareFlyCurrentLabel:'Vanaf huidige locatie verplaatsen', flyToCurrentLoc:'Naar huidige locatie vliegen', getting:'Ophalen...', restored:'Hersteld!', noLatLng:'Geen lat/lng', noParams:'Geen parameters', imported:'Geïmporteerd!',
    vectorSearch:'Vectorzoeking', allSelect:'Alles', selectValue:'Kies waarde', fly:'Vliegen', textSearchPh:'Op tekst zoeken', searchGo:'Zoeken', updateVector:'Vectorgegevens bijwerken', attrValueList:'Attributen & waarden', attrsLoaded:'{n} attributen geladen', noAttrVector:'Geen vectorlagen met attributen', noMatch:'Geen overeenkomst',
    addrSearch:'Adres zoeken', providerGsi:'GSI', searchPh:'Voer zoekterm in', searching:'Zoeken...', noResults:'Geen resultaten', searchFailCors:'Zoeken mislukt. Controleer netwerk (CORS).', appIdMissing:'AppID niet ingesteld. Voeg de volgende regel toe aan de plugin-inspector:', appIdSample:'yahooAppId: uw Yahoo AppID', searchFailAppId:'Zoeken mislukt. Controleer AppID en netwerk (CORS).', yahooWarn:'Let op: yahooAppId kan zichtbaar worden. Niet gebruiken op openbare sites.',
    camsTitle:'Camera-presets', camHelp:'cam:Titel|Lat|Lng<br>cam:Titel|Lat|Lng|h=Hoogte(m)<br>cam:Titel|Lat|Lng|h=Hoogte|d=Richting&deg;|p=Helling&deg;<br><br>Bijv: cam:Station Tokio|35.6812|139.7671<br>Bijv: cam:Mount Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Niet-opgegeven parameters behouden de huidige camera-instellingen', currentCamera:'Huidige camera', positionLabel:'Positie', hprLabel:'Richting/Helling/Rol', flyToTitle:'Vlieg naar {v}',
    terrain:'Terrein', shadow:'Schaduw', depthTest:'Dieptetest', on:'AAN', off:'UIT', geojsonDrape:'GeoJSON 3D-drape',
    start:'Start', stop:'Einde', current:'Huidig', apply:'Toepassen', sentCurrent:'Verzonden (huidig ingesteld)', sent:'Verzonden', sendFailed:'Verzenden mislukt',
    legendTitle:'Legenda', legendInstr:'Voeg "legend: AfbeeldingsURL" toe aan inspectortekst.', legendMain:'Hoofd',
    attrTitle:'Attributen', noFeature:'Geen object geselecteerd.', noAttrAvail:'Geen attributen of selectie opgeheven.', backToAttrList:'Terug naar lijst', openNewTab:'Openen in nieuw tabblad (sandbox omzeilen)',
    selectLayer:'Kies laag', attrOrValuePh:'Zoek attributen of waarden', selectLayerPrompt:'Kies een laag', countFmt:'{rows} items / {attrs} attributen', sortTitle:'Klik om te sorteren', noMatchingFeatures:'Geen overeenkomende objecten', clickToFly:'Klik om te vliegen', limitSuffix:' (max. {n} weergegeven)', closeAria:'Sluiten',
    noUrlConfigured:'Geen URL geconfigureerd'
  },
  pl: {
    minimize:'Minimalizuj', restore:'Przywróć', move:'Przenieś', moveCamera:'Przenieś kamerę',
    tabLayers:'Warstwy', tabLegend:'Legenda', tabSearch:'Szukaj', tabCams:'Kamery', tabInfo:'Info', tabShare:'Udostępnij', tabSet:'Ustaw.', tabAttr:'Atryb.',
    layersTitle:'Warstwy', note:'Uwaga', refresh:'Odśwież', refreshTitle:'Wymuś odświeżenie warstw użytkownika',
    generateLink:'Generuj link', generating:'Generowanie...', copy:'Kopiuj', copied:'Skopiowano!',
    sharePasteLabel:'Wklej URL poniżej.', sharePastePh:'Wklej URL lub ?lat=...', load:'Wczytaj', loaded:'Wczytano!', invalidData:'Nieprawidłowe dane', parseError:'Błąd parsowania', error:'Błąd',
    shareReadUrl:'Przejdź do parametrów bieżącego URL', urlLoadFlyTo:'Wczytaj URL i leć', loading:'Wczytywanie...',
    shareFlyCurrentLabel:'Przenieś z bieżącej lokalizacji', flyToCurrentLoc:'Leć do bieżącej lokalizacji', getting:'Pobieranie...', restored:'Przywrócono!', noLatLng:'Brak lat/lng', noParams:'Brak parametrów', imported:'Zaimportowano!',
    vectorSearch:'Wyszukiwanie wektorowe', allSelect:'Wszystkie', selectValue:'Wybierz wartość', fly:'Leć', textSearchPh:'Szukaj po tekście', searchGo:'Szukaj', updateVector:'Aktualizuj dane wektorowe', attrValueList:'Atrybuty i wartości', attrsLoaded:'Wczytano {n} atrybutów', noAttrVector:'Brak warstw wektorowych z atrybutami', noMatch:'Brak dopasowań',
    addrSearch:'Wyszukiwanie adresu', providerGsi:'GSI', searchPh:'Wpisz słowo kluczowe', searching:'Wyszukiwanie...', noResults:'Brak wyników', searchFailCors:'Wyszukiwanie nie powiodło się. Sprawdź sieć (CORS).', appIdMissing:'AppID nie jest ustawione. Dodaj następujący wiersz do inspektora wtyczki:', appIdSample:'yahooAppId: Twój AppID Yahoo', searchFailAppId:'Wyszukiwanie nie powiodło się. Sprawdź AppID i sieć (CORS).', yahooWarn:'Uwaga: yahooAppId może zostać ujawnione. Nie używaj na publicznych stronach.',
    camsTitle:'Presety kamery', camHelp:'cam:Tytuł|Szer.|Dług.<br>cam:Tytuł|Szer.|Dług.|h=Wysokość(m)<br>cam:Tytuł|Szer.|Dług.|h=Wysokość|d=Kierunek&deg;|p=Nachylenie&deg;<br><br>Przykład: cam:Stacja Tokio|35.6812|139.7671<br>Przykład: cam:Góra Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Nieokreślone parametry zachowują bieżące ustawienia kamery', currentCamera:'Bieżąca kamera', positionLabel:'Pozycja', hprLabel:'Kierunek/Nachylenie/Przechylenie', flyToTitle:'Leć do {v}',
    terrain:'Teren', shadow:'Cień', depthTest:'Test głębi', on:'WŁ.', off:'WYŁ.', geojsonDrape:'Drapowanie 3D GeoJSON',
    start:'Start', stop:'Koniec', current:'Bieżący', apply:'Zastosuj', sentCurrent:'Wysłano (bieżący ustawiony)', sent:'Wysłano', sendFailed:'Wysyłanie nie powiodło się',
    legendTitle:'Legenda', legendInstr:'Dodaj "legend: URLobrazu" do tekstu inspektora.', legendMain:'Główna',
    attrTitle:'Atrybuty', noFeature:'Nie wybrano obiektu.', noAttrAvail:'Brak atrybutów lub odznaczono obiekt.', backToAttrList:'Powrót do listy', openNewTab:'Otwórz w nowej karcie (obejście sandbox)',
    selectLayer:'Wybierz warstwę', attrOrValuePh:'Szukaj atrybutów lub wartości', selectLayerPrompt:'Wybierz warstwę', countFmt:'{rows} elementów / {attrs} atrybutów', sortTitle:'Kliknij, aby sortować', noMatchingFeatures:'Brak pasujących obiektów', clickToFly:'Kliknij, aby polecieć', limitSuffix:' (wyświetlono maks. {n})', closeAria:'Zamknij',
    noUrlConfigured:'Nie skonfigurowano URL'
  },
  uk: {
    minimize:'Згорнути', restore:'Відновити', move:'Перемістити', moveCamera:'Перемістити камеру',
    tabLayers:'Шари', tabLegend:'Легенда', tabSearch:'Пошук', tabCams:'Камери', tabInfo:'Інфо', tabShare:'Поділитися', tabSet:'Налашт.', tabAttr:'Атриб.',
    layersTitle:'Шари', note:'Примітка', refresh:'Оновити', refreshTitle:'Примусово оновити шари користувача',
    generateLink:'Створити посилання', generating:'Створення...', copy:'Копіювати', copied:'Скопійовано!',
    sharePasteLabel:'Вставте URL нижче.', sharePastePh:'Вставте URL або ?lat=...', load:'Завантажити', loaded:'Завантажено!', invalidData:'Недійсні дані', parseError:'Помилка розбору', error:'Помилка',
    shareReadUrl:'Перейти до параметрів поточного URL', urlLoadFlyTo:'Завантажити URL і летіти', loading:'Завантаження...',
    shareFlyCurrentLabel:'Переміститися з поточного місця', flyToCurrentLoc:'Летіти до поточного місця', getting:'Отримання...', restored:'Відновлено!', noLatLng:'Немає координат', noParams:'Немає параметрів', imported:'Імпортовано!',
    vectorSearch:'Векторний пошук', allSelect:'Усі', selectValue:'Оберіть значення', fly:'Летіти', textSearchPh:'Пошук за текстом', searchGo:'Пошук', updateVector:'Оновити векторні дані', attrValueList:'Атрибути та значення', attrsLoaded:'Завантажено {n} атрибутів', noAttrVector:'Немає векторних шарів з атрибутами', noMatch:'Немає збігів',
    addrSearch:'Пошук адреси', providerGsi:'GSI', searchPh:'Введіть ключове слово', searching:'Пошук...', noResults:'Немає результатів', searchFailCors:'Пошук не вдався. Перевірте мережу (CORS).', appIdMissing:'AppID не задано. Додайте наступний рядок в інспектор плагіна:', appIdSample:'yahooAppId: ваш Yahoo AppID', searchFailAppId:'Пошук не вдався. Перевірте AppID та мережу (CORS).', yahooWarn:'Увага: yahooAppId може бути розкрито. Не використовуйте на публічних сайтах.',
    camsTitle:'Пресети камери', camHelp:'cam:Назва|Широта|Довгота<br>cam:Назва|Широта|Довгота|h=Висота(м)<br>cam:Назва|Широта|Довгота|h=Висота|d=Азимут&deg;|p=Нахил&deg;<br><br>Приклад: cam:Токійський вокзал|35.6812|139.7671<br>Приклад: cam:Фудзі|35.3606|138.7274|h=5000|p=-30<br><br>Невказані параметри зберігають поточні налаштування камери', currentCamera:'Поточна камера', positionLabel:'Позиція', hprLabel:'Азимут/Нахил/Крен', flyToTitle:'Летіти до {v}',
    terrain:'Рельєф', shadow:'Тінь', depthTest:'Тест глибини', on:'УВІМК', off:'ВИМК', geojsonDrape:'3D-драпірування GeoJSON',
    start:'Початок', stop:'Кінець', current:'Поточний', apply:'Застосувати', sentCurrent:'Надіслано (поточний задано)', sent:'Надіслано', sendFailed:'Помилка надсилання',
    legendTitle:'Легенда', legendInstr:'Додайте "legend: URLзображення" до тексту інспектора.', legendMain:'Основна',
    attrTitle:'Атрибути', noFeature:'Об’єкт не вибрано.', noAttrAvail:'Немає атрибутів або вибір скасовано.', backToAttrList:'Назад до списку', openNewTab:'Відкрити в новій вкладці (обхід sandbox)',
    selectLayer:'Виберіть шар', attrOrValuePh:'Пошук атрибутів або значень', selectLayerPrompt:'Виберіть шар', countFmt:'{rows} записів / {attrs} атрибутів', sortTitle:'Натисніть для сортування', noMatchingFeatures:'Немає відповідних об’єктів', clickToFly:'Натисніть, щоб летіти', limitSuffix:' (показано до {n})', closeAria:'Закрити',
    noUrlConfigured:'URL не налаштовано'
  },
  tr: {
    minimize:'Küçült', restore:'Geri yükle', move:'Taşı', moveCamera:'Kamerayı taşı',
    tabLayers:'Katmanlar', tabLegend:'Lejant', tabSearch:'Ara', tabCams:'Kameralar', tabInfo:'Bilgi', tabShare:'Paylaş', tabSet:'Ayarlar', tabAttr:'Özellik',
    layersTitle:'Katmanlar', note:'Not', refresh:'Yenile', refreshTitle:'Kullanıcı katmanlarını zorla yenile',
    generateLink:'Bağlantı oluştur', generating:'Oluşturuluyor...', copy:'Kopyala', copied:'Kopyalandı!',
    sharePasteLabel:'Aşağıya bir URL yapıştırın.', sharePastePh:'URL veya ?lat=... yapıştır', load:'Yükle', loaded:'Yüklendi!', invalidData:'Geçersiz veri', parseError:'Ayrıştırma hatası', error:'Hata',
    shareReadUrl:'Geçerli URL parametrelerine git', urlLoadFlyTo:'URL yükle ve uç', loading:'Yükleniyor...',
    shareFlyCurrentLabel:'Geçerli konumdan hareket et', flyToCurrentLoc:'Geçerli konuma uç', getting:'Alınıyor...', restored:'Geri yüklendi!', noLatLng:'Enlem/boylam yok', noParams:'Parametre yok', imported:'İçe aktarıldı!',
    vectorSearch:'Vektör arama', allSelect:'Tümü', selectValue:'Değer seç', fly:'Uç', textSearchPh:'Metne göre ara', searchGo:'Ara', updateVector:'Vektör verilerini güncelle', attrValueList:'Öznitelikler ve değerler', attrsLoaded:'{n} öznitelik yüklendi', noAttrVector:'Öznitelikli vektör katmanı yok', noMatch:'Eşleşme yok',
    addrSearch:'Adres arama', providerGsi:'GSI', searchPh:'Anahtar kelime girin', searching:'Aranıyor...', noResults:'Sonuç yok', searchFailCors:'Arama başarısız. Ağı (CORS) kontrol edin.', appIdMissing:'AppID ayarlanmadı. Plugin denetçisine şu satırı ekleyin:', appIdSample:'yahooAppId: Yahoo AppID’niz', searchFailAppId:'Arama başarısız. AppID ve ağı (CORS) kontrol edin.', yahooWarn:'Not: yahooAppId ifşa olabilir. Herkese açık sitelerde kullanmayın.',
    camsTitle:'Kamera önayarları', camHelp:'cam:Başlık|Enlem|Boylam<br>cam:Başlık|Enlem|Boylam|h=Yükseklik(m)<br>cam:Başlık|Enlem|Boylam|h=Yükseklik|d=Yön&deg;|p=Eğim&deg;<br><br>Örn: cam:Tokyo İstasyonu|35.6812|139.7671<br>Örn: cam:Fuji Dağı|35.3606|138.7274|h=5000|p=-30<br><br>Belirtilmeyen parametreler geçerli kamera ayarlarını korur', currentCamera:'Geçerli kamera', positionLabel:'Konum', hprLabel:'Yön/Eğim/Yatış', flyToTitle:'{v} konumuna uç',
    terrain:'Arazi', shadow:'Gölge', depthTest:'Derinlik testi', on:'AÇIK', off:'KAPALI', geojsonDrape:'GeoJSON 3D Kaplama',
    start:'Başlangıç', stop:'Bitiş', current:'Geçerli', apply:'Uygula', sentCurrent:'Gönderildi (geçerli ayarlı)', sent:'Gönderildi', sendFailed:'Gönderim başarısız',
    legendTitle:'Lejant', legendInstr:'Denetçi metnine "legend: ResimURL" ekleyin.', legendMain:'Ana',
    attrTitle:'Öznitelikler', noFeature:'Öğe seçilmedi.', noAttrAvail:'Öznitelik yok veya seçim kaldırıldı.', backToAttrList:'Listeye dön', openNewTab:'Yeni sekmede aç (sandbox’ı atla)',
    selectLayer:'Katman seç', attrOrValuePh:'Öznitelik veya değer ara', selectLayerPrompt:'Lütfen katman seçin', countFmt:'{rows} öğe / {attrs} öznitelik', sortTitle:'Sıralamak için tıklayın', noMatchingFeatures:'Eşleşen öğe yok', clickToFly:'Uçmak için tıklayın', limitSuffix:' (en fazla {n} gösteriliyor)', closeAria:'Kapat',
    noUrlConfigured:'URL yapılandırılmadı'
  },
  ar: {
    minimize:'تصغير', restore:'استعادة', move:'تحريك', moveCamera:'تحريك الكاميرا',
    tabLayers:'الطبقات', tabLegend:'المفتاح', tabSearch:'بحث', tabCams:'كاميرات', tabInfo:'معلومات', tabShare:'مشاركة', tabSet:'إعدادات', tabAttr:'خصائص',
    layersTitle:'الطبقات', note:'ملاحظة', refresh:'تحديث', refreshTitle:'فرض تحديث طبقات المستخدم',
    generateLink:'إنشاء رابط', generating:'جارٍ الإنشاء...', copy:'نسخ', copied:'تم النسخ!',
    sharePasteLabel:'الصق عنوان URL أدناه.', sharePastePh:'الصق URL أو ?lat=...', load:'تحميل', loaded:'تم التحميل!', invalidData:'بيانات غير صالحة', parseError:'خطأ في التحليل', error:'خطأ',
    shareReadUrl:'الانتقال إلى معلمات URL الحالية', urlLoadFlyTo:'تحميل URL والانتقال', loading:'جارٍ التحميل...',
    shareFlyCurrentLabel:'التحرك من الموقع الحالي', flyToCurrentLoc:'الانتقال إلى الموقع الحالي', getting:'جارٍ الجلب...', restored:'تمت الاستعادة!', noLatLng:'لا توجد إحداثيات', noParams:'لا توجد معلمات', imported:'تم الاستيراد!',
    vectorSearch:'بحث متجهي', allSelect:'الكل', selectValue:'اختر قيمة', fly:'انتقال', textSearchPh:'بحث بالنص', searchGo:'بحث', updateVector:'تحديث البيانات المتجهية', attrValueList:'الخصائص والقيم', attrsLoaded:'تم تحميل {n} خاصية', noAttrVector:'لا توجد طبقات متجهية بخصائص', noMatch:'لا تطابق',
    addrSearch:'بحث العنوان', providerGsi:'GSI', searchPh:'أدخل كلمة البحث', searching:'جارٍ البحث...', noResults:'لا نتائج', searchFailCors:'فشل البحث. تحقق من الشبكة (CORS).', appIdMissing:'AppID غير مضبوط. أضف السطر التالي إلى مفتش الإضافة:', appIdSample:'yahooAppId: مُعرّف Yahoo الخاص بك', searchFailAppId:'فشل البحث. تحقق من AppID والشبكة (CORS).', yahooWarn:'ملاحظة: قد يتم كشف yahooAppId. لا تستخدمه في المواقع العامة.',
    camsTitle:'إعدادات الكاميرا المسبقة', camHelp:'cam:العنوان|خط العرض|خط الطول<br>cam:العنوان|خط العرض|خط الطول|h=الارتفاع(م)<br>cam:العنوان|خط العرض|خط الطول|h=الارتفاع|d=الاتجاه&deg;|p=الميل&deg;<br><br>مثال: cam:محطة طوكيو|35.6812|139.7671<br>مثال: cam:جبل فوجي|35.3606|138.7274|h=5000|p=-30<br><br>المعلمات غير المحددة تحتفظ بإعدادات الكاميرا الحالية', currentCamera:'الكاميرا الحالية', positionLabel:'الموقع', hprLabel:'الاتجاه/الميل/الدوران', flyToTitle:'الانتقال إلى {v}',
    terrain:'التضاريس', shadow:'الظل', depthTest:'اختبار العمق', on:'تشغيل', off:'إيقاف', geojsonDrape:'إسقاط GeoJSON ثلاثي الأبعاد',
    start:'البداية', stop:'النهاية', current:'الحالي', apply:'تطبيق', sentCurrent:'تم الإرسال (تم تعيين الحالي)', sent:'تم الإرسال', sendFailed:'فشل الإرسال',
    legendTitle:'المفتاح', legendInstr:'أضف "legend: رابط الصورة" إلى نص المفتش.', legendMain:'رئيسي',
    attrTitle:'الخصائص', noFeature:'لم يتم اختيار عنصر.', noAttrAvail:'لا توجد خصائص أو تم إلغاء التحديد.', backToAttrList:'العودة إلى القائمة', openNewTab:'فتح في تبويب جديد (تجاوز sandbox)',
    selectLayer:'اختر طبقة', attrOrValuePh:'بحث في الخصائص أو القيم', selectLayerPrompt:'يرجى اختيار طبقة', countFmt:'{rows} عنصر / {attrs} خاصية', sortTitle:'انقر للترتيب', noMatchingFeatures:'لا توجد عناصر مطابقة', clickToFly:'انقر للانتقال', limitSuffix:' (بحد أقصى {n})', closeAria:'إغلاق',
    noUrlConfigured:'لم يتم تكوين URL'
  },
  hi: {
    minimize:'छोटा करें', restore:'पुनर्स्थापित', move:'स्थानांतरित', moveCamera:'कैमरा ले जाएँ',
    tabLayers:'लेयर', tabLegend:'लीजेंड', tabSearch:'खोज', tabCams:'कैमरे', tabInfo:'जानकारी', tabShare:'साझा करें', tabSet:'सेटिंग', tabAttr:'विशेषताएँ',
    layersTitle:'लेयर', note:'नोट', refresh:'रीफ़्रेश', refreshTitle:'उपयोगकर्ता लेयर ज़बरदस्ती रीफ़्रेश',
    generateLink:'लिंक बनाएँ', generating:'बनाया जा रहा है...', copy:'कॉपी', copied:'कॉपी किया गया!',
    sharePasteLabel:'नीचे URL पेस्ट करें।', sharePastePh:'URL या ?lat=... पेस्ट करें', load:'लोड', loaded:'लोड हुआ!', invalidData:'अमान्य डेटा', parseError:'पार्स त्रुटि', error:'त्रुटि',
    shareReadUrl:'वर्तमान URL पैरामीटर पर जाएँ', urlLoadFlyTo:'URL लोड करें और जाएँ', loading:'लोड हो रहा है...',
    shareFlyCurrentLabel:'वर्तमान स्थान से जाएँ', flyToCurrentLoc:'वर्तमान स्थान पर जाएँ', getting:'प्राप्त हो रहा है...', restored:'पुनर्स्थापित!', noLatLng:'अक्षांश/देशांतर नहीं', noParams:'कोई पैरामीटर नहीं', imported:'आयातित!',
    vectorSearch:'वेक्टर खोज', allSelect:'सभी', selectValue:'मान चुनें', fly:'जाएँ', textSearchPh:'टेक्स्ट से खोजें', searchGo:'खोज', updateVector:'वेक्टर डेटा अपडेट करें', attrValueList:'विशेषताएँ और मान', attrsLoaded:'{n} विशेषताएँ लोड हुईं', noAttrVector:'विशेषताओं वाली कोई वेक्टर लेयर नहीं', noMatch:'कोई मिलान नहीं',
    addrSearch:'पता खोज', providerGsi:'GSI', searchPh:'खोज शब्द दर्ज करें', searching:'खोजा जा रहा है...', noResults:'कोई परिणाम नहीं', searchFailCors:'खोज विफल। नेटवर्क (CORS) जाँचें।', appIdMissing:'AppID सेट नहीं है। प्लगइन इंस्पेक्टर में यह पंक्ति जोड़ें:', appIdSample:'yahooAppId: आपकी Yahoo AppID', searchFailAppId:'खोज विफल। AppID और नेटवर्क (CORS) जाँचें।', yahooWarn:'नोट: yahooAppId उजागर हो सकती है। सार्वजनिक साइटों पर उपयोग न करें।',
    camsTitle:'कैमरा प्रीसेट', camHelp:'cam:शीर्षक|अक्षांश|देशांतर<br>cam:शीर्षक|अक्षांश|देशांतर|h=ऊँचाई(m)<br>cam:शीर्षक|अक्षांश|देशांतर|h=ऊँचाई|d=दिशा&deg;|p=झुकाव&deg;<br><br>उदा: cam:टोक्यो स्टेशन|35.6812|139.7671<br>उदा: cam:फ़ूजी पर्वत|35.3606|138.7274|h=5000|p=-30<br><br>अनिर्दिष्ट पैरामीटर वर्तमान कैमरा सेटिंग बनाए रखते हैं', currentCamera:'वर्तमान कैमरा', positionLabel:'स्थिति', hprLabel:'दिशा/झुकाव/रोल', flyToTitle:'{v} पर जाएँ',
    terrain:'भू-आकृति', shadow:'छाया', depthTest:'गहराई परीक्षण', on:'चालू', off:'बंद', geojsonDrape:'GeoJSON 3D ड्रेप',
    start:'प्रारंभ', stop:'समाप्त', current:'वर्तमान', apply:'लागू करें', sentCurrent:'भेजा गया (वर्तमान सेट)', sent:'भेजा गया', sendFailed:'भेजना विफल',
    legendTitle:'लीजेंड', legendInstr:'इंस्पेक्टर टेक्स्ट में "legend: छविURL" जोड़ें।', legendMain:'मुख्य',
    attrTitle:'विशेषताएँ', noFeature:'कोई फ़ीचर चयनित नहीं।', noAttrAvail:'कोई विशेषता नहीं या चयन हटाया गया।', backToAttrList:'सूची पर वापस', openNewTab:'नए टैब में खोलें (sandbox बायपास)',
    selectLayer:'लेयर चुनें', attrOrValuePh:'विशेषता या मान खोजें', selectLayerPrompt:'कृपया लेयर चुनें', countFmt:'{rows} आइटम / {attrs} विशेषताएँ', sortTitle:'क्रमबद्ध करने क्लिक करें', noMatchingFeatures:'कोई मेल खाने वाला फ़ीचर नहीं', clickToFly:'जाने के लिए क्लिक करें', limitSuffix:' (अधिकतम {n} दिखाए गए)', closeAria:'बंद करें',
    noUrlConfigured:'URL कॉन्फ़िगर नहीं'
  },
  id: {
    minimize:'Minimalkan', restore:'Pulihkan', move:'Pindah', moveCamera:'Pindahkan kamera',
    tabLayers:'Lapisan', tabLegend:'Legenda', tabSearch:'Cari', tabCams:'Kamera', tabInfo:'Info', tabShare:'Bagikan', tabSet:'Setel', tabAttr:'Atribut',
    layersTitle:'Lapisan', note:'Catatan', refresh:'Muat ulang', refreshTitle:'Paksa muat ulang lapisan pengguna',
    generateLink:'Buat tautan', generating:'Membuat...', copy:'Salin', copied:'Tersalin!',
    sharePasteLabel:'Tempel URL di bawah.', sharePastePh:'Tempel URL atau ?lat=...', load:'Muat', loaded:'Termuat!', invalidData:'Data tidak valid', parseError:'Kesalahan parsing', error:'Kesalahan',
    shareReadUrl:'Pindah ke parameter URL saat ini', urlLoadFlyTo:'Muat URL & Terbang', loading:'Memuat...',
    shareFlyCurrentLabel:'Pindah dari lokasi saat ini', flyToCurrentLoc:'Terbang ke lokasi saat ini', getting:'Mengambil...', restored:'Dipulihkan!', noLatLng:'Tanpa lat/lng', noParams:'Tanpa parameter', imported:'Diimpor!',
    vectorSearch:'Pencarian vektor', allSelect:'Semua', selectValue:'Pilih nilai', fly:'Terbang', textSearchPh:'Cari teks', searchGo:'Cari', updateVector:'Perbarui data vektor', attrValueList:'Atribut & nilai', attrsLoaded:'{n} atribut dimuat', noAttrVector:'Tidak ada lapisan vektor beratribut', noMatch:'Tidak cocok',
    addrSearch:'Pencarian alamat', providerGsi:'GSI', searchPh:'Masukkan kata kunci', searching:'Mencari...', noResults:'Tidak ada hasil', searchFailCors:'Pencarian gagal. Periksa jaringan (CORS).', appIdMissing:'AppID belum diatur. Tambahkan baris berikut ke inspektur plugin:', appIdSample:'yahooAppId: AppID Yahoo Anda', searchFailAppId:'Pencarian gagal. Periksa AppID dan jaringan (CORS).', yahooWarn:'Catatan: yahooAppId dapat terekspos. Jangan gunakan di situs publik.',
    camsTitle:'Preset kamera', camHelp:'cam:Judul|Lintang|Bujur<br>cam:Judul|Lintang|Bujur|h=Ketinggian(m)<br>cam:Judul|Lintang|Bujur|h=Ketinggian|d=Arah&deg;|p=Kemiringan&deg;<br><br>Cth: cam:Stasiun Tokyo|35.6812|139.7671<br>Cth: cam:Gunung Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Parameter yang tidak diisi mempertahankan pengaturan kamera saat ini', currentCamera:'Kamera saat ini', positionLabel:'Posisi', hprLabel:'Arah/Kemiringan/Roll', flyToTitle:'Terbang ke {v}',
    terrain:'Medan', shadow:'Bayangan', depthTest:'Uji kedalaman', on:'AKTIF', off:'MATI', geojsonDrape:'Drape 3D GeoJSON',
    start:'Mulai', stop:'Selesai', current:'Saat ini', apply:'Terapkan', sentCurrent:'Terkirim (saat ini diatur)', sent:'Terkirim', sendFailed:'Gagal mengirim',
    legendTitle:'Legenda', legendInstr:'Tambahkan "legend: URLGambar" ke teks inspektur.', legendMain:'Utama',
    attrTitle:'Atribut', noFeature:'Tidak ada fitur dipilih.', noAttrAvail:'Tidak ada atribut atau pilihan dibatalkan.', backToAttrList:'Kembali ke daftar', openNewTab:'Buka di tab baru (lewati sandbox)',
    selectLayer:'Pilih lapisan', attrOrValuePh:'Cari atribut atau nilai', selectLayerPrompt:'Silakan pilih lapisan', countFmt:'{rows} item / {attrs} atribut', sortTitle:'Klik untuk mengurutkan', noMatchingFeatures:'Tidak ada fitur yang cocok', clickToFly:'Klik untuk terbang', limitSuffix:' (maks {n} ditampilkan)', closeAria:'Tutup',
    noUrlConfigured:'URL belum dikonfigurasi'
  },
  th: {
    minimize:'ย่อ', restore:'คืนค่า', move:'ย้าย', moveCamera:'ย้ายกล้อง',
    tabLayers:'เลเยอร์', tabLegend:'คำอธิบาย', tabSearch:'ค้นหา', tabCams:'กล้อง', tabInfo:'ข้อมูล', tabShare:'แชร์', tabSet:'ตั้งค่า', tabAttr:'คุณลักษณะ',
    layersTitle:'เลเยอร์', note:'หมายเหตุ', refresh:'รีเฟรช', refreshTitle:'บังคับรีเฟรชเลเยอร์ผู้ใช้',
    generateLink:'สร้างลิงก์', generating:'กำลังสร้าง...', copy:'คัดลอก', copied:'คัดลอกแล้ว!',
    sharePasteLabel:'วาง URL ด้านล่าง', sharePastePh:'วาง URL หรือ ?lat=...', load:'โหลด', loaded:'โหลดแล้ว!', invalidData:'ข้อมูลไม่ถูกต้อง', parseError:'ข้อผิดพลาดในการแยกวิเคราะห์', error:'ข้อผิดพลาด',
    shareReadUrl:'ไปยังพารามิเตอร์ URL ปัจจุบัน', urlLoadFlyTo:'โหลด URL และบินไป', loading:'กำลังโหลด...',
    shareFlyCurrentLabel:'ย้ายจากตำแหน่งปัจจุบัน', flyToCurrentLoc:'บินไปตำแหน่งปัจจุบัน', getting:'กำลังดึงข้อมูล...', restored:'คืนค่าแล้ว!', noLatLng:'ไม่มีละติจูด/ลองจิจูด', noParams:'ไม่มีพารามิเตอร์', imported:'นำเข้าแล้ว!',
    vectorSearch:'ค้นหาเวกเตอร์', allSelect:'ทั้งหมด', selectValue:'เลือกค่า', fly:'บินไป', textSearchPh:'ค้นหาด้วยข้อความ', searchGo:'ค้นหา', updateVector:'อัปเดตข้อมูลเวกเตอร์', attrValueList:'คุณลักษณะและค่า', attrsLoaded:'โหลด {n} คุณลักษณะแล้ว', noAttrVector:'ไม่มีเลเยอร์เวกเตอร์ที่มีคุณลักษณะ', noMatch:'ไม่พบ',
    addrSearch:'ค้นหาที่อยู่', providerGsi:'GSI', searchPh:'ป้อนคำค้นหา', searching:'กำลังค้นหา...', noResults:'ไม่มีผลลัพธ์', searchFailCors:'ค้นหาล้มเหลว ตรวจสอบเครือข่าย (CORS)', appIdMissing:'ยังไม่ได้ตั้ง AppID เพิ่มบรรทัดต่อไปนี้ในอินสเปกเตอร์ของปลั๊กอิน:', appIdSample:'yahooAppId: AppID Yahoo ของคุณ', searchFailAppId:'ค้นหาล้มเหลว ตรวจสอบ AppID และเครือข่าย (CORS)', yahooWarn:'หมายเหตุ: yahooAppId อาจรั่วไหลได้ อย่าใช้บนเว็บไซต์สาธารณะ',
    camsTitle:'พรีเซ็ตกล้อง', camHelp:'cam:ชื่อ|ละติจูด|ลองจิจูด<br>cam:ชื่อ|ละติจูด|ลองจิจูด|h=ความสูง(m)<br>cam:ชื่อ|ละติจูด|ลองจิจูด|h=ความสูง|d=ทิศ&deg;|p=ความเอียง&deg;<br><br>ตัวอย่าง: cam:สถานีโตเกียว|35.6812|139.7671<br>ตัวอย่าง: cam:ภูเขาไฟฟูจิ|35.3606|138.7274|h=5000|p=-30<br><br>พารามิเตอร์ที่ไม่ระบุจะใช้การตั้งค่ากล้องปัจจุบัน', currentCamera:'กล้องปัจจุบัน', positionLabel:'ตำแหน่ง', hprLabel:'ทิศ/ความเอียง/มุมกลิ้ง', flyToTitle:'บินไป {v}',
    terrain:'ภูมิประเทศ', shadow:'เงา', depthTest:'ทดสอบความลึก', on:'เปิด', off:'ปิด', geojsonDrape:'การวาง GeoJSON 3D',
    start:'เริ่ม', stop:'สิ้นสุด', current:'ปัจจุบัน', apply:'ใช้', sentCurrent:'ส่งแล้ว (ตั้งค่าปัจจุบัน)', sent:'ส่งแล้ว', sendFailed:'ส่งไม่สำเร็จ',
    legendTitle:'คำอธิบาย', legendInstr:'เพิ่ม "legend: URLรูปภาพ" ในข้อความอินสเปกเตอร์', legendMain:'หลัก',
    attrTitle:'คุณลักษณะ', noFeature:'ไม่ได้เลือกฟีเจอร์', noAttrAvail:'ไม่มีคุณลักษณะหรือยกเลิกการเลือกแล้ว', backToAttrList:'กลับไปที่รายการ', openNewTab:'เปิดในแท็บใหม่ (ข้าม sandbox)',
    selectLayer:'เลือกเลเยอร์', attrOrValuePh:'ค้นหาคุณลักษณะหรือค่า', selectLayerPrompt:'โปรดเลือกเลเยอร์', countFmt:'{rows} รายการ / {attrs} คุณลักษณะ', sortTitle:'คลิกเพื่อจัดเรียง', noMatchingFeatures:'ไม่มีฟีเจอร์ที่ตรงกัน', clickToFly:'คลิกเพื่อบินไป', limitSuffix:' (แสดงสูงสุด {n})', closeAria:'ปิด',
    noUrlConfigured:'ยังไม่ได้ตั้งค่า URL'
  },
  vi: {
    minimize:'Thu nhỏ', restore:'Khôi phục', move:'Di chuyển', moveCamera:'Di chuyển camera',
    tabLayers:'Lớp', tabLegend:'Chú giải', tabSearch:'Tìm kiếm', tabCams:'Camera', tabInfo:'Thông tin', tabShare:'Chia sẻ', tabSet:'Cài đặt', tabAttr:'Thuộc tính',
    layersTitle:'Lớp', note:'Lưu ý', refresh:'Làm mới', refreshTitle:'Bắt buộc làm mới lớp người dùng',
    generateLink:'Tạo liên kết', generating:'Đang tạo...', copy:'Sao chép', copied:'Đã sao chép!',
    sharePasteLabel:'Dán URL bên dưới.', sharePastePh:'Dán URL hoặc ?lat=...', load:'Tải', loaded:'Đã tải!', invalidData:'Dữ liệu không hợp lệ', parseError:'Lỗi phân tích', error:'Lỗi',
    shareReadUrl:'Đến tham số URL hiện tại', urlLoadFlyTo:'Tải URL & bay tới', loading:'Đang tải...',
    shareFlyCurrentLabel:'Di chuyển từ vị trí hiện tại', flyToCurrentLoc:'Bay tới vị trí hiện tại', getting:'Đang lấy...', restored:'Đã khôi phục!', noLatLng:'Không có lat/lng', noParams:'Không có tham số', imported:'Đã nhập!',
    vectorSearch:'Tìm kiếm vector', allSelect:'Tất cả', selectValue:'Chọn giá trị', fly:'Bay', textSearchPh:'Tìm theo văn bản', searchGo:'Tìm', updateVector:'Cập nhật dữ liệu vector', attrValueList:'Thuộc tính & giá trị', attrsLoaded:'Đã tải {n} thuộc tính', noAttrVector:'Không có lớp vector có thuộc tính', noMatch:'Không khớp',
    addrSearch:'Tìm địa chỉ', providerGsi:'GSI', searchPh:'Nhập từ khóa', searching:'Đang tìm...', noResults:'Không có kết quả', searchFailCors:'Tìm kiếm thất bại. Kiểm tra mạng (CORS).', appIdMissing:'Chưa đặt AppID. Thêm dòng sau vào inspector của plugin:', appIdSample:'yahooAppId: AppID Yahoo của bạn', searchFailAppId:'Tìm kiếm thất bại. Kiểm tra AppID và mạng (CORS).', yahooWarn:'Lưu ý: yahooAppId có thể bị lộ. Không dùng trên trang công khai.',
    camsTitle:'Preset camera', camHelp:'cam:Tiêu đề|Vĩ độ|Kinh độ<br>cam:Tiêu đề|Vĩ độ|Kinh độ|h=Độ cao(m)<br>cam:Tiêu đề|Vĩ độ|Kinh độ|h=Độ cao|d=Hướng&deg;|p=Nghiêng&deg;<br><br>VD: cam:Ga Tokyo|35.6812|139.7671<br>VD: cam:Núi Phú Sĩ|35.3606|138.7274|h=5000|p=-30<br><br>Tham số không chỉ định sẽ giữ cài đặt camera hiện tại', currentCamera:'Camera hiện tại', positionLabel:'Vị trí', hprLabel:'Hướng/Nghiêng/Cuộn', flyToTitle:'Bay tới {v}',
    terrain:'Địa hình', shadow:'Bóng', depthTest:'Kiểm tra độ sâu', on:'BẬT', off:'TẮT', geojsonDrape:'Drape 3D GeoJSON',
    start:'Bắt đầu', stop:'Kết thúc', current:'Hiện tại', apply:'Áp dụng', sentCurrent:'Đã gửi (đặt hiện tại)', sent:'Đã gửi', sendFailed:'Gửi thất bại',
    legendTitle:'Chú giải', legendInstr:'Thêm "legend: URLẢnh" vào văn bản inspector.', legendMain:'Chính',
    attrTitle:'Thuộc tính', noFeature:'Chưa chọn đối tượng.', noAttrAvail:'Không có thuộc tính hoặc đã bỏ chọn.', backToAttrList:'Quay lại danh sách', openNewTab:'Mở trong tab mới (bỏ qua sandbox)',
    selectLayer:'Chọn lớp', attrOrValuePh:'Tìm thuộc tính hoặc giá trị', selectLayerPrompt:'Vui lòng chọn lớp', countFmt:'{rows} mục / {attrs} thuộc tính', sortTitle:'Nhấp để sắp xếp', noMatchingFeatures:'Không có đối tượng phù hợp', clickToFly:'Nhấp để bay', limitSuffix:' (hiển thị tối đa {n})', closeAria:'Đóng',
    noUrlConfigured:'Chưa cấu hình URL'
  }
};

// GeoJSON 3D draping global default. One of: "terrain" | "3dtiles" | "both"
let _geojsonClassification = 'terrain';
let _pluginAddedGeojsonLayerIds = []; // track GeoJSON layer ids for runtime classification updates

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
  
  // Check if system setting overrides visibility
  let isChecked = layer.visible;
  if (_systemLayerSettings && _systemLayerSettings.length > 0) {
     const setting = _systemLayerSettings.find(s => s.name === name || (layer.title && layer.title.trim() === s.name));
     if (setting) {
        isChecked = setting.visible;
     }
  }

  // Check if this layer is pending hide (was added visible:true but requested OFF)
  const isPendingHide = layer && layer.id && _layersPendingHide.has(layer.id);
  // If pending hide, show as unchecked (OFF) in UI
  if (isPendingHide) isChecked = false;
  
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
        <button class="btn-icon move-btn" data-layer-id="${layer.id}" aria-label="Move" title="Move Camera" data-i18n-aria="move" data-i18n-title="moveCamera">📍</button>
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
          const sepChar = parsed[k].sepChar || null;

          // For single separators, treat '/' and '\\' as the same group (normal group).
          // For double separators (exclusive groups), keep separator type distinct
          // so '//' and '\\' exclusive groups are different when names collide.
          let key;
          if (exclusiveAfter) {
            // include separator char so '//' vs '\\' exclusive groups differ
            key = seg + '@@exclusive@@' + (sepChar === '\\' ? '\\' : '/');
          } else {
            // normal group: only segment name (so / and \\ map together)
            key = seg + '@@normal';
          }

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
            // merge semantics: if multiple appearances, combine flags
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
        if ((!layer.data || !layer.data.group) && layer.title && (layer.title.indexOf('/') !== -1 || layer.title.indexOf('\\') !== -1)) {
          const parts = layer.title.split(/[\/\\\\]/).map(s => s.trim()).filter(Boolean);
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

  // Basemap selection is now provided by the dedicated basemap widget
  const basemapSelectHtml = '';

  // Generate camera preset buttons
  const camButtons = _cameraPresets.map((cam, i) => `
    <li class="cam-item" data-cam-index="${i}" title="Fly to ${cam.title}" data-i18n-title="flyToTitle" data-i18n-arg="${cam.title}">
      <span class="cam-title">${cam.title}</span>
      <div class="actions">
      </div>
    </li>
  `).join('');

  // Information panel content
  // (Info content will be loaded from configured URL and injected into #info-content)
  // Prepare legend HTML (Sub-tabs structure)
  const legendInnerHtml = (() => {
      const grouped = {};
      const items = _inspectorLegendItems || [];
      items.forEach(item => {
          const g = item.group || 'Default';
          if (!grouped[g]) grouped[g] = [];
          grouped[g].push(item.url);
      });
      
      const groups = Object.keys(grouped);
      if (groups.length === 0) return '';
      
      // If only Default group, just show images without tabs
      if (groups.length === 1 && groups[0] === 'Default') {
          return grouped['Default'].map(u => `<img src="${u}" style="display:block;max-width:100%;margin-bottom:8px;border:1px solid #ccc;border-radius:4px;">`).join('');
      }
      
      // Multiple groups: Render sub-tabs
      // Ensure 'Default' comes first if exists
      const sortedGroups = groups.sort((a,b) => {
          if (a === 'Default') return -1;
          if (b === 'Default') return 1;
          return a.localeCompare(b);
      });
      
      let tabs = '<div class="legend-sub-tab-bar">';
      let panels = '';
      
      sortedGroups.forEach((g, index) => {
          const isDefault = (g === 'Default');
          const label = isDefault ? 'Main' : g;
          const id = 'legend-sub-' + encodeURIComponent(g).replace(/%/g, '_');
          const activeClass = index === 0 ? 'active' : '';
          const displayStyle = index === 0 ? '' : 'display:none;';
          
          tabs += `<button class="sub-tab ${activeClass}" data-target="${id}"${isDefault ? ' data-i18n="legendMain"' : ''}>${label}</button>`;
          
          const imgs = grouped[g].map(u => `<img src="${u}" style="display:block;max-width:100%;margin-bottom:8px;border:1px solid #ccc;border-radius:4px;">`).join('');
          panels += `<div id="${id}" class="legend-sub-panel" style="${displayStyle}">${imgs}</div>`;
      });
      tabs += '</div>';
      
      return tabs + panels;
  })();
  
  return `
<style>
  /* Base panel width: always returns to this value when the attribute table is closed */
  body { width: ${ATTR_PANEL_BASE_WIDTH}px; }

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
  .primary-background.minimized #share-panel,
  .primary-background.minimized #attr-panel { display:none !important; }

  /* Generic styling system that provides consistent UI components and styling across all plugins */

  /* Panel Scroll Configuration */
  /* Limit panels to fixed height to ensure scrollbar appears even if window auto-resizes */
  #layers-panel, #legend-panel, #cams-panel, #settings-panel, #search-panel, #info-panel, #attr-panel {
    max-height: 600px;
    overflow-y: auto;
    scrollbar-width: thin;
    padding-right: 4px;
  }
  
  /* Sub-tabs for Legend */
  .legend-sub-tab-bar { display:flex; gap:4px; margin-bottom:8px; overflow-x:auto; padding-bottom:2px; }
  .sub-tab { padding:4px 8px; border-radius:4px; background:rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.05); cursor:pointer; font-size:0.9em; white-space:nowrap; }
  .sub-tab.active { background:rgba(0,0,0,0.15); color:#000; font-weight:500; }

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
    padding: 5px;
    box-sizing: border-box;
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

  /* Vector attribute table widget */
  .vector-attr-widget { display: none; position: fixed; left: 0; bottom: 0; width: 100%; height: 100%; min-width: 240px; max-width: 100vw; min-height: 120px; max-height: 100%; z-index: 100; overflow: hidden; box-shadow: 0 -4px 20px rgba(0,0,0,.2); }
  .vector-attr-widget.visible { display: block; }
  .vector-attr-widget-inner { width: 100%; height: 100%; display: flex; flex-direction: column; background: #fff; border-radius: 8px 8px 0 0; overflow: hidden; position: relative; }
  .vector-attr-widget-header { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px; border-bottom: 1px solid #e4ecef; background: #f6f9fb; }
  .vector-attr-widget-title { font-weight: 700; font-size: 14px; }
  .vector-attr-widget-close { min-width: 28px; min-height: 28px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #52636d; cursor: pointer; font-size: 20px; line-height: 1; }
  .vector-attr-widget-filter { display: flex; align-items: center; gap: 8px; padding: 4px 12px; border-bottom: 1px solid #e4ecef; }
  .vector-attr-widget-count { flex: 0 0 auto; white-space: nowrap; color: #71818d; font-size: 11px; }
  #vector-attr-widget-layer { flex: 0 0 140px; min-width: 100px; min-height: 24px; padding: 2px 7px; border: 1px solid #cbd9de; border-radius: 4px; font-size: 13px; background: #fff; }
  #vector-attr-widget-search { flex: 1; min-width: 0; min-height: 24px; padding: 2px 7px; border: 1px solid #cbd9de; border-radius: 4px; font-size: 13px; }
  .vector-attr-widget-table-wrap { flex: 1; overflow: auto; scrollbar-width: auto; }
  .vector-attr-widget-table-wrap::-webkit-scrollbar { width: 9px; height: 9px; }
  .vector-attr-widget-table-wrap::-webkit-scrollbar-thumb { background: #b6c6cd; border-radius: 4.5px; }
  .vector-attr-widget-table-wrap::-webkit-scrollbar-track { background: #eef3f5; }
  .vector-attr-widget-table { width: auto; min-width: 100%; border-collapse: collapse; font-size: 12px; table-layout: auto; white-space: nowrap; }
  .vector-attr-widget-thead th { position: sticky; top: 0; padding: 7px 12px; text-align: left; border-bottom: 1px solid #e4ecef; background: #f6f9fb; color: #52636d; font-weight: 700; font-size: 11px; cursor: pointer; user-select: none; white-space: nowrap; }
  .vector-attr-widget-thead th:hover { background: #eef5f7; }
  .vector-attr-widget-thead th.sorted { background: #e7f3f0; color: #31564f; }
  .sort-marker { margin-left: 4px; font-size: 10px; }
  #vector-attr-widget-list tr { border-bottom: 1px solid #e4ecef; }
  #vector-attr-widget-list tr:hover { background: #f6f9fb; }
  #vector-attr-widget-list td { padding: 6px 12px; vertical-align: top; }
  .vector-attr-widget-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }

</style>

<div class="primary-background rounded-sm">
    <div class="tab-bar" role="tablist">
    <button class="tab minimize" data-action="minimize" aria-pressed="false" title="Minimize" data-i18n-title="minimize">—</button>
    <button class="tab active" data-target="layers-panel" aria-selected="true" data-i18n="tabLayers">Layers</button>
    <button class="tab" data-target="legend-panel" aria-selected="false" data-i18n="tabLegend">Legend</button>
    <button class="tab" data-target="search-panel" aria-selected="false" data-i18n="tabSearch">Search</button>
    <button class="tab" data-target="cams-panel" aria-selected="false" data-i18n="tabCams">Cams</button>
    <button class="tab" data-target="info-panel" aria-selected="false" data-i18n="tabInfo">Info</button>
    <button class="tab" data-target="share-panel" aria-selected="false" data-i18n="tabShare">Share</button>
    <button class="tab" data-target="settings-panel" aria-selected="false" data-i18n="tabSet">Set</button>
    <button class="tab" data-target="attr-panel" aria-selected="false" data-i18n="tabAttr">Attr</button>
  </div>

    <div id="share-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;">Kasugai Link</div>
    <div style="margin-bottom:8px;">
      <button id="generate-permalink-btn" class="btn-primary p-8" style="width:100%;" data-i18n="generateLink">Generate Link</button>
    </div>
    <div style="display:flex;gap:4px;">
      <input type="text" id="permalink-output" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:4px;font-size:0.85em;" readonly />
      <button id="copy-permalink-btn" class="btn-primary p-8" style="min-width:60px;" data-i18n="copy">Copy</button>
    </div>

    <div style="margin-top:12px;border-top:1px solid #ddd;padding-top:8px;">
      <div style="margin-bottom:6px;color:#333;" data-i18n="sharePasteLabel">Paste a URL below.</div>
      <div style="display:flex;gap:4px;">
        <input type="text" id="import-permalink-input" placeholder="Paste URL or ?lat=..." data-i18n-ph="sharePastePh" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:4px;font-size:0.85em;" />
        <button id="load-permalink-btn" class="btn-primary p-6" style="min-width:60px;font-size:0.9em;" data-i18n="load">Load</button>
      </div>
    </div>

    <div style="margin-top:12px;border-top:1px solid #ddd;padding-top:8px;">
      <div style="margin-bottom:6px;color:#333;" data-i18n="shareReadUrl">Move to current URL parameters</div>
      <button id="flyto-viewport-url-btn" class="btn-primary p-6" style="width:100%;font-size:0.9em;" data-i18n="urlLoadFlyTo">Load URL & FlyTo</button>
    </div>

    <div style="margin-top:12px;border-top:1px solid #ddd;padding-top:8px;">
      <div style="margin-bottom:6px;color:#333;" data-i18n="shareFlyCurrentLabel">Move from current location</div>
      <button id="flyto-current-location-btn" class="btn-primary p-6" style="width:100%;font-size:0.9em;" data-i18n="flyToCurrentLoc">Fly to Current Location</button>
    </div>
    </div>

  <div id="search-panel" style="display:none;">
    <div id="vector-search" style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #ddd;">
      <div style="font-weight:600;margin-bottom:6px;" data-i18n="vectorSearch">Vector Search</div>
      <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
        <select id="vector-layer" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;background:#fff;min-width:0;">
          <option value="__all__" data-i18n="allSelect">All</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
        <select id="vector-attr" disabled style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;background:#fff;min-width:0;">
          <option value="__all__" data-i18n="allSelect">All</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
        <select id="vector-value" disabled style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;background:#fff;min-width:0;">
          <option value="" data-i18n="selectValue">Select value</option>
        </select>
        <button id="vector-fly-btn" class="btn-primary p-8" style="flex:0 0 auto;white-space:nowrap;" data-i18n="fly" disabled>Fly</button>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
        <input id="vector-search-text" type="text" placeholder="Search by text" data-i18n-ph="textSearchPh" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;min-width:0;" />
        <button id="vector-text-search-btn" class="btn-primary p-8" style="flex:0 0 auto;white-space:nowrap;" data-i18n="searchGo">Search</button>
      </div>
      <ul id="vector-search-results" style="list-style:none;padding:0;margin:0;max-height:160px;overflow:auto;font-size:0.85em;"></ul>
      <button id="vector-refresh-btn" class="btn-primary p-6" style="width:100%;font-size:0.9em;margin-top:6px;" data-i18n="updateVector">Update vector data</button>
      <button id="vector-attr-list-btn" class="btn-primary p-6" style="width:100%;font-size:0.9em;margin-top:6px;" data-i18n="attrValueList">Attributes & Values</button>
      <div id="vector-search-status" style="font-size:0.85em;color:#666;margin-top:4px;"></div>
    </div>
    <div style="display:flex;justify-content:flex-start;gap:8px;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;" data-i18n="addrSearch">Address Search</div>
      <select id="search-provider" style="border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;background:#fff;flex:0 0 auto;">
        <option value="gsi" selected data-i18n="providerGsi">GSI</option>
        <option value="yahoo">Yahoo</option>
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center;">
      <input type="text" id="search-query" placeholder="Enter search keyword" data-i18n-ph="searchPh" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;min-width:0;" />
      <button id="search-btn" class="btn-primary p-8" style="flex:0 0 auto;white-space:nowrap;" data-i18n="searchGo">Search</button>
    </div>
    <div id="search-results" style="max-height:320px;overflow:auto;">
      <ul id="search-results-list" style="list-style:none;padding:0;margin:0;"></ul>
    </div>
    <div id="search-yahoo-warning" style="font-size:0.9em;color:#a33;margin-top:8px;" data-i18n="yahooWarn">Note: yahooAppId may be exposed. Do not use on public sites.</div>
  </div>

  <div id="layers-panel">
    ${basemapSelectHtml}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;" data-i18n="layersTitle">Layers</div>
      <div style="flex:0 0 auto; display:flex; gap:8px; align-items:center;">
        <a href="https://re-earth-geo-suite.vercel.app/#system-layer-note" target="_blank" rel="noopener noreferrer" style="font-size:0.85em;color:#000;text-decoration:none;border:1px solid #ccc;padding:2px 6px;border-radius:4px;" data-i18n="note">Note</a>
        <button class="restore-all-btn" id="restore-user-layers" title="Force Refresh User Layers" data-i18n="refresh" data-i18n-title="refreshTitle">Refresh</button>
      </div>
    </div>

    <ul class="layers-list">
      ${combinedLayerItems}
    </ul>
  </div>

  <div id="cams-panel" style="display:none;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-weight:600;" data-i18n="camsTitle">Camera Presets</div>
      <div style="flex:0 0 auto; display:flex; gap:8px; align-items:center;">
        <button id="cam-flyto-current" class="btn-primary p-8" title="Fly to Current Location" data-i18n="flyToCurrentLoc" data-i18n-title="flyToCurrentLoc">Fly to Current Location</button>
      </div>
    </div>
    ${_cameraPresets.length > 0 ? `<ul class="layers-list">${camButtons}</ul>` : '<div class="text-sm" style="color:#888;padding:8px 0;" data-i18n-html="camHelp">cam:Title|Lat|Lng<br>cam:Title|Lat|Lng|h=Height(m)<br>cam:Title|Lat|Lng|h=Height|d=Heading&deg;|p=Pitch&deg;<br><br>Ex: cam:Tokyo Station|35.6812|139.7671<br>Ex: cam:Mt. Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Unspecified parameters keep the current camera settings</div>'}
    <div class="cam-current">
      <div style="font-weight:600;margin-bottom:4px;font-size:0.85em;" data-i18n="currentCamera">Current Camera</div>
      <div class="cam-grid">
        <div class="cam-cell"><label>Lat</label><input type="number" step="any" id="cam-lat" value="0"></div>
        <div class="cam-cell"><label>Lng</label><input type="number" step="any" id="cam-lng" value="0"></div>
        <div class="cam-cell"><label>Dir°</label><input type="number" step="any" id="cam-heading" value="0"></div>
        <div class="cam-cell"><label>Tilt°</label><input type="number" step="any" id="cam-pitch" value="0"></div>
        <div class="cam-cell full"><label>H(m)</label><input type="number" step="any" id="cam-height" value="1000"></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <button class="btn-primary cam-flyto-btn" id="cam-refresh" style="flex:1;">🔄 <span data-i18n="refresh">Refresh</span></button>
        <button class="btn-primary cam-flyto-btn" id="cam-manual-flyto" style="flex:1;">▶ <span data-i18n="fly">FlyTo</span></button>
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

    <!-- GeoJSON 3D drape dropdown -->
    <div class="primary-background terrain-row rounded-sm" style="margin-bottom:8px;">
      <div class="text-md" id="geojson-drape-status">GeoJSON 3D Drape</div>
      <select id="geojson-drape-select" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:0.9em;min-width:80px;">
        <option value="terrain">terrain</option>
        <option value="3dtiles">3dtiles</option>
        <option value="both">both</option>
      </select>
    </div>

    <!-- Time row: start / stop / current + Apply (hidden unless Shadow ON) -->
    <div id="time-row" class="primary-background terrain-row rounded-sm" style="margin-bottom:8px; gap:6px; flex-wrap:wrap; display:none;">
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="text-sm" for="startTime" data-i18n="start">Start</label>
        <input type="datetime-local" id="startTime" style="height:28px;" />
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="text-sm" for="stopTime" data-i18n="stop">Stop</label>
        <input type="datetime-local" id="stopTime" style="height:28px;" />
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <label class="text-sm" for="currentTime" data-i18n="current">Current</label>
        <input type="datetime-local" id="currentTime" style="height:28px;" />
      </div>
      <button id="applyTimeBtn" class="btn-primary p-8" style="min-height:28px;" data-i18n="apply">Apply</button>
      <div id="time-status" class="text-sm" style="margin-left:8px; color:#333;">&nbsp;</div>
    </div>
  </div>

  <div id="legend-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;" data-i18n="legendTitle">Legend</div>
    <div id="legend-content">${legendInnerHtml}</div>
    <div id="legend-instruction" class="text-sm" style="color:#888;padding:8px 0;font-size:0.8em;" data-i18n="legendInstr">
      Add "legend: ImageURL" to inspector text.
    </div>
  </div>

  <div id="attr-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;" data-i18n="attrTitle">Attributes</div>
    <button id="attr-vector-attr-list-btn" class="btn-primary p-6" style="width:100%;font-size:0.9em;margin-bottom:8px;" type="button" data-i18n="attrValueList">Attributes & Values</button>
    <div id="attr-content" style="font-size:0.85em;color:#333;" data-i18n="noFeature">No feature selected.</div>
  </div>

</div>

<div id="vector-attr-widget" class="vector-attr-widget">
  <div class="vector-attr-widget-inner">
    <div class="vector-attr-widget-header">
      <span class="vector-attr-widget-title" data-i18n="attrValueList">Attributes & Values</span>
      <button class="vector-attr-widget-close" type="button" aria-label="Close" data-i18n-aria="closeAria">×</button>
    </div>
    <div class="vector-attr-widget-filter">
      <select id="vector-attr-widget-layer" class="vector-attr-widget-layer" title="Select layer" data-i18n-title="selectLayer"></select>
      <input id="vector-attr-widget-search" type="text" placeholder="Search attributes or values" data-i18n-ph="attrOrValuePh" />
      <span id="vector-attr-widget-count" class="vector-attr-widget-count"></span>
    </div>
    <div class="vector-attr-widget-table-wrap">
      <table class="vector-attr-widget-table">
        <thead id="vector-attr-widget-head" class="vector-attr-widget-thead"></thead>
        <tbody id="vector-attr-widget-list"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
  // Debug logging flag injected from the extension side (see DEBUG_LOG at top of file)
  window._DEBUG_LOG = ${DEBUG_LOG};

  // --- i18n: translation dictionary + language config injected from the extension side ---
  window._GEO_I18N = ${JSON.stringify(GEO_I18N).replace(/</g, '\\u003c')};
  window._GEO_LANG_CONF = ${JSON.stringify(_inspectorLang || 'auto')};
  var GEO_I18N = window._GEO_I18N || {};
  var GEO_SUPPORTED = ${JSON.stringify(GEO_SUPPORTED)};
  var GEO_LANG = (function() {
    try {
      var cand = '';
      var conf = String(window._GEO_LANG_CONF || 'auto').toLowerCase().trim();
      if (conf && conf !== 'auto') cand = conf;
      else cand = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
      if (cand.indexOf('zh') === 0) {
        return (cand.indexOf('tw') > -1 || cand.indexOf('hk') > -1 || cand.indexOf('mo') > -1 || cand.indexOf('hant') > -1) ? 'zh-TW' : 'zh-CN';
      }
      var i;
      for (i = 0; i < GEO_SUPPORTED.length; i++) { if (GEO_SUPPORTED[i].toLowerCase() === cand) return GEO_SUPPORTED[i]; }
      var base = cand.split('-')[0];
      for (i = 0; i < GEO_SUPPORTED.length; i++) { if (GEO_SUPPORTED[i].toLowerCase().split('-')[0] === base) return GEO_SUPPORTED[i]; }
    } catch (e) {}
    return 'en';
  })();
  function t(key, vars) {
    var s = (GEO_I18N[GEO_LANG] && GEO_I18N[GEO_LANG][key]) || (GEO_I18N.en && GEO_I18N.en[key]) || key;
    if (vars) { for (var k in vars) { try { s = s.split('{' + k + '}').join(String(vars[k])); } catch (e) {} } }
    return s;
  }
  function applyI18n() {
    try {
      try { document.documentElement.lang = GEO_LANG; } catch (e) {}
      var apply = function(sel, fn) {
        try {
          var nodes = document.querySelectorAll(sel);
          for (var i = 0; i < nodes.length; i++) { try { fn(nodes[i]); } catch (e) {} }
        } catch (e) {}
      };
      apply('[data-i18n]', function(el) { el.textContent = t(el.getAttribute('data-i18n')); });
      apply('[data-i18n-html]', function(el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
      apply('[data-i18n-title]', function(el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'), { v: el.getAttribute('data-i18n-arg') || '' })); });
      apply('[data-i18n-ph]', function(el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
      apply('[data-i18n-aria]', function(el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
      // Status rows: label is composed from key + current ON/OFF state
      var ts = document.getElementById('toggleSwitch'), st = document.getElementById('status');
      if (st) st.textContent = t('terrain') + ': ' + ((ts && ts.checked) ? t('on') : t('off'));
      var ss = document.getElementById('toggleShadowSwitch'), sst = document.getElementById('shadow-status');
      if (sst) sst.textContent = t('shadow') + ': ' + ((ss && ss.checked) ? t('on') : t('off'));
      var dst = document.getElementById('depth-status');
      if (dst) { var wasOff = /OFF\s*$/i.test(String(dst.textContent || '')); dst.textContent = t('depthTest') + ': ' + (wasOff ? t('off') : t('on')); }
      var gd = document.getElementById('geojson-drape-select'), gs = document.getElementById('geojson-drape-status');
      if (gs) gs.textContent = t('geojsonDrape') + ((gd && gd.value) ? ': ' + gd.value : '');
    } catch (e) {}
  }

  function uiLog() { if (!window._DEBUG_LOG) return; try { console.log.apply(console, arguments); } catch(e) {} }
  function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  window.openUrlInAttrPanel = function(event, url) {
    event.preventDefault(); // デフォルトのリンク遷移をキャンセル
    try { uiLog('[openUrlInAttrPanel] _attrUrlOpen:', window._attrUrlOpen, 'url:', url); } catch(e) {}
    const mode = (window._attrUrlOpen || 'newtab').toLowerCase();
    if (mode === 'newtab') {
      if (window.parent && url) window.parent.postMessage({ action: 'openUrl', url: url }, '*');
      return;
    }
    const attrContent = document.getElementById('attr-content');
    if (!attrContent || !url) return;
    const screenHeight = (window.screen && window.screen.availHeight) || (window.screen && window.screen.height) || window.innerHeight;
    const tabBarHeight = document.querySelector('.tab-bar') ? document.querySelector('.tab-bar').offsetHeight : 50;
    let availableHeight = screenHeight - tabBarHeight - 100;
    availableHeight = Math.max(400, Math.min(800, availableHeight));

    attrContent.innerHTML =
      '<div style="margin-bottom:8px;"><button onclick="window.restoreAttrTable()" style="padding:4px 8px; font-size:0.85em; cursor:pointer; background:#f0f0f0; border:1px solid #ccc; border-radius:4px;">&larr; ' + t('backToAttrList') + '</button></div>' +
      '<iframe src="' + url + '" style="width:100%; height:' + availableHeight + 'px; border:1px solid #ccc; background:#fff; overflow:auto;"></iframe>';
  };

  window.restoreAttrTable = function() {
    const attrContent = document.getElementById('attr-content');
    if (attrContent && window._currentAttrHtml) {
      attrContent.innerHTML = window._currentAttrHtml;
    }
  };

  // Inject inspector-provided AppID into UI (only source of AppID)
  try { window._yahooAppId = ${JSON.stringify(_inspectorYahooAppId || '')}; } catch(e) {}
  // Terrain toggle: send action messages to parent
  document.addEventListener('DOMContentLoaded', function() {
      // Apply translations (data-i18n attributes + status labels)
      try { applyI18n(); } catch(e) {}

      // Ask the parent whether there is UI state (active tab) to restore after
      // an iframe recreation (attribute-widget close re-renders the UI).
      try { if (window.parent) window.parent.postMessage({ action: 'requestRestoreState' }, '*'); } catch(e) {}

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
              // Close the expanded attribute widget on minimize / tab switch so
              // the panel always returns to the base size first
              try { if (window._attrPanelExpanded && typeof window.closeVectorAttrWidget === 'function') window.closeVectorAttrWidget(); } catch(e) {}
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
                  this.title = t('minimize');
                } else {
                  root.classList.add('minimized');
                  this.setAttribute('aria-pressed', 'true');
                  this.textContent = '+';
                  this.title = t('restore');
                }
                return;
              }
              const target = this.getAttribute('data-target');
              if (!target) return;
              tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
              this.classList.add('active'); this.setAttribute('aria-selected','true');
              ['layers-panel','legend-panel','search-panel','cams-panel','info-panel','share-panel','settings-panel','attr-panel'].forEach(id => {
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

          // Legend sub-tab switching (event delegation on legend-panel)
          const legendPanel = document.getElementById('legend-panel');
          if (legendPanel) {
              legendPanel.addEventListener('click', function(e) {
                  const btn = e.target.closest('.sub-tab');
                  if (!btn) return;
                  const target = btn.getAttribute('data-target');
                  if (!target) return;
                  
                  // Deactivate all sub-tabs
                  legendPanel.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
                  btn.classList.add('active');
                  
                  // Hide all sub-panels
                  legendPanel.querySelectorAll('.legend-sub-panel').forEach(p => p.style.display = 'none');
                  const p = document.getElementById(target);
                  if (p) p.style.display = 'block';
              });
          }

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
                  status.textContent = t('terrain') + ': ' + t('on');
                  if (window.parent) {
                      window.parent.postMessage({ action: "activateTerrain" }, "*");
                  }
              } else {
                  status.textContent = t('terrain') + ': ' + t('off');
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
              shadowStatus.textContent = t('shadow') + ': ' + (toggleShadow.checked ? t('on') : t('off'));

              toggleShadow.addEventListener('change', function() {
                const checked = !!this.checked;
                shadowStatus.textContent = t('shadow') + ': ' + (checked ? t('on') : t('off'));
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
                depthStatus.textContent = t('depthTest') + ': ' + (checked ? t('on') : t('off'));
                if (window.parent) {
                  window.parent.postMessage({ action: "toggleDepthTest", enabled: checked }, "*");
                }
              });
            }

            // GeoJSON 3D Drape dropdown
            const geojsonDrapeSelect = document.getElementById('geojson-drape-select');
            const geojsonDrapeStatus = document.getElementById('geojson-drape-status');

            if (geojsonDrapeSelect && geojsonDrapeStatus) {
              geojsonDrapeSelect.addEventListener('change', function() {
                const value = this.value || 'terrain';
                if (window.parent) {
                  window.parent.postMessage({ action: "setGeojsonClassification", classification: value }, "*");
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
                      iframe.srcdoc = '<div style="padding:16px;color:#666;">' + t('noUrlConfigured') + '</div>';
                      return;
                    }
                    iframe.src = url;
                  } catch (e) { console.error('[UI] loadInfoUrl failed', e); }
                  return;
                }
                if (msg.action === 'activateShadow' || msg.action === 'deactivateShadow') {
                  const on = msg.action === 'activateShadow';
                  if (toggleShadow) toggleShadow.checked = on;
                  if (shadowStatus) shadowStatus.textContent = t('shadow') + ': ' + (on ? t('on') : t('off'));
                  updateTimeRowVisibility(on);
                } else if (msg.action === 'terrainState') {
                  // message from extension to initialize/sync terrain toggle
                  const on = !!msg.enabled;
                  if (toggleSwitch) toggleSwitch.checked = on;
                  if (status) status.textContent = t('terrain') + ': ' + (on ? t('on') : t('off'));
                } else if (msg.action === 'shadowState') {
                  // message from extension to initialize/sync shadow toggle
                  const on = !!msg.enabled;
                  if (toggleShadow) toggleShadow.checked = on;
                  if (shadowStatus) shadowStatus.textContent = t('shadow') + ': ' + (on ? t('on') : t('off'));
                  updateTimeRowVisibility(on);
                } else if (msg.action === 'depthTestState') {
                  const on = !!msg.enabled;
                  if (toggleDepth) toggleDepth.checked = on;
                  if (depthStatus) depthStatus.textContent = t('depthTest') + ': ' + (on ? t('on') : t('off'));
                } else if (msg.action === 'geojsonDrapeState') {
                  const value = msg.classification || 'terrain';
                  if (geojsonDrapeSelect) geojsonDrapeSelect.value = value;
                  if (geojsonDrapeStatus) geojsonDrapeStatus.textContent = t('geojsonDrape') + ': ' + value;
                } else if (msg.action === 'cameraState') {
                  // message from extension to initialize/sync camera info
                  const cam = msg.camera || null;
                  if (cam) {
                    const posEl = document.getElementById('camera-position');
                    const rotEl = document.getElementById('camera-rotation');
                    try {
                      const p = cam.position || cam.pos || cam.center || null;
                      if (posEl) posEl.textContent = t('positionLabel') + ': ' + (p ? JSON.stringify(p) : JSON.stringify(cam));
                      const h = cam.heading || cam.yaw || cam.h || null;
                      const pch = cam.pitch || cam.pitchDeg || cam.pitchDegree || null;
                      const r = cam.roll || cam.r || null;
                      if (rotEl) rotEl.textContent = t('hprLabel') + ': ' + [h, pch, r].map(v => v == null ? '—' : String(v)).join(' / ');
                    } catch (e) {}
                  }
                } else if (msg.action === 'updateLegends') {
                  const container = document.getElementById('legend-content');
                  if(container && msg.items) {
                    const grouped = {};
                    msg.items.forEach(function(item) {
                        const g = item.group || 'Default';
                        if (!grouped[g]) grouped[g] = [];
                        grouped[g].push(item.url);
                    });
                    
                    const groups = Object.keys(grouped);
                    if (groups.length === 0) {
                        container.innerHTML = '';
                    } else if (groups.length === 1 && groups[0] === 'Default') {
                        container.innerHTML = grouped['Default'].map(function(u){ return '<img src="'+u+'" style="display:block;max-width:100%;margin-bottom:8px;border:1px solid #ccc;border-radius:4px;">'; }).join('');
                    } else {
                        // Sort groups
                        const sortedGroups = groups.sort(function(a,b) {
                            if (a === 'Default') return -1;
                            if (b === 'Default') return 1;
                            return a.localeCompare(b);
                        });
                        
                        let tabs = '<div class="legend-sub-tab-bar">';
                        let panels = '';
                        
                        sortedGroups.forEach(function(g, index) {
                            const isDefault = (g === 'Default');
                            const label = isDefault ? t('legendMain') : g;
                            const id = 'legend-sub-' + encodeURIComponent(g).replace(/%/g, '_');
                            const activeClass = index === 0 ? 'active' : '';
                            const displayStyle = index === 0 ? '' : 'display:none;';
                            
                            tabs += '<button class="sub-tab '+activeClass+'" data-target="'+id+'">'+label+'</button>';
                            
                            const imgs = grouped[g].map(function(u){ return '<img src="'+u+'" style="display:block;max-width:100%;margin-bottom:8px;border:1px solid #ccc;border-radius:4px;">'; }).join('');
                            panels += '<div id="'+id+'" class="legend-sub-panel" style="'+displayStyle+'">'+imgs+'</div>';
                        });
                        tabs += '</div>';
                        container.innerHTML = tabs + panels;
                    }
                    
                    const instruction = document.getElementById('legend-instruction');
                    if (instruction) {
                      instruction.style.display = msg.items.length > 0 ? 'none' : 'block';
                    }
                  }
                } else if (msg.action === 'setAttrPanelSize') {
                  // Single entry point for applying the attribute panel width/height
                  // and the corresponding widget visibility / body size.
                  try {
                    if (typeof window.applyAttrPanelSize === 'function') {
                      window.applyAttrPanelSize(!!msg.expanded, msg.width, msg.height);
                    }
                  } catch(e) {}
                } else if (msg.action === 'activateTab') {
                  // Re-activate the tab that was open before the iframe was
                  // recreated on attribute-widget close.
                  try {
                    const t = document.querySelector('.tab-bar .tab[data-target="' + msg.tab + '"]');
                    if (t) t.click();
                  } catch(e) {}
                } else if (msg.action === 'featureSelected') {
                  try { uiLog('[featureSelected] received attrUrlOpen:', msg.attrUrlOpen, 'properties:', msg.properties ? Object.keys(msg.properties) : null); } catch(e) {}
                  window._attrUrlOpen = (typeof msg.attrUrlOpen === 'string' ? msg.attrUrlOpen : 'newtab');
                  window._attrLayerValue = (typeof msg.layerId === 'string' && msg.layerId) ? msg.layerId : null;
                  const attrContent = document.getElementById('attr-content');
                  if (attrContent) {
                    if (msg.properties && Object.keys(msg.properties).length > 0) {
                      let html = '<table style="width:100%; border-collapse:collapse; text-align:left; background:#fff;">';
                      html += '<tbody>';
                      for (const key in msg.properties) {
                         const val = msg.properties[key];
                         let displayVal = (typeof val === 'object' && val !== null) ? JSON.stringify(val) : String(val);
                         let escapedKey = String(key).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                         let escapedVal = String(displayVal).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                         
                         // URLの場合はハイパーリンク化
                         if (escapedVal.startsWith('http://') || escapedVal.startsWith('https://')) {
                             // _top を指定して、サンドボックス化されたiframeではなく最上位のウィンドウから開かせる
                             // 左クリック時は onclick イベントでウィジェット内の属性パネル(attr-panel)に表示させる
                             // エスケープ処理: テンプレート文字列内でシングルクォーテーションを正しく出力するためにバックスラッシュを2重にする
                             let linkIcon = '&nbsp;<span title="' + t('openNewTab') + '" style="text-decoration:none; color:#666; font-size:1.1em; cursor:pointer;" onclick="event.stopPropagation(); window.parent.postMessage({ action: \\\'openUrl\\\', url: \\\'' + displayVal + '\\\' }, \\\'*\\\'); return false;">&#x2197;</span>';
                             escapedVal = '<a href="' + displayVal + '" target="_top" rel="noopener noreferrer" style="color:#0066cc; text-decoration:underline; word-break:break-all;" onclick="window.openUrlInAttrPanel(event, \\\'' + displayVal + '\\\')">' + escapedVal + '</a>' + linkIcon;
                         }
                         
                         html += '<tr>' +
                           '<td style="border:1px solid #ddd; padding:4px; font-weight:600; word-break:break-all; width:40%;">' + escapedKey + '</td>' +
                           '<td style="border:1px solid #ddd; padding:4px; word-break:break-all;">' + escapedVal + '</td>' +
                         '</tr>';
                      }
                      html += '</tbody></table>';
                      attrContent.innerHTML = html;
                      window._currentAttrHtml = html; // 戻るボタン用にバックアップ
                    } else {
                      attrContent.innerHTML = t('noAttrAvail');
                      window._currentAttrHtml = attrContent.innerHTML;
                    }
                  }
                  // 属性タブを自動で開く
                  if (attrContent && msg.layerId && msg.featureId) {
                    try {
                      const attrTab = document.querySelector('.tab[data-target="attr-panel"]');
                      if (attrTab) {
                        document.querySelectorAll('.tab-bar .tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
                        attrTab.classList.add('active'); attrTab.setAttribute('aria-selected','true');
                      }
                      ['layers-panel','legend-panel','search-panel','cams-panel','info-panel','share-panel','settings-panel','attr-panel'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = (id === 'attr-panel') ? '' : 'none';
                      });
                    } catch(e) {}
                  }
                } else if (msg.action === 'requestVectorFeatureData') {
                  try {
                    const sources = msg.sources || [];
                    const results = {};
                    const fetches = [];
                    sources.forEach(function(s) {
                      try {
                        if (s.value !== undefined) {
                          if (typeof s.value === 'string') {
                            results[s.id] = { title: s.title, type: s.type, csv: s.csv, raw: s.value };
                          } else if (typeof s.value === 'object' && s.value !== null) {
                            results[s.id] = { title: s.title, type: s.type, csv: s.csv, value: s.value };
                          }
                        } else if (s.url) {
                          fetches.push(new Promise(function(resolve) {
                            fetch(s.url, { method: 'GET' })
                              .then(function(res) { if (!res || !res.ok) throw new Error('status ' + (res && res.status)); return res.text(); })
                              .then(function(text) { results[s.id] = { title: s.title, type: s.type, csv: s.csv, raw: text }; resolve(); })
                              .catch(function(err) { console.error('[requestVectorFeatureData] fetch failed', s.url, err); resolve(); });
                          }));
                        }
                      } catch (e2) { console.error('[requestVectorFeatureData] source error', e2); }
                    });
                    Promise.all(fetches).then(function() {
                      if (window.parent) window.parent.postMessage({ action: 'vectorFeatureData', layers: results }, '*');
                    });
                  } catch (e) { console.error('[requestVectorFeatureData] UI error', e); }
                } else if (msg.action === 'vectorFeatureIndex') {
                  try {
                    const layerSelect = document.getElementById('vector-layer');
                    const attrSelect = document.getElementById('vector-attr');
                    const valueSelect = document.getElementById('vector-value');
                    const flyBtn = document.getElementById('vector-fly-btn');
                    const statusEl = document.getElementById('vector-search-status');

                    window._vectorSearchData = { all: (msg.all || {}), layers: (msg.layers || {}), layerOptions: (msg.layerOptions || []) };

                    if (layerSelect) {
                      let html = '<option value="__all__">' + t('allSelect') + '</option>';
                      const opts = window._vectorSearchData.layerOptions || [];
                      opts.forEach((o) => {
                        html += '<option value="' + String(o.id).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '">' + String(o.title || o.id).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</option>';
                      });
                      layerSelect.innerHTML = html;
                      layerSelect.disabled = (opts.length === 0);
                    }

                    if (layerSelect && !layerSelect.disabled) {
                      try { layerSelect.dispatchEvent(new Event('change')); } catch (e) {}
                    }

                    const all = window._vectorSearchData.all || {};
                    if (all.attributes && all.attributes.length) {
                      if (statusEl) statusEl.textContent = t('attrsLoaded', { n: all.attributes.length });
                    } else if (statusEl) {
                      statusEl.textContent = t('noAttrVector');
                    }
                  } catch (e) { console.error('[vectorFeatureIndex] UI error', e); }
                } else if (msg.action === 'attrUrlOpen') {
                  try { uiLog('[attrUrlOpen] received mode:', msg.mode); } catch(e) {}
                  window._attrUrlOpen = (typeof msg.mode === 'string' ? msg.mode : 'newtab');
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
                    if (timeStatus) timeStatus.textContent = t('sentCurrent');
                  }
                try {
                  uiLog('[UI] posting setTime message', msg);
                  if (window.parent) {
                    window.parent.postMessage(msg, "*");
                  }
                  if (timeStatus) {
                    timeStatus.textContent = t('sent');
                    setTimeout(() => { if (timeStatus) timeStatus.textContent = '\u00A0'; }, 2000);
                  }
                } catch (e) {
                  console.error('[UI] failed to post setTime', e);
                  if (timeStatus) timeStatus.textContent = t('sendFailed');
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
            flyToCurrentBtn.textContent = t('getting');
            parent.postMessage({ action: 'requestGeolocation' }, '*');
            setTimeout(() => {
                 if(flyToCurrentBtn.textContent === t('getting')) {
                     flyToCurrentBtn.textContent = t('flyToCurrentLoc');
                 }
            }, 8000);
        });
      }

      // Camera Refresh button: request current camera from extension
      const refreshBtn = document.getElementById('cam-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
          parent.postMessage({ action: 'requestCamera' }, '*');
        });
      }

      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data ? e.data : null;
          try { uiLog('[UI] window.message received:', msg); } catch(e){}
          if (!msg) return;
          if (msg.action === 'startTimer') {
            // Timer delegation from the extension (QuickJS has no setTimeout)
            const timerId = msg.id;
            const timerMs = (typeof msg.ms === 'number' && msg.ms >= 0) ? msg.ms : 0;
            try {
              setTimeout(function() {
                try { window.parent.postMessage({ action: 'timerDone', id: timerId }, '*'); } catch(e) {}
              }, timerMs);
            } catch(e) {
              try { window.parent.postMessage({ action: 'timerDone', id: timerId }, '*'); } catch(e2) {}
            }
            return;
          }
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
              try { uiLog('[UI] geolocationResult received:', msg); } catch(e) {}
              if (msg.success) {
                if (btn) btn.textContent = t('flyToCurrentLoc');
                try {
                  if (msg.layerId) {
                    // Use shared scheduler so search and geolocation both trigger removal
                    scheduleLayerRemoval(msg.layerId, 8000);
                  }
                } catch(e) {}
              } else {
                if (btn) {
                  btn.textContent = t('error');
                  setTimeout(() => { btn.textContent = t('flyToCurrentLoc'); }, 2000);
                }
              }
            } catch(e) { try { console.error('[UI] btn update error', e); } catch(_){} }

                // (deprecated) 'searchFlyMarker' handling removed; geolocationResult now used uniformly

          } else if (msg.action === 'permalinkGenerated') {
            
            const output = document.getElementById('permalink-output');
            if (output) {
                try {
                    const sp = new URLSearchParams();
                    if (msg.lat != null) sp.set('lat', String(msg.lat));
                    if (msg.lng != null) sp.set('lng', String(msg.lng));
                    if (msg.height != null) sp.set('height', String(msg.height));
                    if (msg.heading != null) sp.set('heading', String(msg.heading));
                    if (msg.pitch != null) sp.set('pitch', String(msg.pitch));
                    if (msg.layers) sp.set('layers', String(msg.layers));

                    const query = sp.toString();
                    const urlStr = '?' + query;
                    output.value = urlStr;
                    // After writing output, call shared copy helper to ensure same behavior as Copy button
                    try { copyPermalinkToClipboard(urlStr, document.getElementById('generate-permalink-btn')); } catch(e) {}
                } catch(e) {
                    output.value = '?error=url_construction_failed';
                }
            }
          }
        } catch(e){}
      });

      // Handle external applyPermalinkState messages by applying locally (no parent forwarding)
      const applyPermalinkPayload = (payload, feedbackEl) => {
        try {
          // Apply camera immediately if provided
          if (payload.lat != null && payload.lng != null) {
            try {
              if (typeof reearth !== 'undefined' && reearth && reearth.camera) {
                reearth.camera.flyTo({
                  lat: payload.lat,
                  lng: payload.lng,
                  height: payload.height || 1000,
                  heading: (payload.heading || 0) * Math.PI / 180,
                  pitch: (payload.pitch || -30) * Math.PI / 180,
                  roll: 0,
                }, { duration: 0.1 });
              }
            } catch(e) { try { console.error('[applyPermalinkPayload] camera flyTo failed', e); } catch(err){} }
          }

          // Apply layers with retry
          const applyLayersWithRetry = (layersStr, attempt = 1) => {
            try {
              const maxAttempts = 8;
              const delayMs = 800;
              if (!layersStr) return;
              const ids = layersStr.split(',').map(s => s.trim()).filter(Boolean);
              if (!ids.length) return;

              const layersApiAvailable = (typeof reearth !== 'undefined' && reearth.layers && Array.isArray(reearth.layers.layers));
              if (!layersApiAvailable || (reearth.layers.layers && reearth.layers.layers.length === 0)) {
                if (attempt <= maxAttempts) {
                  setTimeout(() => applyLayersWithRetry(layersStr, attempt + 1), delayMs);
                  return;
                } else {
                  try { if (reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') reearth.ui.postMessage({ action: 'permalinkApplied', success: false, reason: 'layers_unavailable' }); } catch(e){}
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

              try { if (reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') reearth.ui.postMessage({ action: 'permalinkApplied', success: true, requested: ids.length, found: found, changed: applied }); } catch(e){}
            } catch(e) {
              if (attempt <= 8) setTimeout(() => applyLayersWithRetry(layersStr, attempt + 1), 800);
              else try { console.error('[applyPermalinkPayload] unexpected error applying layers', e); } catch(err){}
            }
          };

          if (payload.layers) applyLayersWithRetry(payload.layers);

          // Feedback
          if (feedbackEl) {
            try {
              const orig = feedbackEl.textContent;
              feedbackEl.textContent = t('imported');
              setTimeout(() => { feedbackEl.textContent = orig; }, 2000);
            } catch(e){}
          }
          return true;
        } catch(e) { try { console.error('[applyPermalinkPayload] error:', e); } catch(err){} }
        return false;
      };

      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data ? e.data : null;
          try { uiLog('[UI] forward listener got message:', msg); } catch(e){}
          if (!msg || !msg.action) return;
          if (msg.action === 'applyPermalinkState') {
            try {
              try { uiLog('[UI] applying applyPermalinkState locally:', msg); } catch(e){}
              applyPermalinkPayload(msg);
            } catch(_){ try { console.error('[UI] applyPermalinkState failed', _); } catch(e){} }
          }
        } catch (e) { try { console.error('[UI] forward listener error', e); } catch(err){} }
      });

      
      // Shared copy helper: copies text if provided, otherwise copies value from 'permalink-output'.
      const copyPermalinkToClipboard = (text, feedbackEl) => {
        try {
          const outputEl = document.getElementById('permalink-output');
          const toCopy = (typeof text === 'string' && text) ? text : (outputEl && outputEl.value ? outputEl.value : '');
          if (!toCopy) return;

          const showFeedback = (el) => {
            try {
              if (!el) return;
              const orig = el.textContent;
              el.textContent = t('copied');
              setTimeout(() => { el.textContent = orig; }, 1500);
            } catch(e) {}
          };

          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(toCopy).then(() => { showFeedback(feedbackEl); }).catch(() => {
              try {
                if (outputEl) { outputEl.select(); document.execCommand('copy'); }
                else {
                  const ta = document.createElement('textarea'); ta.value = toCopy; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                }
              } catch(e) {}
              showFeedback(feedbackEl);
            });
          } else {
            try {
              if (outputEl) { outputEl.select(); document.execCommand('copy'); }
              else { const ta = document.createElement('textarea'); ta.value = toCopy; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
            } catch(e) {}
            showFeedback(feedbackEl);
          }
        } catch(e) {}
      };

      // Permalink UI handlers
      const generateBtn = document.getElementById('generate-permalink-btn');
      const copyBtn = document.getElementById('copy-permalink-btn');
      const output = document.getElementById('permalink-output');

          if (generateBtn) {
          generateBtn.addEventListener('click', function() {
            if (output) output.value = t('generating');
            // Send request to extension to generate fresh permalink
            parent.postMessage({ action: 'generatePermalink' }, '*');
          });
          }

          if (copyBtn && output) {
            copyBtn.addEventListener('click', function() {
              try { copyPermalinkToClipboard(null, copyBtn); } catch(e) {}
            });
          }


        // Import-related UI: input and Load button (Import-from-clipboard removed)
        const importInput = document.getElementById('import-permalink-input');
        const loadBtn = document.getElementById('load-permalink-btn');

        // Load button: apply value from input using parent postMessage (restore previous behavior)
        if (loadBtn && importInput) {
          loadBtn.addEventListener('click', function() {
            const val = importInput.value;
            try { uiLog('[UI] loadBtn clicked, val=', val); } catch(e) {}
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
                } catch(e) { params = null; }

                if (params) {
                    const payload = { action: 'applyPermalinkState' };
                    if (params.has('lat')) payload.lat = parseFloat(params.get('lat'));
                    if (params.has('lng')) payload.lng = parseFloat(params.get('lng'));
                    if (params.has('height')) payload.height = parseFloat(params.get('height'));
                    if (params.has('heading')) payload.heading = parseFloat(params.get('heading'));
                    if (params.has('pitch')) payload.pitch = parseFloat(params.get('pitch'));
                    if (params.has('layers')) payload.layers = params.get('layers');
                    
                    if (payload.lat !== undefined && !isNaN(payload.lat)) {
                      // Forward to parent/host to apply (restore previous behavior)
                      try { window.parent.postMessage(payload, '*'); } catch(e) { try { console.error('[UI] parent.postMessage failed', e); } catch(_){} }
                      const originalText = loadBtn.textContent;
                      loadBtn.textContent = t('loaded');
                      setTimeout(() => { loadBtn.textContent = originalText; }, 2000);
                    } else {
                      const originalText = loadBtn.textContent;
                      loadBtn.textContent = t('invalidData');
                      setTimeout(() => { loadBtn.textContent = originalText; }, 2000);
                    }
                } else {
                    const originalText = loadBtn.textContent;
                    loadBtn.textContent = t('parseError');
                    setTimeout(() => { loadBtn.textContent = originalText; }, 2000);
                }
            } catch(e) {
                try { console.error('Failed to parse permalink', e); } catch(_){}
                const originalText = loadBtn.textContent;
                loadBtn.textContent = t('error');
                setTimeout(() => { loadBtn.textContent = originalText; }, 2000);
            }
          });
        }
      
      // FlyTo from current URL via reearth.viewer.viewport.query
      const flytoViewportUrlBtn = document.getElementById('flyto-viewport-url-btn');
      if (flytoViewportUrlBtn) {
        flytoViewportUrlBtn.addEventListener('click', function() {
          try {
            const originalText = flytoViewportUrlBtn.textContent;
            flytoViewportUrlBtn.textContent = t('loading');
            parent.postMessage({ action: 'flyToViewportUrlParams' }, '*');
            setTimeout(() => { flytoViewportUrlBtn.textContent = originalText; }, 2000);
          } catch(e) {
            try { console.error('[UI] flyToViewportUrlParams post failed', e); } catch(_){}
          }
        });
      }
      
      // FlyTo from current geolocation
      const flytoCurrentLocationBtn = document.getElementById('flyto-current-location-btn');
      if (flytoCurrentLocationBtn) {
        flytoCurrentLocationBtn.addEventListener('click', function() {
          try {
            const originalText = flytoCurrentLocationBtn.textContent;
            flytoCurrentLocationBtn.textContent = t('getting');
            parent.postMessage({ action: 'requestGeolocation' }, '*');
            setTimeout(() => { flytoCurrentLocationBtn.textContent = originalText; }, 2000);
          } catch(e) {
            try { console.error('[UI] flyToCurrentLocation post failed', e); } catch(_){}
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
                      const ok = applyPermalinkPayload(payload, reloadBtn);
                      const originalText = reloadBtn.textContent;
                      reloadBtn.textContent = ok ? t('restored') : t('noLatLng');
                      setTimeout(() => { reloadBtn.textContent = originalText; }, 2000);
                    } else {
                      // alert('URL found but no valid lat/lng parameters.');
                      const originalText = reloadBtn.textContent;
                      reloadBtn.textContent = t('noLatLng');
                      setTimeout(() => { reloadBtn.textContent = originalText; }, 2000);
                  }
              } else {
                  // alert('Could not read URL parameters from browser address bar or referrer.');
                  const originalText = reloadBtn.textContent;
                  reloadBtn.textContent = t('noParams');
                  setTimeout(() => { reloadBtn.textContent = originalText; }, 2000);
              }
          });
      }

      // --- Search (Yahoo/GSI API) handlers ---
      try {
        const searchInput = document.getElementById('search-query');
        const searchBtn = document.getElementById('search-btn');
        const searchProvider = document.getElementById('search-provider');
        const searchYahooWarning = document.getElementById('search-yahoo-warning');
        const resultsList = document.getElementById('search-results-list');

        // Select provider based on Yahoo API availability
        try {
          if (searchProvider) {
            const rawId = String(window._yahooAppId || '').trim().replace(/^"+|"+$/g, '');
            const hasYahoo = rawId.length > 0 && !/^(YOUR_APP_ID|undefined|null)$/i.test(rawId) && !/あなた/.test(rawId);
            const yahooOpt = searchProvider.querySelector('option[value="yahoo"]');
            if (hasYahoo) {
              searchProvider.value = 'yahoo';
              if (yahooOpt) yahooOpt.disabled = false;
            } else {
              searchProvider.value = 'gsi';
              if (yahooOpt) yahooOpt.disabled = true;
            }
            if (searchYahooWarning) {
              searchYahooWarning.style.display = (searchProvider.value === 'yahoo') ? '' : 'none';
            }
            searchProvider.addEventListener('change', () => {
              if (searchYahooWarning) {
                searchYahooWarning.style.display = (searchProvider.value === 'yahoo') ? '' : 'none';
              }
            });
          }
        } catch (e) { console.error('search provider init failed', e); }

        const renderSearchResults = (items) => {
          if (!resultsList) return;
          resultsList.innerHTML = '';
          if (!items || !items.length) {
            const li = document.createElement('li');
            li.style.padding = '8px';
            li.style.color = '#666';
            li.textContent = t('noResults');
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
              flyBtn.textContent = t('fly');
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
          const provider = searchProvider ? String(searchProvider.value || 'gsi') : 'gsi';

          if (provider === 'gsi') {
            try {
              resultsList.innerHTML = '<li style="padding:8px;color:#666;">' + t('searching') + '</li>';
              const url = 'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q.trim());
              const res = await fetch(url, { method: 'GET' });
              if (!res.ok) throw new Error('HTTP ' + res.status);
              const data = await res.json();
              const source = Array.isArray(data) ? data : ((data && (data.features || data.Feature || data.results)) || []);
              const items = source.map(f => {
                const props = f.properties || f.Property || f.property || {};
                const title = f.name || f.Name || props.title || props.Title || props.name || props.Name || '';
                const address = props.address || props.Address || props.title || props.Title || '';
                const geom = f.geometry || f.Geometry || {};
                const coords = geom.coordinates || geom.Coordinates || null;
                const coordStr = Array.isArray(coords) ? coords.join(',') : (typeof coords === 'string' ? coords : '');
                return { name: title, address: address, geometry: f.geometry || f.Geometry, coordinates: coordStr };
              });
              renderSearchResults(items);
            } catch (e) {
              try { console.error('GSI search failed', e); } catch(_) {}
              if (resultsList) resultsList.innerHTML = '<li style="padding:8px;color:#900;">' + t('searchFailCors') + '</li>';
            }
            return;
          }

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

          const rawAppId = String((window && window._yahooAppId) ? window._yahooAppId : '').trim().replace(/^"+|"+$/g, '');
          const inspectorAppId = (rawAppId.length > 0 && !/^(YOUR_APP_ID|undefined|null)$/i.test(rawAppId) && !/あなた/.test(rawAppId)) ? rawAppId : null;
          if (!serverHasAppId && !inspectorAppId) {
            resultsList.innerHTML = '<li style="padding:8px;color:#a00;">' + t('appIdMissing') + '<div style="margin-top:6px;padding:6px;background:#fff;color:#111;border-radius:4px;font-family:monospace;display:inline-block;">' + t('appIdSample') + '</div></li>';
            return;
          }

          // Call server proxy using GET to avoid CORS preflight. If server has key, do not include appid in query.
          const proxyEndpoint = 'https://re-earth-geo-suite.vercel.app/api/yahoo-search';
          try {
            // expose query for debugging and notify parent that search started
            try { window._lastYahooQuery = q; if (window.parent) window.parent.postMessage({ action: 'yahooDebug', event: 'search-start', query: q }, '*'); } catch(e){}
            resultsList.innerHTML = '<li style="padding:8px;color:#666;">' + t('searching') + '</li>';
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
            if (resultsList) resultsList.innerHTML = '<li style="padding:8px;color:#900;">' + t('searchFailAppId') + '</li>';
          }
        };

        if (searchBtn && searchInput) {
          searchBtn.addEventListener('click', () => performSearch(String(searchInput.value || '')));
          searchInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); performSearch(String(searchInput.value || '')); } });
        }
      } catch (e) { console.error('search init failed', e); }

      // --- Vector feature search UI handlers ---
      try {
        const vectorLayer = document.getElementById('vector-layer');
        const vectorAttr = document.getElementById('vector-attr');
        const vectorValue = document.getElementById('vector-value');
        const vectorFlyBtn = document.getElementById('vector-fly-btn');
        const vectorRefreshBtn = document.getElementById('vector-refresh-btn');
        const vectorSearchText = document.getElementById('vector-search-text');
        const vectorTextSearchBtn = document.getElementById('vector-text-search-btn');
        const vectorSearchResults = document.getElementById('vector-search-results');
        const vectorStatus = document.getElementById('vector-search-status');

        function performVectorTextSearch() {
          try {
            if (!vectorSearchResults || !window._vectorSearchData) return;
            const q = (vectorSearchText && vectorSearchText.value) ? String(vectorSearchText.value).trim() : '';
            if (!q) { vectorSearchResults.innerHTML = ''; return; }
            const data = window._vectorSearchData;
            const res = [];
            const query = q.toLowerCase();
            const targetLayerId = (vectorLayer && vectorLayer.value) ? vectorLayer.value : '__all__';
            const targetAttr = (vectorAttr && vectorAttr.value) ? vectorAttr.value : '__all__';
            const layerIds = (targetLayerId === '__all__') ? ['__all__'] : [targetLayerId];
            layerIds.forEach((layerId) => {
              try {
                const source = (layerId === '__all__') ? data.all : (data.layers && data.layers[layerId]);
                if (!source) return;
                const attrList = (targetAttr === '__all__') ? (source.attributes || []) : [targetAttr];
                attrList.forEach((attr) => {
                  if (!attr || attr === '__all__') return;
                  const values = (source.valuesByAttr && Array.isArray(source.valuesByAttr[attr])) ? source.valuesByAttr[attr] : [];
                  values.forEach((val) => {
                    const haystack = (String(val) + ' ' + String(attr)).toLowerCase();
                    if (haystack.includes(query)) {
                      const layerTitle = (layerId === '__all__') ? t('allSelect') : ((data.layers && data.layers[layerId] && data.layers[layerId].title) || layerId);
                      res.push({ layerId: (layerId === '__all__') ? '__all__' : layerId, layerTitle: layerTitle, attr: attr, value: val });
                    }
                  });
                });
              } catch (e) {}
            });
            if (!res.length) {
              vectorSearchResults.innerHTML = '<li style="padding:4px;color:#666;">' + t('noMatch') + '</li>';
              return;
            }
            vectorSearchResults.innerHTML = res.slice(0, 50).map((r, i) => '<li class="vector-search-result" data-idx="' + i + '" style="padding:4px;border-bottom:1px solid #eee;cursor:pointer;">' + String(r.layerTitle).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + ' / ' + String(r.attr).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + ' / ' + String(r.value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</li>').join('');
            vectorSearchResults._resultData = res;
          } catch (e) { console.error('vector text search error', e); }
        }

        if (vectorSearchResults) {
          vectorSearchResults.addEventListener('click', (ev) => {
            try {
              const li = ev.target.closest && ev.target.closest('li[data-idx]');
              if (!li || !vectorSearchResults._resultData) return;
              const r = vectorSearchResults._resultData[Number(li.getAttribute('data-idx'))];
              if (!r) return;
              parent.postMessage({ action: 'vectorFeatureFly', layerId: r.layerId, attrName: r.attr, value: r.value }, '*');
            } catch (e) { console.error('vector result click error', e); }
          });
        }

        if (vectorTextSearchBtn) {
          vectorTextSearchBtn.addEventListener('click', performVectorTextSearch);
        }

        if (vectorSearchText) {
          vectorSearchText.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') performVectorTextSearch(); });
        }

        function getCurrentVectorSource() {
          try {
            if (!window._vectorSearchData) return null;
            const layerId = (vectorLayer && vectorLayer.value) ? vectorLayer.value : '__all__';
            if (layerId === '__all__') return window._vectorSearchData.all || null;
            return (window._vectorSearchData.layers && window._vectorSearchData.layers[layerId]) || null;
          } catch (e) { return null; }
        }

        if (vectorLayer) {
          vectorLayer.addEventListener('change', () => {
            try {
              const source = getCurrentVectorSource();
              if (vectorAttr) {
                if (source && source.attributes && source.attributes.length) {
                  vectorAttr.innerHTML = '<option value="__all__">' + t('allSelect') + '</option>' + source.attributes.map(a => '<option value="' + String(a).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '">' + String(a).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</option>').join('');
                  vectorAttr.disabled = false;
                } else {
                  vectorAttr.innerHTML = '<option value="__all__">' + t('allSelect') + '</option>';
                  vectorAttr.disabled = true;
                }
                vectorAttr.value = '__all__';
              }
              if (vectorValue) {
                vectorValue.innerHTML = '<option value="">' + t('selectValue') + '</option>';
                vectorValue.disabled = true;
              }
              if (vectorFlyBtn) vectorFlyBtn.disabled = true;
            } catch (e) { console.error('vector layer change error', e); }
          });
        }

        if (vectorAttr) {
          vectorAttr.addEventListener('change', () => {
            try {
              const source = getCurrentVectorSource();
              const attr = vectorAttr.value;
              if (vectorValue) {
                if (source && source.valuesByAttr && attr && attr !== '__all__' && Array.isArray(source.valuesByAttr[attr])) {
                  vectorValue.innerHTML = '<option value="">' + t('selectValue') + '</option>' + source.valuesByAttr[attr].map(v => '<option value="' + String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '">' + String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</option>').join('');
                  vectorValue.disabled = false;
                } else {
                  vectorValue.innerHTML = '<option value="">' + t('selectValue') + '</option>';
                  vectorValue.disabled = true;
                }
                vectorValue.value = '';
                if (vectorFlyBtn) vectorFlyBtn.disabled = true;
              }
            } catch (e) { console.error('vector attr change error', e); }
          });
        }

        if (vectorValue) {
          vectorValue.addEventListener('change', () => {
            if (vectorFlyBtn) vectorFlyBtn.disabled = !vectorValue.value;
          });
        }

        if (vectorFlyBtn) {
          vectorFlyBtn.addEventListener('click', () => {
            try {
              if (!vectorLayer || !vectorAttr || !vectorValue || !vectorAttr.value || !vectorValue.value) return;
              const layerId = (vectorLayer && vectorLayer.value) ? vectorLayer.value : '__all__';
              parent.postMessage({ action: 'vectorFeatureFly', layerId: layerId, attrName: vectorAttr.value, value: vectorValue.value }, '*');
            } catch (e) { console.error('vector fly error', e); }
          });
        }

        if (vectorRefreshBtn) {
          vectorRefreshBtn.addEventListener('click', () => {
            try {
              if (vectorStatus) vectorStatus.textContent = t('loading');
              parent.postMessage({ action: 'getVectorFeatureIndex' }, '*');
            } catch (e) { console.error('vector refresh error', e); }
          });
        }

        try {
          parent.postMessage({ action: 'getVectorFeatureIndex' }, '*');
        } catch (e) {}
      } catch (e) { console.error('vector search init failed', e); }

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

  // --- Vector attribute table widget ---
  (function initVectorAttrWidget() {
    try {
      const vectorAttrListBtn = document.getElementById('vector-attr-list-btn');
      const attrVectorAttrListBtn = document.getElementById('attr-vector-attr-list-btn');
      const vectorAttrWidget = document.getElementById('vector-attr-widget');
      const vectorAttrWidgetClose = document.querySelector('.vector-attr-widget-close');
      const vectorAttrWidgetSearch = document.getElementById('vector-attr-widget-search');
      const vectorAttrWidgetLayerSelect = document.getElementById('vector-attr-widget-layer');
      const vectorAttrWidgetHead = document.getElementById('vector-attr-widget-head');
      const vectorAttrWidgetList = document.getElementById('vector-attr-widget-list');
      const vectorAttrWidgetCount = document.getElementById('vector-attr-widget-count');
      const vectorAttrWidgetTitle = document.querySelector('.vector-attr-widget-title');
      let vectorAttrWidgetRows = [];
      let vectorAttrWidgetAttributes = [];
      let vectorAttrWidgetSort = { column: -1, order: 1 };

      function getCurrentVectorSource() {
        try {
          if (!window._vectorSearchData) return null;
          const layerId = (vectorAttrWidgetLayerSelect && vectorAttrWidgetLayerSelect.value) ? vectorAttrWidgetLayerSelect.value : '';
          if (!layerId || layerId === '__all__') return window._vectorSearchData.all || null;
          return (window._vectorSearchData.layers && window._vectorSearchData.layers[layerId]) || null;
        } catch (e) { return null; }
      }

      function buildVectorAttrWidgetRows() {
        vectorAttrWidgetRows = [];
        vectorAttrWidgetAttributes = [];
        vectorAttrWidgetSort = { column: -1, order: 1 };
        const source = getCurrentVectorSource();
        if (!source || !source.rows || !source.rows.length) return;
        vectorAttrWidgetAttributes = (source.attributes || []).slice();
        const maxRows = 1000;
        vectorAttrWidgetRows = source.rows.slice(0, maxRows);
      }

      function renderVectorAttrWidget(filter) {
        try {
          if (!vectorAttrWidgetList || !vectorAttrWidgetCount || !vectorAttrWidgetTitle) return;
          const query = String(filter || '').toLowerCase().trim();
          let matched = query ? vectorAttrWidgetRows.filter(function(row) { return row.values.some(function(val) { return String(val).toLowerCase().includes(query); }); }) : vectorAttrWidgetRows.slice();
          if (vectorAttrWidgetSort.column >= 0 && vectorAttrWidgetSort.column < vectorAttrWidgetAttributes.length) {
            const col = vectorAttrWidgetSort.column;
            const order = vectorAttrWidgetSort.order;
            matched.sort(function(a, b) {
              const left = a.values[col] || '';
              const right = b.values[col] || '';
              const cmp = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
              return cmp * order;
            });
          }
          const displayRows = matched.slice(0, 1000);
          const layerId = (vectorAttrWidgetLayerSelect && vectorAttrWidgetLayerSelect.value) ? vectorAttrWidgetLayerSelect.value : '';
          const layerTitle = (!layerId || layerId === '__all__') ? t('allSelect') : ((window._vectorSearchData && window._vectorSearchData.layers && window._vectorSearchData.layers[layerId] && window._vectorSearchData.layers[layerId].title) || layerId);
          vectorAttrWidgetTitle.textContent = t('attrValueList') + (layerTitle ? ' — ' + layerTitle : '');
          if (!vectorAttrWidgetAttributes.length) {
            if (vectorAttrWidgetHead) vectorAttrWidgetHead.innerHTML = '';
            vectorAttrWidgetList.innerHTML = '<tr><td style="padding:12px 14px;color:#71818d;">' + t('selectLayerPrompt') + '</td></tr>';
            vectorAttrWidgetCount.textContent = t('countFmt', { rows: 0, attrs: 0 });
            return;
          }
          if (vectorAttrWidgetHead) {
            vectorAttrWidgetHead.innerHTML = '<tr>' + vectorAttrWidgetAttributes.map(function(attr, idx) {
              const active = vectorAttrWidgetSort.column === idx;
              const marker = active ? (vectorAttrWidgetSort.order > 0 ? ' ▲' : ' ▼') : '';
              return '<th data-idx="' + idx + '" title="' + t('sortTitle') + '"' + (active ? ' class="sorted"' : '') + '>' + escapeHtml(attr) + '<span class="sort-marker">' + marker + '</span></th>';
            }).join('') + '</tr>';
          }
          if (!displayRows.length) {
            vectorAttrWidgetList.innerHTML = '<tr><td colspan="' + vectorAttrWidgetAttributes.length + '" style="padding:12px 14px;color:#71818d;">' + t('noMatchingFeatures') + '</td></tr>';
            vectorAttrWidgetCount.textContent = t('countFmt', { rows: (query ? 0 : vectorAttrWidgetRows.length), attrs: vectorAttrWidgetAttributes.length });
            return;
          }
          vectorAttrWidgetList.innerHTML = displayRows.map(function(row) {
            const flyable = Number.isFinite(row.lat) && Number.isFinite(row.lng);
            const dataAttrs = flyable ? 'data-lat="' + row.lat + '" data-lng="' + row.lng + '"' : '';
            const style = flyable ? 'style="cursor:pointer;"' : '';
            return '<tr class="vector-attr-widget-row" ' + dataAttrs + ' ' + style + ' title="' + (flyable ? t('clickToFly') : '') + '">' +
              row.values.map(function(val) { var displayVal = (typeof val === 'object' && val !== null) ? JSON.stringify(val) : String(val); var escapedVal = escapeHtml(displayVal); if (escapedVal.indexOf('http://') === 0 || escapedVal.indexOf('https://') === 0) { return '<td class="vector-attr-widget-cell" title="' + escapedVal + '"><a href="' + displayVal + '" target="_top" rel="noopener noreferrer" class="attr-url-link" style="color:#0066cc; text-decoration:underline; word-break:break-all;">' + escapedVal + '</a>&nbsp;<span class="attr-url-open" data-url="' + displayVal + '" title="' + t('openNewTab') + '" style="text-decoration:none; color:#666; font-size:1.1em; cursor:pointer;">&#x2197;</span></td>'; } return '<td class="vector-attr-widget-cell" title="' + escapedVal + '">' + escapedVal + '</td>'; }).join('') +
              '</tr>';
          }).join('');
          const suffix = (matched.length > displayRows.length) ? t('limitSuffix', { n: displayRows.length }) : '';
          vectorAttrWidgetCount.textContent = t('countFmt', { rows: matched.length, attrs: vectorAttrWidgetAttributes.length }) + suffix;
        } catch (e) { console.error('vector attr widget render error', e); }
      }

      function updateVectorAttrWidgetLayerOptions(layerId) {
        if (!vectorAttrWidgetLayerSelect) return;
        const opts = (window._vectorSearchData && window._vectorSearchData.layerOptions) || [];
        let html = '<option value="__all__">' + t('allSelect') + '</option>';
        for (const o of opts) {
          html += '<option value="' + escapeHtml(o.id) + '">' + escapeHtml(o.title || o.id) + '</option>';
        }
        vectorAttrWidgetLayerSelect.innerHTML = html;
        const hasLayer = layerId && layerId !== '__all__' && opts.some(function(o) { return o.id === layerId; });
        vectorAttrWidgetLayerSelect.value = hasLayer ? layerId : '__all__';
      }

      function applyAttrPanelSize(expanded, width, height) {
        try {
          expanded = !!expanded;
          // Guard stale expand responses: ignore if the user closed the widget
          // before the parent's sizing message arrived.
          if (expanded && window._attrPanelExpanded !== true) return;
          window._attrPanelExpanded = expanded;
          if (vectorAttrWidget) {
            if (expanded) vectorAttrWidget.classList.add('visible');
            else vectorAttrWidget.classList.remove('visible');
          }
          if (expanded) {
            if (typeof width === 'number' && width > 0) document.body.style.width = width + 'px';
            if (typeof height === 'number' && height > 0) {
              document.body.style.height = height + 'px';
              document.body.style.overflow = 'hidden';
            }
          } else {
            document.body.style.height = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
          }
        } catch (e) { console.error('applyAttrPanelSize error', e); }
      }

      function openVectorAttrWidget(layerId) {
        if (!vectorAttrWidget) return;
        const wasVisible = vectorAttrWidget.classList.contains('visible');
        updateVectorAttrWidgetLayerOptions(layerId || '__all__');
        buildVectorAttrWidgetRows();
        renderVectorAttrWidget(vectorAttrWidgetSearch ? vectorAttrWidgetSearch.value : '');
        vectorAttrWidget.classList.add('visible');
        if (vectorAttrWidgetSearch) vectorAttrWidgetSearch.focus();
        // Send expand only on the first open (layer-select changes re-run this
        // function while already open).
        if (!wasVisible) {
          window._attrPanelExpanded = true;
          try {
            if (window.parent) window.parent.postMessage({ action: 'setAttributePanelExpanded', expanded: true }, '*');
          } catch (e) {}
        }
      }

      function closeVectorAttrWidget() {
        const wasExpanded = window._attrPanelExpanded === true || (vectorAttrWidget && vectorAttrWidget.classList.contains('visible'));
        window._attrPanelExpanded = false;
        if (vectorAttrWidget) vectorAttrWidget.classList.remove('visible');
        if (!wasExpanded) return;
        try {
          // Include the currently active tab so the recreated iframe can restore it
          let activeTab = null;
          try {
            const activeBtn = document.querySelector('.tab-bar .tab.active');
            activeTab = activeBtn ? activeBtn.getAttribute('data-target') : null;
          } catch (e2) {}
          if (window.parent) window.parent.postMessage({ action: 'setAttributePanelExpanded', expanded: false, activeTab: activeTab }, '*');
        } catch (e) {}
        // Fallback: if the roundtrip is lost, clear the fixed body size anyway.
        try {
          setTimeout(function() {
            if (window._attrPanelExpanded !== true) {
              document.body.style.height = '';
              document.body.style.width = '';
              document.body.style.overflow = '';
            }
          }, 1000);
        } catch (e) {}
      }

      if (vectorAttrListBtn) vectorAttrListBtn.addEventListener('click', function() { openVectorAttrWidget((window._vectorLayerValue && window._vectorLayerValue !== '__all__') ? window._vectorLayerValue : null); });
      if (attrVectorAttrListBtn) attrVectorAttrListBtn.addEventListener('click', function() { openVectorAttrWidget(window._attrLayerValue || null); });
      if (vectorAttrWidgetClose) vectorAttrWidgetClose.addEventListener('click', closeVectorAttrWidget);
      if (vectorAttrWidgetSearch) {
        vectorAttrWidgetSearch.addEventListener('input', function() { renderVectorAttrWidget(vectorAttrWidgetSearch.value); });
        vectorAttrWidgetSearch.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') renderVectorAttrWidget(vectorAttrWidgetSearch.value); });
      }
      if (vectorAttrWidgetLayerSelect) {
        vectorAttrWidgetLayerSelect.addEventListener('change', function() {
          try { vectorAttrWidgetSort = { column: -1, order: 1 }; openVectorAttrWidget(vectorAttrWidgetLayerSelect.value); } catch (e) { console.error('vector attr layer change error', e); }
        });
      }
      if (vectorAttrWidgetList) {
        vectorAttrWidgetList.addEventListener('click', function(ev) {
          try {
            const urlA = ev.target.closest('a.attr-url-link');
            if (urlA) { try { ev.preventDefault(); ev.stopPropagation(); if (window.openUrlInAttrPanel) window.openUrlInAttrPanel(ev, urlA.getAttribute('href')); } catch(e2) {} return; }
            const openSpan = ev.target.closest('span.attr-url-open');
            if (openSpan) { try { ev.stopPropagation(); if (window.parent) window.parent.postMessage({ action: 'openUrl', url: openSpan.getAttribute('data-url') }, '*'); } catch(e2) {} return; }
            const tr = ev.target.closest('tr');
            if (!tr) return;
            const lat = Number(tr.getAttribute('data-lat'));
            const lng = Number(tr.getAttribute('data-lng'));
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              if (window.parent) window.parent.postMessage({ action: 'flyToLatLng', lat: lat, lng: lng }, '*');
            }
          } catch (e) { console.error('vector attr row click error', e); }
        });
      }
      if (vectorAttrWidgetHead) {
        vectorAttrWidgetHead.addEventListener('click', function(ev) {
          try {
            const th = ev.target.closest('th');
            if (!th || !th.hasAttribute('data-idx')) return;
            const idx = Number(th.getAttribute('data-idx'));
            if (vectorAttrWidgetSort.column === idx) {
              vectorAttrWidgetSort.order *= -1;
            } else {
              vectorAttrWidgetSort = { column: idx, order: 1 };
            }
            renderVectorAttrWidget(vectorAttrWidgetSearch ? vectorAttrWidgetSearch.value : '');
          } catch (e) { console.error('vector attr head click error', e); }
        });
      }
      // Track selected vector search layer to open table with same layer
      const vectorLayer = document.getElementById('vector-layer');
      if (vectorLayer) {
        vectorLayer.addEventListener('change', function() { window._vectorLayerValue = vectorLayer.value; });
        window._vectorLayerValue = vectorLayer.value;
      }

      // Expose open/close and the size helper on window for other UI handlers
      window.openVectorAttrWidget = openVectorAttrWidget;
      window.closeVectorAttrWidget = closeVectorAttrWidget;
      window.applyAttrPanelSize = applyAttrPanelSize;
    } catch (e) { console.error('init vector attr widget error', e); }
  })();

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
// NOTE: inspector property/text processing happens once later in the file
// (tryInitFromProperty() and the processInspectorText init block), which
// re-renders the UI via safeShowUI when layers are applied.
// Panel widths (px). The layers panel width is always fixed at 300px;
// the attribute table expands it to exactly double. Absolute values keep
// the width deterministic (no auto width, no compounding percentages).
const ATTR_PANEL_BASE_WIDTH = 300;
const ATTR_PANEL_EXPANDED_WIDTH = ATTR_PANEL_BASE_WIDTH * 2;
// Extension-side single source of truth for the expanded (600px) state
let _attrPanelExpanded = false;
// Tab to re-activate after the UI iframe is recreated on widget close
let _pendingActiveTab = null;

// Single source of truth for the attribute panel width / mouse-hit-area state.
// expanded: true  -> width 600px and fix body size in the UI iframe.
// expanded: false -> width 300px and recreate the iframe so the mouse hit area shrinks reliably.
function setAttributePanelExpanded(expanded, activeTab = null) {
  try {
    _attrPanelExpanded = !!expanded;
    if (expanded) {
      // Expand to 600px. Height is fixed to 1/3 of the parent viewport and sent
      // to the UI so the iframe's content-based auto-resize matches it exactly.
      let vpHeight = 0;
      try { vpHeight = (reearth.viewer && reearth.viewer.viewport && reearth.viewer.viewport.height) || 0; } catch (e) {}
      if (!vpHeight) { try { vpHeight = (reearth.viewport && reearth.viewport.height) || 0; } catch (e) {} }
      const panelHeight = Math.round(vpHeight / 3);
      if (panelHeight > 0) {
        postToUI({ action: 'setAttrPanelSize', expanded: true, width: ATTR_PANEL_EXPANDED_WIDTH, height: panelHeight });
      }
      if (reearth && reearth.ui && typeof reearth.ui.resize === 'function') {
        reearth.ui.resize(ATTR_PANEL_EXPANDED_WIDTH, undefined, false);
      }
    } else {
      // Restore to base 300px. Re:Earth's resize() grows the iframe to 600px
      // but does not reliably shrink it back to 300px, leaving a 600px-wide
      // transparent mouse hit area. Recreate the iframe to guarantee the hit
      // area matches the base 300px width.
      _pendingActiveTab = (typeof activeTab === 'string' && activeTab) ? activeTab : null;
      safeShowUI('setAttributePanelExpanded:false');
    }
  } catch (e) { try { sendError('[setAttributePanelExpanded] error:', e); } catch(_) {} }
}

const uiHTML = getUI();
try { sendLog('[render] UI HTML length:', uiHTML ? uiHTML.length : 0, 'preview:', uiHTML ? uiHTML.substring(0, 200) : 'null'); } catch(e){}
reearth.ui.show(uiHTML, { extended: true }); // added { extended: true } to prevent sandbox issues
// Fix the panel width via resize (the ui.show width option is ignored for
// extended widgets); height is left undefined so it stays auto-resized.
try { reearth.ui.resize(ATTR_PANEL_BASE_WIDTH, undefined, false); } catch (e) { try { sendError('[render] initial resize failed', e); } catch(_){} }
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
  if (!DEBUG_LOG) return;
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

// Apply a permalink state (camera flyTo + layer visibility) from a normalized object
function applyPermalinkFromObject(state) {
  try {
    if (state.lat != null && state.lng != null) {
      try {
        reearth.camera.flyTo({
          lat: state.lat,
          lng: state.lng,
          height: state.height || 1000,
          heading: (state.heading || 0) * Math.PI / 180,
          pitch: (state.pitch || -30) * Math.PI / 180,
          roll: 0,
        }, { duration: 0.1 });
      } catch(e) { try { sendError('[applyPermalinkFromObject] camera flyTo failed', e); } catch(err){} }
    }

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
            try { sendLog('[applyPermalinkFromObject] layers not ready, retry', attempt); } catch(e){}
            setTimeout(() => applyLayersWithRetry(layersStr, attempt + 1), delayMs);
            return;
          } else {
            try { sendError('[applyPermalinkFromObject] layers unavailable after retries'); } catch(e){}
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

        try { sendLog('[applyPermalinkFromObject] applied layers', { requested: ids.length, found: found, changed: applied }); } catch(e){}
        try { reearth.ui.postMessage({ action: 'permalinkApplied', success: true, requested: ids.length, found: found, changed: applied }); } catch(e){}
      } catch(e) {
        if (attempt <= 8) setTimeout(() => applyLayersWithRetry(layersStr, attempt + 1), 800);
        else try { sendError('[applyPermalinkFromObject] unexpected error applying layers', e); } catch(err){}
      }
    };

    if (state.layers) applyLayersWithRetry(state.layers);
  } catch(e) {
    try { sendError('[applyPermalinkFromObject] error:', e); } catch(err){}
  }
}

// Wrapper for reearth.ui.show(getUI()) that logs caller stack for debugging
function safeShowUI(context) {
  try {
    try { sendLog('[safeShowUI] context:', context); } catch(e){}
    // capture stack to help identify call sites at runtime
    try { sendLog('[safeShowUI] stack:', (new Error()).stack); } catch(e){}
    if (reearth && reearth.ui && typeof reearth.ui.show === 'function') {
      try { reearth.ui.show(getUI(), { extended: true }); } catch(e) { try { sendError('[safeShowUI] show failed', e); } catch(_){} }
      // Re-render resets the iframe to the base state, so drop any expanded flag.
      _attrPanelExpanded = false;
      // Re-apply the fixed panel width after re-render (show resets the iframe).
      try { if (typeof reearth.ui.resize === 'function') reearth.ui.resize(ATTR_PANEL_BASE_WIDTH, undefined, false); } catch(e) { try { sendError('[safeShowUI] resize failed', e); } catch(_){} }
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
  let success = false;
  try {
    // Ensure the layer actually exists in the runtime before attempting to change visibility.
    // reearth.layers.add can return before the layer is fully registered, so callers may need to retry.
    const target = (reearth.layers.findById && typeof reearth.layers.findById === 'function') ? reearth.layers.findById(layerId) : null;
    const exists = !!target || ((reearth.layers && reearth.layers.layers) || []).some(l => l && l.id === layerId);
    if (!exists) return false;

    // Prefer override API to avoid potential show() side-effects (like moving layer to top).
    if (reearth.layers && typeof reearth.layers.override === 'function') {
      try {
        const is3dTiles = target && target.data && target.data.type === '3dtiles';
        const props = { visible: !!visible };
        if (is3dTiles) props["3dtiles"] = { show: !!visible };
        reearth.layers.override(layerId, props);
        try { sendLog('[setLayerVisibility] used layers.override', layerId, visible, is3dTiles ? '(3dtiles)' : ''); } catch(_){ }
        success = true;
      } catch (e) {
        try { sendError('[setLayerVisibility] layers.override threw', e); } catch(_){ }
      }
    }
    // Fallback: use show/hide if override is not available
    if (!success && reearth.layers && typeof reearth.layers.show === 'function' && typeof reearth.layers.hide === 'function') {
      if (visible) reearth.layers.show(layerId); else reearth.layers.hide(layerId);
      try { sendLog('[setLayerVisibility] used layers.show/hide', layerId, visible); } catch(_){ }
      success = true;
    }
  } catch (e) {
    try { sendError('[setLayerVisibility] unexpected error', e); } catch(_){ }
  }
  try { if (renderUI) safeShowUI('setLayerVisibility'); } catch(_){ }
  return success;
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
        // Fallback: try hide if delete is not available
        try {
          if (reearth && reearth.layers && typeof reearth.layers.hide === 'function') {
            try { reearth.layers.hide(layerId); } catch (e) { try { sendError('[removeTargetMarker] hide threw', e); } catch(_){} }
            try { sendLog('[removeTargetMarker] fallback hide called for', layerId); } catch(_){}
          }
        } catch (e) { try { sendError('[removeTargetMarker] fallback hide error', e); } catch(_){} }

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
// QuickJS runtime has no setTimeout: delegate waits to the UI iframe.
// The UI runs setTimeout and replies with { action: 'timerDone', id } which
// resolves the pending promise (see 'timerDone' in the extension message handler).
let _waitSeq = 0;
const _pendingWaits = Object.create(null);
function waitViaUiTimer(ms) {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'function') { setTimeout(resolve, ms); return; }
    const id = 'wait-' + (++_waitSeq) + '-' + Date.now();
    _pendingWaits[id] = resolve;
    try {
      postToUI({ action: 'startTimer', id: id, ms: ms });
    } catch (e) {
      delete _pendingWaits[id];
      resolve();
    }
  });
}

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
      await waitViaUiTimer(waitMs);
      try { sendLog('[flyToAndNotify] wait complete'); } catch(e){}
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

try {
  reearth.layers.on("select", (layerId, featureId) => {
    try {
      try {
        const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
        const text = (prop.settings && prop.settings.inspectorText) || prop.inspectorText;
        if (text && typeof text === 'string') {
          _inspectorAttrUrlOpen = parseAttrUrlOpen(text);
        }
        sendLog('[main select] _inspectorAttrUrlOpen:', _inspectorAttrUrlOpen, 'prop text:', text ? text.substring(0, 200) : null);
      } catch(e) {}
      if (layerId && featureId) {
        const feature = reearth.layers.findFeatureById(layerId, featureId);
        const props = feature && feature.properties ? feature.properties : null;
        postToUI({ action: 'featureSelected', layerId, featureId, properties: props || {}, attrUrlOpen: _inspectorAttrUrlOpen });
      } else {
        postToUI({ action: 'featureSelected', layerId: null, featureId: null, properties: null, attrUrlOpen: _inspectorAttrUrlOpen });
      }
    } catch(e) {
      try { sendError("[on select] Error:", e); } catch(_){}
    }
  });
} catch(e) {
  try { sendError("Failed to register layer select event", e); } catch(_){}
}

reearth.extension.on("message", (msg) => {
  try { sendLog("[extension.message] received:", msg); } catch(e){}
  // Handle action-based messages from the UI (terrain toggle)
  if (msg && msg.action) {
    // Resolve pending waits delegated to the UI timer (see waitViaUiTimer)
    if (msg.action === "timerDone" && msg.id) {
      const resolveWait = _pendingWaits[msg.id];
      if (resolveWait) {
        delete _pendingWaits[msg.id];
        try { resolveWait(); } catch(e) {}
      }
      return;
    }
    if (msg.action === "activateTerrain") {
      const bg = _lastInspectorBackground || "#ffffff";
      // Re:Earth Visualizer最新版では terrain.type を明示的に指定する必要がある
      // type: "reearth_terrain" → Cesium IONトークン不要で動作するビルトインテレイン
      // type: "cesium"         → Cesium World Terrain（Re:EarthシーンへのCesium IONトークン設定が必要）
      reearth.viewer.overrideProperty({
        terrain: { enabled: true, type: "reearth_terrain" },
        globe: { depthTestAgainstTerrain: true, baseColor: bg },
        scene: { backgroundColor: bg },
      });
    } else if (msg.action === "deactivateTerrain") {
      const bg = _lastInspectorBackground || "#ffffff";
      reearth.viewer.overrideProperty({
        terrain: { enabled: false, type: "reearth_terrain" },
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
    } else if (msg.action === "setGeojsonClassification") {
      const next = normalizeClassification(msg.classification) || 'terrain';
      _geojsonClassification = next;
      try { sendLog('[setGeojsonClassification] updated:', next); } catch(e){}
      applyGeojsonDrapeToAll();
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
      (async () => {
        try {
          await performGeolocationAndNotify();
        } catch (e) {
          try { sendError('[requestGeolocation] performGeolocationAndNotify failed', e); } catch(_) {}
        }
      })();
    } else if (msg.action === "flyMoveMarkAndNotify") {
      (async () => {
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
      })();

    } else if (msg.action === "removeLayer") {
      if (msg.layerId) {
        try {
          try { sendLog('[removeLayer] requested for', msg.layerId); } catch(e) {}
          removeTargetMarker(msg.layerId);
        } catch(e) { try { sendError('[removeLayer] failed to delete layer:', e); } catch(err) {} }
      }
    } else if (msg.action === "openUrl") {
      try {
        if (msg.url && reearth && reearth.viewer && typeof reearth.viewer.open === "function") {
          reearth.viewer.open(msg.url);
        } else if (msg.url) {
          // fallback fallback
          try { sendLog('[openUrl] reearth.viewer.open is not available, falling back'); } catch(e) {}
        }
      } catch (e) {
        try { sendError('[openUrl] failed', e); } catch(_) {}
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
          (async () => { try { await flyToAndNotify(cam.lat, cam.lng, { height: cam.height, heading: cam.heading, pitch: cam.pitch, duration: 2, addMarker: false }); } catch(e) { try { sendError('[flyToAndNotify] flyToCamera failed', e); } catch(_){} } })();
        }
      } catch(e) {
        try { sendError('[flyToAndNotify] flyToCamera outer error:', e); } catch(err){}
      }
    } else if (msg.action === "flyToManual") {
      (async () => {
        try {
          await flyToAndNotify(msg.lat, msg.lng, { 
            height: msg.height, 
            heading: msg.heading, 
            pitch: msg.pitch, 
            duration: 2, 
            addMarker: false 
          });
        } catch(e) { try { sendError('[flyToAndNotify] flyToManual failed', e); } catch(_){} }
      })();
    } else if (msg.action === "generatePermalink") {
        try {
            // 1. Get Camera
            let cur = null;
            try { cur = (reearth.camera && typeof reearth.camera.position === 'object' && reearth.camera.position) ? reearth.camera.position : null; } catch(e){}
            if (!cur) try { cur = (reearth.camera && typeof reearth.camera.getCamera === 'function') ? reearth.camera.getCamera() : null; } catch(e){}
            if (!cur) try { cur = (reearth.viewer && typeof reearth.viewer.getCamera === 'function') ? reearth.viewer.getCamera() : null; } catch(e){}
            if (!cur) try { cur = (reearth.view && reearth.view.camera) ? reearth.view.camera : null; } catch(e){}
            if (!cur) try { cur = reearth.camera || null; } catch(e){}
            
            const payload = {
                action: 'permalinkGenerated'
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
          applyPermalinkFromObject(msg);
        } catch(e) {
          try { sendError('[applyPermalinkState] error:', e); } catch(err){}
        }
      } else if (msg.action === "flyToViewportUrlParams") {
        try {
          let query = null;
          try { query = (reearth.viewer && reearth.viewer.viewport && reearth.viewer.viewport.query) ? reearth.viewer.viewport.query : null; } catch(e){}
          if (!query) try { query = (reearth.viewport && reearth.viewport.query) ? reearth.viewport.query : null; } catch(e){}

          // Merge UI-provided query (for # hash params, etc.) with official viewport query
          const uiQuery = (msg && typeof msg.query === 'object' && msg.query !== null) ? msg.query : null;
          query = Object.assign({}, uiQuery || {}, query || {});

          if (Object.keys(query).length > 0) {
            const state = {};
            if (query.lat != null) state.lat = parseFloat(query.lat);
            if (query.lng != null) state.lng = parseFloat(query.lng);
            if (query.height != null) state.height = parseFloat(query.height);
            if (query.heading != null) state.heading = parseFloat(query.heading);
            if (query.pitch != null) state.pitch = parseFloat(query.pitch);
            if (query.layers != null) state.layers = query.layers;

            if (typeof state.lat === 'number' && !isNaN(state.lat) && typeof state.lng === 'number' && !isNaN(state.lng)) {
              applyPermalinkFromObject(state);
              try { sendLog('[flyToViewportUrlParams] applied from merged query:', query); } catch(e){}
            } else {
              try { sendError('[flyToViewportUrlParams] invalid lat/lng in query:', query); } catch(e){}
            }
          } else {
            try { sendError('[flyToViewportUrlParams] viewport query unavailable'); } catch(e){}
          }
        } catch(e) {
          try { sendError('[flyToViewportUrlParams] error:', e); } catch(err){}
        }
      } else if (msg.action === 'getVectorFeatureIndex') {
        try {
          buildVectorFeatureIndexFromLayers();
        } catch (e) { try { sendError('[getVectorFeatureIndex] error:', e); } catch(_) {} }
      } else if (msg.action === 'vectorFeatureData') {
        try {
          buildVectorFeatureIndexFromData(msg.layers || {});
        } catch (e) { try { sendError('[vectorFeatureData] error:', e); } catch(_) {} }
      } else if (msg.action === 'vectorFeatureFly') {
        try {
          flyToVectorFeature(msg.layerId, msg.attrName, msg.value);
        } catch (e) { try { sendError('[vectorFeatureFly] error:', e); } catch(_) {} }
      } else if (msg.action === 'flyToLatLng') {
        try {
          if (typeof msg.lat === 'number' && typeof msg.lng === 'number') {
            flyToAndNotify(msg.lat, msg.lng, { addMarker: false });
          }
        } catch (e) { try { sendError('[flyToLatLng] error:', e); } catch(_) {} }
      } else if (msg.action === 'setAttributePanelExpanded') {
        try {
          setAttributePanelExpanded(msg.expanded, msg.activeTab);
        } catch (e) { try { sendError('[setAttributePanelExpanded] handler error:', e); } catch(_) {} }
      } else if (msg.action === 'requestRestoreState') {
        try {
          // The recreated UI asks for state to restore on load (active tab)
          if (_pendingActiveTab) {
            postToUI({ action: 'activateTab', tab: _pendingActiveTab });
            _pendingActiveTab = null;
          }
        } catch (e) { try { sendError('[requestRestoreState] error:', e); } catch(_) {} }
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
        // Called from UI: suppress full UI re-render to avoid re-initialization side-effects.
        // The layer may not be registered immediately after reearth.layers.add, so retry briefly.
        const trySetHide = (attempt) => {
          if (attempt > 12) return;
          if (setLayerVisibility(msg.layerId, false, false)) {
            _userLayerVisibility.set(msg.layerId, false);
          } else if (typeof setTimeout === 'function') {
            setTimeout(() => trySetHide(attempt + 1), 300);
          }
        };
        trySetHide(1);
      } catch (e) {
        try { sendError('[hide] error setting visibility', msg.layerId, e); } catch(_){ }
      }
      break;
    case "show":
      try {
        // Called from UI: suppress full UI re-render to avoid re-initialization side-effects.
        // Retry in case the layer has not been registered yet.
        const trySetShow = (attempt) => {
          if (attempt > 12) return;
          if (setLayerVisibility(msg.layerId, true, false)) {
            _userLayerVisibility.set(msg.layerId, true);
          } else if (typeof setTimeout === 'function') {
            setTimeout(() => trySetShow(attempt + 1), 300);
          }
        };
        trySetShow(1);
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

try {
  if (reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('extensionMessage', (msg) => {
      try {
        const data = (msg && msg.data !== undefined) ? msg.data : msg;
        if (data && data.action === 'requestBaseList') {
          const targetId = msg.sender || null;
          if (targetId && reearth.extension && typeof reearth.extension.postMessage === 'function') {
            // Share the current UI language override with the basemap widget
            try { reearth.extension.postMessage(targetId, { action: 'lang', lang: _inspectorLang || 'auto' }); } catch (e) {}
            // If _parsedBaseTiles is empty, re-parse only base: lines from the inspector text
            // before responding so the basemap selector can recover from load order races.
            let baseEntries = _parsedBaseTiles || [];
            if (!baseEntries.length) {
              try {
                const fresh = extractBaseTilesFromText(getInspectorTextForBaseParse());
                if (fresh && fresh.length) {
                  _parsedBaseTiles = fresh;
                  baseEntries = fresh;
                }
              } catch (e) { sendError('[requestBaseList] re-parse failed:', e); }
            }
            if (baseEntries && baseEntries.length) {
              reearth.extension.postMessage(targetId, { action: 'baseList', items: baseEntries });
            }
          }
        }
      } catch (e) {}
    });
  }
} catch (e) {}

// Known maximum zoom levels for well-known tile providers.
// Without maximumLevel, Cesium keeps requesting tiles beyond the provider's
// max zoom and floods the console with "Failed to obtain image tile" errors.
function defaultMaxLevelForUrl(url) {
  try {
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\/(gazo[1-4]|ort_old10|ort_riku10)\//.test(url)) return 17;
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\//.test(url)) return 18;
    if (/tile\.openstreetmap\.org\//.test(url)) return 19;
  } catch (e) {}
  return null;
}

function normalizeClassification(value) {
  if (!value || typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === '3dtiles' || v === '3d' || v === '3d-tiles' || v === '3d_tiles') return '3dtiles';
  if (v === 'both') return 'both';
  if (v === 'terrain' || v === 'ground' || v === 'off' || v === 'false') return 'terrain';
  return null;
}

function addXyzLayer(url, title, layerType, isBase = false, visible = true, zoom = null, attribution = null, classification = null) {
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
    // Limit tile request levels via the raster appearance so Cesium stops
    // requesting tiles beyond the provider's max zoom (avoids
    // "Failed to obtain image tile" console errors at high zoom levels).
    const raster = {};
    const minL = (zoom && typeof zoom.min === 'number' && !isNaN(zoom.min)) ? zoom.min : null;
    let maxL = (zoom && typeof zoom.max === 'number' && !isNaN(zoom.max)) ? zoom.max : null;
    if (maxL === null) maxL = defaultMaxLevelForUrl(encodedUrl);
    if (minL !== null) raster.minimumLevel = minL;
    if (maxL !== null) raster.maximumLevel = maxL;
    if (minL !== null || maxL !== null) {
      layer.raster = raster;
      try { sendLog('[addXyzLayer] raster levels min:', minL, 'max:', maxL); } catch(e){}
    }
  }

  // Mark as basemap when requested
  if (isBase) {
    try { sendLog('[addXyzLayer] marking as basemap'); } catch(e){}
    if (!layer.data) layer.data = { type: type, url: encodedUrl };
    layer.data.isBasemap = true;
    if (attribution) layer.data.attribution = attribution;
    if (layer.tiles) layer.tiles.isBasemap = true;
  }

  // Add default styles for GeoJSON to ensure visibility
  // classificationType: "terrain" prevents GeoJSON from draping onto 3D Tiles;
  // it clamps only to terrain / ellipsoid.
  if (type === 'geojson') {
    const geoClass = normalizeClassification(classification) || _geojsonClassification;
    layer.marker = { pointColor: "#3388ff", pointSize: 10 };
    layer.polyline = { strokeColor: "#3388ff", strokeWidth: 2, clampToGround: true, classificationType: geoClass };
    layer.polygon = { fillColor: "#3388ff44", strokeColor: "#3388ff", strokeWidth: 2, heightReference: "clamp", classificationType: geoClass };
  }

  try {
    sendLog("[addXyzLayer] received url:", url);
    sendLog("[addXyzLayer] encoded url:", encodedUrl);
    sendLog("[addXyzLayer] layer object:", layer);
    const newId = reearth.layers.add(layer);
    // Track this layer as plugin-added
    if (newId) {
      _pluginAddedLayerIds.add(newId);
      if (type === 'geojson' && _pluginAddedGeojsonLayerIds.indexOf(newId) === -1) {
        _pluginAddedGeojsonLayerIds.push(newId);
      }
      
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
const _defaultInspectorText = `              attrUrlOpen: newtab
              layer:Googleフォトリアリスティック3Dタイル|off
              3dtiles: 東京都/千代田区（建築物LOD1） | https://assets.cms.plateau.reearth.io/assets/0e/e5948a-e95c-4e31-be85-1f8c066ed996/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod1/tileset.json|off
              geojson: 東京都/行政区域 | https://assets.cms.reearth.io/assets/ef/b1d062-e44b-4a19-8ebe-5fafeeba05f2/%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%9F%9F.geojson
              3dtiles: 東京都//千代田区（建築物LOD1） | https://assets.cms.plateau.reearth.io/assets/0e/e5948a-e95c-4e31-be85-1f8c066ed996/13101_chiyoda-ku_pref_2023_citygml_1_op_bldg_3dtiles_13101_chiyoda-ku_lod1/tileset.json
              geojson: 東京都//行政区域 | https://assets.cms.reearth.io/assets/ef/b1d062-e44b-4a19-8ebe-5fafeeba05f2/%E8%A1%8C%E6%94%BF%E5%8C%BA%E5%9F%9F.geojson
              background: #ffffff
              info: https://re-earth-geo-suite.vercel.app/ryu.html
              cam:東京駅|35.653108|139.761449|h=2200.6|p=-30|d=348.5
              cam:富士山|35.188733|138.610404|h=9807.7|p=-24.72|d=28.56
              cam:大阪城|34.683329|135.525766|h=311.2|d=356.57|p=-32.92
              legend:https://assets.cms.reearth.io/assets/22/43aa2e-d72b-4313-9c9c-816bb038c676/2025SNS%E6%8B%A1%E5%A4%A7.JPG
              legend:凡例|https://assets.cms.reearth.io/assets/22/43aa2e-d72b-4313-9c9c-816bb038c676/2025SNS%E6%8B%A1%E5%A4%A7.JPG
              base: OpenStreetMap | https://tile.openstreetmap.org/{z}/{x}/{y}.png | <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
              base: 地理院タイル 標準地図 | https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png | 出典：国土地理院
              base: 地理院タイル 淡色地図 | https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png| 出典：国土地理院
              base: 地理院タイル 全国最新写真 | https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg| 出典：国土地理院
              base: 地理院タイル 1987～1990年 | https://cyberjapandata.gsi.go.jp/xyz/gazo4/{z}/{x}/{y}.jpg| 出典：国土地理院
              base: 地理院タイル 1984～1986年 | https://cyberjapandata.gsi.go.jp/xyz/gazo3/{z}/{x}/{y}.jpg| 出典：国土地理院
              base: 地理院タイル 1979～1983年 | https://cyberjapandata.gsi.go.jp/xyz/gazo2/{z}/{x}/{y}.jpg| 出典：国土地理院
              base: 地理院タイル 1974～1978年 | https://cyberjapandata.gsi.go.jp/xyz/gazo1/{z}/{x}/{y}.jpg| 出典：国土地理院
              yahooAppId: あなたのYahoo Local Search API AppID`;

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

function findBasemapWidgetId() {
  try {
    const list = (reearth && reearth.extension && reearth.extension.list) || [];
    const target = list.find((ex) => ex && ex.extensionId === 'basemap-widget');
    return target ? target.id : null;
  } catch (e) { return null; }
}

let _basemapWidgetId = null;

// Forward the inspector "lang:" override to the basemap widget so its UI
// strings follow the same language as the layer panel.
function postLangToBasemapWidget() {
  try {
    const targetId = _basemapWidgetId || findBasemapWidgetId();
    if (!targetId) return;
    _basemapWidgetId = targetId;
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, { action: 'lang', lang: _inspectorLang || 'auto' });
    }
  } catch (e) {}
}

function postBaseListToBasemapWidget(baseEntries) {
  if (!baseEntries || !baseEntries.length) return;
  try {
    _basemapWidgetId = findBasemapWidgetId();
    if (!_basemapWidgetId) return;
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(_basemapWidgetId, { action: 'baseList', items: baseEntries });
    }
  } catch (e) {}
}

// Parse only base: lines from text, without side effects, for dynamic re-requests.
function extractBaseTilesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const baseEntries = [];
  try {
    const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
    lines.forEach(line => {
      const lowerLine = line.toLowerCase();
      if (!lowerLine.startsWith('base:')) return;
      const tileStr = line.substring(5).trim();
      let url = null;
      let title = null;
      let attribution = null;
      let visible = true;
      let zoom = { min: null, max: null };
      if (tileStr.indexOf('|') !== -1) {
        const parts = tileStr.split('|').map(p => p.trim());
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i].toLowerCase();
          if (p === 'off') { visible = false; parts.splice(i, 1); i--; }
          else if (p === 'on') { visible = true; parts.splice(i, 1); i--; }
        }
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          let m = p.match(/^(min|max)(?:level)?\s*=\s*(\d{1,2})$/i);
          if (m) {
            if (m[1].toLowerCase() === 'min') zoom.min = parseInt(m[2], 10);
            else zoom.max = parseInt(m[2], 10);
            parts.splice(i, 1); i--;
            continue;
          }
          m = p.match(/^z(?:oom)?\s*=\s*(?:(\d{1,2})\s*-\s*)?(\d{1,2})$/i);
          if (m) {
            if (m[1] !== undefined) zoom.min = parseInt(m[1], 10);
            zoom.max = parseInt(m[2], 10);
            parts.splice(i, 1); i--;
          }
        }
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
        baseEntries.push({ url, title, attribution, visible, minLevel: zoom.min, maxLevel: zoom.max });
      }
    });
  } catch (e) { sendError('[extractBaseTilesFromText] error:', e); }
  return baseEntries;
}

function getInspectorTextForBaseParse() {
  try {
    const prop = (reearth && reearth.extension && reearth.extension.widget && reearth.extension.widget.property) || (reearth && reearth.extension && reearth.extension.block && reearth.extension.block.property) || {};
    const text = (prop.settings && prop.settings.inspectorText) || prop.inspectorText;
    return (typeof text === 'string') ? text : _defaultInspectorText;
  } catch (e) { return _defaultInspectorText; }
}

// Parse and apply settings from text
function processInspectorText(text) {
  if (!text || typeof text !== 'string') {
    sendLog('[processInspectorText] no text or invalid type:', text);
    return;
  }
  // reset parsed base tiles to avoid duplicates when called repeatedly
  sendLog('[processInspectorText] called, text:', text.substring(0, 300));
  try { _parsedBaseTiles = []; } catch(e) {}
  // Handle various newline formats
  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
  // reset inspector-sourced yahooAppId each time we parse inspector text
  try { _inspectorYahooAppId = null; } catch(e) {}
  _systemLayerSettings = [];
  _inspectorAttrUrlOpen = 'newtab';
  _pluginAddedGeojsonLayerIds = [];
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

  // Helper to extract zoom level options from parts array (modifies parts in place).
  // Supported tokens: "max=18" / "maxlevel=18" / "min=2" / "minlevel=2" / "zoom=2-18" / "z=2-18"
  const extractZoom = (parts) => {
    const z = { min: null, max: null };
    if (!Array.isArray(parts)) return z;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      let m = p.match(/^(min|max)(?:level)?\s*=\s*(\d{1,2})$/i);
      if (m) {
        if (m[1].toLowerCase() === 'min') z.min = parseInt(m[2], 10);
        else z.max = parseInt(m[2], 10);
        parts.splice(i, 1); i--;
        continue;
      }
      m = p.match(/^z(?:oom)?\s*=\s*(?:(\d{1,2})\s*-\s*)?(\d{1,2})$/i);
      if (m) {
        if (m[1] !== undefined) z.min = parseInt(m[1], 10);
        z.max = parseInt(m[2], 10);
        parts.splice(i, 1); i--;
      }
    }
    return z;
  };

  let infoUrlFound = null;
  const camsFound = [];
  const legends = [];
  const nonCamLines = [];  // preserve non-cam lines for rebuild

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();
      // Legend: "legend: https://..." or "legend: GroupName|https://..."
      if (lowerLine.startsWith('legend:')) {
        const content = line.substring(7).trim();
        if (content) {
          const parts = content.split('|');
          let group = null;
          let url = content;
          if (parts.length > 1) {
             group = parts[0].trim();
             url = parts.slice(1).join('|').trim();
          }
          if (url) legends.push({ group: group, url: encodeNonAscii(url) });
        }
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

      // no parent clipboard fallback — rely on navigator.clipboard or user paste
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

    // Attribute panel URL click mode: "attrUrlOpen: panel|newtab"
    if (/^attrurlopen\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
        if (val === 'newtab' || val === 'tab' || val === 'openurl' || val === 'new' || val === 'external') {
          _inspectorAttrUrlOpen = 'newtab';
        } else if (val === 'panel' || val === 'iframe' || val === 'inline') {
          _inspectorAttrUrlOpen = 'panel';
        }
        try { sendLog('[processInspectorText] found attrUrlOpen:', _inspectorAttrUrlOpen); } catch(e){}
        try { sendLog('[processInspectorText] _inspectorAttrUrlOpen:', _inspectorAttrUrlOpen); } catch(e){}
      } catch(e){}
      nonCamLines.push(line);
      return;
    }

    // UI language override: "lang: auto|en|ja|zh-CN|zh-TW|ko|..." (auto = browser language)
    if (/^lang\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
        if (val) _inspectorLang = val;
        try { sendLog('[processInspectorText] found lang:', _inspectorLang); } catch(e){}
        try { postLangToBasemapWidget(); } catch(e){}
      } catch(e){}
      nonCamLines.push(line);
      return;
    }

    // Legacy alias: "openUrlInNewTab: true" is treated as 'newtab' mode
    if (/^openurlinnewtab\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
        if (val === 'true' || val === '1' || val === 'yes' || val === 'on' || val === 'newtab' || val === 'openurl') {
          _inspectorAttrUrlOpen = 'newtab';
        }
        try { sendLog('[processInspectorText] found openUrlInNewTab (legacy):', _inspectorAttrUrlOpen); } catch(e){}
      } catch(e){}
      nonCamLines.push(line);
      return;
    }

    // System Layer Control: "layer: Name | on/off"
    if (lowerLine.startsWith('layer:') || lowerLine.startsWith('preset:')) {
      const content = line.substring(line.indexOf(':') + 1).trim();
      if (content) {
        const parts = content.split('|').map(p => p.trim());
        const name = parts[0];
        let visible = true;
        if (parts.length > 1) {
           const v = parts[1].toLowerCase();
           if (v === 'off' || v === 'false' || v === 'hide' || v === 'invisible') visible = false;
        }
        if (name) {
           _systemLayerSettings.push({ name: name, visible: visible });
        }
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
    // Syntax: geojson: title | url | on/off | classification
    // classification: terrain | 3dtiles | both  (default follows global _geojsonClassification)
    if (lowerLine.startsWith('geojson:')) {
      const geoStr = line.substring(8).trim();
      let url = null;
      let title = null;
      let visible = true;
      let classification = null;
      if (geoStr.indexOf('|') !== -1) {
        const parts = geoStr.split('|').map(p => p.trim());
        visible = extractVisible(parts);
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
        if (parts.length > 3 && parts[3]) classification = normalizeClassification(parts[3]);
      } else {
        if (geoStr.startsWith('http')) url = geoStr;
      }
      if (url) tiles.push({ url, title, type: 'geojson', visible, classification });
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
    let zoom = { min: null, max: null };

    if (tileStr.indexOf('|') !== -1) {
      const parts = tileStr.split('|').map(p => p.trim());
      visible = extractVisible(parts);
      zoom = extractZoom(parts);
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

      tiles.push({ url, title, type: 'tiles', isBase: isBase, visible, minLevel: zoom.min, maxLevel: zoom.max, attribution });
      if (isBase) _parsedBaseTiles.push({ url, title, attribution, minLevel: zoom.min, maxLevel: zoom.max });
    }
    nonCamLines.push(line);
  });

  // Defer sending legend/info messages until after UI is (re)rendered below

  _inspectorNonCamLines = nonCamLines;
  _cameraPresets = camsFound;
  try { _inspectorLegendItems = (legends && legends.length) ? legends : []; } catch(e) {}

  if (tiles.length > 0) {
    try { sendLog('[processInspectorText] applying tiles:', tiles.length); } catch(e){}
    addXyzLayersFromArray(tiles);
  }

  // Notify the basemap widget about available base entries
  try { postBaseListToBasemapWidget(_parsedBaseTiles); } catch(e) {}

  try { applySystemLayerSettings(); } catch(e) {}

  try { safeShowUI('processInspectorText: final render'); } catch(e){}

  // After UI render, send legend and info messages so iframe listeners are ready.
  // Use a short timeout to allow iframe initialization; log actions so we can debug.
  try {
    if (typeof setTimeout === 'function') {
      setTimeout(function() {
        try { sendLog('[processInspectorText] sending legends count:', legends ? legends.length : 0); } catch(e) {}
        try {
          if (legends && legends.length > 0) postToUI({ action: 'updateLegends', items: legends });
        } catch(e) { try { sendError('[processInspectorText] updateLegends post failed', e); } catch(_) {} }

        try {
          if (infoUrlFound && infoUrlFound !== _lastInfoUrl) {
            try { sendLog('[processInspectorText] applying INFO url (deferred):', infoUrlFound); } catch(e) {}
            _lastInfoUrl = infoUrlFound;
            postToUI({ action: 'loadInfoUrl', url: infoUrlFound });
          }

          try {
            postToUI({ action: 'attrUrlOpen', mode: _inspectorAttrUrlOpen });
            try { sendLog('[processInspectorText] sent attrUrlOpen:', _inspectorAttrUrlOpen); } catch(e){}
          } catch(e) {}
          try {
            postToUI({ action: 'geojsonDrapeState', classification: _geojsonClassification });
          } catch(e) {}
        } catch(e) { try { sendError('[processInspectorText] loadInfoUrl post failed', e); } catch(_) {} }
      }, 50);
    } else {
      try { sendLog('[processInspectorText] sending legends count (no timeout):', legends ? legends.length : 0); } catch(e) {}
      try { if (legends && legends.length > 0) postToUI({ action: 'updateLegends', items: legends }); } catch(e) {}
      try {
        if (infoUrlFound && infoUrlFound !== _lastInfoUrl) {
          try { sendLog('[processInspectorText] applying INFO url (immediate):', infoUrlFound); } catch(e) {}
          _lastInfoUrl = infoUrlFound;
          postToUI({ action: 'loadInfoUrl', url: infoUrlFound });
        }
      } catch(e) {}

      try {
        postToUI({ action: 'attrUrlOpen', mode: _inspectorAttrUrlOpen });
        try { sendLog('[processInspectorText] sent attrUrlOpen:', _inspectorAttrUrlOpen); } catch(e){}
      } catch(e) {}
      try {
        postToUI({ action: 'geojsonDrapeState', classification: _geojsonClassification });
      } catch(e) {}
    }
  } catch(e) { try { sendError('[processInspectorText] deferred post error', e); } catch(_) {} }
  try { sendLog('[processInspectorText] final _inspectorAttrUrlOpen:', _inspectorAttrUrlOpen); } catch(e) {}
}

function parseAttrUrlOpen(text) {
  let mode = 'newtab';
  if (!text || typeof text !== 'string') return mode;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^attrurlopen\s*:/i.test(line)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
        if (val === 'newtab' || val === 'tab' || val === 'openurl' || val === 'new' || val === 'external') {
          mode = 'newtab';
        } else if (val === 'panel' || val === 'iframe' || val === 'inline') {
          mode = 'panel';
        }
      } catch(e) {}
      break; // first attrUrlOpen wins
    } else if (/^openurlinnewtab\s*:/i.test(line)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim().toLowerCase();
        if (val === 'true' || val === '1' || val === 'yes' || val === 'on' || val === 'newtab' || val === 'openurl') {
          mode = 'newtab';
        }
      } catch(e) {}
      break; // first legacy openUrlInNewTab wins
    }
  }
  return mode;
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
            } else if (typeof reearth.layers.override === 'function') {
              reearth.layers.override(id, { visible: false });
            }
          } catch (e) {}
          try {
            if (typeof reearth.layers.show === 'function') {
              reearth.layers.show(id);
            } else if (typeof reearth.layers.override === 'function') {
              reearth.layers.override(id, { visible: true });
            }
          } catch (e) {}
        } else {
          // Simply hide (or override to false)
          try {
            if (typeof reearth.layers.hide === 'function') {
              reearth.layers.hide(id);
            } else if (typeof reearth.layers.override === 'function') {
              reearth.layers.override(id, { visible: false });
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

function applySystemLayerSettings() {
  if (!_systemLayerSettings || !_systemLayerSettings.length) return;
  const layers = (reearth.layers && reearth.layers.layers) || [];
  if (!Array.isArray(layers)) return;

  let changed = false;
  _systemLayerSettings.forEach(s => {
    const matches = layers.filter(l => l && (l.title === s.name || (l.title && l.title.trim() === s.name)));
    matches.forEach(l => {
      // Only update if visibility is different to avoid redundant calls
      if (!!l.visible !== s.visible) {
        setLayerVisibility(l.id, s.visible, false);
        changed = true;
      }
    });
  });
  if (changed) {
     try { safeShowUI('applySystemLayerSettings'); } catch(e){}
  }
}

// Apply the current GeoJSON 3D drape setting to all plugin-added GeoJSON layers.
function applyGeojsonDrapeToAll() {
  if (!_pluginAddedGeojsonLayerIds || !_pluginAddedGeojsonLayerIds.length) return;
  const classification = _geojsonClassification;
  _pluginAddedGeojsonLayerIds.forEach(id => {
    try {
      reearth.layers.override(id, {
        polyline: { strokeColor: '#3388ff', strokeWidth: 2, clampToGround: true, classificationType: classification },
        polygon: { fillColor: '#3388ff44', strokeColor: '#3388ff', strokeWidth: 2, heightReference: 'clamp', classificationType: classification }
      });
      try { sendLog('[applyGeojsonDrapeToAll] updated', id, classification); } catch(e){}
    } catch (e) {
      try { sendError('[applyGeojsonDrapeToAll] failed for', id, e); } catch(err){}
    }
  });
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
         sendLog('[poll] inspector text changed, length:', text.length, 'text:', text.substring(0, 300));
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
    if (isBase) continue; // basemaps are applied via reearth.viewer.overrideProperty (basemap widget)
    const visible = (it.visible !== undefined) ? it.visible : true;
    const zoom = { min: it.minLevel ?? null, max: it.maxLevel ?? null };
    if (!u) continue;
    if (!/^https?:\/\//.test(u)) continue;
    const encoded = u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
    const dup = existing.find(l => l && l.data && l.data.url && (l.data.url === encoded || (typeof l.data.url === 'string' && l.data.url.indexOf(encoded) !== -1)));
    if (dup) {
      try { sendLog('[addXyzLayersFromArray] skip duplicate:', u); } catch(e){}
      continue;
    }
    addXyzLayer(u, t, type, isBase, visible, zoom, it.attribution, it.classification);
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

// --- Vector feature search helpers ---
function getGeometryCentroid(geometry) {
  try {
    if (!geometry || !geometry.type) return { lat: null, lng: null };
    const type = geometry.type;
    const coords = geometry.coordinates;
    if (type === 'Point' && Array.isArray(coords) && coords.length >= 2) {
      return { lng: Number(coords[0]), lat: Number(coords[1]) };
    }
    if (Array.isArray(coords)) {
      let count = 0;
      let sumLng = 0;
      let sumLat = 0;
      const collect = (c) => {
        if (!Array.isArray(c)) return;
        if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') {
          sumLng += Number(c[0]);
          sumLat += Number(c[1]);
          count++;
        } else {
          c.forEach(collect);
        }
      };
      coords.forEach(collect);
      if (count > 0) return { lng: sumLng / count, lat: sumLat / count };
    }
  } catch (e) {}
  return { lat: null, lng: null };
}

function parseCsv(text, noHeader) {
  const rows = [];
  const lines = (text || '').split(/\r\n|\r|\n/).filter(l => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        parts.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    parts.push(cur.trim());
    return parts;
  };
  const first = parseLine(lines[0]);
  let headers = first;
  let start = 1;
  if (noHeader) {
    headers = first.map((_, i) => String(i));
    start = 0;
  }
  for (let i = start; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] !== undefined) ? values[idx] : ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function resolveCsvColumnIndex(spec, headers) {
  if (spec == null) return -1;
  if (typeof spec === 'number') return Math.max(0, Math.floor(spec));
  const s = String(spec).trim();
  const n = parseInt(s, 10);
  if (!isNaN(n) && String(n) === s) return n;
  const idx = (headers || []).findIndex(h => String(h).trim() === s);
  return idx;
}

function csvRowsToFeatures(rows, headers, csvConfig) {
  const latSpec = csvConfig && csvConfig.latColumn;
  const lngSpec = csvConfig && csvConfig.lngColumn;
  const latIdx = (latSpec != null) ? resolveCsvColumnIndex(latSpec, headers) : -1;
  const lngIdx = (lngSpec != null) ? resolveCsvColumnIndex(lngSpec, headers) : -1;
  if (latIdx < 0 || lngIdx < 0) {
    const latRe = /^(lat|latitude|y|緯度)$/i;
    const lngRe = /^(lng|lon|longitude|x|経度)$/i;
    const fallbackLat = headers.findIndex(h => latRe.test(String(h).trim()));
    const fallbackLng = headers.findIndex(h => lngRe.test(String(h).trim()));
    if (fallbackLat < 0 || fallbackLng < 0) return [];
    return rows.map((r) => {
      try {
        const lat = parseFloat(String(r[headers[fallbackLat]]).replace(/"/g, '').trim());
        const lng = parseFloat(String(r[headers[fallbackLng]]).replace(/"/g, '').trim());
        if (isNaN(lat) || isNaN(lng)) return null;
        return { type: 'Feature', properties: r, geometry: { type: 'Point', coordinates: [lng, lat] } };
      } catch (e) { return null; }
    }).filter(Boolean);
  }
  return rows.map((r) => {
    try {
      const vals = Object.values(r);
      const lat = parseFloat(String(vals[latIdx]).replace(/"/g, '').trim());
      const lng = parseFloat(String(vals[lngIdx]).replace(/"/g, '').trim());
      if (isNaN(lat) || isNaN(lng)) return null;
      return { type: 'Feature', properties: r, geometry: { type: 'Point', coordinates: [lng, lat] } };
    } catch (e) { return null; }
  }).filter(Boolean);
}

function requestVectorFeatureIndex() {
  try {
    const layersAll = (reearth && reearth.layers && reearth.layers.layers) ? (Array.isArray(reearth.layers.layers) ? reearth.layers.layers : Object.values(reearth.layers.layers)) : [];
    const sources = [];
    layersAll.forEach((l) => {
      try {
        if (!l || !l.data || (!l.data.url && l.data.value === undefined)) return;
        const typeRaw = String(l.data.type || l.type || '').toLowerCase();
        const url = l.data.url ? String(l.data.url).toLowerCase() : '';
        const isCsv = (typeRaw === 'csv') || url.endsWith('.csv') || url.includes('.csv?') || url.startsWith('data:text/csv') || url.startsWith('data:application/csv') || url.startsWith('data:attachment/csv');
        const isGeojson = (typeRaw === 'geojson') || url.endsWith('.geojson') || url.includes('.geojson?') || url.startsWith('data:application/json') || url.startsWith('data:application/geo+json');
        if (isCsv || isGeojson) {
          sources.push({ id: l.id, title: l.title || l.id || '', type: isCsv ? 'csv' : 'geojson', url: l.data.url || null, csv: l.data.csv || null, value: l.data.value });
        }
      } catch (e) {}
    });
    postToUI({ action: 'requestVectorFeatureData', sources: sources });
    try { sendLog('[requestVectorFeatureIndex] requested', sources.length, 'sources'); } catch (e) {}
  } catch (e) {
    try { sendError('[requestVectorFeatureIndex] error:', e); } catch (_) {}
  }
}

// Build the vector feature index directly from Re:Earth's computed layers.
// This uses reearth.layers.layers[i].computed?.features, avoiding the need
// to fetch data.url / data.value from the UI iframe.
function buildVectorFeatureIndexFromLayers() {
  try {
    const layersAll = (reearth && reearth.layers && reearth.layers.layers) ? (Array.isArray(reearth.layers.layers) ? reearth.layers.layers : Object.values(reearth.layers.layers)) : [];
    const layerInfo = {};
    const allAttrSet = new Set();
    const allValuesByAttr = {};
    const allFeatureByAttr = {};
    const layerOptions = [];
    const missingSources = [];
    const MAX_TABLE_ROWS = 1000;
    const rawRowsByLayer = {};

    layersAll.forEach((l) => {
      try {
        if (!l || !l.data) return;
        const typeRaw = String(l.data.type || '').toLowerCase();
        const url = l.data.url ? String(l.data.url).toLowerCase() : '';
        const isCsv = (typeRaw === 'csv') || url.endsWith('.csv') || url.includes('.csv?') || url.startsWith('data:text/csv') || url.startsWith('data:application/csv') || url.startsWith('data:attachment/csv');
        const isGeojson = (typeRaw === 'geojson') || url.endsWith('.geojson') || url.includes('.geojson?') || url.startsWith('data:application/json') || url.startsWith('data:application/geo+json');
        if (!isCsv && !isGeojson) return;

        const title = (l.title || (l.layer && l.layer.title) || l.id || 'Layer');
        const id = l.id || String(layerOptions.length);

        const features = (l.computed && l.computed.features && Array.isArray(l.computed.features)) ? l.computed.features : ((l.computed && l.computed.originalFeatures && Array.isArray(l.computed.originalFeatures)) ? l.computed.originalFeatures : null);
        if (!features || !features.length) {
          // computed features not ready yet: request raw data from the UI iframe as a fallback
          missingSources.push({ id: id, title: title, type: isCsv ? 'csv' : 'geojson', url: l.data.url || null, csv: l.data.csv || null, value: l.data.value });
          return;
        }

        const attrSet = new Set();
        const valuesByAttr = {};
        const featureByAttr = {};
        const rawRows = [];

        features.forEach((f) => {
          try {
            const props = (f && f.properties) || {};
            const geom = (f && f.geometry) || null;
            const centroid = getGeometryCentroid(geom);
            if (centroid.lat == null || centroid.lng == null || isNaN(centroid.lat) || isNaN(centroid.lng)) return;
            if (rawRows.length < MAX_TABLE_ROWS) {
              rawRows.push({ props, lat: centroid.lat, lng: centroid.lng });
            }
            Object.keys(props).forEach((key) => {
              try {
                const raw = props[key];
                if (raw == null) return;
                const val = String(raw);
                attrSet.add(key);
                if (!valuesByAttr[key]) valuesByAttr[key] = new Set();
                if (!featureByAttr[key]) featureByAttr[key] = {};
                if (!valuesByAttr[key].has(val)) {
                  valuesByAttr[key].add(val);
                  featureByAttr[key][val] = { lat: centroid.lat, lng: centroid.lng };
                }
                allAttrSet.add(key);
                if (!allValuesByAttr[key]) allValuesByAttr[key] = new Set();
                if (!allFeatureByAttr[key]) allFeatureByAttr[key] = {};
                if (!allValuesByAttr[key].has(val)) {
                  allValuesByAttr[key].add(val);
                  allFeatureByAttr[key][val] = { lat: centroid.lat, lng: centroid.lng };
                }
              } catch (e) {}
            });
          } catch (e) {}
        });

        const sortedAttributes = Array.from(attrSet).sort();
        const sortedValuesByAttr = {};
        sortedAttributes.forEach((k) => { sortedValuesByAttr[k] = Array.from(valuesByAttr[k] || new Set()).sort(); });

        const rows = rawRows.map((r) => ({
          values: sortedAttributes.map((k) => (r.props[k] === undefined || r.props[k] === null) ? '' : String(r.props[k])),
          lat: r.lat,
          lng: r.lng
        }));
        rawRowsByLayer[id] = rawRows;

        layerInfo[id] = { title: title, attributes: sortedAttributes, valuesByAttr: sortedValuesByAttr, featureByAttr: featureByAttr, rows: rows };
        layerOptions.push({ id: id, title: title });
      } catch (e) {
        try { sendError('[buildVectorFeatureIndexFromLayers] failed for', l && l.id, e); } catch (_) {}
      }
    });

    const allAttributes = Array.from(allAttrSet).sort();
    const allSortedValuesByAttr = {};
    allAttributes.forEach((k) => { allSortedValuesByAttr[k] = Array.from(allValuesByAttr[k] || new Set()).sort(); });

    const allRawRows = [];
    Object.keys(rawRowsByLayer).forEach((layerId) => {
      if (allRawRows.length >= MAX_TABLE_ROWS) return;
      for (const r of rawRowsByLayer[layerId]) {
        allRawRows.push(r);
        if (allRawRows.length >= MAX_TABLE_ROWS) break;
      }
    });

    const allRows = allRawRows.map((r) => ({
      values: allAttributes.map((k) => (r.props[k] === undefined || r.props[k] === null) ? '' : String(r.props[k])),
      lat: r.lat,
      lng: r.lng
    }));

    _vectorFeatureIndex = {
      layers: layerInfo,
      all: { attributes: allAttributes, valuesByAttr: allSortedValuesByAttr, featureByAttr: allFeatureByAttr, rows: allRows },
      layerOptions: layerOptions
    };

    const uiLayers = {};
    Object.keys(layerInfo).forEach((id) => {
      const l = layerInfo[id];
      uiLayers[id] = { title: l.title, attributes: l.attributes, valuesByAttr: l.valuesByAttr, rows: l.rows };
    });

    postToUI({ action: 'vectorFeatureIndex', all: { attributes: allAttributes, valuesByAttr: allSortedValuesByAttr, rows: allRows }, layers: uiLayers, layerOptions: layerOptions });
    try { sendLog('[buildVectorFeatureIndexFromLayers] built index with', allAttributes.length, 'attributes across', layerOptions.length, 'layers'); } catch (e) {}

    if (missingSources.length) {
      postToUI({ action: 'requestVectorFeatureData', sources: missingSources });
      try { sendLog('[buildVectorFeatureIndexFromLayers] requested raw fallback for', missingSources.length, 'sources'); } catch (e) {}
    }
  } catch (e) {
    try { sendError('[buildVectorFeatureIndexFromLayers] error:', e); } catch (_) {}
    _vectorFeatureIndex = null;
  }
}

function buildVectorFeatureIndexFromData(layersData) {
  try {
    const vectorSources = layersData || {};
    const existing = _vectorFeatureIndex || null;
    const layerInfo = (existing && existing.layers) ? Object.assign({}, existing.layers) : {};
    const allAttrSet = new Set((existing && existing.all && existing.all.attributes) ? existing.all.attributes : []);
    const allValuesByAttr = {};
    const allFeatureByAttr = {};
    const layerOptions = (existing && existing.layerOptions) ? existing.layerOptions.slice() : [];
    const MAX_TABLE_ROWS = 1000;

    if (existing && existing.all) {
      if (existing.all.valuesByAttr) {
        Object.keys(existing.all.valuesByAttr).forEach((k) => { allValuesByAttr[k] = new Set(existing.all.valuesByAttr[k] || []); });
      }
      if (existing.all.featureByAttr) {
        Object.keys(existing.all.featureByAttr).forEach((k) => { allFeatureByAttr[k] = Object.assign({}, existing.all.featureByAttr[k] || {}); });
      }
    }

    Object.keys(vectorSources).forEach((id) => {
      const source = vectorSources[id];
      const vl = { id: id, title: source.title, type: source.type, csv: source.csv, raw: source.raw, value: source.value };
      try {
        let rawText = null;
        let dataObject = null;
        if (vl.value !== undefined) {
          if (typeof vl.value === 'string') {
            rawText = vl.value;
          } else if (typeof vl.value === 'object' && vl.value !== null) {
            dataObject = vl.value;
          }
        }
        if (rawText === null && dataObject === null && typeof vl.raw === 'string') {
          rawText = vl.raw;
        } else if (rawText === null && dataObject === null) {
          return;
        }

        let features = [];
        if (vl.type === 'csv') {
          if (dataObject && Array.isArray(dataObject)) {
            // Re:Earth may expose parsed CSV rows as an array of arrays or objects
            const headers = (dataObject[0] && Array.isArray(dataObject[0])) ? dataObject[0].map((_, i) => String(i)) : ((vl.csv && vl.csv.noHeader) ? Object.keys(dataObject[0] || {}).map((_, i) => String(i)) : Object.keys(dataObject[0] || {}));
            const rows = dataObject.map((r) => {
              if (Array.isArray(r)) {
                const row = {};
                headers.forEach((h, i) => { row[h] = (r[i] !== undefined) ? r[i] : ''; });
                return row;
              }
              return r || {};
            });
            features = csvRowsToFeatures(rows, headers, vl.csv);
          } else if (dataObject && typeof dataObject === 'object') {
            const maybeFeatures = dataObject.features || dataObject.Feature || dataObject;
            features = Array.isArray(maybeFeatures) ? maybeFeatures : [];
          } else if (typeof rawText === 'string') {
            const noHeader = !!(vl.csv && vl.csv.noHeader);
            const { headers, rows } = parseCsv(rawText, noHeader);
            features = csvRowsToFeatures(rows, headers, vl.csv);
          }
        } else if (rawText !== null) {
          const data = JSON.parse(rawText);
          features = Array.isArray(data) ? data : ((data && (data.features || data.Feature)) || []);
        } else if (dataObject) {
          features = Array.isArray(dataObject) ? dataObject : ((dataObject && (dataObject.features || dataObject.Feature)) || []);
        }

        const attrSet = new Set();
        const valuesByAttr = {};
        const featureByAttr = {};
        const rawRows = [];

        features.forEach((f) => {
          try {
            const props = f.properties || f.Property || {};
            const geom = f.geometry || f.Geometry;
            const centroid = getGeometryCentroid(geom);
            if (centroid.lat == null || centroid.lng == null || isNaN(centroid.lat) || isNaN(centroid.lng)) return;
            if (rawRows.length < MAX_TABLE_ROWS) {
              rawRows.push({ props, lat: centroid.lat, lng: centroid.lng });
            }
            Object.keys(props).forEach((key) => {
              try {
                const raw = props[key];
                if (raw == null) return;
                const val = String(raw);
                attrSet.add(key);
                if (!valuesByAttr[key]) valuesByAttr[key] = new Set();
                if (!featureByAttr[key]) featureByAttr[key] = {};
                if (!valuesByAttr[key].has(val)) {
                  valuesByAttr[key].add(val);
                  featureByAttr[key][val] = { lat: centroid.lat, lng: centroid.lng };
                }
                allAttrSet.add(key);
                if (!allValuesByAttr[key]) allValuesByAttr[key] = new Set();
                if (!allFeatureByAttr[key]) allFeatureByAttr[key] = {};
                if (!allValuesByAttr[key].has(val)) {
                  allValuesByAttr[key].add(val);
                  allFeatureByAttr[key][val] = { lat: centroid.lat, lng: centroid.lng };
                }
              } catch (e) {}
            });
          } catch (e) {}
        });

        const sortedAttributes = Array.from(attrSet).sort();
        const sortedValuesByAttr = {};
        sortedAttributes.forEach((k) => { sortedValuesByAttr[k] = Array.from(valuesByAttr[k] || new Set()).sort(); });

        const rows = rawRows.map((r) => ({
          values: sortedAttributes.map((k) => (r.props[k] === undefined || r.props[k] === null) ? '' : String(r.props[k])),
          lat: r.lat,
          lng: r.lng
        }));

        if (!layerInfo[vl.id]) {
          layerOptions.push({ id: vl.id, title: vl.title });
        }
        layerInfo[vl.id] = { title: vl.title, attributes: sortedAttributes, valuesByAttr: sortedValuesByAttr, featureByAttr: featureByAttr, rows: rows };
      } catch (e) {
        try { sendError('[buildVectorFeatureIndex] failed for', id, e); } catch (_) {}
      }
    });

    const allAttributes = Array.from(allAttrSet).sort();
    const allSortedValuesByAttr = {};
    allAttributes.forEach((k) => { allSortedValuesByAttr[k] = Array.from(allValuesByAttr[k] || new Set()).sort(); });

    const allRows = [];
    Object.keys(layerInfo).forEach((id) => {
      if (allRows.length >= MAX_TABLE_ROWS) return;
      const l = layerInfo[id];
      const layerAttrs = l.attributes || [];
      if (!l.rows || !l.rows.length) return;
      for (const r of l.rows) {
        allRows.push({
          values: allAttributes.map((a) => {
            const idx = layerAttrs.indexOf(a);
            return idx >= 0 ? r.values[idx] : '';
          }),
          lat: r.lat,
          lng: r.lng
        });
        if (allRows.length >= MAX_TABLE_ROWS) break;
      }
    });

    _vectorFeatureIndex = {
      layers: layerInfo,
      all: { attributes: allAttributes, valuesByAttr: allSortedValuesByAttr, featureByAttr: allFeatureByAttr, rows: allRows },
      layerOptions: layerOptions
    };

    const uiLayers = {};
    Object.keys(layerInfo).forEach((id) => {
      const l = layerInfo[id];
      uiLayers[id] = { title: l.title, attributes: l.attributes, valuesByAttr: l.valuesByAttr, rows: l.rows };
    });

    postToUI({ action: 'vectorFeatureIndex', all: { attributes: allAttributes, valuesByAttr: allSortedValuesByAttr, rows: allRows }, layers: uiLayers, layerOptions: layerOptions });
    try { sendLog('[buildVectorFeatureIndex] built index with', allAttributes.length, 'attributes across', layerOptions.length, 'layers'); } catch (e) {}
  } catch (e) {
    try { sendError('[buildVectorFeatureIndex] error:', e); } catch (_) {}
    _vectorFeatureIndex = null;
  }
}

function flyToVectorFeature(layerId, attrName, value) {
  try {
    if (!_vectorFeatureIndex || !attrName || value == null) {
      try { sendError('[flyToVectorFeature] no index or missing params'); } catch (_) {}
      return;
    }
    const source = (layerId === '__all__' || !layerId) ? _vectorFeatureIndex.all : (_vectorFeatureIndex.layers[layerId] || null);
    if (!source || !source.featureByAttr[attrName] || !source.featureByAttr[attrName][String(value)]) {
      try { sendError('[flyToVectorFeature] not found for', layerId, attrName, value); } catch (_) {}
      return;
    }
    const entry = source.featureByAttr[attrName][String(value)];
    if (entry.lat == null || entry.lng == null) {
      try { sendError('[flyToVectorFeature] no coordinates'); } catch (_) {}
      return;
    }
    flyToAndNotify(entry.lat, entry.lng, { addMarker: false });
  } catch (e) {
    try { sendError('[flyToVectorFeature] error:', e); } catch (_) {}
  }
}

// --- Startup URL auto-fly ---
(function tryAutoFlyToFromUrl() {
  try {
    const doFly = () => {
      try {
        let query = null;
        try { query = (reearth.viewer && reearth.viewer.viewport && reearth.viewer.viewport.query) ? reearth.viewer.viewport.query : null; } catch(e){}
        if (!query) try { query = (reearth.viewport && reearth.viewport.query) ? reearth.viewport.query : null; } catch(e){}

        if (query) {
          const state = {};
          if (query.lat != null) state.lat = parseFloat(query.lat);
          if (query.lng != null) state.lng = parseFloat(query.lng);
          if (query.height != null) state.height = parseFloat(query.height);
          if (query.heading != null) state.heading = parseFloat(query.heading);
          if (query.pitch != null) state.pitch = parseFloat(query.pitch);
          if (query.layers != null) state.layers = query.layers;

          if (typeof state.lat === 'number' && !isNaN(state.lat) && typeof state.lng === 'number' && !isNaN(state.lng)) {
            applyPermalinkFromObject(state);
            try { sendLog('[tryAutoFlyToFromUrl] auto flyTo from viewport query:', query); } catch(e){}
          } else {
            try { sendLog('[tryAutoFlyToFromUrl] no lat/lng in viewport query:', query); } catch(e){}
          }
        } else {
          try { sendLog('[tryAutoFlyToFromUrl] viewport query unavailable'); } catch(e){}
        }
      } catch(e) {
        try { sendError('[tryAutoFlyToFromUrl] error:', e); } catch(err){}
      }
    };

    if (typeof setTimeout === 'function') {
      setTimeout(doFly, 500);
    } else {
      doFly();
    }
  } catch(e) {
    try { sendError('[tryAutoFlyToFromUrl] outer error:', e); } catch(err){}
  }
})();
