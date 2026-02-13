# Re:Earth_GeoSuite (geo_suite)プラグイン

**🌐 プロジェクトサイト**: [https://re-earth-geo-suite.vercel.app/](https://re-earth-geo-suite.vercel.app/)

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://re-earth-geo-suite.vercel.app/)

## 📋 概要

Re:Earth Visualizer 向け統合プラグイン「geo_suite」です。XYZ タイル管理、レイヤ一覧 UI、Terrain/Shadow トグル、HTML インフォメーション表示などの機能を提供します。

![プラグイン画面](/image/image-3.png)

## 🚀 インストール・使い方

**詳細は [プロジェクトサイト](https://re-earth-geo-suite.vercel.app/) をご覧ください。**

プロジェクトサイトには以下の情報が掲載されています：
- プラグインのインストール方法
- 各機能の使い方
- プラグインURL・ZIPファイルURL
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