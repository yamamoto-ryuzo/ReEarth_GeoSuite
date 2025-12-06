/*
  Basemap Simple (TS): Re:Earth のシーンから可能な限りベースマップURLを収集してリスト表示する最小ウィジェット。
  - 参考: reearth-web Visualizer Plugin types に準拠した形で、代表的なプロパティを網羅的に探索
  - UI同期: listener を show 前に登録、iframe 側は ready を複数回送信、WASM 側はバッファリングとフォールバック
*/

// ざっくり型定義（reearth-web の types.ts を参考にした最小版）
type TilesSource = {
  url?: string;
  uri?: string;
  urlTemplate?: string;
  templateUrl?: string;
  sourceUrl?: string;
  resource?: string;
  href?: string;
  endpoint?: string;
  serviceUrl?: string;
};

type TilesProperty = {
  name?: string;
  tiles?: Array<string | TilesSource> | TilesSource;
  imageryProvider?: { url?: string; uri?: string; resource?: string };
  tile?: { url?: string };
  options?: { provider?: TilesSource };
  source?: TilesSource | { imagery?: TilesSource; tile?: TilesSource; provider?: TilesSource };
};

type Layer = {
  id: string;
  type?: string;
  title?: string;
  property?: TilesProperty & Record<string, any>;
  layers?: Layer[];
};

type Scene = {
  property?: TilesProperty & Record<string, any>;
};

type Visualizer = {
  property?: TilesProperty & Record<string, any>;
};

declare const reearth: {
  scene?: Scene;
  visualizer?: Visualizer;
  layers?: { layers?: Layer[] };
  ui: {
    show: (html: string) => void;
    postMessage: (msg: any) => void;
    on: (event: "message", handler: (msg: any) => void) => void;
  };
  on: (event: "message", handler: (msg: any) => void) => void;
};

type BasemapItem = { name?: string; url: string; source: string };

function pickUrl(obj?: TilesSource | string | null): string | undefined {
  if (!obj) return undefined;
  if (typeof obj === "string") return obj;
  const candidates = [
    obj.url,
    obj.uri,
    obj.urlTemplate,
    obj.templateUrl,
    obj.sourceUrl,
    obj.resource,
    obj.href,
    obj.endpoint,
    obj.serviceUrl,
  ];
  return candidates.find(u => typeof u === "string" && !!u);
}

function normalizeTiles(property?: TilesProperty, source: string = "scene"): BasemapItem[] {
  if (!property) return [];
  const name = property.name;
  const items: BasemapItem[] = [];

  // tiles: array or object
  const tilesAny = property.tiles;
  if (Array.isArray(tilesAny)) {
    for (const t of tilesAny) {
      const url = pickUrl(t as any);
      if (url) items.push({ name, url, source });
    }
  } else if (tilesAny) {
    const url = pickUrl(tilesAny as any);
    if (url) items.push({ name, url, source });
  }

  // imageryProvider
  const ip = property.imageryProvider;
  if (ip) {
    const url = pickUrl(ip as any);
    if (url) items.push({ name, url, source });
  }

  // tile.url
  const tile = property.tile;
  if (tile?.url) items.push({ name, url: tile.url, source });

  // options.provider
  const prov = property.options?.provider;
  const provUrl = pickUrl(prov);
  if (provUrl) items.push({ name, url: provUrl, source });

  // source variants
  const src = property.source as any;
  const srcUrl = pickUrl(src);
  if (srcUrl) items.push({ name, url: srcUrl, source });
  const srcImagery = src?.imagery ? pickUrl(src.imagery) : undefined;
  if (srcImagery) items.push({ name, url: srcImagery, source });
  const srcTile = src?.tile ? pickUrl(src.tile) : undefined;
  if (srcTile) items.push({ name, url: srcTile, source });
  const srcProvider = src?.provider ? pickUrl(src.provider) : undefined;
  if (srcProvider) items.push({ name, url: srcProvider, source });

  return items;
}

function collectDeepCandidates(obj: any, source: string): BasemapItem[] {
  const results: BasemapItem[] = [];
  const stack: Array<{ value: any; depth: number }> = [{ value: obj, depth: 0 }];
  const maxDepth = 3;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (!value || typeof value !== "object") continue;
    // direct URL-ish
    const url = pickUrl(value as any);
    if (url) results.push({ url, source });
    // imageryProvider style
    if (value.imageryProvider) {
      const ipUrl = pickUrl(value.imageryProvider);
      if (ipUrl) results.push({ url: ipUrl, source });
    }
    if (depth < maxDepth) {
      for (const k of Object.keys(value)) {
        const v = value[k];
        stack.push({ value: v, depth: depth + 1 });
      }
    }
  }
  return results;
}

function uniqByUrl(items: BasemapItem[]): BasemapItem[] {
  const seen = new Set<string>();
  const out: BasemapItem[] = [];
  for (const it of items) {
    if (!seen.has(it.url)) {
      seen.add(it.url);
      out.push(it);
    }
  }
  return out;
}

function getAllTilesFromLayers(): BasemapItem[] {
  const layers = reearth.layers?.layers ?? [];
  const out: BasemapItem[] = [];
  const stack: Layer[] = [...layers];
  while (stack.length) {
    const l = stack.pop()!;
    if (l.layers?.length) stack.push(...l.layers);

    const type = (l.type || "").toLowerCase();
    const name = l.title || l.property?.name;
    const prop = l.property;
    if (!prop) continue;

    // tiles-like layers
    if (["tiles", "tile", "raster", "imagery", "map", "webmap"].includes(type)) {
      const items = normalizeTiles(prop, `layer:${type}`);
      items.forEach(i => out.push({ ...i, name }));
    } else {
      // deep fallback
      const deep = collectDeepCandidates(prop, `layer:${type}`);
      deep.forEach(i => out.push({ ...i, name }));
    }
  }
  return out;
}

function gatherBasemaps(): { items: BasemapItem[]; counts: Record<string, number> } {
  const sceneItems = normalizeTiles(reearth.scene?.property, "scene");
  const vizItems = normalizeTiles(reearth.visualizer?.property, "visualizer");
  const deepScene = collectDeepCandidates(reearth.scene?.property, "scene:deep");
  const layerItems = getAllTilesFromLayers();
  const items = uniqByUrl([...sceneItems, ...vizItems, ...deepScene, ...layerItems]);
  return {
    items,
    counts: {
      scene: sceneItems.length,
      visualizer: vizItems.length,
      sceneDeep: deepScene.length,
      layers: layerItems.length,
      total: items.length,
    },
  };
}

function renderAndWireUI() {
  let uiReady = false;
  const buffer: any[] = [];
  const safePost = (msg: any) => {
    if (!uiReady) buffer.push(msg);
    else reearth.ui.postMessage(msg);
  };

  reearth.ui.on("message", (msg: any) => {
    if (!msg) return;
    if (msg.type === "ready") {
      uiReady = true;
      if (buffer.length) buffer.forEach(m => reearth.ui.postMessage(m));
      buffer.length = 0;
      // 初期送信
      const { items, counts } = gatherBasemaps();
      safePost({ type: "basemaps", items, counts });
    } else if (msg.type === "refresh") {
      const { items, counts } = gatherBasemaps();
      safePost({ type: "basemaps", items, counts });
    }
  });

  // 互換イベント
  reearth.on("message", (msg: any) => {
    if (msg?.type === "refresh") {
      const { items, counts } = gatherBasemaps();
      safePost({ type: "basemaps", items, counts });
    }
  });

  const html = `
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; }
    .wrap { padding: 12px; }
    .status { font-size: 12px; color: #666; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
    th { background: #f5f5f5; text-align: left; }
    .actions { margin-bottom: 8px; }
    button { font-size: 12px; padding: 4px 8px; }
  </style>
  <div class="wrap">
    <div class="actions">
      <button id="refresh">更新</button>
    </div>
    <div id="status" class="status">初期化中…</div>
    <table>
      <thead>
        <tr><th>名前</th><th>URL</th><th>由来</th></tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <script>
    const status = document.getElementById('status');
    const tbody = document.getElementById('tbody');
    const refreshBtn = document.getElementById('refresh');
    function post(msg){ parent.postMessage(msg, '*'); }
    function esc(s){ return (s||'').toString().replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function render(items){
      tbody.innerHTML = items.map(i => `<tr><td>${esc(i.name||'')}</td><td>${esc(i.url)}</td><td>${esc(i.source||'')}</td></tr>`).join('');
    }
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (!msg) return;
      if (msg.type === 'basemaps'){
        const c = msg.counts || {};
        status.textContent = `scene:${c.scene||0} visualizer:${c.visualizer||0} sceneDeep:${c.sceneDeep||0} layers:${c.layers||0} total:${c.total||0}`;
        render(msg.items || []);
      }
    });
    refreshBtn.addEventListener('click', () => post({ type:'refresh' }));
    // ready を複数回送って同期を安定化
    post({ type:'ready' });
    setTimeout(() => post({ type:'ready' }), 400);
    setTimeout(() => { if (status.textContent.includes('初期化中')) status.textContent = '待機中（データ未受信）'; }, 1500);
  </script>
  `;

  reearth.ui.show(html);
  // show 後の軽い再送促し
  setTimeout(() => {
    const { items, counts } = gatherBasemaps();
    reearth.ui.postMessage({ type: "basemaps", items, counts });
  }, 250);
}

export default function main() {
  renderAndWireUI();
}
