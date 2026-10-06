# リポジトリ運用ルール

## ソースファイル
- このリポジトリには **2 つの Re:Earth プラグイン**が含まれています。
  - `geo_suite/src/layers-and-tiles-list.ts` — レイヤー / タイル管理・属性パネル・位置情報共有（メイン）
  - `geo_suite/src/navigation-toolbar.ts` — ナビゲーションツールバー

## ビルド
- `npx tsc -p geo_suite/tsconfig.json` で `geo_suite/build/` にコンパイルされます。
- `npm run build` は bash スクリプトのため Windows PowerShell ではそのまま実行できません。
- 本番では Vercel 上で `npm run build` が実行されるため、ローカルでは `npx tsc` や `npm run build` を実行しないでください。最終的なビルドは Vercel に任せます。
- 万が一ビルドを実行した場合、必ず `geo_suite/build/` や `vercel/output/` などの不要な成果物を削除してからコミットしてください。

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
