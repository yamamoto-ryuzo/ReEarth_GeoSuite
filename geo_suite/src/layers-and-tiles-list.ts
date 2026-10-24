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
let _inspectorGeminiApiKey = null; // optional geminiApiKey read from inspector text (forwarded to ai-chat widget)
let _inspectorGeminiModel = null; // optional geminiModel read from inspector text
let _inspectorGoogleMapsApiKey = null; // optional googleMapsApiKey read from inspector text (Google Places search / Street View pano verification)
let _systemLayerSettings = []; // settings for system layers from inspector
let _inspectorAttrUrlOpen = 'newtab'; // attribute panel URL click mode: 'panel' | 'newtab'
let _vectorFeatureIndex = null; // cached index of vector layer features: { attributes: string[], valuesByAttr: { [attr]: string[] }, featureByAttr: { [attr]: { [value]: { lat, lng } } } }

// --- Fly mode (ported from kasugai_canvas) ---
// Inspector syntax: fly_geojson: Name | URL | speed=30 | height=0 | pitch=-10 | loop=true | view=camera|center
// view aliases: camera = ride-on POV (pov, fpv, first, 1st, ride); center = aerial chase (chase, follow, 3rd, third, aerial)
// `route:<name>` as URL references a drawn route stored in reearth.data.clientStorage.
let _flyRoutes = []; // [{ title, url, speed, height, pitch, loop, step, view }]
let _flyDrawnRouteNames = []; // route names persisted in clientStorage ("flyRoute:<name>" keys)
let _flyRouteLayerId = null; // layer id of the currently shown fly route polyline
let _flySampleSeq = 0;
const FLY_ROUTE_STORAGE_PREFIX = 'flyRoute:';
const FLY_ROUTE_LAYER_TITLE = 'Fly Route (geo_suite)';

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
    tabLayers:'Layers', tabLegend:'Legend', tabSearch:'Search', tabCams:'Cams', tabInfo:'Info', tabShare:'Share', tabSet:'Set', tabAttr:'Attr', tabDisplay:'Display', manageTitle:'Manage', manageInspectorLbl:'Settings text', manageApply:'Apply', manageApplied:'Applied', importTitle:'File import', importAddFile:'Add files', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Layers', note:'Note', refresh:'Refresh', refreshTitle:'Force Refresh User Layers',
    generateLink:'Generate Link', generating:'Generating...', copy:'Copy', copied:'Copied!',
    sharePasteLabel:'Paste a URL below.', sharePastePh:'Paste URL or ?lat=...', load:'Load', loaded:'Loaded!', invalidData:'Invalid Data', parseError:'Parse Error', error:'Error',
    shareReadUrl:'Move to current URL parameters', urlLoadFlyTo:'Load URL & FlyTo', loading:'Loading...',
    shareFlyCurrentLabel:'Move from current location', flyToCurrentLoc:'Fly to Current Location', getting:'Getting...', restored:'Restored!', noLatLng:'No Lat/Lng', noParams:'No Params', imported:'Imported!',
    vectorSearch:'Vector Search', allSelect:'All', selectValue:'Select value', fly:'Fly', textSearchPh:'Search by text', searchGo:'Search', updateVector:'Update vector data', attrValueList:'Attributes & Values', attrsLoaded:'Loaded {n} attributes', noAttrVector:'No vector layers with attributes', noMatch:'No match',
    addrSearch:'Address Search', providerGsi:'GSI', searchPh:'Enter search keyword', searching:'Searching...', noResults:'No results', searchFailCors:'Search failed. Check your network (CORS).', appIdMissing:'yahooAppId is not set. Add the following line to the plugin inspector:', appIdSample:'yahooAppId: your Yahoo AppID', searchFailAppId:'Search failed. Check the AppID setting and network (CORS).', yahooWarn:'Note: yahooAppId may be exposed. Do not use on public sites.', googleWarn:'Note: googleMapsApiKey may be exposed. Do not use on public sites.', googleKeyMissing:'googleMapsApiKey is not set. Add the following line to the plugin inspector:', googleKeySample:'googleMapsApiKey: your Google Maps API key', manageSecretWarn:'Note: geminiApiKey: and yahooAppId: written here are saved with the project and published to all site visitors.',
    camsTitle:'Camera Presets', camHelp:'cam:Title|Lat|Lng<br>cam:Title|Lat|Lng|h=Height(m)<br>cam:Title|Lat|Lng|h=Height|d=Heading&deg;|p=Pitch&deg;<br><br>Ex: cam:Tokyo Station|35.6812|139.7671<br>Ex: cam:Mt. Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Unspecified parameters keep the current camera settings', currentCamera:'Current Camera', positionLabel:'Position', hprLabel:'Heading/Pitch/Roll', flyToTitle:'Fly to {v}',
    terrain:'Terrain', shadow:'Shadow', depthTest:'Depth Test', on:'ON', off:'OFF', geojsonDrape:'GeoJSON 3D Drape',
    start:'Start', stop:'Stop', current:'Current', apply:'Apply', sentCurrent:'Sent (current set)', sent:'Sent', sendFailed:'Send failed',
    legendTitle:'Legend', legendInstr:'Add "legend: ImageURL" to inspector text.', legendMain:'Main',
    attrTitle:'Attributes', noFeature:'No feature selected.', noAttrAvail:'No attributes available or feature deselected.', backToAttrList:'Back to attribute list', openNewTab:'Open in new tab (bypass sandbox)',
    selectLayer:'Select layer', attrOrValuePh:'Search attributes or values', selectLayerPrompt:'Please select a layer', countFmt:'{rows} items / {attrs} attributes', sortTitle:'Click to sort', noMatchingFeatures:'No matching features', clickToFly:'Click to fly', limitSuffix:' (showing up to {n})', closeAria:'Close',
    noUrlConfigured: 'No URL configured',
    tabFly: 'Fly',
    flyRoute: 'Route', flyRoutePh: 'Select route', flyDraw: 'Draw', flyDrawing: 'Drawing — click the map to add points, double-click to finish', flyCancelDraw: 'Cancel', flyDelete: 'Delete', flySaveGeo: 'Save', flySaved: 'Saved!',
    flyPlay: 'Play', flyPause: 'Pause', flyStop: 'Stop', flyRestart: 'Restart',
    flySpeedLbl: 'Speed (km/h)', flyHeightLbl: 'AGL (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Loop', flyView: 'View', flyViewCam: 'Ride', flyViewCenter: 'Aerial',
    flyPreset: 'Preset', flyPresetCustom: 'Custom', flyPresetWalk: 'Walk (h2 s5 p-5)', flyPresetDrive: 'Drive (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Overview (h1000 s300 p-45)', flyReverse: 'Reverse', flyImport: 'Import',
 flyBack: '◀ Back', flyBackHint: 'Play the route backward / pause',
 flyDblHint: 'Map double-click: play/pause · right double-click: play backward · wheel: speed',
    flyShowLine: 'Show route', flyLoading: 'Loading route...', flySampling: 'Sampling terrain...', flyDone: 'Finished', flyErr: 'Failed to load route', flyNoRoute: 'No route selected',
    flyViewHint: 'Ride: camera travels on the route looking ahead. Aerial: camera tracks the moving point from behind and above.',
    flyHelp: 'fly_geojson:Name|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = ride on the route looking ahead; center (=chase) = aerial tracking of the point from behind/above.<br>Field changes apply immediately, even while flying.<br>Or press Draw and sketch a polyline on the map.',
    svOpen: 'Street View', captureBtn: 'Capture', capturedHint: 'Right-click the image to save'
  },
  ja: {
    minimize:'最小化', restore:'元に戻す', move:'移動', moveCamera:'カメラ移動',
    tabLayers:'レイヤー', tabLegend:'凡例', tabSearch:'検索', tabCams:'カメラ', tabInfo:'情報', tabShare:'共有', tabSet:'設定', tabAttr:'属性', tabDisplay:'表示', manageTitle:'管理', manageInspectorLbl:'設定テキスト', manageApply:'適用', manageApplied:'適用しました', importTitle:'ファイル取り込み', importAddFile:'ファイルを追加', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'レイヤー', note:'注意', refresh:'更新', refreshTitle:'ユーザーレイヤーを強制更新',
    generateLink:'リンクを生成', generating:'生成中...', copy:'コピー', copied:'コピーしました!',
    sharePasteLabel:'URLをペーストして下さい。', sharePastePh:'URL または ?lat=... を貼付', load:'読込', loaded:'読込完了!', invalidData:'無効なデータ', parseError:'解析エラー', error:'エラー',
    shareReadUrl:'現在のURLパラメータを読み取って移動', urlLoadFlyTo:'URL読込 & FlyTo', loading:'読込中...',
    shareFlyCurrentLabel:'現在位置から移動', flyToCurrentLoc:'現在位置から FlyTo', getting:'取得中...', restored:'復元しました!', noLatLng:'緯度経度なし', noParams:'パラメータなし', imported:'インポートしました!',
    vectorSearch:'ベクトル検索', allSelect:'全選択', selectValue:'値を選択', fly:'移動', textSearchPh:'文字で検索', searchGo:'検索', updateVector:'ベクトルデータを更新', attrValueList:'属性・値一覧', attrsLoaded:'{n} 属性を読み込みました', noAttrVector:'属性付きベクトルがありません', noMatch:'該当なし',
    addrSearch:'住所検索', providerGsi:'地理院', searchPh:'検索ワードを入力', searching:'検索中...', noResults:'結果なし', searchFailCors:'検索に失敗しました。ネットワーク（CORS）を確認してください。', appIdMissing:'AppIDが設定されていません。プラグインのインスペクターに次の行を追加してください：', appIdSample:'yahooAppId: あなたのYahoo AppID', searchFailAppId:'検索に失敗しました。AppID設定やネットワーク（CORS）を確認してください。', yahooWarn:'注意: yahooAppIdは漏洩する可能性があります。公開サイトでは使用しないでください。', googleWarn:'注意: googleMapsApiKeyは漏洩する可能性があります。公開サイトでは使用しないでください。', googleKeyMissing:'googleMapsApiKeyが設定されていません。プラグインのインスペクターに次の行を追加してください：', googleKeySample:'googleMapsApiKey: あなたのGoogle Maps APIキー', manageSecretWarn:'注意：ここに書いた geminiApiKey: や yahooAppId: はプロジェクトに保存され、公開サイトの全訪問者に配布されます。',
    camsTitle:'カメラプリセット', camHelp:'cam:タイトル|緯度|経度<br>cam:タイトル|緯度|経度|h=高度m<br>cam:タイトル|緯度|経度|h=高度|d=方位&deg;|p=傾き&deg;<br><br>例: cam:東京駅|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定のパラメータは現在のカメラ設定を維持', currentCamera:'現在のカメラ', positionLabel:'位置', hprLabel:'方位/傾き/回転', flyToTitle:'{v} へ移動',
    terrain:'地形', shadow:'影', depthTest:'深度テスト', on:'ON', off:'OFF', geojsonDrape:'GeoJSON 3D ドレープ',
    start:'開始', stop:'終了', current:'現在', apply:'適用', sentCurrent:'送信しました（現在時刻設定済）', sent:'送信しました', sendFailed:'送信に失敗しました',
    legendTitle:'凡例', legendInstr:'インスペクターテキストに "legend: 画像URL" を追加してください。', legendMain:'メイン',
    attrTitle:'属性', noFeature:'地物が選択されていません。', noAttrAvail:'属性がないか、地物の選択が解除されました。', backToAttrList:'属性一覧に戻る', openNewTab:'新しいタブで開く（Sandbox回避）',
    selectLayer:'レイヤを選択', attrOrValuePh:'属性または値で検索', selectLayerPrompt:'レイヤを選択してください', countFmt:'{rows} 件 / {attrs} 属性', sortTitle:'クリックで並び替え', noMatchingFeatures:'該当する地物がありません', clickToFly:'クリックで移動', limitSuffix:' （表示上限 {n} 件）', closeAria:'閉じる',
    noUrlConfigured: 'URLが設定されていません',
    tabFly: 'Fly',
    flyRoute: 'ルート', flyRoutePh: 'ルートを選択', flyDraw: '描画', flyDrawing: '描画中 — 地図をクリックで点を追加、ダブルクリックで終了', flyCancelDraw: 'キャンセル', flyDelete: '削除', flySaveGeo: '保存', flySaved: '保存しました',
    flyPlay: '再生', flyPause: '一時停止', flyStop: '停止', flyRestart: '最初から',
    flySpeedLbl: '速度 (km/h)', flyHeightLbl: '地上高 (m)', flyPitchLbl: 'ピッチ (°)', flyLoop: 'ループ', flyView: '視点', flyViewCam: '搭乗', flyViewCenter: '空撮',
    flyPreset: 'プリセット', flyPresetCustom: 'カスタム', flyPresetWalk: '徒歩 (h2 s5 p-5)', flyPresetDrive: '車載 (h2 s60 p-10)', flyPresetDrone: 'ドローン (h200 s60 p-30)', flyPresetOverview: '広域 (h1000 s300 p-45)', flyReverse: '逆転', flyImport: '取込',
 flyBack: '◀ 逆再生', flyBackHint: 'ルートを逆方向に再生/一時停止',
 flyDblHint: '地図をダブルクリック: 再生/一時停止 · 右ダブルクリック: 逆再生 · ホイール: 速度',
    flyShowLine: 'ルートを表示', flyLoading: 'ルート読み込み中...', flySampling: '地形を取得中...', flyDone: '終了', flyErr: 'ルートの読み込みに失敗しました', flyNoRoute: 'ルートが選択されていません',
    flyViewHint: '搭乗: ルート上を進み前方を見る視点。空撮: 後方上空から移動点を追う視点。',
    flyHelp: 'fly_geojson:名前|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera(=pov)=ルート上を進み前方を見る搭乗視点 / center(=chase)=後方上空から移動点を追う空撮視点。<br>入力値は再生中でも即時に反映されます。<br>または「描画」ボタンで地図上にポリラインを描きます。',
    svOpen: 'ストリートビュー', captureBtn: 'キャプチャ', capturedHint: '画像を右クリックで保存'
  },
  'zh-CN': {
    minimize:'最小化', restore:'还原', move:'移动', moveCamera:'移动相机',
    tabLayers:'图层', tabLegend:'图例', tabSearch:'搜索', tabCams:'相机', tabInfo:'信息', tabShare:'分享', tabSet:'设置', tabAttr:'属性', tabDisplay:'显示', manageTitle:'管理', manageInspectorLbl:'设置文本', manageApply:'应用', manageApplied:'已应用', importTitle:'文件导入', importAddFile:'添加文件', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'图层', note:'注意', refresh:'刷新', refreshTitle:'强制刷新用户图层',
    generateLink:'生成链接', generating:'生成中...', copy:'复制', copied:'已复制！',
    sharePasteLabel:'请在下方粘贴URL。', sharePastePh:'粘贴 URL 或 ?lat=...', load:'加载', loaded:'已加载！', invalidData:'无效数据', parseError:'解析错误', error:'错误',
    shareReadUrl:'读取当前URL参数并移动', urlLoadFlyTo:'加载URL并飞行', loading:'加载中...',
    shareFlyCurrentLabel:'从当前位置移动', flyToCurrentLoc:'飞往当前位置', getting:'获取中...', restored:'已恢复！', noLatLng:'无经纬度', noParams:'无参数', imported:'已导入！',
    vectorSearch:'矢量搜索', allSelect:'全选', selectValue:'选择值', fly:'飞行', textSearchPh:'按文字搜索', searchGo:'搜索', updateVector:'更新矢量数据', attrValueList:'属性与值列表', attrsLoaded:'已加载 {n} 个属性', noAttrVector:'没有带属性的矢量图层', noMatch:'无匹配',
    addrSearch:'地址搜索', providerGsi:'地理院', searchPh:'输入搜索关键词', searching:'搜索中...', noResults:'无结果', searchFailCors:'搜索失败。请检查网络（CORS）。', appIdMissing:'未设置 AppID。请在插件检查器中添加以下行：', appIdSample:'yahooAppId: 您的 Yahoo AppID', searchFailAppId:'搜索失败。请检查 AppID 设置和网络（CORS）。', yahooWarn:'注意：yahooAppId 可能会泄露。请勿在公开网站上使用。', googleWarn:'注意：googleMapsApiKey 可能会泄露。请勿在公开网站上使用。', googleKeyMissing:'未设置 googleMapsApiKey。请在插件检查器中添加以下行：', googleKeySample:'googleMapsApiKey: 您的 Google Maps API 密钥', manageSecretWarn:'注意：在此填写的 geminiApiKey: 和 yahooAppId: 会随项目保存并发布给所有站点访问者。',
    camsTitle:'相机预设', camHelp:'cam:标题|纬度|经度<br>cam:标题|纬度|经度|h=高度m<br>cam:标题|纬度|经度|h=高度|d=方位&deg;|p=俯仰&deg;<br><br>例: cam:东京站|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定的参数将保持当前相机设置', currentCamera:'当前相机', positionLabel:'位置', hprLabel:'航向/俯仰/横滚', flyToTitle:'飞往 {v}',
    terrain:'地形', shadow:'阴影', depthTest:'深度测试', on:'开', off:'关', geojsonDrape:'GeoJSON 3D 贴地',
    start:'开始', stop:'结束', current:'当前', apply:'应用', sentCurrent:'已发送（已设置当前时间）', sent:'已发送', sendFailed:'发送失败',
    legendTitle:'图例', legendInstr:'在检查器文本中添加 "legend: 图片URL"。', legendMain:'主图',
    attrTitle:'属性', noFeature:'未选择要素。', noAttrAvail:'没有属性或已取消选择要素。', backToAttrList:'返回属性列表', openNewTab:'在新标签页打开（绕过沙箱）',
    selectLayer:'选择图层', attrOrValuePh:'按属性或值搜索', selectLayerPrompt:'请选择图层', countFmt:'{rows} 项 / {attrs} 个属性', sortTitle:'点击排序', noMatchingFeatures:'没有匹配的要素', clickToFly:'点击移动', limitSuffix:' （最多显示 {n} 项）', closeAria:'关闭',
    noUrlConfigured: '未配置 URL',
    tabFly: '飞行',
    flyRoute: '路线', flyRoutePh: '选择路线', flyDraw: '绘制', flyDrawing: '绘制中 — 单击地图添加点，双击结束', flyCancelDraw: '取消', flyDelete: '删除', flySaveGeo: '保存', flySaved: '已保存',
    flyPlay: '播放', flyPause: '暂停', flyStop: '停止', flyRestart: '重新开始',
    flySpeedLbl: '速度 (km/h)', flyHeightLbl: '离地高度 (m)', flyPitchLbl: '俯仰角 (°)', flyLoop: '循环', flyView: '视角', flyViewCam: '搭乘', flyViewCenter: '航拍',
    flyPreset: '预设', flyPresetCustom: '自定义', flyPresetWalk: '步行 (h2 s5 p-5)', flyPresetDrive: '车载 (h2 s60 p-10)', flyPresetDrone: '无人机 (h200 s60 p-30)', flyPresetOverview: '广域 (h1000 s300 p-45)', flyReverse: '反转', flyImport: '导入',
 flyBack: '◀ 逆再生', flyBackHint: 'ルートを逆方向に再生/一時停止',
 flyDblHint: '地図をダブルクリック: 再生/一時停止 · 右ダブルクリック: 逆再生 · ホイール: 速度',
    flyShowLine: '显示路线', flyLoading: '正在加载路线...', flySampling: '正在采样地形...', flyDone: '已完成', flyErr: '路线加载失败', flyNoRoute: '未选择路线',
    flyViewHint: '搭乘: 相机沿路线前进并朝向前方。航拍: 相机从后方上空追踪移动点。',
    flyHelp: 'fly_geojson:名称|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera(=pov)=沿路线前进、朝向前方的搭乘视角 / center(=chase)=从后方上空追踪移动点的航拍视角。<br>参数修改即时生效，飞行中也可调整。<br>或点击"绘制"在地图上画出折线。',
    svOpen: '街景', captureBtn: '截图', capturedHint: '右键点击图片保存'
  },
  'zh-TW': {
    minimize:'最小化', restore:'還原', move:'移動', moveCamera:'移動相機',
    tabLayers:'圖層', tabLegend:'圖例', tabSearch:'搜尋', tabCams:'相機', tabInfo:'資訊', tabShare:'分享', tabSet:'設定', tabAttr:'屬性', tabDisplay:'顯示', manageTitle:'管理', manageInspectorLbl:'設定文字', manageApply:'套用', manageApplied:'已套用', importTitle:'檔案匯入', importAddFile:'新增檔案', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'圖層', note:'注意', refresh:'重新整理', refreshTitle:'強制重新整理使用者圖層',
    generateLink:'產生連結', generating:'產生中...', copy:'複製', copied:'已複製！',
    sharePasteLabel:'請在下方貼上 URL。', sharePastePh:'貼上 URL 或 ?lat=...', load:'載入', loaded:'已載入！', invalidData:'無效資料', parseError:'解析錯誤', error:'錯誤',
    shareReadUrl:'讀取目前 URL 參數並移動', urlLoadFlyTo:'載入 URL 並飛行', loading:'載入中...',
    shareFlyCurrentLabel:'從目前位置移動', flyToCurrentLoc:'飛往目前位置', getting:'取得中...', restored:'已還原！', noLatLng:'無經緯度', noParams:'無參數', imported:'已匯入！',
    vectorSearch:'向量搜尋', allSelect:'全選', selectValue:'選擇值', fly:'飛行', textSearchPh:'按文字搜尋', searchGo:'搜尋', updateVector:'更新向量資料', attrValueList:'屬性與值清單', attrsLoaded:'已載入 {n} 個屬性', noAttrVector:'沒有含屬性的向量圖層', noMatch:'無符合項目',
    addrSearch:'地址搜尋', providerGsi:'地理院', searchPh:'輸入搜尋關鍵字', searching:'搜尋中...', noResults:'無結果', searchFailCors:'搜尋失敗。請檢查網路（CORS）。', appIdMissing:'未設定 AppID。請在外掛檢查器中新增以下行：', appIdSample:'yahooAppId: 您的 Yahoo AppID', searchFailAppId:'搜尋失敗。請檢查 AppID 設定與網路（CORS）。', yahooWarn:'注意：yahooAppId 可能會外洩。請勿在公開網站上使用。', googleWarn:'注意：googleMapsApiKey 可能會外洩。請勿在公開網站上使用。', googleKeyMissing:'未設定 googleMapsApiKey。請在外掛檢查器中新增以下行：', googleKeySample:'googleMapsApiKey: 您的 Google Maps API 金鑰', manageSecretWarn:'注意：在此填寫的 geminiApiKey: 和 yahooAppId: 會隨專案儲存並發布給所有網站訪客。',
    camsTitle:'相機預設', camHelp:'cam:標題|緯度|經度<br>cam:標題|緯度|經度|h=高度m<br>cam:標題|緯度|經度|h=高度|d=方位&deg;|p=俯仰&deg;<br><br>例: cam:東京車站|35.6812|139.7671<br>例: cam:富士山|35.3606|138.7274|h=5000|p=-30<br><br>未指定的參數將維持目前相機設定', currentCamera:'目前相機', positionLabel:'位置', hprLabel:'航向/俯仰/橫滾', flyToTitle:'飛往 {v}',
    terrain:'地形', shadow:'陰影', depthTest:'深度測試', on:'開', off:'關', geojsonDrape:'GeoJSON 3D 貼地',
    start:'開始', stop:'結束', current:'目前', apply:'套用', sentCurrent:'已傳送（已設定目前時間）', sent:'已傳送', sendFailed:'傳送失敗',
    legendTitle:'圖例', legendInstr:'在檢查器文字中新增 "legend: 圖片URL"。', legendMain:'主圖',
    attrTitle:'屬性', noFeature:'未選擇圖徵。', noAttrAvail:'沒有屬性或已取消選擇圖徵。', backToAttrList:'返回屬性清單', openNewTab:'在新分頁開啟（繞過沙箱）',
    selectLayer:'選擇圖層', attrOrValuePh:'按屬性或值搜尋', selectLayerPrompt:'請選擇圖層', countFmt:'{rows} 項 / {attrs} 個屬性', sortTitle:'點擊排序', noMatchingFeatures:'沒有符合的圖徵', clickToFly:'點擊移動', limitSuffix:' （最多顯示 {n} 項）', closeAria:'關閉',
    noUrlConfigured: '未設定 URL',
    tabFly: '飛行',
    flyRoute: '路線', flyRoutePh: '選擇路線', flyDraw: '繪製', flyDrawing: '繪製中 — 點擊地圖新增點，雙擊結束', flyCancelDraw: '取消', flyDelete: '刪除', flySaveGeo: '儲存', flySaved: '已儲存',
    flyPlay: '播放', flyPause: '暫停', flyStop: '停止', flyRestart: '重新開始',
    flySpeedLbl: '速度 (km/h)', flyHeightLbl: '離地高度 (m)', flyPitchLbl: '俯仰角 (°)', flyLoop: '循環', flyView: '視角', flyViewCam: '搭乘', flyViewCenter: '空拍',
    flyPreset: '預設', flyPresetCustom: '自訂', flyPresetWalk: '步行 (h2 s5 p-5)', flyPresetDrive: '車載 (h2 s60 p-10)', flyPresetDrone: '無人機 (h200 s60 p-30)', flyPresetOverview: '廣域 (h1000 s300 p-45)', flyReverse: '反轉', flyImport: '匯入',
 flyBack: '◀ 逆再生', flyBackHint: 'ルートを逆方向に再生/一時停止',
 flyDblHint: '地図をダブルクリック: 再生/一時停止 · 右ダブルクリック: 逆再生 · ホイール: 速度',
    flyShowLine: '顯示路線', flyLoading: '正在載入路線...', flySampling: '正在取樣地形...', flyDone: '已完成', flyErr: '路線載入失敗', flyNoRoute: '未選擇路線',
    flyViewHint: '搭乘: 相機沿路線前進並朝向前方。空拍: 相機從後方上空追蹤移動點。',
    flyHelp: 'fly_geojson:名稱|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera(=pov)=沿路線前進、朝向前方的搭乘視角 / center(=chase)=從後方上空追蹤移動點的空拍視角。<br>參數修改即時生效，飛行中也可調整。<br>或按「繪製」在地圖上畫出折線。',
    svOpen: '街景', captureBtn: '截圖', capturedHint: '在圖片上按右鍵儲存'
  },
  ko: {
    minimize:'최소화', restore:'복원', move:'이동', moveCamera:'카메라 이동',
    tabLayers:'레이어', tabLegend:'범례', tabSearch:'검색', tabCams:'카메라', tabInfo:'정보', tabShare:'공유', tabSet:'설정', tabAttr:'속성', tabDisplay:'표시', manageTitle:'관리', manageInspectorLbl:'설정 텍스트', manageApply:'적용', manageApplied:'적용됨', importTitle:'파일 가져오기', importAddFile:'파일 추가', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'레이어', note:'주의', refresh:'새로고침', refreshTitle:'사용자 레이어 강제 새로고침',
    generateLink:'링크 생성', generating:'생성 중...', copy:'복사', copied:'복사됨!',
    sharePasteLabel:'아래에 URL을 붙여넣으세요.', sharePastePh:'URL 또는 ?lat=... 붙여넣기', load:'불러오기', loaded:'불러옴!', invalidData:'잘못된 데이터', parseError:'파싱 오류', error:'오류',
    shareReadUrl:'현재 URL 파라미터로 이동', urlLoadFlyTo:'URL 불러오기 & 이동', loading:'불러오는 중...',
    shareFlyCurrentLabel:'현재 위치에서 이동', flyToCurrentLoc:'현재 위치로 이동', getting:'가져오는 중...', restored:'복원됨!', noLatLng:'위경도 없음', noParams:'파라미터 없음', imported:'가져옴!',
    vectorSearch:'벡터 검색', allSelect:'전체 선택', selectValue:'값 선택', fly:'이동', textSearchPh:'텍스트로 검색', searchGo:'검색', updateVector:'벡터 데이터 업데이트', attrValueList:'속성·값 목록', attrsLoaded:'{n}개 속성을 불러왔습니다', noAttrVector:'속성이 있는 벡터 레이어가 없습니다', noMatch:'일치 없음',
    addrSearch:'주소 검색', providerGsi:'지리원', searchPh:'검색어 입력', searching:'검색 중...', noResults:'결과 없음', searchFailCors:'검색에 실패했습니다. 네트워크(CORS)를 확인하세요.', appIdMissing:'AppID가 설정되어 있지 않습니다. 플러그인 인스펙터에 다음 줄을 추가하세요:', appIdSample:'yahooAppId: Yahoo AppID 입력', searchFailAppId:'검색에 실패했습니다. AppID 설정과 네트워크(CORS)를 확인하세요.', yahooWarn:'주의: yahooAppId가 노출될 수 있습니다. 공개 사이트에서는 사용하지 마세요.', googleWarn:'주의: googleMapsApiKey가 노출될 수 있습니다. 공개 사이트에서는 사용하지 마세요.', googleKeyMissing:'googleMapsApiKey가 설정되어 있지 않습니다. 플러그인 인스펙터에 다음 줄을 추가하세요:', googleKeySample:'googleMapsApiKey: Google Maps API 키 입력', manageSecretWarn:'주의: 여기에 입력한 geminiApiKey: 및 yahooAppId: 는 프로젝트와 함께 저장되어 공개 사이트의 모든 방문자에게 배포됩니다.',
    camsTitle:'카메라 프리셋', camHelp:'cam:제목|위도|경도<br>cam:제목|위도|경도|h=고도m<br>cam:제목|위도|경도|h=고도|d=방위&deg;|p=기울기&deg;<br><br>예: cam:도쿄역|35.6812|139.7671<br>예: cam:후지산|35.3606|138.7274|h=5000|p=-30<br><br>지정하지 않은 파라미터는 현재 카메라 설정을 유지', currentCamera:'현재 카메라', positionLabel:'위치', hprLabel:'방위/기울기/회전', flyToTitle:'{v}(으)로 이동',
    terrain:'지형', shadow:'그림자', depthTest:'깊이 테스트', on:'켜기', off:'끄기', geojsonDrape:'GeoJSON 3D 드레이프',
    start:'시작', stop:'종료', current:'현재', apply:'적용', sentCurrent:'전송됨(현재 시간 설정)', sent:'전송됨', sendFailed:'전송 실패',
    legendTitle:'범례', legendInstr:'인스펙터 텍스트에 "legend: 이미지URL"을 추가하세요.', legendMain:'메인',
    attrTitle:'속성', noFeature:'선택된 피처가 없습니다.', noAttrAvail:'속성이 없거나 피처 선택이 해제되었습니다.', backToAttrList:'속성 목록으로 돌아가기', openNewTab:'새 탭에서 열기(샌드박스 우회)',
    selectLayer:'레이어 선택', attrOrValuePh:'속성 또는 값으로 검색', selectLayerPrompt:'레이어를 선택하세요', countFmt:'{rows}건 / {attrs}개 속성', sortTitle:'클릭하여 정렬', noMatchingFeatures:'일치하는 피처가 없습니다', clickToFly:'클릭하여 이동', limitSuffix:' (표시 상한 {n}건)', closeAria:'닫기',
    noUrlConfigured: 'URL이 설정되지 않았습니다',
    tabFly: '비행',
    flyRoute: '경로', flyRoutePh: '경로 선택', flyDraw: '그리기', flyDrawing: '그리는 중 — 지도를 클릭해 점 추가, 더블클릭으로 완료', flyCancelDraw: '취소', flyDelete: '삭제', flySaveGeo: '저장', flySaved: '저장됨',
    flyPlay: '재생', flyPause: '일시정지', flyStop: '정지', flyRestart: '처음부터',
    flySpeedLbl: '속도 (km/h)', flyHeightLbl: '지상고 (m)', flyPitchLbl: '피치 (°)', flyLoop: '반복', flyView: '시점', flyViewCam: '탑승', flyViewCenter: '항공',
    flyPreset: '프리셋', flyPresetCustom: '사용자 지정', flyPresetWalk: '도보 (h2 s5 p-5)', flyPresetDrive: '차량 (h2 s60 p-10)', flyPresetDrone: '드론 (h200 s60 p-30)', flyPresetOverview: '광역 (h1000 s300 p-45)', flyReverse: '반전', flyImport: '가져오기',
 flyBack: '◀ 역재생', flyBackHint: '경로를 역방향으로 재생/일시정지',
 flyDblHint: '지도 더블클릭: 재생/일시정지 · 오른쪽 더블클릭: 역재생 · 휘: 속도',
    flyShowLine: '경로 표시', flyLoading: '경로 로드 중...', flySampling: '지형 샘플링 중...', flyDone: '완료', flyErr: '경로 로드 실패', flyNoRoute: '경로가 선택되지 않았습니다',
    flyViewHint: '탑승: 경로 위를 전진하며 전방을 보는 시점. 항공: 후방 상공에서 이동 지점을 추적하는 시점.',
    flyHelp: 'fly_geojson:이름|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera(=pov)=경로 위를 전진하며 전방을 보는 탑승 시점 / center(=chase)=후방 상공에서 이동 지점을 추적하는 항공 시점.<br>입력값은 재생 중에도 즉시 반영됩니다.<br>또는 「그리기」 버튼으로 지도에 폴리라인을 그립니다.',
    svOpen: '스트리트 뷰', captureBtn: '캡처', capturedHint: '이미지를 우클릭해 저장'
  },
  es: {
    minimize:'Minimizar', restore:'Restaurar', move:'Mover', moveCamera:'Mover cámara',
    tabLayers:'Capas', tabLegend:'Leyenda', tabSearch:'Buscar', tabCams:'Cámaras', tabInfo:'Info', tabShare:'Compartir', tabSet:'Ajustes', tabAttr:'Atrib.', tabDisplay:'Vista', manageTitle:'Gestión', manageInspectorLbl:'Texto de configuración', manageApply:'Aplicar', manageApplied:'Aplicado', importTitle:'Importar archivo', importAddFile:'Agregar archivos', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Capas', note:'Nota', refresh:'Actualizar', refreshTitle:'Forzar actualización de capas de usuario',
    generateLink:'Generar enlace', generating:'Generando...', copy:'Copiar', copied:'¡Copiado!',
    sharePasteLabel:'Pega una URL abajo.', sharePastePh:'Pegar URL o ?lat=...', load:'Cargar', loaded:'¡Cargado!', invalidData:'Datos no válidos', parseError:'Error de análisis', error:'Error',
    shareReadUrl:'Ir a los parámetros de la URL actual', urlLoadFlyTo:'Cargar URL y volar', loading:'Cargando...',
    shareFlyCurrentLabel:'Mover desde la ubicación actual', flyToCurrentLoc:'Volar a la ubicación actual', getting:'Obteniendo...', restored:'¡Restaurado!', noLatLng:'Sin lat/lng', noParams:'Sin parámetros', imported:'¡Importado!',
    vectorSearch:'Búsqueda vectorial', allSelect:'Todo', selectValue:'Seleccionar valor', fly:'Volar', textSearchPh:'Buscar por texto', searchGo:'Buscar', updateVector:'Actualizar datos vectoriales', attrValueList:'Atributos y valores', attrsLoaded:'{n} atributos cargados', noAttrVector:'No hay capas vectoriales con atributos', noMatch:'Sin coincidencias',
    addrSearch:'Búsqueda de direcciones', providerGsi:'GSI', searchPh:'Introduce palabra clave', searching:'Buscando...', noResults:'Sin resultados', searchFailCors:'Búsqueda fallida. Revisa la red (CORS).', appIdMissing:'AppID no configurado. Añade la siguiente línea al inspector del plugin:', appIdSample:'yahooAppId: tu AppID de Yahoo', searchFailAppId:'Búsqueda fallida. Revisa el AppID y la red (CORS).', yahooWarn:'Nota: yahooAppId puede quedar expuesto. No usar en sitios públicos.', googleWarn:'Nota: googleMapsApiKey puede quedar expuesto. No usar en sitios públicos.', googleKeyMissing:'googleMapsApiKey no configurado. Añade la siguiente línea al inspector del plugin:', googleKeySample:'googleMapsApiKey: tu clave de API de Google Maps', manageSecretWarn:'Nota: geminiApiKey: y yahooAppId: escritos aquí se guardan con el proyecto y se publican a todos los visitantes del sitio.',
    camsTitle:'Preajustes de cámara', camHelp:'cam:Título|Lat|Lng<br>cam:Título|Lat|Lng|h=Altura(m)<br>cam:Título|Lat|Lng|h=Altura|d=Rumbo&deg;|p=Inclinación&deg;<br><br>Ej: cam:Estación de Tokio|35.6812|139.7671<br>Ej: cam:Monte Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Los parámetros no especificados mantienen la cámara actual', currentCamera:'Cámara actual', positionLabel:'Posición', hprLabel:'Rumbo/Inclinación/Balance', flyToTitle:'Volar a {v}',
    terrain:'Terreno', shadow:'Sombra', depthTest:'Prueba de profundidad', on:'SÍ', off:'NO', geojsonDrape:'Drapeado 3D GeoJSON',
    start:'Inicio', stop:'Fin', current:'Actual', apply:'Aplicar', sentCurrent:'Enviado (actual fijado)', sent:'Enviado', sendFailed:'Error al enviar',
    legendTitle:'Leyenda', legendInstr:'Añade "legend: URLdeImagen" al texto del inspector.', legendMain:'Principal',
    attrTitle:'Atributos', noFeature:'Ninguna entidad seleccionada.', noAttrAvail:'Sin atributos o entidad deseleccionada.', backToAttrList:'Volver a la lista', openNewTab:'Abrir en nueva pestaña (evitar sandbox)',
    selectLayer:'Seleccionar capa', attrOrValuePh:'Buscar atributos o valores', selectLayerPrompt:'Selecciona una capa', countFmt:'{rows} elementos / {attrs} atributos', sortTitle:'Clic para ordenar', noMatchingFeatures:'No hay entidades coincidentes', clickToFly:'Clic para volar', limitSuffix:' (máx. {n} mostrados)', closeAria:'Cerrar',
    noUrlConfigured: 'URL no configurada',
    tabFly: 'Vuelo',
    flyRoute: 'Ruta', flyRoutePh: 'Seleccionar ruta', flyDraw: 'Dibujar', flyDrawing: 'Dibujando — haga clic en el mapa para añadir puntos, doble clic para terminar', flyCancelDraw: 'Cancelar', flyDelete: 'Eliminar', flySaveGeo: 'Guardar', flySaved: '¡Guardado!',
    flyPlay: 'Reproducir', flyPause: 'Pausa', flyStop: 'Detener', flyRestart: 'Reiniciar',
    flySpeedLbl: 'Velocidad (km/h)', flyHeightLbl: 'Altura (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Bucle', flyView: 'Vista', flyViewCam: 'A bordo', flyViewCenter: 'Aérea',
    flyPreset: 'Preajuste', flyPresetCustom: 'Personalizado', flyPresetWalk: 'A pie (h2 s5 p-5)', flyPresetDrive: 'Coche (h2 s60 p-10)', flyPresetDrone: 'Dron (h200 s60 p-30)', flyPresetOverview: 'Panorámica (h1000 s300 p-45)', flyReverse: 'Invertir', flyImport: 'Importar',
 flyBack: '◀ Atrás', flyBackHint: 'Reproducir la ruta hacia atrás / pausar',
 flyDblHint: 'Doble clic en el mapa: reproducir/pausar · doble clic derecho: marcha atrás · rueda: velocidad',
    flyShowLine: 'Mostrar ruta', flyLoading: 'Cargando ruta...', flySampling: 'Muestreando terreno...', flyDone: 'Finalizado', flyErr: 'Error al cargar la ruta', flyNoRoute: 'No hay ruta seleccionada',
    flyViewHint: 'A bordo: la cámara avanza por la ruta mirando al frente. Aérea: la cámara sigue el punto en movimiento desde atrás y desde arriba.',
    flyHelp: 'fly_geojson:Nombre|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = vista a bordo que recorre la ruta; center (=chase) = vista aérea que sigue el punto desde atrás.<br>Los cambios se aplican de inmediato, incluso en vuelo.<br>O pulse Dibujar y trace una polilínea en el mapa.',
    svOpen: 'Street View', captureBtn: 'Capturar', capturedHint: 'Clic derecho en la imagen para guardar'
  },
  fr: {
    minimize:'Réduire', restore:'Restaurer', move:'Déplacer', moveCamera:'Déplacer la caméra',
    tabLayers:'Couches', tabLegend:'Légende', tabSearch:'Recherche', tabCams:'Caméras', tabInfo:'Info', tabShare:'Partager', tabSet:'Réglages', tabAttr:'Attr.', tabDisplay:'Affichage', manageTitle:'Gestion', manageInspectorLbl:'Texte de configuration', manageApply:'Appliquer', manageApplied:'Appliqué', importTitle:'Importer un fichier', importAddFile:'Ajouter des fichiers', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Couches', note:'Note', refresh:'Actualiser', refreshTitle:'Forcer l’actualisation des couches',
    generateLink:'Générer le lien', generating:'Génération...', copy:'Copier', copied:'Copié !',
    sharePasteLabel:'Collez une URL ci-dessous.', sharePastePh:'Coller URL ou ?lat=...', load:'Charger', loaded:'Chargé !', invalidData:'Données invalides', parseError:'Erreur d’analyse', error:'Erreur',
    shareReadUrl:'Aller aux paramètres de l’URL actuelle', urlLoadFlyTo:'Charger l’URL et voler', loading:'Chargement...',
    shareFlyCurrentLabel:'Déplacer depuis la position actuelle', flyToCurrentLoc:'Vol vers la position actuelle', getting:'Obtention...', restored:'Restauré !', noLatLng:'Pas de lat/lng', noParams:'Pas de paramètres', imported:'Importé !',
    vectorSearch:'Recherche vectorielle', allSelect:'Tout', selectValue:'Choisir une valeur', fly:'Voler', textSearchPh:'Recherche par texte', searchGo:'Rechercher', updateVector:'Mettre à jour les données vectorielles', attrValueList:'Attributs et valeurs', attrsLoaded:'{n} attributs chargés', noAttrVector:'Aucune couche vectorielle avec attributs', noMatch:'Aucun résultat',
    addrSearch:'Recherche d’adresse', providerGsi:'GSI', searchPh:'Saisir un mot-clé', searching:'Recherche...', noResults:'Aucun résultat', searchFailCors:'Échec de la recherche. Vérifiez le réseau (CORS).', appIdMissing:'AppID non défini. Ajoutez la ligne suivante à l’inspecteur du plugin :', appIdSample:'yahooAppId : votre AppID Yahoo', searchFailAppId:'Échec de la recherche. Vérifiez l’AppID et le réseau (CORS).', yahooWarn:'Note : yahooAppId peut être exposé. Ne pas utiliser sur des sites publics.', googleWarn:'Note : googleMapsApiKey peut être exposé. Ne pas utiliser sur des sites publics.', googleKeyMissing:'googleMapsApiKey non défini. Ajoutez la ligne suivante à l’inspecteur du plugin :', googleKeySample:'googleMapsApiKey : votre clé API Google Maps', manageSecretWarn:'Note : les lignes geminiApiKey: et yahooAppId: écrites ici sont enregistrées avec le projet et publiées à tous les visiteurs du site.',
    camsTitle:'Préréglages caméra', camHelp:'cam:Titre|Lat|Lng<br>cam:Titre|Lat|Lng|h=Altitude(m)<br>cam:Titre|Lat|Lng|h=Altitude|d=Cap&deg;|p=Inclinaison&deg;<br><br>Ex : cam:Gare de Tokyo|35.6812|139.7671<br>Ex : cam:Mont Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Les paramètres non spécifiés conservent les réglages actuels', currentCamera:'Caméra actuelle', positionLabel:'Position', hprLabel:'Cap/Inclinaison/Roulis', flyToTitle:'Vol vers {v}',
    terrain:'Terrain', shadow:'Ombre', depthTest:'Test de profondeur', on:'OUI', off:'NON', geojsonDrape:'Drapé 3D GeoJSON',
    start:'Début', stop:'Fin', current:'Actuel', apply:'Appliquer', sentCurrent:'Envoyé (actuel défini)', sent:'Envoyé', sendFailed:'Échec de l’envoi',
    legendTitle:'Légende', legendInstr:'Ajoutez "legend: URLimage" au texte de l’inspecteur.', legendMain:'Principal',
    attrTitle:'Attributs', noFeature:'Aucun objet sélectionné.', noAttrAvail:'Pas d’attributs ou objet désélectionné.', backToAttrList:'Retour à la liste', openNewTab:'Ouvrir dans un nouvel onglet (contourner le sandbox)',
    selectLayer:'Choisir une couche', attrOrValuePh:'Rechercher attributs ou valeurs', selectLayerPrompt:'Veuillez choisir une couche', countFmt:'{rows} éléments / {attrs} attributs', sortTitle:'Cliquer pour trier', noMatchingFeatures:'Aucun objet correspondant', clickToFly:'Cliquer pour voler', limitSuffix:' (affichage limité à {n})', closeAria:'Fermer',
    noUrlConfigured: 'Aucune URL configurée',
    tabFly: 'Vol',
    flyRoute: 'Route', flyRoutePh: 'Sélectionner une route', flyDraw: 'Dessiner', flyDrawing: 'Dessin — cliquez sur la carte pour ajouter des points, double-clic pour terminer', flyCancelDraw: 'Annuler', flyDelete: 'Supprimer', flySaveGeo: 'Enregistrer', flySaved: 'Enregistré !',
    flyPlay: 'Lecture', flyPause: 'Pause', flyStop: 'Arrêter', flyRestart: 'Recommencer',
    flySpeedLbl: 'Vitesse (km/h)', flyHeightLbl: 'Hauteur (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Boucle', flyView: 'Vue', flyViewCam: 'Embarquée', flyViewCenter: 'Aérienne',
    flyPreset: 'Préréglage', flyPresetCustom: 'Personnalisé', flyPresetWalk: 'À pied (h2 s5 p-5)', flyPresetDrive: 'Voiture (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Vue large (h1000 s300 p-45)', flyReverse: 'Inverser', flyImport: 'Importer',
 flyBack: '◀ Arrière', flyBackHint: 'Lecture arrière / pause',
 flyDblHint: 'Double-clic sur la carte : lecture/pause · double-clic droit : marche arrière · molette : vitesse',
    flyShowLine: 'Afficher la route', flyLoading: 'Chargement de la route...', flySampling: 'Échantillonnage du terrain...', flyDone: 'Terminé', flyErr: 'Échec du chargement de la route', flyNoRoute: 'Aucune route sélectionnée',
    flyViewHint: 'Embarquée : la caméra parcourt la route en regardant devant. Aérienne : la caméra suit le point mobile par l’arrière et par le haut.',
    flyHelp: 'fly_geojson:Nom|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = vue embarquée qui parcourt la route ; center (=chase) = vue aérienne qui suit le point par l’arrière.<br>Les réglages s’appliquent immédiatement, même en vol.<br>Ou appuyez sur Dessiner et tracez une polyligne sur la carte.',
    svOpen: 'Street View', captureBtn: 'Capturer', capturedHint: 'Clic droit sur l\u2019image pour enregistrer'
  },
  de: {
    minimize:'Minimieren', restore:'Wiederherstellen', move:'Verschieben', moveCamera:'Kamera bewegen',
    tabLayers:'Layer', tabLegend:'Legende', tabSearch:'Suche', tabCams:'Kameras', tabInfo:'Info', tabShare:'Teilen', tabSet:'Einst.', tabAttr:'Attr.', tabDisplay:'Anzeige', manageTitle:'Verwaltung', manageInspectorLbl:'Einstellungstext', manageApply:'Anwenden', manageApplied:'Angewendet', importTitle:'Datei importieren', importAddFile:'Dateien hinzufügen', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Layer', note:'Hinweis', refresh:'Aktualisieren', refreshTitle:'Benutzer-Layer neu laden',
    generateLink:'Link erzeugen', generating:'Erzeuge...', copy:'Kopieren', copied:'Kopiert!',
    sharePasteLabel:'URL unten einfügen.', sharePastePh:'URL oder ?lat=... einfügen', load:'Laden', loaded:'Geladen!', invalidData:'Ungültige Daten', parseError:'Parse-Fehler', error:'Fehler',
    shareReadUrl:'Zu aktuellen URL-Parametern wechseln', urlLoadFlyTo:'URL laden & anfliegen', loading:'Laden...',
    shareFlyCurrentLabel:'Vom aktuellen Standort bewegen', flyToCurrentLoc:'Zum aktuellen Standort fliegen', getting:'Abrufen...', restored:'Wiederhergestellt!', noLatLng:'Kein Lat/Lng', noParams:'Keine Parameter', imported:'Importiert!',
    vectorSearch:'Vektorsuche', allSelect:'Alle', selectValue:'Wert wählen', fly:'Fliegen', textSearchPh:'Nach Text suchen', searchGo:'Suchen', updateVector:'Vektordaten aktualisieren', attrValueList:'Attribute & Werte', attrsLoaded:'{n} Attribute geladen', noAttrVector:'Keine Vektor-Layer mit Attributen', noMatch:'Kein Treffer',
    addrSearch:'Adresssuche', providerGsi:'GSI', searchPh:'Suchbegriff eingeben', searching:'Suche...', noResults:'Keine Ergebnisse', searchFailCors:'Suche fehlgeschlagen. Netzwerk (CORS) prüfen.', appIdMissing:'AppID nicht gesetzt. Fügen Sie folgende Zeile im Plugin-Inspektor hinzu:', appIdSample:'yahooAppId: Ihre Yahoo-AppID', searchFailAppId:'Suche fehlgeschlagen. AppID und Netzwerk (CORS) prüfen.', yahooWarn:'Hinweis: yahooAppId könnte offengelegt werden. Nicht auf öffentlichen Seiten verwenden.', googleWarn:'Hinweis: googleMapsApiKey könnte offengelegt werden. Nicht auf öffentlichen Seiten verwenden.', googleKeyMissing:'googleMapsApiKey nicht gesetzt. Fügen Sie folgende Zeile im Plugin-Inspektor hinzu:', googleKeySample:'googleMapsApiKey: Ihr Google-Maps-API-Schlüssel', manageSecretWarn:'Hinweis: Hier eingetragene geminiApiKey: und yahooAppId: werden mit dem Projekt gespeichert und an alle Besucher der Site veröffentlicht.',
    camsTitle:'Kamera-Voreinstellungen', camHelp:'cam:Titel|Lat|Lng<br>cam:Titel|Lat|Lng|h=Höhe(m)<br>cam:Titel|Lat|Lng|h=Höhe|d=Kurs&deg;|p=Neigung&deg;<br><br>Bsp.: cam:Bahnhof Tokio|35.6812|139.7671<br>Bsp.: cam:Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Nicht angegebene Parameter behalten die aktuellen Kameraeinstellungen', currentCamera:'Aktuelle Kamera', positionLabel:'Position', hprLabel:'Kurs/Neigung/Roll', flyToTitle:'Flug zu {v}',
    terrain:'Gelände', shadow:'Schatten', depthTest:'Tiefentest', on:'EIN', off:'AUS', geojsonDrape:'GeoJSON-3D-Drape',
    start:'Start', stop:'Ende', current:'Aktuell', apply:'Anwenden', sentCurrent:'Gesendet (aktuell gesetzt)', sent:'Gesendet', sendFailed:'Senden fehlgeschlagen',
    legendTitle:'Legende', legendInstr:'"legend: BildURL" zum Inspektor-Text hinzufügen.', legendMain:'Haupt',
    attrTitle:'Attribute', noFeature:'Kein Objekt ausgewählt.', noAttrAvail:'Keine Attribute oder Auswahl aufgehoben.', backToAttrList:'Zurück zur Liste', openNewTab:'In neuem Tab öffnen (Sandbox umgehen)',
    selectLayer:'Layer wählen', attrOrValuePh:'Attribute oder Werte suchen', selectLayerPrompt:'Bitte Layer wählen', countFmt:'{rows} Einträge / {attrs} Attribute', sortTitle:'Klicken zum Sortieren', noMatchingFeatures:'Keine passenden Objekte', clickToFly:'Klicken zum Anfliegen', limitSuffix:' (max. {n} angezeigt)', closeAria:'Schließen',
    noUrlConfigured: 'Keine URL konfiguriert',
    tabFly: 'Flug',
    flyRoute: 'Route', flyRoutePh: 'Route wählen', flyDraw: 'Zeichnen', flyDrawing: 'Zeichnen — auf die Karte klicken, um Punkte zu setzen, Doppelklick zum Beenden', flyCancelDraw: 'Abbrechen', flyDelete: 'Löschen', flySaveGeo: 'Speichern', flySaved: 'Gespeichert!',
    flyPlay: 'Abspielen', flyPause: 'Pause', flyStop: 'Stopp', flyRestart: 'Neustart',
    flySpeedLbl: 'Tempo (km/h)', flyHeightLbl: 'Höhe ü.Gr. (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Schleife', flyView: 'Ansicht', flyViewCam: 'Bord', flyViewCenter: 'Luft',
    flyPreset: 'Voreinstellung', flyPresetCustom: 'Benutzerdef.', flyPresetWalk: 'Zu Fuß (h2 s5 p-5)', flyPresetDrive: 'Auto (h2 s60 p-10)', flyPresetDrone: 'Drohne (h200 s60 p-30)', flyPresetOverview: 'Überblick (h1000 s300 p-45)', flyReverse: 'Umkehren', flyImport: 'Importieren',
 flyBack: '◀ Zurück', flyBackHint: 'Route rückwärts abspielen / pausieren',
 flyDblHint: 'Doppelklick auf die Karte: Start/Pause · Doppel-Rechtsklick: rückwärts · Rad: Tempo',
    flyShowLine: 'Route anzeigen', flyLoading: 'Route wird geladen...', flySampling: 'Gelände wird abgetastet...', flyDone: 'Fertig', flyErr: 'Route konnte nicht geladen werden', flyNoRoute: 'Keine Route ausgewählt',
    flyViewHint: 'Bord: Kamera fährt auf der Route und blickt nach vorn. Luft: Kamera verfolgt den bewegten Punkt von hinten und oben.',
    flyHelp: 'fly_geojson:Name|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = Bordansicht auf der Route nach vorn; center (=chase) = Luftansicht, die den Punkt von hinten verfolgt.<br>Änderungen wirken sofort, auch während des Flugs.<br>Oder mit „Zeichnen“ eine Polylinie auf der Karte skizzieren.',
    svOpen: 'Street View', captureBtn: 'Aufnehmen', capturedHint: 'Bild per Rechtsklick speichern'
  },
  it: {
    minimize:'Riduci', restore:'Ripristina', move:'Sposta', moveCamera:'Sposta camera',
    tabLayers:'Layer', tabLegend:'Legenda', tabSearch:'Cerca', tabCams:'Camere', tabInfo:'Info', tabShare:'Condividi', tabSet:'Impost.', tabAttr:'Attr.', tabDisplay:'Vista', manageTitle:'Gestione', manageInspectorLbl:'Testo di configurazione', manageApply:'Applica', manageApplied:'Applicato', importTitle:'Importa file', importAddFile:'Aggiungi file', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Layer', note:'Nota', refresh:'Aggiorna', refreshTitle:'Forza aggiornamento layer utente',
    generateLink:'Genera link', generating:'Generazione...', copy:'Copia', copied:'Copiato!',
    sharePasteLabel:'Incolla un URL qui sotto.', sharePastePh:'Incolla URL o ?lat=...', load:'Carica', loaded:'Caricato!', invalidData:'Dati non validi', parseError:'Errore di parsing', error:'Errore',
    shareReadUrl:'Vai ai parametri URL correnti', urlLoadFlyTo:'Carica URL e vola', loading:'Caricamento...',
    shareFlyCurrentLabel:'Sposta dalla posizione corrente', flyToCurrentLoc:'Vola alla posizione corrente', getting:'Recupero...', restored:'Ripristinato!', noLatLng:'Nessun lat/lng', noParams:'Nessun parametro', imported:'Importato!',
    vectorSearch:'Ricerca vettoriale', allSelect:'Tutto', selectValue:'Seleziona valore', fly:'Vola', textSearchPh:'Cerca per testo', searchGo:'Cerca', updateVector:'Aggiorna dati vettoriali', attrValueList:'Attributi e valori', attrsLoaded:'{n} attributi caricati', noAttrVector:'Nessun layer vettoriale con attributi', noMatch:'Nessuna corrispondenza',
    addrSearch:'Ricerca indirizzi', providerGsi:'GSI', searchPh:'Inserisci parola chiave', searching:'Ricerca...', noResults:'Nessun risultato', searchFailCors:'Ricerca fallita. Controlla la rete (CORS).', appIdMissing:'AppID non configurato. Aggiungi la riga seguente nell’ispettore del plugin:', appIdSample:'yahooAppId: il tuo AppID Yahoo', searchFailAppId:'Ricerca fallita. Controlla AppID e rete (CORS).', yahooWarn:'Nota: yahooAppId potrebbe essere esposto. Non usare su siti pubblici.', googleWarn:'Nota: googleMapsApiKey potrebbe essere esposto. Non usare su siti pubblici.', googleKeyMissing:'googleMapsApiKey non configurato. Aggiungi la riga seguente nell’ispettore del plugin:', googleKeySample:'googleMapsApiKey: la tua chiave API di Google Maps', manageSecretWarn:'Nota: geminiApiKey: e yahooAppId: scritti qui vengono salvati con il progetto e pubblicati a tutti i visitatori del sito.',
    camsTitle:'Preset camera', camHelp:'cam:Titolo|Lat|Lng<br>cam:Titolo|Lat|Lng|h=Altezza(m)<br>cam:Titolo|Lat|Lng|h=Altezza|d=Direzione&deg;|p=Inclinazione&deg;<br><br>Es: cam:Stazione di Tokyo|35.6812|139.7671<br>Es: cam:Monte Fuji|35.3606|138.7274|h=5000|p=-30<br><br>I parametri non specificati mantengono le impostazioni attuali', currentCamera:'Camera corrente', positionLabel:'Posizione', hprLabel:'Direzione/Inclinazione/Rollio', flyToTitle:'Vola a {v}',
    terrain:'Terreno', shadow:'Ombra', depthTest:'Test profondità', on:'SÌ', off:'NO', geojsonDrape:'Drappeggio 3D GeoJSON',
    start:'Inizio', stop:'Fine', current:'Corrente', apply:'Applica', sentCurrent:'Inviato (corrente impostato)', sent:'Inviato', sendFailed:'Invio fallito',
    legendTitle:'Legenda', legendInstr:'Aggiungi "legend: URLimmagine" al testo dell’ispettore.', legendMain:'Principale',
    attrTitle:'Attributi', noFeature:'Nessun elemento selezionato.', noAttrAvail:'Nessun attributo o selezione rimossa.', backToAttrList:'Torna all’elenco', openNewTab:'Apri in nuova scheda (aggira sandbox)',
    selectLayer:'Seleziona layer', attrOrValuePh:'Cerca attributi o valori', selectLayerPrompt:'Seleziona un layer', countFmt:'{rows} elementi / {attrs} attributi', sortTitle:'Clicca per ordinare', noMatchingFeatures:'Nessun elemento corrispondente', clickToFly:'Clicca per volare', limitSuffix:' (max {n} mostrati)', closeAria:'Chiudi',
    noUrlConfigured: 'URL non configurato',
    tabFly: 'Volo',
    flyRoute: 'Percorso', flyRoutePh: 'Seleziona percorso', flyDraw: 'Disegna', flyDrawing: 'Disegno — clicca sulla mappa per aggiungere punti, doppio clic per terminare', flyCancelDraw: 'Annulla', flyDelete: 'Elimina', flySaveGeo: 'Salva', flySaved: 'Salvato!',
    flyPlay: 'Riproduci', flyPause: 'Pausa', flyStop: 'Ferma', flyRestart: 'Riavvia',
    flySpeedLbl: 'Velocità (km/h)', flyHeightLbl: 'Quota (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Ciclo', flyView: 'Vista', flyViewCam: 'A bordo', flyViewCenter: 'Aerea',
    flyPreset: 'Predefinito', flyPresetCustom: 'Personalizzato', flyPresetWalk: 'A piedi (h2 s5 p-5)', flyPresetDrive: 'Auto (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Panoramica (h1000 s300 p-45)', flyReverse: 'Inverti', flyImport: 'Importa',
 flyBack: '◀ Indietro', flyBackHint: 'Riproduci in direzione inversa / pausa',
 flyDblHint: 'Doppio clic sulla mappa: riproduci/pausa · doppio clic destro: riavvolgi · rotella: velocità',
    flyShowLine: 'Mostra percorso', flyLoading: 'Caricamento percorso...', flySampling: 'Campionamento terreno...', flyDone: 'Completato', flyErr: 'Caricamento del percorso non riuscito', flyNoRoute: 'Nessun percorso selezionato',
    flyViewHint: 'A bordo: la camera avanza sul percorso guardando avanti. Aerea: la camera insegue il punto mobile da dietro e dall’alto.',
    flyHelp: 'fly_geojson:Nome|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = vista a bordo che percorre la rotta; center (=chase) = vista aerea che segue il punto da dietro.<br>Le modifiche si applicano subito, anche in volo.<br>Oppure premi Disegna e traccia una polilinea sulla mappa.',
    svOpen: 'Street View', captureBtn: 'Cattura', capturedHint: 'Tasto destro sull\u2019immagine per salvare'
  },
  pt: {
    minimize:'Minimizar', restore:'Restaurar', move:'Mover', moveCamera:'Mover câmera',
    tabLayers:'Camadas', tabLegend:'Legenda', tabSearch:'Buscar', tabCams:'Câmeras', tabInfo:'Info', tabShare:'Partilhar', tabSet:'Ajustes', tabAttr:'Atr.', tabDisplay:'Exibição', manageTitle:'Gestão', manageInspectorLbl:'Texto de configuração', manageApply:'Aplicar', manageApplied:'Aplicado', importTitle:'Importar arquivo', importAddFile:'Adicionar arquivos', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Camadas', note:'Nota', refresh:'Atualizar', refreshTitle:'Forçar atualização das camadas',
    generateLink:'Gerar link', generating:'Gerando...', copy:'Copiar', copied:'Copiado!',
    sharePasteLabel:'Cole uma URL abaixo.', sharePastePh:'Colar URL ou ?lat=...', load:'Carregar', loaded:'Carregado!', invalidData:'Dados inválidos', parseError:'Erro de análise', error:'Erro',
    shareReadUrl:'Ir para os parâmetros da URL atual', urlLoadFlyTo:'Carregar URL e voar', loading:'Carregando...',
    shareFlyCurrentLabel:'Mover da localização atual', flyToCurrentLoc:'Voar para localização atual', getting:'Obtendo...', restored:'Restaurado!', noLatLng:'Sem lat/lng', noParams:'Sem parâmetros', imported:'Importado!',
    vectorSearch:'Busca vetorial', allSelect:'Todos', selectValue:'Selecionar valor', fly:'Voar', textSearchPh:'Buscar por texto', searchGo:'Buscar', updateVector:'Atualizar dados vetoriais', attrValueList:'Atributos e valores', attrsLoaded:'{n} atributos carregados', noAttrVector:'Nenhuma camada vetorial com atributos', noMatch:'Sem correspondência',
    addrSearch:'Busca de endereço', providerGsi:'GSI', searchPh:'Digite a palavra-chave', searching:'Buscando...', noResults:'Sem resultados', searchFailCors:'Falha na busca. Verifique a rede (CORS).', appIdMissing:'AppID não configurado. Adicione a linha a seguir ao inspetor do plugin:', appIdSample:'yahooAppId: seu AppID do Yahoo', searchFailAppId:'Falha na busca. Verifique o AppID e a rede (CORS).', yahooWarn:'Nota: o yahooAppId pode ser exposto. Não use em sites públicos.', googleWarn:'Nota: o googleMapsApiKey pode ser exposto. Não use em sites públicos.', googleKeyMissing:'googleMapsApiKey não configurado. Adicione a linha a seguir ao inspetor do plugin:', googleKeySample:'googleMapsApiKey: sua chave de API do Google Maps', manageSecretWarn:'Nota: geminiApiKey: e yahooAppId: escritos aqui são guardados com o projeto e publicados para todos os visitantes do site.',
    camsTitle:'Predefinições de câmera', camHelp:'cam:Título|Lat|Lng<br>cam:Título|Lat|Lng|h=Altura(m)<br>cam:Título|Lat|Lng|h=Altura|d=Direção&deg;|p=Inclinação&deg;<br><br>Ex: cam:Estação de Tóquio|35.6812|139.7671<br>Ex: cam:Monte Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Parâmetros não especificados mantêm as configurações atuais', currentCamera:'Câmera atual', positionLabel:'Posição', hprLabel:'Direção/Inclinação/Rolagem', flyToTitle:'Voar para {v}',
    terrain:'Terreno', shadow:'Sombra', depthTest:'Teste de profundidade', on:'SIM', off:'NÃO', geojsonDrape:'Drapeado 3D GeoJSON',
    start:'Início', stop:'Fim', current:'Atual', apply:'Aplicar', sentCurrent:'Enviado (atual definido)', sent:'Enviado', sendFailed:'Falha ao enviar',
    legendTitle:'Legenda', legendInstr:'Adicione "legend: URLdaImagem" ao texto do inspetor.', legendMain:'Principal',
    attrTitle:'Atributos', noFeature:'Nenhum elemento selecionado.', noAttrAvail:'Sem atributos ou elemento desmarcado.', backToAttrList:'Voltar à lista', openNewTab:'Abrir em nova aba (contornar sandbox)',
    selectLayer:'Selecionar camada', attrOrValuePh:'Buscar atributos ou valores', selectLayerPrompt:'Selecione uma camada', countFmt:'{rows} itens / {attrs} atributos', sortTitle:'Clique para ordenar', noMatchingFeatures:'Nenhum elemento correspondente', clickToFly:'Clique para voar', limitSuffix:' (mostrando até {n})', closeAria:'Fechar',
    noUrlConfigured: 'URL não configurada',
    tabFly: 'Voo',
    flyRoute: 'Rota', flyRoutePh: 'Selecionar rota', flyDraw: 'Desenhar', flyDrawing: 'Desenhando — clique no mapa para adicionar pontos, clique duplo para terminar', flyCancelDraw: 'Cancelar', flyDelete: 'Excluir', flySaveGeo: 'Guardar', flySaved: 'Guardado!',
    flyPlay: 'Reproduzir', flyPause: 'Pausar', flyStop: 'Parar', flyRestart: 'Reiniciar',
    flySpeedLbl: 'Velocidade (km/h)', flyHeightLbl: 'Altura (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Loop', flyView: 'Vista', flyViewCam: 'A bordo', flyViewCenter: 'Aérea',
    flyPreset: 'Predefinição', flyPresetCustom: 'Personalizado', flyPresetWalk: 'A pé (h2 s5 p-5)', flyPresetDrive: 'Carro (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Panorâmica (h1000 s300 p-45)', flyReverse: 'Inverter', flyImport: 'Importar',
 flyBack: '◀ Recuar', flyBackHint: 'Reproduzir a rota para trás / pausar',
 flyDblHint: 'Duplo clique no mapa: reproduzir/pausar · duplo clique direito: retroceder · roda: velocidade',
    flyShowLine: 'Mostrar rota', flyLoading: 'Carregando rota...', flySampling: 'Amostrando terreno...', flyDone: 'Concluído', flyErr: 'Falha ao carregar a rota', flyNoRoute: 'Nenhuma rota selecionada',
    flyViewHint: 'A bordo: a câmera avança pela rota olhando à frente. Aérea: a câmera segue o ponto em movimento por trás e por cima.',
    flyHelp: 'fly_geojson:Nome|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = vista a bordo percorrendo a rota; center (=chase) = vista aérea que segue o ponto por trás.<br>As alterações aplicam-se de imediato, mesmo em voo.<br>Ou pressione Desenhar e esboce uma polilinha no mapa.',
    svOpen: 'Street View', captureBtn: 'Capturar', capturedHint: 'Clique com o botão direito na imagem para salvar'
  },
  ru: {
    minimize:'Свернуть', restore:'Восстановить', move:'Переместить', moveCamera:'Переместить камеру',
    tabLayers:'Слои', tabLegend:'Легенда', tabSearch:'Поиск', tabCams:'Камеры', tabInfo:'Инфо', tabShare:'Поделиться', tabSet:'Настр.', tabAttr:'Атр.', tabDisplay:'Вид', manageTitle:'Управление', manageInspectorLbl:'Текст настроек', manageApply:'Применить', manageApplied:'Применено', importTitle:'Импорт файла', importAddFile:'Добавить файлы', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Слои', note:'Примечание', refresh:'Обновить', refreshTitle:'Принудительно обновить слои',
    generateLink:'Создать ссылку', generating:'Создание...', copy:'Копировать', copied:'Скопировано!',
    sharePasteLabel:'Вставьте URL ниже.', sharePastePh:'Вставить URL или ?lat=...', load:'Загрузить', loaded:'Загружено!', invalidData:'Неверные данные', parseError:'Ошибка разбора', error:'Ошибка',
    shareReadUrl:'Перейти к параметрам текущего URL', urlLoadFlyTo:'Загрузить URL и перейти', loading:'Загрузка...',
    shareFlyCurrentLabel:'Переместиться от текущего положения', flyToCurrentLoc:'К текущему положению', getting:'Получение...', restored:'Восстановлено!', noLatLng:'Нет координат', noParams:'Нет параметров', imported:'Импортировано!',
    vectorSearch:'Векторный поиск', allSelect:'Все', selectValue:'Выберите значение', fly:'Перейти', textSearchPh:'Поиск по тексту', searchGo:'Поиск', updateVector:'Обновить векторные данные', attrValueList:'Атрибуты и значения', attrsLoaded:'Загружено атрибутов: {n}', noAttrVector:'Нет векторных слоёв с атрибутами', noMatch:'Нет совпадений',
    addrSearch:'Поиск адреса', providerGsi:'GSI', searchPh:'Введите ключевое слово', searching:'Поиск...', noResults:'Нет результатов', searchFailCors:'Поиск не удался. Проверьте сеть (CORS).', appIdMissing:'AppID не задан. Добавьте следующую строку в инспектор плагина:', appIdSample:'yahooAppId: ваш Yahoo AppID', searchFailAppId:'Поиск не удался. Проверьте AppID и сеть (CORS).', yahooWarn:'Внимание: yahooAppId может быть раскрыт. Не используйте на публичных сайтах.', googleWarn:'Внимание: googleMapsApiKey может быть раскрыт. Не используйте на публичных сайтах.', googleKeyMissing:'googleMapsApiKey не задан. Добавьте следующую строку в инспектор плагина:', googleKeySample:'googleMapsApiKey: ваш ключ API Google Maps', manageSecretWarn:'Примечание: указанные здесь geminiApiKey: и yahooAppId: сохраняются в проекте и публикуются для всех посетителей сайта.',
    camsTitle:'Предустановки камеры', camHelp:'cam:Название|Широта|Долгота<br>cam:Название|Широта|Долгота|h=Высота(м)<br>cam:Название|Широта|Долгота|h=Высота|d=Азимут&deg;|p=Наклон&deg;<br><br>Пример: cam:Токийский вокзал|35.6812|139.7671<br>Пример: cam:Фудзи|35.3606|138.7274|h=5000|p=-30<br><br>Неуказанные параметры сохраняют текущие настройки камеры', currentCamera:'Текущая камера', positionLabel:'Позиция', hprLabel:'Азимут/Наклон/Крен', flyToTitle:'Перейти к {v}',
    terrain:'Рельеф', shadow:'Тень', depthTest:'Тест глубины', on:'ВКЛ', off:'ВЫКЛ', geojsonDrape:'3D-драпировка GeoJSON',
    start:'Начало', stop:'Конец', current:'Текущее', apply:'Применить', sentCurrent:'Отправлено (текущее задано)', sent:'Отправлено', sendFailed:'Ошибка отправки',
    legendTitle:'Легенда', legendInstr:'Добавьте "legend: URLизображения" в текст инспектора.', legendMain:'Основная',
    attrTitle:'Атрибуты', noFeature:'Объект не выбран.', noAttrAvail:'Нет атрибутов или выбор снят.', backToAttrList:'Назад к списку', openNewTab:'Открыть в новой вкладке (обход sandbox)',
    selectLayer:'Выберите слой', attrOrValuePh:'Поиск по атрибутам или значениям', selectLayerPrompt:'Выберите слой', countFmt:'{rows} записей / {attrs} атрибутов', sortTitle:'Нажмите для сортировки', noMatchingFeatures:'Нет подходящих объектов', clickToFly:'Нажмите для перехода', limitSuffix:' (показано до {n})', closeAria:'Закрыть',
    noUrlConfigured: 'URL не настроен',
    tabFly: 'Полёт',
    flyRoute: 'Маршрут', flyRoutePh: 'Выберите маршрут', flyDraw: 'Нарисовать', flyDrawing: 'Рисование — кликайте по карте для добавления точек, двойной клик для завершения', flyCancelDraw: 'Отмена', flyDelete: 'Удалить', flySaveGeo: 'Сохранить', flySaved: 'Сохранено!',
    flyPlay: 'Старт', flyPause: 'Пауза', flyStop: 'Стоп', flyRestart: 'Сначала',
    flySpeedLbl: 'Скорость (км/ч)', flyHeightLbl: 'Высота (м)', flyPitchLbl: 'Тангаж (°)', flyLoop: 'По кругу', flyView: 'Вид', flyViewCam: 'Борт', flyViewCenter: 'Аэро',
    flyPreset: 'Пресет', flyPresetCustom: 'Свой', flyPresetWalk: 'Пешком (h2 s5 p-5)', flyPresetDrive: 'Авто (h2 s60 p-10)', flyPresetDrone: 'Дрон (h200 s60 p-30)', flyPresetOverview: 'Обзор (h1000 s300 p-45)', flyReverse: 'Обратно', flyImport: 'Импорт',
 flyBack: '◀ Назад', flyBackHint: 'Воспроизвести маршрут назад / пауза',
 flyDblHint: 'Двойной клик по карте: старт/пауза · двойной правый клик: назад · колесо: скорость',
    flyShowLine: 'Показать маршрут', flyLoading: 'Загрузка маршрута...', flySampling: 'Замер рельефа...', flyDone: 'Завершено', flyErr: 'Не удалось загрузить маршрут', flyNoRoute: 'Маршрут не выбран',
    flyViewHint: 'Борт: камера движется по маршруту и смотрит вперёд. Аэро: камера следит за движущейся точкой сзади и сверху.',
    flyHelp: 'fly_geojson:Имя|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = вид с борта, движение по маршруту вперёд; center (=chase) = аэровид, слежение за точкой сзади.<br>Изменения применяются сразу, даже во время полёта.<br>Или нажмите «Нарисовать» и начертите ломаную на карте.',
    svOpen: 'Просмотр улиц', captureBtn: 'Снимок', capturedHint: 'Щёлкните изображение правой кнопкой, чтобы сохранить'
  },
  nl: {
    minimize:'Minimaliseren', restore:'Herstellen', move:'Verplaatsen', moveCamera:'Camera verplaatsen',
    tabLayers:'Lagen', tabLegend:'Legenda', tabSearch:'Zoeken', tabCams:'Camera’s', tabInfo:'Info', tabShare:'Delen', tabSet:'Inst.', tabAttr:'Attr.', tabDisplay:'Weergave', manageTitle:'Beheer', manageInspectorLbl:'Instellingentekst', manageApply:'Toepassen', manageApplied:'Toegepast', importTitle:'Bestand importeren', importAddFile:'Bestanden toevoegen', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Lagen', note:'Let op', refresh:'Vernieuwen', refreshTitle:'Gebruikerslagen geforceerd vernieuwen',
    generateLink:'Link genereren', generating:'Genereren...', copy:'Kopiëren', copied:'Gekopieerd!',
    sharePasteLabel:'Plak hieronder een URL.', sharePastePh:'Plak URL of ?lat=...', load:'Laden', loaded:'Geladen!', invalidData:'Ongeldige gegevens', parseError:'Parsefout', error:'Fout',
    shareReadUrl:'Naar huidige URL-parameters gaan', urlLoadFlyTo:'URL laden & heen vliegen', loading:'Laden...',
    shareFlyCurrentLabel:'Vanaf huidige locatie verplaatsen', flyToCurrentLoc:'Naar huidige locatie vliegen', getting:'Ophalen...', restored:'Hersteld!', noLatLng:'Geen lat/lng', noParams:'Geen parameters', imported:'Geïmporteerd!',
    vectorSearch:'Vectorzoeking', allSelect:'Alles', selectValue:'Kies waarde', fly:'Vliegen', textSearchPh:'Op tekst zoeken', searchGo:'Zoeken', updateVector:'Vectorgegevens bijwerken', attrValueList:'Attributen & waarden', attrsLoaded:'{n} attributen geladen', noAttrVector:'Geen vectorlagen met attributen', noMatch:'Geen overeenkomst',
    addrSearch:'Adres zoeken', providerGsi:'GSI', searchPh:'Voer zoekterm in', searching:'Zoeken...', noResults:'Geen resultaten', searchFailCors:'Zoeken mislukt. Controleer netwerk (CORS).', appIdMissing:'AppID niet ingesteld. Voeg de volgende regel toe aan de plugin-inspector:', appIdSample:'yahooAppId: uw Yahoo AppID', searchFailAppId:'Zoeken mislukt. Controleer AppID en netwerk (CORS).', yahooWarn:'Let op: yahooAppId kan zichtbaar worden. Niet gebruiken op openbare sites.', googleWarn:'Let op: googleMapsApiKey kan zichtbaar worden. Niet gebruiken op openbare sites.', googleKeyMissing:'googleMapsApiKey niet ingesteld. Voeg de volgende regel toe aan de plugin-inspector:', googleKeySample:'googleMapsApiKey: uw Google Maps API-sleutel', manageSecretWarn:'Let op: hier ingevoerde geminiApiKey: en yahooAppId: worden met het project opgeslagen en aan alle sitebezoekers gepubliceerd.',
    camsTitle:'Camera-presets', camHelp:'cam:Titel|Lat|Lng<br>cam:Titel|Lat|Lng|h=Hoogte(m)<br>cam:Titel|Lat|Lng|h=Hoogte|d=Richting&deg;|p=Helling&deg;<br><br>Bijv: cam:Station Tokio|35.6812|139.7671<br>Bijv: cam:Mount Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Niet-opgegeven parameters behouden de huidige camera-instellingen', currentCamera:'Huidige camera', positionLabel:'Positie', hprLabel:'Richting/Helling/Rol', flyToTitle:'Vlieg naar {v}',
    terrain:'Terrein', shadow:'Schaduw', depthTest:'Dieptetest', on:'AAN', off:'UIT', geojsonDrape:'GeoJSON 3D-drape',
    start:'Start', stop:'Einde', current:'Huidig', apply:'Toepassen', sentCurrent:'Verzonden (huidig ingesteld)', sent:'Verzonden', sendFailed:'Verzenden mislukt',
    legendTitle:'Legenda', legendInstr:'Voeg "legend: AfbeeldingsURL" toe aan inspectortekst.', legendMain:'Hoofd',
    attrTitle:'Attributen', noFeature:'Geen object geselecteerd.', noAttrAvail:'Geen attributen of selectie opgeheven.', backToAttrList:'Terug naar lijst', openNewTab:'Openen in nieuw tabblad (sandbox omzeilen)',
    selectLayer:'Kies laag', attrOrValuePh:'Zoek attributen of waarden', selectLayerPrompt:'Kies een laag', countFmt:'{rows} items / {attrs} attributen', sortTitle:'Klik om te sorteren', noMatchingFeatures:'Geen overeenkomende objecten', clickToFly:'Klik om te vliegen', limitSuffix:' (max. {n} weergegeven)', closeAria:'Sluiten',
    noUrlConfigured: 'Geen URL geconfigureerd',
    tabFly: 'Vliegen',
    flyRoute: 'Route', flyRoutePh: 'Route kiezen', flyDraw: 'Tekenen', flyDrawing: 'Tekenen — klik op de kaart om punten toe te voegen, dubbelklik om te voltooien', flyCancelDraw: 'Annuleren', flyDelete: 'Verwijderen', flySaveGeo: 'Opslaan', flySaved: 'Opgeslagen!',
    flyPlay: 'Afspelen', flyPause: 'Pauze', flyStop: 'Stop', flyRestart: 'Opnieuw',
    flySpeedLbl: 'Snelheid (km/h)', flyHeightLbl: 'Hoogte (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Herhalen', flyView: 'Weergave', flyViewCam: 'Boord', flyViewCenter: 'Lucht',
    flyPreset: 'Voorinstelling', flyPresetCustom: 'Aangepast', flyPresetWalk: 'Te voet (h2 s5 p-5)', flyPresetDrive: 'Auto (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Overzicht (h1000 s300 p-45)', flyReverse: 'Omkeren', flyImport: 'Importeren',
 flyBack: '◀ Terug', flyBackHint: 'Route achteruit afspelen / pauzeren',
 flyDblHint: 'Dubbelklik op kaart: afspelen/pauze · dubbele rechtermuisklik: achteruit · wiel: snelheid',
    flyShowLine: 'Route tonen', flyLoading: 'Route laden...', flySampling: 'Terrein bemonsteren...', flyDone: 'Voltooid', flyErr: 'Route laden mislukt', flyNoRoute: 'Geen route geselecteerd',
    flyViewHint: 'Boord: camera rijdt op de route en kijkt vooruit. Lucht: camera volgt het bewegende punt van achteren en boven.',
    flyHelp: 'fly_geojson:Naam|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = boordbeeld dat de route aflegt; center (=chase) = luchtbeeld dat het punt van achteren volgt.<br>Wijzigingen gelden direct, ook tijdens de vlucht.<br>Of druk op Tekenen en schets een polylijn op de kaart.',
    svOpen: 'Street View', captureBtn: 'Vastleggen', capturedHint: 'Rechtermuisknop op afbeelding om op te slaan'
  },
  pl: {
    minimize:'Minimalizuj', restore:'Przywróć', move:'Przenieś', moveCamera:'Przenieś kamerę',
    tabLayers:'Warstwy', tabLegend:'Legenda', tabSearch:'Szukaj', tabCams:'Kamery', tabInfo:'Info', tabShare:'Udostępnij', tabSet:'Ustaw.', tabAttr:'Atryb.', tabDisplay:'Widok', manageTitle:'Zarządzanie', manageInspectorLbl:'Tekst ustawień', manageApply:'Zastosuj', manageApplied:'Zastosowano', importTitle:'Import pliku', importAddFile:'Dodaj pliki', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Warstwy', note:'Uwaga', refresh:'Odśwież', refreshTitle:'Wymuś odświeżenie warstw użytkownika',
    generateLink:'Generuj link', generating:'Generowanie...', copy:'Kopiuj', copied:'Skopiowano!',
    sharePasteLabel:'Wklej URL poniżej.', sharePastePh:'Wklej URL lub ?lat=...', load:'Wczytaj', loaded:'Wczytano!', invalidData:'Nieprawidłowe dane', parseError:'Błąd parsowania', error:'Błąd',
    shareReadUrl:'Przejdź do parametrów bieżącego URL', urlLoadFlyTo:'Wczytaj URL i leć', loading:'Wczytywanie...',
    shareFlyCurrentLabel:'Przenieś z bieżącej lokalizacji', flyToCurrentLoc:'Leć do bieżącej lokalizacji', getting:'Pobieranie...', restored:'Przywrócono!', noLatLng:'Brak lat/lng', noParams:'Brak parametrów', imported:'Zaimportowano!',
    vectorSearch:'Wyszukiwanie wektorowe', allSelect:'Wszystkie', selectValue:'Wybierz wartość', fly:'Leć', textSearchPh:'Szukaj po tekście', searchGo:'Szukaj', updateVector:'Aktualizuj dane wektorowe', attrValueList:'Atrybuty i wartości', attrsLoaded:'Wczytano {n} atrybutów', noAttrVector:'Brak warstw wektorowych z atrybutami', noMatch:'Brak dopasowań',
    addrSearch:'Wyszukiwanie adresu', providerGsi:'GSI', searchPh:'Wpisz słowo kluczowe', searching:'Wyszukiwanie...', noResults:'Brak wyników', searchFailCors:'Wyszukiwanie nie powiodło się. Sprawdź sieć (CORS).', appIdMissing:'AppID nie jest ustawione. Dodaj następujący wiersz do inspektora wtyczki:', appIdSample:'yahooAppId: Twój AppID Yahoo', searchFailAppId:'Wyszukiwanie nie powiodło się. Sprawdź AppID i sieć (CORS).', yahooWarn:'Uwaga: yahooAppId może zostać ujawnione. Nie używaj na publicznych stronach.', googleWarn:'Uwaga: googleMapsApiKey może zostać ujawnione. Nie używaj na publicznych stronach.', googleKeyMissing:'googleMapsApiKey nie jest ustawione. Dodaj następujący wiersz do inspektora wtyczki:', googleKeySample:'googleMapsApiKey: Twój klucz API Google Maps', manageSecretWarn:'Uwaga: wpisane tu geminiApiKey: i yahooAppId: są zapisywane w projekcie i publikowane wszystkim odwiedzającym stronę.',
    camsTitle:'Presety kamery', camHelp:'cam:Tytuł|Szer.|Dług.<br>cam:Tytuł|Szer.|Dług.|h=Wysokość(m)<br>cam:Tytuł|Szer.|Dług.|h=Wysokość|d=Kierunek&deg;|p=Nachylenie&deg;<br><br>Przykład: cam:Stacja Tokio|35.6812|139.7671<br>Przykład: cam:Góra Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Nieokreślone parametry zachowują bieżące ustawienia kamery', currentCamera:'Bieżąca kamera', positionLabel:'Pozycja', hprLabel:'Kierunek/Nachylenie/Przechylenie', flyToTitle:'Leć do {v}',
    terrain:'Teren', shadow:'Cień', depthTest:'Test głębi', on:'WŁ.', off:'WYŁ.', geojsonDrape:'Drapowanie 3D GeoJSON',
    start:'Start', stop:'Koniec', current:'Bieżący', apply:'Zastosuj', sentCurrent:'Wysłano (bieżący ustawiony)', sent:'Wysłano', sendFailed:'Wysyłanie nie powiodło się',
    legendTitle:'Legenda', legendInstr:'Dodaj "legend: URLobrazu" do tekstu inspektora.', legendMain:'Główna',
    attrTitle:'Atrybuty', noFeature:'Nie wybrano obiektu.', noAttrAvail:'Brak atrybutów lub odznaczono obiekt.', backToAttrList:'Powrót do listy', openNewTab:'Otwórz w nowej karcie (obejście sandbox)',
    selectLayer:'Wybierz warstwę', attrOrValuePh:'Szukaj atrybutów lub wartości', selectLayerPrompt:'Wybierz warstwę', countFmt:'{rows} elementów / {attrs} atrybutów', sortTitle:'Kliknij, aby sortować', noMatchingFeatures:'Brak pasujących obiektów', clickToFly:'Kliknij, aby polecieć', limitSuffix:' (wyświetlono maks. {n})', closeAria:'Zamknij',
    noUrlConfigured: 'Nie skonfigurowano URL',
    tabFly: 'Lot',
    flyRoute: 'Trasa', flyRoutePh: 'Wybierz trasę', flyDraw: 'Rysuj', flyDrawing: 'Rysowanie — klikaj mapę, aby dodawać punkty, dwuklik kończy', flyCancelDraw: 'Anuluj', flyDelete: 'Usuń', flySaveGeo: 'Zapisz', flySaved: 'Zapisano!',
    flyPlay: 'Odtwórz', flyPause: 'Pauza', flyStop: 'Stop', flyRestart: 'Od początku',
    flySpeedLbl: 'Prędkość (km/h)', flyHeightLbl: 'Wysokość (m)', flyPitchLbl: 'Pochylenie (°)', flyLoop: 'Pętla', flyView: 'Widok', flyViewCam: 'Pokład', flyViewCenter: 'Lotniczy',
    flyPreset: 'Preset', flyPresetCustom: 'Własne', flyPresetWalk: 'Pieszo (h2 s5 p-5)', flyPresetDrive: 'Samochód (h2 s60 p-10)', flyPresetDrone: 'Dron (h200 s60 p-30)', flyPresetOverview: 'Przegląd (h1000 s300 p-45)', flyReverse: 'Odwróć', flyImport: 'Importuj',
 flyBack: '◀ Wstecz', flyBackHint: 'Odtwarzaj trasę wstecz / pauza',
 flyDblHint: 'Podwójne kliknięcie mapy: odtwarzaj/pauza · podwójne prawe kliknięcie: wstecz · kółko: prędkość',
    flyShowLine: 'Pokaż trasę', flyLoading: 'Ładowanie trasy...', flySampling: 'Próbkowanie terenu...', flyDone: 'Zakończono', flyErr: 'Nie udało się wczytać trasy', flyNoRoute: 'Nie wybrano trasy',
    flyViewHint: 'Pokład: kamera jedzie po trasie patrząc naprzód. Lotniczy: kamera śledzi poruszający się punkt z tyłu i z góry.',
    flyHelp: 'fly_geojson:Nazwa|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = widok z pokładu jadący po trasie; center (=chase) = widok lotniczy śledzący punkt z tyłu.<br>Zmiany działają od razu, także w locie.<br>Albo naciśnij Rysuj i naszkicuj linię łamaną na mapie.',
    svOpen: 'Street View', captureBtn: 'Zrzut', capturedHint: 'Kliknij obraz prawym przyciskiem, aby zapisać'
  },
  uk: {
    minimize:'Згорнути', restore:'Відновити', move:'Перемістити', moveCamera:'Перемістити камеру',
    tabLayers:'Шари', tabLegend:'Легенда', tabSearch:'Пошук', tabCams:'Камери', tabInfo:'Інфо', tabShare:'Поділитися', tabSet:'Налашт.', tabAttr:'Атриб.', tabDisplay:'Вигляд', manageTitle:'Керування', manageInspectorLbl:'Текст налаштувань', manageApply:'Застосувати', manageApplied:'Застосовано', importTitle:'Імпорт файлу', importAddFile:'Додати файли', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Шари', note:'Примітка', refresh:'Оновити', refreshTitle:'Примусово оновити шари користувача',
    generateLink:'Створити посилання', generating:'Створення...', copy:'Копіювати', copied:'Скопійовано!',
    sharePasteLabel:'Вставте URL нижче.', sharePastePh:'Вставте URL або ?lat=...', load:'Завантажити', loaded:'Завантажено!', invalidData:'Недійсні дані', parseError:'Помилка розбору', error:'Помилка',
    shareReadUrl:'Перейти до параметрів поточного URL', urlLoadFlyTo:'Завантажити URL і летіти', loading:'Завантаження...',
    shareFlyCurrentLabel:'Переміститися з поточного місця', flyToCurrentLoc:'Летіти до поточного місця', getting:'Отримання...', restored:'Відновлено!', noLatLng:'Немає координат', noParams:'Немає параметрів', imported:'Імпортовано!',
    vectorSearch:'Векторний пошук', allSelect:'Усі', selectValue:'Оберіть значення', fly:'Летіти', textSearchPh:'Пошук за текстом', searchGo:'Пошук', updateVector:'Оновити векторні дані', attrValueList:'Атрибути та значення', attrsLoaded:'Завантажено {n} атрибутів', noAttrVector:'Немає векторних шарів з атрибутами', noMatch:'Немає збігів',
    addrSearch:'Пошук адреси', providerGsi:'GSI', searchPh:'Введіть ключове слово', searching:'Пошук...', noResults:'Немає результатів', searchFailCors:'Пошук не вдався. Перевірте мережу (CORS).', appIdMissing:'AppID не задано. Додайте наступний рядок в інспектор плагіна:', appIdSample:'yahooAppId: ваш Yahoo AppID', searchFailAppId:'Пошук не вдався. Перевірте AppID та мережу (CORS).', yahooWarn:'Увага: yahooAppId може бути розкрито. Не використовуйте на публічних сайтах.', googleWarn:'Увага: googleMapsApiKey може бути розкрито. Не використовуйте на публічних сайтах.', googleKeyMissing:'googleMapsApiKey не задано. Додайте наступний рядок в інспектор плагіна:', googleKeySample:'googleMapsApiKey: ваш ключ API Google Maps', manageSecretWarn:'Примітка: вказані тут geminiApiKey: і yahooAppId: зберігаються в проєкті й публікуються всім відвідувачам сайту.',
    camsTitle:'Пресети камери', camHelp:'cam:Назва|Широта|Довгота<br>cam:Назва|Широта|Довгота|h=Висота(м)<br>cam:Назва|Широта|Довгота|h=Висота|d=Азимут&deg;|p=Нахил&deg;<br><br>Приклад: cam:Токійський вокзал|35.6812|139.7671<br>Приклад: cam:Фудзі|35.3606|138.7274|h=5000|p=-30<br><br>Невказані параметри зберігають поточні налаштування камери', currentCamera:'Поточна камера', positionLabel:'Позиція', hprLabel:'Азимут/Нахил/Крен', flyToTitle:'Летіти до {v}',
    terrain:'Рельєф', shadow:'Тінь', depthTest:'Тест глибини', on:'УВІМК', off:'ВИМК', geojsonDrape:'3D-драпірування GeoJSON',
    start:'Початок', stop:'Кінець', current:'Поточний', apply:'Застосувати', sentCurrent:'Надіслано (поточний задано)', sent:'Надіслано', sendFailed:'Помилка надсилання',
    legendTitle:'Легенда', legendInstr:'Додайте "legend: URLзображення" до тексту інспектора.', legendMain:'Основна',
    attrTitle:'Атрибути', noFeature:'Об’єкт не вибрано.', noAttrAvail:'Немає атрибутів або вибір скасовано.', backToAttrList:'Назад до списку', openNewTab:'Відкрити в новій вкладці (обхід sandbox)',
    selectLayer:'Виберіть шар', attrOrValuePh:'Пошук атрибутів або значень', selectLayerPrompt:'Виберіть шар', countFmt:'{rows} записів / {attrs} атрибутів', sortTitle:'Натисніть для сортування', noMatchingFeatures:'Немає відповідних об’єктів', clickToFly:'Натисніть, щоб летіти', limitSuffix:' (показано до {n})', closeAria:'Закрити',
    noUrlConfigured: 'URL не налаштовано',
    tabFly: 'Політ',
    flyRoute: 'Маршрут', flyRoutePh: 'Оберіть маршрут', flyDraw: 'Намалювати', flyDrawing: 'Малювання — клацайте мапу для додавання точок, подвійний клік для завершення', flyCancelDraw: 'Скасувати', flyDelete: 'Видалити', flySaveGeo: 'Зберегти', flySaved: 'Збережено!',
    flyPlay: 'Старт', flyPause: 'Пауза', flyStop: 'Стоп', flyRestart: 'Спочатку',
    flySpeedLbl: 'Швидкість (км/год)', flyHeightLbl: 'Висота (м)', flyPitchLbl: 'Тангаж (°)', flyLoop: 'По колу', flyView: 'Вигляд', flyViewCam: 'Борт', flyViewCenter: 'Аеро',
    flyPreset: 'Пресет', flyPresetCustom: 'Власний', flyPresetWalk: 'Пішки (h2 s5 p-5)', flyPresetDrive: 'Авто (h2 s60 p-10)', flyPresetDrone: 'Дрон (h200 s60 p-30)', flyPresetOverview: 'Огляд (h1000 s300 p-45)', flyReverse: 'Назад', flyImport: 'Імпорт',
 flyBack: '◀ Назад', flyBackHint: 'Відтворити маршрут назад / пауза',
 flyDblHint: 'Подвійний клік на мапі: старт/пауза · подвійний правий клік: назад · коліщатко: швидкість',
    flyShowLine: 'Показати маршрут', flyLoading: 'Завантаження маршруту...', flySampling: 'Замір рельєфу...', flyDone: 'Завершено', flyErr: 'Не вдалося завантажити маршрут', flyNoRoute: 'Маршрут не вибрано',
    flyViewHint: 'Борт: камера рухається маршрутом і дивиться вперед. Аеро: камера стежить за рухомою точкою ззаду й згори.',
    flyHelp: 'fly_geojson:Назва|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = вид з борту, рух маршрутом уперед; center (=chase) = аеровигляд, стеження за точкою ззаду.<br>Зміни застосовуються одразу, навіть у польоті.<br>Або натисніть «Намалювати» й накресліть ламану на мапі.',
    svOpen: 'Перегляд вулиць', captureBtn: 'Знімок', capturedHint: 'Клацніть зображення правою кнопкою, щоб зберегти'
  },
  tr: {
    minimize:'Küçült', restore:'Geri yükle', move:'Taşı', moveCamera:'Kamerayı taşı',
    tabLayers:'Katmanlar', tabLegend:'Lejant', tabSearch:'Ara', tabCams:'Kameralar', tabInfo:'Bilgi', tabShare:'Paylaş', tabSet:'Ayarlar', tabAttr:'Özellik', tabDisplay:'Görünüm', manageTitle:'Yönetim', manageInspectorLbl:'Ayar metni', manageApply:'Uygula', manageApplied:'Uygulandı', importTitle:'Dosya içe aktar', importAddFile:'Dosya ekle', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Katmanlar', note:'Not', refresh:'Yenile', refreshTitle:'Kullanıcı katmanlarını zorla yenile',
    generateLink:'Bağlantı oluştur', generating:'Oluşturuluyor...', copy:'Kopyala', copied:'Kopyalandı!',
    sharePasteLabel:'Aşağıya bir URL yapıştırın.', sharePastePh:'URL veya ?lat=... yapıştır', load:'Yükle', loaded:'Yüklendi!', invalidData:'Geçersiz veri', parseError:'Ayrıştırma hatası', error:'Hata',
    shareReadUrl:'Geçerli URL parametrelerine git', urlLoadFlyTo:'URL yükle ve uç', loading:'Yükleniyor...',
    shareFlyCurrentLabel:'Geçerli konumdan hareket et', flyToCurrentLoc:'Geçerli konuma uç', getting:'Alınıyor...', restored:'Geri yüklendi!', noLatLng:'Enlem/boylam yok', noParams:'Parametre yok', imported:'İçe aktarıldı!',
    vectorSearch:'Vektör arama', allSelect:'Tümü', selectValue:'Değer seç', fly:'Uç', textSearchPh:'Metne göre ara', searchGo:'Ara', updateVector:'Vektör verilerini güncelle', attrValueList:'Öznitelikler ve değerler', attrsLoaded:'{n} öznitelik yüklendi', noAttrVector:'Öznitelikli vektör katmanı yok', noMatch:'Eşleşme yok',
    addrSearch:'Adres arama', providerGsi:'GSI', searchPh:'Anahtar kelime girin', searching:'Aranıyor...', noResults:'Sonuç yok', searchFailCors:'Arama başarısız. Ağı (CORS) kontrol edin.', appIdMissing:'AppID ayarlanmadı. Plugin denetçisine şu satırı ekleyin:', appIdSample:'yahooAppId: Yahoo AppID’niz', searchFailAppId:'Arama başarısız. AppID ve ağı (CORS) kontrol edin.', yahooWarn:'Not: yahooAppId ifşa olabilir. Herkese açık sitelerde kullanmayın.', googleWarn:'Not: googleMapsApiKey ifşa olabilir. Herkese açık sitelerde kullanmayın.', googleKeyMissing:'googleMapsApiKey ayarlanmadı. Plugin denetçisine şu satırı ekleyin:', googleKeySample:'googleMapsApiKey: Google Maps API anahtarınız', manageSecretWarn:'Not: buraya yazılan geminiApiKey: ve yahooAppId: proje ile birlikte kaydedilir ve sitenin tüm ziyaretçilerine yayınlanır.',
    camsTitle:'Kamera önayarları', camHelp:'cam:Başlık|Enlem|Boylam<br>cam:Başlık|Enlem|Boylam|h=Yükseklik(m)<br>cam:Başlık|Enlem|Boylam|h=Yükseklik|d=Yön&deg;|p=Eğim&deg;<br><br>Örn: cam:Tokyo İstasyonu|35.6812|139.7671<br>Örn: cam:Fuji Dağı|35.3606|138.7274|h=5000|p=-30<br><br>Belirtilmeyen parametreler geçerli kamera ayarlarını korur', currentCamera:'Geçerli kamera', positionLabel:'Konum', hprLabel:'Yön/Eğim/Yatış', flyToTitle:'{v} konumuna uç',
    terrain:'Arazi', shadow:'Gölge', depthTest:'Derinlik testi', on:'AÇIK', off:'KAPALI', geojsonDrape:'GeoJSON 3D Kaplama',
    start:'Başlangıç', stop:'Bitiş', current:'Geçerli', apply:'Uygula', sentCurrent:'Gönderildi (geçerli ayarlı)', sent:'Gönderildi', sendFailed:'Gönderim başarısız',
    legendTitle:'Lejant', legendInstr:'Denetçi metnine "legend: ResimURL" ekleyin.', legendMain:'Ana',
    attrTitle:'Öznitelikler', noFeature:'Öğe seçilmedi.', noAttrAvail:'Öznitelik yok veya seçim kaldırıldı.', backToAttrList:'Listeye dön', openNewTab:'Yeni sekmede aç (sandbox’ı atla)',
    selectLayer:'Katman seç', attrOrValuePh:'Öznitelik veya değer ara', selectLayerPrompt:'Lütfen katman seçin', countFmt:'{rows} öğe / {attrs} öznitelik', sortTitle:'Sıralamak için tıklayın', noMatchingFeatures:'Eşleşen öğe yok', clickToFly:'Uçmak için tıklayın', limitSuffix:' (en fazla {n} gösteriliyor)', closeAria:'Kapat',
    noUrlConfigured: 'URL yapılandırılmadı',
    tabFly: 'Uçuş',
    flyRoute: 'Rota', flyRoutePh: 'Rota seçin', flyDraw: 'Çiz', flyDrawing: 'Çiziliyor — nokta eklemek için haritaya tıklayın, bitirmek için çift tıklayın', flyCancelDraw: 'İptal', flyDelete: 'Sil', flySaveGeo: 'Kaydet', flySaved: 'Kaydedildi!',
    flyPlay: 'Oynat', flyPause: 'Duraklat', flyStop: 'Durdur', flyRestart: 'Yeniden',
    flySpeedLbl: 'Hız (km/sa)', flyHeightLbl: 'Yükseklik (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Döngü', flyView: 'Görünüm', flyViewCam: 'Araç içi', flyViewCenter: 'Hava',
    flyPreset: 'Hazır ayar', flyPresetCustom: 'Özel', flyPresetWalk: 'Yürüyüş (h2 s5 p-5)', flyPresetDrive: 'Araç (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Genel bakış (h1000 s300 p-45)', flyReverse: 'Ters çevir', flyImport: 'İçe aktar',
 flyBack: '◀ Geri', flyBackHint: 'Rotayı geriye doğru oynat / duraklat',
 flyDblHint: 'Haritada çift tık: oynat/duraklat · sağ çift tık: geri oynat · tekerlek: hız',
    flyShowLine: 'Rotayı göster', flyLoading: 'Rota yükleniyor...', flySampling: 'Arazi örnekleniyor...', flyDone: 'Tamamlandı', flyErr: 'Rota yüklenemedi', flyNoRoute: 'Rota seçilmedi',
    flyViewHint: 'Araç içi: kamera rota üzerinde ilerler ve öne bakar. Hava: kamera hareketli noktayı arkadan ve yukarıdan izler.',
    flyHelp: 'fly_geojson:Ad|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = rotada ilerleyen araç içi görünüm; center (=chase) = noktayı arkadan izleyen hava görünümü.<br>Değişiklikler uçuş sırasında da anında uygulanır.<br>Ya da Çiz düğmesiyle haritada çoklu çizgi çizin.',
    svOpen: 'Sokak Görünümü', captureBtn: 'Yakala', capturedHint: 'Kaydetmek için görüntüye sağ tıklayın'
  },
  ar: {
    minimize:'تصغير', restore:'استعادة', move:'تحريك', moveCamera:'تحريك الكاميرا',
    tabLayers:'الطبقات', tabLegend:'المفتاح', tabSearch:'بحث', tabCams:'كاميرات', tabInfo:'معلومات', tabShare:'مشاركة', tabSet:'إعدادات', tabAttr:'خصائص', tabDisplay:'عرض', manageTitle:'إدارة', manageInspectorLbl:'نص الإعدادات', manageApply:'تطبيق', manageApplied:'تم التطبيق', importTitle:'استيراد ملف', importAddFile:'إضافة ملفات', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'الطبقات', note:'ملاحظة', refresh:'تحديث', refreshTitle:'فرض تحديث طبقات المستخدم',
    generateLink:'إنشاء رابط', generating:'جارٍ الإنشاء...', copy:'نسخ', copied:'تم النسخ!',
    sharePasteLabel:'الصق عنوان URL أدناه.', sharePastePh:'الصق URL أو ?lat=...', load:'تحميل', loaded:'تم التحميل!', invalidData:'بيانات غير صالحة', parseError:'خطأ في التحليل', error:'خطأ',
    shareReadUrl:'الانتقال إلى معلمات URL الحالية', urlLoadFlyTo:'تحميل URL والانتقال', loading:'جارٍ التحميل...',
    shareFlyCurrentLabel:'التحرك من الموقع الحالي', flyToCurrentLoc:'الانتقال إلى الموقع الحالي', getting:'جارٍ الجلب...', restored:'تمت الاستعادة!', noLatLng:'لا توجد إحداثيات', noParams:'لا توجد معلمات', imported:'تم الاستيراد!',
    vectorSearch:'بحث متجهي', allSelect:'الكل', selectValue:'اختر قيمة', fly:'انتقال', textSearchPh:'بحث بالنص', searchGo:'بحث', updateVector:'تحديث البيانات المتجهية', attrValueList:'الخصائص والقيم', attrsLoaded:'تم تحميل {n} خاصية', noAttrVector:'لا توجد طبقات متجهية بخصائص', noMatch:'لا تطابق',
    addrSearch:'بحث العنوان', providerGsi:'GSI', searchPh:'أدخل كلمة البحث', searching:'جارٍ البحث...', noResults:'لا نتائج', searchFailCors:'فشل البحث. تحقق من الشبكة (CORS).', appIdMissing:'AppID غير مضبوط. أضف السطر التالي إلى مفتش الإضافة:', appIdSample:'yahooAppId: مُعرّف Yahoo الخاص بك', searchFailAppId:'فشل البحث. تحقق من AppID والشبكة (CORS).', yahooWarn:'ملاحظة: قد يتم كشف yahooAppId. لا تستخدمه في المواقع العامة.', googleWarn:'ملاحظة: قد يتم كشف googleMapsApiKey. لا تستخدمه في المواقع العامة.', googleKeyMissing:'لم يتم تعيين googleMapsApiKey. أضف السطر التالي إلى مفتش الإضافة:', googleKeySample:'googleMapsApiKey: مفتاح Google Maps API الخاص بك', manageSecretWarn:'ملاحظة: ما تكتبه هنا من geminiApiKey: و yahooAppId: يُحفظ مع المشروع ويُنشر لجميع زوّار الموقع.',
    camsTitle:'إعدادات الكاميرا المسبقة', camHelp:'cam:العنوان|خط العرض|خط الطول<br>cam:العنوان|خط العرض|خط الطول|h=الارتفاع(م)<br>cam:العنوان|خط العرض|خط الطول|h=الارتفاع|d=الاتجاه&deg;|p=الميل&deg;<br><br>مثال: cam:محطة طوكيو|35.6812|139.7671<br>مثال: cam:جبل فوجي|35.3606|138.7274|h=5000|p=-30<br><br>المعلمات غير المحددة تحتفظ بإعدادات الكاميرا الحالية', currentCamera:'الكاميرا الحالية', positionLabel:'الموقع', hprLabel:'الاتجاه/الميل/الدوران', flyToTitle:'الانتقال إلى {v}',
    terrain:'التضاريس', shadow:'الظل', depthTest:'اختبار العمق', on:'تشغيل', off:'إيقاف', geojsonDrape:'إسقاط GeoJSON ثلاثي الأبعاد',
    start:'البداية', stop:'النهاية', current:'الحالي', apply:'تطبيق', sentCurrent:'تم الإرسال (تم تعيين الحالي)', sent:'تم الإرسال', sendFailed:'فشل الإرسال',
    legendTitle:'المفتاح', legendInstr:'أضف "legend: رابط الصورة" إلى نص المفتش.', legendMain:'رئيسي',
    attrTitle:'الخصائص', noFeature:'لم يتم اختيار عنصر.', noAttrAvail:'لا توجد خصائص أو تم إلغاء التحديد.', backToAttrList:'العودة إلى القائمة', openNewTab:'فتح في تبويب جديد (تجاوز sandbox)',
    selectLayer:'اختر طبقة', attrOrValuePh:'بحث في الخصائص أو القيم', selectLayerPrompt:'يرجى اختيار طبقة', countFmt:'{rows} عنصر / {attrs} خاصية', sortTitle:'انقر للترتيب', noMatchingFeatures:'لا توجد عناصر مطابقة', clickToFly:'انقر للانتقال', limitSuffix:' (بحد أقصى {n})', closeAria:'إغلاق',
    noUrlConfigured: 'لم يتم تكوين URL',
    tabFly: 'طيران',
    flyRoute: 'المسار', flyRoutePh: 'اختر المسار', flyDraw: 'رسم', flyDrawing: 'جارٍ الرسم — انقر على الخريطة لإضافة نقاط، انقر نقرًا مزدوجًا للإنهاء', flyCancelDraw: 'إلغاء', flyDelete: 'حذف', flySaveGeo: 'حفظ', flySaved: 'تم الحفظ!',
    flyPlay: 'تشغيل', flyPause: 'إيقاف مؤقت', flyStop: 'إيقاف', flyRestart: 'إعادة البدء',
    flySpeedLbl: 'السرعة (كم/س)', flyHeightLbl: 'الارتفاع (م)', flyPitchLbl: 'الميل (°)', flyLoop: 'تكرار', flyView: 'العرض', flyViewCam: 'على متن', flyViewCenter: 'جوّي',
    flyPreset: 'إعداد مسبق', flyPresetCustom: 'مخصص', flyPresetWalk: 'مشي (h2 s5 p-5)', flyPresetDrive: 'سيارة (h2 s60 p-10)', flyPresetDrone: 'درون (h200 s60 p-30)', flyPresetOverview: 'نظرة عامة (h1000 s300 p-45)', flyReverse: 'عكس', flyImport: 'استيراد',
 flyBack: '◀ للخلف', flyBackHint: 'تشغيل المسار للخلف / إيقاف مؤقت',
 flyDblHint: 'نقرة مزدوجة على الخريطة: تشغيل/إيقاف · نقرة يمنى مزدوجة: تشغيل للخلف · عجلة: السرعة',
    flyShowLine: 'إظهار المسار', flyLoading: 'جارٍ تحميل المسار...', flySampling: 'جارٍ قياس التضاريس...', flyDone: 'اكتمل', flyErr: 'فشل تحميل المسار', flyNoRoute: 'لم يتم اختيار مسار',
    flyViewHint: 'على متن: الكاميرا تسير على المسار وتنظر إلى الأمام. جوّي: الكاميرا تتعقب النقطة المتحركة من الخلف والأعلى.',
    flyHelp: 'fly_geojson:الاسم|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = منظر على متن المسار يتقدم للأمام؛ center (=chase) = منظر جوّي يتعقب النقطة من الخلف.<br>تُطبَّق التغييرات فورًا حتى أثناء التحليق.<br>أو اضغط «رسم» وارسم خطًا متعددًا على الخريطة.',
    svOpen: 'التجوّل الافتراضي', captureBtn: 'لقطة', capturedHint: 'انقر بزر الفأرة الأيمن على الصورة للحفظ'
  },
  hi: {
    minimize:'छोटा करें', restore:'पुनर्स्थापित', move:'स्थानांतरित', moveCamera:'कैमरा ले जाएँ',
    tabLayers:'लेयर', tabLegend:'लीजेंड', tabSearch:'खोज', tabCams:'कैमरे', tabInfo:'जानकारी', tabShare:'साझा करें', tabSet:'सेटिंग', tabAttr:'विशेषताएँ', tabDisplay:'प्रदर्शन', manageTitle:'प्रबंधन', manageInspectorLbl:'सेटिंग टेक्स्ट', manageApply:'लागू करें', manageApplied:'लागू किया गया', importTitle:'फ़ाइल आयात', importAddFile:'फ़ाइलें जोड़ें', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'लेयर', note:'नोट', refresh:'रीफ़्रेश', refreshTitle:'उपयोगकर्ता लेयर ज़बरदस्ती रीफ़्रेश',
    generateLink:'लिंक बनाएँ', generating:'बनाया जा रहा है...', copy:'कॉपी', copied:'कॉपी किया गया!',
    sharePasteLabel:'नीचे URL पेस्ट करें।', sharePastePh:'URL या ?lat=... पेस्ट करें', load:'लोड', loaded:'लोड हुआ!', invalidData:'अमान्य डेटा', parseError:'पार्स त्रुटि', error:'त्रुटि',
    shareReadUrl:'वर्तमान URL पैरामीटर पर जाएँ', urlLoadFlyTo:'URL लोड करें और जाएँ', loading:'लोड हो रहा है...',
    shareFlyCurrentLabel:'वर्तमान स्थान से जाएँ', flyToCurrentLoc:'वर्तमान स्थान पर जाएँ', getting:'प्राप्त हो रहा है...', restored:'पुनर्स्थापित!', noLatLng:'अक्षांश/देशांतर नहीं', noParams:'कोई पैरामीटर नहीं', imported:'आयातित!',
    vectorSearch:'वेक्टर खोज', allSelect:'सभी', selectValue:'मान चुनें', fly:'जाएँ', textSearchPh:'टेक्स्ट से खोजें', searchGo:'खोज', updateVector:'वेक्टर डेटा अपडेट करें', attrValueList:'विशेषताएँ और मान', attrsLoaded:'{n} विशेषताएँ लोड हुईं', noAttrVector:'विशेषताओं वाली कोई वेक्टर लेयर नहीं', noMatch:'कोई मिलान नहीं',
    addrSearch:'पता खोज', providerGsi:'GSI', searchPh:'खोज शब्द दर्ज करें', searching:'खोजा जा रहा है...', noResults:'कोई परिणाम नहीं', searchFailCors:'खोज विफल। नेटवर्क (CORS) जाँचें।', appIdMissing:'AppID सेट नहीं है। प्लगइन इंस्पेक्टर में यह पंक्ति जोड़ें:', appIdSample:'yahooAppId: आपकी Yahoo AppID', searchFailAppId:'खोज विफल। AppID और नेटवर्क (CORS) जाँचें।', yahooWarn:'नोट: yahooAppId उजागर हो सकती है। सार्वजनिक साइटों पर उपयोग न करें।', googleWarn:'नोट: googleMapsApiKey उजागर हो सकती है। सार्वजनिक साइटों पर उपयोग न करें।', googleKeyMissing:'googleMapsApiKey सेट नहीं है। प्लगइन इंस्पेक्टर में यह पंक्ति जोड़ें:', googleKeySample:'googleMapsApiKey: आपकी Google Maps API कुंजी', manageSecretWarn:'नोट: यहाँ लिखी गई geminiApiKey: और yahooAppId: परियोजना के साथ सहेजी जाती हैं और साइट के सभी आगंतुकों को प्रकाशित होती हैं।',
    camsTitle:'कैमरा प्रीसेट', camHelp:'cam:शीर्षक|अक्षांश|देशांतर<br>cam:शीर्षक|अक्षांश|देशांतर|h=ऊँचाई(m)<br>cam:शीर्षक|अक्षांश|देशांतर|h=ऊँचाई|d=दिशा&deg;|p=झुकाव&deg;<br><br>उदा: cam:टोक्यो स्टेशन|35.6812|139.7671<br>उदा: cam:फ़ूजी पर्वत|35.3606|138.7274|h=5000|p=-30<br><br>अनिर्दिष्ट पैरामीटर वर्तमान कैमरा सेटिंग बनाए रखते हैं', currentCamera:'वर्तमान कैमरा', positionLabel:'स्थिति', hprLabel:'दिशा/झुकाव/रोल', flyToTitle:'{v} पर जाएँ',
    terrain:'भू-आकृति', shadow:'छाया', depthTest:'गहराई परीक्षण', on:'चालू', off:'बंद', geojsonDrape:'GeoJSON 3D ड्रेप',
    start:'प्रारंभ', stop:'समाप्त', current:'वर्तमान', apply:'लागू करें', sentCurrent:'भेजा गया (वर्तमान सेट)', sent:'भेजा गया', sendFailed:'भेजना विफल',
    legendTitle:'लीजेंड', legendInstr:'इंस्पेक्टर टेक्स्ट में "legend: छविURL" जोड़ें।', legendMain:'मुख्य',
    attrTitle:'विशेषताएँ', noFeature:'कोई फ़ीचर चयनित नहीं।', noAttrAvail:'कोई विशेषता नहीं या चयन हटाया गया।', backToAttrList:'सूची पर वापस', openNewTab:'नए टैब में खोलें (sandbox बायपास)',
    selectLayer:'लेयर चुनें', attrOrValuePh:'विशेषता या मान खोजें', selectLayerPrompt:'कृपया लेयर चुनें', countFmt:'{rows} आइटम / {attrs} विशेषताएँ', sortTitle:'क्रमबद्ध करने क्लिक करें', noMatchingFeatures:'कोई मेल खाने वाला फ़ीचर नहीं', clickToFly:'जाने के लिए क्लिक करें', limitSuffix:' (अधिकतम {n} दिखाए गए)', closeAria:'बंद करें',
    noUrlConfigured: 'URL कॉन्फ़िगर नहीं',
    tabFly: 'उड़ान',
    flyRoute: 'मार्ग', flyRoutePh: 'मार्ग चुनें', flyDraw: 'बनाएँ', flyDrawing: 'बना रहे हैं — बिंदु जोड़ने के लिए मानचित्र पर क्लिक करें, समाप्त करने के लिए डबल-क्लिक करें', flyCancelDraw: 'रद्द करें', flyDelete: 'हटाएँ', flySaveGeo: 'सहेजें', flySaved: 'सहेजा गया!',
    flyPlay: 'चलाएँ', flyPause: 'रोकें', flyStop: 'बंद करें', flyRestart: 'पुनः आरंभ',
    flySpeedLbl: 'गति (km/h)', flyHeightLbl: 'ऊँचाई (m)', flyPitchLbl: 'पिच (°)', flyLoop: 'लूप', flyView: 'दृश्य', flyViewCam: 'सवारी', flyViewCenter: 'हवाई',
    flyPreset: 'प्रीसेट', flyPresetCustom: 'कस्टम', flyPresetWalk: 'पैदल (h2 s5 p-5)', flyPresetDrive: 'वाहन (h2 s60 p-10)', flyPresetDrone: 'ड्रोन (h200 s60 p-30)', flyPresetOverview: 'विस्तृत (h1000 s300 p-45)', flyReverse: 'उलटें', flyImport: 'आयात',
 flyBack: '◀ उल्टा', flyBackHint: 'मार्ग को उल्टा चलाएँ / रोकें',
 flyDblHint: 'मानचित्र पर डबल-क्लिक: चलाएँ/रोकें · दायाँ डबल-क्लिक: उल्टा चलाएँ · व्हील: गति',
    flyShowLine: 'मार्ग दिखाएँ', flyLoading: 'मार्ग लोड हो रहा है...', flySampling: 'भू-आकृति मापी जा रही है...', flyDone: 'पूर्ण', flyErr: 'मार्ग लोड करने में विफल', flyNoRoute: 'कोई मार्ग नहीं चुना गया',
    flyViewHint: 'सवारी: कैमरा मार्ग पर आगे देखते हुए चलता है। हवाई: कैमरा चलते बिंदु को पीछे और ऊपर से ट्रैक करता है।',
    flyHelp: 'fly_geojson:नाम|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = मार्ग पर चलने वाला सवारी दृश्य; center (=chase) = बिंदु को पीछे से ट्रैक करने वाला हवाई दृश्य।<br>बदलाव उड़ान के दौरान भी तुरंत लागू होते हैं।<br>या Draw दबाकर मानचित्र पर पॉलीलाइन बनाएँ।',
    svOpen: 'स्ट्रीट व्यू', captureBtn: 'कैप्चर', capturedHint: 'सहेजने के लिए छवि पर राइट-क्लिक करें'
  },
  id: {
    minimize:'Minimalkan', restore:'Pulihkan', move:'Pindah', moveCamera:'Pindahkan kamera',
    tabLayers:'Lapisan', tabLegend:'Legenda', tabSearch:'Cari', tabCams:'Kamera', tabInfo:'Info', tabShare:'Bagikan', tabSet:'Setel', tabAttr:'Atribut', tabDisplay:'Tampilan', manageTitle:'Kelola', manageInspectorLbl:'Teks pengaturan', manageApply:'Terapkan', manageApplied:'Diterapkan', importTitle:'Impor file', importAddFile:'Tambah file', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Lapisan', note:'Catatan', refresh:'Muat ulang', refreshTitle:'Paksa muat ulang lapisan pengguna',
    generateLink:'Buat tautan', generating:'Membuat...', copy:'Salin', copied:'Tersalin!',
    sharePasteLabel:'Tempel URL di bawah.', sharePastePh:'Tempel URL atau ?lat=...', load:'Muat', loaded:'Termuat!', invalidData:'Data tidak valid', parseError:'Kesalahan parsing', error:'Kesalahan',
    shareReadUrl:'Pindah ke parameter URL saat ini', urlLoadFlyTo:'Muat URL & Terbang', loading:'Memuat...',
    shareFlyCurrentLabel:'Pindah dari lokasi saat ini', flyToCurrentLoc:'Terbang ke lokasi saat ini', getting:'Mengambil...', restored:'Dipulihkan!', noLatLng:'Tanpa lat/lng', noParams:'Tanpa parameter', imported:'Diimpor!',
    vectorSearch:'Pencarian vektor', allSelect:'Semua', selectValue:'Pilih nilai', fly:'Terbang', textSearchPh:'Cari teks', searchGo:'Cari', updateVector:'Perbarui data vektor', attrValueList:'Atribut & nilai', attrsLoaded:'{n} atribut dimuat', noAttrVector:'Tidak ada lapisan vektor beratribut', noMatch:'Tidak cocok',
    addrSearch:'Pencarian alamat', providerGsi:'GSI', searchPh:'Masukkan kata kunci', searching:'Mencari...', noResults:'Tidak ada hasil', searchFailCors:'Pencarian gagal. Periksa jaringan (CORS).', appIdMissing:'AppID belum diatur. Tambahkan baris berikut ke inspektur plugin:', appIdSample:'yahooAppId: AppID Yahoo Anda', searchFailAppId:'Pencarian gagal. Periksa AppID dan jaringan (CORS).', yahooWarn:'Catatan: yahooAppId dapat terekspos. Jangan gunakan di situs publik.', googleWarn:'Catatan: googleMapsApiKey dapat terekspos. Jangan gunakan di situs publik.', googleKeyMissing:'googleMapsApiKey belum diatur. Tambahkan baris berikut ke inspektur plugin:', googleKeySample:'googleMapsApiKey: kunci API Google Maps Anda', manageSecretWarn:'Catatan: geminiApiKey: dan yahooAppId: yang ditulis di sini disimpan bersama proyek dan dipublikasikan ke semua pengunjung situs.',
    camsTitle:'Preset kamera', camHelp:'cam:Judul|Lintang|Bujur<br>cam:Judul|Lintang|Bujur|h=Ketinggian(m)<br>cam:Judul|Lintang|Bujur|h=Ketinggian|d=Arah&deg;|p=Kemiringan&deg;<br><br>Cth: cam:Stasiun Tokyo|35.6812|139.7671<br>Cth: cam:Gunung Fuji|35.3606|138.7274|h=5000|p=-30<br><br>Parameter yang tidak diisi mempertahankan pengaturan kamera saat ini', currentCamera:'Kamera saat ini', positionLabel:'Posisi', hprLabel:'Arah/Kemiringan/Roll', flyToTitle:'Terbang ke {v}',
    terrain:'Medan', shadow:'Bayangan', depthTest:'Uji kedalaman', on:'AKTIF', off:'MATI', geojsonDrape:'Drape 3D GeoJSON',
    start:'Mulai', stop:'Selesai', current:'Saat ini', apply:'Terapkan', sentCurrent:'Terkirim (saat ini diatur)', sent:'Terkirim', sendFailed:'Gagal mengirim',
    legendTitle:'Legenda', legendInstr:'Tambahkan "legend: URLGambar" ke teks inspektur.', legendMain:'Utama',
    attrTitle:'Atribut', noFeature:'Tidak ada fitur dipilih.', noAttrAvail:'Tidak ada atribut atau pilihan dibatalkan.', backToAttrList:'Kembali ke daftar', openNewTab:'Buka di tab baru (lewati sandbox)',
    selectLayer:'Pilih lapisan', attrOrValuePh:'Cari atribut atau nilai', selectLayerPrompt:'Silakan pilih lapisan', countFmt:'{rows} item / {attrs} atribut', sortTitle:'Klik untuk mengurutkan', noMatchingFeatures:'Tidak ada fitur yang cocok', clickToFly:'Klik untuk terbang', limitSuffix:' (maks {n} ditampilkan)', closeAria:'Tutup',
    noUrlConfigured: 'URL belum dikonfigurasi',
    tabFly: 'Terbang',
    flyRoute: 'Rute', flyRoutePh: 'Pilih rute', flyDraw: 'Gambar', flyDrawing: 'Menggambar — klik peta untuk menambah titik, klik ganda untuk selesai', flyCancelDraw: 'Batal', flyDelete: 'Hapus', flySaveGeo: 'Simpan', flySaved: 'Tersimpan!',
    flyPlay: 'Putar', flyPause: 'Jeda', flyStop: 'Berhenti', flyRestart: 'Mulai ulang',
    flySpeedLbl: 'Kecepatan (km/j)', flyHeightLbl: 'Ketinggian (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Loop', flyView: 'Tampilan', flyViewCam: 'Menumpang', flyViewCenter: 'Udara',
    flyPreset: 'Preset', flyPresetCustom: 'Kustom', flyPresetWalk: 'Jalan kaki (h2 s5 p-5)', flyPresetDrive: 'Mobil (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Gambaran (h1000 s300 p-45)', flyReverse: 'Balik', flyImport: 'Impor',
 flyBack: '◀ Mundur', flyBackHint: 'Putar rute mundur / jeda',
 flyDblHint: 'Klik ganda peta: putar/jeda · klik kanan ganda: putar mundur · roda: kecepatan',
    flyShowLine: 'Tampilkan rute', flyLoading: 'Memuat rute...', flySampling: 'Mengambil sampel medan...', flyDone: 'Selesai', flyErr: 'Gagal memuat rute', flyNoRoute: 'Belum ada rute dipilih',
    flyViewHint: 'Menumpang: kamera bergerak di rute menghadap depan. Udara: kamera melacak titik bergerak dari belakang dan atas.',
    flyHelp: 'fly_geojson:Nama|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = tampilan menumpang yang bergerak di rute; center (=chase) = tampilan udara yang melacak titik dari belakang.<br>Perubahan langsung berlaku, bahkan saat terbang.<br>Atau tekan Gambar lalu sketsa polyline di peta.',
    svOpen: 'Street View', captureBtn: 'Tangkap', capturedHint: 'Klik kanan gambar untuk menyimpan'
  },
  th: {
    minimize:'ย่อ', restore:'คืนค่า', move:'ย้าย', moveCamera:'ย้ายกล้อง',
    tabLayers:'เลเยอร์', tabLegend:'คำอธิบาย', tabSearch:'ค้นหา', tabCams:'กล้อง', tabInfo:'ข้อมูล', tabShare:'แชร์', tabSet:'ตั้งค่า', tabAttr:'คุณลักษณะ', tabDisplay:'การแสดง', manageTitle:'จัดการ', manageInspectorLbl:'ข้อความการตั้งค่า', manageApply:'ใช้', manageApplied:'ใช้แล้ว', importTitle:'นำเข้าไฟล์', importAddFile:'เพิ่มไฟล์', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'เลเยอร์', note:'หมายเหตุ', refresh:'รีเฟรช', refreshTitle:'บังคับรีเฟรชเลเยอร์ผู้ใช้',
    generateLink:'สร้างลิงก์', generating:'กำลังสร้าง...', copy:'คัดลอก', copied:'คัดลอกแล้ว!',
    sharePasteLabel:'วาง URL ด้านล่าง', sharePastePh:'วาง URL หรือ ?lat=...', load:'โหลด', loaded:'โหลดแล้ว!', invalidData:'ข้อมูลไม่ถูกต้อง', parseError:'ข้อผิดพลาดในการแยกวิเคราะห์', error:'ข้อผิดพลาด',
    shareReadUrl:'ไปยังพารามิเตอร์ URL ปัจจุบัน', urlLoadFlyTo:'โหลด URL และบินไป', loading:'กำลังโหลด...',
    shareFlyCurrentLabel:'ย้ายจากตำแหน่งปัจจุบัน', flyToCurrentLoc:'บินไปตำแหน่งปัจจุบัน', getting:'กำลังดึงข้อมูล...', restored:'คืนค่าแล้ว!', noLatLng:'ไม่มีละติจูด/ลองจิจูด', noParams:'ไม่มีพารามิเตอร์', imported:'นำเข้าแล้ว!',
    vectorSearch:'ค้นหาเวกเตอร์', allSelect:'ทั้งหมด', selectValue:'เลือกค่า', fly:'บินไป', textSearchPh:'ค้นหาด้วยข้อความ', searchGo:'ค้นหา', updateVector:'อัปเดตข้อมูลเวกเตอร์', attrValueList:'คุณลักษณะและค่า', attrsLoaded:'โหลด {n} คุณลักษณะแล้ว', noAttrVector:'ไม่มีเลเยอร์เวกเตอร์ที่มีคุณลักษณะ', noMatch:'ไม่พบ',
    addrSearch:'ค้นหาที่อยู่', providerGsi:'GSI', searchPh:'ป้อนคำค้นหา', searching:'กำลังค้นหา...', noResults:'ไม่มีผลลัพธ์', searchFailCors:'ค้นหาล้มเหลว ตรวจสอบเครือข่าย (CORS)', appIdMissing:'ยังไม่ได้ตั้ง AppID เพิ่มบรรทัดต่อไปนี้ในอินสเปกเตอร์ของปลั๊กอิน:', appIdSample:'yahooAppId: AppID Yahoo ของคุณ', searchFailAppId:'ค้นหาล้มเหลว ตรวจสอบ AppID และเครือข่าย (CORS)', yahooWarn:'หมายเหตุ: yahooAppId อาจรั่วไหลได้ อย่าใช้บนเว็บไซต์สาธารณะ', googleWarn:'หมายเหตุ: googleMapsApiKey อาจรั่วไหลได้ อย่าใช้บนเว็บไซต์สาธารณะ', googleKeyMissing:'ยังไม่ได้ตั้ง googleMapsApiKey เพิ่มบรรทัดต่อไปนี้ในอินสเปกเตอร์ของปลั๊กอิน:', googleKeySample:'googleMapsApiKey: คีย์ API Google Maps ของคุณ', manageSecretWarn:'หมายเหตุ: geminiApiKey: และ yahooAppId: ที่เขียนที่นี่จะถูกบันทึกพร้อมโปรเจกต์และเผยแพร่ให้ผู้เยี่ยมชมไซต์ทุกคน',
    camsTitle:'พรีเซ็ตกล้อง', camHelp:'cam:ชื่อ|ละติจูด|ลองจิจูด<br>cam:ชื่อ|ละติจูด|ลองจิจูด|h=ความสูง(m)<br>cam:ชื่อ|ละติจูด|ลองจิจูด|h=ความสูง|d=ทิศ&deg;|p=ความเอียง&deg;<br><br>ตัวอย่าง: cam:สถานีโตเกียว|35.6812|139.7671<br>ตัวอย่าง: cam:ภูเขาไฟฟูจิ|35.3606|138.7274|h=5000|p=-30<br><br>พารามิเตอร์ที่ไม่ระบุจะใช้การตั้งค่ากล้องปัจจุบัน', currentCamera:'กล้องปัจจุบัน', positionLabel:'ตำแหน่ง', hprLabel:'ทิศ/ความเอียง/มุมกลิ้ง', flyToTitle:'บินไป {v}',
    terrain:'ภูมิประเทศ', shadow:'เงา', depthTest:'ทดสอบความลึก', on:'เปิด', off:'ปิด', geojsonDrape:'การวาง GeoJSON 3D',
    start:'เริ่ม', stop:'สิ้นสุด', current:'ปัจจุบัน', apply:'ใช้', sentCurrent:'ส่งแล้ว (ตั้งค่าปัจจุบัน)', sent:'ส่งแล้ว', sendFailed:'ส่งไม่สำเร็จ',
    legendTitle:'คำอธิบาย', legendInstr:'เพิ่ม "legend: URLรูปภาพ" ในข้อความอินสเปกเตอร์', legendMain:'หลัก',
    attrTitle:'คุณลักษณะ', noFeature:'ไม่ได้เลือกฟีเจอร์', noAttrAvail:'ไม่มีคุณลักษณะหรือยกเลิกการเลือกแล้ว', backToAttrList:'กลับไปที่รายการ', openNewTab:'เปิดในแท็บใหม่ (ข้าม sandbox)',
    selectLayer:'เลือกเลเยอร์', attrOrValuePh:'ค้นหาคุณลักษณะหรือค่า', selectLayerPrompt:'โปรดเลือกเลเยอร์', countFmt:'{rows} รายการ / {attrs} คุณลักษณะ', sortTitle:'คลิกเพื่อจัดเรียง', noMatchingFeatures:'ไม่มีฟีเจอร์ที่ตรงกัน', clickToFly:'คลิกเพื่อบินไป', limitSuffix:' (แสดงสูงสุด {n})', closeAria:'ปิด',
    noUrlConfigured: 'ยังไม่ได้ตั้งค่า URL',
    tabFly: 'บิน',
    flyRoute: 'เส้นทาง', flyRoutePh: 'เลือกเส้นทาง', flyDraw: 'วาด', flyDrawing: 'กำลังวาด — คลิกแผนที่เพื่อเพิ่มจุด ดับเบิลคลิกเพื่อจบ', flyCancelDraw: 'ยกเลิก', flyDelete: 'ลบ', flySaveGeo: 'บันทึก', flySaved: 'บันทึกแล้ว!',
    flyPlay: 'เล่น', flyPause: 'หยุดชั่วคราว', flyStop: 'หยุด', flyRestart: 'เริ่มใหม่',
    flySpeedLbl: 'ความเร็ว (km/h)', flyHeightLbl: 'ความสูง (m)', flyPitchLbl: 'พิตช์ (°)', flyLoop: 'วนซ้ำ', flyView: 'มุมมอง', flyViewCam: 'นั่งร่วม', flyViewCenter: 'ทางอากาศ',
    flyPreset: 'พรีเซ็ต', flyPresetCustom: 'กำหนดเอง', flyPresetWalk: 'เดิน (h2 s5 p-5)', flyPresetDrive: 'รถยนต์ (h2 s60 p-10)', flyPresetDrone: 'โดรน (h200 s60 p-30)', flyPresetOverview: 'ภาพรวม (h1000 s300 p-45)', flyReverse: 'กลับทาง', flyImport: 'นำเข้า',
 flyBack: '◀ ถอยหลัง', flyBackHint: 'เล่นเส้นทางย้อนหลัง / หยุดชั่วคราว',
 flyDblHint: 'ดับเบิลคลิกแผนที่: เล่น/หยุดชั่วคราว · ดับเบิลคลิกขวา: เล่นย้อนหลัง · ล้อ: ความเร็ว',
    flyShowLine: 'แสดงเส้นทาง', flyLoading: 'กำลังโหลดเส้นทาง...', flySampling: 'กำลังสุ่มภูมิประเทศ...', flyDone: 'เสร็จสิ้น', flyErr: 'โหลดเส้นทางไม่สำเร็จ', flyNoRoute: 'ยังไม่ได้เลือกเส้นทาง',
    flyViewHint: 'นั่งร่วม: กล้องเคลื่อนตามเส้นทางมองไปข้างหน้า ทางอากาศ: กล้องติดตามจุดที่เคลื่อนที่จากด้านหลังและด้านบน',
    flyHelp: 'fly_geojson:ชื่อ|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = มุมมองนั่งร่วมเคลื่อนตามเส้นทาง; center (=chase) = มุมมองทางอากาศที่ติดตามจุดจากด้านหลัง<br>ค่าที่แก้ไขมีผลทันที แม้ขณะบิน<br>หรือกด วาด แล้วสเก็ตช์เส้นหลายทบบนแผนที่',
    svOpen: 'Street View', captureBtn: 'จับภาพ', capturedHint: 'คลิกขวาที่ภาพเพื่อบันทึก'
  },
  vi: {
    minimize:'Thu nhỏ', restore:'Khôi phục', move:'Di chuyển', moveCamera:'Di chuyển camera',
    tabLayers:'Lớp', tabLegend:'Chú giải', tabSearch:'Tìm kiếm', tabCams:'Camera', tabInfo:'Thông tin', tabShare:'Chia sẻ', tabSet:'Cài đặt', tabAttr:'Thuộc tính', tabDisplay:'Hiển thị', manageTitle:'Quản lý', manageInspectorLbl:'Văn bản cài đặt', manageApply:'Áp dụng', manageApplied:'Đã áp dụng', importTitle:'Nhập tệp', importAddFile:'Thêm tệp', importHint:'Files: .geojson .json .fgb .parquet .gpkg .csv .tsv .kasc',
    layersTitle:'Lớp', note:'Lưu ý', refresh:'Làm mới', refreshTitle:'Bắt buộc làm mới lớp người dùng',
    generateLink:'Tạo liên kết', generating:'Đang tạo...', copy:'Sao chép', copied:'Đã sao chép!',
    sharePasteLabel:'Dán URL bên dưới.', sharePastePh:'Dán URL hoặc ?lat=...', load:'Tải', loaded:'Đã tải!', invalidData:'Dữ liệu không hợp lệ', parseError:'Lỗi phân tích', error:'Lỗi',
    shareReadUrl:'Đến tham số URL hiện tại', urlLoadFlyTo:'Tải URL & bay tới', loading:'Đang tải...',
    shareFlyCurrentLabel:'Di chuyển từ vị trí hiện tại', flyToCurrentLoc:'Bay tới vị trí hiện tại', getting:'Đang lấy...', restored:'Đã khôi phục!', noLatLng:'Không có lat/lng', noParams:'Không có tham số', imported:'Đã nhập!',
    vectorSearch:'Tìm kiếm vector', allSelect:'Tất cả', selectValue:'Chọn giá trị', fly:'Bay', textSearchPh:'Tìm theo văn bản', searchGo:'Tìm', updateVector:'Cập nhật dữ liệu vector', attrValueList:'Thuộc tính & giá trị', attrsLoaded:'Đã tải {n} thuộc tính', noAttrVector:'Không có lớp vector có thuộc tính', noMatch:'Không khớp',
    addrSearch:'Tìm địa chỉ', providerGsi:'GSI', searchPh:'Nhập từ khóa', searching:'Đang tìm...', noResults:'Không có kết quả', searchFailCors:'Tìm kiếm thất bại. Kiểm tra mạng (CORS).', appIdMissing:'Chưa đặt AppID. Thêm dòng sau vào inspector của plugin:', appIdSample:'yahooAppId: AppID Yahoo của bạn', searchFailAppId:'Tìm kiếm thất bại. Kiểm tra AppID và mạng (CORS).', yahooWarn:'Lưu ý: yahooAppId có thể bị lộ. Không dùng trên trang công khai.', googleWarn:'Lưu ý: googleMapsApiKey có thể bị lộ. Không dùng trên trang công khai.', googleKeyMissing:'Chưa đặt googleMapsApiKey. Thêm dòng sau vào inspector của plugin:', googleKeySample:'googleMapsApiKey: khóa API Google Maps của bạn', manageSecretWarn:'Lưu ý: geminiApiKey: và yahooAppId: viết ở đây được lưu cùng dự án và công khai tới mọi khách truy cập trang.',
    camsTitle:'Preset camera', camHelp:'cam:Tiêu đề|Vĩ độ|Kinh độ<br>cam:Tiêu đề|Vĩ độ|Kinh độ|h=Độ cao(m)<br>cam:Tiêu đề|Vĩ độ|Kinh độ|h=Độ cao|d=Hướng&deg;|p=Nghiêng&deg;<br><br>VD: cam:Ga Tokyo|35.6812|139.7671<br>VD: cam:Núi Phú Sĩ|35.3606|138.7274|h=5000|p=-30<br><br>Tham số không chỉ định sẽ giữ cài đặt camera hiện tại', currentCamera:'Camera hiện tại', positionLabel:'Vị trí', hprLabel:'Hướng/Nghiêng/Cuộn', flyToTitle:'Bay tới {v}',
    terrain:'Địa hình', shadow:'Bóng', depthTest:'Kiểm tra độ sâu', on:'BẬT', off:'TẮT', geojsonDrape:'Drape 3D GeoJSON',
    start:'Bắt đầu', stop:'Kết thúc', current:'Hiện tại', apply:'Áp dụng', sentCurrent:'Đã gửi (đặt hiện tại)', sent:'Đã gửi', sendFailed:'Gửi thất bại',
    legendTitle:'Chú giải', legendInstr:'Thêm "legend: URLẢnh" vào văn bản inspector.', legendMain:'Chính',
    attrTitle:'Thuộc tính', noFeature:'Chưa chọn đối tượng.', noAttrAvail:'Không có thuộc tính hoặc đã bỏ chọn.', backToAttrList:'Quay lại danh sách', openNewTab:'Mở trong tab mới (bỏ qua sandbox)',
    selectLayer:'Chọn lớp', attrOrValuePh:'Tìm thuộc tính hoặc giá trị', selectLayerPrompt:'Vui lòng chọn lớp', countFmt:'{rows} mục / {attrs} thuộc tính', sortTitle:'Nhấp để sắp xếp', noMatchingFeatures:'Không có đối tượng phù hợp', clickToFly:'Nhấp để bay', limitSuffix:' (hiển thị tối đa {n})', closeAria:'Đóng',
    noUrlConfigured: 'Chưa cấu hình URL',
    tabFly: 'Bay',
    flyRoute: 'Tuyến đường', flyRoutePh: 'Chọn tuyến đường', flyDraw: 'Vẽ', flyDrawing: 'Đang vẽ — nhấp bản đồ để thêm điểm, nhấp đúp để kết thúc', flyCancelDraw: 'Hủy', flyDelete: 'Xóa', flySaveGeo: 'Lưu', flySaved: 'Đã lưu!',
    flyPlay: 'Phát', flyPause: 'Tạm dừng', flyStop: 'Dừng', flyRestart: 'Chơi lại',
    flySpeedLbl: 'Tốc độ (km/h)', flyHeightLbl: 'Độ cao (m)', flyPitchLbl: 'Pitch (°)', flyLoop: 'Lặp lại', flyView: 'Góc nhìn', flyViewCam: 'Đi cùng', flyViewCenter: 'Trên không',
    flyPreset: 'Cài sẵn', flyPresetCustom: 'Tùy chỉnh', flyPresetWalk: 'Đi bộ (h2 s5 p-5)', flyPresetDrive: 'Ô tô (h2 s60 p-10)', flyPresetDrone: 'Drone (h200 s60 p-30)', flyPresetOverview: 'Tổng quan (h1000 s300 p-45)', flyReverse: 'Đảo chiều', flyImport: 'Nhập',
 flyBack: '◀ Lùi', flyBackHint: 'Phát tuyến theo chiều lùi / tạm dừng',
 flyDblHint: 'Nhấp đúp bản đồ: phát/tạm dừng · nhấp đúp phải: phát lùi · con lăn: tốc độ',
    flyShowLine: 'Hiện tuyến đường', flyLoading: 'Đang tải tuyến...', flySampling: 'Đang lấy mẫu địa hình...', flyDone: 'Hoàn tất', flyErr: 'Không tải được tuyến', flyNoRoute: 'Chưa chọn tuyến',
    flyViewHint: 'Đi cùng: camera đi trên tuyến nhìn về phía trước. Trên không: camera theo dõi điểm di chuyển từ phía sau và phía trên.',
    flyHelp: 'fly_geojson:Tên|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = góc nhìn đi cùng di chuyển trên tuyến; center (=chase) = góc nhìn trên không theo dõi điểm từ phía sau.<br>Thay đổi áp dụng ngay, kể cả khi đang bay.<br>Hoặc bấm Vẽ và phác thảo đường gấp khúc trên bản đồ.',
    svOpen: 'Street View', captureBtn: 'Chụp', capturedHint: 'Nhấp chuột phải vào ảnh để lưu'
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
    // The fly-route preview line is transient visualization, not a user-managed
    // layer — keep it out of the layer list (also covers stale/orphan ids by title)
    try {
      if (layer && (layer.id === _flyRouteLayerId || layer.title === FLY_ROUTE_LAYER_TITLE)) return;
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

  // Fly route options (inspector-defined fly_geojson: lines). Drawn routes are
  // appended at runtime by the 'flyDrawnList' message.
  const escOpt = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const flyRouteOptions = _flyRoutes.map((r, i) => {
      const title = (r && r.title) ? String(r.title) : ('route ' + i);
      return `<option value="i:${i}">${escOpt(title)}</option>`;
  }).join('');

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

  /* Action buttons (FLY / Share / Settings) right-aligned at the end of the
     tab bar — KASUGAI Canvas .panel-manage style icon buttons */
  .action-group{ margin-left:auto; display:flex; gap:8px; align-items:center; }
  .action-btn{ flex:0 0 26px; min-width:26px; min-height:26px; padding:1px 4px; border:0; border-radius:4px; background:rgba(49,86,79,.16); color:#31564f; font-size:14px; line-height:1; cursor:pointer; }
  .action-btn:hover{ background:rgba(49,86,79,.26); }
  .action-btn.active{ background:rgba(49,86,79,.36); color:#31564f; }

  /* Minimized state: shrink padding and hide panels */
  .primary-background.minimized{ padding:6px; }
  .primary-background.minimized #layers-panel,
  .primary-background.minimized #cams-panel,
  .primary-background.minimized #settings-panel,
  .primary-background.minimized #info-panel,
  .primary-background.minimized #legend-panel,
  .primary-background.minimized #share-panel,
  .primary-background.minimized #fly-panel,
  .primary-background.minimized #manage-panel,
  .primary-background.minimized #attr-panel { display:none !important; }

  /* Generic styling system that provides consistent UI components and styling across all plugins */

  /* Panel Scroll Configuration */
  /* Limit panels to fixed height to ensure scrollbar appears even if window auto-resizes */
  #layers-panel, #legend-panel, #cams-panel, #settings-panel, #search-panel, #info-panel, #attr-panel, #fly-panel, #manage-panel {
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

  /* Fly route settings: label above input, 3 columns — fits within 300px panel */
  .fly-grid{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2px 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .fly-grid .fly-cell{
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .fly-grid .fly-cell label{
    flex: 1;
    font-size: 0.72em;
    color: #555;
    line-height: 1.3;
  }
  .fly-grid .fly-cell input[type="number"],
  .fly-grid .fly-cell select{
    width: 100%;
    min-width: 0;
    height: 22px;
    padding: 1px 3px;
    border: 1px solid #ccc;
    border-radius: 3px;
    font-size: 0.85em;
    background: #fff;
    box-sizing: border-box;
  }
  .fly-grid .fly-cell input[type="checkbox"]{
    margin: 3px 0 0 1px;
  }
  #fly-help, #fly-status{ overflow-wrap: anywhere; }
  #fly-play-btn.fly-dir-on, #fly-back-btn.fly-dir-on{ box-shadow: inset 0 0 0 2px #4a90d9; }
  /* Keep width:100% boxes inside the 300px panel (border/padding would overflow without border-box) */
  .primary-background textarea, .primary-background iframe{ box-sizing: border-box; max-width: 100%; }
  #time-row > div{ min-width: 0; }
  #time-row input[type="datetime-local"]{ flex: 1; min-width: 0; max-width: 100%; box-sizing: border-box; }
  /* GeoJSON drape row: let the status label wrap so label + select fit the row */
  #geojson-drape-status{ white-space: normal; min-width: 0; }

  /* Terrain row: compact, text left, toggle right */
  .terrain-row{
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    min-height: 28px;
    justify-content: space-between;
    flex-wrap: nowrap;
  }
  .terrain-row .text-md{ font-size: 14px; margin: 0; flex: 0 1 auto; white-space: nowrap; }
  .toggle { margin-left: 8px; display: inline-flex; align-items: center; gap:6px; white-space: nowrap; }
  .toggle input { width: auto; margin: 0; vertical-align: middle; }
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
    <button class="tab" data-target="attr-panel" aria-selected="false" data-i18n="tabAttr">Attr</button>
    <button class="tab" data-target="cams-panel" aria-selected="false" data-i18n="tabCams">Cams</button>
    <button class="tab" data-target="settings-panel" aria-selected="false" data-i18n="tabDisplay">Display</button>
    <button class="tab" data-target="info-panel" aria-selected="false" data-i18n="tabInfo">Info</button>
    <span class="action-group">
    <button class="action-btn" data-target="fly-panel" aria-pressed="false" title="Fly" aria-label="Fly" data-i18n-title="tabFly" data-i18n-aria="tabFly">✈️</button>
    <button class="action-btn" data-target="share-panel" aria-pressed="false" title="Share" aria-label="Share" data-i18n-title="tabShare" data-i18n-aria="tabShare">🔗</button>
    <button class="action-btn" id="manage-open-btn" data-target="manage-panel" aria-pressed="false" title="Manage" aria-label="Manage" data-i18n-title="manageTitle" data-i18n-aria="manageTitle">⚙️</button>
    </span>
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

    <div style="margin-top:12px;border-top:1px solid #ddd;padding-top:8px;display:flex;gap:6px;">
      <button id="open-streetview-btn" class="btn-primary p-6" style="flex:1;font-size:0.9em;" data-i18n="svOpen">Street View</button>
      <button id="viewer-capture-btn" class="btn-primary p-6" style="flex:1;font-size:0.9em;" data-i18n="captureBtn">Capture</button>
    </div>
    <div id="capture-result" style="margin-top:8px;display:none;">
      <img id="capture-img" style="max-width:100%;border:1px solid #ccc;border-radius:4px;display:block;" alt="capture" />
      <div class="text-sm" style="color:#666;margin-top:4px;font-size:0.8em;" data-i18n="capturedHint">Right-click the image to save</div>
    </div>
    </div>

  <div id="fly-panel" style="display:none;">
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;">
      <div style="font-weight:600;" data-i18n="flyRoute">Route</div>
      <select id="fly-route-select" style="flex:1;border:1px solid #ccc;border-radius:4px;padding:6px;font-size:0.9em;background:#fff;min-width:0;">
        ${flyRouteOptions}
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;align-items:stretch;">
      <button id="fly-draw-btn" class="btn-primary p-6" style="flex:1;font-size:0.9em;white-space:nowrap;" data-i18n="flyDraw">Draw</button>
      <button id="fly-import-btn" class="btn-primary p-6" style="flex:1;font-size:0.9em;white-space:nowrap;" data-i18n="flyImport" data-i18n-title="flyImport">Import</button>
      <input id="fly-import-file" type="file" accept=".geojson,.json,application/geo+json,application/json" style="display:none;">
      <button id="fly-delete-btn" class="btn-primary p-6" style="flex:1;font-size:0.9em;white-space:nowrap;" data-i18n="flyDelete" disabled>Delete</button>
      <button id="fly-copygeo-btn" class="btn-primary p-6" style="flex:1;font-size:0.9em;white-space:nowrap;" data-i18n="flySaveGeo" disabled>Save</button>
    </div>
    <div class="primary-background terrain-row rounded-sm" style="margin-bottom:8px;">
      <div class="text-md" id="fly-line-status" data-i18n="flyShowLine">Show route</div>
      <label class="toggle" id="fly-line-toggle" aria-label="Show route line">
        <input type="checkbox" id="fly-line-check" checked>
        <span class="slider"></span>
      </label>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;">
      <button id="fly-back-btn" class="btn-primary p-8" style="flex:1;font-size:0.85em;white-space:nowrap;" aria-pressed="false" data-i18n="flyBack" data-i18n-title="flyBackHint" data-i18n-aria="flyBackHint">&#9664; Back</button>
      <button id="fly-play-btn" class="btn-primary p-8" style="flex:1;" aria-pressed="false" data-i18n="flyPlay">Play</button>
      <button id="fly-pause-btn" class="btn-primary p-8" style="flex:1;" data-i18n="flyPause" disabled>Pause</button>
      <button id="fly-stop-btn" class="btn-primary p-8" style="flex:1;" data-i18n="flyStop" disabled>Stop</button>
      <button id="fly-reverse-btn" class="btn-primary p-8" style="flex:1;font-size:0.85em;white-space:nowrap;" data-i18n="flyReverse" disabled>Reverse</button>
    </div>
    <div style="margin-bottom:6px;">
      <select id="fly-preset" data-i18n-title="flyPreset" data-i18n-aria="flyPreset" title="Preset" aria-label="Preset" style="width:100%;border:1px solid #ccc;border-radius:4px;padding:5px 6px;font-size:0.9em;background:#fff;box-sizing:border-box;">
        <option value="custom" data-i18n="flyPresetCustom">Custom</option>
        <option value="walk" data-i18n="flyPresetWalk">Walk (h2 s5 p-5)</option>
        <option value="drive" data-i18n="flyPresetDrive">Drive (h2 s60 p-10)</option>
        <option value="drone" data-i18n="flyPresetDrone">Drone (h200 s60 p-30)</option>
        <option value="overview" data-i18n="flyPresetOverview">Overview (h1000 s300 p-45)</option>
      </select>
    </div>
    <div class="fly-grid" style="margin-bottom:6px;">
      <div class="fly-cell"><label data-i18n="flySpeedLbl">Speed (km/h)</label><input type="number" step="any" id="fly-speed" value="30"></div>
      <div class="fly-cell"><label data-i18n="flyHeightLbl">AGL (m)</label><input type="number" step="any" id="fly-height" value="0"></div>
      <div class="fly-cell"><label data-i18n="flyPitchLbl">Pitch (°)</label><input type="number" step="any" id="fly-pitch" value="-10"></div>
      <div class="fly-cell"><label data-i18n="flyView">View</label>
        <select id="fly-view" data-i18n-title="flyViewHint" title="Ride: camera travels on the route looking ahead. Aerial: camera tracks the moving point from behind and above.">
          <option value="camera" data-i18n="flyViewCam">Ride</option>
          <option value="center" data-i18n="flyViewCenter">Aerial</option>
        </select>
      </div>
      <div class="fly-cell"><label data-i18n="flyLoop">Loop</label><input type="checkbox" id="fly-loop"></div>
    </div>
    <div id="fly-status" class="text-sm" style="color:#666;min-height:1.2em;">&nbsp;</div>
    <div id="fly-help" class="text-sm" style="color:#888;padding:8px 0 2px;font-size:0.8em;" data-i18n-html="flyHelp">fly_geojson:Name|URL|speed=30|height=0|pitch=-10|loop=true|view=camera|center<br>camera (=pov) = ride on the route looking ahead; center (=chase) = aerial tracking of the point from behind/above.<br>Field changes apply immediately, even while flying.<br>Or press Draw and sketch a polyline on the map.</div>
    <div id="fly-dblhint" class="text-sm" style="color:#888;padding:0 0 8px;font-size:0.8em;" data-i18n-html="flyDblHint">Map double-click: play/pause &middot; right double-click: play backward</div>
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
        <option value="google">Google</option>
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
    <div id="search-google-warning" style="font-size:0.9em;color:#a33;margin-top:8px;display:none;" data-i18n="googleWarn">Note: googleMapsApiKey may be exposed. Do not use on public sites.</div>
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

  <div id="manage-panel" style="display:none;">
    <div style="font-weight:600;margin-bottom:8px;" data-i18n="manageTitle">Manage</div>
    <label class="text-sm" for="manage-inspector-text" data-i18n="manageInspectorLbl">Settings text</label>
    <textarea id="manage-inspector-text" spellcheck="false" style="width:100%;height:180px;font-size:0.75em;border:1px solid #ccc;border-radius:4px;font-family:monospace;margin-top:4px;"></textarea>
    <div class="text-sm" style="color:#a33;font-size:0.8em;line-height:1.35;margin-top:4px;" data-i18n="manageSecretWarn">Note: geminiApiKey: and yahooAppId: written here are saved with the project and published to all site visitors.</div>
    <div style="display:flex;gap:6px;margin-top:6px;">
      <button id="manage-apply-btn" class="btn-primary p-6" style="flex:1;" data-i18n="manageApply">Apply</button>
      <button id="manage-copy-btn" class="btn-primary p-6" style="flex:1;" data-i18n="copy">Copy</button>
    </div>
    <div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px;">
      <label class="text-sm" for="import-file-btn" data-i18n="importTitle">File import</label>
      <div style="display:flex;gap:6px;margin-top:4px;">
        <input id="import-file-input" type="file" multiple accept=".geojson,.json,.fgb,.parquet,.gpkg,.csv,.tsv,.kasc,.txt" style="display:none;" />
        <button id="import-file-btn" class="btn-primary p-6" style="flex:1;" data-i18n="importAddFile">Add files</button>
      </div>
      <div class="text-sm" style="color:#888;font-size:0.72em;margin-top:4px;line-height:1.35;" data-i18n="importHint">.geojson .json .fgb .parquet .gpkg .csv .tsv / .kasc appends lines to the settings text</div>
      <div id="import-status" class="text-sm" style="color:#666;min-height:1.2em;margin-top:2px;">&nbsp;</div>
    </div>
    <div id="manage-status" class="text-sm" style="color:#666;min-height:1.2em;margin-top:4px;">&nbsp;</div>
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
  // === injected: QGIS .qml style engine + QML->Re:Earth translator ===
  // (regenerate: node scripts/build_qml_inline.js)
  // __QML_INLINE_BEGIN__
// --- qml-style.js (vendored, do not edit inline) ---
// QGIS レイヤースタイル(.qml / QGIS Layer Style)のパース・コンパイルと Cesium への適用。
// QGIS 3.x/4.x が出力する <renderer-v2> 形式を対象に、レンダラ(単一/分類/段階/ルール)・
// シンボルレイヤ(マーカー/ライン/塗りつぶし)・データ定義プロパティ・ラベルを
// 「属性 → 正規化スタイル」の関数にコンパイルする。
// Cesium で再現できない要素(ジオメトリジェネレータ・SVGのパス解釈不能なもの等)は
// 最も近い表現にフォールバックし、warnings に記録する。

const Cesium = window.Cesium;

const MM_TO_PX = 96 / 25.4;       // 1mm ≒ 3.78px (96dpi 換算)
const PT_TO_PX = 96 / 72;         // 1pt ≒ 1.33px
// 塗りつぶしパターンの実寸換算に使う仮の参照縮尺(1:S)。QGIS の mm 指定を
// 「S 分の1 の表示縮尺での見た目」に揃えるための近似値
const REFERENCE_SCALE = 10000;
const METERS_PER_PX = 0.00028 * REFERENCE_SCALE; // 1px ≒ 2.8m

// ---------------------------------------------------------------------------
// 小道具
// ---------------------------------------------------------------------------

function warnOnce(warnings, message) {
  if (!warnings.has(message)) warnings.add(message);
}

// "r,g,b,a[,spec:...]" / "#rrggbb[aa]" / "r,g,b" → [r,g,b,a] (0-1 float)
function parseQgisColor(value, fallback = null) {
  if (value == null) return fallback;
  const s = String(value).trim();
  if (!s) return fallback;
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return fallback;
    if (hex.length === 8) return [((n >> 24) & 255) / 255, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    if (hex.length === 6) return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
    return fallback;
  }
  const parts = s.split(",");
  if (parts.length < 3) return fallback;
  const r = Number(parts[0]), g = Number(parts[1]), b = Number(parts[2]);
  if (![r, g, b].every(Number.isFinite)) return fallback;
  // 5つ目以降は "rgb:..." 等のカラースペース注記なので無視
  const a = parts.length >= 4 && parts[3].indexOf(":") < 0 ? Number(parts[3]) : 255;
  return [r / 255, g / 255, b / 255, Number.isFinite(a) ? a / 255 : 1];
}

function toCesiumColor(rgba) {
  return new Cesium.Color(rgba[0], rgba[1], rgba[2], rgba[3]);
}

function withAlpha(rgba, alpha) {
  return [rgba[0], rgba[1], rgba[2], rgba[3] * alpha];
}

// QGIS のサイズ単位を px に変換する。MapUnit/MetersInMapUnits は実用上
// 度単位データでは意味を持たないため、近似として px 相当に丸める
function sizeToPx(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  switch (unit) {
    case "MM": return n * MM_TO_PX;
    case "Point": return n * PT_TO_PX;
    case "Pixel": return n;
    case "MapUnit":
    case "MetersInMapUnits":
    default: return n * MM_TO_PX * 0.3; // 近似: 実用サイズに収める
  }
}

// "5;2" のようなカスタムダッシュ(線幅単位)または線種名 → [onPx, offPx, ...]
function dashPattern(styleName, customDash, widthPx) {
  if (customDash && /^\\d/.test(String(customDash))) {
    const seg = String(customDash).split(";").map(v => Number(v) * widthPx).filter(v => v > 0);
    if (seg.length >= 2) return seg;
  }
  switch (String(styleName || "solid").toLowerCase().replace(/[_\\s]/g, "")) {
    case "solid": return null;
    case "dash":
    case "dashline": return [4 * widthPx, 2 * widthPx];
    case "dot": return [1.5 * widthPx, 2 * widthPx];
    case "dashdot":
    case "dashdotline": return [4 * widthPx, 2 * widthPx, 1.5 * widthPx, 2 * widthPx];
    case "dashdotdot":
    case "dashdotdotline": return [4 * widthPx, 2 * widthPx, 1.5 * widthPx, 2 * widthPx, 1.5 * widthPx, 2 * widthPx];
    case "nopen":
    case "no": return "none";
    default: return null;
  }
}

// <Option> ツリー → JS 値(Map は再帰、それ以外は value 属性かテキスト)
function optionValue(el) {
  const type = (el.getAttribute("type") || "").toLowerCase();
  if (type === "map" || type === "list") {
    const out = type === "map" ? {} : [];
    for (const child of el.children) {
      if (child.tagName !== "Option") continue;
      const name = child.getAttribute("name");
      if (type === "map") out[name] = optionValue(child);
      else out.push(optionValue(child));
    }
    return out;
  }
  const v = el.getAttribute("value");
  return v !== null ? v : (el.textContent || "");
}

function optionMap(containerEl) {
  if (!containerEl) return {};
  const opt = [...containerEl.children].find(c => c.tagName === "Option" && (c.getAttribute("type") || "").toLowerCase() === "map")
    || [...containerEl.children].find(c => c.tagName === "Option");
  if (!opt) return {};
  const parsed = optionValue(opt);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

// <data_defined_properties> → { propName: {active, expression, field, type} }
function parseDataDefined(symbolOrLayerEl) {
  const container = [...(symbolOrLayerEl?.children || [])].find(c => c.tagName === "data_defined_properties");
  const map = optionMap(container);
  const out = {};
  for (const [name, def] of Object.entries(map)) {
    if (!def || typeof def !== "object") continue;
    const active = String(def.active ?? "0") === "1" || String(def.active).toLowerCase() === "true";
    if (!active) continue;
    out[name] = { expression: def.expression ?? "", field: def.field ?? "", type: String(def.type ?? "") };
  }
  return out;
}

// DD エントリから値を解決する。expression 優先、なければ field 参照
function ddValue(dd, names, props, fallback) {
  for (const name of names) {
    const entry = dd?.[name];
    if (!entry) continue;
    if (entry.expression) {
      const v = evalExpression(entry.expression, props);
      if (v !== undefined && v !== null) return v;
    }
    if (entry.field && props && props[entry.field] !== undefined) return props[entry.field];
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// QGIS 式評価器(ルールベース・graduated の式・データ定義プロパティ用)
// サブセット実装: リテラル・フィールド参照・比較/算術/論理・IN/LIKE/IS NULL・
// CASE WHEN・主要関数。評価不能な式は例外 → 呼び出し側でフォールバックする
// ---------------------------------------------------------------------------

function tokenizeExpr(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  const push = (t, v) => tokens.push({ t, v });
  while (i < n) {
    const ch = src[i];
    if (/\\s/.test(ch)) { i++; continue; }
    if (ch === "'") {
      let s = "";
      i++;
      while (i < n) {
        if (src[i] === "'") {
          if (src[i + 1] === "'") { s += "'"; i += 2; continue; }
          i++; break;
        }
        s += src[i++];
      }
      push("str", s);
      continue;
    }
    if (ch === '"') {
      let s = "";
      i++;
      while (i < n) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') { s += '"'; i += 2; continue; }
          i++; break;
        }
        s += src[i++];
      }
      push("field", s);
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let s = "";
      while (i < n && /[0-9.eE+-]/.test(src[i])) {
        // e+/- 以外の +/- は数値の一部にしない
        if ((src[i] === "+" || src[i] === "-") && !/[eE]/.test(src[i - 1] || "")) break;
        s += src[i++];
      }
      push("num", Number(s));
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "<>", "!=", "||"].includes(two)) { push("op", two); i += 2; continue; }
    if ("+-*/%=<>()".includes(ch)) { push(ch === "(" ? "lparen" : ch === ")" ? "rparen" : "op", ch); i++; continue; }
    if (ch === ",") { push("comma", ch); i++; continue; }
    if (/[A-Za-z_-￿]/.test(ch)) {
      let s = "";
      while (i < n && /[A-Za-z0-9_.$-￿]/.test(src[i])) s += src[i++];
      push("ident", s);
      continue;
    }
    // 未知の文字はスキップ
    i++;
  }
  return tokens;
}

// QGIS 式関数 is_layer_visible('名前') の解決先。
// アプリ側が setLayerVisibilityResolver で「レイヤー名 → 表示状態か」を注入する。
// 未設定時・レイヤー未発見時は false(QGIS でレイヤー無し/非表示と同じ扱い)
let layerVisibilityResolver = null;
function setLayerVisibilityResolver(fn) {
  layerVisibilityResolver = (typeof fn === "function") ? fn : null;
}

const EXPR_FUNCS = {
  abs: Math.abs,
  ceil: Math.ceil, ceiling: Math.ceil, floor: Math.floor,
  round: (v, dp = 0) => { const m = 10 ** dp; return Math.round(Number(v) * m) / m; },
  exp: Math.exp, ln: Math.log, log10: Math.log10, sqrt: Math.sqrt,
  log: (a, b) => (b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)),
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: (a, b) => Math.atan2(a, b),
  radians: v => v * Math.PI / 180, degrees: v => v * 180 / Math.PI,
  pi: () => Math.PI,
  min: (...a) => Math.min(...a.map(Number)), max: (...a) => Math.max(...a.map(Number)),
  clamp: (mn, v, mx) => Math.min(Math.max(v, mn), mx),
  lower: s => String(s ?? "").toLowerCase(), upper: s => String(s ?? "").toUpperCase(),
  title: s => String(s ?? "").replace(/\\b\\w/g, c => c.toUpperCase()),
  length: s => String(s ?? "").length, len: s => String(s ?? "").length,
  substr: (s, start, len) => String(s ?? "").substr(Number(start) - 1, len === undefined ? undefined : Number(len)),
  left: (s, n) => String(s ?? "").slice(0, Number(n)), right: (s, n) => String(s ?? "").slice(-Number(n)),
  strpos: (s, sub) => { const i = String(s ?? "").indexOf(String(sub)); return i < 0 ? 0 : i + 1; },
  replace: (s, a, b) => String(s ?? "").split(String(a)).join(String(b)),
  trim: s => String(s ?? "").trim(), ltrim: s => String(s ?? "").replace(/^\\s+/, ""), rtrim: s => String(s ?? "").replace(/\\s+$/, ""),
  lpad: (s, n, c = " ") => String(s ?? "").padStart(Number(n), String(c)),
  rpad: (s, n, c = " ") => String(s ?? "").padEnd(Number(n), String(c)),
  concat: (...a) => a.map(v => v ?? "").join(""),
  format_number: (v, dp = 0) => Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }),
  to_int: v => parseInt(v, 10) || 0, to_real: v => Number(v) || 0,
  to_string: v => String(v ?? ""), to_text: v => String(v ?? ""),
  coalesce: (...a) => a.find(v => v !== null && v !== undefined),
  if: (c, a, b) => (c ? a : b),
  is_layer_visible: name => {
    try { return layerVisibilityResolver ? !!layerVisibilityResolver(String(name ?? "")) : false; }
    catch (e) { return false; }
  },
  scale_linear: (v, a1, a2, b1, b2) => b1 + (Number(v) - a1) * (b2 - b1) / ((a2 - a1) || 1),
  scale_exp: (v, a1, a2, b1, b2) => b1 + (Number(v) - a1) * (b2 - b1) / ((a2 - a1) || 1),
  rand: (a = 0, b = 1) => a + Math.random() * (b - a),
  randf: (a = 0, b = 1) => a + Math.random() * (b - a),
  regexp_match: (s, re) => { try { const m = String(s ?? "").search(new RegExp(String(re))); return m < 0 ? 0 : m + 1; } catch (e) { return 0; } },
  now: () => new Date(),
  year: d => new Date(d).getFullYear(), month: d => new Date(d).getMonth() + 1, day: d => new Date(d).getDate(),
  hour: d => new Date(d).getHours(), minute: d => new Date(d).getMinutes(), second: d => new Date(d).getSeconds(),
  array: (...a) => a,
};

function parseExpr(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isKw = (kw) => peek()?.t === "ident" && peek().v.toUpperCase() === kw;
  const eatKw = (kw) => { if (isKw(kw)) { pos++; return true; } return false; };

  function parseOr() {
    let left = parseAnd();
    while (isKw("OR")) { next(); left = { t: "or", a: left, b: parseAnd() }; }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    while (isKw("AND")) { next(); left = { t: "and", a: left, b: parseNot() }; }
    return left;
  }
  function parseNot() {
    if (eatKw("NOT")) return { t: "not", a: parseNot() };
    return parseCmp();
  }
  function parseCmp() {
    let left = parseAdd();
    for (;;) {
      const tk = peek();
      if (tk?.t === "op" && ["=", "<>", "!=", "<", "<=", ">", ">="].includes(tk.v)) {
        next();
        left = { t: "cmp", op: tk.v, a: left, b: parseAdd() };
        continue;
      }
      const not = isKw("NOT") ? (next(), true) : false;
      if (isKw("IN")) {
        next();
        const items = [];
        if (peek()?.t === "lparen") {
          next();
          while (peek() && peek().t !== "rparen") {
            items.push(parseOr());
            if (peek()?.t === "comma") next();
          }
          if (peek()?.t === "rparen") next();
        }
        left = { t: "in", a: left, items, not };
        continue;
      }
      if (isKw("LIKE") || isKw("ILIKE")) {
        const ci = next().v.toUpperCase() === "ILIKE";
        left = { t: "like", a: left, pattern: parseAdd(), ci, not };
        continue;
      }
      if (isKw("BETWEEN")) {
        next();
        const lo = parseAdd();
        eatKw("AND");
        const hi = parseAdd();
        left = { t: "between", a: left, lo, hi, not };
        continue;
      }
      if (isKw("IS")) {
        next();
        const n2 = eatKw("NOT");
        eatKw("NULL");
        left = { t: "isnull", a: left, not: n2 || not };
        continue;
      }
      if (not) { pos--; } // NOT を消費したが後続が比較語でない場合は戻す
      break;
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    for (;;) {
      const tk = peek();
      if (tk?.t === "op" && (tk.v === "+" || tk.v === "-" || tk.v === "||")) {
        next();
        left = { t: "arith", op: tk.v, a: left, b: parseMul() };
        continue;
      }
      break;
    }
    return left;
  }
  function parseMul() {
    let left = parseUnary();
    for (;;) {
      const tk = peek();
      if (tk?.t === "op" && (tk.v === "*" || tk.v === "/" || tk.v === "%")) {
        next();
        left = { t: "arith", op: tk.v, a: left, b: parseUnary() };
        continue;
      }
      break;
    }
    return left;
  }
  function parseUnary() {
    const tk = peek();
    if (tk?.t === "op" && (tk.v === "-" || tk.v === "+")) {
      next();
      return { t: "unary", op: tk.v, a: parseUnary() };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const tk = next();
    if (!tk) return { t: "lit", v: null };
    if (tk.t === "num") return { t: "lit", v: tk.v };
    if (tk.t === "str") return { t: "lit", v: tk.v };
    if (tk.t === "field") return { t: "field", v: tk.v };
    if (tk.t === "lparen") {
      const e = parseOr();
      if (peek()?.t === "rparen") next();
      return e;
    }
    if (tk.t === "ident") {
      const name = tk.v;
      const upper = name.toUpperCase();
      if (upper === "CASE") {
        // CASE [operand] WHEN c THEN v ... [ELSE v] END
        let operand = null;
        if (!isKw("WHEN")) operand = parseOr();
        const whens = [];
        let elseExpr = null;
        while (isKw("WHEN")) {
          next();
          const cond = parseOr();
          if (isKw("THEN")) next();
          const val = parseOr();
          whens.push([cond, val]);
        }
        if (isKw("ELSE")) { next(); elseExpr = parseOr(); }
        eatKw("END");
        return { t: "case", operand, whens, elseExpr };
      }
      if (upper === "NULL") return { t: "lit", v: null };
      if (upper === "TRUE") return { t: "lit", v: true };
      if (upper === "FALSE") return { t: "lit", v: false };
      if (peek()?.t === "lparen") {
        next();
        const args = [];
        while (peek() && peek().t !== "rparen") {
          args.push(parseOr());
          if (peek()?.t === "comma") next();
        }
        if (peek()?.t === "rparen") next();
        return { t: "call", name: name.toLowerCase(), args };
      }
      // クオート無し識別子はフィールド参照として扱う(QGIS の式も同じ解釈)
      return { t: "field", v: name };
    }
    return { t: "lit", v: null };
  }
  return parseOr();
}

function evalAst(node, props) {
  switch (node.t) {
    case "lit": return node.v;
    case "field": return props?.[node.v];
    case "or": return evalAst(node.a, props) || evalAst(node.b, props);
    case "and": return evalAst(node.a, props) && evalAst(node.b, props);
    case "not": return !evalAst(node.a, props);
    case "unary": { const v = Number(evalAst(node.a, props)); return node.op === "-" ? -v : v; }
    case "arith": {
      const a = evalAst(node.a, props), b = evalAst(node.b, props);
      if (node.op === "||") return String(a ?? "") + String(b ?? "");
      switch (node.op) {
        case "+": return Number(a) + Number(b);
        case "-": return Number(a) - Number(b);
        case "*": return Number(a) * Number(b);
        case "/": return Number(b) === 0 ? null : Number(a) / Number(b);
        case "%": return Number(b) === 0 ? null : Number(a) % Number(b);
      }
      return null;
    }
    case "cmp": {
      const a = evalAst(node.a, props), b = evalAst(node.b, props);
      switch (node.op) {
        case "=": return a == b || String(a) === String(b);
        case "<>": case "!=": return !(a == b || String(a) === String(b));
        case "<": return Number(a) < Number(b);
        case "<=": return Number(a) <= Number(b);
        case ">": return Number(a) > Number(b);
        case ">=": return Number(a) >= Number(b);
      }
      return false;
    }
    case "in": {
      const v = evalAst(node.a, props);
      const hit = node.items.some(item => {
        const iv = evalAst(item, props);
        return iv == v || String(iv) === String(v);
      });
      return node.not ? !hit : hit;
    }
    case "like": {
      const v = String(evalAst(node.a, props) ?? "");
      const p = String(evalAst(node.pattern, props) ?? "")
        .replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      const hit = new RegExp(\`^\${p}$\`, node.ci ? "i" : "").test(v);
      return node.not ? !hit : hit;
    }
    case "between": {
      const v = Number(evalAst(node.a, props));
      const hit = v >= Number(evalAst(node.lo, props)) && v <= Number(evalAst(node.hi, props));
      return node.not ? !hit : hit;
    }
    case "isnull": {
      const v = evalAst(node.a, props);
      const isNull = v === null || v === undefined;
      return node.not ? !isNull : isNull;
    }
    case "case": {
      const operand = node.operand ? evalAst(node.operand, props) : undefined;
      for (const [cond, val] of node.whens) {
        const c = evalAst(cond, props);
        const hit = node.operand ? (c == operand || String(c) === String(operand)) : !!c;
        if (hit) return evalAst(val, props);
      }
      return node.elseExpr ? evalAst(node.elseExpr, props) : null;
    }
    case "call": {
      const fn = EXPR_FUNCS[node.name];
      if (!fn) return null;
      const args = node.args.map(a => evalAst(a, props));
      if (node.name === "attribute") return props?.[args[0]];
      try { return fn(...args); } catch (e) { return null; }
    }
  }
  return null;
}

const exprCache = new Map();
// 式文字列 → (props)=>value の関数にコンパイルする。失敗時は常に null を返す関数
function compileExpr(src) {
  const key = String(src || "");
  if (exprCache.has(key)) return exprCache.get(key);
  let fn;
  try {
    const ast = parseExpr(tokenizeExpr(key));
    fn = props => evalAst(ast, props);
  } catch (e) {
    fn = () => null;
  }
  exprCache.set(key, fn);
  return fn;
}

function evalExpression(src, props) {
  return compileExpr(src)(props);
}

// ---------------------------------------------------------------------------
// QML パース: <symbols>/<renderer-v2>/<labeling>
// ---------------------------------------------------------------------------

function parseSymbolEl(symbolEl) {
  const layers = [];
  for (const layerEl of symbolEl.children) {
    if (layerEl.tagName !== "layer") continue;
    const props = optionMap(layerEl);
    let subSymbol = null;
    for (const c of layerEl.children) {
      if (c.tagName === "symbol") { subSymbol = parseSymbolEl(c); break; }
    }
    layers.push({
      cls: layerEl.getAttribute("class") || "",
      enabled: layerEl.getAttribute("enabled") !== "0",
      locked: layerEl.getAttribute("locked") === "1",
      pass: Number(layerEl.getAttribute("pass")) || 0,
      props,
      dd: parseDataDefined(layerEl),
      subSymbol,
    });
  }
  layers.sort((a, b) => a.pass - b.pass);
  return {
    name: symbolEl.getAttribute("name") || "",
    geomType: symbolEl.getAttribute("type") || "", // marker|line|fill
    alpha: Number(symbolEl.getAttribute("alpha") ?? "1") || 1,
    dd: parseDataDefined(symbolEl),
    layers,
  };
}

function parseSymbols(rendererEl) {
  const symbols = new Map();
  const container = [...rendererEl.children].find(c => c.tagName === "symbols");
  if (!container) return symbols;
  for (const s of container.children) {
    if (s.tagName !== "symbol") continue;
    const parsed = parseSymbolEl(s);
    symbols.set(parsed.name, parsed);
  }
  return symbols;
}

// renderer-v2 → { evaluate(props)->symbolName[], legend:[{label,symbolName}] }
function compileRenderer(rendererEl, warnings) {
  const type = rendererEl.getAttribute("type") || "singleSymbol";
  const symbols = parseSymbols(rendererEl);
  const legend = [];
  const ctx = { symbols, warnings, legend };

  switch (type) {
    case "singleSymbol": {
      const name = [...symbols.keys()][0];
      if (name) legend.push({ label: "", symbolName: name });
      return { evaluate: () => (name ? [name] : []), ...ctx };
    }
    case "categorizedSymbol": {
      const attr = rendererEl.getAttribute("attr") || "";
      const getAttr = compileExpr(attr);
      const cats = [];
      const catEl = [...rendererEl.children].find(c => c.tagName === "categories");
      let elseSymbol = null;
      for (const c of catEl?.children || []) {
        if (c.tagName !== "category") continue;
        const value = c.getAttribute("value") ?? "";
        const symbolName = c.getAttribute("symbol") || "";
        const label = c.getAttribute("label") || String(value);
        const render = c.getAttribute("render") !== "false";
        if (value === "" || value == null) {
          // 「その他」カテゴリ(ELSE 相当)も凡例に載せる。空 value が複数あっても1件だけ
          if (!elseSymbol && symbolName) { elseSymbol = symbolName; legend.push({ label, symbolName }); }
        }
        else { cats.push({ value, symbolName, render }); legend.push({ label, symbolName }); }
      }
      return {
        evaluate(props) {
          const v = getAttr(props);
          for (const cat of cats) {
            if (!cat.render) continue;
            if (cat.value == v || String(cat.value) === String(v)) return [cat.symbolName];
          }
          return elseSymbol ? [elseSymbol] : [];
        },
        ...ctx,
      };
    }
    case "graduatedSymbol": {
      const attr = rendererEl.getAttribute("attr") || "";
      const getAttr = compileExpr(attr);
      const ranges = [];
      const rangeEl = [...rendererEl.children].find(c => c.tagName === "ranges");
      for (const r of rangeEl?.children || []) {
        if (r.tagName !== "range") continue;
        const entry = {
          lower: Number(r.getAttribute("lower")),
          upper: Number(r.getAttribute("upper")),
          symbolName: r.getAttribute("symbol") || "",
          render: r.getAttribute("render") !== "false",
        };
        ranges.push(entry);
        legend.push({ label: r.getAttribute("label") || \`\${entry.lower} - \${entry.upper}\`, symbolName: entry.symbolName });
      }
      return {
        evaluate(props) {
          const v = Number(getAttr(props));
          if (!Number.isFinite(v)) return [];
          for (const r of ranges) {
            if (!r.render) continue;
            if (v >= r.lower && v <= r.upper) return [r.symbolName];
          }
          return [];
        },
        ...ctx,
      };
    }
    case "RuleBased": {
      const rulesEl = [...rendererEl.children].find(c => c.tagName === "rules");
      const rootRules = [];
      const parseRule = (ruleEl) => {
        const filter = ruleEl.getAttribute("filter");
        const rule = {
          symbolName: ruleEl.getAttribute("symbol") || null,
          label: ruleEl.getAttribute("label") || "",
          scaleMin: Number(ruleEl.getAttribute("scalemindenom")) || 0,
          scaleMax: Number(ruleEl.getAttribute("scalemaxdenom")) || 0,
          isElse: /^ELSE$/i.test(String(filter || "").trim()),
          filterFn: filter && !/^ELSE$/i.test(filter) ? compileExpr(filter) : null,
          children: [],
        };
        if (rule.symbolName && rule.label) legend.push({ label: rule.label, symbolName: rule.symbolName });
        for (const c of ruleEl.children) {
          if (c.tagName === "rule") rule.children.push(parseRule(c));
        }
        return rule;
      };
      for (const c of rulesEl?.children || []) {
        if (c.tagName === "rule") rootRules.push(parseRule(c));
      }
      const matchRule = (rules, props, inheritedScale, depth = 0) => {
        if (depth > 16) return null;
        let elseRule = null;
        for (const rule of rules) {
          const scale = {
            min: rule.scaleMin || inheritedScale.min,
            max: rule.scaleMax || inheritedScale.max,
          };
          if (rule.isElse) { elseRule = { rule, scale }; continue; }
          const ok = rule.filterFn ? !!rule.filterFn(props) : true;
          if (!ok) continue;
          // 子ルール(ネスト絞り込み)を優先し、なければ自身のシンボル
          const childHit = rule.children.length ? matchRule(rule.children, props, scale, depth + 1) : null;
          if (childHit) return childHit;
          if (rule.symbolName) return { symbolName: rule.symbolName, scale };
          if (!rule.symbolName && rule.children.length) {
            const hit = matchRule(rule.children, props, scale, depth + 1);
            if (hit) return hit;
          }
          return null;
        }
        if (elseRule) {
          const { rule, scale } = elseRule;
          const childHit = rule.children.length ? matchRule(rule.children, props, scale, depth + 1) : null;
          if (childHit) return childHit;
          if (rule.symbolName) return { symbolName: rule.symbolName, scale };
        }
        return null;
      };
      return {
        evaluate(props) {
          const hit = matchRule(rootRules, props, { min: 0, max: 0 });
          if (!hit) return { names: [], scale: null };
          return { names: [hit.symbolName], scale: hit.scale };
        },
        ...ctx,
      };
    }
    case "nullSymbol":
      return { evaluate: () => [], ...ctx };
    case "invertedPolygonRenderer": {
      // マスク描画は再現できないため、外側シンボルで全地物を描く近似
      const name = [...symbols.keys()][0];
      warnOnce(warnings, "invertedPolygonRenderer は近似描画です(外側シンボルを全面適用)");
      return { evaluate: () => (name ? [name] : []), ...ctx };
    }
    case "heatmapRenderer":
      warnOnce(warnings, \`レンダラ \${type} には未対応です(既定スタイルで描画)\`);
      return { evaluate: () => [], ...ctx, unsupported: true };
    default: {
      // mergedFeatureRenderer / pointCluster / pointDisplacement / embedded 等の
      // ラッパー系は内側の renderer-v2 に委譲する
      const inner = [...rendererEl.children].find(c => c.tagName === "renderer-v2");
      if (inner) return compileRenderer(inner, warnings);
      warnOnce(warnings, \`レンダラ \${type} には未対応です(既定スタイルで描画)\`);
      return { evaluate: () => [], ...ctx, unsupported: true };
    }
  }
}

// ---------------------------------------------------------------------------
// シンボルレイヤ → 正規化スタイル
// ---------------------------------------------------------------------------

// マーカー形状名 → canvas パス描画関数(中心0,0・半径1に正規化)
const MARKER_SHAPES = {
  circle(ctx) { ctx.arc(0, 0, 1, 0, Math.PI * 2); },
  semi_circle(ctx) { ctx.arc(0, 0, 1, Math.PI, 0); ctx.closePath(); },
  third_circle(ctx) { ctx.arc(0, 0, 1, Math.PI * 0.83, Math.PI * 0.17); ctx.closePath(); },
  quarter_circle(ctx) { ctx.moveTo(0, 0); ctx.arc(0, 0, 1, -Math.PI / 2, 0); ctx.closePath(); },
  square(ctx) { ctx.rect(-0.85, -0.85, 1.7, 1.7); },
  rectangle(ctx) { ctx.rect(-1, -0.7, 2, 1.4); },
  rounded_square(ctx) { ctx.roundRect(-0.85, -0.85, 1.7, 1.7, 0.3); },
  rounded_rectangle(ctx) { ctx.roundRect(-1, -0.7, 2, 1.4, 0.25); },
  diamond(ctx) { ctx.moveTo(0, -1); ctx.lineTo(0.8, 0); ctx.lineTo(0, 1); ctx.lineTo(-0.8, 0); ctx.closePath(); },
  pentagon(ctx) { polygonPath(ctx, 5, -Math.PI / 2); },
  hexagon(ctx) { polygonPath(ctx, 6, -Math.PI / 2); },
  octagon(ctx) { polygonPath(ctx, 8, -Math.PI / 2); },
  triangle(ctx) { polygonPath(ctx, 3, -Math.PI / 2); },
  equilateral_triangle(ctx) { polygonPath(ctx, 3, -Math.PI / 2); },
  right_triangle(ctx) { ctx.moveTo(-1, 1); ctx.lineTo(1, 1); ctx.lineTo(1, -1); ctx.closePath(); },
  star(ctx) { starPath(ctx, 5, 0.4); },
  regular_star(ctx) { starPath(ctx, 5, 0.4); },
  rounded_star(ctx) { starPath(ctx, 5, 0.5); },
  asterisk_fill(ctx) { starPath(ctx, 6, 0.55); },
  heart(ctx) {
    ctx.moveTo(0, 0.9);
    ctx.bezierCurveTo(-1.4, -0.1, -0.8, -1.1, 0, -0.5);
    ctx.bezierCurveTo(0.8, -1.1, 1.4, -0.1, 0, 0.9);
    ctx.closePath();
  },
  cross(ctx) {
    const w = 0.28;
    ctx.moveTo(-w, -1); ctx.lineTo(w, -1); ctx.lineTo(w, -w); ctx.lineTo(1, -w);
    ctx.lineTo(1, w); ctx.lineTo(w, w); ctx.lineTo(w, 1); ctx.lineTo(-w, 1);
    ctx.lineTo(-w, w); ctx.lineTo(-1, w); ctx.lineTo(-1, -w); ctx.lineTo(-w, -w);
    ctx.closePath();
  },
  cross_fill(ctx) { MARKER_SHAPES.cross(ctx); },
  cross2(ctx) {
    ctx.moveTo(-1, -1); ctx.lineTo(1, 1); ctx.moveTo(1, -1); ctx.lineTo(-1, 1);
  },
  x(ctx) { MARKER_SHAPES.cross2(ctx); },
  diagonal_cross(ctx) { MARKER_SHAPES.cross2(ctx); },
  line(ctx) { ctx.moveTo(0, -1); ctx.lineTo(0, 1); },
  arrow(ctx) {
    ctx.moveTo(0, 1); ctx.lineTo(0, -0.45);
    ctx.moveTo(-0.55, 0); ctx.lineTo(0, -0.45); ctx.lineTo(0.55, 0);
  },
  arrowhead(ctx) { ctx.moveTo(-0.7, 0.7); ctx.lineTo(0, -0.4); ctx.lineTo(0.7, 0.7); },
  filled_arrowhead(ctx) { ctx.moveTo(-0.7, 0.7); ctx.lineTo(0, -0.6); ctx.lineTo(0.7, 0.7); ctx.closePath(); },
  half_square(ctx) { ctx.rect(-0.85, 0, 1.7, 0.85); },
  quarter_square(ctx) { ctx.rect(0, 0, 0.85, 0.85); },
  third_square(ctx) { ctx.rect(-0.85, 0.28, 1.7, 0.57); },
  trapezoid(ctx) { ctx.moveTo(-0.6, -0.8); ctx.lineTo(0.6, -0.8); ctx.lineTo(1, 0.8); ctx.lineTo(-1, 0.8); ctx.closePath(); },
  parallelogram_left(ctx) { ctx.moveTo(-0.5, -0.8); ctx.lineTo(1, -0.8); ctx.lineTo(0.5, 0.8); ctx.lineTo(-1, 0.8); ctx.closePath(); },
  parallelogram_right(ctx) { ctx.moveTo(-1, -0.8); ctx.lineTo(0.5, -0.8); ctx.lineTo(1, 0.8); ctx.lineTo(-0.5, 0.8); ctx.closePath(); },
  shield(ctx) {
    ctx.moveTo(0, -0.9); ctx.lineTo(0.8, -0.6); ctx.lineTo(0.7, 0.3);
    ctx.quadraticCurveTo(0.6, 0.8, 0, 1); ctx.quadraticCurveTo(-0.6, 0.8, -0.7, 0.3);
    ctx.lineTo(-0.8, -0.6); ctx.closePath();
  },
  play(ctx) { polygonPath(ctx, 3, 0); },
};

function polygonPath(ctx, sides, startAngle) {
  for (let i = 0; i < sides; i++) {
    const a = startAngle + (i / sides) * Math.PI * 2;
    const x = Math.cos(a), y = Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function starPath(ctx, points, innerRatio) {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : innerRatio;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// 線のみの形状(塗りつぶさずストロークのみ)
const STROKE_ONLY_SHAPES = new Set(["cross2", "x", "diagonal_cross", "line", "arrow", "arrowhead"]);

// 画像の遅延ロード管理(コンパイル時に収集した URL を一括ロードする)
function resolveResourceUrl(path, baseUrl) {
  const s = String(path || "").trim();
  if (!s) return null;
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  // Windows/Unix の絶対パスはブラウザから読めないためベース名で相対解決を試みる
  if (/^([a-z]:[\\\\/]|\\\\\\\\|\\/)/i.test(s)) {
    const base = s.split(/[\\\\/]/).pop();
    try { return new URL(base, baseUrl).href; } catch (e) { return null; }
  }
  try { return new URL(s, baseUrl).href; } catch (e) { return s; }
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// SVG を param(fill)/param(outline) で再着色して data URL 化する
async function loadSvgRecolored(url, fillColor, strokeColor, fetchText) {
  try {
    const text = await fetchText(url);
    let svg = String(text);
    if (fillColor) {
      const c = rgbaToCss(fillColor);
      svg = svg.replace(/param\\(fill[^)]*\\)/gi, c).replace(/fill="(?!none)[^"]*"/gi, \`fill="\${c}"\`);
    }
    if (strokeColor) {
      const c = rgbaToCss(strokeColor);
      svg = svg.replace(/param\\(outline[^)]*\\)/gi, c).replace(/stroke="(?!none)[^"]*"/gi, \`stroke="\${c}"\`);
    }
    const img = await loadImage(\`data:image/svg+xml;charset=utf-8,\${encodeURIComponent(svg)}\`);
    return img;
  } catch (e) {
    return null;
  }
}

function rgbaToCss(rgba) {
  const [r, g, b, a] = rgba.map(v => Math.round(v * 255));
  return a >= 255 ? \`rgb(\${r},\${g},\${b})\` : \`rgba(\${r},\${g},\${b},\${(rgba[3]).toFixed(3)})\`;
}

// ---------------------------------------------------------------------------
// マーカー/ライン/塗りつぶしレイヤの正規化(DD 適用済みの「描ける形」)
// ---------------------------------------------------------------------------

function resolveMarkerLayer(layer, props, images, warnings) {
  const p = layer.props;
  const dd = layer.dd;
  const sizeUnit = p.size_unit || "MM";
  const sizePx = sizeToPx(ddValue(dd, ["size"], props, p.size ?? 2), sizeUnit);
  const angle = Number(ddValue(dd, ["angle"], props, p.angle ?? 0)) || 0;
  const offset = String(ddValue(dd, ["offset"], props, p.offset ?? "0,0")).split(",").map(Number);
  const alpha = 1;

  switch (layer.cls) {
    case "SimpleMarker": {
      const name = String(ddValue(dd, ["name"], props, p.name ?? "circle")).toLowerCase();
      const fill = parseQgisColor(ddValue(dd, ["fillColor", "color"], props, p.color), [0.2, 0.4, 0.9, 1]);
      const stroke = parseQgisColor(ddValue(dd, ["outlineColor", "outline_color", "color_border"], props, p.outline_color ?? p.color_border), null);
      const outlineStyle = String(p.outline_style || "solid");
      const strokeWidth = sizeToPx(ddValue(dd, ["outlineWidth", "outline_width"], props, p.outline_width ?? 0), p.outline_width_unit || "MM");
      return [{
        kind: "shape",
        shape: MARKER_SHAPES[name] ? name : "circle",
        sizePx, fill,
        stroke: outlineStyle === "no" ? null : stroke,
        strokeWidthPx: strokeWidth,
        rotationDeg: angle,
        offsetPx: [offset[0] * MM_TO_PX || 0, -(offset[1] * MM_TO_PX || 0)],
        alpha,
      }];
    }
    case "EllipseMarker": {
      const w = sizeToPx(ddValue(dd, ["width", "symbol_width"], props, p.symbol_width ?? p.size ?? 2), sizeUnit);
      const h = sizeToPx(ddValue(dd, ["height", "symbol_height"], props, p.symbol_height ?? p.size ?? 2), sizeUnit);
      const fill = parseQgisColor(ddValue(dd, ["fillColor", "color"], props, p.color), [0.2, 0.4, 0.9, 1]);
      const stroke = parseQgisColor(ddValue(dd, ["outlineColor", "outline_color"], props, p.outline_color), null);
      const strokeWidth = sizeToPx(ddValue(dd, ["outlineWidth", "outline_width"], props, p.outline_width ?? 0), p.outline_width_unit || "MM");
      return [{
        kind: "ellipse", widthPx: w, heightPx: h, fill,
        stroke: String(p.outline_style) === "no" ? null : stroke,
        strokeWidthPx: strokeWidth,
        rotationDeg: angle, offsetPx: [0, 0], alpha,
      }];
    }
    case "SvgMarker":
    case "RasterMarker": {
      const pathKey = String(p.name ?? p.imageFile ?? p.path ?? "");
      const image = images.get(pathKey) || null;
      if (!image) {
        warnOnce(warnings, \`\${layer.cls} の画像を読めませんでした: \${pathKey}(円で代替)\`);
        const fill = parseQgisColor(p.color, [0.2, 0.4, 0.9, 1]);
        return [{ kind: "shape", shape: "circle", sizePx, fill, stroke: null, strokeWidthPx: 0, rotationDeg: angle, offsetPx: [0, 0], alpha }];
      }
      return [{ kind: "image", image, sizePx, rotationDeg: angle, offsetPx: [0, 0], alpha }];
    }
    case "FontMarker":
    case "MdiFontMarker": {
      const chr = String(ddValue(dd, ["chr", "char"], props, p.chr ?? ""));
      const font = String(p.font || p.font_family || "sans-serif");
      const fill = parseQgisColor(ddValue(dd, ["fillColor", "color"], props, p.color), [0.2, 0.2, 0.2, 1]);
      const stroke = parseQgisColor(ddValue(dd, ["outlineColor", "outline_color"], props, p.outline_color), null);
      const strokeWidth = sizeToPx(ddValue(dd, ["outlineWidth", "outline_width"], props, p.outline_width ?? 0), "MM");
      return [{
        kind: "text", text: chr, fontFamily: font, sizePx, fill,
        stroke, strokeWidthPx: strokeWidth,
        rotationDeg: angle, offsetPx: [0, 0], alpha,
      }];
    }
    case "FilledMarker": {
      // 内部の fill サブシンボル色で形状を塗る
      const name = String(ddValue(dd, ["name"], props, p.name ?? "circle")).toLowerCase();
      let fill = parseQgisColor(p.color, [0.5, 0.5, 0.5, 1]);
      if (layer.subSymbol) {
        const sub = resolveSymbolLayers(layer.subSymbol, props, images, warnings);
        const solid = sub.fillParts?.find(pt => pt.kind === "solid");
        if (solid) fill = solid.color;
      }
      const stroke = parseQgisColor(ddValue(dd, ["outlineColor", "outline_color"], props, p.outline_color), null);
      const strokeWidth = sizeToPx(ddValue(dd, ["outlineWidth", "outline_width"], props, p.outline_width ?? 0), "MM");
      return [{
        kind: "shape", shape: MARKER_SHAPES[name] ? name : "circle", sizePx, fill,
        stroke, strokeWidthPx: strokeWidth, rotationDeg: angle, offsetPx: [0, 0], alpha,
      }];
    }
    case "GeometryGenerator":
      warnOnce(warnings, "GeometryGenerator マーカーは未対応です(スキップ)");
      return [];
    default:
      warnOnce(warnings, \`マーカーシンボル \${layer.cls} は未対応です(円で代替)\`);
      return [{
        kind: "shape", shape: "circle", sizePx,
        fill: parseQgisColor(p.color, [0.2, 0.4, 0.9, 1]),
        stroke: null, strokeWidthPx: 0, rotationDeg: angle, offsetPx: [0, 0], alpha,
      }];
  }
}

function resolveLineLayer(layer, props, warnings) {
  const p = layer.props;
  const dd = layer.dd;
  const widthUnit = p.line_width_unit || "MM";
  switch (layer.cls) {
    case "SimpleLine": {
      const color = parseQgisColor(ddValue(dd, ["lineColor", "line_color", "color"], props, p.line_color), [0, 0, 0, 1]);
      const widthPx = sizeToPx(ddValue(dd, ["lineWidth", "line_width", "width"], props, p.line_width ?? 0.26), widthUnit);
      const custom = p.use_custom_dash === "1" || p.use_custom_dash === "true" ? p.customdash : null;
      const dash = dashPattern(ddValue(dd, ["lineStyle", "line_style"], props, p.line_style), custom, widthPx);
      if (dash === "none") return null;
      return { color, widthPx: Math.max(widthPx, 1), dash };
    }
    case "MarkerLine":
    case "HashedLine":
    case "InterpolatedLine":
    case "Lineburst":
    case "ArrowLine":
    case "RasterLine":
    case "FadedLine": {
      // 装飾系ラインは単色ラインに近似する。色はサブシンボルや固有プロパティから拾う
      let color = parseQgisColor(p.line_color ?? p.color ?? p.start_color ?? p.single_color, null);
      if (!color && layer.subSymbol) {
        const sub = resolveMarkerLayerForLine(layer.subSymbol, props);
        color = sub;
      }
      const widthPx = Math.max(sizeToPx(p.line_width ?? p.width ?? 0.26, widthUnit), 1);
      warnOnce(warnings, \`ラインシンボル \${layer.cls} は単色ラインに近似しています\`);
      return { color: color || [0, 0, 0, 1], widthPx, dash: null };
    }
    case "GeometryGenerator":
      warnOnce(warnings, "GeometryGenerator ラインは未対応です(スキップ)");
      return null;
    default:
      warnOnce(warnings, \`ラインシンボル \${layer.cls} は未対応です\`);
      return { color: parseQgisColor(p.line_color ?? p.color, [0, 0, 0, 1]), widthPx: 1, dash: null };
  }
}

function resolveMarkerLayerForLine(symbol, props) {
  for (const l of symbol?.layers || []) {
    const c = parseQgisColor(l.props?.color, null);
    if (c) return c;
  }
  return null;
}

// fill_style(ハッチ)名 → パターン描画パラメータ
const FILL_STYLES = {
  solid: null,
  horizontal: { angles: [0], spacing: 3 },
  vertical: { angles: [90], spacing: 3 },
  cross: { angles: [0, 90], spacing: 3 },
  "b_diagonal": { angles: [45], spacing: 3 },
  "f_diagonal": { angles: [-45], spacing: 3 },
  "diagonal_x": { angles: [45, -45], spacing: 3 },
  dense1: { angles: [45], spacing: 2 },
  dense2: { angles: [45], spacing: 2.5 },
  dense3: { angles: [45], spacing: 3 },
  dense4: { angles: [45], spacing: 3.5 },
  dense5: { angles: [45, -45], spacing: 3 },
  dense6: { angles: [45, -45], spacing: 3.5 },
  dense7: { angles: [45, -45], spacing: 4 },
  "no": "none",
  "no_brush": "none",
};

function resolveFillLayer(layer, props, images, warnings, tileCache) {
  const p = layer.props;
  const dd = layer.dd;
  switch (layer.cls) {
    case "SimpleFill": {
      const fillStyle = String(ddValue(dd, ["fillStyle", "fill_style"], props, p.fill_style ?? "solid")).toLowerCase();
      const color = parseQgisColor(ddValue(dd, ["fillColor", "color"], props, p.color), [0.5, 0.5, 0.5, 1]);
      const spec = FILL_STYLES[fillStyle];
      if (spec === "none") return { solid: null };
      if (!spec) return { solid: color };
      return { hatch: { color, angles: spec.angles, spacingPx: spec.spacing * MM_TO_PX * 0.8 } };
    }
    case "LinePatternFill": {
      const color = parseQgisColor(ddValue(dd, ["lineColor", "color"], props, p.color), [0, 0, 0, 1]);
      const angle = Number(p.angle ?? 45);
      const distPx = sizeToPx(p.distance ?? 2, p.distance_unit || "MM") || 4;
      const widthPx = Math.max(sizeToPx(p.line_width ?? p.outline_width ?? 0.3, p.line_width_unit || "MM"), 0.8);
      let lineColor = color, lineWidth = widthPx;
      if (layer.subSymbol) {
        for (const l of layer.subSymbol.layers || []) {
          const r = resolveLineLayer(l, props, warnings);
          if (r) { lineColor = r.color; lineWidth = r.widthPx; }
        }
      }
      return { linePattern: { color: lineColor, angleDeg: angle, spacingPx: Math.max(distPx, 2), widthPx: lineWidth } };
    }
    case "PointPatternFill":
    case "RandomMarkerFill": {
      const dx = Math.max(sizeToPx(p.distance_x ?? p.distance ?? 4, "MM"), 3);
      const dy = Math.max(sizeToPx(p.distance_y ?? p.distance ?? 4, "MM"), 3);
      const markers = layer.subSymbol
        ? layer.subSymbol.layers.flatMap(l => l.enabled ? resolveMarkerLayer(l, props, images, warnings) : [])
        : [{ kind: "shape", shape: "circle", sizePx: 2.5, fill: parseQgisColor(p.color, [0, 0, 0, 1]), stroke: null, strokeWidthPx: 0, rotationDeg: 0, offsetPx: [0, 0], alpha: 1 }];
      return { pointPattern: { markers, spacingX: dx, spacingY: dy } };
    }
    case "SVGFill":
    case "RasterFill": {
      const pathKey = String(p.svgfile ?? p.imageFile ?? p.file ?? "");
      const image = images.get(pathKey) || null;
      if (!image) {
        warnOnce(warnings, \`\${layer.cls} の画像を読めませんでした: \${pathKey}(単色で代替)\`);
        return { solid: parseQgisColor(p.color ?? p.svgFillColor, [0.5, 0.5, 0.5, 0.7]) };
      }
      const w = Math.max(sizeToPx(p.width ?? p.pattern_width ?? 4, "MM"), 4);
      return { imagePattern: { image, widthPx: w } };
    }
    case "GradientFill":
    case "ShapeburstFill":
    case "ColorRampFill": {
      const c1 = parseQgisColor(p.color ?? p.gradient_color2 ?? p.color1 ?? p.two_color_second, [0.5, 0.5, 0.5, 1]);
      const c2 = parseQgisColor(p.gradient_color2 ?? p.color2 ?? p.two_color_second, null);
      // グラデーションはタイルで近似
      return { gradient: { color1: c1, color2: c2 || [c1[0], c1[1], c1[2], 0], angleDeg: Number(p.angle ?? 0) } };
    }
    case "CentroidFill": {
      const markers = layer.subSymbol
        ? layer.subSymbol.layers.flatMap(l => l.enabled ? resolveMarkerLayer(l, props, images, warnings) : [])
        : [];
      return { centroid: markers };
    }
    case "GeometryGenerator":
      warnOnce(warnings, "GeometryGenerator 塗りつぶしは未対応です(スキップ)");
      return {};
    default:
      warnOnce(warnings, \`塗りつぶしシンボル \${layer.cls} は未対応です(単色で代替)\`);
      return { solid: parseQgisColor(p.color, [0.5, 0.5, 0.5, 0.7]) };
  }
}

function resolveOutline(layer, props, warnings) {
  const p = layer.props;
  const dd = layer.dd;
  const style = String(ddValue(dd, ["outlineStyle", "outline_style"], props, p.outline_style ?? "solid")).toLowerCase();
  if (style === "no") return null;
  const color = parseQgisColor(ddValue(dd, ["outlineColor", "outline_color"], props, p.outline_color), null);
  if (!color) return null;
  const widthPx = sizeToPx(ddValue(dd, ["outlineWidth", "outline_width"], props, p.outline_width ?? 0.26), p.outline_width_unit || "MM");
  const dash = dashPattern(style, null, Math.max(widthPx, 1));
  return { color, widthPx: Math.max(widthPx, 1), dash: dash === "none" ? null : dash };
}

// <symbol> を feature 属性で正規化する
function resolveSymbolLayers(symbol, props, images, warnings) {
  const out = { markers: null, line: null, fillParts: null, outline: null, centroid: null, alpha: symbol.alpha };
  const markerLayers = [];
  const fillParts = [];
  let outline = null;
  let centroid = null;
  let lineCandidate = null;

  for (const layer of symbol.layers) {
    if (!layer.enabled) continue;
    switch (symbol.geomType) {
      case "marker":
        markerLayers.push(...resolveMarkerLayer(layer, props, images, warnings));
        break;
      case "line": {
        const r = resolveLineLayer(layer, props, warnings);
        if (r) lineCandidate = r; // 最後の有効レイヤ(最上位)を採用
        break;
      }
      case "fill": {
        const r = resolveFillLayer(layer, props, images, warnings);
        if (!r) break;
        if (r.centroid) { centroid = r.centroid; break; }
        const o = resolveOutline(layer, props, warnings);
        if (o) outline = o;
        if (r.solid !== undefined && r.solid !== null) fillParts.push(r);
        else if (r.solid === null) fillParts.push({ solid: null });
        else fillParts.push(r);
        break;
      }
    }
  }
  if (symbol.geomType === "marker" && markerLayers.length) out.markers = markerLayers;
  if (symbol.geomType === "line" && lineCandidate) out.line = lineCandidate;
  if (symbol.geomType === "fill") {
    if (fillParts.length) out.fillParts = fillParts;
    if (outline) out.outline = outline;
    if (centroid) out.centroid = centroid;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ラベル(<labeling>)
// ---------------------------------------------------------------------------

function parseTextStyle(textStyleEl) {
  const a = name => textStyleEl?.getAttribute(name);
  const isExpr = String(a("isExpression") ?? "0") === "1" || String(a("isExpression")).toLowerCase() === "true";
  const fieldName = a("fieldName") || "";
  const sizeUnit = a("fontSizeUnit") || "Point";
  const fontSize = Number(a("fontSize")) || 10;
  const sizePx = sizeUnit === "MM" ? fontSize * MM_TO_PX : fontSize * PT_TO_PX;
  const textColor = parseQgisColor(a("textColor") || a("namedColor"), [0, 0, 0, 1]);
  const textOpacity = Number(a("textOpacity") ?? "1");
  const bufferDraw = String(a("bufferDraw") ?? "0") === "1" || String(a("bufferDraw")).toLowerCase() === "true";
  const bufferColor = parseQgisColor(a("bufferColor"), [1, 1, 1, 1]);
  const bufferSize = sizeToPx(a("bufferSize") ?? 1, a("bufferSizeUnit") || "MM");
  const bold = String(a("fontBold") ?? "0") === "1" || String(a("fontBold")).toLowerCase() === "true";
  const italic = String(a("fontItalic") ?? "0") === "1" || String(a("fontItalic")).toLowerCase() === "true";
  const family = a("fontFamily") || "sans-serif";
  return {
    getText: isExpr ? compileExpr(fieldName) : (props => props?.[fieldName]),
    sizePx,
    fontCss: \`\${italic ? "italic " : ""}\${bold ? "bold " : ""}\${Math.max(Math.round(sizePx), 6)}px \${family}\`,
    fill: withAlpha(textColor, Number.isFinite(textOpacity) ? textOpacity : 1),
    halo: bufferDraw ? { color: bufferColor, widthPx: Math.max(bufferSize, 1) } : null,
  };
}

function compileLabeling(labelingEl, warnings) {
  if (!labelingEl) return null;
  const type = labelingEl.getAttribute("type") || "simple";
  if (type === "none") return null;
  if (type === "rule-based") {
    const rules = [];
    const rulesEl = [...labelingEl.children].find(c => c.tagName === "rules")
      || labelingEl.querySelector("rules");
    for (const ruleEl of rulesEl?.querySelectorAll?.(":scope > rule") || []) {
      const filter = ruleEl.getAttribute("filter");
      const settings = ruleEl.querySelector("settings text-style") || ruleEl.querySelector("text-style");
      if (!settings) continue;
      rules.push({ fn: filter && !/^ELSE$/i.test(filter) ? compileExpr(filter) : null, isElse: /^ELSE$/i.test(String(filter || "")), style: parseTextStyle(settings) });
    }
    if (!rules.length) return null;
    return props => {
      let elseStyle = null;
      for (const r of rules) {
        if (r.isElse) { elseStyle = r.style; continue; }
        if (!r.fn || r.fn(props)) return r.style;
      }
      return elseStyle;
    };
  }
  // simple / perimeter 等は text-style をそのまま使う
  const textStyle = labelingEl.querySelector("text-style");
  if (!textStyle) return null;
  const style = parseTextStyle(textStyle);
  if (!style.getText) return null;
  return () => style;
}

// ---------------------------------------------------------------------------
// コンパイル済みスタイル
// ---------------------------------------------------------------------------

function compileQmlStyle(xmlText, baseUrl, preloadedImages = new Map()) {
  const doc = new DOMParser().parseFromString(String(xmlText), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("QML の XML パースに失敗しました");
  const warnings = new Set();
  const rendererEl = doc.querySelector("renderer-v2");
  if (!rendererEl) throw new Error("QML に renderer-v2 がありません(シンボロジが含まれていません)");
  const renderer = compileRenderer(rendererEl, warnings);
  const labelingEl = doc.querySelector("labeling");
  const labelFn = compileLabeling(labelingEl, warnings);
  const images = preloadedImages;

  const evaluate = (props) => {
    const result = renderer.evaluate(props || {});
    // RuleBased は {names, scale}、その他は配列
    const names = Array.isArray(result) ? result : result.names;
    const scale = Array.isArray(result) ? null : result.scale;
    if (!names?.length) return null;
    const out = { markers: null, line: null, fillParts: null, outline: null, centroid: null, scale: null };
    if (scale && (scale.min > 1 || scale.max > 0)) {
      // 縮尺分母 → 概算カメラ距離(m)。表示中の地物はこの距離範囲でのみ描画する近似
      const toDist = s => (s > 0 ? s * 0.00028 * 900 / (2 * Math.tan(Math.PI / 6)) : 0);
      out.scale = { near: toDist(scale.min), far: scale.max > 0 ? toDist(scale.max) : Number.MAX_VALUE };
    }
    for (const name of names) {
      const symbol = renderer.symbols.get(name);
      if (!symbol) continue;
      const resolved = resolveSymbolLayers(symbol, props || {}, images, warnings);
      if (resolved.alpha !== undefined && resolved.alpha !== 1) {
        const mul = (c) => c ? withAlpha(c, resolved.alpha) : c;
        if (resolved.line) resolved.line.color = mul(resolved.line.color);
        if (resolved.fillParts) for (const pt of resolved.fillParts) { if (pt.solid) pt.solid = mul(pt.solid); }
        if (resolved.markers) for (const m of resolved.markers) m.alpha = (m.alpha ?? 1) * resolved.alpha;
      }
      if (resolved.markers && !out.markers) out.markers = resolved.markers;
      if (resolved.line && !out.line) out.line = resolved.line;
      if (resolved.fillParts && !out.fillParts) out.fillParts = resolved.fillParts;
      if (resolved.outline && !out.outline) out.outline = resolved.outline;
      if (resolved.centroid && !out.centroid) out.centroid = resolved.centroid;
    }
    return out;
  };

  // 地物プロパティからシンボル名の配列を返す(凡例の条件別表示/非表示切替用)
  const namesFor = (props) => {
    const result = renderer.evaluate(props || {});
    return Array.isArray(result) ? result : (result?.names || []);
  };

  const legend = renderer.legend.map(e => {
    const symbol = renderer.symbols.get(e.symbolName);
    let spec = null;
    if (symbol) {
      try { spec = resolveSymbolLayers(symbol, {}, images, warnings); } catch (err) { spec = null; }
    }
    return { label: e.label, symbolName: e.symbolName, spec };
  });

  return {
    evaluate,
    namesFor,
    labelFor: labelFn ? (props => labelFn(props)) : null,
    legend,
    warnings: [...warnings],
    unsupported: !!renderer.unsupported,
    symbols: renderer.symbols,
    images,
  };
}

// QML 内で参照される画像 URL を収集して事前ロードする
function collectImagePaths(el, acc) {
  if (!el) return;
  const cls = el.getAttribute?.("class");
  if (cls === "SvgMarker" || cls === "RasterMarker" || cls === "SVGFill" || cls === "RasterFill") {
    const props = optionMap(el);
    const key = String(props.name ?? props.imageFile ?? props.svgfile ?? props.file ?? "");
    if (key) acc.add(key);
  }
  for (const c of el.children || []) collectImagePaths(c, acc);
}

async function loadQmlStyle(url, fetchText) {
  const text = await fetchText(url);
  const doc = new DOMParser().parseFromString(String(text), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("QML の XML パースに失敗しました");

  // 画像の事前ロード(相対パスは .qml のディレクトリ基準)
  const pathKeys = new Set();
  collectImagePaths(doc.documentElement, pathKeys);
  const images = new Map();
  await Promise.all([...pathKeys].map(async key => {
    const resolved = resolveResourceUrl(key, url);
    if (!resolved) return;
    let img = null;
    if (/\\.svg(\\?|#|$)/i.test(key) || /^data:image\\/svg/i.test(resolved)) {
      // SVG は param() 再着色を試みる(失敗時は素の画像)
      const markerProps = findMarkerPropsForKey(doc.documentElement, key) || {};
      const fill = parseQgisColor(markerProps.color, null);
      const stroke = parseQgisColor(markerProps.outline_color, null);
      img = await loadSvgRecolored(resolved, fill, stroke, fetchText);
      if (!img) img = await loadImage(resolved);
    } else {
      img = await loadImage(resolved);
    }
    if (img) images.set(key, img);
  }));

  return compileQmlStyle(text, url, images);
}

function findMarkerPropsForKey(el, key) {
  if (!el) return null;
  if (el.tagName === "layer") {
    const props = optionMap(el);
    if (String(props.name ?? props.imageFile ?? props.svgfile ?? props.file ?? "") === key) return props;
  }
  for (const c of el.children || []) {
    const hit = findMarkerPropsForKey(c, key);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------------------
// canvas 生成(マーカー画像・塗りつぶしパターンタイル)
// ---------------------------------------------------------------------------

const canvasCache = new Map();
const CANVAS_CACHE_MAX = 400;

function getCanvas(key, size, draw) {
  let hit = canvasCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.max(Math.ceil(size), 2);
  const ctx = canvas.getContext("2d");
  draw(ctx, canvas.width);
  if (canvasCache.size >= CANVAS_CACHE_MAX) canvasCache.clear();
  canvasCache.set(key, canvas);
  return canvas;
}

// マーカーレイヤ群を1枚の canvas に合成する。返り値 {canvas, anchorY}
function markerLayersToCanvas(markerLayers) {
  const maxSize = Math.max(...markerLayers.map(m => m.sizePx || m.widthPx || 8), 4);
  const pad = Math.max(...markerLayers.map(m => (m.strokeWidthPx || 0) + 2), 2);
  const size = maxSize + pad * 2;
  const key = \`mk:\${JSON.stringify(markerLayers.map(m => ({ ...m, image: m.image ? (m.image.src || "img") : undefined })))}\`;
  const canvas = getCanvas(key, size, (ctx, W) => {
    for (const layer of markerLayers) {
      ctx.save();
      ctx.translate(W / 2 + (layer.offsetPx?.[0] || 0), W / 2 + (layer.offsetPx?.[1] || 0));
      ctx.rotate((layer.rotationDeg || 0) * Math.PI / 180);
      ctx.globalAlpha = layer.alpha ?? 1;
      const half = (layer.sizePx || 8) / 2;
      if (layer.kind === "shape") {
        const shapeFn = MARKER_SHAPES[layer.shape] || MARKER_SHAPES.circle;
        ctx.beginPath();
        ctx.save();
        ctx.scale(half, half);
        shapeFn(ctx);
        ctx.restore();
        if (STROKE_ONLY_SHAPES.has(layer.shape)) {
          ctx.strokeStyle = rgbaToCss(layer.stroke || layer.fill || [0, 0, 0, 1]);
          ctx.lineWidth = layer.strokeWidthPx || Math.max(half * 0.3, 1.5);
          ctx.stroke();
        } else {
          if (layer.fill) {
            ctx.fillStyle = rgbaToCss(layer.fill);
            ctx.fill();
          }
          if (layer.stroke && layer.strokeWidthPx > 0) {
            ctx.strokeStyle = rgbaToCss(layer.stroke);
            ctx.lineWidth = layer.strokeWidthPx;
            ctx.stroke();
          }
        }
      } else if (layer.kind === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(0, 0, (layer.widthPx || 8) / 2, (layer.heightPx || 8) / 2, 0, 0, Math.PI * 2);
        if (layer.fill) { ctx.fillStyle = rgbaToCss(layer.fill); ctx.fill(); }
        if (layer.stroke) { ctx.strokeStyle = rgbaToCss(layer.stroke); ctx.lineWidth = layer.strokeWidthPx || 1; ctx.stroke(); }
      } else if (layer.kind === "image" && layer.image) {
        const img = layer.image;
        const ratio = img.height / (img.width || 1);
        const w = layer.sizePx, h = layer.sizePx * (Number.isFinite(ratio) ? ratio : 1);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
      } else if (layer.kind === "text") {
        ctx.font = \`\${Math.round(layer.sizePx || 10)}px \${layer.fontFamily || "sans-serif"}\`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (layer.stroke) {
          ctx.strokeStyle = rgbaToCss(layer.stroke);
          ctx.lineWidth = layer.strokeWidthPx || 1;
          ctx.strokeText(layer.text, 0, 0);
        }
        ctx.fillStyle = rgbaToCss(layer.fill || [0, 0, 0, 1]);
        ctx.fillText(layer.text, 0, 0);
      }
      ctx.restore();
    }
  });
  return canvas;
}

// 塗りつぶしパターンを1枚のタイル canvas に合成する。
// {canvas, tileMeters} を返す。全パートが solid のみなら null(単色描画に分岐)
function fillPartsToTile(fillParts) {
  const patterns = fillParts.filter(pt => pt.hatch || pt.linePattern || pt.pointPattern || pt.imagePattern || pt.gradient);
  const solids = fillParts.filter(pt => pt.solid);
  const solidBase = solids.length ? solids[solids.length - 1].solid : null;
  if (!patterns.length) return { solidBase, tile: null, tileMeters: 0 };

  const maxSpacing = Math.max(...patterns.map(pt =>
    pt.hatch ? pt.hatch.spacingPx : pt.linePattern ? pt.linePattern.spacingPx : pt.pointPattern ? Math.max(pt.pointPattern.spacingX, pt.pointPattern.spacingY) : pt.imagePattern ? pt.imagePattern.widthPx : 32), 8);
  const tilePx = Math.min(Math.max(Math.ceil(maxSpacing), 8), 128);
  const key = \`ft:\${JSON.stringify(fillParts.map(pt => ({ ...pt, imagePattern: pt.imagePattern ? { w: pt.imagePattern.widthPx, src: pt.imagePattern.image.src } : undefined, pointPattern: pt.pointPattern ? { sx: pt.pointPattern.spacingX, sy: pt.pointPattern.spacingY, n: pt.pointPattern.markers.length } : undefined })))}\`;
  const canvas = getCanvas(key, tilePx, (ctx, W) => {
    if (solidBase) {
      ctx.fillStyle = rgbaToCss(solidBase);
      ctx.fillRect(0, 0, W, W);
    }
    for (const pt of patterns) {
      if (pt.hatch) {
        drawHatch(ctx, W, pt.hatch.angles, pt.hatch.spacingPx, pt.hatch.color);
      } else if (pt.linePattern) {
        drawHatch(ctx, W, [pt.linePattern.angleDeg], pt.linePattern.spacingPx, pt.linePattern.color, pt.linePattern.widthPx);
      } else if (pt.pointPattern) {
        const { markers, spacingX, spacingY } = pt.pointPattern;
        const stamp = markerLayersToCanvas(markers);
        const stepX = Math.max(spacingX, 4), stepY = Math.max(spacingY, 4);
        for (let y = 0; y < W + stepY; y += stepY) {
          for (let x = 0; x < W + stepX; x += stepX) {
            ctx.drawImage(stamp, x - stamp.width / 2, y - stamp.height / 2);
          }
        }
      } else if (pt.imagePattern && pt.imagePattern.image) {
        const img = pt.imagePattern.image;
        const w = pt.imagePattern.widthPx;
        const h = w * (img.height / (img.width || 1) || 1);
        for (let y = 0; y < W + h; y += h) {
          for (let x = 0; x < W + w; x += w) {
            ctx.drawImage(img, x, y, w, h);
          }
        }
      } else if (pt.gradient) {
        const a = (pt.gradient.angleDeg || 0) * Math.PI / 180;
        const g = ctx.createLinearGradient(0, 0, Math.cos(a) * W, Math.sin(a) * W);
        g.addColorStop(0, rgbaToCss(pt.gradient.color1));
        g.addColorStop(1, rgbaToCss(pt.gradient.color2));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, W);
      }
    }
  });
  return { solidBase, tile: canvas, tileMeters: tilePx * METERS_PER_PX };
}

function drawHatch(ctx, W, anglesDeg, spacingPx, color, widthPx = 1) {
  ctx.save();
  ctx.strokeStyle = rgbaToCss(color);
  ctx.lineWidth = Math.max(widthPx, 0.7);
  const diag = W * Math.SQRT2;
  for (const deg of anglesDeg) {
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(deg * Math.PI / 180);
    for (let x = -diag; x <= diag; x += spacingPx) {
      ctx.beginPath();
      ctx.moveTo(x, -diag);
      ctx.lineTo(x, diag);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Cesium への適用
// ---------------------------------------------------------------------------

function entityFeatureProps(entity, time) {
  try {
    const p = entity.properties;
    return p?.getValue ? (p.getValue(time) || {}) : (p || {});
  } catch (e) {
    return {};
  }
}

function entityCentroid(entity, time) {
  try {
    const hierarchy = entity.polygon?.hierarchy?.getValue?.(time);
    const positions = hierarchy?.positions || entity.polyline?.positions?.getValue?.(time);
    if (!positions?.length) return null;
    const sum = positions.reduce((acc, p) => Cesium.Cartesian3.add(acc, p, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    return Cesium.Cartesian3.divideByScalar(sum, positions.length, new Cesium.Cartesian3());
  } catch (e) {
    return null;
  }
}

// polyline 用の破線マテリアル。[on,off]px → 16bit パターン
function dashMaterialProperty(color, dash) {
  if (!dash?.length) return new Cesium.ColorMaterialProperty(toCesiumColor(color));
  const total = dash.reduce((a, b) => a + b, 0);
  let pattern = 0;
  for (let i = 0; i < 16; i++) {
    const t = ((i + 0.5) / 16) * total;
    let acc = 0, on = true;
    for (let j = 0; j < dash.length; j++) {
      if (t < acc + dash[j]) { on = j % 2 === 0; break; }
      acc += dash[j];
    }
    if (on) pattern |= (1 << (15 - i));
  }
  if (!pattern) pattern = 0xffff;
  return new Cesium.PolylineDashMaterialProperty({ color: toCesiumColor(color), dashPattern: pattern, dashLength: total });
}

// エンティティ(entity 描画経路)にコンパイル済みスタイルを適用する。
// clamp: 地形ドレープ中か(ドレープ時はポリゴンのアウトラインが描かれないため
// 周線を別途 polyline で引く)
function applyQmlStyleToDataSource(ds, style, { clamp = false, time = null, hiddenSymbols = null } = {}) {
  if (!style) return;
  const t = time || Cesium.JulianDate.now();
  const hasHidden = !!(hiddenSymbols && hiddenSymbols.size);
  for (const entity of ds.entities.values) {
    const props = entityFeatureProps(entity, t);
    // 凡例の条件別チェックで非表示化されたシンボルにだけ該当する地物は隠す
    const hiddenByLegend = hasHidden && style.namesFor
      && (() => { const names = style.namesFor(props); return names.length > 0 && names.every(name => hiddenSymbols.has(name)); })();
    const spec = hiddenByLegend ? null : style.evaluate(props);
    const hasPoint = !!entity.billboard;
    const hasLine = !!entity.polyline;
    const hasFill = !!entity.polygon;

    if (!spec) {
      if (entity.billboard) entity.billboard.show = new Cesium.ConstantProperty(false);
      if (entity.polyline) entity.polyline.show = new Cesium.ConstantProperty(false);
      if (entity.polygon) entity.polygon.show = new Cesium.ConstantProperty(false);
      if (entity.label) entity.label.show = new Cesium.ConstantProperty(false);
      continue;
    }

    const ddc = spec.scale ? new Cesium.DistanceDisplayCondition(spec.scale.near, spec.scale.far) : null;

    // ポイント → billboard(canvas 合成アイコン)
    if (hasPoint) {
      if (spec.markers?.length) {
        const canvas = markerLayersToCanvas(spec.markers);
        entity.billboard.show = new Cesium.ConstantProperty(true);
        entity.billboard.image = new Cesium.ConstantProperty(canvas);
        entity.billboard.scale = new Cesium.ConstantProperty(1);
        entity.billboard.verticalOrigin = new Cesium.ConstantProperty(Cesium.VerticalOrigin.CENTER);
        entity.billboard.horizontalOrigin = new Cesium.ConstantProperty(Cesium.HorizontalOrigin.CENTER);
        const rot = spec.markers[0]?.rotationDeg || 0;
        if (rot) entity.billboard.rotation = new Cesium.ConstantProperty(-rot * Math.PI / 180);
        if (ddc) entity.billboard.distanceDisplayCondition = new Cesium.ConstantProperty(ddc);
      } else {
        entity.billboard.show = new Cesium.ConstantProperty(false);
      }
    }

    // ライン
    if (hasLine) {
      if (spec.line) {
        entity.polyline.show = new Cesium.ConstantProperty(true);
        entity.polyline.material = dashMaterialProperty(spec.line.color, spec.line.dash);
        entity.polyline.width = new Cesium.ConstantProperty(spec.line.widthPx);
        if (ddc) entity.polyline.distanceDisplayCondition = new Cesium.ConstantProperty(ddc);
      } else {
        entity.polyline.show = new Cesium.ConstantProperty(false);
      }
    }

    // ポリゴン
    if (hasFill) {
      if (spec.fillParts?.length) {
        entity.polygon.show = new Cesium.ConstantProperty(true);
        const { solidBase, tile, tileMeters } = fillPartsToTile(spec.fillParts);
        if (tile) {
          const repeat = computeFillRepeat(entity, t, tileMeters);
          entity.polygon.material = new Cesium.ImageMaterialProperty({ image: tile, repeat, transparent: true });
        } else if (solidBase) {
          entity.polygon.material = new Cesium.ColorMaterialProperty(toCesiumColor(solidBase));
        } else {
          entity.polygon.material = new Cesium.ColorMaterialProperty(Cesium.Color.TRANSPARENT);
        }
        if (ddc) entity.polygon.distanceDisplayCondition = new Cesium.ConstantProperty(ddc);
      } else {
        entity.polygon.show = new Cesium.ConstantProperty(false);
      }
      // アウトライン: ドレープ時は polygon.outline が効かないため polyline で引く。
      // ただし entity が元から polyline を持つ(GeometryCollection)場合は上書きしない
      if (spec.outline) {
        const ring = outlinePositions(entity, t);
        if (hasLine) {
          entity.polygon.outline = new Cesium.ConstantProperty(true);
          entity.polygon.outlineColor = new Cesium.ConstantProperty(toCesiumColor(spec.outline.color));
        } else if (ring?.length) {
          if (!entity.polyline) entity.polyline = new Cesium.PolylineGraphics();
          entity.polyline.show = new Cesium.ConstantProperty(true);
          entity.polyline.positions = new Cesium.ConstantProperty(ring.concat([ring[0]]));
          entity.polyline.width = new Cesium.ConstantProperty(spec.outline.widthPx);
          entity.polyline.material = dashMaterialProperty(spec.outline.color, spec.outline.dash);
          entity.polyline.clampToGround = new Cesium.ConstantProperty(clamp);
          entity.polyline.arcType = new Cesium.ConstantProperty(Cesium.ArcType.GEODESIC);
          if (clamp) {
            entity.polyline.classificationType = entity.polygon.classificationType;
          }
          if (ddc) entity.polyline.distanceDisplayCondition = new Cesium.ConstantProperty(ddc);
        } else {
          entity.polygon.outline = new Cesium.ConstantProperty(true);
          entity.polygon.outlineColor = new Cesium.ConstantProperty(toCesiumColor(spec.outline.color));
        }
      } else if (spec.fillParts?.length) {
        entity.polygon.outline = new Cesium.ConstantProperty(false);
      }
      // 重心マーカー(CentroidFill)
      if (spec.centroid?.length) {
        const center = entityCentroid(entity, t);
        if (center) {
          entity.position = new Cesium.ConstantPositionProperty(center);
          if (!entity.billboard) entity.billboard = new Cesium.BillboardGraphics();
          const canvas = markerLayersToCanvas(spec.centroid);
          entity.billboard.image = new Cesium.ConstantProperty(canvas);
          entity.billboard.verticalOrigin = new Cesium.ConstantProperty(Cesium.VerticalOrigin.CENTER);
          entity.billboard.horizontalOrigin = new Cesium.ConstantProperty(Cesium.HorizontalOrigin.CENTER);
        }
      }
    }

    // ラベル
    if (style.labelFor) {
      const labelSpec = style.labelFor(props);
      const text = labelSpec ? String(labelSpec.getText?.(props) ?? "") : "";
      if (labelSpec && text) {
        if (!entity.position && (hasLine || hasFill)) {
          const center = entityCentroid(entity, t);
          if (center) entity.position = new Cesium.ConstantPositionProperty(center);
        }
        entity.label = new Cesium.LabelGraphics({
          text,
          font: labelSpec.fontCss,
          fillColor: toCesiumColor(labelSpec.fill),
          outlineColor: labelSpec.halo ? toCesiumColor(labelSpec.halo.color) : Cesium.Color.BLACK,
          outlineWidth: labelSpec.halo ? labelSpec.halo.widthPx : 0,
          style: labelSpec.halo ? Cesium.LabelStyle.FILL_AND_OUTLINE : Cesium.LabelStyle.FILL,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: hasPoint ? new Cesium.Cartesian2(0, -12) : new Cesium.Cartesian2(0, 0),
        });
        if (ddc) entity.label.distanceDisplayCondition = new Cesium.ConstantProperty(ddc);
      }
    }
  }
}

function outlinePositions(entity, time) {
  try {
    const h = entity.polygon?.hierarchy?.getValue?.(time);
    return h?.positions || null;
  } catch (e) {
    return null;
  }
}

// パターンタイルの実寸(概算)からポリゴンの bbox に対する repeat を計算する
function computeFillRepeat(entity, time, tileMeters) {
  const def = new Cesium.Cartesian2(1, 1);
  if (!tileMeters || tileMeters <= 0) return def;
  try {
    const h = entity.polygon?.hierarchy?.getValue?.(time);
    const positions = h?.positions;
    if (!positions?.length) return def;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const p of positions) {
      const c = Cesium.Cartographic.fromCartesian(p);
      const lon = c.longitude, lat = c.latitude;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    const midLat = (minLat + maxLat) / 2;
    const mPerDegX = 111320 * Math.cos(midLat);
    const mPerDegY = 110540;
    const wM = Math.max((maxLon - minLon) * mPerDegX, tileMeters);
    const hM = Math.max((maxLat - minLat) * mPerDegY, tileMeters);
    return new Cesium.Cartesian2(Math.max(wM / tileMeters, 1), Math.max(hM / tileMeters, 1));
  } catch (e) {
    return def;
  }
}

// GeoJsonPrimitive(バッチ描画経路)にスタイルを適用する。
// Buffer 系は featureId 単位で setMaterial できる。シェイプ・破線・パターンは
// 表現できないため色・サイズ・線幅の対応のみ(フォールバック)
function applyQmlStyleToPrimitive(primitive, style, hiddenSymbols = null) {
  if (!style || !primitive) return;
  const hasHidden = !!(hiddenSymbols && hiddenSymbols.size);
  const materialCache = new Map();
  const matFor = (kind, spec) => {
    const key = kind + JSON.stringify(spec);
    let m = materialCache.get(key);
    if (!m) {
      if (kind === "point") {
        const mk = spec.markers?.[0];
        m = new Cesium.BufferPointMaterial({
          color: toCesiumColor(mk?.fill || [0.2, 0.4, 0.9, 1]),
          size: Math.max(mk?.sizePx || 6, 2),
          outlineColor: toCesiumColor(mk?.stroke || [0, 0, 0, 1]),
          outlineWidth: mk?.stroke ? Math.max(mk.strokeWidthPx || 1, 1) : 0,
        });
      } else if (kind === "line") {
        m = new Cesium.BufferPolylineMaterial({
          color: toCesiumColor(spec.line?.color || [0, 0, 0, 1]),
          width: Math.max(spec.line?.widthPx || 1, 1),
        });
      } else {
        const solids = (spec.fillParts || []).filter(pt => pt.solid);
        const base = solids.length ? solids[solids.length - 1].solid : [0.5, 0.5, 0.5, 0.7];
        m = new Cesium.BufferPolygonMaterial({
          color: toCesiumColor(base),
          outlineColor: toCesiumColor(spec.outline?.color || base),
          outlineWidth: spec.outline ? Math.max(spec.outline.widthPx || 1, 1) : 0,
        });
      }
      materialCache.set(key, m);
    }
    return m;
  };

  const applyTo = (collection, ctor, kind, pick) => {
    if (!collection) return;
    const scratch = new ctor();
    for (let i = 0; i < collection.primitiveCount; i++) {
      collection.get(i, scratch);
      const props = primitive.getProperties(scratch.featureId) || {};
      const hiddenByLegend = hasHidden && style.namesFor
        && (() => { const names = style.namesFor(props); return names.length > 0 && names.every(name => hiddenSymbols.has(name)); })();
      const spec = hiddenByLegend ? null : style.evaluate(props);
      if (!spec || !pick(spec)) {
        scratch.setMaterial(transparentMaterial(kind));
        continue;
      }
      scratch.setMaterial(matFor(kind, spec));
    }
  };

  applyTo(primitive.points, Cesium.BufferPoint, "point", s => s.markers?.length);
  applyTo(primitive.polylines, Cesium.BufferPolyline, "line", s => !!s.line);
  applyTo(primitive.polygons, Cesium.BufferPolygon, "fill", s => !!s.fillParts?.length);
}

function transparentMaterial(kind) {
  const t = new Cesium.Color(0, 0, 0, 0);
  if (kind === "point") return new Cesium.BufferPointMaterial({ color: t, size: 1 });
  if (kind === "line") return new Cesium.BufferPolylineMaterial({ color: t, width: 1 });
  return new Cesium.BufferPolygonMaterial({ color: t });
}

// --- qml-to-reearth.js (vendored, do not edit inline) ---
// QML (QGIS layer style) -> Re:Earth appearance translator.
// Depends on the vendored qml-style.js module (compileQmlStyle /
// resolveSymbolLayers / markerLayersToCanvas). Runs inside the UI iframe
// (needs DOMParser + canvas). Returns plain appearance objects with
// {expression:{conditions}} fields evaluated per-feature by Visualizer.
//
// qmlStyleToReearth(xmlText, opts) -> { marker, polyline, polygon, warnings, legend }
// opts: { qmlUrl, props0, qml: <module>, fetchImages }

function qmlQ2J(expr, fbField){
  const fb = fbField ? '\${'+fbField+'}' : 'null';
  let s = String(expr||'').trim();
  if (!s || /^ELSE$/i.test(s)) return 'true';
  s = s.replace(/"([^"]+)"/g, '\${$1}');
  s = s.replace(/eval\\s*\\([^)]*\\)/gi, fb);
  s = s.replace(/@[\\w]+/g, fb);
  s = s.replace(/(\\$\\{[^}]+\\}|null)\\s*\\b(NOT\\s+|!\\s*)?IN\\s*\\(([^)]*)\\)/gi,
      (m,f,n,l)=> (n ? '!(' : '(') + l.split(',').map(v=>\`\${f} === \${v.trim()}\`).join(' || ') + ')');
  s = s.replace(/\\bAND\\b/gi,'&&').replace(/\\bOR\\b/gi,'||').replace(/\\bNOT\\b/gi,'!');
  s = s.replace(/\\bIS\\s+NOT\\s+NULL\\b/gi,'!== null').replace(/\\bIS\\s+NULL\\b/gi,'=== null');
  s = s.replace(/<>/g,'!==');
  s = s.replace(/(?<![<>=!~])=(?!=)/g,'===');
  return s;
}

function qmlNumOrStr(v){ return (v!=='' && !isNaN(Number(v))) ? v : \`'\${String(v).replace(/'/g,"\\\\'")}'\`; }
function qmlToResult(v){ return typeof v === 'number' ? String(v) : \`'\${String(v).replace(/'/g,"\\\\'")}'\`; }
function qmlRgbaCss(rgba){
  if (!rgba) return 'rgba(0,0,0,0)';
  const [r,g,b,a] = rgba;
  return \`rgba(\${Math.round(r*255)},\${Math.round(g*255)},\${Math.round(b*255)},\${Math.round(a*1000)/1000})\`;
}
const _qmlApplyAlpha = (c, al) => c ? [c[0],c[1],c[2],c[3]*al] : c;
const _qmlGisRgba = s => (s && s.split(',').length >= 3)
  ? \`rgba(\${s.split(',').slice(0,3).join(',')},\${(Number(s.split(',')[3]??255)/255)})\` : (s||'#222222');

function qmlRendererConds(rendererEl, props0, warnings){
  const type = rendererEl.getAttribute('type') || 'singleSymbol';
  let attr = rendererEl.getAttribute('attr');
  if (attr && (!/^\\w+$/.test(attr) || !(attr in (props0||{})))) {
    warnings.push(\`renderer attr '\${attr}' is an expression or missing field -> fallback\`);
    attr = null;
  }
  if (!attr && props0){
    const cands = ['FEATURECLA','featurecla','NAME','name'];
    attr = cands.find(c => c in props0) || Object.keys(props0)[0];
  }
  const conds = [];
  let elseName = null;
  if (type === 'singleSymbol'){
    const s = rendererEl.querySelector('symbols > symbol');
    return { conds: null, elseName: s ? s.getAttribute('name') : null };
  }
  if (type === 'categorizedSymbol'){
    for (const c of rendererEl.querySelectorAll('categories > category')){
      if (c.getAttribute('render') === 'false') continue;
      const v = c.getAttribute('value'), s = c.getAttribute('symbol');
      if (v === null || v === '') { elseName = s; continue; }
      conds.push([\`\\\${\${attr}} === \${qmlNumOrStr(v)}\`, s]);
    }
    return { conds, elseName };
  }
  if (type === 'graduatedSymbol'){
    const ranges = [...rendererEl.querySelectorAll('ranges > range')];
    ranges.forEach((r,i)=>{
      const lo = r.getAttribute('lower'), hi = r.getAttribute('upper'), s = r.getAttribute('symbol');
      const op = (i === ranges.length-1) ? '<=' : '<';
      conds.push([\`\\\${\${attr}} >= \${lo} && \\\${\${attr}} \${op} \${hi}\`, s]);
    });
    return { conds, elseName };
  }
  if (type === 'RuleBased'){
    const walk = (ruleEl, parentCond) => {
      const filter = ruleEl.getAttribute('filter');
      const sym = ruleEl.getAttribute('symbol');
      let cond = parentCond;
      if (filter && !/^ELSE$/i.test(filter)) {
        const c = qmlQ2J(filter, attr);
        cond = cond ? \`(\${cond}) && (\${c})\` : c;
      }
      if (sym) conds.push([cond || 'true', sym]);
      for (const ch of [...ruleEl.children].filter(x=>x.tagName==='rule')) walk(ch, cond);
    };
    const rulesEl = [...rendererEl.children].find(c=>c.tagName==='rules');
    for (const r of rulesEl ? [...rulesEl.children].filter(c=>c.tagName==='rule') : []){
      const filter = r.getAttribute('filter');
      if (filter && /^ELSE$/i.test(filter)) { elseName = r.getAttribute('symbol'); continue; }
      walk(r, null);
    }
    return { conds, elseName };
  }
  return { conds: null, elseName: null, warn: \`renderer \${type} unsupported\` };
}

function qmlSpecToFrags(spec, qml){
  const al = (spec && (spec.alpha!==undefined && spec.alpha!==null)) ? spec.alpha : 1;
  const frag = {};
  if (spec && spec.markers && spec.markers.length){
    try { frag.markerImage = qml.markerLayersToCanvas(spec.markers).toDataURL('image/png'); } catch(e){}
  }
  if (!frag.markerImage && spec && spec.markers && spec.markers.length){
    const m = spec.markers[0];
    if (m && m.fill) frag.point = { color: _qmlApplyAlpha(m.fill, al), sizePx: Math.max(2, Math.round(m.sizePx||6)) };
  }
  if (spec && spec.line) frag.line = { color: _qmlApplyAlpha(spec.line.color, al), widthPx: spec.line.widthPx, dash: spec.line.dash };
  const solid = spec && spec.fillParts ? spec.fillParts.find(p=>p && p.solid) : null;
  if (spec && spec.fillParts && spec.fillParts.length){
    frag.fill = { color: _qmlApplyAlpha(solid ? solid.solid : [0,0,0,0], al), hasFill: !!solid };
  }
  if (spec && spec.outline) frag.outline = { color: _qmlApplyAlpha(spec.outline.color, al), widthPx: spec.outline.widthPx, dash: spec.outline.dash };
  return frag;
}

function qmlLabelInfo(labelingEl, fbField){
  if (!labelingEl) return null;
  const type = labelingEl.getAttribute('type') || 'simple';
  const grab = el => {
    const ts = el.querySelector('text-style') || el.querySelector('settings text-style');
    if (!ts) return null;
    const g = n => ts.getAttribute(n);
    return {
      field: g('fieldName')||'', isExpr: g('isExpression')==='1',
      sizePx: Math.round((Number(g('fontSize'))||10) * ((g('fontSizeUnit')||'Point')==='MM'?96/25.4:96/72)),
      color: g('textColor'), buffer: g('bufferDraw')==='1', bufferColor: g('bufferColor'),
      bold: g('fontBold')==='1', italic: g('fontItalic')==='1', family: g('fontFamily')||'sans-serif',
    };
  };
  if (type === 'rule-based'){
    const rules = [];
    const rulesEl = [...labelingEl.children].find(c=>c.tagName==='rules') || labelingEl;
    for (const r of [...rulesEl.children].filter(c=>c.tagName==='rule')){
      const st = grab(r); if (!st) continue;
      rules.push({ cond: qmlQ2J(r.getAttribute('filter'), fbField), style: st });
    }
    return rules.length ? { rules, style: rules[0].style } : null;
  }
  const st = grab(labelingEl);
  return st ? { style: st } : null;
}

function qmlStyleToReearth(xmlText, opts){
  opts = opts || {};
  const qml = opts.qml;
  const props0 = opts.props0 || {};
  const warnings = [];
  const qmlUrl = opts.qmlUrl || '';
  const style = qml.compileQmlStyle(xmlText, qmlUrl, opts.preloadedImages);
  warnings.push(...(style.warnings||[]));
  const doc = new DOMParser().parseFromString(String(xmlText), 'application/xml');
  const rendererEl = doc.querySelector('renderer-v2');
  const specByName = new Map();
  for (const le of style.legend) specByName.set(le.symbolName, le.spec);
  for (const [name, sym] of style.symbols){
    if (!specByName.has(name)){
      try { specByName.set(name, qml.resolveSymbolLayers(sym, {}, style.images, new Set())); }
      catch(e){ specByName.set(name, null); }
    }
  }
  const { conds, elseName, warn } = qmlRendererConds(rendererEl, props0, warnings);
  if (warn) { warnings.push(warn); return { error: warn, warnings }; }
  const fbField = ('FEATURECLA' in props0) ? 'FEATURECLA' : ('NAME' in props0 ? 'NAME' : (Object.keys(props0)[0]||null));
  const label = qmlLabelInfo(doc.querySelector('labeling'), fbField);
  if (label){
    const fix = st => {
      if (st.isExpr || !st.field || !(st.field in props0)){
        warnings.push(\`label field '\${st.field}' -> \${fbField||'?'} fallback\`);
        st.field = fbField || Object.keys(props0)[0];
        st.isExpr = false;
      }
      return st;
    };
    if (label.rules) label.rules.forEach(r => fix(r.style));
    else fix(label.style);
  }
  const frags = new Map();
  const fragFor = n => {
    if (!frags.has(n)) frags.set(n, qmlSpecToFrags(specByName.get(n) || {}, qml));
    return frags.get(n);
  };
  const condOrVal = (conds, getV, elseName2) => {
    if (!conds) return getV(fragFor(elseName2));
    const list = conds.map(([c,s])=>[c, getV(fragFor(s))]).filter(([,v])=>v!==undefined&&v!==null)
      .map(([c,v])=>[c, qmlToResult(v)]);
    if (elseName2) { const v = getV(fragFor(elseName2)); if (v!==undefined&&v!==null) list.push(['true', qmlToResult(v)]); }
    if (!list.length) return undefined;
    return { expression: { conditions: list } };
  };

  const marker = {};
  const img = condOrVal(conds, f=>f.markerImage, elseName);
  if (img !== undefined){
    marker.style = 'image'; marker.image = img; marker.imageSize = 1;
    marker.imageHorizontalOrigin = 'center'; marker.imageVerticalOrigin = 'center';
  } else {
    const pt = condOrVal(conds, f=>f.point, elseName);
    marker.style = 'point';
    marker.pointColor = pt && pt.color ? (typeof pt === 'string' ? pt : qmlRgbaCss(pt.color)) : '#3388ff';
    marker.pointSize = pt && pt.sizePx ? pt.sizePx : 8;
  }
  if (label){
    marker.label = true; marker.labelPosition = 'righttop';
    const st = label.style;
    marker.labelTypography = { fontFamily: st.family, fontSize: st.sizePx, fontWeight: st.bold?'bold':'normal', fontStyle: st.italic?'italic':'normal', color: _qmlGisRgba(st.color) };
    if (st.buffer) { marker.labelBackground = true; marker.labelBackgroundColor = _qmlGisRgba(st.bufferColor); marker.labelBackgroundPaddingHorizontal = 2; marker.labelBackgroundPaddingVertical = 1; }
    if (label.rules){
      marker.labelText = { expression: { conditions: [...label.rules.map(r=>[r.cond, qmlToResult("\${" + r.style.field + "}")]), ['true', "''"]] } };
    } else if (st.field){
      marker.labelText = { expression: "'\${" + st.field + "}'" };
    }
  } else {
    marker.style = marker.style || 'none';
  }

  const polyline = { clampToGround: true };
  const sc = condOrVal(conds, f=>f.line && qmlRgbaCss(f.line.color), elseName);
  const sw = condOrVal(conds, f=>f.line && Math.max(1,Math.round(f.line.widthPx)), elseName);
  if (sc !== undefined){ polyline.strokeColor = sc; polyline.strokeWidth = (sw!==undefined?sw:1); }
  else polyline.show = false;
  const dashWarn = [...frags.values()].some(f=>f.line&&f.line.dash) || [...frags.values()].some(f=>f.outline&&f.outline.dash);
  if (dashWarn) warnings.push('dash/dot line styles degrade to solid lines');

  const polygon = { fill:true, stroke:false, heightReference:'clamp' };
  const fc = condOrVal(conds, f=>f.fill && qmlRgbaCss(f.fill.color), elseName);
  const oc = condOrVal(conds, f=>f.outline && qmlRgbaCss(f.outline.color), elseName);
  const ow = condOrVal(conds, f=>f.outline && Math.max(1,Math.round(f.outline.widthPx)), elseName);
  if (fc !== undefined) polygon.fillColor = fc;
  if (oc !== undefined){ polygon.stroke = true; polygon.strokeColor = oc; polygon.strokeWidth = (ow!==undefined?ow:1); }

  const legend = (style.legend||[]).map(e=>({ label: e.label, symbolName: e.symbolName }));
  return { marker, polyline, polygon, warnings, legend };
}

// __QML_INLINE_END__
  // === end injected QML code ===

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
  try { window._googleMapsApiKey = ${JSON.stringify(_inspectorGoogleMapsApiKey || '')}; } catch(e) {}
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

      // Tab switching: handle normal tabs, a minimize-action tab, and
      // standalone action buttons (FLY / Share / Settings) that open panels
      try {
        const tabs = document.querySelectorAll('.tab-bar .tab');
        const actionBtns = document.querySelectorAll('.tab-bar .action-btn');
        const _panelIds = ['layers-panel','legend-panel','search-panel','cams-panel','info-panel','share-panel','fly-panel','settings-panel','attr-panel','manage-panel'];
        const activatePanel = (target) => {
          try { window._activeTabId = target; } catch (e) {}
          _panelIds.forEach(id => {
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
          try { if (typeof window._flyPanelVisibility === 'function') window._flyPanelVisibility(target === 'fly-panel'); } catch(e) {}
        };
        const clearActionBtns = () => {
          try { (actionBtns || []).forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); }); } catch(e) {}
        };
        const clearTabs = () => {
          try { (tabs || []).forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); }); } catch(e) {}
        };
        const closeAttrWidgetIfOpen = () => {
          try { if (window._attrPanelExpanded && typeof window.closeVectorAttrWidget === 'function') window.closeVectorAttrWidget(); } catch(e) {}
        };
        if (tabs && tabs.length) {
          tabs.forEach(btn => {
            btn.addEventListener('click', function() {
              // Close the expanded attribute widget on minimize / tab switch so
              // the panel always returns to the base size first
              closeAttrWidgetIfOpen();
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
                try { if (typeof window._flyPanelVisibility === 'function') window._flyPanelVisibility(pressed && window._activeTabId === 'fly-panel'); } catch(e) {}
                return;
              }
              const target = this.getAttribute('data-target');
              if (!target) return;
              clearTabs();
              clearActionBtns();
              this.classList.add('active'); this.setAttribute('aria-selected','true');
              activatePanel(target);
            });
          });
          // Standalone action buttons open their panels the same way as tabs
          (actionBtns || []).forEach(btn => {
            btn.addEventListener('click', function() {
              closeAttrWidgetIfOpen();
              const target = this.getAttribute('data-target');
              if (!target) return;
              clearTabs();
              clearActionBtns();
              this.classList.add('active'); this.setAttribute('aria-pressed','true');
              activatePanel(target);
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
            const tabsArr = Array.from(tabBar.querySelectorAll('.tab, .action-btn'));
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

            // Manage panel (KASUGAI Canvas manage window equivalent):
            // inspector settings text viewer/editor
            try {
              const manageOpenBtn = document.getElementById('manage-open-btn');
              if (manageOpenBtn) {
                manageOpenBtn.addEventListener('click', function() {
                  try { window.parent.postMessage({ action: 'manageTextRequest' }, '*'); } catch(e) {}
                });
              }
              const manageApplyBtn = document.getElementById('manage-apply-btn');
              if (manageApplyBtn) {
                manageApplyBtn.addEventListener('click', function() {
                  const ta = document.getElementById('manage-inspector-text');
                  if (ta && window.parent) window.parent.postMessage({ action: 'applyInspectorText', text: ta.value }, '*');
                });
              }
              const manageCopyBtn = document.getElementById('manage-copy-btn');
              if (manageCopyBtn) {
                manageCopyBtn.addEventListener('click', function() {
                  const ta = document.getElementById('manage-inspector-text');
                  if (!ta) return;
                  try {
                    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value);
                    else { ta.select(); document.execCommand('copy'); }
                  } catch(e) { try { ta.select(); document.execCommand('copy'); } catch(e2) {} }
                });
              }
              // Local file import (KASUGAI Canvas DATA/ add equivalent).
              // Files are decoded here in the iframe (no server needed) and the
              // resulting GeoJSON is sent to the extension as an 'importAdd'
              // layer add request. .kasc/.txt is forwarded as 'importKasc' so
              // the extension appends the lines to inspectorText.
              const importBtn = document.getElementById('import-file-btn');
              const importInput = document.getElementById('import-file-input');
              const importStatus = document.getElementById('import-status');
              const setImportStatus = function(txt, isErr) {
                if (!importStatus) return;
                importStatus.textContent = txt || '';
                importStatus.style.color = isErr ? '#c0392b' : '#666';
              };
              const importDetect = function(name) {
                var n = String(name || '').toLowerCase();
                if (/\\.kasc$|\\.txt$/.test(n)) return 'kasc';
                if (/\\.geojson$|\\.json$/.test(n)) return 'geojson';
                if (/\\.fgb$|\\.flatgeobuf$/.test(n)) return 'fgb';
                if (/\\.parquet$|\\.geoparquet$/.test(n)) return 'parquet';
                if (/\\.gpkg$|\\.geopackage$/.test(n)) return 'gpkg';
                if (/\\.csv$|\\.tsv$/.test(n)) return 'csv';
                return null;
              };
              const importFile = function(file) {
                var type = importDetect(file.name);
                var done = function(gj) {
                  try { parent.postMessage({ action: 'importAdd', title: file.name, geojson: gj }, '*'); } catch (e) {}
                };
                var fail = function(e) { setImportStatus(file.name + ': ' + String(e && e.message || e), true); };
                try {
                  if (type === 'kasc') {
                    file.text().then(function(t) {
                      try { parent.postMessage({ action: 'importKasc', text: t }, '*'); } catch (e) {}
                    }).catch(fail);
                  } else if (type === 'geojson') {
                    file.text().then(function(t) { done(JSON.parse(t)); }).catch(fail);
                  } else if (type === 'csv') {
                    file.text().then(function(t) { done(csvTextToGeoJson(t)); }).catch(fail);
                  } else if (type === 'fgb') {
                    var modP = window._fgbModule || (window._fgbModule = import('https://cdn.jsdelivr.net/npm/flatgeobuf@4.4.0/lib/mjs/geojson.js/+esm'));
                    modP.then(function(mod) {
                      var features = [];
                      var iter = mod.deserialize(file.stream());
                      var next = function() {
                        return iter.next().then(function(r) {
                          if (r.done) return done({ type: 'FeatureCollection', features: features });
                          if (r.value && r.value.geometry) features.push(r.value);
                          return next();
                        });
                      };
                      return next();
                    }).catch(fail);
                  } else if (type === 'parquet') {
                    var pqP = window._pqModule || (window._pqModule = Promise.all([
                      import('https://cdn.jsdelivr.net/npm/hyparquet@1.30.1/+esm'),
                      import('https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm')
                    ]).then(function(mods) {
                      return { parquetReadObjects: mods[0].parquetReadObjects, parquetMetadata: mods[0].parquetMetadataAsync || mods[0].parquetMetadata, compressors: mods[1].compressors };
                    }));
                    pqP.then(function(mod) {
                      return file.arrayBuffer().then(function(buf) {
                        return mod.parquetReadObjects({ file: buf, compressors: mod.compressors });
                      }).then(function(rows) {
                        rows = rows || [];
                        if (!rows.length) return done({ type: 'FeatureCollection', features: [] });
                        var isGeom = function(v) { return v instanceof Uint8Array || (v && typeof v === 'object' && typeof v.type === 'string' && ('coordinates' in v || 'geometries' in v)); };
                        var gcol = ('geometry' in rows[0]) ? 'geometry' : Object.keys(rows[0]).find(function(k) { return isGeom(rows[0][k]); });
                        if (!gcol) throw new Error('geometry column not found');
                        var features = [];
                        for (var i = 0; i < rows.length; i++) {
                          var v = rows[i][gcol];
                          var g = v instanceof Uint8Array ? vecWkbToGeoJson(v) : (isGeom(v) ? v : null);
                          if (!g) continue;
                          var props = {};
                          for (var k in rows[i]) { if (k !== gcol) props[k] = rows[i][k]; }
                          features.push({ type: 'Feature', geometry: g, properties: props });
                        }
                        done({ type: 'FeatureCollection', features: features });
                      });
                    }).catch(fail);
                  } else if (type === 'gpkg') {
                    file.arrayBuffer().then(function(buf) {
                      var b64 = '';
                      var bytes = new Uint8Array(buf);
                      var chunk = 0x8000;
                      for (var i = 0; i < bytes.length; i += chunk) {
                        b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
                      }
                      return gpkgQueryToGeoJson({ url: 'file:' + file.name, dataB64: btoa(b64) });
                    }).then(function(res) { done(res.geojson); }).catch(fail);
                  } else {
                    fail(new Error('unsupported file type'));
                  }
                } catch (e) { fail(e); }
              };
              if (importBtn && importInput) {
                importBtn.addEventListener('click', function() { importInput.click(); });
                importInput.addEventListener('change', function(ev) {
                  var files = Array.prototype.slice.call(ev.target.files || []);
                  ev.target.value = '';
                  files.forEach(importFile);
                });
              }
            } catch(e) {}

            // WKB(ISO/EWKB) -> GeoJSON geometry (port of kasugai vector-decode.js).
            // Shared by the pqLoad (GeoParquet) and ddbLoad (DuckDB-Wasm) decoders.
            var vecWkbToGeoJson = function(bytes) {
              if (!bytes || !bytes.byteLength) return null;
              var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
              var pos = 0;
              var readGeometry = function() {
                var littleEndian = view.getUint8(pos) === 1; pos += 1;
                var raw = view.getUint32(pos, littleEndian); pos += 4;
                var base = raw & 0xffff;
                var hasZ = (raw & 0x80000000) !== 0;
                var hasM = (raw & 0x40000000) !== 0;
                var hasSrid = (raw & 0x20000000) !== 0;
                if (!hasZ && !hasM && raw >= 1000) {
                  var variant = Math.floor(raw / 1000);
                  hasZ = variant === 1 || variant === 3;
                  hasM = variant === 2 || variant === 3;
                  base = raw % 1000;
                }
                if (hasSrid) pos += 4;
                var count = function() { var n = view.getUint32(pos, littleEndian); pos += 4; return n; };
                var point = function() {
                  var c = [view.getFloat64(pos, littleEndian), view.getFloat64(pos + 8, littleEndian)];
                  pos += 16;
                  if (hasZ) { c.push(view.getFloat64(pos, littleEndian)); pos += 8; }
                  if (hasM) pos += 8;
                  return c;
                };
                var points = function() { var a = new Array(count()); for (var i = 0; i < a.length; i++) a[i] = point(); return a; };
                var rings = function() { var a = new Array(count()); for (var i = 0; i < a.length; i++) a[i] = points(); return a; };
                var children = function() { var a = new Array(count()); for (var i = 0; i < a.length; i++) a[i] = readGeometry(); return a; };
                switch (base) {
                  case 1: return { type: 'Point', coordinates: point() };
                  case 2: return { type: 'LineString', coordinates: points() };
                  case 3: return { type: 'Polygon', coordinates: rings() };
                  case 4: return { type: 'MultiPoint', coordinates: children().map(function(g) { return g && g.coordinates; }) };
                  case 5: return { type: 'MultiLineString', coordinates: children().map(function(g) { return g && g.coordinates; }) };
                  case 6: return { type: 'MultiPolygon', coordinates: children().map(function(g) { return g && g.coordinates; }) };
                  case 7: return { type: 'GeometryCollection', geometries: children().filter(Boolean) };
                  default: return null;
                }
              };
              try { return readGeometry(); } catch (e) { return null; }
            };

            // GPkgBinary helpers for the gpkg: decoder (kasugai gpkg-worker port).
            // sql.js cannot use the RTree module, so bbox filtering reads the
            // envelope stored in the GPkgBinary header (much cheaper than WKB decode).
            var gpkgBinToWkb = function(value) {
              if (!(value instanceof Uint8Array) || value.length < 8 || value[0] !== 0x47 || value[1] !== 0x50) return null;
              var envelopeBytes = [0, 32, 48, 48, 64][(value[3] >> 1) & 0x07] || 0;
              var wkb = value.subarray(8 + envelopeBytes);
              return wkb.length ? wkb : null;
            };
            var gpkgBinEnvelope = function(value) {
              if (!(value instanceof Uint8Array) || value.length < 40 || value[0] !== 0x47 || value[1] !== 0x50) return null;
              var t = (value[3] >> 1) & 0x07;
              if (t < 1 || t > 4) return null;
              var little = (value[3] & 1) === 1;
              var view = new DataView(value.buffer, value.byteOffset, value.byteLength);
              try { return { west: view.getFloat64(8, little), east: view.getFloat64(16, little), south: view.getFloat64(24, little), north: view.getFloat64(32, little) }; } catch (e) { return null; }
            };
            var gpkgEnvIntersects = function(env, bbox) {
              if (!env || !bbox) return true;
              var south = Number(bbox.south), north = Number(bbox.north);
              if (!(env.north >= south && env.south <= north)) return false;
              return (bbox.ranges || []).some(function(r) { return env.east >= Number(r.west) && env.west <= Number(r.east); });
            };
            var b64ToBytes = function(b64) {
              var bin = atob(b64);
              var out = new Uint8Array(bin.length);
              for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
              return out;
            };
            // sql.js(SQLite WASM) lazy loader for the gpkg: path.
            var loadSqlJsModule = function() {
              if (!window._sqljsModule) {
                var lp = import('https://cdn.jsdelivr.net/npm/sql.js@1.13.0/+esm').then(function(mod) {
                  var init = mod.default || mod.initSqlJs || mod;
                  return init({ locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/' + f; } });
                });
                lp.catch(function() { if (window._sqljsModule === lp) window._sqljsModule = null; });
                window._sqljsModule = lp;
              }
              return window._sqljsModule;
            };
            // Opened GeoPackage DBs are kept per url so bbox=auto re-queries
            // do not re-download the file (same policy as kasugai gpkg-worker).
            if (!window._gpkgDbs) window._gpkgDbs = {};
            var gpkgOpenDb = function(url, bytesB64) {
              var key = bytesB64 ? ('bytes:' + url) : url;
              var p = window._gpkgDbs[key];
              if (!p) {
                p = loadSqlJsModule().then(function(SQL) {
                  var bufP = bytesB64
                    ? Promise.resolve(b64ToBytes(bytesB64))
                    : fetch(url, { mode: 'cors' }).then(function(res) {
                        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                        return res.arrayBuffer();
                      }).then(function(buf) { return new Uint8Array(buf); });
                  return bufP.then(function(bytes) { return new SQL.Database(bytes); });
                });
                p.catch(function() { if (window._gpkgDbs[key] === p) delete window._gpkgDbs[key]; });
                window._gpkgDbs[key] = p;
              }
              return p;
            };
            // gpkg: query -> GeoJSON FeatureCollection
            // opts: {url, dataB64, table, where, limit, columns, bbox}
            var gpkgQueryToGeoJson = function(opts) {
              var qIdent = function(n) { return '"' + String(n).replace(/"/g, '""') + '"'; };
              var qLit = function(v) { return "'" + String(v).replace(/'/g, "''") + "'"; };
              return gpkgOpenDb(opts.url, opts.dataB64).then(function(db) {
                var tableName = opts.table || null;
                if (!tableName) {
                  var r0 = db.exec('SELECT table_name FROM gpkg_geometry_columns ORDER BY rowid LIMIT 1');
                  tableName = r0[0] && r0[0].values && r0[0].values[0] && r0[0].values[0][0] || null;
                }
                if (!tableName) throw new Error('feature table not found');
                var gres = db.exec('SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ' + qLit(tableName) + ' LIMIT 1');
                var geomCol = (gres[0] && gres[0].values && gres[0].values[0] && gres[0].values[0][0]) || 'geom';
                var cols = Array.isArray(opts.columns) && opts.columns.length ? opts.columns.map(qIdent) : null;
                var selectCols = cols ? cols.concat([qIdent(geomCol)]).join(', ') : '*';
                var preds = [];
                if (opts.where) preds.push('(' + opts.where + ')');
                var sql = 'SELECT ' + selectCols + ' FROM ' + qIdent(tableName)
                  + (preds.length ? ' WHERE ' + preds.join(' AND ') : '')
                  + (Number.isInteger(opts.limit) && opts.limit > 0 ? ' LIMIT ' + Math.floor(opts.limit) : '');
                var stmt = db.prepare(sql);
                var colNames = stmt.getColumnNames();
                var features = [];
                while (stmt.step()) {
                  var row = stmt.get();
                  var rec = {};
                  colNames.forEach(function(c, i) { rec[c] = row[i]; });
                  if (opts.bbox && !gpkgEnvIntersects(gpkgBinEnvelope(rec[geomCol]), opts.bbox)) continue;
                  var wkb = gpkgBinToWkb(rec[geomCol]);
                  var geometry = wkb ? vecWkbToGeoJson(wkb) : null;
                  if (!geometry) continue;
                  var properties = {};
                  for (var i = 0; i < colNames.length; i++) { var c = colNames[i]; if (c !== geomCol) properties[c] = rec[c]; }
                  features.push({ type: 'Feature', geometry: geometry, properties: properties });
                }
                stmt.free();
                var qml = null;
                try {
                  var sres = db.exec('SELECT styleQML FROM layer_styles WHERE f_table_name = ' + qLit(tableName) + ' ORDER BY useAsDefault DESC');
                  var qv = sres[0] && sres[0].values && sres[0].values[0] && sres[0].values[0][0];
                  if (typeof qv === 'string' && qv.trim()) qml = qv;
                } catch (e) {}
                return { geojson: { type: 'FeatureCollection', features: features }, qml: qml };
              });
            };
            window._gpkgQueryToGeoJson = gpkgQueryToGeoJson;
            // CSV/TSV text -> GeoJSON points (lon/lat or lat/lng columns)
            var csvTextToGeoJson = function(text) {
              var firstLine = String(text || '').split(/\\r?\\n/)[0] || '';
              var delim = firstLine.indexOf('\\t') >= 0 ? '\\t' : (firstLine.indexOf(';') >= 0 && firstLine.indexOf(',') < 0 ? ';' : ',');
              var rows = [];
              var cur = [], field = '', inQ = false;
              for (var i = 0; i < text.length; i++) {
                var ch = text[i];
                if (inQ) { if (ch === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch; }
                else if (ch === '"') inQ = true;
                else if (ch === delim) { cur.push(field); field = ''; }
                else if (ch === '\\n' || ch === '\\r') { if (ch === '\\r' && text[i+1] === '\\n') i++; cur.push(field); field = ''; rows.push(cur); cur = []; }
                else field += ch;
              }
              if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
              rows = rows.filter(function(r) { return r.length && r.some(function(c) { return String(c).trim() !== ''; }); });
              if (!rows.length) throw new Error('empty csv');
              var headers = rows[0].map(function(h) { return String(h).trim(); });
              var findCol = function(re) { for (var i = 0; i < headers.length; i++) { if (re.test(headers[i])) return i; } return -1; };
              var lonIdx = findCol(/^(lon|lng|longitude|x)$/i), latIdx = findCol(/^(lat|latitude|y)$/i);
              if (lonIdx < 0 || latIdx < 0) throw new Error('lon/lat columns not found');
              var features = [];
              for (var r = 1; r < rows.length; r++) {
                var row = rows[r];
                var x = Number(row[lonIdx]), y = Number(row[latIdx]);
                if (!isFinite(x) || !isFinite(y)) continue;
                var props = {};
                for (var j = 0; j < headers.length; j++) props[headers[j]] = row[j];
                features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props });
              }
              return { type: 'FeatureCollection', features: features };
            };
            window._csvTextToGeoJson = csvTextToGeoJson;

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
                    const t = document.querySelector('.tab[data-target="' + msg.tab + '"], .action-btn[data-target="' + msg.tab + '"]');
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
                        document.querySelectorAll('.tab-bar .tab, .tab-bar .action-btn').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); t.setAttribute('aria-pressed','false'); });
                        attrTab.classList.add('active'); attrTab.setAttribute('aria-selected','true');
                      }
                      ['layers-panel','legend-panel','search-panel','cams-panel','info-panel','share-panel','fly-panel','settings-panel','attr-panel'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.style.display = (id === 'attr-panel') ? '' : 'none';
                      });
                      try { window._activeTabId = 'attr-panel'; } catch(e) {}
                      try { if (typeof window._flyPanelVisibility === 'function') window._flyPanelVisibility(false); } catch(e) {}
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
                } else if (msg.action === 'flyInit') {
                  try {
                    window._flyCaps = msg.caps || {};
                    if (window._flyCaps && window._flyCaps.sketch === false) {
                      const db = document.getElementById('fly-draw-btn');
                      if (db) { db.disabled = true; db.title = 'sketch API not available'; }
                    }
                    (msg.drawn || []).forEach(function(n) { flyAddDrawnOption(n); });
                  } catch (e) {}
                } else if (msg.action === 'flyDrawn') {
                  try { flyOnSketchCreated(msg.geojson); } catch (e) {}
                } else if (msg.action === 'flyDrawnData') {
                  try {
                    const p = window._flyPendingDrawn && window._flyPendingDrawn[msg.name];
                    if (p) { delete window._flyPendingDrawn[msg.name]; p(msg.geojson || null); }
                  } catch (e) {}
                } else if (msg.action === 'flySampleResult') {
                  try {
                    const p = window._flyPendingSample && window._flyPendingSample[msg.reqId];
                    if (p) { delete window._flyPendingSample[msg.reqId]; p(msg.heights || []); }
                  } catch (e) {}
                } else if (msg.action === 'captureResult') {
                  try {
                    const wrap = document.getElementById('capture-result');
                    const img = document.getElementById('capture-img');
                    if (wrap && img && msg.dataUrl) { img.src = msg.dataUrl; wrap.style.display = ''; }
                  } catch (e) {}
                } else if (msg.action === 'manageText') {
                  try {
                    const ta = document.getElementById('manage-inspector-text');
                    if (ta) ta.value = (typeof msg.text === 'string') ? msg.text : '';
                  } catch (e) {}
                } else if (msg.action === 'manageTextApplied') {
                  try {
                    const st = document.getElementById('manage-status');
                    if (st) st.textContent = t('manageApplied');
                  } catch (e) {}
                } else if (msg.action === 'aiFlyPlay') {
                  // Triggered by the ai-chat widget's playFlyPath tool
                  try {
                    const sel = document.getElementById('fly-route-select');
                    if (sel) {
                      let target = null;
                      if (msg.drawn) {
                        for (let i = 0; i < sel.options.length; i++) {
                          if (sel.options[i].value === 'd:' + msg.drawn) { target = sel.options[i].value; break; }
                        }
                      } else if (msg.name) {
                        const want = String(msg.name).toLowerCase();
                        for (let i = 0; i < sel.options.length; i++) {
                          const o = sel.options[i];
                          if (o.value.indexOf('i:') === 0 && o.textContent === msg.name) { target = o.value; break; }
                        }
                        if (target === null) {
                          for (let i = 0; i < sel.options.length; i++) {
                            const o = sel.options[i];
                            if (o.value.indexOf('i:') === 0 && String(o.textContent).toLowerCase().indexOf(want) >= 0) { target = o.value; break; }
                          }
                        }
                      }
                      if (target !== null) {
                        sel.value = target;
                        sel.dispatchEvent(new Event('change'));
                        try {
                          const flyTab = document.querySelector('.tab-bar [data-target="fly-panel"]');
                          if (flyTab) flyTab.click();
                        } catch (e) {}
                        flyPlay();
                      }
                    }
                  } catch (e) {}
                } else if (msg.action === 'aiFlyStop') {
                  try { flyStopAll(false); } catch (e) {}
                } else if (msg.action === 'flyDblClick') {
                  try { flyDblClickToggle(1); } catch (e) {}
                } else if (msg.action === 'flyRDblClick') {
                  try { flyDblClickToggle(-1); } catch (e) {}
                } else if (msg.action === 'flyWheel') {
                  try { flyWheelAdjust(msg.delta); } catch (e) {}
                } else if (msg.action === 'aiLayerState') {
                  // Sync a layer checkbox after an ai-chat setLayerVisible call
                  try {
                    const cb = document.querySelector('input.layer-checkbox[data-layer-id="' + msg.id + '"], input.group-checkbox[data-layer-id="' + msg.id + '"]');
                    if (cb) cb.checked = !!msg.visible;
                  } catch (e) {}
                } else if (msg.action === 'flyRemoveDrawn') {
                  // Drop a deleted drawn route from the FLY tab select (ai-chat deleteFlyPath)
                  try { flyRemoveDrawnOption(msg.name); } catch (e) {}
                } else if (msg.action === 'flySetSettings') {
                  // ai-chat setFlySettings: select the target route (if named)
                  // and write the values into the FLY fields — they apply live,
                  // even mid-flight (same path as user edits).
                  try {
                    const sel = document.getElementById('fly-route-select');
                    const s = msg.settings || {};
                    let target = null;
                    if (msg.drawn) target = 'd:' + msg.drawn;
                    else if (msg.idx !== null && msg.idx !== undefined) target = 'i:' + msg.idx;
                    if (sel && target && sel.value !== target) {
                      let exists = false;
                      for (let i = 0; i < sel.options.length; i++) { if (sel.options[i].value === target) { exists = true; break; } }
                      if (exists) {
                        sel.value = target;
                        sel.dispatchEvent(new Event('change'));
                        // The async route-load writes route defaults only when
                        // inputsDirty is false — mark dirty so our settings are
                        // not overwritten when the load resolves.
                        fly.inputsDirty = true;
                      }
                    }
                    // Drop the cached GeoJSON so a re-select picks up the
                    // persisted properties.fly defaults.
                    if (msg.drawn) { try { delete flyDrawnCache[msg.drawn]; } catch (e) {} }
                    flyWriteInputs(s);
                    flyApplyInputs(true);
                  } catch (e) {}
                } else if (msg.action === 'svVerify') {
                  // Street View metadata check (kasugai port): prefer outdoor
                  // panoramas and embed the confirmed pano_id so the user does
                  // not land on a dark/indoor/removed panorama.
                  (function() {
                    const lat = Number(msg.lat), lng = Number(msg.lng);
                    const plain = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng;
                    const done = function(url, verified, status) {
                      try { parent.postMessage({ action: 'svResult', svId: msg.svId, url: url, verified: verified, status: status }, '*'); } catch (e) {}
                    };
                    const key = String(window._googleMapsApiKey || '').trim();
                    if (!key || !isFinite(lat) || !isFinite(lng)) { done(plain, false, 'NO_KEY'); return; }
                    const meta = function(source) {
                      return fetch('https://maps.googleapis.com/maps/api/streetview/metadata?location=' + lat + ',' + lng + '&key=' + encodeURIComponent(key) + (source ? '&source=' + source : ''), { mode: 'cors' })
                        .then(function(res) { return res.json().catch(function() { return null; }); });
                    };
                    meta('outdoor').then(function(data) {
                      if (data && data.status === 'OK') return data;
                      return meta('');
                    }).then(function(data) {
                      if (data && data.status === 'OK') {
                        const plat = Number(data.location && data.location.lat), plng = Number(data.location && data.location.lng);
                        const vp = (isFinite(plat) && isFinite(plng)) ? (plat + ',' + plng) : (lat + ',' + lng);
                        done('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + vp + (data.pano_id ? '&panoid=' + encodeURIComponent(data.pano_id) : ''), true, 'OK');
                      } else {
                        done(plain, false, (data && data.status) || 'NOT_FOUND');
                      }
                    }).catch(function() { done(plain, false, 'FETCH_FAILED'); });
                  })();
                } else if (msg.action === 'placesSearch') {
                  // searchPlaces AI tool: run the shared Google hybrid search
                  // and post the raw items back for the extension to relay.
                  (function() {
                    const key = String(window._googleMapsApiKey || '').trim();
                    const limit = Math.max(1, Math.min(20, Number(msg.limit) || 10));
                    const reply = function(payload) {
                      try { parent.postMessage({ action: 'placesResult', psId: msg.psId, result: payload }, '*'); } catch (e) {}
                    };
                    if (!key) { reply({ error: 'googleMapsApiKey not set (add "googleMapsApiKey: ..." to the plugin inspector)' }); return; }
                    if (typeof window.googlePlacesSearchRaw !== 'function') { reply({ error: 'search unavailable' }); return; }
                    window.googlePlacesSearchRaw(key, msg.query, function(items, err) {
                      if (err) { reply({ error: 'google search failed: ' + String(err && err.message || err) }); return; }
                      reply({ results: (items || []).slice(0, limit), provider: 'google' });
                    });
                  })();
                } else if (msg.action === 'qmlStyle') {
                  // QGIS .qml -> Re:Earth appearance compile (vendored
                  // qml-style.js + qml-to-reearth.js are injected as globals
                  // by scripts/build_qml_inline.js).
                  (function() {
                    var reply = function(appearance, error, warnings, legend) {
                      try { parent.postMessage({ action: 'qmlResult', vecId: msg.vecId, appearance: appearance, error: error, warnings: warnings, legend: legend }, '*'); } catch (e) {}
                    };
                    try {
                      if (typeof qmlStyleToReearth !== 'function') { reply(null, 'qml translator not loaded'); return; }
                      (msg.qmlText ? Promise.resolve(msg.qmlText) : fetch(msg.url).then(function(res) {
                        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                        return res.text();
                      })).then(function(xmlText) {
                        var done = function(props0) {
                          var res = qmlStyleToReearth(xmlText, {
                            qml: { compileQmlStyle: compileQmlStyle, resolveSymbolLayers: resolveSymbolLayers, markerLayersToCanvas: markerLayersToCanvas, rgbaToCss: rgbaToCss },
                            qmlUrl: msg.url, props0: props0
                          });
                          reply(res.error ? null : { marker: res.marker, polyline: res.polyline, polygon: res.polygon }, res.error || null, res.warnings || [], res.legend || []);
                        };
                        if (msg.props0) done(msg.props0);
                        else if (msg.geojsonUrl) {
                          fetch(msg.geojsonUrl).then(function(r){ return r.json(); }).then(function(g){
                            done((((g.features||[])[0])||{}).properties || {});
                          }).catch(function(){ done({}); });
                        } else done({});
                      }).catch(function(e){ reply(null, String(e && e.message || e)); });
                    } catch (e) { reply(null, String(e && e.message || e)); }
                  })();
                } else if (msg.action === 'fgbLoad') {
                  // FlatGeobuf decode (kasugai port): the official JS reader is
                  // lazy-imported from CDN, the response body is streamed into
                  // deserialize() and collected as a FeatureCollection which the
                  // extension adds as a normal GeoJSON layer.
                  (function() {
                    var reply = function(geojson, error) {
                      try { parent.postMessage({ action: 'fgbResult', vecId: msg.vecId, geojson: geojson, error: error }, '*'); } catch (e) {}
                    };
                    try {
                      if (!window._fgbModule) {
                        window._fgbModule = import('https://cdn.jsdelivr.net/npm/flatgeobuf@4.4.0/lib/mjs/geojson.js/+esm');
                      }
                      window._fgbModule.then(function(mod) {
                        return fetch(msg.url, { mode: 'cors' }).then(function(res) {
                          if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                          if (!res.body) throw new Error('empty response body');
                          var features = [];
                          var limit = Math.max(1, Number(msg.limit) || 200000);
                          var iter = mod.deserialize(res.body);
                          var readNext = function() {
                            return iter.next().then(function(r) {
                              if (r.done || features.length >= limit) return { type: 'FeatureCollection', features: features };
                              var f = r.value;
                              if (f && f.geometry) features.push(f);
                              return readNext();
                            });
                          };
                          return readNext();
                        });
                      }).then(function(fc) {
                        // Make the payload JSON-safe for the sandbox bridge
                        // (BigInt and friends cannot cross it).
                        try {
                          fc = JSON.parse(JSON.stringify(fc, function(k, v) {
                            return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                          }));
                        } catch (e) {}
                        reply(fc, null);
                      }).catch(function(e) { reply(null, String(e && e.message || e)); });
                    } catch (e) { reply(null, String(e)); }
                  })();
                } else if (msg.action === 'pqLoad') {
                  // GeoParquet decode (kasugai port): hyparquet + compressors
                  // are lazy-imported from CDN, rows are read as objects and
                  // the geometry column (geo metadata primary_column, or a
                  // WKB/GeoJSON-valued column) is turned into GeoJSON features.
                  (function() {
                    var reply = function(geojson, error) {
                      try { parent.postMessage({ action: 'pqResult', vecId: msg.vecId, geojson: geojson, error: error }, '*'); } catch (e) {}
                    };
                    var wkbToGeoJson = vecWkbToGeoJson;
                    try {
                      if (!window._pqModule) {
                        window._pqModule = Promise.all([
                          import('https://cdn.jsdelivr.net/npm/hyparquet@1.30.1/+esm'),
                          import('https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm')
                        ]).then(function(mods) {
                          var hp = mods[0], hc = mods[1];
                          return {
                            parquetReadObjects: hp.parquetReadObjects,
                            parquetMetadata: hp.parquetMetadataAsync || hp.parquetMetadata,
                            asyncBufferFromUrl: hp.asyncBufferFromUrl,
                            compressors: hc.compressors
                          };
                        });
                      }
                      window._pqModule.then(function(mod) {
                        var fileP;
                        try { fileP = mod.asyncBufferFromUrl({ url: msg.url }); } catch (e) { fileP = Promise.reject(e); }
                        return fileP.catch(function() {
                          return fetch(msg.url, { mode: 'cors' }).then(function(res) {
                            if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                            return res.arrayBuffer();
                          });
                        }).then(function(file) {
                          return mod.parquetReadObjects({ file: file, compressors: mod.compressors }).then(function(rows) {
                            return Promise.resolve(mod.parquetMetadata ? mod.parquetMetadata(file) : null).then(function(meta) {
                              return { rows: rows || [], meta: meta };
                            });
                          });
                        });
                      }).then(function(r0) {
                        var rows = r0.rows;
                        var features = [];
                        if (!rows.length) return reply({ type: 'FeatureCollection', features: [] }, null);
                        // Geometry column: geo metadata primary_column first,
                        // else 'geometry', else first WKB/GeoJSON-valued column.
                        var geomColumn = null;
                        try {
                          var kv = r0.meta && (r0.meta.key_value_metadata || r0.meta.metadata || []);
                          var entry = Array.isArray(kv) ? kv.find(function(it) { return it && it.key === 'geo'; }) : (kv instanceof Map ? { value: kv.get('geo') } : null);
                          var rawGeo = entry && entry.value;
                          var geoText = rawGeo instanceof Uint8Array ? new TextDecoder().decode(rawGeo) : rawGeo;
                          var geo = geoText ? JSON.parse(geoText) : null;
                          if (geo && geo.primary_column) geomColumn = geo.primary_column;
                        } catch (e) {}
                        var isGeom = function(v) {
                          return v instanceof Uint8Array || (v && typeof v === 'object' && typeof v.type === 'string' && ('coordinates' in v || 'geometries' in v));
                        };
                        var firstRow = rows[0];
                        if (!geomColumn || !(geomColumn in firstRow)) {
                          geomColumn = ('geometry' in firstRow) ? 'geometry' : Object.keys(firstRow).find(function(k) { return isGeom(firstRow[k]); });
                        }
                        if (!geomColumn) throw new Error('geometry column not found');
                        var limit = Math.max(1, Number(msg.limit) || 200000);
                        for (var i = 0; i < rows.length && features.length < limit; i++) {
                          var row = rows[i];
                          var value = row[geomColumn];
                          // Native GEOMETRY columns arrive pre-decoded; WKB columns we decode.
                          var geometry = value instanceof Uint8Array ? wkbToGeoJson(value) : (isGeom(value) ? value : null);
                          if (!geometry) continue;
                          var properties = {};
                          var keys = Object.keys(row);
                          for (var j = 0; j < keys.length; j++) { if (keys[j] !== geomColumn) properties[keys[j]] = row[keys[j]]; }
                          features.push({ type: 'Feature', geometry: geometry, properties: properties });
                        }
                        var fc = { type: 'FeatureCollection', features: features };
                        // JSON-safe for the sandbox bridge (parquet int64
                        // columns arrive as BigInt which cannot cross it).
                        try {
                          fc = JSON.parse(JSON.stringify(fc, function(k, v) {
                            return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                          }));
                        } catch (e) {}
                        reply(fc, null);
                      }).then(function() {}, function(e) { reply(null, String(e && e.message || e)); });
                    } catch (e) { reply(null, String(e)); }
                  })();
                } else if (msg.action === 'ddbLoad') {
                  // DuckDB-Wasm query path (kasugai duckdb: port). SQL pushdown
                  // (where/limit/columns) and covering-bbox predicates prune
                  // Parquet row groups over HTTP Range requests, so only the
                  // matching part of the file is transferred.
                  (function() {
                    var reply = function(geojson, error) {
                      try {
                        if (geojson) {
                          geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                            return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                          }));
                        }
                        parent.postMessage({ action: 'ddbResult', vecId: msg.vecId, layerId: msg.layerId || null, geojson: geojson, error: error }, '*');
                      } catch (e) {}
                    };
                    var qi = function(n) { return '"' + String(n).replace(/"/g, '""') + '"'; };
                    var ql = function(v) { return "'" + String(v).replace(/'/g, "''") + "'"; };
                    var boundsSql = function(b) {
                      if (!b || !b.ranges || !b.ranges.length) return null;
                      var env = function(r) { return 'ST_MakeEnvelope(' + Number(r.west) + ',' + Number(b.south) + ',' + Number(r.east) + ',' + Number(b.north) + ')'; };
                      return b.ranges.length === 1 ? env(b.ranges[0]) : 'ST_Union(' + env(b.ranges[0]) + ', ' + env(b.ranges[1]) + ')';
                    };
                    try {
                      if (!window._ddbModule) {
                        var loading = import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm').then(function(duckdb) {
                          return duckdb.selectBundle(duckdb.getJsDelivrBundles()).then(function(bundle) {
                            var workerUrl = URL.createObjectURL(new Blob(['importScripts(' + JSON.stringify(bundle.mainWorker) + ');'], { type: 'text/javascript' }));
                            var worker = new Worker(workerUrl);
                            var logger = duckdb.VoidLogger ? new duckdb.VoidLogger() : new duckdb.ConsoleLogger();
                            var db = new duckdb.AsyncDuckDB(logger, worker);
                            return db.instantiate(bundle.mainModule, bundle.pthreadWorker).then(function() {
                              try { URL.revokeObjectURL(workerUrl); } catch (e) {}
                              return db.connect();
                            }).then(function(conn) {
                              var st = { conn: conn, spatial: false };
                              return conn.query('INSTALL httpfs; LOAD httpfs;').catch(function() {})
                                .then(function() { return conn.query('INSTALL spatial; LOAD spatial;').then(function() { st.spatial = true; }).catch(function() {}); })
                                .then(function() { return conn.query('INSTALL parquet; LOAD parquet;').catch(function() {}); })
                                .then(function() { return st; });
                            });
                          });
                        });
                        loading.catch(function() { if (window._ddbModule === loading) window._ddbModule = null; });
                        window._ddbModule = loading;
                      }
                      window._ddbModule.then(function(st) {
                        var conn = st.conn, spatial = st.spatial;
                        var format = String(msg.format || '').toLowerCase();
                        var literal = ql(msg.url);
                        var isParquet = format === 'parquet' || (!format && /\\.parquet([?#]|$)/i.test(msg.url || ''));
                        // sql: raw query mode wraps the query as a subquery source.
                        // The :bbox placeholder is replaced by the viewport envelope.
                        var source;
                        if (msg.query) {
                          var q0 = String(msg.query).replace(/;+\\s*$/, '');
                          if (/:bbox\\b/i.test(q0)) {
                            if (!spatial) throw new Error('sql: :bbox requires the spatial extension');
                            q0 = q0.replace(/:bbox\\b/gi, boundsSql(msg.bounds) || 'ST_MakeEnvelope(-180,-90,180,90)');
                          }
                          source = '(' + q0 + ')';
                        } else {
                          source = format === 'parquet' ? 'read_parquet(' + literal + ')'
                            : (format === 'csv' || format === 'tsv') ? 'read_csv_auto(' + literal + ')'
                            : (format === 'json' || format === 'geojson') ? 'read_json_auto(' + literal + ')'
                            : literal; // replacement scan infers reader from the extension
                        }
                        var ctx = {};
                        return conn.query('DESCRIBE SELECT * FROM ' + source).then(function(table) {
                          ctx.columns = table.toArray().map(function(row) {
                            var p = (typeof row.toJSON === 'function') ? row.toJSON() : row;
                            return { name: String(p.column_name), type: String(p.column_type || '').toUpperCase() };
                          });
                          var geomCol = null;
                          if (msg.geom) {
                            geomCol = ctx.columns.filter(function(c) { return c.name === msg.geom; })[0] || null;
                            if (!geomCol) throw new Error('geom= column not found: ' + msg.geom);
                          } else {
                            geomCol = ctx.columns.filter(function(c) { return c.type.indexOf('GEOMETRY') >= 0 || c.type.indexOf('WKB') >= 0; })[0]
                              || ctx.columns.filter(function(c) { return /^(geometry|geom|wkb|the_geom)$/i.test(c.name); })[0]
                              || ctx.columns.filter(function(c) { return c.type === 'BLOB' || c.type === 'BINARY'; })[0]
                              || null;
                          }
                          ctx.geomCol = geomCol;
                          ctx.lonlat = null;
                          if (!geomCol) {
                            var findCol = function(explicit, re) {
                              if (explicit) {
                                if (!ctx.columns.some(function(c) { return c.name === explicit; })) throw new Error('column not found: ' + explicit);
                                return explicit;
                              }
                              var c = ctx.columns.filter(function(c) { return re.test(c.name); })[0];
                              return c ? c.name : null;
                            };
                            var lon = findCol(msg.lon, /^(lon|lng|longitude)$/i);
                            var lat = findCol(msg.lat, /^(lat|latitude)$/i);
                            if ((lon || lat) && !(lon && lat)) throw new Error('lon/lat columns could not be resolved (specify lon= and lat=)');
                            if (lon && lat) ctx.lonlat = { lon: lon, lat: lat };
                          }
                          if (!geomCol && !ctx.lonlat) throw new Error('geometry column not found (use geom= or lon=/lat=)');
                          // covering bbox columns: covering= > geo metadata > conventional names
                          ctx.covering = null;
                          if (msg.bounds && Array.isArray(msg.covering) && msg.covering.length === 4) {
                            ctx.covering = { refs: { xmin: qi(msg.covering[0]), xmax: qi(msg.covering[1]), ymin: qi(msg.covering[2]), ymax: qi(msg.covering[3]) }, exclude: msg.covering.slice() };
                            return null;
                          }
                          if (msg.bounds && isParquet) {
                            return conn.query("SELECT key, value FROM parquet_kv_metadata(" + literal + ") WHERE key = 'geo'").then(function(t2) {
                              try {
                                var row = t2.toArray()[0];
                                var raw = row && (typeof row.toJSON === 'function' ? row.toJSON() : row).value;
                                var text = (typeof raw === 'string') ? raw : new TextDecoder().decode(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
                                var geo = JSON.parse(text);
                                var cov = geo && geo.columns && geo.columns[geo.primary_column] && geo.columns[geo.primary_column].covering && geo.columns[geo.primary_column].covering.bbox;
                                if (cov && cov.xmin && cov.xmax && cov.ymin && cov.ymax) {
                                  var ref = function(p) { return Array.isArray(p) && p.length ? p.map(qi).join('.') : null; };
                                  var refs = { xmin: ref(cov.xmin), xmax: ref(cov.xmax), ymin: ref(cov.ymin), ymax: ref(cov.ymax) };
                                  if (refs.xmin && refs.xmax && refs.ymin && refs.ymax) {
                                    ctx.covering = { refs: refs, exclude: [cov.xmin[0], cov.xmax[0], cov.ymin[0], cov.ymax[0]] };
                                  }
                                }
                              } catch (e) {}
                            }).catch(function() {});
                          }
                          return null;
                        }).then(function() {
                          if (msg.bounds && !ctx.covering) {
                            var fc = function(n) { var c = ctx.columns.filter(function(c) { return c.name.toLowerCase() === n; })[0]; return c ? c.name : null; };
                            var n = { xmin: fc('xmin'), xmax: fc('xmax'), ymin: fc('ymin'), ymax: fc('ymax') };
                            if (n.xmin && n.xmax && n.ymin && n.ymax) {
                              ctx.covering = { refs: { xmin: qi(n.xmin), xmax: qi(n.xmax), ymin: qi(n.ymin), ymax: qi(n.ymax) }, exclude: [] };
                            }
                          }
                          var geomExpr = null;
                          if (ctx.geomCol) {
                            var gname = qi(ctx.geomCol.name);
                            var cast = ctx.geomCol.type.indexOf('GEOMETRY') >= 0 ? gname
                              : (ctx.geomCol.type === 'BLOB' || ctx.geomCol.type === 'BINARY' || ctx.geomCol.type.indexOf('WKB') >= 0) ? 'TRY(ST_GeomFromWKB(' + gname + '))'
                              : 'COALESCE(TRY(ST_GeomFromText(' + gname + ')), TRY(ST_GeomFromGeoJSON(' + gname + ')))';
                            ctx.geomCast = cast;
                            geomExpr = spatial ? ('ST_AsWKB(' + cast + ') AS "__geom__"') : (gname + ' AS "__geom__"');
                          }
                          var selCols = null;
                          if (Array.isArray(msg.columns) && msg.columns.length) {
                            var missingCols = msg.columns.filter(function(n) { return !ctx.columns.some(function(c) { return c.name === n; }); });
                            if (missingCols.length) throw new Error('columns= not found: ' + missingCols.join(','));
                            selCols = msg.columns.map(qi).join(', ');
                          }
                          var excludeList = [];
                          if (ctx.geomCol) excludeList.push(ctx.geomCol.name);
                          if (ctx.covering) excludeList = excludeList.concat(ctx.covering.exclude);
                          var select = ctx.geomCol
                            ? (selCols ? 'SELECT ' + selCols + ', ' + geomExpr : 'SELECT * EXCLUDE (' + excludeList.map(qi).join(', ') + '), ' + geomExpr)
                            : 'SELECT *';
                          var preds = [];
                          var envSql = msg.query ? null : boundsSql(msg.bounds);
                          if (!msg.query && msg.where) preds.push('(' + msg.where + ')');
                          if (envSql) {
                            if (ctx.covering) {
                              var b = msg.bounds;
                              var lonPred = b.ranges.map(function(r) {
                                return '(' + ctx.covering.refs.xmax + ' >= ' + Number(r.west) + ' AND ' + ctx.covering.refs.xmin + ' <= ' + Number(r.east) + ')';
                              }).join(' OR ');
                              preds.push('((' + lonPred + ') AND ' + ctx.covering.refs.ymax + ' >= ' + Number(b.south) + ' AND ' + ctx.covering.refs.ymin + ' <= ' + Number(b.north) + ')');
                            }
                            var operand = ctx.geomCol ? (spatial ? ctx.geomCast : null)
                              : (spatial && ctx.lonlat ? 'ST_Point(' + qi(ctx.lonlat.lon) + ', ' + qi(ctx.lonlat.lat) + ')' : null);
                            if (operand) preds.push('ST_Intersects(' + operand + ', ' + envSql + ')');
                          }
                          var sql = select + ' FROM ' + source;
                          if (preds.length) sql += ' WHERE ' + preds.join(' AND ');
                          var lim = msg.query ? 0 : Math.floor(Number(msg.limit) || 0);
                          if (lim > 0) sql += ' LIMIT ' + lim;
                          return conn.query(sql).then(function(table) {
                            var fields = table.schema.fields.map(function(f) { return f.name; });
                            var geomKey = fields.indexOf('__geom__') >= 0 ? '__geom__' : null;
                            var features = [];
                            var rows = table.toArray();
                            for (var i = 0; i < rows.length; i++) {
                              var row = rows[i];
                              var geometry = null;
                              if (geomKey) {
                                var v = row[geomKey];
                                if (v instanceof Uint8Array) geometry = vecWkbToGeoJson(v);
                                else if (v && typeof v === 'object' && typeof v.type === 'string' && ('coordinates' in v || 'geometries' in v)) geometry = v;
                                else if (typeof v === 'string' && v.trim().charAt(0) === '{') {
                                  try { var g = JSON.parse(v); geometry = g && typeof g.type === 'string' ? g : null; } catch (e) {}
                                }
                              }
                              if (!geometry && ctx.lonlat) {
                                var x = Number(row[ctx.lonlat.lon]), y = Number(row[ctx.lonlat.lat]);
                                if (isFinite(x) && isFinite(y)) geometry = { type: 'Point', coordinates: [x, y] };
                              }
                              if (!geometry) continue;
                              var props = {};
                              for (var j = 0; j < fields.length; j++) { if (fields[j] !== geomKey) props[fields[j]] = row[fields[j]]; }
                              features.push({ type: 'Feature', geometry: geometry, properties: props });
                            }
                            return { type: 'FeatureCollection', features: features };
                          });
                        });
                      }).then(function(fc) { reply(fc, null); }, function(e) { reply(null, String(e && e.message || e)); });
                    } catch (e) { reply(null, String(e)); }
                  })();
                } else if (msg.action === 'gpkgLoad') {
                  // GeoPackage decode via sql.js (kasugai gpkg: port). The DB is
                  // cached per url in window._gpkgDbs so bbox=auto re-queries do
                  // not re-download. Embedded QGIS layer_styles QML is returned
                  // alongside the FeatureCollection.
                  (function() {
                    var reply = function(geojson, error, qml) {
                      try {
                        if (geojson) {
                          geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                            return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                          }));
                        }
                        parent.postMessage({ action: 'gpkgResult', vecId: msg.vecId, layerId: msg.layerId || null, geojson: geojson, error: error, qml: qml || null }, '*');
                      } catch (e) {}
                    };
                    try {
                      gpkgQueryToGeoJson({
                        url: msg.url, dataB64: msg.dataB64 || null,
                        table: msg.table || null, where: msg.where || null,
                        limit: msg.limit || null, columns: msg.columns || null,
                        bbox: msg.bounds || null
                      }).then(function(res) {
                        reply(res.geojson, null, res.qml);
                      }, function(e) { reply(null, String(e && e.message || e)); });
                    } catch (e) { reply(null, String(e)); }
                  })();
                } else if (msg.action === 'importDone') {
                  try {
                    var ist = document.getElementById('import-status');
                    if (ist) {
                      if (msg.error) { ist.textContent = 'Import failed: ' + msg.error; ist.style.color = '#c0392b'; }
                      else { ist.textContent = (msg.title || '') + (msg.count >= 0 ? ': ' + msg.count + ' features' : ' applied'); ist.style.color = '#666'; }
                    }
                  } catch (e) {}
                }
              } catch (e) {}
            });

          // ---------- Fly mode (ported from kasugai_canvas) ----------
          // The camera tick loop runs here in the UI iframe because the extension
          // sandbox (QuickJS) has no requestAnimationFrame/setInterval. Each frame
          // posts flySetView which the extension turns into reearth.camera.setView.
          window._flyRoutes = ${JSON.stringify(_flyRoutes).replace(/</g, '\\u003c')};
          window._flyCaps = {};
          window._flyPendingDrawn = {};
          window._flyPendingSample = {};
          var flyDrawnCache = {};
          var fly = {
            pts: null, dists: null, dist: 0, raw: null,
            props: { speed: 30, height: 0, pitch: -10, loop: false, view: 'camera', absolute: false },
            active: false, paused: false, raf: null, lastTs: 0,
            inputsDirty: false, loadedSel: null, absolute: false, dir: 1
          };
          window._fly = fly; // debug/test handle (same convention as window._flyRoutes)
          // Speed/AGL/pitch combinations ported from kasugai_canvas Fly presets.
          var FLY_PRESETS = {
            walk: { speed: 5, height: 2, pitch: -5 },
            drive: { speed: 60, height: 2, pitch: -10 },
            drone: { speed: 60, height: 200, pitch: -30 },
            overview: { speed: 300, height: 1000, pitch: -45 }
          };

          function flyPost(m) { try { if (window.parent) window.parent.postMessage(m, '*'); } catch (e) {} }
          function flySetStatus(s) { var el = document.getElementById('fly-status'); if (el) el.textContent = s; }
          function flyNum(id, def) { var el = document.getElementById(id); var v = el ? parseFloat(el.value) : NaN; return isFinite(v) ? v : def; }
          function flySetVal(id, v) { var el = document.getElementById(id); if (el && isFinite(v)) el.value = v; }

          // Input fields <-> fly.props. The fields are the single source of truth:
          // route defaults are written into them on selection, user edits apply live.
          function flyReadInputs() {
            var loopEl = document.getElementById('fly-loop');
            var viewEl = document.getElementById('fly-view');
            return {
              speed: flyNum('fly-speed', 30),
              height: flyNum('fly-height', 0),
              pitch: flyNum('fly-pitch', -10),
              loop: !!(loopEl && loopEl.checked),
              view: (viewEl && viewEl.value === 'center') ? 'center' : 'camera'
            };
          }
          function flyWriteInputs(p) {
            if (!p) return;
            if (isFinite(p.speed)) flySetVal('fly-speed', p.speed);
            if (isFinite(p.height)) flySetVal('fly-height', p.height);
            if (isFinite(p.pitch)) flySetVal('fly-pitch', p.pitch);
            var loopEl = document.getElementById('fly-loop');
            var viewEl = document.getElementById('fly-view');
            if (loopEl && p.loop !== undefined) loopEl.checked = !!p.loop;
            if (viewEl && (p.view === 'center' || p.view === 'camera')) viewEl.value = p.view;
            flySyncPreset();
          }
          // Reflect the current speed/height/pitch in the preset select: a known
          // combination selects its preset, anything else becomes "custom".
          function flySyncPreset() {
            var el = document.getElementById('fly-preset'); if (!el) return;
            var p = flyReadInputs(); var match = 'custom';
            for (var k in FLY_PRESETS) {
              var q = FLY_PRESETS[k];
              if (p.speed === q.speed && p.height === q.height && p.pitch === q.pitch) { match = k; break; }
            }
            el.value = match;
          }
          // User edited a field: mark dirty and apply to the running flight.
          // Number fields are debounced so typing "100" doesn't jump 1→10→100.
          var _flyApplyTimer = null;
          function flyApplyInputs(immediate) {
            fly.inputsDirty = true;
            var apply = function() {
              var abs = fly.props && fly.props.absolute;
              fly.props = flyReadInputs();
              fly.props.absolute = !!abs;
              if (fly.pts && fly.dists) flyUpdateCam(fly.dist || 0);
            };
            if (immediate) { if (_flyApplyTimer) { clearTimeout(_flyApplyTimer); _flyApplyTimer = null; } apply(); return; }
            if (_flyApplyTimer) clearTimeout(_flyApplyTimer);
            _flyApplyTimer = setTimeout(apply, 250);
          }

          function flyAddDrawnOption(name) {
            var sel = document.getElementById('fly-route-select'); if (!sel || !name) return;
            for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === 'd:' + name) return; }
            var o = document.createElement('option'); o.value = 'd:' + name; o.textContent = name; sel.appendChild(o);
          }
          function flyRemoveDrawnOption(name) {
            var sel = document.getElementById('fly-route-select'); if (!sel) return;
            for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === 'd:' + name) { sel.remove(i); return; } }
          }

          // Collect all LineString coordinates from a GeoJSON object (port of kasugai extractLineStringCoordinates)
          function flyExtractCoords(g) {
            if (!g || typeof g !== 'object') return [];
            var coords = [];
            var collect = function(obj) {
              if (!obj || typeof obj !== 'object') return;
              if (obj.type === 'LineString') {
                if (Array.isArray(obj.coordinates)) coords.push.apply(coords, obj.coordinates);
              } else if (obj.type === 'MultiLineString') {
                (obj.coordinates || []).forEach(function(line) { if (Array.isArray(line)) coords.push.apply(coords, line); });
              } else if (obj.type === 'Feature') {
                collect(obj.geometry);
              } else if (obj.type === 'FeatureCollection' || Array.isArray(obj.features)) {
                (obj.features || []).forEach(collect);
              } else if (obj.type === 'GeometryCollection' || Array.isArray(obj.geometries)) {
                (obj.geometries || []).forEach(collect);
              }
            };
            collect(g);
            return coords.filter(function(c) { return Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1]); });
          }

          function flyBuildPath(rawCoords) {
            if (!rawCoords.length) return { points: [], distances: [] };
            var points = rawCoords.map(function(c) { return { longitude: c[0], latitude: c[1], altitude: isFinite(c[2]) ? c[2] : 0, terrain: 0 }; });
            var distances = [0];
            for (var i = 0; i < points.length - 1; i++) {
              var a = points[i], b = points[i + 1];
              var dx = (b.longitude - a.longitude) * 111320 * Math.cos((a.latitude + b.latitude) * Math.PI / 360);
              var dy = (b.latitude - a.latitude) * 111320;
              var dz = (b.altitude - a.altitude);
              distances.push(distances[distances.length - 1] + (Math.sqrt(dx * dx + dy * dy + dz * dz) || 0));
            }
            return { points: points, distances: distances };
          }

          function flyBearing(a, b) {
            var lat1 = a.latitude * Math.PI / 180, lat2 = b.latitude * Math.PI / 180;
            var dLng = (b.longitude - a.longitude) * Math.PI / 180;
            return Math.atan2(Math.sin(dLng) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng));
          }
          function flyLerpBearing(a, b, tt) {
            var diff = b - a;
            while (diff <= -Math.PI) diff += 2 * Math.PI;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            return a + diff * tt;
          }
          function flyRouteDistance(coords) {
            var d = 0;
            for (var i = 0; i < coords.length - 1; i++) {
              var dx = (coords[i + 1][0] - coords[i][0]) * 111320 * Math.cos((coords[i][1] + coords[i + 1][1]) * Math.PI / 360);
              var dy = (coords[i + 1][1] - coords[i][1]) * 111320;
              d += Math.sqrt(dx * dx + dy * dy);
            }
            return d;
          }
          function flyAutoProfile(m) {
            if (!isFinite(m) || m < 0) return { agl: 300, speed: 200 };
            if (m < 2000) return { agl: 50, speed: 80 };
            if (m < 20000) return { agl: 300, speed: 200 };
            if (m < 100000) return { agl: 800, speed: 400 };
            if (m < 500000) return { agl: 3000, speed: 1000 };
            return { agl: 10000, speed: 2000 };
          }
          // properties.fly → cfg (port of applyFlySettingsFromGeoJson)
          function flyApplyProps(g, cfg, rawCoords) {
            try {
              var f = g && g.properties && g.properties.fly;
              if (f && typeof f === 'object') {
                if (isFinite(+f.speed) && +f.speed !== 0) cfg.speed = +f.speed;
                if (isFinite(+f.height)) cfg.height = +f.height;
                if (isFinite(+f.pitch)) cfg.pitch = +f.pitch;
                if (f.loop !== undefined) cfg.loop = !!f.loop;
                if (f.view !== undefined) cfg.view = /^(center|chase|follow|3rd|third|aerial)$/i.test(String(f.view)) ? 'center' : 'camera';
                return;
              }
              var gen = g && g.properties && (g.properties.source === 'flyRoute' || /^(msl|absolute)$/i.test(String(g.properties.heightReference || '')));
              if (gen && !isFinite(cfg.speed)) { cfg.speed = flyAutoProfile(flyRouteDistance(rawCoords || [])).speed; }
            } catch (e) {}
          }

          function flyResolveSpec() {
            var sel = document.getElementById('fly-route-select'); if (!sel) return null;
            var v = sel.value || '';
            if (v.indexOf('i:') === 0) { var i = parseInt(v.slice(2), 10); return window._flyRoutes[i] || null; }
            if (v.indexOf('d:') === 0) return { title: v.slice(2), url: 'route:' + encodeURIComponent(v.slice(2)), drawn: true };
            return null;
          }

          // Load a route's GeoJSON (http fetch, or route:<name> from clientStorage via the extension)
          function flyLoadRoute(spec) {
            return new Promise(function(resolve, reject) {
              var url = spec.url || '';
              var finish = function(text) {
                try {
                  var g = typeof text === 'string' ? JSON.parse(text) : text;
                  var raw = flyExtractCoords(g);
                  if (!raw.length) throw new Error('no LineString');
                  var cfg = { speed: spec.speed, height: spec.height, pitch: spec.pitch, loop: spec.loop, view: spec.view, absolute: /^(msl|absolute)$/i.test(String(g.properties && g.properties.heightReference || '')) };
                  flyApplyProps(g, cfg, raw);
                  resolve({ raw: raw, props: cfg, geojson: g });
                } catch (e) { reject(e); }
              };
              if (/^route:/i.test(url)) {
                var name = decodeURIComponent(url.slice(6));
                if (flyDrawnCache[name]) { finish(flyDrawnCache[name]); return; }
                window._flyPendingDrawn[name] = function(g) { if (g) finish(g); else reject(new Error('route not found')); };
                flyPost({ action: 'flyGetDrawn', name: name });
                setTimeout(function() { if (window._flyPendingDrawn[name]) { delete window._flyPendingDrawn[name]; reject(new Error('timeout')); } }, 8000);
                return;
              }
              fetch(url, { method: 'GET' }).then(function(r) { if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status)); return r.text(); }).then(finish).catch(reject);
            });
          }

          // Sample terrain height for each point via the extension (reearth.viewer.tools.getTerrainHeightAsync)
          var _flySampleSeq = 0;
          function flySampleTerrain(pts) {
            return new Promise(function(resolve) {
              var zeros = pts.map(function() { return 0; });
              if (!(window._flyCaps && window._flyCaps.terrain)) { resolve(zeros); return; }
              var stride = Math.max(1, Math.ceil(pts.length / 300));
              var idx = [], spts = [];
              for (var i = 0; i < pts.length; i += stride) { idx.push(i); spts.push({ lng: pts[i].longitude, lat: pts[i].latitude }); }
              var reqId = 's' + (++_flySampleSeq);
              window._flyPendingSample[reqId] = function(heights) {
                var out = zeros.slice();
                for (var i = 0; i < idx.length; i++) { if (heights && isFinite(heights[i])) out[idx[i]] = heights[i]; }
                var last = 0;
                for (var j = 0; j < out.length; j++) { if (out[j]) last = out[j]; else out[j] = last; }
                resolve(out);
              };
              flyPost({ action: 'flySample', reqId: reqId, pts: spts });
              setTimeout(function() { if (window._flyPendingSample[reqId]) { delete window._flyPendingSample[reqId]; resolve(zeros); } }, 20000);
            });
          }

          // Compute camera for route distance d and post flySetView (port of kasugai updateFlyPathCamera)
          function flyUpdateCam(d) {
            var path = fly.pts, dists = fly.dists;
            if (!path || !dists || path.length < 2) return;
            var total = dists[dists.length - 1] || 0;
            var dist = Math.max(0, Math.min(d, total));
            var idx = 0;
            while (idx + 1 < dists.length && dist >= dists[idx + 1]) idx++;
            var nextIdx = Math.min(idx + 1, path.length - 1);
            var segLen = (dists[nextIdx] - dists[idx]) || 1;
            var tSeg = (dist - dists[idx]) / segLen;
            var a = path[idx], b = path[nextIdx];
            var lat = a.latitude + (b.latitude - a.latitude) * tSeg;
            var lng = a.longitude + (b.longitude - a.longitude) * tSeg;
            var alt = a.altitude + (b.altitude - a.altitude) * tSeg;
            var terr = (a.terrain || 0) + (((b.terrain || 0) - (a.terrain || 0)) * tSeg);
            // In follow (center) view the camera is pulled back behind the point;
            // give it a minimum AGL so it never ends up inside the terrain.
            var effHeight = fly.props.height;
            if (fly.props.view === 'center' && effHeight < 30) effHeight = 30;
            var height = alt + (fly.props.absolute ? 0 : terr) + effHeight;
            var heading = flyBearing(a, b);
            // Heading stays along the forward route direction even when
            // playing backward (same as kasugai updateFlyPathCamera) — backward
            // playback is a visual rewind of the forward flight.
            if (nextIdx + 1 < path.length) {
              var nb = flyBearing(path[nextIdx], path[nextIdx + 1]);
              var remaining = (1 - tSeg) * segLen;
              var blendStart = Math.min(segLen, 100);
              var blend = remaining < blendStart ? 1 - (remaining / blendStart) : 0;
              heading = flyLerpBearing(heading, nb, blend);
            }
            var pitchDeg = Math.max(-85, Math.min(fly.props.view === 'center' ? -1 : 0, fly.props.pitch));
            var pitch = pitchDeg * Math.PI / 180;
            var camLat = lat, camLng = lng;
            if (fly.props.view === 'center') {
              var backDistance = effHeight / Math.tan(-pitch);
              if (!isFinite(backDistance) || backDistance < 0) backDistance = 60;
              camLat -= (Math.cos(heading) * backDistance) / 111320;
              camLng -= (Math.sin(heading) * backDistance) / (111320 * Math.cos(lat * Math.PI / 180));
            }
            flyPost({ action: 'flySetView', lat: camLat, lng: camLng, height: height, heading: heading, pitch: pitch, roll: 0 });
            if (total > 0) flySetStatus((fly.dir < 0 ? '◀ ' : '') + Math.round(dist / total * 100) + '% / ' + Math.round(total) + 'm');
          }

          function flyTick(ts) {
            fly.raf = null;
            if (!fly.active || fly.paused || !fly.pts) return;
            try {
              var dt = Math.max(0, Math.min((ts - fly.lastTs) / 1000, 0.1));
              fly.lastTs = ts;
              var total = fly.dists[fly.dists.length - 1] || 0;
              fly.dist += (fly.dir || 1) * (fly.props.speed / 3.6) * dt;
              if (fly.dist > total) {
                if (fly.props.loop) { fly.dist = total > 0 ? fly.dist % total : 0; }
                else { fly.dist = total; flyUpdateCam(fly.dist); flyStopAll(true); return; }
              }
              if (fly.dist < 0) {
                if (fly.props.loop && total > 0) { fly.dist = (total + fly.dist % total) % total; }
                else { fly.dist = 0; flyUpdateCam(0); flyStopAll(true); return; }
              }
              flyUpdateCam(fly.dist);
              if (fly.active && !fly.paused) fly.raf = requestAnimationFrame(flyTick);
            } catch (e) { flyStopAll(true); }
          }

          function flyUpdateButtons() {
            var play = document.getElementById('fly-play-btn');
            var back = document.getElementById('fly-back-btn');
            var pause = document.getElementById('fly-pause-btn');
            var stop = document.getElementById('fly-stop-btn');
            var rev = document.getElementById('fly-reverse-btn');
            // Direction-aware states (sync with the map double-click toggles):
            // the button driving the current direction is highlighted; Play
            // stays enabled during backward playback so it can flip forward.
            var fwdOn = fly.active && !fly.paused && fly.dir > 0;
            var backOn = fly.active && !fly.paused && fly.dir < 0;
            if (play) {
              play.disabled = fwdOn;
              play.classList.toggle('fly-dir-on', fwdOn);
              play.setAttribute('aria-pressed', fwdOn ? 'true' : 'false');
            }
            if (back) {
              back.classList.toggle('fly-dir-on', backOn);
              back.setAttribute('aria-pressed', backOn ? 'true' : 'false');
            }
            if (pause) { pause.disabled = !fly.active || fly.paused; }
            if (stop) stop.disabled = !fly.active && !fly.pts;
            if (rev) rev.disabled = !(fly.raw && fly.raw.length >= 2);
            try { flySyncZoomLock(); } catch (e) {}
          }

          function flyStopAll(finished) {
            fly.active = false; fly.paused = false;
            if (fly.raf) { try { cancelAnimationFrame(fly.raf); } catch (e) {} fly.raf = null; }
            flyPost({ action: 'flyStop' });
            if (finished) flySetStatus(t('flyDone'));
            flyUpdateButtons();
          }

          function flyShowRouteLine(raw) {
            try {
              var chk = document.getElementById('fly-line-check');
              if (chk && chk.checked) flyPost({ action: 'flyShowRoute', coords: raw });
              else flyPost({ action: 'flyHideRoute' });
            } catch (e) {}
          }

          // Start playback on the given coords: build path, sample terrain, run.
          function flyStart(raw) {
            fly.props = flyReadInputs();
            fly.props.absolute = !!fly.absolute;
            var built = flyBuildPath(raw);
            fly.pts = built.points; fly.dists = built.distances;
            fly.dist = fly.dir < 0 ? (built.distances[built.distances.length - 1] || 0) : 0;
            flyShowRouteLine(raw);
            var copyBtn = document.getElementById('fly-copygeo-btn'); if (copyBtn) copyBtn.disabled = false;
            flySetStatus(t('flySampling'));
            return flySampleTerrain(fly.pts).then(function(heights) {
              for (var i = 0; i < fly.pts.length; i++) fly.pts[i].terrain = heights[i] || 0;
              fly.active = true; fly.paused = false;
              fly.lastTs = performance.now();
              flyUpdateCam(fly.dist);
              fly.raf = requestAnimationFrame(flyTick);
              flyUpdateButtons();
            });
          }

          function flyPlay() {
            if (fly.active && fly.paused && fly.pts) {
              fly.paused = false; fly.lastTs = performance.now();
              fly.raf = requestAnimationFrame(flyTick); flyUpdateButtons(); return;
            }
            if (fly.active) return;
            var spec = flyResolveSpec();
            if (!spec) { flySetStatus(t('flyNoRoute')); return; }
            var sel = document.getElementById('fly-route-select');
            var selVal = sel ? sel.value : '';
            var onErr = function(e) {
              try { console.error('[fly] load failed', e); } catch (_) {}
              flySetStatus(t('flyErr'));
              flyUpdateButtons();
            };
            // Reuse the already-loaded coords for this selection so a Reverse
            // done before Play is not discarded by a reload.
            if (fly.raw && fly.loadedSel === selVal && fly.raw.length >= 2) {
              flyStart(fly.raw).catch(onErr);
              return;
            }
            flySetStatus(t('flyLoading'));
            flyLoadRoute(spec).then(function(res) {
              // Route defaults (inspector spec + geojson properties.fly) are
              // defaults only — applied unless the user edited the fields.
              var p = res.props || {};
              if (!fly.inputsDirty) flyWriteInputs(p);
              fly.geojson = res.geojson;
              fly.raw = res.raw;
              fly.loadedSel = selVal;
              fly.absolute = !!p.absolute;
              return flyStart(res.raw);
            }).catch(onErr);
          }

          function flyPause() {
            if (!fly.active || fly.paused) return;
            fly.paused = true;
            if (fly.raf) { try { cancelAnimationFrame(fly.raf); } catch (e) {} fly.raf = null; }
            flySetStatus(t('flyPause'));
            flyUpdateButtons();
          }

          // Reverse start/end of the loaded route (port of kasugai fly-reverse).
          // Progress is mirrored so the camera stays at the same spot and heads
          // back the other way; works mid-flight, paused, or before playback.
          function flyReverse() {
            if (!fly.raw || fly.raw.length < 2) return;
            fly.raw.reverse();
            var built = flyBuildPath(fly.raw);
            if (fly.pts && fly.pts.length === fly.raw.length) {
              var terr = fly.pts.map(function(p) { return p.terrain || 0; }).reverse();
              for (var i = 0; i < built.points.length; i++) built.points[i].terrain = terr[i];
            }
            var hadPath = !!(fly.pts && fly.pts.length >= 2);
            var total = built.distances[built.distances.length - 1] || 0;
            var done = Math.min(fly.dist || 0, total);
            fly.pts = built.points; fly.dists = built.distances;
            fly.dist = hadPath ? Math.max(0, total - done) : 0;
            flyShowRouteLine(fly.raw);
            if (hadPath) flyUpdateCam(fly.dist);
          }

          // Wheel-zoom lock (port of kasugai's setMode: while walk mode owns a
          // route it removes WHEEL from zoomEventTypes so wheel = speed).
          // reearth.camera.overrideScreenSpaceCameraController reaches the real
          // Cesium screenSpaceCameraController; the extension applies it.
          // Locked whenever the FLY panel is open with a route loaded —
          // right-drag zoom still works, as in kasugai.
          fly.zoomLocked = null;
          function flySyncZoomLock() {
            var want = !!(window._flyPanelOpen && fly.raw && fly.raw.length >= 2);
            if (want === fly.zoomLocked) return;
            fly.zoomLocked = want;
            flyPost({ action: 'flyZoomLock', lock: want });
          }

          // Map double-click playback toggle (port of kasugai
          // toggleFlyPathDirection). Only active while the FLY panel is open
          // so normal map double-clicks (zoom/pick) are unaffected.
          // dir=1 forward (left dbl-click), dir=-1 backward (double right-click).
          function flyDblClickToggle(dir) {
            if (!window._flyPanelOpen) return;
            dir = dir < 0 ? -1 : 1;
            if (fly.active && !fly.paused) {
              if (fly.dir === dir) { flyPause(); return; }
              fly.dir = dir;
              flyUpdateButtons();
              return;
            }
            if (fly.active && fly.paused) {
              fly.dir = dir;
              fly.paused = false; fly.lastTs = performance.now();
              fly.raf = requestAnimationFrame(flyTick); flyUpdateButtons();
              return;
            }
            fly.dir = dir;
            if (fly.pts && fly.dists && fly.pts.length >= 2) {
              var total = fly.dists[fly.dists.length - 1] || 0;
              fly.dist = dir < 0 ? total : 0;
              fly.active = true; fly.paused = false;
              fly.lastTs = performance.now();
              flyUpdateCam(fly.dist);
              fly.raf = requestAnimationFrame(flyTick);
              flyUpdateButtons();
              return;
            }
            flyPlay();
          }

          // Mouse wheel speed adjust (port of kasugai's walk-mode wheel
          // handler: ±1 km/h per notch, wheel down = faster). Like kasugai,
          // wheel zoom itself is removed while a route is loaded (see
          // flySyncZoomLock), so no zoom-cancel trick is needed here.
          function flyWheelAdjust(delta) {
            if (!window._flyPanelOpen) return;
            if (!(fly.raw && fly.raw.length >= 2)) return;
            var el = document.getElementById('fly-speed');
            if (!el) return;
            var cur = parseFloat(el.value) || 0;
            // reearth wheel delta is up-positive (inverse of DOM deltaY), so
            // negate to keep kasugai's convention: wheel down = faster.
            var next = Math.max(1, cur + (delta > 0 ? -1 : 1));
            el.value = String(Math.round(next * 10) / 10);
            flyApplyInputs(false);
            flySyncPreset();
          }

          function flyOnSketchCreated(geojson) {
            try {
              var g = typeof geojson === 'string' ? geojson : JSON.stringify(geojson);
              var name = 'drawn_route_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
              flyDrawnCache[name] = g;
              flyAddDrawnOption(name);
              flyPost({ action: 'flySaveRoute', name: name, geojson: g });
              var sel = document.getElementById('fly-route-select');
              if (sel) { sel.value = 'd:' + name; sel.dispatchEvent(new Event('change')); }
              var del = document.getElementById('fly-delete-btn'); if (del) del.disabled = false;
              flySetStatus(name);
            } catch (e) {}
          }

          // Wire controls
          try {
            var flySel = document.getElementById('fly-route-select');
            if (flySel) flySel.addEventListener('change', function() {
              flyStopAll(false);
              fly.inputsDirty = false;
              var spec = flyResolveSpec();
              if (spec && !spec.drawn) flyWriteInputs(spec);
              var del = document.getElementById('fly-delete-btn'); if (del) del.disabled = !(spec && spec.drawn);
              fly.pts = null; fly.dists = null; fly.raw = null; fly.loadedSel = null; fly.absolute = false; fly.dir = 1;
              // Preview the route line immediately
              if (spec) {
                flyLoadRoute(spec).then(function(res) {
                  fly.geojson = res.geojson;
                  fly.raw = res.raw;
                  fly.loadedSel = flySel.value;
                  fly.absolute = !!(res.props && res.props.absolute);
                  if (!fly.inputsDirty) flyWriteInputs(res.props);
                  flyShowRouteLine(res.raw);
                  var copyBtn = document.getElementById('fly-copygeo-btn'); if (copyBtn) copyBtn.disabled = false;
                  flyUpdateButtons();
                }).catch(function() { flySetStatus(t('flyErr')); });
              } else {
                flyPost({ action: 'flyHideRoute' });
                flyUpdateButtons();
              }
            });
            var flyPlayBtn = document.getElementById('fly-play-btn');
            if (flyPlayBtn) flyPlayBtn.addEventListener('click', function() { fly.dir = 1; flyPlay(); flyUpdateButtons(); });
            // ◀ Back: same backward-play toggle as the map right-double-click.
            var flyBackBtn = document.getElementById('fly-back-btn');
            if (flyBackBtn) flyBackBtn.addEventListener('click', function() { flyDblClickToggle(-1); });
            var flyPauseBtn = document.getElementById('fly-pause-btn');
            if (flyPauseBtn) flyPauseBtn.addEventListener('click', flyPause);
            var flyStopBtn = document.getElementById('fly-stop-btn');
            if (flyStopBtn) flyStopBtn.addEventListener('click', function() { fly.dist = 0; flyStopAll(false); flySetStatus('\u00A0'); });
            var flyDrawBtn = document.getElementById('fly-draw-btn');
            if (flyDrawBtn) flyDrawBtn.addEventListener('click', function() {
              flyPost({ action: 'flyDrawStart' });
              flySetStatus(t('flyDrawing'));
            });
            var flyDeleteBtn = document.getElementById('fly-delete-btn');
            if (flyDeleteBtn) flyDeleteBtn.addEventListener('click', function() {
              var sel = document.getElementById('fly-route-select'); if (!sel) return;
              var v = sel.value || '';
              if (v.indexOf('d:') !== 0) return;
              var name = v.slice(2);
              flyPost({ action: 'flyDeleteRoute', name: name });
              delete flyDrawnCache[name];
              flyRemoveDrawnOption(name);
              flyStopAll(false);
              flyPost({ action: 'flyHideRoute' });
              fly.pts = null; fly.dists = null; fly.raw = null; fly.loadedSel = null; fly.absolute = false; flySetStatus(name);
              flyUpdateButtons();
            });
            var flyCopyBtn = document.getElementById('fly-copygeo-btn');
            if (flyCopyBtn) flyCopyBtn.addEventListener('click', function() {
              var text = fly.geojson ? (typeof fly.geojson === 'string' ? fly.geojson : JSON.stringify(fly.geojson, null, 2)) : '';
              if (!text) return;
              var sel = document.getElementById('fly-route-select');
              var nm = (sel && sel.selectedIndex >= 0 && sel.options[sel.selectedIndex].textContent) || 'fly-route';
              nm = String(nm).replace(/[\\/:*?"<>|]/g, '_').trim() || 'fly-route';
              try {
                var blob = new Blob([text], { type: 'application/geo+json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = nm + '.geojson';
                document.body.appendChild(a); a.click();
                setTimeout(function() { try { a.remove(); URL.revokeObjectURL(url); } catch (e) {} }, 1000);
                flySetStatus(t('flySaved'));
              } catch (e) { flySetStatus(String(e && e.message || e)); }
            });
            var flyLineChk = document.getElementById('fly-line-check');
            if (flyLineChk) flyLineChk.addEventListener('change', function() {
              if (fly.raw) { flyShowRouteLine(fly.raw); }
              else if (fly.geojson) { flyShowRouteLine(flyExtractCoords(fly.geojson)); }
              else flyPost({ action: 'flyHideRoute' });
            });
            // Parameter fields apply live — also mid-flight (speed on next tick,
            // height/pitch/view refresh the camera immediately).
            ['fly-speed','fly-height','fly-pitch'].forEach(function(id) {
              var el = document.getElementById(id);
              if (el) el.addEventListener('input', function() { flyApplyInputs(false); flySyncPreset(); });
            });
            // Preset select: write the combination into the fields and apply
            // immediately (even mid-flight), like the manual fields do.
            var flyPresetSel = document.getElementById('fly-preset');
            if (flyPresetSel) flyPresetSel.addEventListener('change', function() {
              var p = FLY_PRESETS[flyPresetSel.value];
              if (!p) return; // "custom" keeps current values
              flySetVal('fly-speed', p.speed);
              flySetVal('fly-height', p.height);
              flySetVal('fly-pitch', p.pitch);
              flyApplyInputs(true);
            });
            var flyReverseBtn = document.getElementById('fly-reverse-btn');
            if (flyReverseBtn) flyReverseBtn.addEventListener('click', flyReverse);
            // Import a .geojson file as a drawn route (persisted like sketched routes)
            var flyImportBtn = document.getElementById('fly-import-btn');
            var flyImportFile = document.getElementById('fly-import-file');
            if (flyImportBtn && flyImportFile) {
              flyImportBtn.addEventListener('click', function() { flyImportFile.click(); });
              flyImportFile.addEventListener('change', function() {
                var f = flyImportFile.files && flyImportFile.files[0];
                flyImportFile.value = '';
                if (!f) return;
                var reader = new FileReader();
                reader.onload = function() {
                  try {
                    var text = String(reader.result || '');
                    var g = JSON.parse(text);
                    if (!flyExtractCoords(g).length) { flySetStatus(t('flyErr')); return; }
                    var base = String(f.name || 'route').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'route';
                    var sel = document.getElementById('fly-route-select');
                    var name = base, seq = 2;
                    var dup = function(n) {
                      if (!sel) return false;
                      for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === 'd:' + n) return true; }
                      return false;
                    };
                    while (dup(name)) name = base + '_' + (seq++);
                    flyDrawnCache[name] = text;
                    flyAddDrawnOption(name);
                    flyPost({ action: 'flySaveRoute', name: name, geojson: text });
                    if (sel) { sel.value = 'd:' + name; sel.dispatchEvent(new Event('change')); }
                    var del = document.getElementById('fly-delete-btn'); if (del) del.disabled = false;
                    flySetStatus(name);
                  } catch (e) { flySetStatus(t('flyErr')); }
                };
                reader.readAsText(f);
              });
            }
            var flyViewSel = document.getElementById('fly-view');
            if (flyViewSel) flyViewSel.addEventListener('change', function() { flyApplyInputs(true); });
            var flyLoopChk = document.getElementById('fly-loop');
            if (flyLoopChk) flyLoopChk.addEventListener('change', function() { flyApplyInputs(true); });
            // The route line belongs to this panel: it is hidden when the panel
            // closes (other tab / minimize) and restored on reopen while the
            // "Show route" toggle is on.
            window._flyPanelVisibility = function(visible) {
              try {
                window._flyPanelOpen = !!visible;
                try { flySyncZoomLock(); } catch (e) {}
                if (!visible) { flyPost({ action: 'flyHideRoute' }); return; }
                if (fly.raw) { flyShowRouteLine(fly.raw); return; }
                if (fly.geojson) { flyShowRouteLine(flyExtractCoords(fly.geojson)); return; }
                var spec = flyResolveSpec();
                if (spec) {
                  flyLoadRoute(spec).then(function(res) {
                    fly.geojson = res.geojson;
                    fly.raw = res.raw;
                    fly.loadedSel = (document.getElementById('fly-route-select') || {}).value;
                    fly.absolute = !!(res.props && res.props.absolute);
                    if (!fly.inputsDirty) flyWriteInputs(res.props);
                    flyShowRouteLine(res.raw);
                    var copyBtn = document.getElementById('fly-copygeo-btn'); if (copyBtn) copyBtn.disabled = false;
                    flyUpdateButtons();
                  }).catch(function() {});
                }
              } catch (e) {}
            };
            // Reflect the initially selected route's defaults into the fields
            try {
              var spec0 = flyResolveSpec();
              if (spec0 && !spec0.drawn) flyWriteInputs(spec0);
            } catch (e) {}
            var svBtn = document.getElementById('open-streetview-btn');
            if (svBtn) svBtn.addEventListener('click', function() { flyPost({ action: 'openStreetView' }); });
            var capBtn = document.getElementById('viewer-capture-btn');
            if (capBtn) capBtn.addEventListener('click', function() { flyPost({ action: 'viewerCapture' }); });
            var curLocBtn = document.getElementById('flyto-current-location-btn');
            if (curLocBtn) curLocBtn.addEventListener('click', function() {
              curLocBtn.textContent = t('getting');
              flyPost({ action: 'requestGeolocation' });
              setTimeout(function() { if (curLocBtn.textContent === t('getting')) curLocBtn.textContent = t('flyToCurrentLoc'); }, 8000);
            });
            // Ask the extension for fly capabilities + drawn route list
            flyPost({ action: 'flyInitRequest' });
          } catch (e) { try { console.error('[fly] init error', e); } catch (_) {} }

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
        const searchGoogleWarning = document.getElementById('search-google-warning');
        const resultsList = document.getElementById('search-results-list');

        // Select provider based on Yahoo/Google API key availability
        try {
          if (searchProvider) {
            const rawId = String(window._yahooAppId || '').trim().replace(/^"+|"+$/g, '');
            const hasYahoo = rawId.length > 0 && !/^(YOUR_APP_ID|undefined|null)$/i.test(rawId) && !/あなた/.test(rawId);
            const rawGKey = String(window._googleMapsApiKey || '').trim().replace(/^"+|"+$/g, '');
            const hasGoogle = rawGKey.length > 0 && !/^(YOUR_APP_ID|undefined|null)$/i.test(rawGKey) && !/あなた/.test(rawGKey);
            const yahooOpt = searchProvider.querySelector('option[value="yahoo"]');
            const googleOpt = searchProvider.querySelector('option[value="google"]');
            if (yahooOpt) yahooOpt.disabled = !hasYahoo;
            if (googleOpt) googleOpt.disabled = !hasGoogle;
            if (hasYahoo) searchProvider.value = 'yahoo';
            else if (hasGoogle) searchProvider.value = 'google';
            else searchProvider.value = 'gsi';
            const syncWarn = () => {
              if (searchYahooWarning) searchYahooWarning.style.display = (searchProvider.value === 'yahoo') ? '' : 'none';
              if (searchGoogleWarning) searchGoogleWarning.style.display = (searchProvider.value === 'google') ? '' : 'none';
            };
            syncWarn();
            searchProvider.addEventListener('change', syncWarn);
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

        // Shared Google hybrid search used by the Search tab and the
        // searchPlaces AI tool (reached via window.* because the message
        // listener lives in a different scope). cb(items, err): items use
        // {name,address,coordinates:"lng,lat"} matching renderSearchResults.
        window.googlePlacesSearchRaw = function(gKey, q, cb) {
          const lang = (typeof GEO_LANG === 'string' && GEO_LANG) ? GEO_LANG.split('-')[0] : 'en';
          const geocodeP = fetch('https://maps.googleapis.com/maps/api/geocode/json?address=' + encodeURIComponent(String(q || '').trim()) + '&key=' + encodeURIComponent(gKey) + '&language=' + encodeURIComponent(lang), { mode: 'cors' })
            .then(function(res) { return res.json().catch(function() { return null; }); })
            .then(function(data) {
              if (!data || (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')) throw new Error((data && data.error_message) || (data && data.status) || 'geocode failed');
              return (data.results || []).map(function(item) {
                return { title: item.formatted_address || '', address: item.formatted_address || '', latitude: Number(item.geometry && item.geometry.location && item.geometry.location.lat), longitude: Number(item.geometry && item.geometry.location && item.geometry.location.lng) };
              });
            });
          const placesP = fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': gKey, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location' },
            body: JSON.stringify({ textQuery: String(q || '').trim(), languageCode: lang, pageSize: 10 })
          }).then(function(res) { return res.json().then(function(data) { if (!res.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); return data; }); })
            .then(function(data) {
              return ((data && data.places) || []).map(function(place) {
                return { title: (place.displayName && place.displayName.text) || '', address: place.formattedAddress || '', latitude: Number(place.location && place.location.latitude), longitude: Number(place.location && place.location.longitude) };
              });
            });
          Promise.allSettled([geocodeP, placesP]).then(function(settled) {
            const merged = [];
            if (settled[0].status === 'fulfilled') merged.push.apply(merged, settled[0].value);
            if (settled[1].status === 'fulfilled') merged.push.apply(merged, settled[1].value);
            if (!merged.length) {
              const err = (settled[0].status === 'rejected' && settled[0].reason) || (settled[1].status === 'rejected' && settled[1].reason);
              cb(null, err || new Error('no results'));
              return;
            }
            const seen = {};
            const items = [];
            merged.forEach(function(item) {
              if (!isFinite(item.latitude) || !isFinite(item.longitude)) return;
              const k = Math.round(item.latitude * 1e4) + ',' + Math.round(item.longitude * 1e4);
              if (seen[k]) return;
              seen[k] = true;
              items.push({ name: item.title, address: item.address, coordinates: item.longitude + ',' + item.latitude });
            });
            cb(items, null);
          }).catch(function(e) { cb(null, e); });
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

          if (provider === 'google') {
            // Google hybrid search (port of kasugai_canvas): Geocoding
            // (address-oriented) + Places Text Search (POI/keyword-oriented)
            // run in parallel and are merged with ~11m deduplication.
            const gKey = String(window._googleMapsApiKey || '').trim();
            if (!gKey) {
              resultsList.innerHTML = '<li style="padding:8px;color:#a00;">' + t('googleKeyMissing') + '<div style="margin-top:6px;padding:6px;background:#fff;color:#111;border-radius:4px;font-family:monospace;display:inline-block;">' + t('googleKeySample') + '</div></li>';
              return;
            }
            try {
              resultsList.innerHTML = '<li style="padding:8px;color:#666;">' + t('searching') + '</li>';
              window.googlePlacesSearchRaw(gKey, q, function(items, err) {
                if (err) {
                  try { console.error('Google search failed', err); } catch(_) {}
                  if (resultsList) resultsList.innerHTML = '<li style="padding:8px;color:#900;">' + t('searchFailAppId') + '</li>';
                  return;
                }
                renderSearchResults(items);
              });
            } catch (e) {
              try { console.error('Google search failed', e); } catch(_) {}
              if (resultsList) resultsList.innerHTML = '<li style="padding:8px;color:#900;">' + t('searchFailAppId') + '</li>';
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
            const activeBtn = document.querySelector('.tab-bar .tab.active, .tab-bar .action-btn.active');
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

// Map mouse events → FLY playback (port of kasugai_canvas dblclick handling).
// Left double-click toggles forward play/pause; two right-clicks within 400 ms
// toggle backward play/pause (kasugai uses a double contextmenu the same way).
// The UI side ignores these unless the FLY panel is open.
try {
  if (reearth.viewer && typeof reearth.viewer.on === 'function') {
    try {
      reearth.viewer.on('doubleClick', function() {
        try { postToUI({ action: 'flyDblClick' }); } catch (e) {}
      });
    } catch (e) {}
    try {
      reearth.viewer.on('wheel', function(e) {
        try {
          const d = e && typeof e.delta === 'number' ? e.delta : 0;
          if (d) postToUI({ action: 'flyWheel', delta: d });
        } catch (err) {}
      });
    } catch (e) {}
    try {
      let _flyLastRightClick = 0;
      reearth.viewer.on('rightClick', function() {
        try {
          const now = Date.now();
          if (now - _flyLastRightClick < 400) {
            _flyLastRightClick = 0;
            postToUI({ action: 'flyRDblClick' });
          } else {
            _flyLastRightClick = now;
          }
        } catch (e) {}
      });
    } catch (e) {}
  }
} catch (e) {}

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

// ---------- Fly mode support (ported from kasugai_canvas) ----------
// Detect which optional APIs exist on this host (sketch/tools/capture are newer
// additions; Workbench plugin API 2.1.0 may not have them all).
function flyDetectCaps() {
    const caps = { sketch: false, terrain: false, capture: false };
    try {
        caps.sketch = !!(reearth.sketch && typeof reearth.sketch.setTool === 'function' && typeof reearth.sketch.on === 'function' && reearth.viewer && reearth.viewer.interactionMode && typeof reearth.viewer.interactionMode.override === 'function');
    }
    catch (e) { }
    try {
        caps.terrain = !!(reearth.viewer && reearth.viewer.tools && typeof reearth.viewer.tools.getTerrainHeightAsync === 'function');
    }
    catch (e) { }
    try {
        caps.capture = !!(reearth.viewer && typeof reearth.viewer.capture === 'function');
    }
    catch (e) { }
    return caps;
}
// Report capabilities + drawn-route list (stored in clientStorage) to the UI.
function flyPostInit() {
    (async () => {
        const caps = flyDetectCaps();
        const drawn = [];
        try {
            if (reearth.data && reearth.data.clientStorage && typeof reearth.data.clientStorage.keysAsync === 'function') {
                const keys = await reearth.data.clientStorage.keysAsync();
                (keys || []).forEach(k => {
                    if (typeof k === 'string' && k.indexOf(FLY_ROUTE_STORAGE_PREFIX) === 0) {
                        const name = k.slice(FLY_ROUTE_STORAGE_PREFIX.length);
                        if (name) {
                            drawn.push(name);
                            if (_flyDrawnRouteNames.indexOf(name) === -1)
                                _flyDrawnRouteNames.push(name);
                        }
                    }
                });
            }
        }
        catch (e) { }
        postToUI({ action: 'flyInit', caps: caps, drawn: drawn });
    })();
}
// Show the selected route as a glowing polyline layer (removed on change/stop).
function flyShowRouteLayer(coords) {
    try {
        flyHideRouteLayer();
        if (!Array.isArray(coords) || coords.length < 2)
            return;
        const layerId = reearth.layers.add({
            type: "simple",
            title: FLY_ROUTE_LAYER_TITLE,
            data: {
                type: "geojson",
                value: {
                    type: "FeatureCollection",
                    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
                }
            },
            polyline: { strokeColor: "#ffcc00", strokeWidth: 6, clampToGround: true },
            marker: { pointColor: "#ffcc00", pointSize: 0 }
        });
        if (layerId) {
            _flyRouteLayerId = layerId;
            try {
                _pluginAddedLayerIds.add(layerId);
            }
            catch (e) { }
        }
    }
    catch (e) {
        try {
            sendError('[flyShowRouteLayer] error:', e);
        }
        catch (_) { }
    }
}
function flyHideRouteLayer() {
    try {
        if (_flyRouteLayerId) {
            try {
                reearth.layers.delete(_flyRouteLayerId);
            }
            catch (e) { }
            try {
                _pluginAddedLayerIds.delete(_flyRouteLayerId);
            }
            catch (e) { }
            _flyRouteLayerId = null;
        }
    }
    catch (e) { }
}
// Sketch-based route drawing: put the viewer in sketch mode and emit a GeoJSON
// LineString to the UI on 'create'. Guarded — sketch API is optional.
let _flySketchWired = false;
function flyStartSketch() {
    try {
        if (!(reearth.sketch && typeof reearth.sketch.setTool === 'function'))
            return;
        if (!_flySketchWired) {
            _flySketchWired = true;
            try {
                reearth.sketch.on('create', (prop) => {
                    try {
                        const feature = prop && prop.feature;
                        let coords = null;
                        try {
                            if (feature && feature.geometry && feature.geometry.coordinates)
                                coords = feature.geometry.coordinates;
                        }
                        catch (e) { }
                        if (!coords) {
                            try {
                                coords = feature && feature.properties && feature.properties.positions;
                            }
                            catch (e) { }
                        }
                        const line = (coords || []).map(c => Array.isArray(c) ? c : [(c && (c.lng !== undefined ? c.lng : c.longitude)), (c && (c.lat !== undefined ? c.lat : c.latitude))]).filter(c => isFinite(c[0]) && isFinite(c[1]));
                        if (line.length >= 2) {
                            postToUI({ action: 'flyDrawn', geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { source: 'draw' }, geometry: { type: 'LineString', coordinates: line } }] } });
                        }
                    }
                    catch (e) {
                        try {
                            sendError('[sketch create] error:', e);
                        }
                        catch (_) { }
                    }
                    flyStopSketch();
                });
            }
            catch (e) {
                _flySketchWired = false;
            }
        }
        try {
            if (reearth.viewer && reearth.viewer.interactionMode && typeof reearth.viewer.interactionMode.override === 'function')
                reearth.viewer.interactionMode.override('sketch');
        }
        catch (e) { }
        try {
            if (typeof reearth.sketch.overrideOptions === 'function')
                reearth.sketch.overrideOptions({ dataOnly: true, color: '#ffcc00', autoResetInteractionMode: true });
        }
        catch (e) { }
        reearth.sketch.setTool('polyline');
    }
    catch (e) {
        try {
            sendError('[flyStartSketch] error:', e);
        }
        catch (_) { }
    }
}
function flyStopSketch() {
    try {
        if (reearth.sketch && typeof reearth.sketch.setTool === 'function')
            reearth.sketch.setTool(undefined);
    }
    catch (e) { }
    try {
        if (reearth.viewer && reearth.viewer.interactionMode && typeof reearth.viewer.interactionMode.override === 'function')
            reearth.viewer.interactionMode.override('default');
    }
    catch (e) { }
}
// Terrain sampling along a route (UI sends points, we reply with heights).
async function flySampleTerrain(reqId, pts) {
    const heights = [];
    try {
        if (reearth.viewer && reearth.viewer.tools && typeof reearth.viewer.tools.getTerrainHeightAsync === 'function') {
            for (let i = 0; i < pts.length; i += 16) {
                const batch = pts.slice(i, i + 16);
                const res = await Promise.all(batch.map(p => {
                    try {
                        return reearth.viewer.tools.getTerrainHeightAsync(p.lng, p.lat);
                    }
                    catch (e) {
                        return Promise.resolve(undefined);
                    }
                }));
                res.forEach(h => heights.push(h));
            }
        }
    }
    catch (e) {
        try {
            sendError('[flySampleTerrain] error:', e);
        }
        catch (_) { }
    }
    postToUI({ action: 'flySampleResult', reqId: reqId, heights: heights });
}
// Pending Street View verifications: svId -> { senderId, reqId } (AI tool) or
// true (UI button). The UI iframe does the metadata fetch (the sandbox cannot).
let _svSeq = 0;
const _svPending = {};

// Pending Google Places searches for the searchPlaces AI tool:
// psId -> { senderId, reqId }. The UI iframe does the fetch (the sandbox cannot).
let _psSeq = 0;
const _placesPending = {};

// Pending FlatGeobuf/GeoParquet decodes: fgId|pqId ->
// {url,title,visible,classification,pending}. The UI iframe fetches + decodes
// (CDN module); we add a GeoJSON layer on reply.
let _fgSeq = 0;
const _fgPending = {};
let _pqSeq = 0;
const _pqPending = {};

// QGIS .qml style layers: pending compile requests to the UI iframe
// (msg 'qmlStyle' -> 'qmlResult'). Each entry keeps the layer-build params.
let _qmlSeq = 0;
const _qmlPending = {};
const _qmlStyledLayerIds = new Set(); // skip applyGeojsonDrapeToAll override

// Ask the iframe to compile styleUrl into a Re:Earth appearance, then add
// the layer (or override appearance) via build(appearance).
// build gets called with null + error string on failure.
function requestQmlAppearance(styleUrl, props0, geojsonUrl, build) {
    const id = 'qml' + (++_qmlSeq);
    _qmlPending[id] = { url: styleUrl, build: build };
    // styleUrl may be a URL string or { qmlText } for embedded QML (e.g. GPKG layer_styles).
    try { postToUI({ action: 'qmlStyle', vecId: id, url: (typeof styleUrl === 'string') ? styleUrl : null, qmlText: (styleUrl && typeof styleUrl === 'object' && styleUrl.qmlText) ? styleUrl.qmlText : null, props0: props0 || null, geojsonUrl: geojsonUrl || null }); }
    catch (e) {
        delete _qmlPending[id];
        try { build(null, String(e)); } catch (e2) {}
    }
}

// Finalize a styled layer add: appearance from qmlResult merged into the
// layer def, standard bookkeeping, marked as QML-styled.
function finishStyledLayerAdd(base, appearance, visible, isBase, type) {
    if (!appearance) return null;
    const layer = Object.assign({}, base);
    if (appearance.marker) layer.marker = appearance.marker;
    if (appearance.polyline) layer.polyline = appearance.polyline;
    if (appearance.polygon) layer.polygon = appearance.polygon;
    let newId = null;
    try { newId = reearth.layers.add(layer); } catch (e) {
        try { sendError('[qml] layers.add threw:', e); } catch (_) {}
    }
    if (newId) {
        _pluginAddedLayerIds.add(newId);
        _qmlStyledLayerIds.add(newId);
        if ((type || 'geojson') === 'geojson' && _pluginAddedGeojsonLayerIds.indexOf(newId) === -1) {
            _pluginAddedGeojsonLayerIds.push(newId);
        }
        if (visible === false) _layersPendingHide.add(newId);
        try { safeShowUI('qmlStyledLayer'); } catch (e) {}
    }
    return newId;
}

function loadFlatGeobufLayer(url, title, visible, classification, limit, pending, style) {
    loadVectorViaIframe('fgbLoad', 'fg', _fgPending, url, title, visible, classification, limit, pending, () => 'fg' + (++_fgSeq), style);
}
function loadParquetLayer(url, title, visible, classification, limit, pending, style) {
    loadVectorViaIframe('pqLoad', 'pq', _pqPending, url, title, visible, classification, limit, pending, () => 'pq' + (++_pqSeq), style);
}
function loadVectorViaIframe(action, prefix, pendMap, url, title, visible, classification, limit, pending, nextId, style) {
    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: 'url required' });
        return;
    }
    const id = nextId();
    pendMap[id] = { url: url, title: title, visible: visible, classification: classification, pending: pending || null, style: style || null };
    try { postToUI({ action: action, vecId: id, url: url, limit: limit }); }
    catch (e) {
        delete pendMap[id];
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: String(e) });
    }
}

// DuckDB-Wasm query layers (kasugai duckdb: port). The UI iframe runs the
// query; _ddbPending tracks in-flight requests and _ddbLayers tracks added
// bbox=auto layers so camera moves can re-query and override the layer data.
let _ddbSeq = 0;
const _ddbPending = {};
const _ddbLayers = {};

// Normalized viewport bounds for the iframe's ST_MakeEnvelope SQL
// (antimeridian crossings become two ranges).
function getViewportRanges() {
    try {
        const vp = (reearth.camera && reearth.camera.viewport) ? reearth.camera.viewport : null;
        if (!vp || typeof vp.west !== 'number' || typeof vp.east !== 'number') return null;
        const norm = (d) => { const lon = ((d + 180) % 360 + 360) % 360 - 180; return lon === -180 ? 180 : lon; };
        const west = norm(vp.west), east = norm(vp.east);
        const south = Math.max(-89.9, Math.min(89.9, vp.south));
        const north = Math.max(-89.9, Math.min(89.9, vp.north));
        if (!(north > south)) return null;
        const ranges = (west === east) ? [{ west: -180, east: 180 }]
            : (west < east) ? [{ west: west, east: east }]
            : [{ west: west, east: 180 }, { west: -180, east: east }];
        return { ranges: ranges, south: south, north: north };
    } catch (e) { return null; }
}

// The basemap-widget iframe is long-lived (its ui.show runs once), so its
// DuckDB-Wasm instance survives panel re-renders. Prefer it as the query
// host; fall back to our own iframe when it does not acknowledge.
let _ddbHostId = null;
let _ddbHostDead = false;
function findExtensionInstanceId(extensionId) {
    try {
        const list = (reearth && reearth.extension && reearth.extension.list) || [];
        const t = list.find((ex) => ex && ex.extensionId === extensionId);
        return t ? t.id : null;
    } catch (e) { return null; }
}
function ddbPost(vecId, spec, layerId) {
    const payload = {
        vecId: vecId, layerId: layerId || null,
        url: spec.url, format: spec.format || null, where: spec.where || null,
        limit: spec.limit || null, geom: spec.geom || null, lon: spec.lon || null, lat: spec.lat || null,
        columns: spec.columns || null, covering: spec.covering || null,
        query: spec.query || null,
        bounds: spec.bboxAuto ? getViewportRanges() : null
    };
    let hosted = false;
    if (!_ddbHostDead) {
        try {
            const hostId = _ddbHostId || findExtensionInstanceId('basemap-widget');
            if (hostId) {
                _ddbHostId = hostId;
                reearth.extension.postMessage(hostId, Object.assign({ action: 'ddbExec' }, payload));
                hosted = true;
            } else {
                _ddbHostDead = true;
            }
        } catch (e) {}
    }
    if (hosted) {
        // No ack within 3s means the host iframe is gone (widget hidden) —
        // run the query in our own iframe instead.
        waitViaUiTimer(3000).then(() => {
            const p = _ddbPending[vecId];
            if (p && !p.hostAck) {
                _ddbHostDead = true;
                try { postToUI(Object.assign({ action: 'ddbLoad' }, payload)); } catch (e) {}
            }
        });
    } else {
        try { postToUI(Object.assign({ action: 'ddbLoad' }, payload)); } catch (e) {}
    }
}

function loadDuckDbLayer(spec, pending) {
    if (!spec || !spec.url || !/^https?:\/\//.test(spec.url)) {
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: 'url required' });
        return;
    }
    // .gpkg / format=gpkg is routed to the sql.js path (kasugai isGpkgBackedItem).
    const format = String(spec.format || '').toLowerCase();
    if (format === 'gpkg' || /\.gpkg([?#]|$)/i.test(spec.url || '')) {
        loadGpkgLayer(spec, pending);
        return;
    }
    const id = 'dd' + (++_ddbSeq);
    _ddbPending[id] = { kind: 'add', spec: spec, pending: pending || null };
    try { ddbPost(id, spec, null); }
    catch (e) {
        delete _ddbPending[id];
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: String(e) });
    }
}

// sql: arbitrary SELECT query layer (kasugai sql: port).
function loadSqlLayer(spec, pending) {
    if (!spec || !spec.query) {
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: 'query required' });
        return;
    }
    const id = 'dd' + (++_ddbSeq);
    spec.engine = 'duckdb';
    _ddbPending[id] = { kind: 'add', spec: spec, pending: pending || null };
    try { ddbPost(id, spec, null); }
    catch (e) {
        delete _ddbPending[id];
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: String(e) });
    }
}

// gpkg: GeoPackage layer decoded by sql.js in the UI iframe (kasugai gpkg: port).
let _gpkgSeq = 0;
const _gpkgPending = {};
function gpkgPost(vecId, spec, layerId) {
    const payload = {
        vecId: vecId, layerId: layerId || null,
        url: spec.url, dataB64: spec.dataB64 || null,
        table: spec.table || null, where: spec.where || null,
        limit: spec.limit || null, columns: spec.columns || null,
        bounds: spec.bboxAuto ? getViewportRanges() : null
    };
    let hosted = false;
    if (!_ddbHostDead) {
        try {
            const hostId = _ddbHostId || findExtensionInstanceId('basemap-widget');
            if (hostId) {
                _ddbHostId = hostId;
                reearth.extension.postMessage(hostId, Object.assign({ action: 'gpkgExec' }, payload));
                hosted = true;
            } else {
                _ddbHostDead = true;
            }
        } catch (e) {}
    }
    if (hosted) {
        waitViaUiTimer(3000).then(() => {
            const p = _gpkgPending[vecId];
            if (p && !p.hostAck) {
                _ddbHostDead = true;
                try { postToUI(Object.assign({ action: 'gpkgLoad' }, payload)); } catch (e) {}
            }
        });
    } else {
        try { postToUI(Object.assign({ action: 'gpkgLoad' }, payload)); } catch (e) {}
    }
}
function loadGpkgLayer(spec, pending) {
    if (!spec || (!spec.url && !spec.dataB64)) {
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: 'url required' });
        return;
    }
    const id = 'gp' + (++_gpkgSeq);
    _gpkgPending[id] = { kind: 'add', spec: spec, pending: pending || null };
    try { gpkgPost(id, spec, null); }
    catch (e) {
        delete _gpkgPending[id];
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: String(e) });
    }
}
function refreshGpkgLayer(layerId, spec) {
    const id = 'gp' + (++_gpkgSeq);
    spec.req = id;
    _gpkgPending[id] = { kind: 'refresh', layerId: layerId };
    try { gpkgPost(id, spec, layerId); }
    catch (e) { delete _gpkgPending[id]; }
}
function handleGpkgResult(msg) {
    const p = _gpkgPending[msg.vecId];
    if (p === undefined) return;
    delete _gpkgPending[msg.vecId];
    if (msg.error || !msg.geojson) {
        try { sendError('[gpkg] query failed:', msg.error); } catch (e) {}
        if (p.kind === 'add' && p.pending && p.pending.senderId) aiToolReply(p.pending.senderId, p.pending.reqId, false, { error: String(msg.error || 'query failed') });
        return;
    }
    if (p.kind === 'refresh') {
        const spec = _ddbLayers[msg.layerId];
        if (spec && spec.req === msg.vecId) {
            try { reearth.layers.override(msg.layerId, { data: { type: 'geojson', value: msg.geojson } }); }
            catch (e) { try { sendError('[gpkg] data override failed', e); } catch (e2) {} }
        }
        return;
    }
    const s = p.spec;
    const title = s.title || ('GeoPackage: ' + s.url);
    const p0 = (((msg.geojson || {}).features || [])[0] || {}).properties || null;
    // Embedded layer_styles QML is used when no explicit style= is given.
    const style = s.style || (msg.qml ? { qmlText: msg.qml } : null);
    const newId = addGeoJsonValueLayer(msg.geojson, title, s.visible !== false, s.classification, 'GeoPackage: ' + s.url, style, p0);
    if (newId && newId !== '__qml_pending__' && s.bboxAuto) {
        _ddbLayers[newId] = {
            engine: 'gpkg',
            url: s.url, table: s.table, where: s.where, limit: s.limit,
            columns: s.columns, bboxAuto: true
        };
        ensureDuckDbMoveSubscription();
    }
    if (p.pending && p.pending.senderId) aiToolReply(p.pending.senderId, p.pending.reqId, !!newId, { id: newId, title: title, features: (msg.geojson.features || []).length });
}

function refreshDuckDbLayer(layerId, spec) {
    const id = 'dd' + (++_ddbSeq);
    spec.req = id; // stale-response guard: only the latest query result is applied
    _ddbPending[id] = { kind: 'refresh', layerId: layerId };
    try { ddbPost(id, spec, layerId); }
    catch (e) { delete _ddbPending[id]; }
}

// Trailing debounce via the UI iframe timer (the QuickJS sandbox has no
// setTimeout): each camera move bumps the generation; only the last wait
// actually refreshes.
let _ddbMoveGen = 0;
function scheduleDuckDbRefresh() {
    const gen = ++_ddbMoveGen;
    waitViaUiTimer(600).then(() => {
        if (gen !== _ddbMoveGen) return;
        for (const layerId of Object.keys(_ddbLayers)) {
            const spec = _ddbLayers[layerId];
            let lyr = null;
            try { lyr = (reearth.layers.findById && typeof reearth.layers.findById === 'function') ? reearth.layers.findById(layerId) : null; } catch (e) {}
            if (!lyr) { delete _ddbLayers[layerId]; continue; }
            if (lyr.visible === false) continue;
            if (spec.engine === 'gpkg') refreshGpkgLayer(layerId, spec);
            else refreshDuckDbLayer(layerId, spec);
        }
    });
}
// camera.on('move') is subscribed lazily on the first bbox=auto layer so
// sessions without query layers never touch the camera event.
let _ddbMoveSubscribed = false;
function ensureDuckDbMoveSubscription() {
    if (_ddbMoveSubscribed) return;
    _ddbMoveSubscribed = true;
    try {
        if (reearth.camera && typeof reearth.camera.on === 'function') {
            reearth.camera.on('move', () => {
                try { if (Object.keys(_ddbLayers).length) scheduleDuckDbRefresh(); } catch (e) {}
            });
        }
    } catch (e) {}
}

// A DuckDB query finished — either add a new layer (kind 'add') or override
// an existing bbox=auto layer's data (kind 'refresh'). Reached via the UI
// message channel (own iframe) or extensionMessage (basemap-widget host).
function handleDdbResult(msg) {
    const p = _ddbPending[msg.vecId];
    if (p === undefined) return;
    delete _ddbPending[msg.vecId];
    if (msg.error || !msg.geojson) {
        try { sendError('[duckdb] query failed:', msg.error); } catch (e) {}
        if (p.kind === 'add' && p.pending && p.pending.senderId) aiToolReply(p.pending.senderId, p.pending.reqId, false, { error: String(msg.error || 'query failed') });
        return;
    }
    if (p.kind === 'refresh') {
        const spec = _ddbLayers[msg.layerId];
        if (spec && spec.req === msg.vecId) {
            try { reearth.layers.override(msg.layerId, { data: { type: 'geojson', value: msg.geojson } }); }
            catch (e) { try { sendError('[duckdb] data override failed', e); } catch (e2) {} }
        }
        return;
    }
    const s = p.spec;
    const title = s.title || ('DuckDB: ' + s.url);
    const p0 = (((msg.geojson || {}).features || [])[0] || {}).properties || null;
    const newId = addGeoJsonValueLayer(msg.geojson, title, s.visible !== false, s.classification, 'DuckDB: ' + s.url, s.style, p0);
    if (newId && s.bboxAuto) {
        _ddbLayers[newId] = {
            engine: 'duckdb',
            url: s.url, format: s.format, where: s.where, limit: s.limit,
            geom: s.geom, lon: s.lon, lat: s.lat, columns: s.columns,
            covering: s.covering, query: s.query || null, bboxAuto: true
        };
        ensureDuckDbMoveSubscription();
    }
    if (p.pending && p.pending.senderId) aiToolReply(p.pending.senderId, p.pending.reqId, !!newId, { id: newId, title: title, features: (msg.geojson.features || []).length });
}

// Add a GeoJSON layer from an in-memory FeatureCollection (same default
// styling as addXyzLayer's url-based geojson branch).
function addGeoJsonValueLayer(fc, title, visible, classification, label, style, props0) {
    const geoClass = normalizeClassification(classification) || _geojsonClassification;
    const layer = {
        type: "simple",
        title: title || label || 'GeoJSON layer',
        visible: true,
        data: { type: "geojson", value: fc },
        marker: { pointColor: "#3388ff", pointSize: 10 },
        polyline: { strokeColor: "#3388ff", strokeWidth: 2, clampToGround: true, classificationType: geoClass },
        polygon: { fillColor: "#3388ff44", strokeColor: "#3388ff", strokeWidth: 2, heightReference: "clamp", classificationType: geoClass }
    };
    if (style) {
        // QGIS .qml style: compile in the UI iframe, then add with the
        // generated per-feature conditional appearance.
        requestQmlAppearance(style, props0, null, (appearance, err) => {
            if (!appearance) { try { sendError('[qml] fallback to default style:', label, err); } catch (e) {}
                finishStyledLayerAdd(layer, null, visible, false, 'geojson'); return; }
            finishStyledLayerAdd(layer, appearance, visible, false, 'geojson');
        });
        return '__qml_pending__';
    }
    try {
        const newId = reearth.layers.add(layer);
        if (newId) {
            _pluginAddedLayerIds.add(newId);
            if (_pluginAddedGeojsonLayerIds.indexOf(newId) === -1) _pluginAddedGeojsonLayerIds.push(newId);
            if (visible === false) _layersPendingHide.add(newId);
            try { safeShowUI('addGeoJsonValueLayer'); } catch (e) {}
        }
        return newId || null;
    } catch (e) {
        try { sendError('[addGeoJsonValueLayer] error:', e); } catch (_) {}
        return null;
    }
}

// Open Google Street View at the point the camera is looking at (globe
// intersection preferred, camera position as fallback).
// When googleMapsApiKey is set, the UI iframe first verifies the nearest
// panorama via Street View Static metadata (free): outdoor panos are preferred
// and the confirmed pano_id is embedded in the URL so the user does not land on
// a dark/indoor/removed panorama (port of kasugai_canvas openStreetView).
// Without a key, falls back to the plain viewpoint URL (previous behavior).
// `pending` is { senderId, reqId } when invoked from the AI tool.
function openStreetViewFromCamera(pending) {
    try {
        let lat = null, lng = null;
        try {
            if (reearth.camera && typeof reearth.camera.getGlobeIntersection === 'function') {
                const inter = reearth.camera.getGlobeIntersection({ withTerrain: true });
                if (inter && inter.center && isFinite(inter.center.lat) && isFinite(inter.center.lng)) {
                    lat = inter.center.lat;
                    lng = inter.center.lng;
                }
            }
        }
        catch (e) { }
        if (lat === null) {
            try {
                const cur = reearth.camera && reearth.camera.position;
                if (cur) {
                    lat = cur.lat;
                    lng = cur.lng;
                }
            }
            catch (e) { }
        }
        if (!(isFinite(lat) && isFinite(lng))) {
            if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: 'camera position unavailable' });
            return;
        }
        const plainUrl = 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + ',' + lng;
        if (_inspectorGoogleMapsApiKey) {
            const svId = 'sv' + (++_svSeq);
            _svPending[svId] = pending || true;
            try { postToUI({ action: 'svVerify', svId: svId, lat: lat, lng: lng }); } catch (e) {}
            // The UI always answers svResult (key missing/fetch failure included),
            // and the sandbox has no timers — no fallback timeout needed.
            return;
        }
        try { reearth.viewer.open(plainUrl); } catch (e) {}
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, true, { url: plainUrl, verified: false, status: 'NO_KEY' });
    }
    catch (e) {
        try {
            sendError('[openStreetView] error:', e);
        }
        catch (_) { }
        if (pending && pending.senderId) aiToolReply(pending.senderId, pending.reqId, false, { error: String(e) });
    }
}
// Capture the current view as PNG and hand the data URL to the UI for display.
function viewerCapture() {
    try {
        if (reearth.viewer && typeof reearth.viewer.capture === 'function') {
            const dataUrl = reearth.viewer.capture('image/png');
            if (dataUrl)
                postToUI({ action: 'captureResult', dataUrl: dataUrl });
        }
    }
    catch (e) {
        try {
            sendError('[viewerCapture] error:', e);
        }
        catch (_) { }
    }
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
      } else if (msg.action === 'flyInitRequest') {
          try {
              flyPostInit();
          }
          catch (e) { }
      }
      else if (msg.action === 'flySetView') {
          // Per-frame camera update from the UI-side flight loop
          try {
              if (isFinite(msg.lat) && isFinite(msg.lng)) {
                  reearth.camera.setView({
                      lat: msg.lat, lng: msg.lng,
                      height: isFinite(msg.height) ? msg.height : 0,
                      heading: isFinite(msg.heading) ? msg.heading : 0,
                      pitch: isFinite(msg.pitch) ? msg.pitch : 0,
                      roll: isFinite(msg.roll) ? msg.roll : 0
                  });
              }
          }
          catch (e) { }
      }
      else if (msg.action === 'flySample') {
          try {
              if (Array.isArray(msg.pts) && msg.pts.length)
                  flySampleTerrain(msg.reqId, msg.pts);
          }
          catch (e) { }
      }
      else if (msg.action === 'flyShowRoute') {
          try {
              flyShowRouteLayer(msg.coords);
          }
          catch (e) { }
      }
      else if (msg.action === 'flyHideRoute') {
          try {
              flyHideRouteLayer();
          }
          catch (e) { }
      }
      else if (msg.action === 'flyZoomLock') {
          // Port of kasugai_canvas setMode: while the FLY panel owns a route,
          // remove WHEEL from zoomEventTypes so wheel = speed (zoom via
          // right-drag still works). Sent on lock transitions only.
          try {
              const cam: any = reearth.camera;
              if (cam && typeof cam.overrideScreenSpaceCameraController === 'function') {
                  cam.overrideScreenSpaceCameraController(
                      msg.lock ? { zoomEventTypes: ['right_drag', 'pinch'] } : {}
                  );
              }
          }
          catch (e) { }
      }
      else if (msg.action === 'flyDrawStart') {
          try {
              flyStartSketch();
          }
          catch (e) { }
      }
      else if (msg.action === 'flyDrawStop' || msg.action === 'flyStop') {
          try {
              flyStopSketch();
          }
          catch (e) { }
      }
      else if (msg.action === 'flyGetDrawn') {
          (async () => {
              let g = null;
              try {
                  g = await reearth.data.clientStorage.getAsync(FLY_ROUTE_STORAGE_PREFIX + msg.name);
              }
              catch (e) { }
              try {
                  postToUI({ action: 'flyDrawnData', name: msg.name, geojson: g });
              }
              catch (e) { }
          })();
      }
      else if (msg.action === 'flySaveRoute') {
          try {
              if (msg.name && msg.geojson) {
                  reearth.data.clientStorage.setAsync(FLY_ROUTE_STORAGE_PREFIX + msg.name, msg.geojson);
                  if (_flyDrawnRouteNames.indexOf(msg.name) === -1)
                      _flyDrawnRouteNames.push(msg.name);
              }
          }
          catch (e) { }
      }
      else if (msg.action === 'flyDeleteRoute') {
          try {
              reearth.data.clientStorage.deleteAsync(FLY_ROUTE_STORAGE_PREFIX + msg.name);
          }
          catch (e) { }
          try {
              const i = _flyDrawnRouteNames.indexOf(msg.name);
              if (i >= 0)
                  _flyDrawnRouteNames.splice(i, 1);
          }
          catch (e) { }
      }
      else if (msg.action === 'openStreetView') {
          try {
              openStreetViewFromCamera();
          }
          catch (e) { }
      }
      else if (msg.action === 'svResult') {
          // UI iframe finished the Street View metadata lookup — open the URL
          // it built (verified panoid URL, or the plain viewpoint fallback).
          try {
              const p = _svPending[msg.svId];
              if (p !== undefined) delete _svPending[msg.svId];
              const url = (typeof msg.url === 'string' && msg.url) ? msg.url : null;
              if (url) { try { reearth.viewer.open(url); } catch (e) {} }
              if (p && p.senderId) aiToolReply(p.senderId, p.reqId, !!url, { url: url, verified: !!msg.verified, status: String(msg.status || '') });
          }
          catch (e) { }
      }
      else if (msg.action === 'placesResult') {
          // UI iframe finished the Google hybrid search — relay to the AI tool.
          try {
              const p = _placesPending[msg.psId];
              if (p !== undefined) delete _placesPending[msg.psId];
              const res = (msg.result && typeof msg.result === 'object') ? msg.result : { error: 'no result' };
              if (p && p.senderId) aiToolReply(p.senderId, p.reqId, !res.error, res);
          }
          catch (e) { }
      }
      else if (msg.action === 'fgbResult' || msg.action === 'pqResult') {
          // UI iframe finished decoding a FlatGeobuf/GeoParquet file — add it
          // as a GeoJSON layer and resolve any pending AI tool call.
          try {
              const isPq = (msg.action === 'pqResult');
              const pendMap = isPq ? _pqPending : _fgPending;
              const label = isPq ? 'GeoParquet' : 'FlatGeobuf';
              const p = pendMap[msg.vecId];
              if (p !== undefined) delete pendMap[msg.vecId];
              if (p) {
                  if (msg.error || !msg.geojson) {
                      try { sendError('[' + label + '] decode failed:', msg.error); } catch (e) {}
                      if (p.pending && p.pending.senderId) aiToolReply(p.pending.senderId, p.pending.reqId, false, { error: String(msg.error || 'decode failed') });
                  } else {
                      const title = p.title || (label + ': ' + p.url);
                      const p0 = (((msg.geojson || {}).features || [])[0] || {}).properties || null;
                      const newId = addGeoJsonValueLayer(msg.geojson, title, p.visible !== false, p.classification, label + ': ' + p.url, p.style, p0);
                      if (p.pending && p.pending.senderId) aiToolReply(p.pending.senderId, p.pending.reqId, !!newId, { id: newId, title: title, features: (msg.geojson.features || []).length });
                  }
              }
          }
          catch (e) { }
      }
      else if (msg.action === 'qmlResult') {
          // UI iframe finished a .qml -> appearance compile
          try {
              const p = _qmlPending[msg.vecId];
              if (p !== undefined) delete _qmlPending[msg.vecId];
              if (p) {
                  if (msg.error || !msg.appearance) {
                      try { sendError('[qml] compile failed for', p.url, msg.error); } catch (e) {}
                      try { p.build(null, msg.error || 'compile failed'); } catch (e2) {}
                  } else {
                      if (msg.warnings && msg.warnings.length) {
                          try { sendError('[qml] warnings:', p.url, msg.warnings.join(' / ')); } catch (e) {}
                      }
                      try { p.build(msg.appearance, null); } catch (e2) { try { sendError('[qml] build threw', e2); } catch (_) {} }
                  }
              }
          } catch (e) {}
      }
      else if (msg.action === 'ddbResult') {
          // DuckDB query result from our own iframe (the host route replies
          // via extensionMessage instead).
          try { handleDdbResult(msg); } catch (e) {}
      }
      else if (msg.action === 'gpkgResult') {
          // GeoPackage decode result from our own iframe (host route replies
          // via extensionMessage instead).
          try { handleGpkgResult(msg); } catch (e) {}
      }
      else if (msg.action === 'importAdd') {
          // Local file import finished decoding in the UI iframe — add the
          // FeatureCollection as a normal GeoJSON layer.
          try {
              const fc = msg.geojson || null;
              if (fc && Array.isArray(fc.features)) {
                  const title = msg.title || 'Imported file';
                  const p0 = ((fc.features || [])[0] || {}).properties || null;
                  addGeoJsonValueLayer(fc, title, true, msg.classification || null, 'Import: ' + title, null, p0);
                  try { postToUI({ action: 'importDone', title: title, count: fc.features.length }); } catch (e) {}
              } else {
                  try { postToUI({ action: 'importDone', error: msg.error || 'empty data' }); } catch (e) {}
              }
          } catch (e) {}
      }
      else if (msg.action === 'importKasc') {
          // .kasc/.txt file dropped into the import UI — append its lines to
          // the inspector settings text and re-apply.
          try {
              const add = (typeof msg.text === 'string') ? msg.text : '';
              if (add.trim()) {
                  const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
                  const cur = (prop.settings && prop.settings.inspectorText) || prop.inspectorText || '';
                  const newText = cur ? (cur + '\n' + add) : add;
                  if (reearth.extension && reearth.extension.widget && typeof reearth.extension.widget.setPropertyValue === 'function') {
                      reearth.extension.widget.setPropertyValue('settings', 'inspectorText', newText);
                  }
                  _lastInspectorLayersJson = newText;
                  processInspectorText(newText);
                  try { postToUI({ action: 'importDone', title: '.kasc', count: -1 }); } catch (e) {}
              }
          } catch (e) {}
      }
      else if (msg.action === 'viewerCapture') {
          try {
              viewerCapture();
          }
          catch (e) { }
      }
      else if (msg.action === 'manageTextRequest') {
          try {
              const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
              const text = (prop.settings && prop.settings.inspectorText) || prop.inspectorText || '';
              postToUI({ action: 'manageText', text: (typeof text === 'string') ? text : '' });
          }
          catch (e) { }
      }
      else if (msg.action === 'applyInspectorText') {
          try {
              const newText = (typeof msg.text === 'string') ? msg.text : '';
              if (reearth.extension && reearth.extension.widget && typeof reearth.extension.widget.setPropertyValue === 'function') {
                  reearth.extension.widget.setPropertyValue('settings', 'inspectorText', newText);
              }
              // Skip re-processing the text we just wrote via the inspector poll
              _lastInspectorLayersJson = newText;
              processInspectorText(newText);
              postToUI({ action: 'manageTextApplied' });
          }
          catch (e) {
              try { sendError('[applyInspectorText] failed:', e); } catch(_){ }
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
        if (data && data.action === 'ddbAck') {
          // The basemap-widget host iframe accepted the query — suppress the
          // fallback that would re-run it in our own iframe.
          try { const p = _ddbPending[data.vecId]; if (p) p.hostAck = true; } catch (e) {}
          return;
        }
        if (data && data.action === 'ddbResult') {
          try { const p = _ddbPending[data.vecId]; if (p) p.hostAck = true; } catch (e) {}
          try { handleDdbResult(data); } catch (e) {}
          return;
        }
        if (data && data.action === 'gpkgAck') {
          try { const p = _gpkgPending[data.vecId]; if (p) p.hostAck = true; } catch (e) {}
          return;
        }
        if (data && data.action === 'gpkgResult') {
          try { const p = _gpkgPending[data.vecId]; if (p) p.hostAck = true; } catch (e) {}
          try { handleGpkgResult(data); } catch (e) {}
          return;
        }
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
        } else if (data && data.action === 'requestAiConfig') {
          // The ai-chat widget asks for inspector-provided config (API key, model, lang).
          const targetId = msg.sender || null;
          if (targetId && reearth.extension && typeof reearth.extension.postMessage === 'function') {
            try {
              reearth.extension.postMessage(targetId, {
                action: 'aiConfig',
                lang: _inspectorLang || 'auto',
                geminiApiKey: _inspectorGeminiApiKey || '',
                geminiModel: _inspectorGeminiModel || '',
                yahooAppId: _inspectorYahooAppId || '',
                googleMapsApiKey: _inspectorGoogleMapsApiKey || ''
              });
            } catch (e) {}
          }
        } else if (data && data.action === 'aiToolRequest') {
          // The ai-chat widget delegates inspector-bound tools here (presets,
          // basemaps, fly routes, terrain/shadow, street view, vector features).
          try { handleAiToolRequest(msg.sender || null, data); } catch (e) { try { sendError('[aiToolRequest] error:', e); } catch(_){} }
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

function addXyzLayer(url, title, layerType, isBase = false, visible = true, zoom = null, attribution = null, classification = null, style = null) {
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
    if (style) {
      // QGIS .qml style: compile in the UI iframe, then add with the
      // generated per-feature conditional appearance.
      requestQmlAppearance(style, null, encodedUrl, (appearance, err) => {
        if (!appearance) { try { sendError('[qml] fallback to default style:', url, err); } catch (e) {}
          finishStyledLayerAdd(layer, null, visible, isBase, type); return; }
        finishStyledLayerAdd(layer, appearance, visible, isBase, type);
      });
      return;
    }
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
const _defaultInspectorText = `attrUrlOpen: newtab
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

// Tell the basemap widget to switch basemap (url '' = none). Used by ai-chat tools.
function postSelectBasemap(url) {
  try {
    const id = _basemapWidgetId || findBasemapWidgetId();
    if (!id) return false;
    _basemapWidgetId = id;
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(id, { action: 'selectBasemap', url: url });
      return true;
    }
  } catch (e) {}
  return false;
}

function aiToolReply(senderId, reqId, ok, result) {
  try {
    if (senderId && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(senderId, { action: 'aiToolResult', reqId: reqId, ok: ok, result: result });
    }
  } catch (e) {}
}

// Resolve a layer by id or (partial, case-insensitive) title — ai-chat tools.
function aiFindLayer(ref) {
  try {
    if (ref === undefined || ref === null) return null;
    const raw = (reearth && reearth.layers && reearth.layers.layers);
    const all = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
    const r = String(ref);
    let l = all.find(x => x && x.id === r);
    if (l) return l;
    const rl = r.toLowerCase();
    l = all.find(x => x && String(x.title || '').toLowerCase() === rl);
    if (l) return l;
    l = all.find(x => x && String(x.title || '').toLowerCase().indexOf(rl) >= 0);
    return l || null;
  } catch (e) { return null; }
}

// Locate a vector feature by attribute/value inside the feature index.
// Returns { lat, lng, attr, val, src } or null (mirrors the flyToFeature logic).
function aiFindFeature(idx, layerId, attr, val) {
  try {
    const src = (layerId === '__all__') ? idx.all : (idx.layers ? idx.layers[layerId] : null);
    if (!src || !src.featureByAttr) return null;
    let hit = (src.featureByAttr[attr] || {})[val] || null;
    let hitAttr = attr, hitVal = val;
    if (!hit) {
      const attrs = Object.keys(src.featureByAttr);
      const ak = attrs.find(a => a.toLowerCase() === attr.toLowerCase())
        || attrs.find(a => a.toLowerCase().indexOf(attr.toLowerCase()) >= 0);
      if (ak) {
        const vals = Object.keys(src.featureByAttr[ak] || {});
        const vk = vals.find(v => v === val)
          || vals.find(v => v.toLowerCase() === val.toLowerCase())
          || vals.find(v => v.toLowerCase().indexOf(val.toLowerCase()) >= 0);
        if (vk) { hit = src.featureByAttr[ak][vk]; hitAttr = ak; hitVal = vk; }
      }
    }
    if (!hit || hit.lat == null || hit.lng == null) return null;
    return { lat: hit.lat, lng: hit.lng, attr: hitAttr, val: hitVal, src: src };
  } catch (e) { return null; }
}

// Rebuild the full property map for an index row matching attr/value.
function aiFeatureProps(src, attr, val) {
  try {
    if (!src || !src.attributes || !src.rows) return null;
    const ai = src.attributes.indexOf(attr);
    if (ai < 0) return null;
    const row = src.rows.find(r => r && r.values && r.values[ai] === val);
    if (!row) return null;
    const props = {};
    src.attributes.forEach((a, i) => { props[a] = row.values[i]; });
    return props;
  } catch (e) { return null; }
}

// Execute tools delegated by the ai-chat widget. These all depend on state
// owned by this widget (inspector text, camera presets, fly routes, vector index).
function handleAiToolRequest(senderId, data) {
  const reqId = data && data.reqId;
  const name = data && data.name;
  const args = (data && data.args) || {};
  const fail = (m) => aiToolReply(senderId, reqId, false, { error: m });
  try {
    switch (name) {
      case 'listCameraPresets':
        aiToolReply(senderId, reqId, true, (_cameraPresets || []).map(c => ({ name: c.title, lat: c.lat, lng: c.lng })));
        return;
      case 'flyToPreset': {
        const n = String(args.name || '').toLowerCase();
        const cam = (_cameraPresets || []).find(c => String(c.title).toLowerCase() === n)
          || (_cameraPresets || []).find(c => String(c.title).toLowerCase().indexOf(n) >= 0);
        if (!cam) { fail('preset not found: ' + args.name); return; }
        flyToAndNotify(cam.lat, cam.lng, { height: cam.height, heading: cam.heading, pitch: cam.pitch, duration: 2, addMarker: false })
          .then(r => aiToolReply(senderId, reqId, !!(r && r.success), { name: cam.title }))
          .catch(e => fail(String(e)));
        return;
      }
      case 'listBasemaps':
        aiToolReply(senderId, reqId, true, (_parsedBaseTiles || []).map(b => ({ name: b.title, url: b.url })));
        return;
      case 'setBasemap': {
        const n = String(args.name || '').toLowerCase().trim();
        if (!n || n === 'none' || n === '(none)') {
          if (postSelectBasemap('')) aiToolReply(senderId, reqId, true, { selected: 'none' });
          else fail('basemap widget unavailable');
          return;
        }
        const tiles = _parsedBaseTiles || [];
        const b = tiles.find(x => String(x.title || '').toLowerCase() === n)
          || tiles.find(x => String(x.title || '').toLowerCase().indexOf(n) >= 0)
          || tiles.find(x => String(x.url || '').toLowerCase() === n);
        if (!b) { fail('basemap not found: ' + args.name); return; }
        if (postSelectBasemap(b.url)) aiToolReply(senderId, reqId, true, { selected: b.title || b.url });
        else fail('basemap widget unavailable');
        return;
      }
      case 'listFlyPaths':
        aiToolReply(senderId, reqId, true, {
          inspector: (_flyRoutes || []).map(r => ({ name: r.title, speed: r.speed, height: r.height, pitch: r.pitch, loop: r.loop })),
          drawn: (_flyDrawnRouteNames || []).slice()
        });
        return;
      case 'playFlyPath': {
        const n = String(args.name || '').toLowerCase();
        const hit = (_flyRoutes || []).find(r => String(r.title).toLowerCase() === n)
          || (_flyRoutes || []).find(r => String(r.title).toLowerCase().indexOf(n) >= 0);
        const drawn = (_flyDrawnRouteNames || []).find(d => String(d).toLowerCase() === n)
          || (_flyDrawnRouteNames || []).find(d => String(d).toLowerCase().indexOf(n) >= 0);
        if (!hit && !drawn) { fail('fly path not found: ' + args.name); return; }
        // Playback runs in the UI iframe (requestAnimationFrame lives there)
        postToUI({ action: 'aiFlyPlay', name: hit ? hit.title : null, drawn: drawn || null });
        aiToolReply(senderId, reqId, true, { playing: hit ? hit.title : drawn });
        return;
      }
      case 'stopFly':
        postToUI({ action: 'aiFlyStop' });
        aiToolReply(senderId, reqId, true, {});
        return;
      case 'setTerrain': {
        const en = !!args.enabled;
        const bg = _lastInspectorBackground || '#ffffff';
        reearth.viewer.overrideProperty({
          terrain: { enabled: en, type: 'reearth_terrain' },
          globe: { depthTestAgainstTerrain: en, baseColor: bg },
          scene: { backgroundColor: bg },
        });
        try { postToUI({ action: 'terrainState', enabled: en }); } catch (e) {}
        aiToolReply(senderId, reqId, true, { enabled: en });
        return;
      }
      case 'setShadow': {
        const en = !!args.enabled;
        const bg = _lastInspectorBackground || '#ffffff';
        reearth.viewer.overrideProperty({
          scene: { shadow: { enabled: en }, backgroundColor: bg },
          globe: { baseColor: bg },
        });
        try { postToUI({ action: 'shadowState', enabled: en }); } catch (e) {}
        aiToolReply(senderId, reqId, true, { enabled: en });
        return;
      }
      case 'openStreetView':
        openStreetViewFromCamera({ senderId: senderId, reqId: reqId });
        return;
      case 'flyToFeature': {
        if (!_vectorFeatureIndex) {
          try { buildVectorFeatureIndexFromLayers(); } catch (e) {}
        }
        const idx = _vectorFeatureIndex;
        if (!idx) { fail('vector index unavailable'); return; }
        let layerId = '__all__';
        if (args.layer) {
          const n = String(args.layer).toLowerCase();
          const opt = (idx.layerOptions || []).find(o => String(o.title).toLowerCase() === n)
            || (idx.layerOptions || []).find(o => String(o.title).toLowerCase().indexOf(n) >= 0);
          if (!opt) { fail('layer not found: ' + args.layer); return; }
          layerId = opt.id;
        }
        const src = (layerId === '__all__') ? idx.all : (idx.layers ? idx.layers[layerId] : null);
        const attr = String(args.attribute || '');
        const val = String(args.value === undefined || args.value === null ? '' : args.value);
        let hit = null;
        if (src && src.featureByAttr) {
          hit = (src.featureByAttr[attr] || {})[val] || null;
          if (!hit) {
            // fuzzy match on attribute name, then on value
            const attrs = Object.keys(src.featureByAttr);
            const ak = attrs.find(a => a.toLowerCase() === attr.toLowerCase())
              || attrs.find(a => a.toLowerCase().indexOf(attr.toLowerCase()) >= 0);
            if (ak) {
              const vals = Object.keys(src.featureByAttr[ak] || {});
              const vk = vals.find(v => v === val)
                || vals.find(v => v.toLowerCase() === val.toLowerCase())
                || vals.find(v => v.toLowerCase().indexOf(val.toLowerCase()) >= 0);
              if (vk) hit = src.featureByAttr[ak][vk];
            }
          }
        }
        if (!hit || hit.lat == null || hit.lng == null) { fail('feature not found'); return; }
        flyToAndNotify(hit.lat, hit.lng, { addMarker: false })
          .then(r => aiToolReply(senderId, reqId, !!(r && r.success), { lat: hit.lat, lng: hit.lng }))
          .catch(e => fail(String(e)));
        return;
      }
      case 'setLayerVisible': {
        const l = aiFindLayer(args.layer);
        if (!l || !l.id) { fail('layer not found: ' + args.layer); return; }
        const vis = !!args.visible;
        const ok = setLayerVisibility(l.id, vis, false);
        // Keep the layer-list checkboxes in sync without a full re-render.
        try { postToUI({ action: 'aiLayerState', id: l.id, visible: vis }); } catch (e) {}
        aiToolReply(senderId, reqId, ok, { id: l.id, title: l.title, visible: vis });
        return;
      }
      case 'addGeoJsonLayer':
      case 'addTileLayer':
      case 'add3dTilesLayer': {
        const type = (name === 'addTileLayer') ? 'tiles' : (name === 'add3dTilesLayer' ? '3dtiles' : 'geojson');
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//i.test(url) && !/^data:/i.test(url)) { fail('url must be http(s) or data:'); return; }
        const zoom = {
          min: isFinite(Number(args.minLevel)) ? Number(args.minLevel) : null,
          max: isFinite(Number(args.maxLevel)) ? Number(args.maxLevel) : null
        };
        // addXyzLayer registers the id as plugin-added and re-renders the UI.
        const newId = addXyzLayer(url, String(args.title || ''), type, false, args.visible !== false, zoom);
        if (!newId) { fail('layers.add failed'); return; }
        aiToolReply(senderId, reqId, true, { id: newId, title: String(args.title || url) });
        return;
      }
      case 'removeLayer': {
        const l = aiFindLayer(args._layerId || args.layer);
        if (!l || !l.id) { fail('layer not found: ' + args.layer); return; }
        try {
          if (typeof reearth.layers.delete === 'function') reearth.layers.delete(l.id);
          else if (typeof reearth.layers.remove === 'function') reearth.layers.remove(l.id);
          else { fail('layers.delete unavailable'); return; }
          try { _pluginAddedLayerIds.delete(l.id); } catch (e) {}
          try { const gi = _pluginAddedGeojsonLayerIds.indexOf(l.id); if (gi >= 0) _pluginAddedGeojsonLayerIds.splice(gi, 1); } catch (e) {}
          try { safeShowUI('aiToolRequest:removeLayer'); } catch (e) {}
          aiToolReply(senderId, reqId, true, { id: l.id, title: l.title });
        } catch (e) { fail(String(e)); }
        return;
      }
      case 'createFlyPath': {
        const nm = String(args.name || '').trim();
        if (!nm) { fail('name required'); return; }
        if (_flyDrawnRouteNames.indexOf(nm) >= 0 || (_flyRoutes || []).some(r => String(r.title) === nm)) {
          fail('route name already exists: ' + nm); return;
        }
        let coords = args.coordinates;
        if (!Array.isArray(coords)) { fail('coordinates must be an array of [lng,lat,(height)]'); return; }
        coords = coords
          .map(c => (Array.isArray(c) && c.length >= 2 && isFinite(Number(c[0])) && isFinite(Number(c[1]))) ? c.slice(0, 3).map(Number) : null)
          .filter(c => c);
        if (coords.length < 2) { fail('at least 2 valid coordinates required'); return; }
        const props = { source: 'ai' };
        ['speed', 'height', 'pitch'].forEach(k => { if (isFinite(Number(args[k]))) props[k] = Number(args[k]); });
        if (args.loop !== undefined) props.loop = !!args.loop;
        if (typeof args.view === 'string' && args.view) props.view = args.view;
        // Route defaults must live at FeatureCollection.properties.fly — that is
        // what flyApplyProps reads when the route is loaded back.
        const flyProps = {};
        ['speed', 'height', 'pitch', 'loop', 'view'].forEach(k => { if (props[k] !== undefined) flyProps[k] = props[k]; });
        const g = { type: 'FeatureCollection', properties: { fly: flyProps }, features: [{ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } }] };
        try {
          if (reearth.data && reearth.data.clientStorage && typeof reearth.data.clientStorage.setAsync === 'function') {
            reearth.data.clientStorage.setAsync(FLY_ROUTE_STORAGE_PREFIX + nm, g);
          } else { fail('clientStorage unavailable'); return; }
        } catch (e) { fail('storage failed: ' + String(e)); return; }
        _flyDrawnRouteNames.push(nm);
        // Re-send drawn names so the route appears in the FLY tab select.
        try { flyPostInit(); } catch (e) {}
        aiToolReply(senderId, reqId, true, { name: nm, points: coords.length });
        return;
      }
      case 'deleteFlyPath': {
        const nm = String(args.name || '');
        const i = (_flyDrawnRouteNames || []).findIndex(d => String(d).toLowerCase() === nm.toLowerCase());
        if (i < 0) { fail('drawn route not found: ' + args.name); return; }
        const real = _flyDrawnRouteNames[i];
        try {
          if (reearth.data && reearth.data.clientStorage && typeof reearth.data.clientStorage.deleteAsync === 'function') {
            reearth.data.clientStorage.deleteAsync(FLY_ROUTE_STORAGE_PREFIX + real);
          }
        } catch (e) {}
        _flyDrawnRouteNames.splice(i, 1);
        try { postToUI({ action: 'flyRemoveDrawn', name: real }); } catch (e) {}
        aiToolReply(senderId, reqId, true, { deleted: real });
        return;
      }
      case 'vectorSearch': {
        // Text search over the vector feature index (port of kasugai's
        // vectorSearch tool). Returns attribute/value hits with lat/lng so the
        // AI can flyTo or open the Attr panel afterwards.
        if (!_vectorFeatureIndex) {
          try { buildVectorFeatureIndexFromLayers(); } catch (e) {}
        }
        const idx = _vectorFeatureIndex;
        if (!idx) { fail('vector index unavailable'); return; }
        const q = String(args.query || '').trim().toLowerCase();
        if (!q) { fail('query required'); return; }
        const limit = Math.max(1, Math.min(50, Number(args.limit) || 10));
        const attrFilter = (typeof args.attribute === 'string' && args.attribute.trim()) ? args.attribute.trim().toLowerCase() : null;
        const results = [];
        const scan = (src, layerTitle) => {
          if (!src || !src.featureByAttr) return;
          for (const a of Object.keys(src.featureByAttr)) {
            if (attrFilter && a.toLowerCase().indexOf(attrFilter) < 0) continue;
            const bucket = src.featureByAttr[a];
            for (const v of Object.keys(bucket)) {
              if (results.length >= limit) return;
              if ((String(v) + ' ' + String(a)).toLowerCase().indexOf(q) < 0) continue;
              const hit = bucket[v];
              results.push({ layer: layerTitle, attribute: a, value: v, lat: hit && hit.lat, lng: hit && hit.lng });
            }
          }
        };
        if (args.layer) {
          const n = String(args.layer).toLowerCase();
          const opt = (idx.layerOptions || []).find(o => String(o.title).toLowerCase() === n)
            || (idx.layerOptions || []).find(o => String(o.title).toLowerCase().indexOf(n) >= 0);
          if (!opt) { fail('layer not found: ' + args.layer); return; }
          const src = idx.layers && idx.layers[opt.id];
          scan(src, (src && src.title) || opt.title || opt.id);
        } else {
          for (const o of (idx.layerOptions || [])) {
            if (results.length >= limit) break;
            const src = idx.layers && idx.layers[o.id];
            scan(src, (src && src.title) || o.title || o.id);
          }
        }
        aiToolReply(senderId, reqId, true, { results: results, count: results.length });
        return;
      }
      case 'searchPlaces': {
        // Google hybrid search (Geocoding + Places Text Search) — the UI
        // iframe performs the fetch because the sandbox has no network.
        const q = String(args.query || '').trim();
        if (!q) { fail('query required'); return; }
        if (!_inspectorGoogleMapsApiKey) { fail('googleMapsApiKey not set (add "googleMapsApiKey: ..." to the plugin inspector)'); return; }
        const psId = 'ps' + (++_psSeq);
        _placesPending[psId] = { senderId: senderId, reqId: reqId };
        try { postToUI({ action: 'placesSearch', psId: psId, query: q, limit: args.limit }); }
        catch (e) {
          delete _placesPending[psId];
          fail(String(e));
        }
        return;
      }
      case 'addFlatGeobufLayer': {
        // Decode a .fgb file into a GeoJSON layer (UI iframe does the fetch +
        // decode; the reply arrives via 'fgbResult').
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//.test(url)) { fail('url required'); return; }
        loadFlatGeobufLayer(url, String(args.title || ''), args.visible !== false, null, args.limit, { senderId: senderId, reqId: reqId });
        return;
      }
      case 'addParquetLayer': {
        // Decode a GeoParquet file into a GeoJSON layer (UI iframe does the
        // fetch + hyparquet decode; the reply arrives via 'pqResult').
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//.test(url)) { fail('url required'); return; }
        loadParquetLayer(url, String(args.title || ''), args.visible !== false, null, args.limit, { senderId: senderId, reqId: reqId });
        return;
      }
      case 'addDuckDbLayer': {
        // SQL-pushdown query layer via DuckDB-Wasm in the UI iframe (partial
        // loading: where/limit/columns + covering bbox row-group skipping).
        const url = String(args.url || '').trim();
        if (!/^https?:\/\//.test(url)) { fail('url required'); return; }
        const toArr = (v) => Array.isArray(v) ? v.map(String) : (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : null);
        const spec = {
            url: url, title: String(args.title || ''), visible: args.visible !== false,
            where: args.where ? String(args.where) : null,
            limit: (Number.isFinite(Number(args.limit)) && Number(args.limit) > 0) ? Math.floor(Number(args.limit)) : null,
            geom: args.geom ? String(args.geom) : null,
            lon: args.lon ? String(args.lon) : null, lat: args.lat ? String(args.lat) : null,
            format: args.format ? String(args.format) : null,
            columns: toArr(args.columns), covering: toArr(args.covering),
            bboxAuto: (args.bbox === undefined || args.bbox === null) ? true : !!args.bbox
        };
        loadDuckDbLayer(spec, { senderId: senderId, reqId: reqId });
        return;
      }
      case 'setFlySettings': {
        // Change speed/AGL/pitch/loop/view of a fly route (port of kasugai's
        // setFlySettings). `agl` is an alias of `height` (above ground level).
        const settings = {};
        if (isFinite(Number(args.speed))) settings.speed = Number(args.speed);
        if (isFinite(Number(args.height))) settings.height = Number(args.height);
        if (isFinite(Number(args.agl))) settings.height = Number(args.agl);
        if (isFinite(Number(args.pitch))) settings.pitch = Number(args.pitch);
        if (args.loop !== undefined && args.loop !== null) settings.loop = !!args.loop;
        if (typeof args.view === 'string' && args.view) {
          settings.view = /^(center|chase|follow|3rd|third|aerial)$/i.test(args.view) ? 'center' : 'camera';
        }
        if (!Object.keys(settings).length) { fail('no settings given (speed|height|agl|pitch|loop|view)'); return; }
        let idx = null, drawn = null;
        const nm = (args.name !== undefined && args.name !== null && String(args.name).trim()) ? String(args.name).toLowerCase() : null;
        if (nm) {
          let j = (_flyRoutes || []).findIndex(r => String(r.title).toLowerCase() === nm);
          if (j < 0) j = (_flyRoutes || []).findIndex(r => String(r.title).toLowerCase().indexOf(nm) >= 0);
          if (j >= 0) idx = j;
          else {
            const d = (_flyDrawnRouteNames || []).find(x => String(x).toLowerCase() === nm)
              || (_flyDrawnRouteNames || []).find(x => String(x).toLowerCase().indexOf(nm) >= 0);
            if (d) drawn = d;
          }
          if (idx === null && !drawn) { fail('fly path not found: ' + args.name); return; }
        }
        // The FLY panel fields are the single source of truth — the UI applies
        // these into the inputs and the running flight immediately.
        try { postToUI({ action: 'flySetSettings', idx: idx, drawn: drawn, settings: settings }); } catch (e) {}
        // Persist drawn-route defaults into the stored GeoJSON (properties.fly)
        // so the new values survive a reload.
        if (drawn) {
          try {
            (async () => {
              try {
                const key = FLY_ROUTE_STORAGE_PREFIX + drawn;
                const g = await reearth.data.clientStorage.getAsync(key);
                if (g) {
                  const obj = (typeof g === 'string') ? JSON.parse(g) : g;
                  obj.properties = obj.properties || {};
                  obj.properties.fly = Object.assign({}, obj.properties.fly || {}, settings);
                  await reearth.data.clientStorage.setAsync(key, obj);
                }
              } catch (e) {}
            })();
          } catch (e) {}
        }
        aiToolReply(senderId, reqId, true, { name: drawn || (idx !== null && _flyRoutes[idx] ? _flyRoutes[idx].title : null), applied: settings });
        return;
      }
      case 'showPanel': {
        const panelMap = {
          layers: 'layers-panel', legend: 'legend-panel', search: 'search-panel',
          attr: 'attr-panel', cams: 'cams-panel', display: 'settings-panel',
          settings: 'settings-panel', info: 'info-panel', fly: 'fly-panel',
          share: 'share-panel', manage: 'manage-panel'
        };
        const key = String(args.panel || '').toLowerCase().trim();
        const panelId = panelMap[key];
        if (!panelId) { fail('unknown panel: ' + args.panel + ' (layers|legend|search|attr|cams|display|info|fly|share|manage)'); return; }
        postToUI({ action: 'activateTab', tab: panelId });
        aiToolReply(senderId, reqId, true, { panel: key });
        return;
      }
      case 'showInfo': {
        const url = (typeof args.url === 'string') ? args.url.trim() : '';
        if (url) {
          if (!/^https?:\/\//i.test(url)) { fail('url must be http(s)'); return; }
          try { _lastInfoUrl = url; loadInfoUrl(url); } catch (e) {}
        } else if (_lastInfoUrl) {
          try { loadInfoUrl(_lastInfoUrl); } catch (e) {}
        }
        postToUI({ action: 'activateTab', tab: 'info-panel' });
        aiToolReply(senderId, reqId, true, { url: url || _lastInfoUrl || null });
        return;
      }
      case 'listLegends':
        aiToolReply(senderId, reqId, true, (_inspectorLegendItems || []).map(it => ({ group: it.group || 'Default', url: it.url })));
        return;
      case 'showFeatureAttributes': {
        if (!_vectorFeatureIndex) {
          try { buildVectorFeatureIndexFromLayers(); } catch (e) {}
        }
        const idx = _vectorFeatureIndex;
        if (!idx) { fail('vector index unavailable'); return; }
        let layerId = '__all__';
        if (args.layer) {
          const n = String(args.layer).toLowerCase();
          const opt = (idx.layerOptions || []).find(o => String(o.title).toLowerCase() === n)
            || (idx.layerOptions || []).find(o => String(o.title).toLowerCase().indexOf(n) >= 0);
          if (!opt) { fail('layer not found: ' + args.layer); return; }
          layerId = opt.id;
        }
        const attr = String(args.attribute || '');
        const val = String(args.value === undefined || args.value === null ? '' : args.value);
        const hit = aiFindFeature(idx, layerId, attr, val);
        if (!hit) { fail('feature not found'); return; }
        const props = aiFeatureProps(hit.src, hit.attr, hit.val) || { [hit.attr]: hit.val };
        // Reuse the Attr panel's featureSelected flow (auto-opens the Attr tab).
        try {
          postToUI({
            action: 'featureSelected',
            properties: props,
            layerId: (layerId !== '__all__') ? layerId : 'ai',
            featureId: 'ai-feature',
            attrUrlOpen: _inspectorAttrUrlOpen
          });
        } catch (e) {}
        if (args.fly === false) {
          aiToolReply(senderId, reqId, true, { properties: props, lat: hit.lat, lng: hit.lng });
        } else {
          flyToAndNotify(hit.lat, hit.lng, { addMarker: false })
            .then(r => aiToolReply(senderId, reqId, !!(r && r.success), { properties: props, lat: hit.lat, lng: hit.lng }))
            .catch(e => fail(String(e)));
        }
        return;
      }
      case 'getInspectorText': {
        let text = '';
        try {
          const prop = (reearth.extension.widget && reearth.extension.widget.property) || (reearth.extension.block && reearth.extension.block.property) || {};
          text = (prop.settings && prop.settings.inspectorText) || prop.inspectorText || '';
        } catch (e) {}
        aiToolReply(senderId, reqId, true, { text: (typeof text === 'string') ? text : '' });
        return;
      }
      case 'applyInspectorText': {
        const newText = (typeof args.text === 'string') ? args.text : '';
        try {
          if (reearth.extension && reearth.extension.widget && typeof reearth.extension.widget.setPropertyValue === 'function') {
            reearth.extension.widget.setPropertyValue('settings', 'inspectorText', newText);
          }
          // Skip re-processing the text we just wrote via the inspector poll.
          _lastInspectorLayersJson = newText;
          processInspectorText(newText);
          try { postToUI({ action: 'manageTextApplied' }); } catch (e) {}
          aiToolReply(senderId, reqId, true, { applied: true });
        } catch (e) { fail(String(e)); }
        return;
      }
      case 'setDepthTest': {
        const en = !!args.enabled;
        const bg = _lastInspectorBackground || '#ffffff';
        reearth.viewer.overrideProperty({
          globe: { depthTestAgainstTerrain: en, baseColor: bg },
        });
        try { postToUI({ action: 'depthTestState', enabled: en }); } catch (e) {}
        aiToolReply(senderId, reqId, true, { enabled: en });
        return;
      }
      case 'setGeojsonDrape': {
        const next = normalizeClassification(args.classification);
        if (!next) { fail('invalid classification (3dtiles|terrain|both)'); return; }
        _geojsonClassification = next;
        try { applyGeojsonDrapeToAll(); } catch (e) {}
        try { postToUI({ action: 'geojsonDrapeState', classification: next }); } catch (e) {}
        aiToolReply(senderId, reqId, true, { classification: next });
        return;
      }
      case 'setBackground': {
        const col = String(args.color || '').trim();
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(col)) { fail('color must be #rgb, #rrggbb or #rrggbbaa'); return; }
        _lastInspectorBackground = col;
        reearth.viewer.overrideProperty({
          globe: { baseColor: col },
          scene: { backgroundColor: col },
        });
        aiToolReply(senderId, reqId, true, { color: col });
        return;
      }
      default:
        fail('unknown tool: ' + name);
        return;
    }
  } catch (e) {
    fail(String((e && e.message) || e));
  }
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
  try { _flyRoutes = []; } catch(e) {}
  // Handle various newline formats
  const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
  // reset inspector-sourced yahooAppId each time we parse inspector text
  try { _inspectorYahooAppId = null; } catch(e) {}
  try { _inspectorGoogleMapsApiKey = null; } catch(e) {}
  try { _inspectorGeminiApiKey = null; } catch(e) {}
  try { _inspectorGeminiModel = null; } catch(e) {}
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

    // Google Maps Platform key for Places search and Street View pano
    // verification: "googleMapsApiKey: KEY" (same exposure caveat as yahooAppId).
    if (/^googlemapsapikey\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim();
        if (val) {
          _inspectorGoogleMapsApiKey = val;
          try { sendLog('[processInspectorText] found inspector googleMapsApiKey'); } catch(e){}
        }
      } catch(e){}
      nonCamLines.push(line);
      return;
    }

    // Inspector-provided Gemini API key for the ai-chat widget: "geminiApiKey: KEY"
    if (/^geminiapikey\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim();
        if (val) {
          _inspectorGeminiApiKey = val;
          try { sendLog('[processInspectorText] found inspector geminiApiKey'); } catch(e){}
        }
      } catch(e){}
      nonCamLines.push(line);
      return;
    }

    // Optional Gemini model override for the ai-chat widget: "geminiModel: gemini-..."
    if (/^geminimodel\s*:/i.test(lowerLine)) {
      try {
        const val = line.substring(line.indexOf(':') + 1).trim();
        if (val) _inspectorGeminiModel = val;
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

    // Fly route (ported from kasugai_canvas):
    // "fly_geojson: 名前 | URL | speed=30 | height=0 | pitch=-10 | loop=true | view=camera|center | step=100"
    // view aliases: camera = ride-on POV (pov, fpv, first, 1st, ride); center = aerial chase (chase, follow, 3rd, third, aerial)
    // `route:<name>` as URL references a drawn route kept in reearth.data.clientStorage.
    if (lowerLine.startsWith('fly_geojson:')) {
        try {
            const content = line.substring(line.indexOf(':') + 1).trim();
            if (content) {
                const parts = content.split('|').map(p => p.trim());
                const title = parts[0];
                const url = parts[1];
                if (url) {
                    const cfg = { title: title || url, url: url, speed: 30, height: 0, pitch: -10, loop: false, step: 100, view: 'camera' };
                    const off = parts.some(part => /^(off|false)$/i.test(part));
                    parts.slice(2).forEach(part => {
                        const eq = part.indexOf('=');
                        if (eq < 0) {
                            if (/^loop$/i.test(part))
                                cfg.loop = true;
                            return;
                        }
                        const key = part.slice(0, eq).trim().toLowerCase();
                        const raw = part.slice(eq + 1).trim();
                        const num = Number(raw);
                        if ((key === 'speed' || key === 's') && Number.isFinite(num) && num !== 0)
                            cfg.speed = num;
                        if ((key === 'height' || key === 'h') && Number.isFinite(num))
                            cfg.height = num;
                        if ((key === 'pitch' || key === 'p') && Number.isFinite(num))
                            cfg.pitch = num;
                        if (key === 'step' && Number.isFinite(num) && num > 0)
                            cfg.step = num;
                        if (key === 'loop' || key === 'l')
                            cfg.loop = /^(true|1|on|yes)$/i.test(raw);
                        if (key === 'view' || key === 'v')
                            // center = aerial chase view; anything else (camera, pov, fpv, first, 1st, ride) = ride-on POV
                            cfg.view = /^(center|chase|follow|3rd|third|aerial)$/i.test(raw) ? 'center' : 'camera';
                    });
                    if (!off)
                        _flyRoutes.push(cfg);
                }
            }
        }
        catch (e) {
            try {
                sendError('[processInspectorText] fly_geojson parse error:', e);
            }
            catch (_) { }
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
      let style = null;
      const sm = geoStr.match(/(?:^|\|)\s*(?:style|qml)=(\S+)/i);
      if (sm) style = sm[1].trim();
      if (url) tiles.push({ url, title, type: 'geojson', visible, classification, style });
      nonCamLines.push(line);
      return;
    }

    // FlatGeobuf (decoded to GeoJSON in the UI iframe via CDN module, then
    // added through the normal geojson layer path).
    // Syntax: flatgeobuf: title | url | on/off | classification
    if (lowerLine.startsWith('flatgeobuf:') || lowerLine.startsWith('fgb:')) {
      const fgbStr = line.substring(line.indexOf(':') + 1).trim();
      let url = null;
      let title = null;
      let visible = true;
      let classification = null;
      if (fgbStr.indexOf('|') !== -1) {
        const parts = fgbStr.split('|').map(p => p.trim());
        visible = extractVisible(parts);
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
        if (parts.length > 3 && parts[3]) classification = normalizeClassification(parts[3]);
      } else {
        if (fgbStr.startsWith('http')) url = fgbStr;
      }
      let fgbStyle = null;
      const fgbSm = fgbStr.match(/(?:^|\|)\s*(?:style|qml)=(\S+)/i);
      if (fgbSm) fgbStyle = fgbSm[1].trim();
      if (url) tiles.push({ url, title, type: 'flatgeobuf', visible, classification, style: fgbStyle });
      nonCamLines.push(line);
      return;
    }

    // GeoParquet (decoded to GeoJSON in the UI iframe via CDN hyparquet, then
    // added through the normal geojson layer path).
    // Syntax: parquet: title | url | on/off | classification
    if (lowerLine.startsWith('parquet:') || lowerLine.startsWith('geoparquet:')) {
      const pqStr = line.substring(line.indexOf(':') + 1).trim();
      let url = null;
      let title = null;
      let visible = true;
      let classification = null;
      if (pqStr.indexOf('|') !== -1) {
        const parts = pqStr.split('|').map(p => p.trim());
        visible = extractVisible(parts);
        if (parts[0].startsWith('http')) { url = parts[0]; title = parts[1]; }
        else if (parts[1] && parts[1].startsWith('http')) { title = parts[0]; url = parts[1]; }
        if (parts.length > 3 && parts[3]) classification = normalizeClassification(parts[3]);
      } else {
        if (pqStr.startsWith('http')) url = pqStr;
      }
      let pqStyle = null;
      const pqSm = pqStr.match(/(?:^|\|)\s*(?:style|qml)=(\S+)/i);
      if (pqSm) pqStyle = pqSm[1].trim();
      if (url) tiles.push({ url, title, type: 'parquet', visible, classification, style: pqStyle });
      nonCamLines.push(line);
      return;
    }

    // DuckDB-Wasm query layer (kasugai duckdb: port). SQL pushdown and
    // covering-bbox predicates enable Parquet row-group skipping over HTTP
    // Range requests — partial loading for large files. bbox=auto (default)
    // re-queries on camera move.
    // Syntax: duckdb: 名前 | URL | where=.. | limit=.. | format=parquet|csv|json |
    //         geom=.. | lon=.. | lat=.. | columns=a,b | covering=xmin,xmax,ymin,ymax |
    //         bbox=auto|off | on/off | classification
    if (lowerLine.startsWith('duckdb:')) {
      const ddStr = line.substring(line.indexOf(':') + 1).trim();
      const parts = ddStr.split('|').map(p => p.trim());
      const title = parts[0] || null;
      const url = (parts[1] && /^https?:\/\//.test(parts[1])) ? parts[1] : null;
      let visible = true;
      let classification = null;
      const opt = {};
      for (let i = 2; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        const eq = part.indexOf('=');
        if (eq < 0) {
          if (/^(off|false)$/i.test(part)) visible = false;
          else if (/^(on|true)$/i.test(part)) visible = true;
          else classification = normalizeClassification(part) || classification;
          continue;
        }
        const key = part.slice(0, eq).trim().toLowerCase();
        const raw = part.slice(eq + 1).trim();
        if (!raw) continue;
        if (key === 'where') opt.where = raw;
        else if (key === 'geom' || key === 'geometry') opt.geom = raw;
        else if (key === 'lon' || key === 'lng') opt.lon = raw;
        else if (key === 'lat') opt.lat = raw;
        else if (key === 'format') opt.format = raw;
        else if (key === 'columns' || key === 'cols') opt.columns = raw.split(',').map(s => s.trim()).filter(Boolean);
        else if (key === 'covering') opt.covering = raw.split(',').map(s => s.trim()).filter(Boolean);
        else if (key === 'bbox') {
          if (/^(auto|on|true|view|viewport)$/i.test(raw)) opt.bboxAuto = true;
          else if (/^(off|none|false|static|manual)$/i.test(raw)) opt.bboxAuto = false;
        }
        else if (key === 'limit' && Number.isInteger(Number(raw)) && Number(raw) > 0) opt.limit = Math.floor(Number(raw));
        else if (key === 'classification' || key === 'class') classification = normalizeClassification(raw) || classification;
        else if (key === 'style' || key === 'qml') opt.style = raw;
        else if (key === 'table') opt.table = raw;
      }
      // Viewport-linked partial loading is the default; bbox=off disables it.
      if (opt.bboxAuto === undefined) opt.bboxAuto = true;
      if (url) tiles.push({ url, title, type: 'duckdb', visible, classification, ddb: opt });
      nonCamLines.push(line);
      return;
    }

    // GeoPackage layer (kasugai gpkg: port). Decoded via sql.js in the UI iframe.
    // Syntax: gpkg: 名前 | URL | 出典 | table=.. | where=.. | limit=.. | columns=a,b |
    //         bbox=auto|off | style=.. | classification | on/off
    // bbox=auto (viewport-linked re-query) is the default; bbox=off always loads all.
    if (lowerLine.startsWith('gpkg:') || lowerLine.startsWith('geopackage:')) {
      const gpStr = line.substring(line.indexOf(':') + 1).trim();
      const parts = gpStr.split('|').map(p => p.trim());
      const title = parts[0] || null;
      const url = (parts[1] && /^https?:\/\//.test(parts[1])) ? parts[1] : null;
      let visible = true;
      let classification = null;
      const opt = {};
      // parts[2] is the attribution slot; if it is key=value it is an option instead.
      const attrField = (parts[2] && parts[2].indexOf('=') < 0 && !/^(on|off|true|false)$/i.test(parts[2])) ? parts[2] : null;
      for (let i = attrField ? 3 : 2; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        const eq = part.indexOf('=');
        if (eq < 0) {
          if (/^(off|false)$/i.test(part)) visible = false;
          else if (/^(on|true)$/i.test(part)) visible = true;
          else classification = normalizeClassification(part) || classification;
          continue;
        }
        const key = part.slice(0, eq).trim().toLowerCase();
        const raw = part.slice(eq + 1).trim();
        if (!raw) continue;
        if (key === 'where') opt.where = raw;
        else if (key === 'table') opt.table = raw;
        else if (key === 'columns' || key === 'cols') opt.columns = raw.split(',').map(s => s.trim()).filter(Boolean);
        else if (key === 'bbox') {
          if (/^(auto|on|true|view|viewport)$/i.test(raw)) opt.bboxAuto = true;
          else if (/^(off|none|false|static|manual)$/i.test(raw)) opt.bboxAuto = false;
        }
        else if (key === 'limit' && Number.isInteger(Number(raw)) && Number(raw) > 0) opt.limit = Math.floor(Number(raw));
        else if (key === 'classification' || key === 'class') classification = normalizeClassification(raw) || classification;
        else if (key === 'style' || key === 'qml') opt.style = raw;
      }
      if (opt.bboxAuto === undefined) opt.bboxAuto = true;
      if (url) tiles.push({ url, title, type: 'gpkg', visible, classification, gpkg: opt });
      nonCamLines.push(line);
      return;
    }

    // Arbitrary SELECT query layer (kasugai sql: port). Executed by DuckDB-Wasm
    // in the UI iframe; the result geometry column is drawn as GeoJSON.
    // Syntax: sql: 名前 | SELECT ...   (trailing "| off" hides; the query itself may contain |)
    // A :bbox placeholder in the query is replaced by the viewport envelope on each camera move.
    if (lowerLine.startsWith('sql:')) {
      const sValue = line.substring(line.indexOf(':') + 1).trim();
      const firstSep = sValue.indexOf('|');
      const title = firstSep < 0 ? '' : sValue.slice(0, firstSep).trim();
      let query = firstSep < 0 ? '' : sValue.slice(firstSep + 1).trim();
      let visible = true;
      const tailRe = /\|\s*(off|false|style\s*=\s*[^|]*)\s*$/i;
      let tail, sStyle = null;
      while ((tail = tailRe.exec(query))) {
        const seg = tail[1].trim();
        const sm = /^style\s*=\s*(.*)$/i.exec(seg);
        if (sm) sStyle = sm[1].trim();
        else if (/^(off|false)$/i.test(seg)) visible = false;
        else break;
        query = query.slice(0, tail.index).trim();
      }
      if (title && query) {
        tiles.push({ type: 'sql', title, query, visible, classification: null, style: sStyle });
      }
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
    if (_qmlStyledLayerIds.has(id)) return;
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
    if (type === 'flatgeobuf' || type === 'parquet') {
      // Decoded-to-geojson layers carry data.value (no data.url) so the
      // url-based dup check above cannot see them — dedupe on the resolved
      // title instead.
      const vecLabel = (type === 'parquet') ? 'GeoParquet' : 'FlatGeobuf';
      const vecTitle = t || (vecLabel + ': ' + u);
      if (existing.find(l => l && l.title === vecTitle)) {
        try { sendLog('[addXyzLayersFromArray] skip duplicate ' + type + ':', u); } catch(e){}
        continue;
      }
      if (type === 'parquet') loadParquetLayer(u, vecTitle, visible, it.classification, it.limit, null, it.style);
      else loadFlatGeobufLayer(u, vecTitle, visible, it.classification, it.limit, null, it.style);
      continue;
    }
    if (type === 'duckdb') {
      const ddTitle = t || ('DuckDB: ' + u);
      if (existing.find(l => l && l.title === ddTitle)) {
        try { sendLog('[addXyzLayersFromArray] skip duplicate duckdb:', u); } catch(e){}
        continue;
      }
      const spec = Object.assign({ url: u, title: ddTitle, visible: visible, classification: it.classification }, it.ddb || {});
      loadDuckDbLayer(spec, null);
      continue;
    }
    if (type === 'gpkg') {
      const gpTitle = t || ('GeoPackage: ' + u);
      if (existing.find(l => l && l.title === gpTitle)) {
        try { sendLog('[addXyzLayersFromArray] skip duplicate gpkg:', u); } catch(e){}
        continue;
      }
      const spec = Object.assign({ url: u, title: gpTitle, visible: visible, classification: it.classification }, it.gpkg || {});
      loadGpkgLayer(spec, null);
      continue;
    }
    if (type === 'sql') {
      const sqTitle = it.title || 'SQL query';
      if (existing.find(l => l && l.title === sqTitle)) {
        try { sendLog('[addXyzLayersFromArray] skip duplicate sql:', sqTitle); } catch(e){}
        continue;
      }
      loadSqlLayer({ query: it.query, title: sqTitle, visible: visible, classification: it.classification, style: it.style || null, bboxAuto: /:bbox\b/i.test(it.query || '') }, null);
      continue;
    }
    addXyzLayer(u, t, type, isBase, visible, zoom, it.attribution, it.classification, it.style);
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
