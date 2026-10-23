# リポジトリ運用ルール

## ソースファイル
- このリポジトリには Re:Earth プラグイン（拡張 3 つ）が含まれています。
  - `geo_suite/src/layers-and-tiles-list.ts` — レイヤー / タイル管理・属性パネル・位置情報共有（メイン）
  - `geo_suite/src/navigation-toolbar.ts` — ナビゲーションツールバー
  - `geo_suite/src/basemap-widget.ts` — ベースマップ選択
- マニフェストは `plugin/reearth.yml`。拡張の `entry` は `workbench/plugin-build/` 内のコンパイル済み JS を参照します。

## ビルド
- `npx tsc -p geo_suite/tsconfig.json` で `geo_suite/build/` にコンパイルされます。
- `npm run build` は bash スクリプトのため Windows PowerShell ではそのまま実行できません。
- 本番では Vercel 上で `npm run build` が実行されるため、ローカルでは `geo_suite/build/` へのコンパイルや `npm run build` を実行しないでください。最終的なビルドは Vercel に任せます。
- ローカル動作検証用のコンパイルは `npm run dev` が `workbench/plugin-build/`（gitignore 済み）に出力するので、これだけを使ってください。
- 万が一ビルドを実行した場合、必ず `geo_suite/build/` や `vercel/output/` などの不要な成果物を削除してからコミットしてください。

## ローカル動作検証（Workbench・完全自動化）
- Re:Earth Visualizer 公式の **Workbench**（プラグイン開発用スタンドアロン Viewer、v1.0.0-beta.16.28 / plugin API 2.1.0）を `workbench/` に組み込んでいます。
- `npm run dev` 一発で全自動ループが起動します（初回は Workbench 成果物を GitHub Release から自動ダウンロード・sha256 検証・展開）:
  1. `geo_suite/src/*.ts` 保存 → `tsc --watch` が `workbench/plugin-build/` へ再コンパイル
  2. `plugin/reearth.yml` 保存 → `scripts/prepare_default_inspector.js` で `_defaultInspectorText` へ自動反映 → 再コンパイル
  3. `workbench/plugin-build/` の変更を `server.js` が検知 → `/plugin/events` SSE で `change` イベント → Workbench が自動リロード
- ブラウザで `http://localhost:8787/` を開く（`?dev-plugin=` 付きの workbench へリダイレクト）。ステータスが「ライブ」なら保存即リロードが有効です。
- `npm run shot -- [url] [out.png] [待機ms]` でヘッドレス Chrome（CDP）によるスクリーンショット + コンソールログ取得が可能。エージェントはこれで UI 変更を自力検証できます（既定 url は `http://localhost:8787/`）。
- `workbench/dist-workbench/`・`plugin-build/`・`.chrome-profile/`・`*.png` は gitignore 済み。コミット対象は `workbench/*.js` のスクリプトのみです。
- Workbench のバージョンを上げるときは `workbench/setup.js` の `WORKBENCH_VERSION` を変更してください。
- 注意: Workbench のプラグイン API は 2.1.0。`reearth.viewer.viewport` の `query` しか取れない等、SHARE タブの制約（下記）は Workbench でも同じです。

## デプロイ
- 本サイトは **Vercel** でデプロイされます。
- `main` ブランチに push すると Vercel が自動で `npm run build` を実行し、成果物を `/vercel/output/static` に生成してデプロイします。
- リポジトリに `vercel/output/` をコミットする必要はありません。
- サイトのソースはルートの `index.html` と `ryu.html` です。

## 配布資産
- 配布用 ZIP（`geo_suite.zip`）は Vercel ビルド時に生成されます。
- `release/` および `vercel/output/` は `.gitignore` で除外されています。
- GitHub Release 用の ZIP は `npm run build` 実行後に `dist/artifacts/geo_suite.zip` として生成されます。

## バージョン管理
- バージョンは `package.json` と `plugin/reearth.yml` の両方に記述します。
- `CHANGELOG.md` にもリリース内容を記載します。

## 生成 HTML 内 `<script>` のエスケープ罠（重要）
- 各拡張の UI は TS ソース内のテンプレートリテラル（`` ` ``）に `<style>…<div>…<script>…` を直書きして `reearth.ui.show(html)` で埋め込んでいます。
- **テンプレートリテラルはバックスラッシュを 1 段食います**: ソースに `\'` `\/` `\s` と書くとランタイム HTML では `'` `/` `s` になり、inline `<script>` の文字列・正規表現リテラルを破壊します（例: `'user\'s'` → `'user's'` で全体が SyntaxError になり UI が完全に無反応になる）。
- inline script 側に残したいエスケープは `\\'` `\\/` `\\s` のように二重に書いてください。
- `node workbench/check_inline_scripts.js` で全拡張のランタイム script が構文チェックを通るか一括検証できます（ソースをそのまま `node --check` してもこのバグは検出できません。テンプレートリテラル評価後の文字列を検査する必要があります）。

## i18n（多言語化）
- UI は英語ベースの i18n で多言語化されています（v18.2.0〜）。
- `layers-and-tiles-list.ts` 先頭の `GEO_I18N` 辞書に全言語分のキーを定義し、生成 HTML の `<script>` 内へ `window._GEO_I18N` として JSON 埋め込みしています。
- UI 文字列は生成 HTML 内で `data-i18n` / `data-i18n-ph` / `data-i18n-title` / `data-i18n-aria` / `data-i18n-html` 属性または `t(key)` 呼び出しで解決します。新しい UI 文字列を追加する際は必ず `en` キーを基準に全ロケールへ追加してください。
- 言語は `navigator.language` から自動検出し、インスペクターテキストの `lang: <コード>` で固定可能（`lang: auto` で自動検出）。未対応言語は英語へフォールバックします。
- 対応言語: en / ja / zh-CN / zh-TW / ko / es / fr / de / it / pt / ru / nl / pl / uk / tr / ar / hi / id / th / vi
- `basemap-widget.ts` も独自辞書で同方式。`lang:` 設定は拡張間メッセージ（`action: 'lang'`）でレイヤーパネルから転送されます。
- レイヤー名・カメラタイトル・凡例タイトル・地物属性などのユーザーデータは翻訳しません。

## Re:Earth プラグイン API の参照先
- プラグイン API の仕様確認は必ず以下の公式ソースで行ってください。推測で API を使わないこと。
  - 概要・仕組み: https://docs.reearth.io/ja/developer/plugin/overview/what-is-a-plugin/
  - API リファレンス目次: https://docs.reearth.io/ja/developer/plugin/api-reference/
    - viewer: .../api-reference/viewer/（`overrideProperty`, `capture`, `open`, `viewer.tools.*`）
    - camera: .../api-reference/camera/（`flyTo`, `lookAt`, `setView`, `getGlobeIntersection` 等）
    - sketch: .../api-reference/sketch/（`setTool`, `overrideOptions`, `on("create")`）
    - data:   .../api-reference/data/（`clientStorage` の get/set/delete）
    - その他 event / layers / popup / extension の各ページも同ツリー配下
- ドキュメントに無い API や挙動が不明な場合は、公式リポジトリの実装を直接参照してください:
  - https://github.com/reearth/reearth-visualizer
  - 拡張 API の実装は `web/src/beta/lib/reearth-ui` / `web/src/beta/lib/cesium` / `web/src/beta/features/Visualizer` など `web/src/...` 配下にあります。`type ExtensionContext` / `reearth.*` の定義ファイルを検索すると API 一覧を確認できます。
- Workbench 同梱版のプラグイン API は 2.1.0 なので、新しい API（例: `viewer.tools.*` 系）は存在しない可能性があります。使う前に `typeof reearth.viewer.tools === 'object'` のような実行時検出でフォールバックを組み込んでください。

## SHARE タブ・URL 出力の仕様
- Re:Earth Visualizer の UI iframe は `allow-same-origin` なしのサンドボックスのため、親ページの URL 本体（`https://...` 部分）を取得できません。
- SHARE タブの「Generate Link」は完全な URL を生成せず、常に `?lat=...&lng=...` 形式のクエリ文字列のみを出力します。
- `reearth.viewer.viewport` API は `query`（`?` 以降のパラメータ）のみを提供し、URL 全体は提供しません。

## DuckDB-Wasm の実行ホスト（重要）
- `duckdb:` レイヤーのクエリは **basemap-widget の UI iframe 内で実行される**。理由: レイヤーパネルの iframe は `safeShowUI`（`ui.show` の再呼出し）のたびに破棄・再生成されるため、そこに置くと wasm インスタンス（`window._ddbModule`）がレイヤー追加のたびに失われ、初期化（wasm インスタンス化 + httpfs/spatial/parquet 拡張ロード）が毎回発生していた。basemap-widget は `ui.show` を初期化時に一度だけ呼ぶため iframe が永続し、インスタンスが温存される（計測: 初回 ~17s → 2回目以降 ~3-10s。旧構成では 13-22s が毎回発生）。
- メッセージ経路: パネル `ddbPost` → `reearth.extension.postMessage(basemap-widget, {action:'ddbExec',...})` → basemap 拡張が `postToUI({action:'ddbLoad',...})` で自分の iframe へ転送 → iframe が `ddbAck`（受理即時）/`ddbResult`（完了時）を返し、basemap 拡張が送信元へ `extensionMessage` で返送 → パネルの `handleDdbResult` が処理。
- **フォールバック**: パネルは `ddbExec` 送信後 3 秒以内に `ddbAck` が来なければホスト iframe 消失（widget 非表示等）とみなし、自分の iframe で `ddbLoad` を再実行する（`layers-and-tiles-list.ts` の `ddbPost`/`_ddbHostDead`）。パネル iframe 側にも同一の `ddbLoad` ハンドラを残してあるので、両者を同期して変更すること。
- `window._ddbModule` は Promise キャッシュ（初期化失敗時は null に戻る）。iframe 側の DuckDB コードは `basemap-widget.ts` と `layers-and-tiles-list.ts` に2か所ある（WKB デコーダ `vecWkbToGeoJson` も同様）。
- **ブラウザ再起動・再訪では DuckDB アセットは必ず再ダウンロードされる**（実測: 再起動後 16.9s ≈ コールド）。プラグイン UI iframe は `allow-same-origin` なしサンドボックス（opaque origin）のため、HTTP キャッシュは同一ドキュメント内の再 fetch すら全バイト再転送され、CacheStorage/localStorage/IndexedDB/ServiceWorker はアクセス自体が SecurityError。KASUGAI の Service Worker + CacheStorage 方式は構造上移植不可。拡張側 `clientStorage` への wasm バイナリ保存は容量・メッセージ橋の制約から実用性が低い。「セッション毎に1回 ~15s 初期化、その後は warm」が現状の最適。

## Workbench の resize script 注入バグ（重要）
- Workbench は iframe HTML の `</body>` 直前に `_zushi_resize` スクリプトを挿入するが、**JS 文字列リテラル内の `'</body></html>'` にも誤マッチ**しスクリプト中間へ注入 → 注入された `</script>` で script 要素が早期終了し iframe が無反応になる。
- 対策: 生成 HTML の JS 文字列内には生の `</body>`/`</script>` を書かず `'<\/body><\/html>'` のようにエスケープする。

## QuickJS 拡張コンテキストには setTimeout が無い
- 拡張側での遅延は `waitViaUiTimer(ms)`（UI iframe がブラウザ `setTimeout` を実行し `timerDone` で返送）を使うこと。直接 `setTimeout` を書くと ReferenceError。
