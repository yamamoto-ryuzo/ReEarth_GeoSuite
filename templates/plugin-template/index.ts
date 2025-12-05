import type { ReearthAPI } from '../../types/reearth';
import { logger } from '../../utils/helpers';

// プラグインのメインエントリーポイント
export default function (reearth: ReearthAPI) {
  logger.info('{{PLUGIN_NAME}} initialized');

  // TODO: プラグインロジックをここに実装
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: sans-serif;
          padding: 20px;
          margin: 0;
        }
      </style>
    </head>
    <body>
      <h1>{{PLUGIN_NAME}}</h1>
      <p>Plugin is running!</p>
    </body>
    </html>
  `;

  reearth.ui.show(html);
}
