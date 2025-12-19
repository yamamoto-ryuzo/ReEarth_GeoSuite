# ReEarth_GeoSuite (geo_suite) — v3.0.0

Re:Earth版 `geo_suite` を目指す統合プラグイン／ツール集

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

### Inspector から XYZ タイルを追加する手順

- Visualizer で本プラグイン（`Layers & Tiles` ウィジェット）をシーンに追加し、右側の Inspector（プラグイン設定）を開きます。
- Inspector 内の「XYZ タイル URL」欄に以下のようなタイル URL を入力します（`{z}/{x}/{y}` プレースホルダを含む）：

  Example:

  https://assets.cms.reearth.io/assets/53/47f197-1c45-484e-8369-fc31420a12ab/用地取得計画/{z}/{x}/{y}.png

- 入力後、数秒以内にプラグインが Inspector のプロパティを読み取り、指定した URL を元に XYZ タイルのレイヤが追加されます。
- 既存レイヤとの重複チェックは未実装のため、同じ URL を複数回入力すると重複追加される場合があります。重複防止を希望する場合は対応します。

- ## 🔧 更新履歴（2025-12-19）

- **v3.0.0 — 2025-12-19**
  - プラグイン ID/名前を `geo_suite` に統一し、`package.json` とマニフェストの `version` を `3.0.0` に更新しました。
  - `README.md` を v3.0.0 に合わせて更新しました。

- `geo_suite/reearth.yml` を YAML 形式へ修正し、プラグイン ID を `geo_suite` に変更しました。
- UI に「Terrain トグル」を追加しました。UI 側は `geo_suite/layers-and-tiles-list.js` の上部に配置され、ON/OFF で `parent.postMessage({ action: "activateTerrain" })` / `deactivateTerrain` を送信します。拡張側は受信して `reearth.viewer.overrideProperty` で地形（terrain）と地表の深度テストを切替します。
- 起動時の自動カメラ移動（初期 `reearth.camera.flyTo`）を削除しました。
- トグルの表示をコンパクト化し、テキストを左、ボタン（トグル）を右に配置しました。

## 🔖 バージョン履歴

- **v2.0.0 — 2025-12-19**
  - 複数のXYZタイル（レイヤ）をInspectorから追加できるようになりました（`タイル一覧` のリスト化）。
  - リスト項目は `レイヤ名` を代表表示フィールドとして使用します。
  - マニフェストのスキーマを公式仕様に合わせて整理しました。

-- **v1.1.0 — 2025-12-18**
  - `geo_suite/reearth.yml` を YAML 形式へ修正し、プラグイン ID を `geo_suite` に変更しました。

## ⚠️ 注意点 / 次の改善候補

- `geo_suite/reearth.yml` をパッケージ化する際、ルートに `index.js` が無い場合はスクリプトがワーニングを出します（現在は `artifacts/geo_suite.zip` が作成されることを確認済み）。必要であれば `index.js` を追加して ZIP のルート構成を調整してください。
- 現在、レイヤー一覧内の表示切替チェックボックスに同一 `id="#show-hide-layer"` が複数生成されます。HTML の仕様上は `id` は一意であるべきなので、必要なら `class` に置き換える修正を行えます。

もし README に追記してほしい具体的な手順（例: デプロイ手順、Re:Earth 側での有効化手順、スクリーンショット） があれば教えてください。



