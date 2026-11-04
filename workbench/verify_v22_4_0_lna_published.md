# 検証メモ: v22.4.0 LNA 自動アンロック × 公開シーンの Service Worker（2026-11-04）

## 問い
公開シーン（`*.visualizer.reearth.io`）でプローブレイヤ（`data.url` → `http://127.0.0.1:8511/vector/probe.geojson` の一時 geojson レイヤ）が Chrome の LNA 許可プロンプトを出せるか。

## 結論
**出せない。** 公開サイトの AssetSecurity SW（`/sw.js`・scope `/`）が fetch ハンドラで全リクエストを `respondWith(fetch(e))` 仲介するため、文書発の loopback fetch も SW コンテキスト起点の再送出になる。SW は権限プロンプトをアンカーする document を持たず、`prompt` 状態のまま即座に `ERR_FAILED` で死ぬ（ページ console に LNA エラーすら出ない）。→ 公開 Visualizer では `aiHub:`/`vectorHub:`/`bridge:` への **https トンネル URL 指定が必須**（docs/bridge-hub.html・AGENTS.md に反映済み）。

## 環境
- Chrome/156.0.8078.80（headed・`--enable-unsafe-swiftshader`）、実 bridge-hub v6.19.0 が 127.0.0.1:8511 で稼働中
- 対象シーン: `https://c-01kcwqbkykrk15apgxeqrvr6rv.visualizer.reearth.io/`（geo_suite 稼働・`_hubInstallCfg.endpoint=http://127.0.0.1:8511` 確認）
- 手法: 生 CDP。`window.__lna` フラグで fetch の pending/resolve/reject を観測 + Log/Network/SW ターゲット attach

## 実測
| ケース | 結果 |
|---|---|
| シーン: `navigator.serviceWorker.controller` | `…/sw.js`（制御中） |
| シーン: page-context `fetch(probe.geojson)`、perm=prompt | **err:Failed to fetch / 314ms**（プロンプトなし・console に LNA エラーなし） |
| example.com: 同一 fetch、perm=prompt（SW なし対照） | **PENDING >10s**（= プロンプトが実際に開いた = headed の判別子） |
| SW ターゲット（`…/sw.js`）内で `fetch(/health)` | `[sw req] GET 127.0.0.1:8511/health` → `[sw fail] net::ERR_FAILED` |
| シーン: `localNetworkAccess` を CDP grant → page fetch / SW-context fetch | 双方失敗（perm query=granted でもネットワーク層は拒否） |
| example.com: CDP grant 後の fetch | 失敗（`Permission was denied … loopback`）— CDP grant は実プロンプト許可と等価でない可能性。実機の人間クリック許可のみが正本フロー |

## SW 側の該当コード（`https://<scene>.visualizer.reearth.io/sw.js`）
```js
self.addEventListener("fetch", (t) => {
  const e = t.request;
  if (e.method !== "GET")            { t.respondWith(fetch(e)); return; }
  if (!T.shouldIntercept(e))         { t.respondWith(fetch(e)); return; } // 127.0.0.1 はここ
  t.respondWith(ae(e));                                                  // protectedDomains のみ認証付与
});
```
登録は `globals-*.js` 内 `{proxyUrl: tileServerBaseUrl, protectedDomains:[tileHost], namespace:"reearth-visualizer"}` で、タイル認証用だがスコープ `/` なので全リクエストを通す。`shouldIntercept` は `127.0.0.1` を通さないが、**通さない場合も `respondWith(fetch(e))` で SW 起点 fetch になる**のが本質。

## 補足
- 検証スクリプトは `%TEMP%\lna_sw_test*.js`（使い捨て・未コミット）。
- ヘッドレスではプロンプトが出ないため判別不能。headed + 「pending ならプロンプト有・即 reject なら無」で判別した。
- プラグイン iframe（about:srcdoc・opaque origin）からの `/health` プローブも失敗（従来どおり）。シーン上のプラグインは v22.3.0+（`_hubInstallCfg` 存在）。プローブレイヤの有無に関わらず結論は変わらない（SW 仲介は全リクエストに効く）。
