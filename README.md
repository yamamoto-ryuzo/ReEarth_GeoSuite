# RE:EARTH Plugin Collection

yamamoto-ryuzo による RE:EARTH プラグイン集の開発環境

## 📋 概要

このリポジトリは、RE:EARTH プラットフォーム向けのプラグインを効率的に開発・管理するための環境です。TypeScript + Webpack を使用し、複数のプラグインを一括管理できます。

## 🚀 クイックスタート

### 必要要件

- Node.js 18.x 以上
- npm または yarn

### インストール

```bash
npm install
```

### ビルド

```bash
# 全プラグインをビルド
npm run build

# 開発モード（ウォッチモード）
npm run dev
```

### 型チェック

```bash
npm run type-check
```

### リント

```bash
npm run lint
```

## 📁 プロジェクト構造

```
yr_re_earth_plugin/
├── src/
│   ├── plugins/           # プラグインディレクトリ
│   │   └── hello-world/   # サンプルプラグイン
│   │       ├── index.ts
│   │       └── reearth.yml
│   ├── types/             # 型定義
│   │   └── reearth.ts
│   └── utils/             # ユーティリティ
│       └── helpers.ts
├── templates/             # プラグインテンプレート
│   └── plugin-template/
├── scripts/               # 開発スクリプト
│   └── create-plugin.ps1
├── dist/                  # ビルド出力
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## 🔧 新しいプラグインの作成

PowerShell スクリプトを使用して簡単に新しいプラグインを作成できます：

```powershell
.\scripts\create-plugin.ps1 -PluginName "My Plugin" -Description "My awesome plugin"
```

または手動で作成：

1. `src/plugins/` に新しいディレクトリを作成
2. `index.ts` - プラグインのメインコード
3. `reearth.yml` - プラグイン設定ファイル

## 📦 プラグインの構造

### index.ts

```typescript
import type { ReearthAPI } from '../../types/reearth';
import { logger } from '../../utils/helpers';

export default function (reearth: ReearthAPI) {
  logger.info('Plugin initialized');
  
  // プラグインロジックを実装
  const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <h1>My Plugin</h1>
    </body>
    </html>
  `;
  
  reearth.ui.show(html);
}
```

### reearth.yml

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "yamamoto-ryuzo",
  "extensions": [
    {
      "id": "main",
      "type": "widget",
      "name": "My Widget"
    }
  ]
}
```

## 🛠️ 開発ガイド

### RE:EARTH API

プラグインから利用可能な主なAPI：

- `reearth.ui.show(html)` - UI を表示
- `reearth.layers.add(layer)` - レイヤーを追加
- `reearth.viewer.camera.flyTo(position)` - カメラを移動
- `reearth.plugin.property.get(key)` - プロパティを取得

詳細は `src/types/reearth.ts` を参照してください。

### ユーティリティ関数

`src/utils/helpers.ts` に便利な関数があります：

- `logger` - ログ出力
- `getProperty` - 安全なプロパティ取得
- `setProperty` - 安全なプロパティ設定

## 📝 含まれるプラグイン

### Hello World

基本的なサンプルプラグイン。UI表示とカメラ操作のデモを含みます。

## 🔍 トラブルシューティング

### ビルドエラー

```bash
npm run clean
npm install
npm run build
```

### 型エラー

```bash
npm run type-check
```

## 📄 ライセンス

MIT License

## 👤 作者

yamamoto-ryuzo

## 🔗 関連リンク

- [RE:EARTH 公式サイト](https://reearth.io/)
- [RE:EARTH ドキュメント](https://docs.reearth.io/)
- [RE:EARTH Plugin API](https://github.com/reearth/reearth-plugin-api)
