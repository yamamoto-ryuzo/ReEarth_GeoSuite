// @ts-nocheck
// Basemap selector and attribution widget
// Reads basemap layers already added to the scene and shows a selector at the bottom-left.
declare const reearth: any;

function sendLog(...args: any[]): void {
  try { console.log.apply(console, args); } catch (e) {}
}

function sendError(...args: any[]): void {
  try { console.error.apply(console, args); } catch (e) {}
}

function postToUI(msg: any): void {
  try {
    if (reearth && reearth.ui && typeof reearth.ui.postMessage === 'function') {
      reearth.ui.postMessage(msg);
      return;
    }
  } catch (e) {}
  try {
    if (typeof window !== 'undefined' && (window as any).parent && typeof (window as any).parent.postMessage === 'function') {
      (window as any).parent.postMessage(msg, '*');
      return;
    }
  } catch (e) {}
  try {
    if (typeof (globalThis as any).parent !== 'undefined' && (globalThis as any).parent && typeof (globalThis as any).parent.postMessage === 'function') {
      (globalThis as any).parent.postMessage(msg, '*');
    }
  } catch (e) {}
}

function encodeNonAscii(u: string): string {
  try {
    if (!u || typeof u !== 'string') return u;
    return u.replace(/[\u0080-\uFFFF]/g, (c) => encodeURIComponent(c));
  } catch (e) {
    return u;
  }
}

function tryDecode(u: string): string {
  try { return decodeURIComponent(u); } catch (e) { return u; }
}

function urlsEqual(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const da = tryDecode(a || '');
    const db = tryDecode(b || '');
    if (da === db) return true;
    const ea = encodeNonAscii(da);
    const eb = encodeNonAscii(db);
    return ea === eb;
  } catch (e) {
    return false;
  }
}

function normalizeLayers(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    try { return Object.values(raw); } catch (e) { return []; }
  }
  return [];
}

function findLayerPanelWidgetId(): string | null {
  try {
    const list = (reearth && reearth.extension && reearth.extension.list) || [];
    const target = list.find((ex: any) => ex && ex.extensionId === 'layers-and-tiles-list');
    return target ? target.id : null;
  } catch (e) { return null; }
}

function postToLayerPanel(msg: any): void {
  const targetId = _layerPanelId || findLayerPanelWidgetId();
  if (!targetId) return;
  try {
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, msg);
    }
  } catch (e) {}
}

function requestBaseList(): void {
  try {
    _layerPanelId = findLayerPanelWidgetId();
    if (_layerPanelId) postToLayerPanel({ action: 'requestBaseList' });
  } catch (e) {}
}

let _lastBasemapsHash = '';
let _parsedBaseTiles: any[] = [];
// null = no selection yet (auto-select first base entry); '' = user selected "(なし)"
let _lastSelectedBasemapUrl: string | null = null;
let _layerPanelId: string | null = null;

const BASEMAP_TILE_ID = 'geo-suite-basemap';

function sendBasemapsToUI(): void {
  try {
    const items = _parsedBaseTiles.map((b: any) => ({
      url: b.encodedUrl || encodeNonAscii(b.url),
      title: b.title,
      attribution: b.attribution
    }));
    let selectedUrl = (_lastSelectedBasemapUrl !== null) ? _lastSelectedBasemapUrl : (items[0] ? items[0].url : '');
    const hash = JSON.stringify(items) + '|' + selectedUrl;
    if (hash === _lastBasemapsHash) return;
    _lastBasemapsHash = hash;
    postToUI({ action: 'basemaps', items: items, selectedUrl: selectedUrl });
  } catch (e) {
    sendError('[sendBasemapsToUI] error:', e);
  }
}

// Hide legacy basemap layers added by older versions of this plugin (they were
// regular tile layers marked with data.isBasemap and rendered above overlays).
function hideLegacyBasemapLayers(): void {
  try {
    const all = (reearth && reearth.layers && reearth.layers.layers) ? reearth.layers.layers : [];
    const arr = normalizeLayers(all);
    arr.forEach((l: any) => {
      if (!l || !l.data || !l.data.isBasemap || !l.id) return;
      try {
        if (typeof reearth.layers.hide === 'function') reearth.layers.hide(l.id);
        else if (typeof reearth.layers.override === 'function') reearth.layers.override(l.id, { visible: false });
      } catch (e) {}
    });
  } catch (e) {}
}

// Switch the basemap via the viewer property `tiles` (Re:Earth's official
// basemap mechanism). Scene tiles are always kept at the BOTTOM of Cesium's
// imagery layer collection by the engine, so overlay tile layers added by the
// layer panel are never hidden — regardless of when the basemap is switched.
function showBasemapByUrl(url: string | null): void {
  if (url === null || url === undefined) return;
  _lastSelectedBasemapUrl = url;
  try {
    const tiles: any[] = [];
    if (url !== '') {
      const entry = _parsedBaseTiles.find((b: any) => urlsEqual(b.encodedUrl, url) || urlsEqual(b.url, url));
      const encodedUrl = entry ? entry.encodedUrl : encodeNonAscii(url);
      const tile: any = { id: BASEMAP_TILE_ID, type: 'url', url: encodedUrl };
      const minL = (entry && typeof entry.minLevel === 'number' && !isNaN(entry.minLevel)) ? entry.minLevel : null;
      let maxL = (entry && typeof entry.maxLevel === 'number' && !isNaN(entry.maxLevel)) ? entry.maxLevel : null;
      if (maxL === null) maxL = defaultMaxLevelForUrl(encodedUrl);
      if (maxL !== null) tile.zoomLevelForURL = [minL !== null ? minL : 0, maxL];
      else if (minL !== null) tile.zoomLevelForURL = [minL];
      tiles.push(tile);
    }
    if (reearth && reearth.viewer && typeof reearth.viewer.overrideProperty === 'function') {
      reearth.viewer.overrideProperty({ tiles: tiles });
    } else {
      sendError('[showBasemapByUrl] reearth.viewer.overrideProperty is not available');
    }
    hideLegacyBasemapLayers();
  } catch (e) {
    sendError('[showBasemapByUrl] error:', e);
  }
}

function defaultMaxLevelForUrl(url: string): number | null {
  try {
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\/(gazo[1-4]|ort_old10|ort_riku10)\//.test(url)) return 17;
    if (/cyberjapandata\.gsi\.go\.jp\/xyz\//.test(url)) return 18;
    if (/tile\.openstreetmap\.org\//.test(url)) return 19;
  } catch (e) {}
  return null;
}

function applyBaseList(items: any[]): void {
  if (!Array.isArray(items)) return;
  try {
    _parsedBaseTiles = items.map((b: any) => {
      const url = (b && b.url) ? String(b.url) : '';
      const title = (b && b.title) ? String(b.title) : '';
      const attribution = (b && b.attribution) ? String(b.attribution) : '';
      const encodedUrl = encodeNonAscii(url);
      return { url, encodedUrl, title, attribution, minLevel: (b && typeof b.minLevel === 'number') ? b.minLevel : null, maxLevel: (b && typeof b.maxLevel === 'number') ? b.maxLevel : null };
    }).filter((b: any) => b.url);
    if (!_parsedBaseTiles.length) return;

    if (_lastSelectedBasemapUrl === null && _parsedBaseTiles[0]) {
      _lastSelectedBasemapUrl = _parsedBaseTiles[0].encodedUrl;
    }
    showBasemapByUrl(_lastSelectedBasemapUrl);
    _lastBasemapsHash = '';
    sendBasemapsToUI();
  } catch (e) {
    sendError('[applyBaseList] error:', e);
  }
}

const GEO_I18N: { [key: string]: { [key: string]: string } } = {
  "en": {"none":"(None)","openInGoogleEarth":"Open current view in Google Earth","hubPromoExt":"Ext","hubPromoNote":"Optional component: geosuite-hub is not running. Install it once to speed up vector layers, lift the 4MB limit, and unlock AI bridge providers.","hubPromoBtn":"Download geosuite-hub.zip","hubPromoWait":"Downloaded. Extract the zip and run geosuite-hub.exe — waiting for the hub…","hubPromoOk":"geosuite-hub detected","hubPromoRetry":"Still not detected — extract the downloaded zip and run geosuite-hub.exe.","hubPromoSteps":"Steps: 1) Download geosuite-hub.zip  2) Extract it  3) Run geosuite-hub.exe — auto-installs geosuite-hub + the geosuite-hub:// protocol (no admin needed).","hubPromoPrompt":"If the browser shows a local network access prompt, click Allow — it unblocks geosuite-hub for this site.","hubPromoView":"Open in GeoSuite viewer","hubPromoViewTitle":"Requires one-time geosuite-hub:// registration (run geosuite-hub.exe)","closeAria":"Close","canvasTitle":"Open scene in KASUGAI Canvas","canvasNote":"Export the current scene (.kasc) and open it in KASUGAI Canvas. One-click open requires the local geosuite-hub.","canvasOpen":"Open in KASUGAI Canvas","canvasDl":"Download .kasc","canvasHosted":"Hosted Canvas (view only)","canvasInstall":"Download Canvas installer","canvasStCheck":"Checking KASUGAI Canvas…","canvasStRun":"Canvas detected - switching project","canvasStInst":"Canvas installed - launching","canvasStMiss":"Canvas not installed","canvasStNoHub":"geosuite-hub not detected - one-click open needs the hub (see Ext) or use Download .kasc","canvasStOpen":"Opened in KASUGAI Canvas","canvasStBuild":"Building .kasc…","canvasSaved":".kasc saved - open the file to launch Canvas"},
  "ja": {"none":"(なし)","openInGoogleEarth":"Google Earth で現在の表示を開く","hubPromoExt":"拡張","hubPromoNote":"拡張コンポーネント: geosuite-hub が未検出です。1回導入するとベクターレイヤーが高速化し、4MB 制限が解除され、AI ブリッジ系プロバイダも使えます。","hubPromoBtn":"geosuite-hub.zip をダウンロード","hubPromoWait":"ダウンロードしました。ZIP を展開して geosuite-hub.exe を実行してください — ハブを待機中…","hubPromoOk":"geosuite-hub を検出しました","hubPromoRetry":"まだ未検出です — ダウンロードした ZIP を展開して geosuite-hub.exe を実行してください。","hubPromoSteps":"手順: ① geosuite-hub.zip をダウンロード → ② 展開 → ③ geosuite-hub.exe を実行（geosuite-hub＋プロトコルを自動インストール・管理者権限不要）","hubPromoPrompt":"ブラウザにローカルネットワーク接続の許可プロンプトが表示されたら「許可」を押してください — このサイトで geosuite-hub が使えるようになります。","hubPromoView":"GeoSuite viewer で開く","hubPromoViewTitle":"geosuite-hub:// の登録が必要です（geosuite-hub.exe を実行）","closeAria":"閉じる","canvasTitle":"シーンを KASUGAI Canvas で開く","canvasNote":"現在のシーンを .kasc プロジェクトとして出力し、KASUGAI Canvas で開きます。ワンクリック起動にはローカルの geosuite-hub が必要です。","canvasOpen":"KASUGAI Canvas で開く","canvasDl":".kasc をダウンロード","canvasHosted":"ホスト版 Canvas（表示のみ）","canvasInstall":"Canvas インストーラーをダウンロード","canvasStCheck":"KASUGAI Canvas を確認中…","canvasStRun":"Canvas 検出 — プロジェクトを切り替えます","canvasStInst":"Canvas 導入済み — 起動します","canvasStMiss":"Canvas が未インストールです","canvasStNoHub":"geosuite-hub 未検出 — ワンクリック起動にはハブ（Ext 参照）か .kasc ダウンロードを利用してください","canvasStOpen":"KASUGAI Canvas で開きました","canvasStBuild":".kasc を生成中…","canvasSaved":".kasc を保存しました — ファイルを開くと Canvas が起動します"},
  "zh-CN": {"none":"（无）","openInGoogleEarth":"在 Google 地球中打开当前视图","hubPromoExt":"扩展","hubPromoNote":"可选组件：未检测到 geosuite-hub。安装一次即可加速矢量图层、解除 4MB 限制，并启用 AI 桥接提供程序。","hubPromoBtn":"下载 geosuite-hub.zip","hubPromoWait":"已下载。解压 ZIP 并运行 geosuite-hub.exe — 正在等待桥接中心…","hubPromoOk":"已检测到 geosuite-hub","hubPromoRetry":"仍未检测到 — 请解压已下载的 ZIP 并运行 geosuite-hub.exe。","hubPromoSteps":"步骤：1) 下载 geosuite-hub.zip → 2) 解压 → 3) 运行 geosuite-hub.exe（自动安装 geosuite-hub＋协议·无需管理员权限）","hubPromoPrompt":"如果浏览器显示本地网络访问提示，请点击\"允许\"— 即可在此站点启用 geosuite-hub。","hubPromoView":"在 GeoSuite viewer 中打开","hubPromoViewTitle":"需要一次性注册 geosuite-hub://（运行 geosuite-hub.exe）","closeAria":"关闭","canvasTitle":"在 KASUGAI Canvas 中打开场景","canvasNote":"将当前场景导出为 .kasc 并在 KASUGAI Canvas 中打开。一键打开需要本地 geosuite-hub。","canvasOpen":"在 KASUGAI Canvas 中打开","canvasDl":"下载 .kasc","canvasHosted":"托管版 Canvas（仅查看）","canvasInstall":"下载 Canvas 安装程序","canvasStCheck":"正在检查 KASUGAI Canvas…","canvasStRun":"检测到 Canvas — 正在切换项目","canvasStInst":"已安装 Canvas — 正在启动","canvasStMiss":"未安装 Canvas","canvasStNoHub":"未检测到 geosuite-hub — 一键打开需要该组件（见 Ext），或使用下载 .kasc","canvasStOpen":"已在 KASUGAI Canvas 中打开","canvasStBuild":"正在生成 .kasc…","canvasSaved":".kasc 已保存 — 打开文件即可启动 Canvas"},
  "zh-TW": {"none":"（無）","openInGoogleEarth":"在 Google 地球中開啟目前檢視","hubPromoExt":"擴充","hubPromoNote":"可選元件：未偵測到 geosuite-hub。安裝一次即可加速向量圖層、解除 4MB 限制，並啟用 AI 橋接提供者。","hubPromoBtn":"下載 geosuite-hub.zip","hubPromoWait":"已下載。解壓縮 ZIP 並執行 geosuite-hub.exe — 正在等待橋接中心…","hubPromoOk":"已偵測到 geosuite-hub","hubPromoRetry":"仍未偵測到 — 請解壓縮已下載的 ZIP 並執行 geosuite-hub.exe。","hubPromoSteps":"步驟：1) 下載 geosuite-hub.zip → 2) 解壓縮 → 3) 執行 geosuite-hub.exe（自動安裝 geosuite-hub＋協定·無需管理員權限）","hubPromoPrompt":"如果瀏覽器顯示本機網路存取提示，請點擊「允許」— 即可在此網站啟用 geosuite-hub。","hubPromoView":"在 GeoSuite viewer 中開啟","hubPromoViewTitle":"需要一次性註冊 geosuite-hub://（執行 geosuite-hub.exe）","closeAria":"關閉","canvasTitle":"在 KASUGAI Canvas 中開啟場景","canvasNote":"將目前場景匯出為 .kasc 並在 KASUGAI Canvas 中開啟。一鍵開啟需要本機 geosuite-hub。","canvasOpen":"在 KASUGAI Canvas 中開啟","canvasDl":"下載 .kasc","canvasHosted":"託管版 Canvas（僅檢視）","canvasInstall":"下載 Canvas 安裝程式","canvasStCheck":"正在檢查 KASUGAI Canvas…","canvasStRun":"偵測到 Canvas — 正在切換專案","canvasStInst":"已安裝 Canvas — 正在啟動","canvasStMiss":"未安裝 Canvas","canvasStNoHub":"未偵測到 geosuite-hub — 一鍵開啟需要該元件（見 Ext），或使用下載 .kasc","canvasStOpen":"已在 KASUGAI Canvas 中開啟","canvasStBuild":"正在產生 .kasc…","canvasSaved":".kasc 已儲存 — 開啟檔案即可啟動 Canvas"},
  "ko": {"none":"(없음)","openInGoogleEarth":"Google 어스에서 현재 뷰 열기","hubPromoExt":"확장","hubPromoNote":"선택 구성 요소: geosuite-hub가 감지되지 않습니다. 한 번 설치하면 벡터 레이어가 빨라지고 4MB 제한이 해제되며 AI 브리지 프로바이더를 사용할 수 있습니다.","hubPromoBtn":"geosuite-hub.zip 다운로드","hubPromoWait":"다운로드했습니다. ZIP 압축을 해제하고 geosuite-hub.exe를 실행하세요 — 허브를 기다리는 중…","hubPromoOk":"geosuite-hub가 감지되었습니다","hubPromoRetry":"아직 감지되지 않았습니다 — 다운로드한 ZIP 압축을 해제하고 geosuite-hub.exe를 실행하세요.","hubPromoSteps":"순서: 1) geosuite-hub.zip 다운로드 → 2) 압축 해제 → 3) geosuite-hub.exe 실행(geosuite-hub＋프로토콜 자동 설치·관리자 권한 불필요)","hubPromoPrompt":"브라우저에 로컬 네트워크 액세스 프롬프트가 표시되면 \"허용\"을 클릭하세요 — 이 사이트에서 geosuite-hub를 사용할 수 있습니다.","hubPromoView":"GeoSuite viewer에서 열기","hubPromoViewTitle":"geosuite-hub:// 등록이 필요합니다(geosuite-hub.exe 실행)","closeAria":"닫기","canvasTitle":"KASUGAI Canvas에서 장면 열기","canvasNote":"현재 장면을 .kasc로 내보내 KASUGAI Canvas에서 엽니다. 원클릭 실행에는 로컬 geosuite-hub가 필요합니다.","canvasOpen":"KASUGAI Canvas에서 열기","canvasDl":".kasc 다운로드","canvasHosted":"호스팅 Canvas(보기 전용)","canvasInstall":"Canvas 설치 프로그램 다운로드","canvasStCheck":"KASUGAI Canvas 확인 중…","canvasStRun":"Canvas 감지 — 프로젝트 전환","canvasStInst":"Canvas 설치됨 — 실행 중","canvasStMiss":"Canvas 미설치","canvasStNoHub":"geosuite-hub 미감지 — 원클릭 열기에는 허브(Ext 참조) 또는 .kasc 다운로드를 사용하세요","canvasStOpen":"KASUGAI Canvas에서 열었습니다","canvasStBuild":".kasc 생성 중…","canvasSaved":".kasc 저장됨 — 파일을 열면 Canvas가 시작됩니다"},
  "es": {"none":"(Ninguno)","openInGoogleEarth":"Abrir vista actual en Google Earth","hubPromoExt":"Ext.","hubPromoNote":"Componente opcional: geosuite-hub no está en ejecución. Instálelo una vez para acelerar las capas vectoriales, eliminar el límite de 4MB y desbloquear los proveedores de puente de IA.","hubPromoBtn":"Descargar geosuite-hub.zip","hubPromoWait":"Descargado. Extraiga el ZIP y ejecute geosuite-hub.exe — esperando al hub…","hubPromoOk":"geosuite-hub detectado","hubPromoRetry":"Aún no detectado — extraiga el ZIP descargado y ejecute geosuite-hub.exe.","hubPromoSteps":"Pasos: 1) Descargue geosuite-hub.zip  2) Extráigalo  3) Ejecute geosuite-hub.exe — instala automáticamente geosuite-hub y el protocolo geosuite-hub:// (sin derechos de administrador).","hubPromoPrompt":"Si el navegador muestra el aviso de acceso a la red local, haga clic en Permitir — habilita geosuite-hub en este sitio.","hubPromoView":"Abrir en GeoSuite viewer","hubPromoViewTitle":"Requiere el registro único de geosuite-hub:// (ejecute geosuite-hub.exe)","closeAria":"Cerrar","canvasTitle":"Abrir escena en KASUGAI Canvas","canvasNote":"Exporta la escena actual (.kasc) y la abre en KASUGAI Canvas. La apertura directa requiere geosuite-hub local.","canvasOpen":"Abrir en KASUGAI Canvas","canvasDl":"Descargar .kasc","canvasHosted":"Canvas alojado (solo vista)","canvasInstall":"Descargar instalador de Canvas","canvasStCheck":"Comprobando KASUGAI Canvas…","canvasStRun":"Canvas detectado - cambiando de proyecto","canvasStInst":"Canvas instalado - iniciando","canvasStMiss":"Canvas no instalado","canvasStNoHub":"geosuite-hub no detectado - la apertura directa necesita el hub (ver Ext) o use Descargar .kasc","canvasStOpen":"Abierto en KASUGAI Canvas","canvasStBuild":"Generando .kasc…","canvasSaved":".kasc guardado - abra el archivo para iniciar Canvas"},
  "fr": {"none":"(Aucun)","openInGoogleEarth":"Ouvrir la vue actuelle dans Google Earth","hubPromoExt":"Ext.","hubPromoNote":"Composant optionnel : geosuite-hub n'est pas détecté. Installez-le une fois pour accélérer les couches vectorielles, lever la limite de 4 Mo et débloquer les fournisseurs de pont IA.","hubPromoBtn":"Télécharger geosuite-hub.zip","hubPromoWait":"Téléchargé. Extrayez le ZIP et exécutez geosuite-hub.exe — en attente du hub…","hubPromoOk":"geosuite-hub détecté","hubPromoRetry":"Toujours non détecté — extrayez le ZIP téléchargé et exécutez geosuite-hub.exe.","hubPromoSteps":"Étapes : 1) Téléchargez geosuite-hub.zip  2) Extrayez-le  3) Exécutez geosuite-hub.exe — installe automatiquement geosuite-hub et le protocole geosuite-hub:// (sans droits administrateur).","hubPromoPrompt":"Si le navigateur affiche une invite d'accès au réseau local, cliquez sur Autoriser — cela débloque geosuite-hub pour ce site.","hubPromoView":"Ouvrir dans GeoSuite viewer","hubPromoViewTitle":"Nécessite l'enregistrement unique de geosuite-hub:// (exécutez geosuite-hub.exe)","closeAria":"Fermer","canvasTitle":"Ouvrir la scène dans KASUGAI Canvas","canvasNote":"Exporte la scène actuelle (.kasc) et l'ouvre dans KASUGAI Canvas. L'ouverture directe requiert geosuite-hub local.","canvasOpen":"Ouvrir dans KASUGAI Canvas","canvasDl":"Télécharger .kasc","canvasHosted":"Canvas hébergé (vue seule)","canvasInstall":"Télécharger l'installateur Canvas","canvasStCheck":"Vérification de KASUGAI Canvas…","canvasStRun":"Canvas détecté - changement de projet","canvasStInst":"Canvas installé - lancement","canvasStMiss":"Canvas non installé","canvasStNoHub":"geosuite-hub non détecté - l'ouverture directe nécessite le hub (voir Ext) ou utilisez Télécharger .kasc","canvasStOpen":"Ouvert dans KASUGAI Canvas","canvasStBuild":"Génération du .kasc…","canvasSaved":".kasc enregistré - ouvrez le fichier pour lancer Canvas"},
  "de": {"none":"(Keine)","openInGoogleEarth":"Aktuelle Ansicht in Google Earth öffnen","hubPromoExt":"Ext.","hubPromoNote":"Optionale Komponente: geosuite-hub wurde nicht erkannt. Einmalig installieren, um Vektorebenen zu beschleunigen, das 4MB-Limit aufzuheben und KI-Bridge-Anbieter freizuschalten.","hubPromoBtn":"geosuite-hub.zip herunterladen","hubPromoWait":"Heruntergeladen. Entpacken Sie die ZIP und führen Sie geosuite-hub.exe aus — warte auf den Hub…","hubPromoOk":"geosuite-hub erkannt","hubPromoRetry":"Noch nicht erkannt — entpacken Sie die heruntergeladene ZIP und führen Sie geosuite-hub.exe aus.","hubPromoSteps":"Schritte: 1) geosuite-hub.zip herunterladen  2) Entpacken  3) geosuite-hub.exe ausführen — installiert automatisch geosuite-hub und das geosuite-hub://-Protokoll (keine Adminrechte nötig).","hubPromoPrompt":"Wenn der Browser eine Abfrage zum lokalen Netzwerkzugriff zeigt, klicken Sie auf Zulassen — dadurch wird geosuite-hub für diese Seite freigeschaltet.","hubPromoView":"In GeoSuite viewer öffnen","hubPromoViewTitle":"Erfordert einmalige Registrierung von geosuite-hub:// (geosuite-hub.exe ausführen)","closeAria":"Schließen","canvasTitle":"Szene in KASUGAI Canvas öffnen","canvasNote":"Aktuelle Szene (.kasc) exportieren und in KASUGAI Canvas öffnen. Direktes Öffnen erfordert den lokalen geosuite-hub.","canvasOpen":"In KASUGAI Canvas öffnen","canvasDl":".kasc herunterladen","canvasHosted":"Gehostetes Canvas (nur Ansicht)","canvasInstall":"Canvas-Installer herunterladen","canvasStCheck":"KASUGAI Canvas wird geprüft…","canvasStRun":"Canvas erkannt - Projektwechsel","canvasStInst":"Canvas installiert - wird gestartet","canvasStMiss":"Canvas nicht installiert","canvasStNoHub":"geosuite-hub nicht erkannt - direktes Öffnen benötigt den Hub (siehe Ext) oder .kasc herunterladen","canvasStOpen":"In KASUGAI Canvas geöffnet","canvasStBuild":".kasc wird erstellt…","canvasSaved":".kasc gespeichert - Datei öffnen startet Canvas"},
  "it": {"none":"(Nessuna)","openInGoogleEarth":"Apri vista corrente in Google Earth","hubPromoExt":"Ext.","hubPromoNote":"Componente opzionale: geosuite-hub non rilevato. Installalo una volta per velocizzare i layer vettoriali, rimuovere il limite di 4MB e sbloccare i provider bridge AI.","hubPromoBtn":"Scarica geosuite-hub.zip","hubPromoWait":"Scaricato. Estrai lo ZIP ed esegui geosuite-hub.exe — in attesa dell'hub…","hubPromoOk":"geosuite-hub rilevato","hubPromoRetry":"Ancora non rilevato — estrai lo ZIP scaricato ed esegui geosuite-hub.exe.","hubPromoSteps":"Passi: 1) Scarica geosuite-hub.zip  2) Estrailo  3) Esegui geosuite-hub.exe — installa automaticamente geosuite-hub e il protocollo geosuite-hub:// (nessun diritto di amministratore).","hubPromoPrompt":"Se il browser mostra la richiesta di accesso alla rete locale, fai clic su Consenti — abilita geosuite-hub per questo sito.","hubPromoView":"Apri in GeoSuite viewer","hubPromoViewTitle":"Richiede la registrazione una tantum di geosuite-hub:// (esegui geosuite-hub.exe)","closeAria":"Chiudi","canvasTitle":"Apri scena in KASUGAI Canvas","canvasNote":"Esporta la scena corrente (.kasc) e aprila in KASUGAI Canvas. L'apertura diretta richiede geosuite-hub locale.","canvasOpen":"Apri in KASUGAI Canvas","canvasDl":"Scarica .kasc","canvasHosted":"Canvas hosted (solo vista)","canvasInstall":"Scarica installer Canvas","canvasStCheck":"Verifica di KASUGAI Canvas…","canvasStRun":"Canvas rilevato - cambio progetto","canvasStInst":"Canvas installato - avvio","canvasStMiss":"Canvas non installato","canvasStNoHub":"geosuite-hub non rilevato - l'apertura diretta richiede l'hub (vedi Ext) o usa Scarica .kasc","canvasStOpen":"Aperto in KASUGAI Canvas","canvasStBuild":"Generazione .kasc…","canvasSaved":".kasc salvato - apri il file per avviare Canvas"},
  "pt": {"none":"(Nenhum)","openInGoogleEarth":"Abrir vista atual no Google Earth","hubPromoExt":"Ext.","hubPromoNote":"Componente opcional: geosuite-hub não detectado. Instale-o uma vez para acelerar as camadas vetoriais, remover o limite de 4MB e desbloquear os provedores de ponte de IA.","hubPromoBtn":"Baixar geosuite-hub.zip","hubPromoWait":"Baixado. Extraia o ZIP e execute geosuite-hub.exe — aguardando o hub…","hubPromoOk":"geosuite-hub detectado","hubPromoRetry":"Ainda não detectado — extraia o ZIP baixado e execute geosuite-hub.exe.","hubPromoSteps":"Passos: 1) Baixe geosuite-hub.zip  2) Extraia-o  3) Execute geosuite-hub.exe — instala automaticamente o geosuite-hub e o protocolo geosuite-hub:// (sem direitos de administrador).","hubPromoPrompt":"Se o navegador mostrar o aviso de acesso à rede local, clique em Permitir — isso desbloqueia o geosuite-hub neste site.","hubPromoView":"Abrir no GeoSuite viewer","hubPromoViewTitle":"Requer registro único de geosuite-hub:// (execute geosuite-hub.exe)","closeAria":"Fechar","canvasTitle":"Abrir cena no KASUGAI Canvas","canvasNote":"Exporta a cena atual (.kasc) e abre no KASUGAI Canvas. A abertura direta requer geosuite-hub local.","canvasOpen":"Abrir no KASUGAI Canvas","canvasDl":"Baixar .kasc","canvasHosted":"Canvas hospedado (somente visualização)","canvasInstall":"Baixar instalador do Canvas","canvasStCheck":"Verificando KASUGAI Canvas…","canvasStRun":"Canvas detectado - trocando projeto","canvasStInst":"Canvas instalado - iniciando","canvasStMiss":"Canvas não instalado","canvasStNoHub":"geosuite-hub não detectado - a abertura direta precisa do hub (ver Ext) ou use Baixar .kasc","canvasStOpen":"Aberto no KASUGAI Canvas","canvasStBuild":"Gerando .kasc…","canvasSaved":".kasc salvo - abra o arquivo para iniciar o Canvas"},
  "ru": {"none":"(Нет)","openInGoogleEarth":"Открыть текущий вид в Google Earth","hubPromoExt":"Расш.","hubPromoNote":"Дополнительный компонент: geosuite-hub не обнаружен. Установите один раз, чтобы ускорить векторные слои, снять лимит 4 МБ и разблокировать ИИ-мосты.","hubPromoBtn":"Скачать geosuite-hub.zip","hubPromoWait":"Загружено. Распакуйте ZIP и запустите geosuite-hub.exe — ожидание хаба…","hubPromoOk":"geosuite-hub обнаружен","hubPromoRetry":"Пока не обнаружено — распакуйте скачанный ZIP и запустите geosuite-hub.exe.","hubPromoSteps":"Шаги: 1) Скачайте geosuite-hub.zip  2) Распакуйте его  3) Запустите geosuite-hub.exe — автоматически установит geosuite-hub и протокол geosuite-hub:// (права администратора не нужны).","hubPromoPrompt":"Если браузер показывает запрос доступа к локальной сети, нажмите «Разрешить» — это разблокирует geosuite-hub для сайта.","hubPromoView":"Открыть в GeoSuite viewer","hubPromoViewTitle":"Требуется однократная регистрация geosuite-hub:// (запустите geosuite-hub.exe)","closeAria":"Закрыть","canvasTitle":"Открыть сцену в KASUGAI Canvas","canvasNote":"Экспортирует текущую сцену (.kasc) и открывает её в KASUGAI Canvas. Для открытия в один клик нужен локальный geosuite-hub.","canvasOpen":"Открыть в KASUGAI Canvas","canvasDl":"Скачать .kasc","canvasHosted":"Хостинг Canvas (только просмотр)","canvasInstall":"Скачать установщик Canvas","canvasStCheck":"Проверка KASUGAI Canvas…","canvasStRun":"Canvas обнаружен - переключение проекта","canvasStInst":"Canvas установлен - запуск","canvasStMiss":"Canvas не установлен","canvasStNoHub":"geosuite-hub не обнаружен - для открытия в один клик нужен hub (см. Ext) или используйте Скачать .kasc","canvasStOpen":"Открыто в KASUGAI Canvas","canvasStBuild":"Создание .kasc…","canvasSaved":".kasc сохранён - откройте файл для запуска Canvas"},
  "nl": {"none":"(Geen)","openInGoogleEarth":"Huidige weergave openen in Google Earth","hubPromoExt":"Ext.","hubPromoNote":"Optionele component: geosuite-hub is niet gedetecteerd. Eenmalig installeren versnelt vectorlagen, heft de 4MB-limiet op en ontgrendelt AI-bridgeproviders.","hubPromoBtn":"geosuite-hub.zip downloaden","hubPromoWait":"Gedownload. Pak de ZIP uit en voer geosuite-hub.exe uit — wachten op de hub…","hubPromoOk":"geosuite-hub gedetecteerd","hubPromoRetry":"Nog niet gedetecteerd — pak de gedownloade ZIP uit en voer geosuite-hub.exe uit.","hubPromoSteps":"Stappen: 1) Download geosuite-hub.zip  2) Pak het uit  3) Voer geosuite-hub.exe uit — installeert automatisch geosuite-hub en het geosuite-hub://-protocol (geen beheerdersrechten nodig).","hubPromoPrompt":"Als de browser om lokale netwerktoegang vraagt, klik op Toestaan — hiermee wordt geosuite-hub voor deze site ontgrendeld.","hubPromoView":"Openen in GeoSuite viewer","hubPromoViewTitle":"Vereist eenmalige registratie van geosuite-hub:// (voer geosuite-hub.exe uit)","closeAria":"Sluiten","canvasTitle":"Scene openen in KASUGAI Canvas","canvasNote":"Exporteert de huidige scene (.kasc) en opent deze in KASUGAI Canvas. Direct openen vereist de lokale geosuite-hub.","canvasOpen":"Openen in KASUGAI Canvas","canvasDl":".kasc downloaden","canvasHosted":"Gehoste Canvas (alleen weergave)","canvasInstall":"Canvas-installatie downloaden","canvasStCheck":"KASUGAI Canvas controleren…","canvasStRun":"Canvas gedetecteerd - project wisselen","canvasStInst":"Canvas geïnstalleerd - starten","canvasStMiss":"Canvas niet geïnstalleerd","canvasStNoHub":"geosuite-hub niet gedetecteerd - direct openen vereist de hub (zie Ext) of gebruik .kasc downloaden","canvasStOpen":"Geopend in KASUGAI Canvas","canvasStBuild":".kasc wordt gemaakt…","canvasSaved":".kasc opgeslagen - open het bestand om Canvas te starten"},
  "pl": {"none":"(Brak)","openInGoogleEarth":"Otwórz bieżący widok w Google Earth","hubPromoExt":"Rozsz.","hubPromoNote":"Opcjonalny komponent: nie wykryto geosuite-hub. Zainstaluj raz, aby przyspieszyć warstwy wektorowe, znieść limit 4MB i odblokować dostawców mostu AI.","hubPromoBtn":"Pobierz geosuite-hub.zip","hubPromoWait":"Pobrano. Wypakuj ZIP i uruchom geosuite-hub.exe — oczekiwanie na hub…","hubPromoOk":"Wykryto geosuite-hub","hubPromoRetry":"Nadal nie wykryto — wypakuj pobrany ZIP i uruchom geosuite-hub.exe.","hubPromoSteps":"Kroki: 1) Pobierz geosuite-hub.zip  2) Wypakuj go  3) Uruchom geosuite-hub.exe — automatycznie instaluje geosuite-hub i protokół geosuite-hub:// (bez uprawnień administratora).","hubPromoPrompt":"Jeśli przeglądarka wyświetli monit o dostęp do sieci lokalnej, kliknij Zezwól — odblokuje to geosuite-hub dla tej witryny.","hubPromoView":"Otwórz w GeoSuite viewer","hubPromoViewTitle":"Wymaga jednorazowej rejestracji geosuite-hub:// (uruchom geosuite-hub.exe)","closeAria":"Zamknij","canvasTitle":"Otwórz scenę w KASUGAI Canvas","canvasNote":"Eksportuje bieżącą scenę (.kasc) i otwiera ją w KASUGAI Canvas. Otwarcie jednym kliknięciem wymaga lokalnego geosuite-hub.","canvasOpen":"Otwórz w KASUGAI Canvas","canvasDl":"Pobierz .kasc","canvasHosted":"Hostowany Canvas (tylko podgląd)","canvasInstall":"Pobierz instalator Canvas","canvasStCheck":"Sprawdzanie KASUGAI Canvas…","canvasStRun":"Wykryto Canvas - przełączanie projektu","canvasStInst":"Canvas zainstalowany - uruchamianie","canvasStMiss":"Canvas niezainstalowany","canvasStNoHub":"Nie wykryto geosuite-hub - otwarcie jednym kliknięciem wymaga hubu (patrz Ext) lub użyj Pobierz .kasc","canvasStOpen":"Otwarto w KASUGAI Canvas","canvasStBuild":"Tworzenie .kasc…","canvasSaved":".kasc zapisany - otwórz plik, aby uruchomić Canvas"},
  "uk": {"none":"(Немає)","openInGoogleEarth":"Відкрити поточний вигляд у Google Earth","hubPromoExt":"Розш.","hubPromoNote":"Додатковий компонент: geosuite-hub не виявлено. Встановіть один раз, щоб прискорити векторні шари, зняти ліміт 4 МБ і розблокувати ШІ-мости.","hubPromoBtn":"Завантажити geosuite-hub.zip","hubPromoWait":"Завантажено. Розпакуйте ZIP і запустіть geosuite-hub.exe — очікування хаба…","hubPromoOk":"geosuite-hub виявлено","hubPromoRetry":"Досі не виявлено — розпакуйте завантажений ZIP і запустіть geosuite-hub.exe.","hubPromoSteps":"Кроки: 1) Завантажте geosuite-hub.zip  2) Розпакуйте його  3) Запустіть geosuite-hub.exe — автоматично встановить geosuite-hub і протокол geosuite-hub:// (права адміністратора не потрібні).","hubPromoPrompt":"Якщо браузер показує запит на доступ до локальної мережі, натисніть «Дозволити» — це розблокує geosuite-hub для цього сайту.","hubPromoView":"Відкрити в GeoSuite viewer","hubPromoViewTitle":"Потрібна одноразова реєстрація geosuite-hub:// (запустіть geosuite-hub.exe)","closeAria":"Закрити","canvasTitle":"Відкрити сцену в KASUGAI Canvas","canvasNote":"Експортує поточну сцену (.kasc) та відкриває її в KASUGAI Canvas. Для відкриття одним кліком потрібен локальний geosuite-hub.","canvasOpen":"Відкрити в KASUGAI Canvas","canvasDl":"Завантажити .kasc","canvasHosted":"Хостинг Canvas (лише перегляд)","canvasInstall":"Завантажити інсталятор Canvas","canvasStCheck":"Перевірка KASUGAI Canvas…","canvasStRun":"Canvas виявлено - перемикання проєкту","canvasStInst":"Canvas інстальовано - запуск","canvasStMiss":"Canvas не інстальовано","canvasStNoHub":"geosuite-hub не виявлено - відкриття одним кліком потребує hub (див. Ext) або скористайтеся Завантажити .kasc","canvasStOpen":"Відкрито в KASUGAI Canvas","canvasStBuild":"Створення .kasc…","canvasSaved":".kasc збережено - відкрийте файл для запуску Canvas"},
  "tr": {"none":"(Yok)","openInGoogleEarth":"Geçerli görünümü Google Earth’te aç","hubPromoExt":"Eklenti","hubPromoNote":"İsteğe bağlı bileşen: geosuite-hub algılanmadı. Vektör katmanlarını hızlandırmak, 4MB sınırını kaldırmak ve AI köprü sağlayıcılarını açmak için bir kez kurun.","hubPromoBtn":"geosuite-hub.zip indir","hubPromoWait":"İndirildi. ZIP'i çıkarıp geosuite-hub.exe çalıştırın — hub bekleniyor…","hubPromoOk":"geosuite-hub algılandı","hubPromoRetry":"Hâlâ algılanmadı — indirilen ZIP'i çıkarıp geosuite-hub.exe çalıştırın.","hubPromoSteps":"Adımlar: 1) geosuite-hub.zip indirin  2) Çıkarın  3) geosuite-hub.exe çalıştırın — geosuite-hub ve geosuite-hub:// protokolünü otomatik kurar (yönetici hakkı gerekmez).","hubPromoPrompt":"Tarayıcı yerel ağ erişimi istemi gösterirse İzin ver seçeneğine tıklayın — bu site için geosuite-hub etkinleşir.","hubPromoView":"GeoSuite viewer içinde aç","hubPromoViewTitle":"Bir kerelik geosuite-hub:// kaydı gerekir (geosuite-hub.exe çalıştırın)","closeAria":"Kapat","canvasTitle":"Sahneyi KASUGAI Canvas'ta aç","canvasNote":"Geçerli sahneyi (.kasc) dışa aktarır ve KASUGAI Canvas'ta açar. Tek tıkla açma yerel geosuite-hub gerektirir.","canvasOpen":"KASUGAI Canvas'ta aç","canvasDl":".kasc indir","canvasHosted":"Barındırılan Canvas (yalnızca görünüm)","canvasInstall":"Canvas yükleyicisini indir","canvasStCheck":"KASUGAI Canvas denetleniyor…","canvasStRun":"Canvas algılandı - proje değiştiriliyor","canvasStInst":"Canvas kurulu - başlatılıyor","canvasStMiss":"Canvas kurulu değil","canvasStNoHub":"geosuite-hub algılanmadı - tek tıkla açma hub gerektirir (bkz. Ext) veya .kasc indir kullanın","canvasStOpen":"KASUGAI Canvas'ta açıldı","canvasStBuild":".kasc oluşturuluyor…","canvasSaved":".kasc kaydedildi - dosyayı açmak Canvas'ı başlatır"},
  "ar": {"none":"(لا شيء)","openInGoogleEarth":"فتح العرض الحالي في Google Earth","hubPromoExt":"إضافة","hubPromoNote":"مكوّن اختياري: لم يتم اكتشاف geosuite-hub. ثبّته مرة واحدة لتسريع الطبقات المتجهة وإزالة حد 4MB وفتح موفري جسر الذكاء الاصطناعي.","hubPromoBtn":"تنزيل geosuite-hub.zip","hubPromoWait":"تم التنزيل. فك ضغط ZIP وشغّل geosuite-hub.exe — بانتظار المركز…","hubPromoOk":"تم اكتشاف geosuite-hub","hubPromoRetry":"لم يُكتشف بعد — فك ضغط ZIP الذي تم تنزيله وشغّل geosuite-hub.exe.","hubPromoSteps":"الخطوات: 1) نزّل geosuite-hub.zip  2) فك ضغطه  3) شغّل geosuite-hub.exe — يثبّت تلقائيًا geosuite-hub وبروتوكول geosuite-hub:// (لا يحتاج صلاحيات مسؤول).","hubPromoPrompt":"إذا ظهرت مطالبة الوصول إلى الشبكة المحلية في المتصفح، انقر على سماح — فهذا يفعّل geosuite-hub لهذا الموقع.","hubPromoView":"فتح في GeoSuite viewer","hubPromoViewTitle":"يتطلب تسجيل geosuite-hub:// لمرة واحدة (شغّل geosuite-hub.exe)","closeAria":"إغلاق","canvasTitle":"فتح المشهد في KASUGAI Canvas","canvasNote":"يصدّر المشهد الحالي (.kasc) ويفتحه في KASUGAI Canvas. الفتح بنقرة واحدة يتطلب geosuite-hub محليًا.","canvasOpen":"فتح في KASUGAI Canvas","canvasDl":"تنزيل .kasc","canvasHosted":"Canvas المستضاف (عرض فقط)","canvasInstall":"تنزيل مثبّت Canvas","canvasStCheck":"فحص KASUGAI Canvas…","canvasStRun":"تم اكتشاف Canvas - تبديل المشروع","canvasStInst":"Canvas مثبّت - جارٍ التشغيل","canvasStMiss":"Canvas غير مثبّت","canvasStNoHub":"لم يتم اكتشاف geosuite-hub - الفتح بنقرة واحدة يتطلب المركز (راجع Ext) أو استخدم تنزيل .kasc","canvasStOpen":"تم الفتح في KASUGAI Canvas","canvasStBuild":"إنشاء .kasc…","canvasSaved":"تم حفظ .kasc - افتح الملف لتشغيل Canvas"},
  "hi": {"none":"(कोई नहीं)","openInGoogleEarth":"Google Earth में वर्तमान दृश्य खोलें","hubPromoExt":"एक्स.","hubPromoNote":"वैकल्पिक घटक: geosuite-hub नहीं मिला। वेक्टर लेयर तेज़ करने, 4MB सीमा हटाने और AI ब्रिज प्रदाता अनलॉक करने के लिए एक बार इंस्टॉल करें।","hubPromoBtn":"geosuite-hub.zip डाउनलोड करें","hubPromoWait":"डाउनलोड हो गया। ZIP निकालकर geosuite-hub.exe चलाएँ — हब की प्रतीक्षा में…","hubPromoOk":"geosuite-hub मिल गया","hubPromoRetry":"अभी नहीं मिला — डाउनलोड की गई ZIP निकालकर geosuite-hub.exe चलाएँ।","hubPromoSteps":"चरण: 1) geosuite-hub.zip डाउनलोड करें  2) निकालें  3) geosuite-hub.exe चलाएँ — geosuite-hub और geosuite-hub:// प्रोटोकॉल ऑटो-इंस्टॉल होता है (एडमिन अधिकार आवश्यक नहीं)","hubPromoPrompt":"यदि ब्राउज़र लोकल नेटवर्क एक्सेस का प्रॉम्प्ट दिखाए तो \"अनुमति दें\" पर क्लिक करें — इससे इस साइट पर geosuite-hub सक्षम होगा।","hubPromoView":"GeoSuite viewer में खोलें","hubPromoViewTitle":"एक-बार geosuite-hub:// पंजीकरण आवश्यक (geosuite-hub.exe चलाएँ)","closeAria":"बंद करें","canvasTitle":"KASUGAI Canvas में दृश्य खोलें","canvasNote":"वर्तमान दृश्य (.kasc) निर्यात कर KASUGAI Canvas में खोलता है। एक-क्लिक खोलने के लिए स्थानीय geosuite-hub आवश्यक है।","canvasOpen":"KASUGAI Canvas में खोलें","canvasDl":".kasc डाउनलोड करें","canvasHosted":"होस्टेड Canvas (केवल दृश्य)","canvasInstall":"Canvas इंस्टॉलर डाउनलोड करें","canvasStCheck":"KASUGAI Canvas जाँचा जा रहा है…","canvasStRun":"Canvas मिला - प्रोजेक्ट बदला जा रहा है","canvasStInst":"Canvas इंस्टॉल है - लॉन्च हो रहा है","canvasStMiss":"Canvas इंस्टॉल नहीं है","canvasStNoHub":"geosuite-hub नहीं मिला - एक-क्लिक खोलने के लिए hub (Ext देखें) या .kasc डाउनलोड उपयोग करें","canvasStOpen":"KASUGAI Canvas में खोला गया","canvasStBuild":".kasc बन रहा है…","canvasSaved":".kasc सहेजा गया - फ़ाइल खोलने से Canvas चालू होगा"},
  "id": {"none":"(Tidak ada)","openInGoogleEarth":"Buka tampilan saat ini di Google Earth","hubPromoExt":"Eks.","hubPromoNote":"Komponen opsional: geosuite-hub tidak terdeteksi. Instal sekali untuk mempercepat layer vektor, menghapus batas 4MB, dan membuka penyedia bridge AI.","hubPromoBtn":"Unduh geosuite-hub.zip","hubPromoWait":"Terunduh. Ekstrak ZIP dan jalankan geosuite-hub.exe — menunggu hub…","hubPromoOk":"geosuite-hub terdeteksi","hubPromoRetry":"Belum terdeteksi — ekstrak ZIP yang diunduh dan jalankan geosuite-hub.exe.","hubPromoSteps":"Langkah: 1) Unduh geosuite-hub.zip  2) Ekstrak  3) Jalankan geosuite-hub.exe — otomatis menginstal geosuite-hub dan protokol geosuite-hub:// (tanpa hak admin).","hubPromoPrompt":"Jika browser menampilkan prompt akses jaringan lokal, klik Izinkan — ini mengaktifkan geosuite-hub untuk situs ini.","hubPromoView":"Buka di GeoSuite viewer","hubPromoViewTitle":"Memerlukan pendaftaran geosuite-hub:// satu kali (jalankan geosuite-hub.exe)","closeAria":"Tutup","canvasTitle":"Buka adegan di KASUGAI Canvas","canvasNote":"Mengekspor adegan saat ini (.kasc) dan membukanya di KASUGAI Canvas. Buka sekali klik memerlukan geosuite-hub lokal.","canvasOpen":"Buka di KASUGAI Canvas","canvasDl":"Unduh .kasc","canvasHosted":"Canvas hosted (lihat saja)","canvasInstall":"Unduh penginstal Canvas","canvasStCheck":"Memeriksa KASUGAI Canvas…","canvasStRun":"Canvas terdeteksi - beralih proyek","canvasStInst":"Canvas terpasang - meluncurkan","canvasStMiss":"Canvas belum terpasang","canvasStNoHub":"geosuite-hub tidak terdeteksi - buka sekali klik memerlukan hub (lihat Ext) atau gunakan Unduh .kasc","canvasStOpen":"Dibuka di KASUGAI Canvas","canvasStBuild":"Membuat .kasc…","canvasSaved":".kasc tersimpan - buka file untuk menjalankan Canvas"},
  "th": {"none":"(ไม่มี)","openInGoogleEarth":"เปิดมุมมองปัจจุบันใน Google Earth","hubPromoExt":"ขยาย","hubPromoNote":"ส่วนประกอบเสริม: ไม่พบ geosuite-hub ติดตั้งครั้งเดียวเพื่อเร่งเลเยอร์เวกเตอร์ ยกเลิกขีดจำกัด 4MB และปลดล็อกผู้ให้บริการบริดจ์ AI","hubPromoBtn":"ดาวน์โหลด geosuite-hub.zip","hubPromoWait":"ดาวน์โหลดแล้ว แตกไฟล์ ZIP แล้วรัน geosuite-hub.exe — กำลังรอฮับ…","hubPromoOk":"พบ geosuite-hub แล้ว","hubPromoRetry":"ยังไม่พบ — แตกไฟล์ ZIP ที่ดาวน์โหลดแล้วรัน geosuite-hub.exe","hubPromoSteps":"ขั้นตอน: 1) ดาวน์โหลด geosuite-hub.zip → 2) แตกไฟล์ → 3) รัน geosuite-hub.exe — ติดตั้ง geosuite-hub และโปรโตคอล geosuite-hub:// อัตโนมัติ (ไม่ต้องใช้สิทธิ์ผู้ดูแล)","hubPromoPrompt":"หากเบราว์เซอร์แสดงข้อความขอเข้าถึงเครือข่ายภายใน ให้คลิก อนุญาต — จะเปิดใช้งาน geosuite-hub สำหรับไซต์นี้","hubPromoView":"เปิดใน GeoSuite viewer","hubPromoViewTitle":"ต้องลงทะเบียน geosuite-hub:// ครั้งเดียว (รัน geosuite-hub.exe)","closeAria":"ปิด","canvasTitle":"เปิดฉากใน KASUGAI Canvas","canvasNote":"ส่งออกฉากปัจจุบัน (.kasc) แล้วเปิดใน KASUGAI Canvas การเปิดคลิกเดียวต้องมี geosuite-hub ในเครื่อง","canvasOpen":"เปิดใน KASUGAI Canvas","canvasDl":"ดาวน์โหลด .kasc","canvasHosted":"Canvas โฮสต์ (ดูอย่างเดียว)","canvasInstall":"ดาวน์โหลดตัวติดตั้ง Canvas","canvasStCheck":"กำลังตรวจสอบ KASUGAI Canvas…","canvasStRun":"พบ Canvas - กำลังสลับโปรเจกต์","canvasStInst":"ติดตั้ง Canvas แล้ว - กำลังเปิด","canvasStMiss":"ยังไม่ได้ติดตั้ง Canvas","canvasStNoHub":"ไม่พบ geosuite-hub - การเปิดคลิกเดียวต้องมี hub (ดู Ext) หรือใช้ดาวน์โหลด .kasc","canvasStOpen":"เปิดใน KASUGAI Canvas แล้ว","canvasStBuild":"กำลังสร้าง .kasc…","canvasSaved":"บันทึก .kasc แล้ว - เปิดไฟล์เพื่อเปิด Canvas"},
  "vi": {"none":"(Không có)","openInGoogleEarth":"Mở chế độ xem hiện tại trong Google Earth","hubPromoExt":"Mở rộng","hubPromoNote":"Thành phần tùy chọn: không phát hiện geosuite-hub. Cài một lần để tăng tốc lớp vector, bỏ giới hạn 4MB và mở khóa nhà cung cấp cầu nối AI.","hubPromoBtn":"Tải geosuite-hub.zip","hubPromoWait":"Đã tải xuống. Giải nén ZIP và chạy geosuite-hub.exe — đang chờ hub…","hubPromoOk":"Đã phát hiện geosuite-hub","hubPromoRetry":"Vẫn chưa phát hiện — giải nén ZIP đã tải và chạy geosuite-hub.exe.","hubPromoSteps":"Các bước: 1) Tải geosuite-hub.zip  2) Giải nén  3) Chạy geosuite-hub.exe — tự động cài đặt geosuite-hub và giao thức geosuite-hub:// (không cần quyền quản trị).","hubPromoPrompt":"Nếu trình duyệt hiển thị lời nhắc truy cập mạng cục bộ, hãy nhấp Cho phép — điều này mở khóa geosuite-hub cho trang này.","hubPromoView":"Mở trong GeoSuite viewer","hubPromoViewTitle":"Yêu cầu đăng ký geosuite-hub:// một lần (chạy geosuite-hub.exe)","closeAria":"Đóng","canvasTitle":"Mở cảnh trong KASUGAI Canvas","canvasNote":"Xuất cảnh hiện tại (.kasc) và mở trong KASUGAI Canvas. Mở một chạm cần geosuite-hub cục bộ.","canvasOpen":"Mở trong KASUGAI Canvas","canvasDl":"Tải .kasc","canvasHosted":"Canvas lưu trữ (chỉ xem)","canvasInstall":"Tải trình cài đặt Canvas","canvasStCheck":"Đang kiểm tra KASUGAI Canvas…","canvasStRun":"Đã thấy Canvas - đang chuyển dự án","canvasStInst":"Canvas đã cài - đang khởi chạy","canvasStMiss":"Canvas chưa cài","canvasStNoHub":"Không thấy geosuite-hub - mở một chạm cần hub (xem Ext) hoặc dùng Tải .kasc","canvasStOpen":"Đã mở trong KASUGAI Canvas","canvasStBuild":"Đang tạo .kasc…","canvasSaved":"Đã lưu .kasc - mở tệp để khởi động Canvas"}
};

const html: string = `
  <style>
    html, body { margin: 0; padding: 0; width: 300px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .basemap-wrap { background-color: rgba(255, 255, 255, 0.3); padding: 5px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); backdrop-filter: blur(4px); width: 291px; margin-left: 9px; box-sizing: border-box; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .basemap-select { flex: 1; min-width: 0; border: 1px solid #ccc; border-radius: 4px; padding: 6px; font-size: 0.9em; background: #fff; box-sizing: border-box; }
    .basemap-globe { flex: 0 0 auto; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 1.1em; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff; user-select: none; }
    .basemap-globe:hover { background: #f0f4fb; }
    .basemap-attribution { font-size: 0.7em; color: #333; margin-top: 4px; min-height: 1.2em; overflow-wrap: break-word; word-break: break-word; flex-basis: 100%; }
    .basemap-ext { flex: 0 0 auto; width: 28px; height: 28px; display: none; align-items: center; justify-content: center; font-size: 0.62em; font-weight: 700; cursor: pointer; border: 1px solid #ccc; border-radius: 4px; background: #fff; user-select: none; }
    .basemap-ext:hover { background: #f0f4fb; }
    .basemap-ext.hub-attn { border-color: #d97706; color: #b45309; background: #fdf6e3; }
    .hub-dl-btn { border: 1px solid #b48a3c; border-radius: 3px; background: #fff; padding: 3px 8px; font-size: 0.78em; color: #5a4a1a; cursor: pointer; }
  </style>
  <div class="basemap-wrap">
    <div id="hub-ext-btn" class="basemap-ext" title="Extension component" data-i18n="hubPromoExt" data-i18n-title="hubPromoExt">Ext</div>
    <div id="canvas-ext-btn" class="basemap-ext" title="Open scene in KASUGAI Canvas" data-i18n-title="canvasTitle" data-i18n-aria="canvasTitle" role="button">CV</div>
    <div id="basemap-globe" class="basemap-globe" title="Open current view in Google Earth" data-i18n-title="openInGoogleEarth" role="button" aria-label="Open current view in Google Earth" data-i18n-aria="openInGoogleEarth">🌐</div>
    <select id="basemap-select" class="basemap-select">
      <option value="" data-i18n="none">(None)</option>
    </select>
    <div id="basemap-attribution" class="basemap-attribution"></div>
    <div id="hub-promo" style="display:none;flex-basis:100%;margin-top:2px;padding:6px 8px;border:1px solid #d9c58a;border-radius:4px;background:#fdf6e3;box-sizing:border-box;">
      <div style="display:flex;gap:6px;align-items:flex-start;">
        <div style="font-size:0.78em;line-height:1.35;color:#5a4a1a;flex:1;" data-i18n="hubPromoNote">Optional component: geosuite-hub is not running. Install it once to speed up vector layers, lift the 4MB limit, and unlock AI bridge providers.</div>
        <button id="hub-promo-dismiss" type="button" title="Dismiss" aria-label="Dismiss" data-i18n-title="closeAria" data-i18n-aria="closeAria" style="flex:0 0 auto;border:0;background:none;color:#5a4a1a;font-size:1em;line-height:1;cursor:pointer;padding:0 2px;">&minus;</button>
      </div>
      <div style="margin-top:5px;font-size:0.78em;line-height:1.45;color:#5a4a1a;" data-i18n="hubPromoSteps">Steps: 1) Download geosuite-hub.zip  2) Extract it  3) Run geosuite-hub.exe — auto-installs geosuite-hub + the geosuite-hub:// protocol (no admin needed).</div>
      <div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap;">
        <button id="hub-promo-dl" class="hub-dl-btn" data-i18n="hubPromoBtn">Download geosuite-hub.zip</button>
        <a id="hub-view-open" href="geosuite-hub://open" style="font-size:0.78em;color:#3367d6;white-space:nowrap;" data-i18n="hubPromoView" data-i18n-title="hubPromoViewTitle">Open in GeoSuite viewer</a>
        <span id="hub-promo-status" style="font-size:0.78em;color:#666;">&nbsp;</span>
      </div>
    </div>
    <div id="canvas-promo" style="display:none;flex-basis:100%;margin-top:2px;padding:6px 8px;border:1px solid #8ab0d9;border-radius:4px;background:#e8f1fb;box-sizing:border-box;">
      <div style="display:flex;gap:6px;align-items:flex-start;">
        <div style="font-size:0.78em;line-height:1.35;color:#1a3a5a;flex:1;" data-i18n="canvasNote">Export the current scene (.kasc) and open it in KASUGAI Canvas. One-click open requires the local geosuite-hub.</div>
        <button id="canvas-promo-dismiss" type="button" title="Dismiss" aria-label="Dismiss" data-i18n-title="closeAria" data-i18n-aria="closeAria" style="flex:0 0 auto;border:0;background:none;color:#1a3a5a;font-size:1em;line-height:1;cursor:pointer;padding:0 2px;">&minus;</button>
      </div>
      <div id="canvas-install-row" style="display:none;margin-top:5px;font-size:0.78em;line-height:1.45;color:#1a3a5a;">
        <span data-i18n="canvasStMiss">Canvas not installed</span>
        <a id="canvas-install-dl" href="#" style="color:#3367d6;" data-i18n="canvasInstall">Download Canvas installer</a>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap;">
        <button id="canvas-open-btn" class="hub-dl-btn" data-i18n="canvasOpen">Open in KASUGAI Canvas</button>
        <button id="canvas-dl-btn" class="hub-dl-btn" data-i18n="canvasDl">Download .kasc</button>
        <button id="canvas-hosted-btn" class="hub-dl-btn" data-i18n="canvasHosted">Hosted Canvas (view only)</button>
        <span id="canvas-status" style="font-size:0.78em;color:#666;">&nbsp;</span>
      </div>
    </div>
  </div>
  <script>
    window._GEO_I18N = ${JSON.stringify(GEO_I18N).replace(/</g, '\\u003c')};
    (function(){
      // --- i18n: English-base dictionary (missing keys fall back to en) ---
      var GEO_I18N = window._GEO_I18N || {};
      var GEO_SUPPORTED = ['en','ja','zh-CN','zh-TW','ko','es','fr','de','it','pt','ru','nl','pl','uk','tr','ar','hi','id','th','vi'];
      var GEO_LANG = 'en';
      function resolveLang() {
        try {
          var conf = String(window._GEO_LANG_CONF || 'auto').toLowerCase().trim();
          var cand = (conf && conf !== 'auto') ? conf : String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
          if (cand.indexOf('zh') === 0) {
            return (cand.indexOf('tw') > -1 || cand.indexOf('hk') > -1 || cand.indexOf('mo') > -1 || cand.indexOf('hant') > -1) ? 'zh-TW' : 'zh-CN';
          }
          var i;
          for (i = 0; i < GEO_SUPPORTED.length; i++) { if (GEO_SUPPORTED[i].toLowerCase() === cand) return GEO_SUPPORTED[i]; }
          var base = cand.split('-')[0];
          for (i = 0; i < GEO_SUPPORTED.length; i++) { if (GEO_SUPPORTED[i].toLowerCase().split('-')[0] === base) return GEO_SUPPORTED[i]; }
        } catch (e) {}
        return 'en';
      }
      GEO_LANG = resolveLang();
      function t(key) {
        return (GEO_I18N[GEO_LANG] && GEO_I18N[GEO_LANG][key]) || (GEO_I18N.en && GEO_I18N.en[key]) || key;
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
          apply('[data-i18n-title]', function(el) { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
          apply('[data-i18n-aria]', function(el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
        } catch (e) {}
      }
      try { applyI18n(); } catch (e) {}

      // --- geosuite-hub Ext promo ---
      // Lives here (not in the layer panel) because this iframe is long-lived —
      // the layer panel iframe is recreated on every ui.show, so the promo was
      // unreachable while layers were loading. Config arrives via the 'hubCfg'
      // message (forwarded by this extension from the layer panel); unlock and
      // dismiss posts are relayed back through postToParent -> postToLayerPanel.
      var _hubCfg = null;
      var _hubWired = false;
      var _hubPoll = null;
      var _hubUnlockPoll = null;
      var _hubUnlockTried = false;
      // "Open in GeoSuite viewer" must carry the invoking page URL — the hub's
      // --view forwards it to the 8515 viewer shell (which also persists it to
      // scene.txt). Without ?url= the shell just reopens the last saved scene.
      // document.referrer gives the embedding Visualizer page URL even from
      // this sandboxed (opaque-origin) iframe; ancestorOrigins[0] is the
      // fallback (top origin — for published scenes the origin is the scene).
      try {
        var _hubViewOpen = document.getElementById('hub-view-open');
        if (_hubViewOpen) {
          var _hubSceneUrl = '';
          try { _hubSceneUrl = String(document.referrer || ''); } catch (e) {}
          if (!_hubSceneUrl) { try { _hubSceneUrl = String((location.ancestorOrigins && location.ancestorOrigins[0]) || ''); } catch (e) {} }
          _hubViewOpen.href = 'geosuite-hub://open' + (_hubSceneUrl ? '?url=' + encodeURIComponent(_hubSceneUrl) : '');
        }
      } catch (e) {}
      function wireHubPromo() {
        try {
          var cfg = _hubCfg;
          var extBtn = document.getElementById('hub-ext-btn');
          var row = document.getElementById('hub-promo');
          var status = document.getElementById('hub-promo-status');
          if (!cfg || !cfg.endpoint) { if (extBtn) extBtn.style.display = 'none'; return; }
          if (extBtn) extBtn.style.display = 'flex';
          var ep = String(cfg.endpoint).replace(/[/]+$/, '');
          var setStatus = function(key) { if (status) status.textContent = key ? t(key) : ''; };
          var setAttn = function(on) {
            var attn = !!on && !cfg.dismissed;
            if (extBtn) { try { extBtn.classList.toggle('hub-attn', attn); } catch (e) {} }
          };
          var probe = function(ms) {
            var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
            var timer = setTimeout(function() { try { if (ctl) ctl.abort(); } catch (e) {} }, ms || 3000);
            var opt = { cache: 'no-store' };
            if (ctl) opt.signal = ctl.signal;
            return fetch(ep + '/health', opt).then(function(r) {
              clearTimeout(timer);
              if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
              return r.json();
            }).then(function(d) { if (!d || !d.hub) throw new Error('not bridge-hub'); return true; });
          };
          var unlockDrop = function() { try { postToParent({ action: 'hubUnlockRemove' }); } catch (e) {} };
          var tryUnlock = function() {
            if (_hubUnlockTried) return;
            _hubUnlockTried = true;
            try { postToParent({ action: 'hubUnlockAdd' }); } catch (e) {}
            setStatus('hubPromoPrompt');
            var deadline = Date.now() + 120000;
            _hubUnlockPoll = setInterval(function() {
              probe(3000).then(function() {
                clearInterval(_hubUnlockPoll); _hubUnlockPoll = null;
                unlockDrop(); setAttn(false); setStatus('hubPromoOk');
              }).catch(function() {
                if (Date.now() > deadline) {
                  clearInterval(_hubUnlockPoll); _hubUnlockPoll = null;
                  unlockDrop(); setStatus('hubPromoRetry');
                }
              });
            }, 2500);
          };
          var check = function(showOk) {
            return probe(3000).then(function() {
              unlockDrop(); setAttn(false);
              if (showOk) setStatus('hubPromoOk');
            }).catch(function() {
              setAttn(true);
              if (showOk) { setStatus(''); tryUnlock(); }
            });
          };
          check(false);
          if (_hubWired) return;
          _hubWired = true;
          if (extBtn && row) extBtn.addEventListener('click', function() {
            var opening = (row.style.display === 'none');
            row.style.display = opening ? '' : 'none';
            if (opening) { setStatus(''); check(true); }
          });
          var dism = document.getElementById('hub-promo-dismiss');
          if (dism) dism.addEventListener('click', function() {
            if (_hubPoll) { try { clearInterval(_hubPoll); } catch (e) {} _hubPoll = null; }
            if (_hubUnlockPoll) { try { clearInterval(_hubUnlockPoll); } catch (e) {} _hubUnlockPoll = null; }
            unlockDrop();
            if (row) row.style.display = 'none';
            cfg.dismissed = true;
            setAttn(false);
            try { postToParent({ action: 'hubPromoDismiss' }); } catch (e) {}
          });
          var dl = document.getElementById('hub-promo-dl');
          if (dl) dl.addEventListener('click', function() {
            try {
              var a = document.createElement('a');
              a.href = String(cfg.download || '');
              a.download = 'geosuite-hub.zip';
              document.body.appendChild(a);
              a.click();
              a.remove();
            } catch (e) {}
            setStatus('hubPromoWait');
            if (_hubPoll) return;
            _hubUnlockTried = true;
            try { postToParent({ action: 'hubUnlockAdd' }); } catch (e) {}
            var deadline = Date.now() + 180000;
            _hubPoll = setInterval(function() {
              probe(3000).then(function() {
                clearInterval(_hubPoll); _hubPoll = null;
                unlockDrop(); setStatus('hubPromoOk'); setAttn(false);
                setTimeout(function() { if (row) row.style.display = 'none'; }, 4000);
              }).catch(function() {
                if (Date.now() > deadline) {
                  clearInterval(_hubPoll); _hubPoll = null;
                  unlockDrop(); setStatus('hubPromoRetry');
                }
              });
            }, 2000);
          });
        } catch (e) {}
      }

      const select = document.getElementById('basemap-select');
      const attrEl = document.getElementById('basemap-attribution');
      const globeBtn = document.getElementById('basemap-globe');

      function postToParent(data) {
        try {
          if (window.parent && data) window.parent.postMessage(data, '*');
        } catch(e) {}
      }

      function requestBaseListFromUI() {
        postToParent({ action: 'requestBaseList' });
      }

      function updateAttribution() {
        try {
          const opt = select && select.options[select.selectedIndex];
          if (!opt || !attrEl) return;
          let attr = (opt && opt.dataset.attribution) ? opt.dataset.attribution : '';
          try { attr = decodeURIComponent(attr); } catch(e){}
          const div = document.createElement('div');
          div.innerHTML = attr;
          attrEl.textContent = div.textContent || div.innerText || '';
        } catch(e) {}
      }

      function renderOptions(items, selectedUrl) {
        if (!select) return;
        select.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = t('none');
        select.appendChild(noneOpt);
        if (items && items.length > 0) {
          items.forEach(function(b) {
            const opt = document.createElement('option');
            opt.value = b.url || '';
            opt.textContent = b.title || b.url || '';
            opt.setAttribute('data-attribution', encodeURIComponent(b.attribution || ''));
            select.appendChild(opt);
          });
        }
        if (select) {
          select.value = (selectedUrl !== undefined && selectedUrl !== null) ? String(selectedUrl) : '';
        }
        updateAttribution();
      }

      if (select) {
        select.addEventListener('change', function() {
          updateAttribution();
          if (window.parent) {
            window.parent.postMessage({ action: 'selectBasemap', url: select.value }, '*');
          }
        });
        select.addEventListener('focus', function() {
          // ドロップダウンが空（(なし) だけ）の場合、レイヤーパネルに再読み込みを依頼
          if (select.options.length <= 1) {
            requestBaseListFromUI();
          }
        });
      }

      if (globeBtn) {
        globeBtn.addEventListener('click', function() {
          if (window.parent) {
            window.parent.postMessage({ action: 'openGoogleEarth' }, '*');
          }
        });
      }

      // --- KASUGAI Canvas export panel ---
      // One-click open posts the scene .kasc to geosuite-hub /canvas/open
      // (hub writes it under %LOCALAPPDATA%/kasugai/canvas-export and
      // registers/launches the installed Canvas app). Without the hub the
      // same .kasc falls back to a browser download — opening the file
      // launches Canvas via the .kasc association.
      var _canvasPending = null; // 'open' | 'dl' — button that triggered the export
      var _canvasStatus = document.getElementById('canvas-status');
      var _canvasInstallRow = document.getElementById('canvas-install-row');
      var _canvasInstallDl = document.getElementById('canvas-install-dl');
      function setCanvasStatus(key, extra) {
        if (_canvasStatus) _canvasStatus.textContent = (key ? t(key) : '') + (extra ? ' ' + extra : '');
      }
      function canvasEndpoint() {
        var ep = (_hubCfg && _hubCfg.endpoint) ? String(_hubCfg.endpoint) : '';
        return ep.replace(/[/]+$/, '');
      }
      function downloadKasc(name, kasc) {
        try {
          var blob = new Blob([kasc], { type: 'text/plain;charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = (name || 'scene') + '.kasc';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function() { try { URL.revokeObjectURL(url); } catch (e) {} }, 10000);
        } catch (e) {}
      }
      function checkCanvasStatus() {
        var ep = canvasEndpoint();
        if (!ep) { setCanvasStatus('canvasStNoHub'); if (_canvasInstallRow) _canvasInstallRow.style.display = 'none'; return; }
        setCanvasStatus('canvasStCheck');
        var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
        var timer = setTimeout(function() { try { if (ctl) ctl.abort(); } catch (e) {} }, 4000);
        var opt = { cache: 'no-store' };
        if (ctl) opt.signal = ctl.signal;
        fetch(ep + '/canvas/status', opt).then(function(r) {
          clearTimeout(timer);
          if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
          return r.json();
        }).then(function(d) {
          if (!d || d.canvas !== true) throw new Error('old hub');
          if (_canvasInstallDl && d.download) _canvasInstallDl.href = d.download;
          if (d.running) { setCanvasStatus('canvasStRun'); if (_canvasInstallRow) _canvasInstallRow.style.display = 'none'; }
          else if (d.installed) { setCanvasStatus('canvasStInst'); if (_canvasInstallRow) _canvasInstallRow.style.display = 'none'; }
          else { setCanvasStatus('canvasStMiss'); if (_canvasInstallRow) _canvasInstallRow.style.display = ''; }
        }).catch(function() {
          setCanvasStatus('canvasStNoHub');
          if (_canvasInstallRow) _canvasInstallRow.style.display = 'none';
        });
      }
      function handleCanvasScene(msg) {
        var mode = _canvasPending || 'open';
        _canvasPending = null;
        if (!msg || msg.error || !msg.kasc) {
          setCanvasStatus('', (msg && msg.error) ? String(msg.error) : 'export failed');
          return;
        }
        var kasc = String(msg.kasc);
        var name = String(msg.name || 'reearth-scene');
        if (mode === 'dl') { downloadKasc(name, kasc); setCanvasStatus('canvasSaved'); return; }
        var ep = canvasEndpoint();
        if (!ep) { downloadKasc(name, kasc); setCanvasStatus('canvasStNoHub'); return; }
        setCanvasStatus('canvasStOpen', '…');
        var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
        var timer = setTimeout(function() { try { if (ctl) ctl.abort(); } catch (e) {} }, 30000);
        // text/plain keeps it a "simple request" — no content-type preflight
        // (same contract as the hub /vector externalization posts). The hub
        // still reads the body as JSON.
        var opt = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ name: name, kasc: kasc }) };
        if (ctl) opt.signal = ctl.signal;
        fetch(ep + '/canvas/open', opt).then(function(r) {
          clearTimeout(timer);
          return r.json().catch(function() { return null; }).then(function(d) {
            if (!r.ok || !d) throw new Error('HTTP ' + r.status);
            return d;
          });
        }).then(function(d) {
          if (d.status === 'opened') {
            setCanvasStatus('canvasStOpen');
          } else if (d.status === 'not_installed') {
            setCanvasStatus('canvasStMiss');
            if (_canvasInstallRow) { _canvasInstallRow.style.display = ''; if (_canvasInstallDl && d.download) _canvasInstallDl.href = d.download; }
            downloadKasc(name, kasc);
          } else if (d.status === 'registered_failed') {
            downloadKasc(name, kasc);
            setCanvasStatus('canvasSaved');
          } else {
            setCanvasStatus('', d.error || 'error');
          }
        }).catch(function() {
          downloadKasc(name, kasc);
          setCanvasStatus('canvasStNoHub');
        });
      }
      (function wireCanvasPanel() {
        var cExtBtn = document.getElementById('canvas-ext-btn');
        var cRow = document.getElementById('canvas-promo');
        if (cExtBtn) cExtBtn.style.display = 'flex';
        if (cExtBtn && cRow) cExtBtn.addEventListener('click', function() {
          var opening = (cRow.style.display === 'none');
          cRow.style.display = opening ? '' : 'none';
          if (opening) checkCanvasStatus();
        });
        var cDism = document.getElementById('canvas-promo-dismiss');
        if (cDism) cDism.addEventListener('click', function() { if (cRow) cRow.style.display = 'none'; });
        var cOpen = document.getElementById('canvas-open-btn');
        if (cOpen) cOpen.addEventListener('click', function() {
          _canvasPending = 'open'; setCanvasStatus('canvasStBuild');
          postToParent({ action: 'openCanvas' });
        });
        var cDl = document.getElementById('canvas-dl-btn');
        if (cDl) cDl.addEventListener('click', function() {
          _canvasPending = 'dl'; setCanvasStatus('canvasStBuild');
          postToParent({ action: 'openCanvas' });
        });
        var cHosted = document.getElementById('canvas-hosted-btn');
        if (cHosted) cHosted.addEventListener('click', function() {
          postToParent({ action: 'openHostedCanvas' });
        });
      })();

      // WKB(ISO/EWKB) -> GeoJSON geometry (shared decoder; kasugai vector-decode.js port)
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

      // kasczip:// lazy member fetch — the zip is fetched+unzipped inside
      // THIS iframe (persistent, so the cache survives panel refreshes),
      // never crossing the extension context as giant base64 payloads.
      var _zipCache = {};
      var kascB64ToBytes = function(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      };
      var zipOrB64 = function(msg) {
        if (msg.dataB64) return Promise.resolve(kascB64ToBytes(msg.dataB64));
        if (!msg.zipPath) return Promise.reject(new Error('no zip member data'));
        var c = _zipCache[msg.zipId];
        if (c && c.zfiles && c.zfiles[msg.zipPath]) return Promise.resolve(c.zfiles[msg.zipPath]);
        var url = msg.zipUrl || (c && c.url);
        if (!url) return Promise.reject(new Error('no zip source for ' + msg.zipPath));
        var zipP = window._fflateModule || (window._fflateModule = import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm'));
        return zipP.then(function(ff) {
          return fetch(url, { mode: 'cors' }).then(function(res) {
            if (!res || !res.ok) throw new Error('zip HTTP ' + (res && res.status));
            return res.arrayBuffer();
          }).then(function(ab) {
            var zfiles = ff.unzipSync(new Uint8Array(ab));
            _zipCache[msg.zipId] = { url: url, zfiles: zfiles };
            var b = zfiles[msg.zipPath];
            if (!b) throw new Error('member missing: ' + msg.zipPath);
            return b;
          });
        });
      };

      // DuckDB-Wasm module loader — shared by ddbLoad (queries) and ddbWarm
      // (background pre-init triggered by the layer panel's config scan).
      // The promise is cached on window._ddbModule; a failed load clears the
      // cache so the next call retries.
      var ensureDdbModule = function() {
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
                var st = { conn: conn, db: db, spatial: false };
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
        return window._ddbModule;
      };

      window.addEventListener('message', function(e) {
        try {
          const msg = e && e.data;
          if (!msg || !msg.action) return;
          if (msg.action === 'basemaps') {
            renderOptions(msg.items, msg.selectedUrl);
          } else if (msg.action === 'hubCfg') {
            // geosuite-hub promo config forwarded from the layer panel.
            // Re-wire on each push so endpoint/scene/dismissed updates apply.
            try { _hubCfg = msg.cfg || null; wireHubPromo(); } catch (e) {}
          } else if (msg.action === 'canvasScene') {
            // Scene .kasc built by the layer panel for the CV export flow.
            try { handleCanvasScene(msg); } catch (e) {}
          } else if (msg.action === 'lang') {
            try {
              window._GEO_LANG_CONF = String(msg.lang || 'auto');
              GEO_LANG = resolveLang();
              applyI18n();
            } catch (e) {}
          } else if (msg.action === 'ddbWarm') {
            // Background pre-init: a duckdb:/sql: layer exists in the config,
            // so start the ~60MB download+init now instead of on the first
            // query. Fire-and-forget; ddbWarmed is for diagnostics only.
            try {
              ensureDdbModule().then(
                function() { try { postToParent({ action: 'ddbWarmed', ok: true }); } catch (e) {} },
                function(err) { try { postToParent({ action: 'ddbWarmed', ok: false, error: String(err && err.message || err) }); } catch (e) {} }
              );
            } catch (e) {}
          } else if (msg.action === 'ddbLoad') {
            // DuckDB-Wasm query host. This iframe persists across panel
            // re-renders, so the wasm instance stays warm between queries
            // (unlike the layer panel iframe which is recreated by ui.show).
            (function() {
              try { postToParent({ action: 'ddbAck', vecId: msg.vecId }); } catch (e) {}
              var reply = function(geojson, error) {
                try {
                  if (geojson) {
                    geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                      return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                    }));
                  }
                  // Cap matches the panel extension's 4MB result guard —
                  // reject here so the payload never crosses a QuickJS
                  // extension context.
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; try { console.log('[gj-size/ddb] ' + Math.round(sz / 104857.6) / 10 + 'MB'); } catch (e2) {} if (sz > 4 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded, >4MB) — narrow the query (where/limit/columns/table) or host DATA/ and use qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'ddbResult', vecId: msg.vecId, layerId: msg.layerId || null, geojson: geojson, error: error });
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
                ensureDdbModule().then(function(st) {
                  var conn = st.conn, spatial = st.spatial;
                  var format = String(msg.format || '').toLowerCase();
                  var literal = ql(msg.url);
                  var isParquet = format === 'parquet' || (!format && /\\.parquet([?#]|$)/i.test(msg.url || ''));
                  // dataB64 (kasczip:// member) — register the bytes as a
                  // virtual file and point the SQL at that name.
                  var prep = Promise.resolve();
                  if (msg.dataB64 || msg.zipPath) {
                    if (!(st.db && typeof st.db.registerFileBuffer === 'function')) throw new Error('dataB64 source not supported by this duckdb-wasm build');
                    var vext = (/\\.([a-z0-9]{1,8})([?#].*)?$/i.exec(msg.zipName || msg.zipPath || msg.url || '') || [null, 'bin'])[1];
                    var vname = 'kasczip_' + String(msg.vecId || 'f') + '.' + String(vext).toLowerCase();
                    literal = ql(vname);
                    prep = zipOrB64(msg).then(function(by) { return st.db.registerFileBuffer(vname, by); });
                  }
                  // sql: raw query mode wraps the query as a subquery source.
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
                  return prep.then(function() {
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
                    });
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
                      // Fail fast (same as gpkgLoad): results over the 4MB
                      // bridge cap are rejected by gjTooBig anyway, so track
                      // accumulated JSON size and bail instead of converting
                      // every row just to throw it away.
                      var approxBytes = 2;
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
                        var feat = { type: 'Feature', geometry: geometry, properties: props };
                        try { approxBytes += JSON.stringify(feat).length + 1; }
                        catch (e) { approxBytes += JSON.stringify(geometry).length + 512; }
                        if (approxBytes > 4 * 1024 * 1024) {
                          throw new Error('layer too large (>4MB decoded) — zoom in (bbox=auto retries on move), narrow the query (where/limit/columns), or host via qgis: <.kasc URL>');
                        }
                        features.push(feat);
                      }
                      return { type: 'FeatureCollection', features: features };
                    });
                  });
                }).then(function(fc) { reply(fc, null); }, function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          } else if (msg.action === 'gpkgLoad') {
            // GeoPackage decode via sql.js (mirror of the layer-panel iframe
            // handler). DBs stay open per url so bbox=auto re-queries do not
            // re-download the file.
            (function() {
              var reply = function(geojson, error, qml) {
                try { console.log('[gpkg-timing] reply', msg.vecId, error ? 'err' : 'ok'); } catch (e3) {}
                try {
                  if (geojson) {
                    geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                      return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                    }));
                  }
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; try { console.log('[gj-size/gpkg] ' + Math.round(sz / 104857.6) / 10 + 'MB'); } catch (e2) {} if (sz > 4 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded, >4MB) — narrow the query (where/limit/columns/table) or host DATA/ and use qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'gpkgResult', vecId: msg.vecId, layerId: msg.layerId || null, geojson: geojson, error: error, qml: qml || null });
                } catch (e) {}
              };
              var b64ToBytes = function(b64) {
                var bin = atob(b64);
                var out = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
                return out;
              };
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
              try { postToParent({ action: 'gpkgAck', vecId: msg.vecId }); } catch (e) {}
              try { console.log('[gpkg-timing] recv', msg.vecId, msg.url); } catch (e) {}
              try {
                if (!window._sqljsModule) {
                  var lp = import('https://cdn.jsdelivr.net/npm/sql.js@1.13.0/+esm').then(function(mod) {
                    var init = mod.default || mod.initSqlJs || mod;
                    return init({ locateFile: function(f) { return 'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/' + f; } });
                  });
                  lp.catch(function() { if (window._sqljsModule === lp) window._sqljsModule = null; });
                  window._sqljsModule = lp;
                }
                if (!window._gpkgDbs) window._gpkgDbs = {};
                var dbKey = (msg.dataB64 || msg.zipPath) ? ('bytes:' + (msg.zipPath || msg.url)) : msg.url;
                var dbP = window._gpkgDbs[dbKey];
                if (!dbP) {
                  dbP = window._sqljsModule.then(function(SQL) {
                    // Spec: GeoPackage files over the 4MB cap are rejected
                    // outright — even when a table=/where=/limit=/columns=/
                    // bbox filter could produce a smaller result. Content-
                    // Length is checked before the body is read (bytes still
                    // verified after, since gzip reports compressed size).
                    var fileTooLarge = function(n) {
                        return 'gpkg file too large (' + Math.round(n / 104857.6) / 10 + 'MB > 4MB) — oversized GeoPackage files are rejected outright (spec)';
                    };
                    var bufP = (msg.dataB64 || msg.zipPath)
                      ? zipOrB64(msg)
                      : fetch(msg.url, { mode: 'cors' }).then(function(res) {
                          if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                          var cl = Number(res.headers.get('content-length')) || 0;
                          if (cl > 4 * 1024 * 1024) throw new Error(fileTooLarge(cl));
                          return res.arrayBuffer();
                        }).then(function(buf) { return new Uint8Array(buf); });
                    return bufP.then(function(bytes) {
                        if (bytes.length > 4 * 1024 * 1024) throw new Error(fileTooLarge(bytes.length));
                        return new SQL.Database(bytes);
                    });
                  });
                  dbP.catch(function() { if (window._gpkgDbs[dbKey] === dbP) delete window._gpkgDbs[dbKey]; });
                  window._gpkgDbs[dbKey] = dbP;
                }
                dbP.then(function(db) {
                  try { console.log('[gpkg-timing] db-ready', msg.vecId); } catch (e) {}
                  var qIdent = function(n) { return '"' + String(n).replace(/"/g, '""') + '"'; };
                  var qLit = function(v) { return "'" + String(v).replace(/'/g, "''") + "'"; };
                  var tableName = msg.table || null;
                  if (!tableName) {
                    var r0 = db.exec('SELECT table_name FROM gpkg_geometry_columns ORDER BY rowid LIMIT 1');
                    tableName = r0[0] && r0[0].values && r0[0].values[0] && r0[0].values[0][0] || null;
                  }
                  if (!tableName) throw new Error('feature table not found');
                  var gres = db.exec('SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ' + qLit(tableName) + ' LIMIT 1');
                  var geomCol = (gres[0] && gres[0].values && gres[0].values[0] && gres[0].values[0][0]) || 'geom';
                  var cols = Array.isArray(msg.columns) && msg.columns.length ? msg.columns.map(qIdent) : null;
                  var selectCols = cols ? cols.concat([qIdent(geomCol)]).join(', ') : '*';
                  var sql = 'SELECT ' + selectCols + ' FROM ' + qIdent(tableName)
                    + (msg.where ? ' WHERE (' + msg.where + ')' : '')
                    + (Number.isInteger(msg.limit) && msg.limit > 0 ? ' LIMIT ' + Math.floor(msg.limit) : '');
                  var stmt = db.prepare(sql);
                  var colNames = stmt.getColumnNames();
                  // Fast pre-decode probe: sum the raw byte volume that would
                  // cross the bridge (WKB blob bytes + property text lengths +
                  // per-feature JSON overhead) without decoding a single
                  // geometry. bbox=auto applies the same envelope filter to
                  // the estimate, reading only each row's 40-byte GPkgBinary
                  // header (SUBSTR) — full blobs are never touched for the
                  // estimate. Raw bytes already over the cap cannot decode
                  // smaller, so reject here instead of after ~4MB of wasted
                  // decode.
                  var propCols = colNames.filter(function(c) { return c !== geomCol; });
                  var propLenExpr = propCols.length ? propCols.map(function(c) { return 'LENGTH(' + qIdent(c) + ')'; }).join('+') : '0';
                  var probeRows = 0, probeWkb = 0, probeProp = 0;
                  try {
                      if (msg.bounds) {
                          // Fastest path: the gpkg rtree_<table>_<geom> index
                          // is a plain table (id, minx, maxx, miny, maxy)
                          // readable without the RTree module, so the bbox
                          // estimate is a single aggregate query — no
                          // per-row JS at all.
                          var probed = false;
                          try {
                              var rtName = 'rtree_' + tableName + '_' + geomCol;
                              var rtOk = db.exec('SELECT 1 FROM sqlite_master WHERE name = ' + qLit(rtName) + ' LIMIT 1');
                              var pkRes = db.exec('SELECT name FROM pragma_table_info(' + qLit(tableName) + ') WHERE pk > 0 ORDER BY pk LIMIT 1');
                              var pkName = pkRes[0] && pkRes[0].values[0] && pkRes[0].values[0][0];
                              if (rtOk[0] && rtOk[0].values.length && pkName) {
                                  var propLenG = propCols.length ? propCols.map(function(c) { return 'LENGTH(g.' + qIdent(c) + ')'; }).join('+') : '0';
                                  var lonPred = (msg.bounds.ranges || []).map(function(r) {
                                      return '(r.maxx >= ' + Number(r.west) + ' AND r.minx <= ' + Number(r.east) + ')';
                                  }).join(' OR ') || '0';
                                  var bb = '((' + lonPred + ') AND r.maxy >= ' + Number(msg.bounds.south) + ' AND r.miny <= ' + Number(msg.bounds.north) + ')';
                                  var rtRes = db.exec('SELECT COUNT(*), SUM(LENGTH(g.' + qIdent(geomCol) + ')), SUM(' + propLenG + ')'
                                      + ' FROM (' + sql + ') g JOIN ' + qIdent(rtName) + ' r ON g.' + qIdent(pkName) + ' = r.id WHERE ' + bb);
                                  var rv = rtRes[0] && rtRes[0].values && rtRes[0].values[0];
                                  if (rv) { probeRows = Number(rv[0]) || 0; probeWkb = Number(rv[1]) || 0; probeProp = Number(rv[2]) || 0; probed = true; }
                              }
                          } catch (e2) { probed = false; }
                          if (!probed) {
                              // No rtree index (or pk not in the column
                              // subset): envelope-only SUBSTR pass — still
                              // no WKB decode.
                              var ps = db.prepare('SELECT SUBSTR(' + qIdent(geomCol) + ',1,40), LENGTH(' + qIdent(geomCol) + '), ' + propLenExpr
                                  + ' FROM (' + sql + ')');
                              while (ps.step()) {
                                  var prow = ps.get();
                                  if (!gpkgEnvIntersects(gpkgBinEnvelope(prow[0]), msg.bounds)) continue;
                                  probeRows++; probeWkb += Number(prow[1]) || 0; probeProp += Number(prow[2]) || 0;
                              }
                              ps.free();
                          }
                      } else {
                          var pres = db.exec('SELECT COUNT(*), SUM(LENGTH(' + qIdent(geomCol) + ')), SUM(' + propLenExpr + ') FROM (' + sql + ')');
                          var pv = pres[0] && pres[0].values && pres[0].values[0];
                          if (pv) { probeRows = Number(pv[0]) || 0; probeWkb = Number(pv[1]) || 0; probeProp = Number(pv[2]) || 0; }
                      }
                  } catch (e) { probeRows = 0; probeWkb = 0; probeProp = 0; /* advisory probe — fall through to the decode loop */ }
                  var probeEst = probeWkb + probeProp + probeRows * (64 + propCols.length * 12);
                  if (probeEst > 4 * 1024 * 1024) {
                      stmt.free();
                      throw new Error('layer too large (raw ~' + Math.round(probeEst / 104857.6) / 10 + 'MB, >4MB decoded) — zoom in (bbox=auto retries on move), narrow the query (where/limit/columns/table), or host DATA/ and use qgis: <.kasc URL>');
                  }
                  var features = [];
                  // Fail fast: anything over the 4MB bridge cap is discarded
                  // by gjTooBig anyway, so track the accumulated JSON size and
                  // bail instead of decoding the whole table just to throw it.
                  var approxBytes = 2;
                  while (stmt.step()) {
                    var row = stmt.get();
                    var rec = {};
                    colNames.forEach(function(c, i) { rec[c] = row[i]; });
                    if (msg.bounds && !gpkgEnvIntersects(gpkgBinEnvelope(rec[geomCol]), msg.bounds)) continue;
                    var wkb = gpkgBinToWkb(rec[geomCol]);
                    var geometry = wkb ? vecWkbToGeoJson(wkb) : null;
                    if (!geometry) continue;
                    var properties = {};
                    for (var i = 0; i < colNames.length; i++) { var c = colNames[i]; if (c !== geomCol) properties[c] = rec[c]; }
                    var feat = { type: 'Feature', geometry: geometry, properties: properties };
                    try { approxBytes += JSON.stringify(feat).length + 1; }
                    catch (e) { approxBytes += JSON.stringify(geometry).length + 512; }
                    if (approxBytes > 4 * 1024 * 1024) {
                      stmt.free();
                      throw new Error('layer too large (>4MB decoded) — zoom in (bbox=auto retries on move), narrow the query (where/limit/columns/table), or host DATA/ and use qgis: <.kasc URL>');
                    }
                    features.push(feat);
                  }
                  stmt.free();
                  var qml = null;
                  try {
                    var sres = db.exec('SELECT styleQML FROM layer_styles WHERE f_table_name = ' + qLit(tableName) + ' ORDER BY useAsDefault DESC');
                    var qv = sres[0] && sres[0].values && sres[0].values[0] && sres[0].values[0][0];
                    if (typeof qv === 'string' && qv.trim()) qml = qv;
                  } catch (e) {}
                  reply({ type: 'FeatureCollection', features: features }, null, qml);
                }, function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          } else if (msg.action === 'fgbLoad') {
            // FlatGeobuf decode — mirror of the layer panel's fgbLoad. Runs
            // here when the panel host-routes the request: this iframe
            // survives panel re-renders, so concurrent decodes are not killed
            // mid-flight by ui.show.
            (function() {
              var reply = function(geojson, error) {
                try {
                  if (geojson) {
                    geojson = JSON.parse(JSON.stringify(geojson, function(k, v) {
                      return (typeof v === 'bigint') ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v;
                    }));
                  }
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; if (sz > 4 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded, >4MB) — narrow the query (limit) or host via qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'fgbResult', vecId: msg.vecId, geojson: geojson, error: error });
                } catch (e) {}
              };
              try { postToParent({ action: 'fgbAck', vecId: msg.vecId }); } catch (e) {}
              try {
                if (!window._fgbModule) {
                  window._fgbModule = import('https://cdn.jsdelivr.net/npm/flatgeobuf@4.4.0/lib/mjs/geojson.js/+esm');
                }
                window._fgbModule.then(function(mod) {
                  var srcP = (msg.dataB64 || msg.zipPath)
                    ? zipOrB64(msg)
                    : fetch(msg.url, { mode: 'cors' }).then(function(res) {
                        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                        if (!res.body) throw new Error('empty response body');
                        return res.body;
                      });
                  return srcP.then(function(src) {
                    var features = [];
                    var limit = Math.max(1, Number(msg.limit) || 200000);
                    var iter = mod.deserialize(src);
                    // Fail fast (same as gpkgLoad): results over the 4MB
                    // bridge cap are discarded anyway — bail mid-stream.
                    var approxBytes = 2;
                    var readNext = function() {
                      return iter.next().then(function(r) {
                        if (r.done || features.length >= limit) return { type: 'FeatureCollection', features: features };
                        var f = r.value;
                        if (f && f.geometry) {
                          features.push(f);
                          try { approxBytes += JSON.stringify(f).length + 1; }
                          catch (e0) { approxBytes += 4096; }
                          if (approxBytes > 4 * 1024 * 1024) {
                            throw new Error('layer too large (>4MB decoded) — narrow the query (limit) or host via qgis: <.kasc URL>');
                          }
                        }
                        return readNext();
                      });
                    };
                    return readNext();
                  });
                }).then(function(fc) {
                  reply(fc, null);
                }).catch(function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          } else if (msg.action === 'pqLoad') {
            // GeoParquet decode — mirror of the layer panel's pqLoad.
            (function() {
              var reply = function(geojson, error) {
                try {
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; if (sz > 4 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded, >4MB) — narrow the query (limit) or host via qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'pqResult', vecId: msg.vecId, geojson: geojson, error: error });
                } catch (e) {}
              };
              try { postToParent({ action: 'pqAck', vecId: msg.vecId }); } catch (e) {}
              var wkbToGeoJson = vecWkbToGeoJson;
              try {
                if (!window._pqModule) {
                  window._pqModule = Promise.all([
                    import('https://cdn.jsdelivr.net/npm/hyparquet@1.30.1/+esm'),
                    import('https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm')
                  ]).then(function(mods) {
                    return {
                      parquetReadObjects: mods[0].parquetReadObjects,
                      parquetMetadata: mods[0].parquetMetadataAsync || mods[0].parquetMetadata,
                      asyncBufferFromUrl: mods[0].asyncBufferFromUrl,
                      compressors: mods[1].compressors
                    };
                  });
                }
                window._pqModule.then(function(mod) {
                  var fileP;
                  if (msg.dataB64 || msg.zipPath) {
                    fileP = zipOrB64(msg).then(function(b) { return b.buffer; });
                  } else {
                    try { fileP = mod.asyncBufferFromUrl({ url: msg.url }); } catch (e) { fileP = Promise.reject(e); }
                    fileP = fileP.catch(function() {
                      return fetch(msg.url, { mode: 'cors' }).then(function(res) {
                        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                        return res.arrayBuffer();
                      });
                    });
                  }
                  return fileP.then(function(file) {
                    // Footer metadata first (ranged reads only for URLs):
                    // uncompressed column bytes are a lower bound on the
                    // decoded GeoJSON, so >4MB here can never fit the bridge
                    // cap — skip reading the row data entirely.
                    return Promise.resolve(mod.parquetMetadata ? mod.parquetMetadata(file) : null).then(function(meta) {
                      var ub = 0;
                      try {
                        var rgs = meta && meta.row_groups;
                        if (Array.isArray(rgs)) for (var gi = 0; gi < rgs.length; gi++) ub += Number(rgs[gi] && rgs[gi].total_byte_size) || 0;
                      } catch (e0) {}
                      if (ub > 4 * 1024 * 1024 && !(Number(msg.limit) > 0)) {
                        throw new Error('layer too large (' + Math.round(ub / 1048576) + 'MB uncompressed, >4MB) — set limit= to shrink it or host via qgis: <.kasc URL>');
                      }
                      return mod.parquetReadObjects({ file: file, compressors: mod.compressors }).then(function(rows) {
                        return { rows: rows || [], meta: meta };
                      });
                    });
                  });
                }).then(function(r0) {
                  var rows = r0.rows;
                  var features = [];
                  if (!rows.length) return reply({ type: 'FeatureCollection', features: [] }, null);
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
                  var approxBytes = 2;
                  for (var i = 0; i < rows.length && features.length < limit; i++) {
                    var row = rows[i];
                    var value = row[geomColumn];
                    var geometry = value instanceof Uint8Array ? wkbToGeoJson(value) : (isGeom(value) ? value : null);
                    if (!geometry) continue;
                    var properties = {};
                    var keys = Object.keys(row);
                    for (var j = 0; j < keys.length; j++) { if (keys[j] !== geomColumn) properties[keys[j]] = row[keys[j]]; }
                    var feat = { type: 'Feature', geometry: geometry, properties: properties };
                    try { approxBytes += JSON.stringify(feat).length + 1; }
                    catch (e) { approxBytes += JSON.stringify(geometry).length + 512; }
                    if (approxBytes > 4 * 1024 * 1024) {
                      throw new Error('layer too large (>4MB decoded) — narrow the query (limit) or host via qgis: <.kasc URL>');
                    }
                    features.push(feat);
                  }
                  reply({ type: 'FeatureCollection', features: features }, null);
                }).then(function() {}, function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          } else if (msg.action === 'geoLoad') {
            // kasczip:// / remote GeoJSON decode — mirror of the panel's
            // geoLoad. Bytes stay inside this iframe via zipOrB64.
            (function() {
              var reply = function(geojson, error) {
                try {
                  if (geojson) { var tb = null; try { var sz = JSON.stringify(geojson).length; if (sz > 4 * 1024 * 1024) tb = 'layer too large (' + Math.round(sz / 1048576) + 'MB decoded, >4MB) — host via qgis: <.kasc URL>'; } catch (e) {} if (tb) { geojson = null; error = tb; } }
                  postToParent({ action: 'geoResult', vecId: msg.vecId, geojson: geojson, error: error });
                } catch (e) {}
              };
              try { postToParent({ action: 'geoAck', vecId: msg.vecId }); } catch (e) {}
              try {
                var gjP = (msg.dataB64 || msg.zipPath)
                  ? zipOrB64(msg)
                  : fetch(msg.url, { mode: 'cors' }).then(function(res) {
                      if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
                      return res.arrayBuffer();
                    }).then(function(b) { return new Uint8Array(b); });
                gjP.then(function(bytes) {
                  var text = new TextDecoder('utf-8').decode(bytes);
                  reply(JSON.parse(text), null);
                }).catch(function(e) { reply(null, String(e && e.message || e)); });
              } catch (e) { reply(null, String(e)); }
            })();
          } else if (msg.action === 'hubExternalize') {
            // geosuite-hub /vector register — mirror of the panel iframe's
            // handler. This iframe persists across panel re-renders, so the
            // status/sources/POST chain is not killed by ui.show churn (#17).
            (function() {
              var done = function(ok, err) {
                try { postToParent({ action: 'hubResult', vecId: msg.vecId, reqId: msg.reqId, ok: ok, error: err || null }); } catch (e) {}
              };
              try { postToParent({ action: 'hubAck', vecId: msg.vecId }); } catch (e) {}
              var ep = String(msg.endpoint || '');
              while (ep.length && ep.charAt(ep.length - 1) === '/') ep = ep.slice(0, -1);
              var reg = msg.register || null;
              if (!ep || !reg || !reg.name) { done(false, 'bad request'); return; }
              var hubGet = function(url, ms) {
                var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
                var timer = setTimeout(function() { try { if (ctl) ctl.abort(); } catch (e) {} }, ms || 5000);
                var opt = { mode: 'cors' };
                if (ctl) opt.signal = ctl.signal;
                return fetch(url, opt).then(function(res) {
                  clearTimeout(timer);
                  if (!res.ok) throw new Error('HTTP ' + res.status);
                  return res.json();
                });
              };
              // Bounded retry (#16): transient chain failures (probe/GET
              // timeout, hub-side 502 while a materialization lock is held,
              // POST killed mid-flight) must not drop straight into the iframe
              // decode fallback — that path tombstones sources it cannot serve
              // (CORS-less hosts, >4MB), turning a temporary hub failure into
              // a permanent [layer-failed]. Only an explicit server refusal
              // (ok:false) skips retry.
              var hubTry = 0, HUB_TRIES = 3, HUB_RETRY_MS = 5000;
              var hubAttempt = function() {
                hubTry++;
                hubGet(ep + '/vector/status', 3000)
                  .then(function() { return hubGet(ep + '/vector/sources', 15000); })
                  .then(function(list) {
                    var cur = (list && list.sources && list.sources[reg.name]) || null;
                    // kind:sql identity lives in the name hash — the manifest
                    // stores no sql text, so an existing entry for this name is
                    // definitionally fresh.
                    var stale = !cur || (reg.kind !== 'sql' && (
                                String(cur.src || '') !== String(reg.src || '') ||
                                String(cur.where || '') !== String(reg.where || '') ||
                                (reg.kind && String(cur.kind || '') !== String(reg.kind))));
                    if (!stale) return null;
                    var ctl = (typeof AbortController === 'function') ? new AbortController() : null;
                    var timer = setTimeout(function() { try { if (ctl) ctl.abort(); } catch (e) {} }, 280000);
                    var opt = { method: 'POST', mode: 'cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(reg) };
                    if (ctl) opt.signal = ctl.signal;
                    return fetch(ep + '/vector/sources', opt).then(function(res) {
                      clearTimeout(timer);
                      var st = res.status;
                      return res.json().catch(function() { return null; }).then(function(j) {
                        return { status: st, j: j };
                      });
                    }).then(function(r) {
                      var j = r && r.j;
                      // Permanent refusal = 4xx, or a 2xx body the server parsed
                      // and explicitly refused ({ok:false}). 5xx (transient
                      // ingest failure / materialization lock) is retryable.
                      if (r && r.status >= 400 && r.status < 500) {
                        var e4 = new Error((j && j.error) || 'register failed (HTTP ' + r.status + ')');
                        e4.permanent = true; throw e4;
                      }
                      if (r && r.status >= 500) {
                        throw new Error((j && j.error) || 'register failed (HTTP ' + r.status + ')');
                      }
                      if (!j || !j.ok) { var er = new Error((j && j.error) || 'register failed'); er.permanent = true; throw er; }
                    });
                  })
                  .then(function() { done(true, null); })
                  .catch(function(e) {
                    if (!(e && e.permanent === true) && hubTry < HUB_TRIES) {
                      // Notify the parent to rearm the 300s pending TTL — a
                      // retried POST (up to 280s) can outlive the original
                      // deadline, and a late success must not hit a tombstone.
                      try { postToParent({ action: 'hubRetry', vecId: msg.vecId, reqId: msg.reqId }); } catch (e2) {}
                      setTimeout(hubAttempt, HUB_RETRY_MS); return;
                    }
                    done(false, String(e && e.message || e));
                  });
              };
              hubAttempt();
            })();
          }
        } catch(e) {}
      });

      requestBaseListFromUI();
      try {
        if (typeof setTimeout === 'function') {
          setTimeout(function() {
            if (select && select.options.length <= 1) {
              requestBaseListFromUI();
            }
          }, 3000);
          setTimeout(function() {
            if (select && select.options.length <= 1) {
              requestBaseListFromUI();
            }
          }, 10000);
        }
      } catch(e) {}
    })();
  </script>
`;

function openGoogleEarthInNewWindow(): void {
  try {
    const pos = (reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
    if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') {
      sendLog('[openGoogleEarth] no camera position');
      return;
    }
    const cameraLat = pos.lat;
    const cameraLng = pos.lng;
    const height = (typeof pos.height === 'number' && !isNaN(pos.height)) ? Math.max(0, pos.height) : 1000;
    const headingRad = (typeof pos.heading === 'number' && !isNaN(pos.heading)) ? pos.heading : 0;
    const pitchRad = (typeof pos.pitch === 'number' && !isNaN(pos.pitch)) ? pos.pitch : -Math.PI / 2;

    // Convert Cesium/Re:Earth pitch to Google Earth tilt (nadir -PI/2 -> 0, horizon 0 -> 90)
    const tiltRad = Math.max(0, Math.min(Math.PI / 2, pitchRad + Math.PI / 2));
    const tiltDeg = tiltRad * 180 / Math.PI;
    const headingDeg = ((headingRad * 180 / Math.PI) % 360 + 360) % 360;

    // Compute the ground target point that the camera is looking at, using the same
    // back-calculation logic as KASUGAI Canvas's flyToFeature.
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(cameraLat * Math.PI / 180);
    let targetLat = cameraLat;
    let targetLng = cameraLng;
    let distance = height;
    if (tiltRad > 0.01) {
      const horizontalDistance = height * Math.tan(tiltRad);
      targetLat = cameraLat + (horizontalDistance * Math.cos(headingRad)) / metersPerDegLat;
      targetLng = cameraLng + (horizontalDistance * Math.sin(headingRad)) / (metersPerDegLng || 1);
      distance = height / Math.cos(tiltRad);
    }

    const url = `https://earth.google.com/web/@${targetLat.toFixed(6)},${targetLng.toFixed(6)},0a,${distance.toFixed(2)}d,35y,${headingDeg.toFixed(1)}h,${tiltDeg.toFixed(1)}t,0r`;
    if (reearth && reearth.viewer && typeof reearth.viewer.open === 'function') {
      reearth.viewer.open(url);
    } else {
      sendLog('[openGoogleEarth] reearth.viewer.open is not available');
    }
  } catch (e) {
    sendError('[openGoogleEarth] error:', e);
  }
}

// View-only fallback for the CV panel: open the hosted KASUGAI Canvas
// (kasugai-canvas-web stable channel, Cesium engine) at the current camera.
// Scene data cannot cross without a fetchable .kasc URL, so only the view
// hash (Canvas's own Cesium-convention scheme) is carried.
function openHostedCanvasInNewWindow(): void {
  try {
    const pos = (reearth && reearth.camera && reearth.camera.position) ? reearth.camera.position : null;
    if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') {
      sendLog('[openHostedCanvas] no camera position');
      return;
    }
    const height = (typeof pos.height === 'number' && !isNaN(pos.height)) ? Math.max(0, pos.height) : 1000;
    const headingRad = (typeof pos.heading === 'number' && !isNaN(pos.heading)) ? pos.heading : 0;
    const pitchRad = (typeof pos.pitch === 'number' && !isNaN(pos.pitch)) ? pos.pitch : -Math.PI / 2;
    const pitchDeg = Math.round(pitchRad * 180 / Math.PI * 100) / 100;
    const headingDeg = Math.round(((headingRad * 180 / Math.PI) % 360 + 360) % 360 * 100) / 100;
    const hash = 'latitude=' + pos.lat.toFixed(6)
      + '&longitude=' + pos.lng.toFixed(6)
      + '&height=' + height.toFixed(1)
      + '&pitch=' + pitchDeg.toFixed(2)
      + '&heading=' + headingDeg.toFixed(2);
    const url = 'https://yamamoto-ryuzo.github.io/kasugai-canvas-web/stable/cesium/#' + hash;
    if (reearth && reearth.viewer && typeof reearth.viewer.open === 'function') {
      reearth.viewer.open(url);
    } else {
      sendLog('[openHostedCanvas] reearth.viewer.open is not available');
    }
  } catch (e) {
    sendError('[openHostedCanvas] error:', e);
  }
}

// postToUI drops messages sent before the iframe's script registers its
// listener; the iframe posts requestBaseList once loaded, so any incoming
// message proves it is alive. Early messages (ddbWarm) queue until then.
let _uiIframeReady = false;
const _uiEarlyQueue: any[] = [];
function postToUIWhenReady(msg: any): void {
  if (_uiIframeReady) { postToUI(msg); return; }
  _uiEarlyQueue.push(msg);
}

// DuckDB query host routing: vecId -> requesting extension id. Replies
// (ddbAck/ddbResult) from the UI iframe are forwarded to that extension.
const _ddbSenders: { [key: string]: string } = {};
function ddbReplyToSender(vecId: string, payload: any, forget: boolean): void {
  try {
    const targetId = _ddbSenders[vecId];
    if (!targetId) return;
    if (forget) { try { delete _ddbSenders[vecId]; } catch (e) {} }
    if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function') {
      reearth.extension.postMessage(targetId, payload);
    }
  } catch (e) {}
}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('message', (msg: any) => {
      try {
        if (!msg || !msg.action) return;
        if (!_uiIframeReady) {
          _uiIframeReady = true;
          while (_uiEarlyQueue.length) { try { postToUI(_uiEarlyQueue.shift()); } catch (e) {} }
        }
        if (msg.action === 'hubUnlockAdd' || msg.action === 'hubUnlockRemove' || msg.action === 'hubPromoDismiss') {
          // Promo actions from our iframe — relay to the layer panel, which
          // owns the LNA probe layer and the session dismiss flag.
          try { postToLayerPanel({ action: msg.action }); } catch (e) {}
          return;
        }
        if (msg.action === 'ddbWarmed') {
          try { sendLog('[ddbWarm]', msg.ok ? 'ready' : ('failed: ' + (msg.error || 'unknown'))); } catch (e) {}
          return;
        }
        if (msg.action === 'ddbAck' || msg.action === 'ddbResult') {
          try { ddbReplyToSender(String(msg.vecId || ''), { action: msg.action, vecId: msg.vecId, layerId: msg.layerId || null, geojson: msg.geojson || null, error: msg.error || null }, msg.action === 'ddbResult'); } catch (e) {}
          return;
        }
        if (msg.action === 'gpkgAck' || msg.action === 'gpkgResult') {
          try { ddbReplyToSender(String(msg.vecId || ''), { action: msg.action, vecId: msg.vecId, layerId: msg.layerId || null, geojson: msg.geojson || null, error: msg.error || null, qml: msg.qml || null }, msg.action === 'gpkgResult'); } catch (e) {}
          return;
        }
        if (msg.action === 'fgbAck' || msg.action === 'fgbResult' || msg.action === 'pqAck' || msg.action === 'pqResult' || msg.action === 'geoAck' || msg.action === 'geoResult') {
          // Host-routed vector decodes (fgb/parquet/geojson member) — forward
          // ack + result to the requesting extension (usually the layer panel).
          try { ddbReplyToSender(String(msg.vecId || ''), { action: msg.action, vecId: msg.vecId, geojson: msg.geojson || null, error: msg.error || null }, /Result$/.test(msg.action)); } catch (e) {}
          return;
        }
        if (msg.action === 'hubAck' || msg.action === 'hubResult') {
          // Host-routed geosuite-hub /vector register — forward ack + result
          // to the requesting extension (usually the layer panel).
          try { ddbReplyToSender(String(msg.vecId || ''), { action: msg.action, vecId: msg.vecId, reqId: msg.reqId || msg.vecId, ok: !!msg.ok, error: msg.error || null }, msg.action === 'hubResult'); } catch (e) {}
          return;
        }
        if (msg.action === 'hubRetry') {
          // Retry heartbeat — extend the requester's pending TTL while the
          // chain keeps working (not terminal: sender mapping stays).
          try { ddbReplyToSender(String(msg.vecId || ''), { action: 'hubRetry', vecId: msg.vecId, reqId: msg.reqId || msg.vecId }, false); } catch (e) {}
          return;
        }
        if (msg.action === 'requestBasemaps') {
          sendBasemapsToUI();
        } else if (msg.action === 'selectBasemap') {
          try {
            showBasemapByUrl(typeof msg.url === 'string' ? msg.url : null);
            // Re-sync UI after a short delay
            if (typeof setTimeout === 'function') {
              setTimeout(() => { sendBasemapsToUI(); }, 150);
            } else {
              sendBasemapsToUI();
            }
          } catch (e) { sendError('[selectBasemap] error:', e); }
        } else if (msg.action === 'openGoogleEarth') {
          try { openGoogleEarthInNewWindow(); } catch (e) { sendError('[openGoogleEarth] error:', e); }
        } else if (msg.action === 'openHostedCanvas') {
          try { openHostedCanvasInNewWindow(); } catch (e) { sendError('[openHostedCanvas] error:', e); }
        } else if (msg.action === 'openCanvas') {
          // CV panel export request — the layer panel owns inspectorText and
          // builds the scene .kasc (canvasScene reply → our iframe).
          try {
            let base: any = null;
            const noneSelected = (_lastSelectedBasemapUrl === '');
            if (_lastSelectedBasemapUrl) {
              const sel = _lastSelectedBasemapUrl;
              const entry = _parsedBaseTiles.find((b: any) => urlsEqual(b.encodedUrl, sel) || urlsEqual(b.url, sel));
              base = entry
                ? { url: entry.url, encodedUrl: entry.encodedUrl, title: entry.title, attribution: entry.attribution }
                : { url: sel, encodedUrl: sel };
            }
            postToLayerPanel({ action: 'canvasExport', base: base, noneSelected: noneSelected });
          } catch (e) { sendError('[openCanvas] error:', e); }
        } else if (msg.action === 'requestBaseList') {
          try { requestBaseList(); } catch (e) { sendError('[requestBaseList] error:', e); }
        }
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.extension && typeof reearth.extension.on === 'function') {
    reearth.extension.on('extensionMessage', (msg: any) => {
      try {
        const data = (msg && msg.data !== undefined) ? msg.data : msg;
        if (!data || !data.action) return;
        if (data.action === 'baseList') {
          applyBaseList(data.items);
        } else if (data.action === 'canvasScene') {
          // Scene .kasc built by the layer panel — forward to our iframe,
          // which POSTs it to geosuite-hub /canvas/open (or downloads it).
          try {
            postToUIWhenReady({
              action: 'canvasScene',
              name: data.name || 'reearth-scene',
              kasc: data.kasc || null,
              error: data.error || null,
              skipped: data.skipped || []
            });
          } catch (e) {}
        } else if (data.action === 'hubCfg') {
          // geosuite-hub promo config pushed by the layer panel — the promo UI
          // lives in this widget because its iframe persists across re-renders.
          try { postToUIWhenReady({ action: 'hubCfg', cfg: data.cfg || null }); } catch (e) {}
        } else if (data.action === 'lang') {
          // Language override forwarded from the layer panel (inspector "lang:" line)
          try { postToUI({ action: 'lang', lang: data.lang || 'auto' }); } catch (e) {}
        } else if (data.action === 'ddbWarm') {
          // Pre-init request from the layer panel (inspector config contains
          // duckdb:/sql: layers). Queued until the iframe is alive, then
          // fire-and-forget — it only starts the wasm download+init.
          try { postToUIWhenReady({ action: 'ddbWarm' }); } catch (e) {}
        } else if (data.action === 'ddbExec') {
          // DuckDB-Wasm query request from the layer panel. This widget's iframe
          // is long-lived (ui.show runs once), so the wasm instance stays warm —
          // unlike the panel iframe which is recreated on every ui.show.
          try {
            if (data.vecId && msg.sender) _ddbSenders[String(data.vecId)] = String(msg.sender);
            // postToUIWhenReady: a query arriving before the iframe's listener
            // is registered must queue, not drop — a drop would make the
            // sender's ack watchdog declare this host permanently dead.
            postToUIWhenReady({
              action: 'ddbLoad', vecId: data.vecId, layerId: data.layerId || null,
              url: data.url, format: data.format || null, where: data.where || null,
              limit: data.limit || null, geom: data.geom || null, lon: data.lon || null, lat: data.lat || null,
              columns: data.columns || null, covering: data.covering || null, bounds: data.bounds || null,
              query: data.query || null, dataB64: data.dataB64 || null, zipName: data.zipName || null,
              zipId: data.zipId || null, zipUrl: data.zipUrl || null, zipPath: data.zipPath || null
            });
          } catch (e) {}
        } else if (data.action === 'gpkgExec') {
          // GeoPackage query request from the layer panel (same host pattern
          // as ddbExec — this iframe's sql.js instance and open DBs persist).
          try {
            if (data.vecId && msg.sender) _ddbSenders[String(data.vecId)] = String(msg.sender);
            postToUIWhenReady({
              action: 'gpkgLoad', vecId: data.vecId, layerId: data.layerId || null,
              url: data.url, dataB64: data.dataB64 || null,
              zipId: data.zipId || null, zipUrl: data.zipUrl || null, zipPath: data.zipPath || null,
              table: data.table || null,
              where: data.where || null, limit: data.limit || null,
              columns: data.columns || null, bounds: data.bounds || null
            });
          } catch (e) {}
        } else if (data.action === 'fgbExec' || data.action === 'pqExec' || data.action === 'geoExec') {
          // fgb/parquet/geojson-member decode request from the layer panel —
          // same host pattern as ddbExec/gpkgExec: this iframe persists across
          // panel re-renders, so decodes survive the ui.show that follows a
          // result (the panel iframe's own decodes die with it).
          try {
            if (data.vecId && msg.sender) _ddbSenders[String(data.vecId)] = String(msg.sender);
            const loadAction = data.action === 'fgbExec' ? 'fgbLoad' : (data.action === 'pqExec' ? 'pqLoad' : 'geoLoad');
            postToUIWhenReady({
              action: loadAction, vecId: data.vecId,
              url: data.url, limit: data.limit || null,
              dataB64: data.dataB64 || null, zipName: data.zipName || null,
              zipId: data.zipId || null, zipUrl: data.zipUrl || null, zipPath: data.zipPath || null
            });
          } catch (e) {}
        } else if (data.action === 'hubExec') {
          // geosuite-hub /vector register request from the layer panel — same
          // host pattern as the decodes: this iframe persists across panel
          // re-renders, so the status/sources/POST chain is not killed by the
          // safeShowUI churn that accompanies bulk applies (#17).
          try {
            if (data.vecId && msg.sender) _ddbSenders[String(data.vecId)] = String(msg.sender);
            postToUIWhenReady({
              action: 'hubExternalize', vecId: data.vecId,
              reqId: data.reqId || data.vecId,
              endpoint: data.endpoint || null, register: data.register || null
            });
          } catch (e) {}
        } else if (data.action === 'requestBaseList') {
          // If asked by layer panel (unexpected direction), respond with current list
          _layerPanelId = msg.sender || _layerPanelId;
          if (_parsedBaseTiles.length) {
            try {
              if (reearth && reearth.extension && typeof reearth.extension.postMessage === 'function' && _layerPanelId) {
                reearth.extension.postMessage(_layerPanelId, { action: 'baseList', items: _parsedBaseTiles });
              }
            } catch (e) {}
          }
        } else if (data.action === 'selectBasemap') {
          // Basemap switch requested by another widget (e.g. ai-chat tool).
          // Accepts a URL or a basemap title.
          try {
            const ref = (typeof data.url === 'string') ? data.url : ((typeof data.name === 'string') ? data.name : '');
            let url = ref;
            if (ref) {
              const rl = ref.toLowerCase();
              const hit = _parsedBaseTiles.find((b: any) => String(b.title || '').toLowerCase() === rl)
                || _parsedBaseTiles.find((b: any) => String(b.title || '').toLowerCase().indexOf(rl) >= 0)
                || _parsedBaseTiles.find((b: any) => urlsEqual(b.url, ref) || urlsEqual(b.encodedUrl, ref));
              if (hit) url = hit.encodedUrl || hit.url;
            }
            showBasemapByUrl(url === '' ? '' : url);
            if (typeof setTimeout === 'function') {
              setTimeout(() => { sendBasemapsToUI(); }, 150);
            } else {
              sendBasemapsToUI();
            }
          } catch (e) { sendError('[selectBasemap/ext] error:', e); }
        }
      } catch (e) {}
    });
  }
} catch (e) {}

try {
  if (typeof reearth !== 'undefined' && reearth && reearth.ui && typeof reearth.ui.show === 'function') {
    reearth.ui.show(html, { width: 300, visible: true, position: 'bottom-left' });
  }
} catch (e) {}


