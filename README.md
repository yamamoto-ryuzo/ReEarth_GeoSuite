# Re:Earth_GeoSuite (geo_suite)プラグイン

**🌐 プロジェクトサイト**: [https://re-earth-geo-suite.vercel.app/](https://re-earth-geo-suite.vercel.app/)

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://re-earth-geo-suite.vercel.app/)

## 📋 概要

Re:Earth Visualizer 向け統合プラグイン「geo_suite」です。XYZ タイル管理、レイヤ一覧 UI、Terrain/Shadow トグル、HTML インフォメーション表示などの機能を提供します。

![プラグイン画面](/image/image-3.png)

## 🚀 インストール・使い方

### クイックスタート

1. **プラグインをインストール**
   - Re:Earth Visualizer のプラグイン画面を開く
   - 「GitHubリポジトリをインポート」を選択
   - リポジトリURL: `yamamoto-ryuzo/ReEarth_GeoSuite` または `https://github.com/yamamoto-ryuzo/ReEarth_GeoSuite` を入力

2. **シーンに追加**
   - ウィジェットタブから「Layers & Tiles」を追加
   - 画面左側にプラグインUIが表示されます

3. **XYZタイルを追加**
   - Inspector（歯車アイコン）を開く
   - 「タイル一覧」→「+ 追加」
   - XYZ タイル URL を入力（例: `https://example.com/{z}/{x}/{y}.png`）

**詳細な使い方は [プロジェクトサイト](https://re-earth-geo-suite.vercel.app/) をご覧ください。**

プロジェクトサイトには以下の情報が掲載されています：
- 詳細なインストール手順
- 各機能の使い方（レイヤー管理、Terrain/Shadow切替、Info表示など）
- ZIPファイルURL
- Re:Earth Visualizer の関連リンク

## 🛠️ 開発者向け

### 開発フロー

このプロジェクトは **Vercel** での自動ビルド・デプロイを採用しています。
ローカルでのビルドは開発・テスト用途のみです。

```bash
# 依存関係のインストール
npm install

# ローカルテスト用ビルド（開発時のみ）
npm run build
```

生成されたファイルは `dist/` に出力されます。

### プロジェクト構成

```
ReEarth_GeoSuite/
├── geo_suite/                  # プラグイン本体
│   ├── src/
│   │   └── layers-and-tiles-list.ts   # TypeScriptソースコード
│   ├── build/                  # TSコンパイル出力（一時、.gitignore）
│   ├── layers-and-tiles-list.js       # 配布用JS（buildからコピー）
│   ├── tsconfig.json           # TypeScript設定
│   └── reearth.yml             # プラグインマニフェスト
├── scripts/
│   ├── build_plugin.js         # メインビルドスクリプト
│   ├── build_ts_if_present.js  # TS自動コンパイル
│   └── package_geo_suite.py    # ZIPパッケージ作成
├── dist/                       # ビルド出力（.gitignore）
│   ├── geo_suite/              # プラグインファイル
│   ├── artifacts/
│   │   └── geo_suite.zip       # 配布用ZIPファイル
│   ├── index.html              # プロジェクトサイト
│   └── ryu.html                # Info表示用サンプル
├── index.html                  # プロジェクトサイトのソース
├── ryu.html                    # Info表示用HTMLサンプル
├── vercel.json                 # Vercelデプロイ設定（CORS設定含む）
├── package.json                # npm設定（TypeScript依存）
└── README.md
```

### CI/CDフロー（Vercel）

```
GitHubへプッシュ
   ↓
Vercelが自動検知
   ↓
1. TypeScriptコンパイル: src/*.ts → build/*.js
2. ファイル配置: geo_suite/, index.html, ryu.html → dist/
3. ZIPパッケージ作成: geo_suite/ → dist/artifacts/geo_suite.zip
   ↓
Vercel CDNに配信
   ↓
https://re-earth-geo-suite.vercel.app/
```

### 技術スタック

- **開発言語**: TypeScript 5.6+
- **ビルド**: Node.js + Python3
- **CI/CD**: Vercel（自動ビルド・デプロイ）
- **デプロイ**: Vercel（自動CI/CD）
- **配信**: Vercel CDN + CORS対応

### 貢献

Issue や Pull Request を歓迎します。変更内容と再現手順を明記してください。

## 📄 ライセンス

MIT License

## 👤 作者

[yamamoto-ryuzo](https://github.com/yamamoto-ryuzo)

---

**免責事項**: 本システムは個人のPCで作成・テストされたものです。ご利用によるいかなる損害も責任を負いません。
<p align="center">
  <a href="https://giphy.com/explore/free-gif" target="_blank">
    <img src="https://github.com/yamamoto-ryuzo/QGIS_portable_3x/raw/master/imgs/giphy.gif" width="500" title="avvio QGIS">
  </a>
</p>
## Re:Earth プラグイン — GitHub からの公開とインストール

以下は Re:Earth 向けプラグインを GitHub 公開リポジトリとして配布し、Re:Earth からインストールできるようにする手順です。

### 必要な前提
- **必須ファイル**: プラグインのルートに `reearth.yml` を配置する。
- **マニフェスト内容**: `reearth.yml` で `id`, `name`, `version`, `extensions` などを定義する。
- **拡張実装**: `extensions` に定義した拡張の ID と同名の実装ファイル（例：`test-widget` → `test-widget.js`）を同じディレクトリに置く。

### 最小マニフェスト例
```yaml
id: test-plugin
name: Test plugin
version: 1.0.0
extensions:
   - id: test-widget
      type: widget
      name: Test
```

### GitHub リポジトリ側の準備
- ディレクトリ例:
   - your-plugin/
      - `reearth.yml`
      - `your-extension.js`（例：`test-widget.js`）
- GitHub で public（公開）リポジトリにする（private は不可）。
- `main` ブランチを使うのが無難だが、ブランチやアーカイブ指定も可能。
- `README.md` にプラグイン概要・使い方を記載すると親切。

### Re:Earth 側でのインストール手順（概要）
1. Re:Earth のプロジェクト設定画面を開き、「Plugins」を選択。
2. 「Personally Installed」からプラグインライブラリを開く。
3. インストール方法で「GitHub Public Repository」を選択。
4. リポジトリ URL を入力して「Continue」を押す。
5. 通知が表示されればインストール成功。ウィジェットやブロック一覧に拡張が現れる。

### 許可される URL 例
- `https://github.com/USER/REPO`（`main` ブランチを使用）
- `https://github.com/USER/REPO.git`
- `https://github.com/USER/REPO/tree/BRANCH_NAME`（ブランチ指定）
- `https://github.com/USER/REPO/archive/BRANCH_OR_TAG.zip`（アーカイブ指定）

### Marketplace に公開したい場合
- 不特定多数向けに配布するには、Re:Earth 公式マーケットプレイス（`reearth-marketplace`）を利用する。公式ドキュメントに従って公開フローを進めてください。

---

## GitHub リポジトリでの直接配布（このリポジトリの場合）

このリポジトリは `plugin/` ディレクトリにプラグインを配置しており、Re:Earth のインポート画面で次の URL を使って直接インストールできます。

- `https://github.com/yamamoto-ryuzo/ReEarth_GeoSuite/tree/main/plugin`

この方法では `plugin/reearth.yml` と `plugin/layers-and-tiles-list.js` がプラグインのルートとして扱われます。別ブランチやタグを指定する場合は `tree/BRANCH_NAME/plugin` のように指定してください。
