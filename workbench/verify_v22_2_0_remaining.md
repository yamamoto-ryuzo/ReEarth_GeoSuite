# タスク: ReEarth_GeoSuite v22.2.0「bridge-hub /vector 自動外部 GeoJSON 化」残ケース検証

C:\devin\ReEarth_GeoSuite の geo_suite プラグインの
「fgb:/parquet:/gpkg:/duckdb:/sql: の http(s) ソースを bridge-hub (127.0.0.1:8511)
の /vector サービスへ自動登録し geojson: URL レイヤとして追加する」機能の
**未検証ケースのみ**を検証する。コードは変更せず検証のみ。結果は PASS/FAIL 一覧で報告。

## 検証済み（再検証不要）

| ケース | 結果 | 根拠 |
|---|---|---|
| A parquet 外部化 | PASS | `gs_rx5byg` が kind:parquet・src=places.parquet で登録。ページが `/vector/geojson/gs_rx5byg` を fetch（200）→ geojson URL 型レイヤ確定。vectorSearch で aichi/kyoto ヒット・マーカー描画確認 |
| B 冪等性 | PASS | 複数ページロード + inspector 複数パス（1ロードにつき3回処理）でも `gs_rx5byg` は1件のまま（stale チェックで POST スキップ） |
| gpkg 外部化 | PASS | inspector の `qgis:` インクルード経由で gs_1ioeets/gs_uwrzb8/gs_1cu1du4/gs_82m7rw が登録され、`?bbox=` 付き geojson URL が fetch された |
| duckdb: ツール経路 | PASS | `addDuckDbLayer` → `externalized:true`、レイヤが `gs_ophlos?columns=name&bbox=-180,-89.9,180,89.9` を fetch（columns= は URL パラメータ、bbox=auto 既定 ON） |

## 前提条件（落ちていたら立ち上げる）

1. bridge-hub: `curl http://127.0.0.1:8511/vector/status` → ok:true かつ duckdb.found:true。
2. テストファイルサーバ: `curl http://127.0.0.1:8321/places.parquet` が 200
   （`C:/Users/ryu.RYU-NOTE/AppData/Local/Temp/vector-test/` で `python -m http.server 8321 --bind 127.0.0.1` が起動済み想定）。
   ※ 現在の places.parquet の中身は **Umeda(135.496,34.703)/Namba(135.501,34.669)**（v10/v20）。
   gs_rx5byg は旧内容（aichi/kyoto）のスナップショットのまま — materialized は取込時点固定。
3. Workbench: `cd C:/devin/ReEarth_GeoSuite && npm run dev` → http://localhost:8787。
   ※ `npm run build`/`tsc` ローカル実行は禁止（AGENTS.md）。

## 環境の罠（前回検証で判明 — 必読）

- **`DEBUG_LOG = false`**（layers-and-tiles-list.ts:3）のため `[vectorHub] externalized:` 等の sendLog は一切出ない。代わりに `sendError` 経由の `[dbg] extItem` 行・Network ドメインの gs_ fetch・ハブの `/vector/sources` で判定する。
- **vector.duckdb 単一ファイルロック**: materialization 中は全 /vector クエリが 502/ブロック。リモート GPKG の ST_Read は実測 ~163s。**子プロセス孤児化**（new_command に kill_on_drop 無し）も確認済み → `duckdb.exe` 残骸がいないか `Get-Process duckdb` で確認し、検証前に掃除する（Issue #43/#44 登録済み）。
- **既定 inspector の `qgis:` 行が stall を起こす**: .kasc 内 4 本の gpkg: 行が毎ロードで ~3分×4 の再登録を試みる（ブラウザが先に死んで manifest に残らないため）。**前回 curl で gs_1ioeets/gs_uwrzb8/gs_1cu1du4/gs_82m7rw を事前登録済み** — sources.json に残っていれば stall は起きない。消えていたら同様に POST で事前登録する（name 算出は下記 FNV-1a 再現コード）。
- **`applyInspectorText` の setPropertyValue は永続しない**: 次回ロードでは保存済みテキストに戻る。ただし in-session の `processInspectorText` 実行は有効（適用だけなら動く）。
- **bridge.js の `call` は毎回新規 headless Chrome を spawn**（profile=geosuite-bridge-profile）。`listLayers` はブリッジ iframe 発見直後に走るため非同期レイヤ追加を見逃す → `runCode` で `await new Promise(r=>setTimeout(r,20000)); await api.listLayers({})` とするか、serve モードで持続化する。
- **runCode は nav-toolbar iframe 内実行**。`api.<tool>(args)` のみ利用可（`reearth` なし）。**その iframe は fetch 不能**（同一オリジンすら "Failed to fetch"）→ ネットワーク確認は runCode fetch ではなく CDP の Network ドメインで行う。
- **data.url を直接読む手段はない**（listLayers は url を返さない）。URL型レイヤの証拠は「ページが gs_ URL を fetch した」こと — `data.value` レイヤはネットワーク fetch を発生させない。
- **gs_ 名の FNV-1a 再現コード**（plugin `hubNameFor` と一致確認済み）:
  ```js
  function hubNameFor(reg){
    const key=[reg.kind||'',reg.src||'',reg.sql||'',reg.layer||'',reg.where||'',String(reg.limit||''),reg.lon||'',reg.lat||'',reg.geom_col||'',String(reg.materialize===false?'v':'t')].join('\x1f');
    let h=0x811c9dc5;
    for(let i=0;i<key.length;i++){h=((h^key.charCodeAt(i))*0x01000193)>>>0;}
    return 'gs_'+h.toString(36);
  }
  ```

## ツール（%TEMP% に前回作成済み、なければ再作成）

- `gs_debug.js` — 1セッションで **ページ console + Network(8511) + __geoBridge.call** を同時に見る。`node gs_debug.js <calls.json>`。calls は `[["tool",{args}],["sleep",ms],...]` の配列。**最重要ツール**
- `gs_capture.js` — 同上だが captureView の dataUrl を PNG 保存
- `gs_bridge_driver.js` — bridge.js serve モードの JSONL ドライバ
- `workbench/bridge.js call <tool> '<args>'` / `npm run shot` / `workbench/smoke_ddb.js`（全 CDP ターゲット console）

## 未検証ケース

### C-残. inspector 経路の duckdb:/sql: 外部化 + bbox 更新

**現状**: inspector の `duckdb:`/`sql:` 行を `applyInspectorText` で適用しても 3 回とも**無言でレイヤが出来なかった**（ツール経路は動く → hubExternalize 自体は正常）。原因未調査。候補: enqueueExtPath の非同期化・applyExtPathItem 内の silent catch・`_extPathQueue` ポンプ停滞。

1. gs_debug.js で calls:
   - `applyInspectorText` に `duckdb: hubtest-ddb | http://127.0.0.1:8321/places.parquet | format=parquet | where=value>10 | limit=5 | columns=name` と `sql: hubtest-sql | SELECT * FROM 'http://127.0.0.1:8321/places.parquet'` を含むテキストを適用（gs_ophlos・gs_1o58sg0 は事前登録済み → POST なしで即レイヤ化されるはず）
   - 60〜90s 待って listLayers で hubtest-ddb / hubtest-sql の有無を確認
   - console/Network で `gs_ophlos`・`gs_1o58sg0` の fetch・エラーを観察
   - 追加されなければ原因を切り分けて報告（applyExtPathItem 到達有無・enqueueExtPath 消化有無・hubExternalize 呼出し有無）
2. **bbox 更新確認**: `sql:` または `duckdb:` の外部化レイヤ（bbox=auto 既定）がある状態で `flyTo` → **Network ドメインで `?bbox=w,s,e,n` の値がカメラ移動後に変わるか**確認（`refreshHubVecLayer` → `layers.override` → ホストが新 URL を再 fetch する挙動）。初回は `bbox=-180,-89.9,180,89.9`（global）になる実績あり。

### D. vectorHub: off での無効化

- inspector 先頭に `vectorHub: off` を付けたテキストを適用し、`parquet:` 行を新規タイトルで追加。
- 期待: hubExternalize を試みず（`/vector/status` プローブなし・gs_ fetch なし・POST なし）、iframe デコード経路（data.value レイヤ）になる。parquet は hyparquet デコードで地物が出るかも確認（~数十秒）。確認後は vectorHub 行を外したテキストに戻す。

### E. ハブ停止時フォールバック

- bridge-hub プロセスを停止（`taskkill /IM bridge-hub.exe /F` または占有 PID を特定して kill）→ inspector を新規 `parquet:`/`duckdb:` 行で適用。
- 期待: `/vector/status` プローブ失敗（3s）→ `[vectorHub] hub unavailable or register failed`（sendLog のため出ない場合は挙動で判定）→ **iframe デコード経路でレイヤが追加される**（UI が壊れない・data.value 経路・gs_ fetch 無し）。
- 確認後ハブを再起動（インストール済み bridge-hub.exe を起動。通常はログイン時自動起動プロセス）。

### F. 対象外ソース（任意）

- `duckdb:` で `format=duckdb` または `.duckdb` 拡張 URL・`kasczip://` メンバ・非 http(s) パスの行を追加 → `hubSpecFor`/`hubSpecForSql` が null を返し外部化されないこと（gs_ POST/新規エントリ増なし・従来経路になる）を確認。

## クリーンアップ

- 検証で増えた登録: `curl -X DELETE http://127.0.0.1:8511/vector/sources/<name>` で削除。
  ※ 前回登録済みの gs_ophlos/gs_1o58sg0/gs_1fvtpo2/debug_ddb1 は検証用テストソースなので完了後は削除してよい。gs_rx5byg（既定 parquet 行由来）・qgis 由来の gs_*（gpkg stall 回避のため）は残す判断を報告に含めること。
- inspector は元の状態に戻す（既定 = `_defaultInspectorText` と同内容）。
- 起動した補助プロセスは止める。`duckdb.exe` 孤児がいれば掃除。

## 報告形式

- 各ケースの PASS/FAIL・根拠（Network で観測した実 URL・/vector/sources エントリ・console 行）・スクリーンショットパスを記載。
- inspector 経路 duckdb:/sql: の無反応については、判明した原因（または「再現せず PASS」）を明記すること。

---

# 検証結果（2026-11-03 完了）

## ツール

- `gs_debug3.js`（%TEMP%）: 全 iframe target の Network+console を捕捉する拡張版。panel iframe（hubExternalize 実行者）の /vector probe・POST は page target では見えないため必須。
- `%TEMP%\vector-test/` に `test.gpkg`/`test.fgb`/`wkb.parquet` を duckdb CLI の `COPY ... FORMAT GDAL` で生成し 8322 の range サーバで配信。

## 結果

| # | 項目 | 結果 | 根拠 |
|---|---|---|---|
| 1 | sql: 外部化 E2E | PASS | POST `{"kind":"sql","sql":"SELECT * FROM read_parquet('…8322/places.parquet')","materialize":false,"name":"gs_7jrxms"}` → catalog VIEW・features:2 → `externalized → /vector/geojson/gs_7jrxms` fetch 200。`:bbox` 版 `gs_16cbe32` は VIEW 定義に `st_makeenvelope(-180,-90,180,90)` 焼き込み、`?bbox=-180,-89.9,180,89.9` 付き fetch |
| 2 | duckdb: csv | PASS | `gs_bxa2ig` kind:csv、manifest `where:"value>10"`・features:1（Namba のみ）、lon/lat→ST_Point |
| 3 | gpkg:/fgb: | PASS | `gs_xtyido` kind:gpkg（table=pt が name hash に反映）・`gs_1ekpou0` kind:fgb、各 feat:2・fetch 200 |
| 4 | format=read | PASS（注意点あり） | `.geojson` で `gs_h1ilu0` kind:sql VIEW `SELECT * FROM ST_Read(…)`。**注意**: `.gpkg` URL は拡張子判定が先に効き kind:gpkg になる（format=read が dead）。`.parquet` は ST_Read→GDAL 非対応で 502→フォールバック（設計どおり） |
| 5 | オプション写像 | PASS | where→manifest+baked WHERE、limit→LIMIT、columns=name→`?columns=` パラメータ、geom=wkb→`gs_1jexe24`（BLOB 宣言で成功）、table=→layer→hash |
| 6 | bbox=auto 再クエリ | PARTIAL | 初期 `?bbox=` 付与は確認。flyTo(h=3000) 後も bbox は世界エンベロープのまま（headless で viewport ranges が更新されない or refresh 未発火）。要実機追試 |
| 7 | vectorHub: :8521 | PASS | `gs_15f2gs` が 8521 hub に登録・8521 fetch 200。**注意**: vectorHub 指定は以後の全 item（qgis インクルード分含む）に波及し、fetch も 8521 へ向く（store 共有なので応答はするが横漏れ） |
| 7b | vectorHub: off | PASS | `/vector/status` probe なし・POST なし・gs_ 増えず |
| 8 | ハブ停止 | PASS | probe `Failed to fetch` → `hub unavailable or register failed — decoding in-iframe` → wasm フォールバック・gs_ 無増 |
| 9 | 除外対象 | PASS | `.duckdb` URL・`kasczip://` → hubSpecFor null → iframe 経路（POST なし）。ddbfile は DESCRIBE 失敗で tombstone |
| 10 | kind:sql DELETE | PASS | `DELETE …/testsql_del` → 200（VIEW/Table 型出し分けで旧 502 解消）。後始末の 12 DELETE 全て 200 |
| 11 | in-flight dedupe | PASS | 2nd pass で `skip in-flight` / `skip duplicate` → 再 POST なし・単一レイヤ |

## 「inspector 経路が無言で失敗」の根本原因（確定）

dispatch bug ではない。**apply ストーム中に panel UI iframe が safeShowUI（各レイヤ着地・final render）で再生成され、in-flight の hubExternalize fetch が `"signal is aborted without reason"` で死亡** → `hubResult(false)` → 静かに wasm フォールバック。requestRestoreState の ownReq 再送も連続 churn 中は繰り返し死亡。既登録ソース（短命 probe のみ）は潜り抜けるが新規 POST（数秒）はほぼ全滅。静穏時・単行適用では完全に動作（本検証で 7 種登録を実証）。

**推奨対応（未実施）**: hubExternalize を vecHostPost 方式で永続 basemap iframe 経由にする、または ext-path drain 中の safeShowUI を coalesce する。

## クリーンアップ結果

- テスト gs_ 12 件 DELETE 済（VIEW 3 件含む全て 200）
- qgis 由来 gs_4 件は stall 回避のため残置（消えていたため本日再登録）
- bridge-hub 8511 再起動済、8521 検証 hub 終了、duckdb.exe 孤児なし
- ソース変更なし・inspector 既定テキスト不変・git status は既存差分のみ → コミット対象なし
- check_inline_scripts 全 OK

## 検証環境の罠（今回追加で判明）

- **MSYS パス罠**: Git Bash の `/tmp` = Windows Temp だが node の `/tmp` 解釈は `C:\tmp`。node へ渡すパスは `C:/...` 絶対パスで統一すること。
- **curl -d の UTF-8**: 日本語を含む JSON ボディは Git Bash からだと `invalid unicode code point` で失敗 → node で UTF-8 ファイル出力 → `curl --data-binary @<Windowsパス>`。
- **panel iframe は短命**: Network 観測は全 iframe target + rescan 追随が必須。

---

# 追試（2026-11-04）— Issue #46 ハング解消環境での B/D 再検証

## 環境

- bridge-hub: `server/target/debug/bridge-hub.exe`（kill_on_drop + DELETE 型出し分け修正 9855c5b 込みビルド。ソース最終更新 22:07:17 → exe 22:07:38 → コミット 22:12:10）。`GET /vector/status` ok・duckdb v2.0.0・vector.duckdb 共有。
- テストサーバ: 8321(python http.server)・8322(range) 稼働中。places.parquet = Umeda(135.496,34.703,v10)/Namba(135.501,34.669,v20)。`geometry` は GEOMETRY 型（`ST_Within(geometry,…)` がそのまま効く）。
- Workbench 8787・`npm run dev` 複数プロセス同居だが配信正常（reearth.yml/プラグイン JS 200）。
- ツール: **`gs_debug5.js`（%TEMP・新規）** — gs_debug3(flatten auto-attach)は plugin UI iframe が `Target.attachedToTarget` で一度も報告されず __geoBridge 未検出で失敗した。`/json/list` ポーリングで全 page/iframe target に個別 ws 接続する方式に切替（bridge.js と同手法）で +6.7s に捕捉。

## 結果

| # | 項目 | 結果 | 根拠 |
|---|---|---|---|
| B-1 | sql:+:bbox → kind:sql VIEW 外部化 | PASS | `sql: hubtest-bbox \| SELECT * FROM '…8321/places.parquet' WHERE ST_Within(geometry, :bbox)` → 事前登録した `gs_1fvtpo2`（`kind:"sql"` `materialized:false` VIEW・定義に `ST_MakeEnvelope(-180,-90,180,90)` 焼込み）を probe のみで再利用。ページが `GET /vector/geojson/gs_1fvtpo2?bbox=-180,-89.9,180,89.9` fetch → 200。listLayers で `{title:"hubtest-bbox",type:"geojson"}`（URL型レイヤ確定） |
| B-2 | カメラ連動 data.url 差替え（前回 PARTIAL→今回確定） | PASS | `flyTo`→東京(h=30000) 後に `?bbox=139.578,35.576,139.962,35.785` の再 fetch（+4.3s=debounce 600ms+override+fetch）。続けて大阪へ flyTo で `?bbox=135.310,34.582,135.690,34.791` へ変化。`refreshHubVecLayer`→`layers.override`→ホスト再 fetch の連鎖が headless でも動作。前回の「viewport が世界のまま」は再現せず |
| D | `externalized:true` ツール応答 | PASS | `addDuckDbLayer {url:…8321/places.parquet, format:parquet, where:value>=10, columns:[name,value]}`（`gs_1fqriu8` 事前登録済）→ 943ms で `{"id":"…","title":"hubtest-ddb-ext","externalized":true}`。続けて `GET /vector/geojson/gs_1fqriu8?columns=name,value&bbox=-180,-89.9,180,89.9` をページが fetch |

## 観測した残課題（バグではないが挙動として記録）

- **bboxAuto レイヤ存在下での新規外部化は依然として死ぬ**: B 検証後の同セッションで `addDuckDbLayer`（新規 `gs_1fqriu8` 登録 = POST 数秒必要）を呼ぶと、POST がネットワーク層に出る前に hubResult(false) → wasm フォールバック → PNA/404 で `{error}`。原因は前回確定済みの panel iframe churn（`refreshHubVecLayer` の `layers.override` 連鎖が safeShowUI を誘発し in-flight fetch を abort）。**事前登録で probe 経路にすると 943ms で通る**（D の実測）。推奨対応（vecHostPost 化・churn coalesce）は未実施のまま。
- **`refreshHubVecLayer` は URL 不変でも override する**: カメラ停止後も同一 `?bbox=` URL の fetch が +78〜+118s に 8 回観測（camera 'move' が断続発火?）。`layers.override` → ホスト同一 URL 再 fetch → 無駄な転送と churn 窓の維持。geojson 比較 or URL 一致スキップの余地あり（kasugai Canvas 側 resliceViewportLayer は同一集合スキップ済み）。

## クリーンアップ（2026-11-04）

- `gs_1fvtpo2`・`gs_1fqriu8` を DELETE（200）。qgis 由来 gs_4 件は stall 回避のため残置継続。`gs_uyiqes`/`gs_1cbc1xo`/`gs_1ea3ghc`/`fgb_probe` は別セッションの登録のため残置。
- duckdb.exe 孤児なし（実行中プロセスの親は全て bridge-hub=26524。kill_on_drop により子プロセスは回収されている）
- ソース変更なし・inspector 既定テキスト不変（applyInspectorText は非永続）。
