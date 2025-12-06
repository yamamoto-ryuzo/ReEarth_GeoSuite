# ReEarth_GeoSuite

Re:Earth版 geo_suite を目指す統合プラグイン／ツール集

## 📋 概要

このリポジトリは、Re:Earth プラットフォーム向けの「geo_suite」相当機能の実装・統合を目指す開発基盤です。JS（JavaScript）中心、軽量で素早く動かせる構成です。

## 🚀 クイックスタート

### 必要要件

- Node.js 18.x 以上
- npm または yarn

### パッケージング（ZIP作成）

```powershell
# Python版
python scripts/package_plugin.py --plugin-id <plugin-id>

# PowerShell版
.\n+scripts\package-plugin.ps1 -PluginId <plugin-id>
```

#### geo_suite をZIP化する

```powershell
# 既定のソース: C:\github\ReEarth_GeoSuite\geo_suite
python scripts/package_geo_suite.py

# ソースや出力を指定
python scripts/package_geo_suite.py -s C:\github\ReEarth_GeoSuite\geo_suite -o artifacts\geo_suite.zip

# 除外パターンの追加: geo_suite\ .geosuiteignore に記載
# 例)
#   dist/**/*.map
#   **/*.md
```

### リント

```powershell
npm run lint
```

## 📁 プロジェクト構造

```
yr_re_earth_plugin/
├── src/
│   ├── plugins/           # プラグインディレクトリ
│   │   └── hello-world/   # サンプルプラグイン
│   │       ├── index.ts
│   │       └── reearth.yml
│   └── utils/             # ユーティリティ（任意）
│       └── helpers.ts
├── templates/             # プラグインテンプレート
│   └── plugin-template/
├── scripts/               # 開発スクリプト
│   └── create-plugin.ps1
├── dist/                  # ビルド出力
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

### 新しいプラグインの作成

PowerShell スクリプトでJSテンプレートから作成できます：

```powershell
.
scripts\create-plugin.ps1 -PluginName "My Plugin" -Description "My awesome plugin"
```

または手動で作成：

1. `src/plugins/` に新しいディレクトリを作成
2. `index.js` - プラグインのメインコード
3. `reearth.yml` - プラグイン設定ファイル

## 📦 プラグインの構造

### index.js

```javascript
export default function (reearth) {
  const html = `
    <style>
      @import url("https://reearth.github.io/visualizer-plugin-sample-data/public/css/preset-ui.css");
    </style>
    <div class="primary-background text-center p-16 rounded-sm">
      <p class="text-3xl font-bold">My Plugin</p>
    </div>
  `;
  reearth.ui.show(html);
}
```

### reearth.yml

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "yamamoto-ryuzo",
  "extensions": [
    {
      "id": "main",
      "type": "widget",
      "name": "My Widget"
    }
  ]
}
```

## 🛠️ 開発ガイド

### RE:EARTH API（主なもの）

- `reearth.ui.show(html)` - UI を表示
- `reearth.ui.postMessage(message)` / `reearth.on('message', handler)` - UI連携
- `reearth.layers.select(layerId)` - レイヤー選択
- `reearth.viewer.camera.flyTo(position)` - カメラ移動
- `reearth.plugin.property.get/set(key, value)` - 設定取得/保存

### ユーティリティ（任意）

- ログや設定ヘルパーを必要に応じてJSで用意してください

## 📝 含まれるプラグイン

### Hello World

基本的なサンプルプラグイン。UI表示とカメラ操作のデモを含みます。

## 🔍 トラブルシューティング

### パッケージングの失敗

```powershell
python scripts/package_plugin.py --plugin-id <plugin-id>
# または
.
scripts\package-plugin.ps1 -PluginId <plugin-id>
```

## 🗺️ シーン選択と権限の確認

- **正しいシーンを開く:** RE:EARTH にログイン後、対象の「プロジェクト」を開き、左サイドバーの「シーン一覧」からアップロード先のシーンを選択して開きます。画面右上のシーン名で現在開いているシーンを必ず確認してください。
- **組織/スペースの確認:** 画面上部の組織（またはワークスペース）が目的のものになっているか確認します。別組織・別スペースのシーンにはアップロードできません。
- **必要な権限:** プラグインのアップロードや有効化には通常 `Admin` または `Editor` 権限が必要です。`Viewer` 権限ではアップロードできません。アップロードボタンや「プラグイン」メニューが見えない場合は権限不足の可能性があります。
- **アップロード場所:** 対象シーンを開いた状態で「設定」→「プラグイン」（または「プラグイン管理」）から ZIP をアップロードします。別のシーンを開いたままアップロードすると `invalid scene id` が発生することがあります。
- **ZIP の構成:** ZIP のルート直下に `reearth.yml` と `index.js`（その他アセット）が存在する必要があります。フォルダ階層が一段余分（例: `my-plugin/` の下にファイル）になっていないか確認してください。付属の `scripts/package-plugin.ps1` は正しい構成で圧縮します。
- **よくある原因:** 目的と異なるシーンを開いている／権限不足／ZIP ルート構造不正／`reearth.yml` の形式不正（YAML が壊れている）。
- **チェックリスト:** 現在のシーン名・組織/プロジェクト・自身のロール（Admin/Editor）・ZIP ルート構成・`reearth.yml` の `id` とフォルダ名の整合性。
- **エラー対応:** `invalid scene id` が出る場合は、正しいシーンに切り替えてから再アップロードし、権限が不足していないか管理者へ確認、ZIP を再作成して再試行してください。

## 📄 ライセンス

MIT License

## 👤 作者

yamamoto-ryuzo

## 🔗 関連リンク


### 参考: プラグイン API リファレンス
- ReEarth Web のプラグイン型定義（開発時の参照に便利）
  - https://github.com/reearth/reearth-web/blob/main/src/components/molecules/Visualizer/Plugin/types.ts

### 参考: プラグインマニフェスト（バックエンド）
- マニフェスト例（builtin manifest）
  - https://github.com/reearth/reearth-backend/blob/main/pkg/builtin/manifest.yml
- マニフェストのJSONスキーマ
  - https://github.com/reearth/reearth-backend/blob/main/schemas/plugin_manifest.json

### 実装ベストプラクティス（重要）
- UI通信の基本: `reearth`（WASM/QuickJS）と iframe は `postMessage`/`on('message')` で連携します。ペイロードはJSONシリアライズ可能な値のみを使用してください（Blob/ArrayBuffer不可）。
- Listenerの順序: `reearth.ui.on('message', handler)` を `reearth.ui.show(html)` より前に登録し、iframe側は `parent.postMessage({type:'ready'})` を送ることで同期を確立します。
- 競合対策: iframeの `ready` は0msと数百ms後に再送し、WASM側は `uiReady` 到達前の送信をバッファリングして `ready` 受信後にフラッシュします。最終フォールバックとして一定時間後に `uiReady=true` を採用することで「読み込み中」停滞や「message port closed」頻度を下げられます。
- ベースタイル取得: まず `reearth.scene.property.tiles` を優先し、存在しない場合のみビジュアライザ由来の情報へフォールバックする設計が安定的です。
- Ionの扱い: Cesium Ion はトークン必須で 401 を返すことがあります。UI上で Ion を既定で除外し、必要時にトグルで表示切替、バッジでトークン要否を明示するとUXが向上します。

## Basemap Simple (TS)
- `geo_suite/basemap-simple.ts`: Re:Earth のシーン/ビジュアライザ/レイヤーからベースマップURLを包括的に収集する最小ウィジェットの TypeScript 実装。
- Web の `Visualizer/Plugin/types.ts` を参考に、`tiles`/`imageryProvider`/`source`/`options.provider` 等の代表的キーを探索します。

### ビルド（TS → JS 生成）
`geo_suite` 配下のTSを個別コンパイルします：

```powershell
# geo_suite/tsconfig.json を使用
npx tsc -p geo_suite

# 成果物: geo_suite/basemap-simple.js が同ディレクトリに生成されます
```

webpack を使う場合は `webpack.config.js` に `geo_suite/basemap-simple.ts` をエントリ追加し、生成された JS を ZIP に同梱してください。

主なポイント（スキーマから抜粋）
- `id`, `name`, `version` は必須。`extensions` 配下にウィジェット/ブロックなどを定義。
- `widgets[].entry` などのエントリポイントは、WASM側JS（QuickJS）から開始される前提。
- `ui` はiframe側のHTML文字列または外部URL参照。静的アセットはzip同梱不可のため、埋め込みまたは外部ホスト参照。
- `postMessage` のペイロードはJSONシリアライズ可能な値のみ（Blob/ArrayBuffer不可）。
