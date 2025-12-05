import type { ReearthAPI } from '../../types/reearth';
import { logger, getProperty } from '../../utils/helpers';

// プラグインのメインエントリーポイント
export default function (reearth: ReearthAPI) {
    logger.info('Hello World Plugin initialized');

    // プラグインプロパティの取得
    const message = getProperty(reearth, 'message', 'Hello, RE:EARTH!');

    // UIの表示
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
        .container {
          text-align: center;
        }
        h1 {
          color: #333;
        }
        button {
          padding: 10px 20px;
          font-size: 16px;
          cursor: pointer;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
        }
        button:hover {
          background-color: #45a049;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${message}</h1>
        <button onclick="handleClick()">Click Me!</button>
      </div>
      <script>
        function handleClick() {
          parent.postMessage({ action: 'buttonClicked' }, '*');
        }
      </script>
    </body>
    </html>
  `;

    reearth.ui.show(html);

    // メッセージハンドラー（親ウィンドウからのメッセージを受信）
    window.addEventListener('message', (event) => {
        if (event.data.action === 'buttonClicked') {
            logger.info('Button clicked!');
            // カメラを東京に移動
            reearth.viewer.camera.flyTo({
                lng: 139.7671,
                lat: 35.6812,
                height: 10000,
                heading: 0,
                pitch: -45,
                roll: 0,
            });
        }
    });
}
