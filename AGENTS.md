# リポジトリ運用ルール

## ソースファイル
- プラグインの本体は `geo_suite/src/layers-and-tiles-list.ts` です。
- ナビゲーションツールバーは `geo_suite/src/navigation-toolbar.ts` です。

## ビルド
- `npx tsc -p geo_suite/tsconfig.json` で `geo_suite/build/` にコンパイルされます。
- `npm run build` は bash スクリプトのため Windows PowerShell ではそのまま実行できません。
- Windows では手動で `npx tsc` 後、必要な成果物を `release/` および `vercel/output/static/` にコピーしてください。

## デプロイ
- 本サイトは **Vercel** でデプロイされます。
- `vercel/output/static/` 配下のファイルは配布用静的ファイルとしてリポジトリで管理されています。
- `index.html`（ルート）がサイトのソースであり、`vercel/output/static/index.html` へ反映させる必要があります。

## 配布資産
- リリース ZIP は `release/` ディレクトリの内容から `vercel/output/static/geo_suite.zip` として生成されます。
- ソース変更時に合わせて更新が必要な成果物:
  - `release/layers-and-tiles-list.js`
  - `release/navigation-toolbar.js`
  - `release/reearth.yml`
  - `vercel/output/static/layers-and-tiles-list.js`
  - `vercel/output/static/navigation-toolbar.js`
  - `vercel/output/static/reearth.yml`
  - `vercel/output/static/index.html`
  - `vercel/output/static/geo_suite.zip`

## バージョン管理
- バージョンは `package.json` と `plugin/reearth.yml` の両方に記述します。
- `CHANGELOG.md` にもリリース内容を記載します。
