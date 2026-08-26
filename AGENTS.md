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

## SHARE タブ・URL 取得の制限
- Re:Earth Visualizer の UI iframe は `allow-same-origin` なしのサンドボックスのため、`window.parent.location.href` / `document.referrer` / `window.location.href` から親ページの URL 本体（`https://...` 部分）を取得することはできません。
- `reearth.viewer.viewport` API は `query`（`?` 以降のパラメータ）のみを提供し、URL 全体は提供しません。
- したがって、SHARE タブの「Generate Link」などで完全な URL を生成するには、ユーザーが Inspector に `baseurl: https://...` を設定する必要があります。
- `baseurl` が未設定の場合は、`?lat=...&lng=...` 形式のクエリ文字列のみを出力します。
