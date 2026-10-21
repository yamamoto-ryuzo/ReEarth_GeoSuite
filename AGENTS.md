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

## i18n（多言語化）
- UI は英語ベースの i18n で多言語化されています（v18.2.0〜）。
- `layers-and-tiles-list.ts` 先頭の `GEO_I18N` 辞書に全言語分のキーを定義し、生成 HTML の `<script>` 内へ `window._GEO_I18N` として JSON 埋め込みしています。
- UI 文字列は生成 HTML 内で `data-i18n` / `data-i18n-ph` / `data-i18n-title` / `data-i18n-aria` / `data-i18n-html` 属性または `t(key)` 呼び出しで解決します。新しい UI 文字列を追加する際は必ず `en` キーを基準に全ロケールへ追加してください。
- 言語は `navigator.language` から自動検出し、インスペクターテキストの `lang: <コード>` で固定可能（`lang: auto` で自動検出）。未対応言語は英語へフォールバックします。
- 対応言語: en / ja / zh-CN / zh-TW / ko / es / fr / de / it / pt / ru / nl / pl / uk / tr / ar / hi / id / th / vi
- `basemap-widget.ts` も独自辞書で同方式。`lang:` 設定は拡張間メッセージ（`action: 'lang'`）でレイヤーパネルから転送されます。
- レイヤー名・カメラタイトル・凡例タイトル・地物属性などのユーザーデータは翻訳しません。

## SHARE タブ・URL 出力の仕様
- Re:Earth Visualizer の UI iframe は `allow-same-origin` なしのサンドボックスのため、親ページの URL 本体（`https://...` 部分）を取得できません。
- SHARE タブの「Generate Link」は完全な URL を生成せず、常に `?lat=...&lng=...` 形式のクエリ文字列のみを出力します。
- `reearth.viewer.viewport` API は `query`（`?` 以降のパラメータ）のみを提供し、URL 全体は提供しません。
