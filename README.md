# Re:Earth_GeoSuite (geo_suite)プラグイン

**🌐 プロジェクトサイト**: [https://re-earth-geo-suite.vercel.app/](https://re-earth-geo-suite.vercel.app/)

**📝 Changelog**: [CHANGELOG.md](CHANGELOG.md) ・ **🏪 Marketplace**: https://marketplace.reearth.io/plugins/layers-and-tiles-list

[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat&logo=vercel)](https://re-earth-geo-suite.vercel.app/)

## 📋 概要

Re:Earth Visualizer 向け統合プラグイン「geo_suite」です。XYZ タイル管理、レイヤ一覧 UI、Terrain/Shadow トグル、HTML インフォメーション表示などの機能を提供します。

![プラグイン画面](/image/image-3.png)

## 🚀 使い方

**使い方は [プロジェクトサイト](https://re-earth-geo-suite.vercel.app/) をご覧ください。**

プロジェクトサイトには以下の情報が掲載されています：
- 詳細なインストール手順
- 各機能の使い方（レイヤー管理、Terrain/Shadow切替、Info表示など）
- Re:Earth Visualizer の関連リンク

## 配布・デプロイについて

運用方針（推奨）:

- サイト配信: Vercel にビルド・デプロイを任せます。リポジトリにはビルド成果物を置かず、ソースを管理してください（Vercel がビルドして公開します）。
- プラグイン配布: GitHub Release に ZIP（リリース資産）を添付して配布します。公式の配布 URL として Release アセットを利用してください。

<!-- 開発用メモは削除：ビルドはVercel/CIに委ね、配布はGitHub Releaseを推奨 -->

### 貢献

Issue や Pull Request を歓迎します。変更内容と再現手順を明記してください。

## リポジトリ構成（簡易）

```
ReEarth_GeoSuite/
├─ geo_suite/            # プラグイン本体のソース（`src/`）と設定
├─ plugin/               # 配布用のマニフェスト（`reearth.yml`）
├─ .github/              # GitHub Actions ワークフロー
├─ index.html, ryu.html  # サイト用の HTML
├─ README.md
├─ package.json
└─ vercel.json
```

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