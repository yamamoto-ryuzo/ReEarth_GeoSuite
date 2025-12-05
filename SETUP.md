# RE:EARTH プラグイン開発環境セットアップガイド

## 🎯 環境構築完了しました！

RE:EARTH プラグイン開発環境の構築が完了しました。以下の手順でセットアップを完了してください。

## 📋 セットアップ手順

### 1. Node.js のインストール

まず、Node.js をインストールする必要があります：

1. [Node.js 公式サイト](https://nodejs.org/) にアクセス
2. LTS版（推奨版）をダウンロード
3. インストーラーを実行してインストール

### 2. 依存パッケージのインストール

Node.js のインストール後、以下のコマンドを実行：

```powershell
npm install
```

### 3. ビルドの実行

```powershell
# 本番ビルド
npm run build

# 開発モード（ファイル変更を監視）
npm run dev
```

## 🚀 使い方

### 新しいプラグインの作成

```powershell
.\scripts\create-plugin.ps1 -PluginName "マイプラグイン" -Description "説明文"
```

### ビルド

```powershell
npm run build
```

ビルドされたプラグインは `dist/` ディレクトリに出力されます。

### プラグインの配置

各プラグインは以下の構造でビルドされます：

```
dist/
├── hello-world/
│   ├── index.js
│   └── index.js.map
└── your-plugin/
    ├── index.js
    └── index.js.map
```

## 📦 含まれる機能

### ✅ 完成した機能

- ✅ TypeScript 開発環境
- ✅ Webpack ビルド設定
- ✅ ESLint コード品質チェック
- ✅ 型定義ファイル（RE:EARTH API）
- ✅ ユーティリティ関数
- ✅ サンプルプラグイン（Hello World）
- ✅ プラグインテンプレート
- ✅ 新規プラグイン作成スクリプト
- ✅ VS Code 推奨設定

### 📁 プロジェクト構造

```
yr_re_earth_plugin/
├── src/
│   ├── plugins/              # プラグイン格納ディレクトリ
│   │   └── hello-world/      # サンプルプラグイン
│   ├── types/                # 型定義
│   │   └── reearth.ts        # RE:EARTH API型定義
│   └── utils/                # ユーティリティ
│       └── helpers.ts        # 便利な関数集
├── templates/                # プラグインテンプレート
│   └── plugin-template/
├── scripts/                  # 開発スクリプト
│   └── create-plugin.ps1     # 新規プラグイン作成
├── dist/                     # ビルド出力（生成される）
├── package.json              # プロジェクト設定
├── tsconfig.json             # TypeScript設定
├── webpack.config.js         # Webpack設定
└── .eslintrc.json           # ESLint設定
```

## 🔧 開発ワークフロー

1. **プラグインを作成**
   ```powershell
   .\scripts\create-plugin.ps1 -PluginName "新しいプラグイン"
   ```

2. **コードを編集**
   - `src/plugins/[plugin-name]/index.ts` - メインロジック
   - `src/plugins/[plugin-name]/reearth.yml` - 設定

3. **開発モードで実行**
   ```powershell
   npm run dev
   ```
   ファイルを保存すると自動的に再ビルドされます。

4. **ビルド**
   ```powershell
   npm run build
   ```

5. **RE:EARTHにデプロイ**
   - `dist/[plugin-name]/` フォルダの内容をRE:EARTHにアップロード

## 💡 便利なコマンド

```powershell
# 型チェック
npm run type-check

# リント（コード品質チェック）
npm run lint

# ビルド成果物のクリーンアップ
npm run clean
```

## 📚 参考資料

### RE:EARTH API の主な機能

#### UI操作
```typescript
reearth.ui.show(html);              // UIを表示
reearth.ui.postMessage(message);    // メッセージ送信
reearth.ui.resize(width, height);   // UIサイズ変更
```

#### レイヤー操作
```typescript
reearth.layers.add(layer);          // レイヤー追加
reearth.layers.show(layerId);       // レイヤー表示
reearth.layers.hide(layerId);       // レイヤー非表示
```

#### カメラ操作
```typescript
reearth.viewer.camera.flyTo({       // カメラ移動
  lng: 139.7671,
  lat: 35.6812,
  height: 10000
});
```

#### プロパティ操作
```typescript
reearth.plugin.property.get(key);   // 設定取得
reearth.plugin.property.set(key, value); // 設定保存
```

## 🎓 サンプルプラグイン

### Hello World プラグイン

基本的な機能を含むサンプルプラグイン：
- UIの表示
- ボタンクリックイベント
- カメラ操作
- プラグインプロパティの使用

場所: `src/plugins/hello-world/`

## 🐛 トラブルシューティング

### ビルドエラーが出る
```powershell
npm run clean
npm install
npm run build
```

### TypeScript エラー
```powershell
npm run type-check
```

### ESLint エラー
```powershell
npm run lint
```

## 📞 サポート

問題が発生した場合は、以下を確認してください：
1. Node.js が正しくインストールされているか
2. `npm install` が正常に完了したか
3. TypeScriptのバージョンが互換性があるか

## 🎉 準備完了！

環境構築が完了しました。`npm install` を実行してプラグイン開発を始めましょう！
