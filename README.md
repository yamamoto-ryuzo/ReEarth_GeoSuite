# ReEarth_GeoSuite

Re:Earth版 geo_suite を目指す統合プラグイン／ツール集

## 📋 概要

このリポジトリは、Re:Earth プラットフォーム向けの「geo_suite」相当機能の実装・統合を目指す開発基盤です。JS（JavaScript）中心、軽量で素早く動かせる構成です。

## 📄 ライセンス

MIT License

## 👤 作者

yamamoto-ryuzo

## 🔗 関連リンク

## Visualizer
Visualizerユーザーマニュアル＜ビジュアライザープラグインとは？＞  
https://eukarya.notion.site/19616e0fb165802491f4e091b5e8e754  
開発者向けサイト※対応言語は英語のみです。  
https://visualizer.developer.reearth.io/ja/  
※プラグイン開発・レイヤー操作・API 挙動の最新情報はこちらにまとめられております。  
### API
https://visualizer.developer.reearth.io/ja/plugin-api/viewer/  
 
## 免責事項

本システムは個人のPCで作成・テストされたものです。  
ご利用によるいかなる損害も責任を負いません。

<p align="center">
  <a href="https://giphy.com/explore/free-gif" target="_blank">
    <img src="https://github.com/yamamoto-ryuzo/QGIS_portable_3x/raw/master/imgs/giphy.gif" width="500" title="avvio QGIS">
  </a>
</p>

## 🚀 セットアップと使い方

- **前提**: Node.js と Python3（ビルド用スクリプト実行）がインストールされていることを推奨します。

- **ローカルでの確認**:
  - `geo_suite/layers-and-tiles-list.js` がプラグイン UI のサンプルです。Re:Earth Visualizer のプラグインとして読み込むと、レイヤー一覧表示・表示切替・FlyTo 操作等の挙動を確認できます。

- **パッケージ作成**:
  - `scripts/package_geo_suite.py` を使ってパッケージを作成します。生成物は `artifacts/` に出力されます。

- **主要ファイル**:
  - `geo_suite/layers-and-tiles-list.js`: レイヤー一覧の UI と親フレーム（Visualizer）とのメッセージ連携を実装。
  - `scripts/package_geo_suite.py`: パッケージ作成用スクリプト（Python）。
  - `samplejs/`: 動作サンプル／テスト用の JS コード。

- **貢献について**: Issue や Pull Request を歓迎します。変更点の説明と再現手順を添えてください。

## 🔧 更新履歴（2025-12-18）

- `geo_suite/reearth.yml` を YAML 形式へ修正し、プラグイン ID を `reearth-geo-suite` に変更しました。
- UI に「Terrain トグル」を追加しました。UI 側は `geo_suite/layers-and-tiles-list.js` の上部に配置され、ON/OFF で `parent.postMessage({ action: "activateTerrain" })` / `deactivateTerrain` を送信します。拡張側は受信して `reearth.viewer.overrideProperty` で地形（terrain）と地表の深度テストを切替します。
- 起動時の自動カメラ移動（初期 `reearth.camera.flyTo`）を削除しました。
- トグルの表示をコンパクト化し、テキストを左、ボタン（トグル）を右に配置しました。

## ⚠️ 注意点 / 次の改善候補

- `geo_suite/reearth.yml` をパッケージ化する際、ルートに `index.js` が無い場合はスクリプトがワーニングを出します（現在は `artifacts/geo_suite.zip` が作成されることを確認済み）。必要であれば `index.js` を追加して ZIP のルート構成を調整してください。
- 現在、レイヤー一覧内の表示切替チェックボックスに同一 `id="#show-hide-layer"` が複数生成されます。HTML の仕様上は `id` は一意であるべきなので、必要なら `class` に置き換える修正を行えます。

もし README に追記してほしい具体的な手順（例: デプロイ手順、Re:Earth 側での有効化手順、スクリーンショット） があれば教えてください。



