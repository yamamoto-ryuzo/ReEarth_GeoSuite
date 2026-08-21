# リポジトリ運用ルール

## ソースファイル
- プラグインの本体は `geo_suite/src/layers-and-tiles-list.ts` です。
- ナビゲーションツールバーは `geo_suite/src/navigation-toolbar.ts` です。

## ビルド
- `npx tsc -p geo_suite/tsconfig.json` で `geo_suite/build/` にコンパイルされます。
- `npm run build` は bash スクリプトのため Windows PowerShell ではそのまま実行できません。
- 本番では Vercel 上で `npm run build` が実行されるため、Windows ではローカル確認用に `npx tsc` まで実行するのが基本です。

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
