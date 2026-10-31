# 外部ブリッジ（実装構成）

QGIS live_driver の `bridge_call` / `describe_plugins` に相当する機能を Re:Earth プラグインへ移植したものです。Re:Earth のサンドボックス（QuickJS 拡張コンテキスト + opaque origin iframe）越しに、ローカルハーネスや AI エージェントから地図ツールを呼び出せます。

v21.3.0 追加。

## 全体構成

```
外部（サンドボックス外）                    geo_suite プラグイン内
┌────────────────────┐                     ┌──────────────────────────────┐
│ bridge_server.js   │  GET /events (SSE)  │ navigation-toolbar iframe    │
│ 127.0.0.1:8977     │◄──── コマンド配信 ──│ window.__geoBridge           │
│                    │                     │   ├ bridgeInvoke(name,args)  │
│  POST /call        │  POST /result       │   ├ runCode / describe       │
│   {name,args} ─────┼──── 結果返送 ──────►│   ↕ postToParent             │
│  GET /status       │                     ├──────────────────────────────┤
│  GET /tools        │                     │ navigation-toolbar 拡張ctx   │
└────────────────────┘                     │   bridgeCall → ai-chat へ中継 │
┌────────────────────┐                     │   bridgeResult → postToUI   │
│ bridge.js          │  CDP Runtime.eval   │   ↕ extensionMessage        │
│ (dev ドライバ)      │────────────────────►│ ai-chat 拡張ctx              │
│  call/list/serve   │  window.__geoBridge │   dispatchToolCall          │
└────────────────────┘      .call()        │   ├ LOCAL_TOOLS → reearth.*  │
                                           │   └ PANEL_TOOLS → extension │
                                           │      .postMessage → パネル   │
                                           └──────────────────────────────┘
```

## コンテキスト別の役割

Re:Earth プラグインは2種類のサンドボックスで動作し、外部 I/O は **iframe 側にしか実装できません**（QuickJS 拡張コンテキストには `fetch`・`setTimeout`・ソケットが存在しないため）。

| コンテキスト | 実行環境 | ブリッジでの役割 |
|---|---|---|
| navigation-toolbar **UI iframe** | ブラウザ JS（fetch/EventSource/new Function 可・opaque origin） | ブリッジクライアント `window.__geoBridge`。SSE でコマンド受信、POST で結果返送。`runCode` の実行場所 |
| navigation-toolbar **拡張ctx** | QuickJS（reearth.* API + メッセージ中継のみ） | リレー: `bridgeCall` を ai-chat へ `extension.postMessage` 転送、`bridgeResult`/`bridgeConfig` を iframe へ `postToUI` |
| ai-chat **拡張ctx** | QuickJS | ツールディスパッチャ `dispatchToolCall`（aiToolCall と共通）。local ツールは `reearth.*` で即実行、PANEL_TOOLS は layers-and-tiles-list へ転送 |
| layers-and-tiles-list **拡張ctx** | QuickJS | `aiToolRequest` 実行 + `bridge:` インスペクタ行の解析 → `bridgeConfig` を nav-toolbar へ転送 |

## メッセージプロトコル

### 内部（iframe ↔ 拡張ctx ↔ 拡張ctx）

| メッセージ | 経路 | 内容 |
|---|---|---|
| `{action:'bridgeCall', reqId, name, args}` | iframe → 自拡張ctx → ai-chat 拡張ctx | ツール呼出し |
| `{action:'bridgeResult', reqId, result}` | ai-chat → nav-toolbar 拡張ctx → iframe | 結果返送（`msg.sender` が返送先ウィジェット id） |
| `{action:'bridgeConfig', url}` | パネル → nav-toolbar 拡張ctx → iframe | `bridge:` インスペクタ行の反映 |
| `{action:'requestBridgeConfig'}` | iframe → nav-toolbar 拡張ctx → パネル | 初期化競合回避の pull |
| `{action:'aiToolRequest', reqId, name, args}` | ai-chat → パネル | PANEL_TOOLS 転送（既存） |
| `{action:'aiToolResult', reqId, result}` | パネル → ai-chat | 転送ツールの結果（既存、`_pendingForward` で reply にルーティング） |

### 外部（bridge_server.js ↔ iframe ↔ 呼出し側）

| エンドポイント | 方向 | 用途 |
|---|---|---|
| `GET /status` | 任意 | `{geosuiteBridge:1, connected, pending}` — iframe の自動プローブ先 |
| `GET /events` | サーバ → iframe | SSE で `{reqId,name,args}` を配信（EventSource 自動再接続） |
| `POST /result` | iframe → サーバ | `{reqId,result}`（`Content-Type: text/plain`、後述の PNA 対策） |
| `POST /call` | 呼出し側 → サーバ | `{name,args,timeoutMs?}`。結果が返るまで保持する RPC ファサード |
| `GET /tools` | 呼出し側 → サーバ | `describe` を発行してカタログ取得 |

## 呼び出せるツール

`describe` 呼出しで取得できるカタログ（`execLocalTool` + `PANEL_TOOLS` + ブリッジ固有）:

- **local（ai-chat 拡張ctx で実行）**: `getCamera` `flyTo` `listLayers` `setLayerVisible` `focusLayer` `addGeoJsonLayer` `addTileLayer` `add3dTilesLayer` `removeLayer` `captureView` `getShareUrl` `buildShareUrl` `setCamera` `lookAt` `zoomIn` `zoomOut` `openUrl`
- **panel（layers-and-tiles-list へ転送）**: カメラプリセット・ベースマップ・FLY ルート・vector 検索・FlatGeobuf/Parquet/DuckDB レイヤー・inspectorText 操作・凡例/属性パネル等 35種
- **bridge（iframe 側で実行）**: `describe`（カタログ）・`runCode`（`api.<tool>` プロキシ + `fetch` 付き sandboxed JS。QGIS `pyeval` 相当の多段実行プリミティブ）

引数スキーマは `geo_suite/src/ai-chat.ts` の `TOOL_DECLS`（Gemini functionDeclarations）と同一です。

## 有効化と無効化

| 設定 | 動作 |
|---|---|
| 未設定（既定） | **完全に不活性**（プローブも接続も行わない・コストゼロ）。CDP ドライバ `bridge.js` だけは `__geoBridge.configure()` で明示有効化します |
| `bridge: on` | 既定エンドポイントへプローブ |
| `bridge: http://host:port` | 指定エンドポイントへ直接接続（`?token=` 付与可） |
| `bridge: off` | 完全無効（プローブも行わない） |

設定はインスペクタの一括設定テキスト（`inspectorText`）に `bridge:` 行として記述します。パネルが `bridgeConfig` として nav-toolbar へ転送します。

## 使い方

### 経路A: CDP ドライバ（dev/検証）

```bash
npm run dev                                    # Workbench 起動 (localhost:8787)
node workbench/bridge.js list                  # ツールカタログ (describe)
node workbench/bridge.js call flyTo '{"lat":35.36,"lng":138.73,"height":3000}'
node workbench/bridge.js serve                 # stdin/stdout JSONL セッション
#   → {"reqId":"1","name":"flyTo","args":{...}}
#   ← {"reqId":"1","result":{...}}

BRIDGE_ATTACH=9555 node workbench/bridge.js ... # 既存デバッグ Chrome に接続
```

### 経路B: ハーネスサーバ（本番 dial-out / エージェント常駐）

```bash
node workbench/bridge_server.js                # 127.0.0.1:8977 で待受（npm run bridge:server）
node workbench/bridge_server.js call getCamera '{}'
node workbench/bridge_server.js tools
curl -X POST http://127.0.0.1:8977/call -d '{"name":"flyTo","args":{"lat":35.68,"lng":139.69,"height":2000}}'
```

共有秘密: `BRIDGE_TOKEN=xxx node workbench/bridge_server.js` + インスペクタ `bridge: http://127.0.0.1:8977/?token=xxx`

## 設計上の制約（実測由来・重要）

### 1. QuickJS のマイクロタスク欠食
`extensionMessage` ハンドラ内で `promise.then(cb)` に応答処理を委ねると、継続は**次のイベントが来るまで実行されません**（ブリッジ応答だけ滞留する症状）。イベント起点の応答経路は同期で完結させる必要があり、`execLocalTool` はこのため同期関数化しています（Promise が返りうる場合のみ `then` フォールバック、`replyLocal` 参照）。

### 2. iframe → localhost の PNA/CORS
opaque origin の iframe から `127.0.0.1` への `Content-Type: application/json` POST はプリフライト + Private Network Access でブロックされます。GET（`/status`・EventSource）は通るため「受信は来るが返送だけ落ちる」非対称症状になります。対策は iframe 側の `text/plain` POST（シンプルリクエスト化）+ サーバ側の `Access-Control-Allow-Private-Network: true` 付与です。

### 3. ブリッジホスト = navigation-toolbar の理由
basemap-widget 拡張ctx は ddbExec/gpkgExec の巨大ペイロード（`dataB64` 数 MB〜）を中継するため、重いプロジェクト（既定 inspector の `qgis:` ZIP 取込等）や連続ホットリロードで QuickJS が `InternalError: out of memory`（`Proxy.unwrapResult`）を出して死亡し、ブリッジを道連れにする事象を実測確認しました。nav-toolbar 拡張は重い中継を持たず、iframe も `ui.show` 一度きりで永続します。**basemap 拡張の OOM はブリッジ以前から存在する既存問題**であり、大きな GPKG/プロジェクト読込で拡張コンテキスト自体が死ぬ可能性がある点に注意してください。

### 4. セキュリティ
- `bridge_server.js` は 127.0.0.1 のみにバインドしますが、**このポートへ到達できる者は接続中の地図を操作できます**。dev/エージェント用のエンドポイントとして扱ってください（必要なら `BRIDGE_TOKEN` を設定）。
- プラグイン側は常に **dial-out**（自分から接続）です。外部から iframe への侵入経路はありません。
- 既定では未接続時に一度だけ localhost をプローブします。公開配布で完全に抑止したい場合は `bridge: off` を設定してください。

## ファイル対応表

| ファイル | 役割 |
|---|---|
| `geo_suite/src/ai-chat.ts` | `dispatchToolCall` 共通化・`bridgeCall` 受信・`describe` カタログ・`execLocalTool` 同期化 |
| `geo_suite/src/navigation-toolbar.ts` | ブリッジリレー（拡張ctx）+ ブリッジクライアント `__geoBridge`（iframe） |
| `geo_suite/src/layers-and-tiles-list.ts` | `bridge:` インスペクタ行解析・`bridgeConfig` 転送・`requestBridgeConfig` 応答 |
| `workbench/bridge_server.js` | SSE+POST ハーネス（経路B・無依存） |
| `workbench/bridge.js` | CDP ドライバ（経路A・無依存・JSONL serve 対応） |
| `plugin/reearth.yml` | `bridge:` 行のドキュメント記述 |
