# Re:Earth_GeoSuite (geo_suite)プラグイン

[サンプルサイト](https://c-01kcwqbkykrk15apgxeqrvr6rv.visualizer.reearth.io)

## 📋 概要

　Re:Earth 向け統合プラグイン「geo_suite」の開発基盤です。XYZ タイル管理やレイヤ一覧 UI、Terrain/Shadow トグル、HTMLによるインフォメーションなど、Visualizer プラグインとして必要な機能を提供します。  
　レイヤの管理はインスペクターにより行われ、複数のレイヤを管理可能です。  
　HTMLのインフォメーションについても、インスペクターにURLを登録して管理可能です。  
 
![alt text](/image/image-3.png)

## 🔗 関連リンク

## Visualizer
Visualizerユーザーマニュアル＜ビジュアライザープラグインとは？＞  
https://eukarya.notion.site/19616e0fb165802491f4e091b5e8e754  
開発者向けサイト※対応言語は英語のみです。  
https://visualizer.developer.reearth.io/ja/  
※プラグイン開発・レイヤー操作・API 挙動の最新情報はこちらにまとめられております。  

### API
https://visualizer.developer.reearth.io/ja/plugin-api/viewer/  
 
## 🚀 セットアップと使い方

本プロジェクトは **Vercel** を利用した開発・配信フローへ移行しました。GitHub にプッシュするだけで自動的にビルドされ、Re:Earth にインストール可能な URL が発行されます。

### ☁️ Vercel での開発フロー（推奨）

1. **Vercel プロジェクトの作成**:
   - Vercel ダッシュボードでこのリポジトリをインポートします。
   - 設定ファイル (`vercel.json`) により、CORS 設定やビルドコマンドが自動的に適用されます。

2. **Re:Earth へのインストール**:
   - Vercel デプロイ後に発行される URL (`https://<your-project>.vercel.app`) を使い、Re:Earth のプラグイン画面から「公開リポジトリからインストール」を選びます。

   | 用途 | URL の例 | 特徴 |
   | :--- | :--- | :--- |
   | **開発用** | `.../geo_suite/reearth.yml` | コード修正後、Push するだけで Re:Earth 側も最新化されます。 |
   | **配布用** | `.../artifacts/geo_suite.zip` | 自動生成された ZIP ファイルを直接ダウンロード・インストールします。 |

3. **静的ファイルのホスティング**:
   - リポジトリ内の `ryu.html` なども Vercel 上に配信されます。Inspector の Info URL に `https://.../ryu.html` と入力して利用可能です。

### 🛠 ローカルでのパッケージ作成（手動）

従来どおり手動でパッケージを作成することも可能です。

- **前提**: Node.js と Python3 がインストールされていること。
- **コマンド**:
  ```bash
  npm run package
  # または
  python scripts/package_geo_suite.py
  ```
- **生成物**: `artifacts/geo_suite.zip` が作成されます。これを Re:Earth に直接アップロードして利用します。

### 📂 主要ファイル構成

- `geo_suite/layers-and-tiles-list.js`: レイヤー一覧の UI と親フレーム（Visualizer）とのメッセージ連携を実装。
- `scripts/package_geo_suite.py`: パッケージ作成用スクリプト（Python）。Vercel 上でもこのスクリプトが実行されます。
- `samplejs/`: 動作サンプル／テスト用の JS コード。

- **貢献について**: Issue や Pull Request を歓迎します。変更点の説明と再現手順を添えてください。

### Inspector から XYZ タイルを追加する手順

- Visualizer で本プラグイン（`Layers & Tiles` ウィジェット）をシーンに追加し、右側の Inspector（プラグイン設定）を開きます。
- Inspector 内の「XYZ タイル URL」欄に以下のようなタイル URL を入力します（`{z}/{x}/{y}` プレースホルダを含む）：

  Example:

  https://assets.cms.reearth.io/assets/53/47dsaf197-1c45-48se-8369-fc3142ddd0aa1/用地取得計画/{z}/{x}/{y}.png

- 入力後、数秒以内にプラグインが Inspector のプロパティを読み取り、指定した URL を元に XYZ タイルのレイヤが追加されます。
- 既存レイヤとの重複チェックは未実装のため、同じ URL を複数回入力すると重複追加される場合があります。重複防止を希望する場合は対応します。

## 🔖 バージョン履歴  

- **v4.0.0　HTMLのインフォメーションタブ追加。**  
　　　![alt text](/image/image-2.png)    
- **v3.0.0　ShadowのON/OFFスイッチ追加。**    
- **v2.0.0　TerrainのON/OFFスイッチ追加。**   
　　　![alt text](/image/image-1.png)   
- **v1.0.0　Inspectorから複数のXYZタイルを追加可能にし、マニフェストを整理。**     
　　　![alt text](/image/image.png)  

## ⚠️ 注意点 / 次の改善候補

- `geo_suite/reearth.yml` をパッケージ化する際、ルートに `index.js` が無い場合はスクリプトがワーニングを出します（現在は `artifacts/geo_suite.zip` が作成されることを確認済み）。必要であれば `index.js` を追加して ZIP のルート構成を調整してください。
- 現在、レイヤー一覧内の表示切替チェックボックスに同一 `id="#show-hide-layer"` が複数生成されます。HTML の仕様上は `id` は一意であるべきなので、必要なら `class` に置き換える修正を行えます。

もし README に追記してほしい具体的な手順（例: デプロイ手順、Re:Earth 側での有効化手順、スクリーンショット） があれば教えてください。

## 📄 ライセンス

MIT License

## 👤 作者

yamamoto-ryuzo

## 免責事項

本システムは個人のPCで作成・テストされたものです。  
ご利用によるいかなる損害も責任を負いません。

<p align="center">
  <a href="https://giphy.com/explore/free-gif" target="_blank">
    <img src="https://github.com/yamamoto-ryuzo/QGIS_portable_3x/raw/master/imgs/giphy.gif" width="500" title="avvio QGIS">
  </a>
</p>
