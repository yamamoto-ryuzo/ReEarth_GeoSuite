# Changelog

## v22.2.0
- 新規: bridge-hub `/vector` サービスへの自動外部 GeoJSON 化 — `fgb:`/`parquet:`/`gpkg:`/`duckdb:` の http(s) ソースを、検出できた bridge-hub（`vector.status` で疎通確認）へ `POST /vector/sources` で登録し、`geojson: http://<hub>/vector/geojson/<name>` の素の URL レイヤとして追加。ネイティブ DuckDB CLI が永続 `.duckdb` に取り込むため、DuckDB-Wasm の ~15s 初期化・opaque origin キャッシュ不可・拡張ctx 4MB 制約を全て回避し、同一ソースは `gs_<hash>` の決定的名で再取込みせず共有される。`where=`/`limit=`/`table=`/`lon=`/`lat=`/`geom=` は登録ボディへ、`columns=` は geojson URL の `?columns=` へマップ。kasczip メンバ・`.duckdb` ファイルは対象外で従来どおり iframe デコード。ハブ未到達・登録失敗時も既存デコード経路へフォールバックするため挙動は環境非依存。
- 新規: インスペクタ行 `vectorHub:` — `off` で自動外部化を無効化、`http://host:port` で接続先を指定（省略時は `aiHub:` の値、それも無ければ `127.0.0.1:8511` を自動検出）。
- 実装メモ: ハブ呼出しはパネル iframe の `hubExternalize` ハンドラで probe（GET /vector/status 3s）→ sources 照合 → 必要時のみ register（text/plain POST・プリフライト不要）を1往復で実施。`_hubPending` は ownReq 再送対象で iframe 再生成にも自己修復、`armPendingTtl` でトゥームストーン化。
- 拡張: `sql:` レイヤーと AI ツール `addDuckDbLayer` も外部化対象に追加 — クエリは `kind:"sql"` の VIEW（materialize:false）として登録し、`:bbox` はビュー内で世界範囲エンベロープへ置換して実フィルタは `?bbox=` URL パラメータへ移譲。`duckdb:` の `format=read` は `SELECT * FROM ST_Read(url)` の kind:sql ビューに変換。
- 拡張: 外部化レイヤーの `bbox=auto` 対応 — `duckdb:`/`gpkg:`/`sql:` の geojson URL に viewport エンベロープを `?bbox=` として付与し `_ddbLayers` へ `engine:'hubvec'` で登録。カメラ移動時は `refreshHubVecLayer` が `layers.override` で `data.url` を差し替えホストが再取得（ctx 横断ゼロ・4MB 上限非該当）。
- 変更: 登録名ハッシュ（`hubNameFor`）に `sql`/`materialize` をキー追加し kind:sql を冪等化。iframe の stale 判定は kind:sql では既存エントリを fresh 扱い（マニフェストに sql 文は保存されないため名前一致=同一クエリ）。
- 修正: 起動時に `parquet:`/`fgb:`/`gpkg:`/`duckdb:` 等の拡張経路レイヤが二重追加されていた問題 — init の `processInspectorText` がポーリング用キャッシュ `_lastInspectorLayersJson` を設定していなかったため、起動直後の poll が同一テキストを必ず再処理し、非同期完了のキュー項目が両方とも遅延 title dedupe を通過していた。init で処理したテキストをキャッシュへ事前設定＋`applyExtPathItem` 冒頭に `isLayerLoading`（in-flight ⏳マーカー）チェックを追加し、再適用・連続適用でも二重追加しない。
- 修正: `sql:` インスペクタ行がレイヤとして追加されなかった問題 — sql 項目は `url` を持たず `addXyzLayersFromArray` の `if (!u) continue` で捨てられていたため、`sql:` 構文（DuckDB-Wasm クエリ・kind:sql ハブ外部化含む）が dead code 化していた。`query` を持つ項目を url ガードより先に拡張経路キューへ送るよう修正。

## v22.1.0
- 修正: ベクター索引が `data.value` のオブジェクト形式 FeatureCollection をスキップしていた問題 — ブリッジ越しの Proxy 配列は `Array.isArray` が偽を返すため `{type,features}` のままでは `features` 未設定となり、市区町村名/都道府県名等のレイヤが Attr/検索索引から抜け落ちていた。array-like（数値 length）を実配列へ材料化して索引化。また索引走査を `forEach`（全要素をブリッジ越しに読む）から上限5万地物の for ループへ変更し、Proxy 要素読みを実際に制限 — 取込中の間欠的な QuickJS ctx OOM 死亡（UI 無応答の原因）の主要ベクターを低減。
- 修正: ベクター索引（Attr/検索の内部インデックス）が `Proxy(Error)` でレイヤを丸ごと落としていた問題 — `l.computed.features`/`l.data.value` はブリッジ越しのライブ Proxy で、getter が投げると従来はそのレイヤが索引から完全に抜け落ちていた。computed アクセスを個別 try でガードし、失敗・パース不能時は `data.url` を持つレイヤを `missingSources`（iframe が URL を直接 fetch）へ回して索引を維持。エラーログは Proxy 越しに読めなかった `Proxy(Error)` から、防御的に抽出したメッセージ＋値の形状（型/サイズ/先頭80文字）へ改善。
- 修正: プロジェクト取込直後にビューアが数十秒フリーズする問題を緩和 — 結果到着ごとの `safeShowUI` がパネル iframe を都度再生成し、再生成 iframe がロード時に無条件で `getVectorFeatureIndex` を要求、ctx 側が都度 全ベクターレイヤの同期スキャンを実行していた。`getVectorFeatureIndex` を世代デバウンス(300ms)でバースト集約＋索引を dirty フラグ/キャッシュペイロード化（未変更なら再構築せず応答、手動リフレッシュは `force` で再構築）。`markVectorIndexDirty()` を全レイヤ追加/削除/data override 箇所に設置。さらに `markLayerLoading`/`markLayerFailed`/`addGeoJsonValueLayer`/`qmlStyledLayer` の再描画を `scheduleShowUI`(250ms デバウンス)に変更し iframe 再生成自体を集約。
- 改善: レイヤ追加経路を正規経路/拡張経路に分離 — XYZ・3D Tiles・URL参照の素の `geojson:`（ホスト側が取得する非横断系）は従来どおり即時追加し、ctx 横断が必要な拡張経路（`gpkg:`/`duckdb:`/`sql:`/`flatgeobuf:`/`parquet:`/kasczip geojson/`style=` 付き geojson）は直列遅延キュー `_extPathQueue` へ。取込中も extensionMessage（AIツール・ユーザー操作）をさばけるよう、キューは `waitViaUiTimer(50)` の yield を挟んで1件ずつ適用する（各アイテムは従来の ⏳/トゥームストーン経路で逐次反映）。計測: 取込中のツール応答が >20s タイムアウト → 0.3-4s に改善。重複チェックはキュー実行時点のレイヤ一覧で再評価するため、取込パスをまたいだ二重追加も防げる。
- 修正: AI チャットの外部エージェント（Copilot / External agent）が「検索をキューに入れました」のまま動かなくなる問題 — `callAgent` が `/agent` の応答 `actions` を実行した結果を破棄し、`toolResults` を返送しないまま1往復で終了していた。bridge-hub のプロトコルは「actions 実行 → toolResults で返送 → 結果を踏えた続きの回答/追加 actions」の往復が前提のため、エージェント側が結果待ちのまま停止していた。KASUGAI Canvas の `callExternalAgent` と同じ往復ループに修正。
    - `/agent` へ送る `camera`/`layers`/`basemaps` が `null`/`[]` 固定だったのを、各ラウンドで `getCamera`/`listLayers`/`listBasemaps` ツール経由の実値を送るよう変更（ハブ側ローカル参照ツールが実値を返せる）。
    - agent/copilot プロバイダでユーザー発言が `_pxHist` に記録されず `history` が常に空だったのを修正し、assistant 応答も記録。
    - `/agent` POST に 120 秒の AbortController タイムアウトを追加（無応答時の永久ハング防止）。
    - `data.report` ペイロードを `showReport` ツールと同等にモーダル表示するよう対応（KASUGAI 側と同じ扱い）。
- 新規: AI チャットに「Sakura AI Engine（さくらAI）」プロバイダを追加（KASUGAI Canvas と同仕様）— 固定エンドポイント `https://api.ai.sakura.ad.jp` の OpenAI 互換プロバイダで、アカウントトークンを API キーとして設定。モデル未指定時は `gpt-oss-120b` を既定使用、`/v1/models` で一覧取得して組込候補（`gpt-oss-120b`/`gpt-oss-20b`）と併合表示。ツール往復・function calling は OpenAI 互換経路（`callOpenAICompat`）を共有。
- 改善: AI チャットのモデル選択肢をプロバイダ別に拡充（KASUGAI Canvas と同じカタログ方式）— Gemini は組込カタログ（`gemini-3.1-flash-lite`/`3.6-flash`/`3.5-flash`/`3.1-pro-preview`）を常時表示し、APIキー設定時は `generativelanguage.googleapis.com/v1beta/models` で generateContent 対応モデルを実取得して併合。OpenAI互換/Anthropic も組込候補を既定表示し、キー入力済みなら `/v1/models` 取得結果と併合（取得失敗時は既定候補のまま）。
- 新規: ツール往復上限を設定可能化（KASUGAI Canvas の `geminiToolMaxSteps` 相当）— 設定パネルの「Max tool round trips」入力（1-20・既定10）と AI ツール `setToolMaxSteps` で変更でき、全プロバイダのツール往復（Gemini/OpenAI互換/Anthropic の step ループ・agent/copilot の `/agent` 往復）に適用される。上限到達時は「あと{n}往復続けますか？」の継続確認を出し、承認なら上限を加算して続行、拒否・モーダル不可なら従来どおり上限到達メッセージで終了。値はプラグインストレージ `aiToolMaxSteps` に永続化（iframe は opaque origin のため localStorage 不可・clientStorage 経由）。`aiChatSet` の `maxSteps`・`runCode` の `api.setToolMaxSteps` からも変更可。

## v22.0.0
- 修正: AI チャットの OpenAI互換/Azure/Anthropic プロバイダでツール宣言が空になっていた問題 — `pxToolDecls` が Gemini ラッパー `[{functionDeclarations:[...]}]` の外側をそのまま map していたため、全エントリが name/description 不明の無効宣言になっていた（v21.3.2 で bridge-hub 経路のみ直っていた残存バグ）。ラッパーを展開してから各プロバイダ形式へ変換するよう修正。
- 修正: QML `RuleRenderer`（QGIS が実際に書き出す型名）が未対応で `compile failed → 既定スタイル` に落ちていた問題を解消 — `compileRenderer` と `qmlRendererConds` の両経路で `RuleBased` の別名として受理（`vendor/qml-style.js`・`vendor/qml-to-reearth.js`）。
- 修正: QML `nullSymbol` レンダラ（非表示ジオメトリ＋ラベルのみ）を対応 — 従来は unsupported で既定スタイルにフォールバックしていた。ジオメトリ（marker/polyline/polygon）は描かず `labeling` のラベルのみ表示する QGIS 準拠の動作に変更。
- 改善: QML `attr` 参照の堅牢化 — `attr='"field"'` の引用符除去と大文字小文字を無視したプロパティ照合を追加。宣言されたフィールドがデータに存在しない場合は先頭プロパティへの差替え（全地物の誤分類）をやめ、宣言名を維持して ELSE ルールへ流す QGIS の NULL セマンティクスに統一（式属性は従来どおりフォールバック＋警告）。
- 改善: `bbox=auto` レイヤの失敗時カメラ移動リトライ — `gpkg:`/`duckdb:` の初回追加が >4MB で失敗すると `_ddbLayers` 未登録のまま永続トゥームストーンになっていた。失敗 spec を `_ddbFailedAdds` に保持し、次のカメラ移動（600ms デバウンス）で縮小したビューポート bounds により再追加。ズームインで上限を下回れば自動的にレイヤが表示される。トゥームストーンの × 削除・同一ソースの再処理で登録解除。
    - 上限超過のトゥームストーン文言に「zoom in (bbox=auto retries on move)」を追加（gpkg/duckdb の throw 文は layers-and-tiles-list / basemap-widget の両 iframe で同期）。
- 新規（仕様）: 4MB を超える GeoPackage ファイルは**恒久的に拒否** — `gpkgOpenDb` で `Content-Length`（応答ヘッダ報告時・本文読込前）と実バイト数を検査し、`table=`/`where=`/`limit=`/`columns=`/bbox 絞り込みで結果が収まり得る場合でもファイル自体が上限超過なら開かず拒否する。仕様として `docs/payload-limits.html` に明記。カメラ移動リトライの対象外（`gpkg file too large` エラーは `_ddbFailedAdds` に登録しない）。
- 改善: `gpkg:` の 4MB 超過判定を事前プローブ化 — 従来は 4MB 分デコードしてから打ち切っていたため大きなレイヤのトゥームストーンが遅かった。デコード前に raw バイト量（`SUM(LENGTH(geom))` + プロパティ `LENGTH()` 合計 + 地物あたり JSON オーバーヘッド）を集計し、上限超過が確実なら 1 地物もデコードせず即拒否。bbox=auto は gpkg の `rtree_<table>_<geom>` インデックステーブルへ join した単一集計クエリ（JS 行走査なし・rtree 不在や pk 非選択時は `SUBSTR(geom,1,40)` エンベロープ pass へフォールバック）でビューポートフィルタ適用後の見積りを取るため、ズームイン時のリトライも再デコードなしで即判定される。`where=`/`limit=`/`columns=` はプローブにも反映。プローブ失敗時は従来のデコード途中打切りへフォールバック。layers-and-tiles-list / basemap-widget の両 iframe で同一実装に揃えた。
- 改善: 4MB 上限超過レイヤの早期トゥームストーン — 上限超過が確定するまで全量 fetch・デコードしてから捨てていた経路を、デコード途中または読込前に打ち切るよう変更。起動時に超過レイヤがある場合、フルコストの末にトゥームストーンが出ていた待ちを短縮。
    - `duckdb:` 行→GeoJSON 変換ループで JSON サイズを積算し 4MB 到達時点で中断（layers-and-tiles-list / basemap-widget の両 iframe ハンドラ）。クエリ自体は走り切るが支配的な変換コストを削減。
    - `flatgeobuf:` ストリーム読みに積算打切りを追加（`fgbLoad` およびドロップ取込の両経路）。従来は `limit=`（既定20万件）まで全件収集してから捨てていた。
    - `parquet:` は `parquetMetadata`（footer のみ・URL ソースは Range 読み）を先に取得し、非圧縮 `total_byte_size` が 4MB 超なら本体を読まずにトゥームストーン。非圧縮カラムバイトはデコード後 GeoJSON の下限となるため厳密判定（`limit=` 指定時は行数切詰めで収まり得るため適用除外）。
    - gpkg は既存の行ごと積算打切り（v21.3.x〜）で済。geojson メンバはパース自体が軽く pretty-print ソースで誤判定し得るため事前判定なし。
- サイト: 主な機能カードに「拡張経路ベクトルデータ」を追加（`gpkg:`/`flatgeobuf:`/`parquet:`/ファイルドロップ取込/`qgis:` ZIP 一括取込）。機能カード枚数＝メジャーバージョン規約に従い V22 へ。
- サイト: `docs/` を Markdown から HTML ページへ移行し `dist/docs/` としてデプロイ（索引 `docs/index.html` 新設・mermaid 対応・トップ/一覧へのナビ付き）。index.html のドキュメントリンクを生成ページへ付け替え、Vercel 上で 404 になっていた相対 `.md` リンクを解消。
- サイト: ヘッダーのバージョン表示をビルド時埋め込みに変更 — `scripts/stamp_version.js` が `package.json` のバージョンを `dist/index.html` の `#app-version` へ確定書込み（従来の起動時 `reearth.yml` fetch はフォールバックとして継続）。ソース直書きの `v18.1.0` を廃止。
- 改善: 拡張経路ベクトルのデコードを basemap-widget 永続 iframe のホスト経路へ移行（`fgbExec`/`pqExec`/`geoExec`）— これまで `flatgeobuf:`/`parquet:`/kasczip geojson メンバは短命なパネル iframe でデコードしていたため、起動時の `processInspectorText` 末尾 `safeShowUI` や最初の結果到着時の再描画で in-flight デコードが殺され、結果が来ず TTL(300s) まで宙に浮いていた。`ddbExec`/`gpkgExec` と同じ ack ウォッチドッグ(3s)→自 iframe フォールバック・dead 隔離(15s) を適用。eager `dataB64` は従来どおり自 iframe（ホストctx を巨大 base64 が通らない）。
    - 結果ハンドラを `handleVecResult` に共通化（fgb/pq/geo の自 iframe 返送と extensionMessage 返送を統一処理）。
    - parquet の行変換ループにも積算打切りを追加（ホスト側・パネル側で同一実装に揃えた）。
- 新規: 読み込み中レイヤの `⏳` グレー行 — ctx 横断ベクトル（duckdb/gpkg/fgb/parquet/kasczip geojson）のロード開始時に一覧へ即表示し、結果到着順に実レイヤ or トゥームストーンへ解決。起動時に一覧が一度に完成し、追加が逐次見えるようになった。
- 修正: QML フォールバックがレイヤを追加していなかった致命的な既存バグ — qml コンパイル失敗/タイムアウト時に `finishStyledLayerAdd(layer, null, ...)` が `if (!appearance) return null` で早期 return するため、「default style へフォールバック」とログしつつ**レイヤが一切追加されなかった**（style 付き gpkg/geojson 全般に影響）。`{}` を渡して既定スタイルで実際に追加するよう修正。
- 修正: iframe 再生成による in-flight 作業の自動自己修復 — 自 iframe へ投げた要求（ddb/gpkg フォールバック・fgb/pq/geo フォールバック・`qmlStyle` コンパイル・`kascZipLoad`）を `ownReq` として pending エントリに記録し、iframe 再生成後の `requestRestoreState` で全再送。従来は再描画でデコード/コンパイルが殺されると結果が永遠に来ず 300s TTL 待ちになっていた。
- 修正: プロジェクト取込直後にビューアが数十秒フリーズする問題を緩和 — 原因は再描画ストームで、①結果到着ごとの `safeShowUI` が iframe を都度再生成し、②再生成 iframe がロード時に無条件で `getVectorFeatureIndex` を要求し、③ctx 側が都度 全ベクターレイヤの同期スキャン（メインスレッド）を実行していた。対策: `getVectorFeatureIndex` を世代デバウンス(300ms)でバースト集約し、索引を dirty フラグ＋キャッシュペイロード化してレイヤ未変更時は再構築せず応答（手動リフレッシュは `force` で常に再構築）。`markVectorIndexDirty()` を全レイヤ追加/削除/data override 箇所に設置。さらに `markLayerLoading`/`markLayerFailed`/`addGeoJsonValueLayer`/`qmlStyledLayer` の再描画を `scheduleShowUI`(250ms デバウンス)に変更し iframe 再生成自体を集約。

## v21.3.3
- 修正: `_ddbHostDead` が一度立つとセッション中復帰しない問題を解消 — 起動直後の拡張登録レース・basemap iframe 未ready時のクエリドロップ・一時的な ack 遅延で誤判定されると、以降すべての duckdb/gpkg クエリが短命なパネル iframe で実行され、re-render ごとに ~60MB wasm 再初期化（13-22s）が発生していた。
    - dead 判定を「15秒の隔離期間付きの暫定評決」に変更（`ddbHostId()`/`ddbMarkHostDead()`）。隔離中は自 iframe へ即フォールバック（遅延なし）、期限後の次クエリでホストを再試行。拡張未登録は dead 判定にせず毎クエリ再解決するため、遅れて登録されたホストも拾われる。
    - `extensionMessage` でホスト由来の `ddbAck`/`ddbResult`/`gpkgAck`/`gpkgResult` を受け取った時点で dead を解除し `_ddbHostId` を sender で更新（ホットリロードによるインスタンスID変化にも追従）。復帰時は `ddbWarm` を再送して永続 iframe を温め直す。
    - basemap-widget 拡張側: `ddbExec`/`gpkgExec` も `postToUIWhenReady` 経由に変更 — iframe のリスナ登録前に届いたクエリがドロップされ誤って dead 判定される経路を根絶（v21.3.1 で `ddbWarm` だけが保護されていた残存穴）。
    - `waitViaUiTimer` を iframe 再生成に対応 — 再生成前 iframe に委譲したタイマーは破棄されるため、新 iframe の ready 合図（`requestRestoreState`）で残時間を再武装。従来はタイマー喪失で ack フォールバック・TTL ウォッチドッグ・デバウンスが永久に発火し得なかった。
- 修正: ドロップ ZIP のファイル取込ガード強化 — デコード済み GeoJSON の上限チェック（`gjTooBig`）を import 経路にも適用し、eager dataB64 の ZIP メンバ上限のエラーメッセージを実装どおり 8MB に修正（実装は従来から 8MB、メッセージだけが 24MB と誤表示していた）。巨大ペイロードの拡張コンテキスト通過による QuickJS OOM 死亡を抑止。
- 修正: iframe 側デコード結果キャップを 8MB→4MB に統一 — 拡張側 `geojsonMsgTooBig` ガード（4MB）と一致させ、4〜8MB 帯の結果が「拡張ctx を2回素通りした末に捨てられる」無駄で危険な横断を排除。拒否は QuickJS コンテキストに入る前の iframe 側で行う（duckdb/gpkg/geojson/fgb/parquet/import 全経路、basemap-widget iframe 側も同値）。
- 修正: ベクター属性検索インデックスの OOM ベクター解消 — `computed.features` 未取得レイヤのフォールバックで、value 保持レイヤは全データを iframe へ往復マーシャルしていた（2回横断）のを、拡張側で直接インデックス化に変更（1回の読込のみ）。URL ソースの raw テキスト返却には iframe 側に 1ソース4MB・合計8MB の予算ガードを追加し、超過分は `tooLarge` マーカーで検索対象から除外（OOM させずスキップ）。
- 修正: eager `dataB64`（ドロップ zip メンバ、~10MB）を basemap-widget 拡張ctx へ中継しないよう変更 — `ddbPost`/`gpkgPost` は dataB64 付きペイロードをホスト経由せず自 iframe でデコードする。拡張ctx を2回素通りする最大の OOM ベクターを遮断。URL/lazy メンバは従来どおりホスト経由。
- 修正: デコーダ結果不達時のリーク対策 — `armPendingTtl`（300s TTL）を全 pending マップ（qml/geojson/duckdb/gpkg/sql/fgb/parquet/kasczip/streetview/places）に適用。結果が永遠に来ない場合に pending エントリを解放し待機中の AI ツールへエラー返却。
- 新規: 限界超過レイヤのトゥームストーン表示 — 上限超過（4MB/8MB ガード）・デコード不達・取込失敗で追加されなかったレイヤを、レイヤ一覧に `⚠ タイトル + 理由` のグレーアウト行として表示（`×` で削除、同一ソースの再処理で自動置換、成功で消去）。失敗がログにしか残らず気付けなかった問題を解消。
- 修正: ツール結果のサイズガード — `aiToolReply`/`aiToolResult`/`bridgeResult` の結果ペイロードに 4MB 上限を追加（`capToolResult`）。`captureView` のスクリーンショット等の大きな結果が ai-chat/nav-toolbar 拡張ctx を通る際の OOM を graceful なエラー返却に変更。

## v21.3.2
- 修正: 外部プロキシ（bridge-hub / canvasApi 経路）へ送る `tools` ペイロードを Gemini ラッパー `[{functionDeclarations:[...]}]` ではなくフラットな宣言配列へ正規化。ラッパー形式のままだとハブ側でツール数が 0 と解釈され function calling が無効化されていた。

## v21.3.1
- 改善: DuckDB-Wasm の先行ウォーム — inspector テキストに `duckdb:`/`sql:` 行（`qgis:` ZIP 取込分を含む）が現れた時点で basemap-widget 永続 iframe 内の wasm ダウンロード＋初期化（~60MB）をバックグラウンド開始。初回クエリを待たずにモジュールが立ち上がるため、起動後に追加する duckdb レイヤー・遅延ロードされるレイヤー（kasczip メンバ等）の初回クエリが warm 状態で返る。
    - パネル `handleInspectorLine` が `duckdb:`/`sql:` 行を検出したら `ddbWarm` を basemap-widget 拡張へ送信（format=gpkg 系は sql.js 経路のため除外）。ホスト拡張の登録待ちは最大 ~20s リトライし、見つからなければ自 iframe を温めるフォールバック。
    - basemap-widget 拡張側は iframe の message リスナ登録前に落ちる `postToUI` を防ぐため、iframe からの最初のメッセージ（`requestBaseList`）を ready 合図として早期メッセージをキュー。iframe 側は `ensureDdbModule()` に初期化を集約し `ddbWarm`/`ddbLoad` 両ハンドラから再利用。
    - 計測（workbench・最小 inspector）: warm 完了 = 起動 ~12s（クエリ未発行）、その後の `addDuckDbLayer` = ~2s。なお既定 qgis: プロジェクトの巨大 gpkg 結果が QuickJS を OOM kill し拡張間メッセージを全滅させる既存問題とは独立（本変更は wasm 初期化のみ）。

## v21.3.0
- 新機能: 外部ブリッジ（QGIS live_driver の `bridge_call`/`describe_plugins` 相当）— ローカルハーネスやエージェントがサンドボックス外から地図ツールを呼び出せる経路を追加。
    - ai-chat 拡張のツールディスパッチャを `dispatchToolCall(reqId, name, args, reply)` に一般化し、`bridgeCall`/`bridgeResult` の extensionMessage 経路を追加（`msg.sender` へ返送）。`describe` で実行可能ツールのカタログ（local/panel/bridge 分類）を返す。
    - **navigation-toolbar の永続 iframe** にブリッジクライアント `window.__geoBridge` を常駐。ハーネスからのコマンドを `bridgeCall` として ai-chat 拡張へ中継し、結果を待ち合わせる。`runCode` は iframe 内で自前実行（`api` プロキシが全ツールを再帰ブリッジ呼出し + `fetch` 利用可）。ホストに nav-toolbar を選んだのは、basemap-widget 拡張が wasm 中継ペイロードで QuickJS OOM 死亡しブリッジを道連れにする事象を実測したため。
    - 制御: インスペクタ `bridge: off | on | http://host:port` 行（レイヤーパネル → basemap 拡張 → iframe へ `bridgeConfig` 転送）。未設定時は `http://127.0.0.1:8977/status` へ一度だけ自動プローブし、ハーネスが応答すれば接続、いなければ完全に不活性。マップ描画・UI への影響なし。
    - `workbench/bridge_server.js`: dial-out 先ハーネス（無依存・127.0.0.1 のみバインド）。プラグイン iframe とは SSE `/events`＋POST `/result` で接続し、外部には `POST /call {name,args}`（結果まで保持）、`GET /status`/`/tools` の RPC を公開。`BRIDGE_TOKEN` で共有秘密トークン対応。
    - `workbench/bridge.js`: CDP ドライバ（無依存・Node>=22）。iframe ターゲットへ `Runtime.evaluate` で `window.__geoBridge.call()` を実行。`serve` モードは stdin/stdout JSONL（QGIS file-JSONL 相当）でエージェントループ向け。`BRIDGE_ATTACH` で既存デバッグ Chrome へ接続可。`__geoBridge` 非搭載ビルドでは AI Chat iframe 経由のレガシー経路にフォールバック。
- 新規: AI チャットにプロバイダ選択を追加（Gemini / GitHub Copilot / OpenAI互換 / Anthropic / Azure OpenAI / 外部エージェント）。Copilot は CANVAS ブリッジハブ（既定 `http://127.0.0.1:8511/agent`、8511→8512 自動検出）へ `{provider,model,message,tools}` を POST、`{reply,actions[]}` の actions を既存ツールで実行。モデル一覧は各プロバイダの `/models` から自動取得（hub=`/models?provider=`、OpenAI/Anthropic=`/v1/models`）。設定は `aiProvider` JSON を clientStorage 保存。
- 新規: 管理パネルに「AI Bridge (CANVAS)」ブロック — ハブエンドポイント入力・疎通テスト（`/health`+`/models`）。設定テキストの `aiHub: <url>` 行と双方向同期し、aiConfig 経由で AI チャットへ伝搬。
- 新規: ブリッジツール `canvasApi` — `{path,method,body,endpoint?}` で CANVAS ハブへ任意 REST 呼出し（8511→8512 自動検出）。`runCode`・`describe` と同じ永続 iframe で実行されるため、外部エージェントが CANVAS API をブリッジ越しに利用可能。
- 改善: 飛行系ツール（`flyToPreset`/`flyToFeature`/`showFeatureAttributes`）に `wait:false` オプションを追加 — 発行のみ即応答（既定は従来どおり飛行完了後に応答）。ブリッジ経由での応答遅延を解消。
- 修正: `execLocalTool` を同期化 — QuickJS では `extensionMessage` ディスパッチ内に積まれた `.then` 継続が次イベントまで実行されず、ブリッジ経由の応答が滞留する事象を解消（AGENTS.md に制約を記録）。
- 修正: `handleDdbResult`/`handleGpkgResult` に4MBの結果ガードを追加 — 大きな GeoJSON を `reearth.layers.add/override` でホストブリッジへ再マーシャルする際の QuickJS OOM（`Proxy.unwrapResult` で拡張コンテキスト死亡）を、コンテキスト破壊ではなく graceful なエラー返却に変更。
- 検証: `tsc --noEmit` 0 エラー / inline script チェック全通過 / Workbench E2E で describe・flyTo→getCamera・runCode・listBasemaps（SSE 経路）および CDP `__geoBridge.call` の双方向疎通を確認。

## v21.2.0
- 新機能: `qgis:` インスペクタ構文（エイリアス `kasc:`/`kasczip:`）— QGIS geo_webview の `.kasc`+`DATA/` 出力を URL 一発で一括取り込み。
    - `qgis: <.zip URL>`（Re:Earth CMS 等にホストした ZIP）→ iframe で fflate(CDN)解凍 → `.kasc` を検出 → 相対参照を `kasczip://<zipId>/<path>` に書き換え → 参照されたメンバだけを base64 で拡張側ストアへ → `.kasc` 行をインスペクタ行として処理。展開行は設定テキストへ追記しないインクルード型（読込のたびに ZIP を再取得するため CMS 側の更新が即反映）。
    - `qgis: <.kasc/.txt URL>` → 裸の .kasc を fetch し、相対参照をその .kasc の URL ディレクトリ基準で絶対化（`DATA/` を公開ホストできる環境では 3dtiles/xyz/wms 含め全行が有効）。
    - ZIP 内で読める形式: `geojson:`/`flatgeobuf:`/`parquet:`/`duckdb:`(csv/tsv 含む)/`gpkg:`＋ `style=*.qml`。`dataB64`/`zipName` をローダペイロードへ同梱し、fgb/parquet/geojson/qml はパネル iframe で、duckdb/gpkg は既存ホスト経路（basemap-widget iframe）でデコード。DuckDB は `registerFileBuffer` で仮想ファイル化。
    - ローカルの `3dtiles:`/`xyz:`/`base:`/`wms:` 参照（ZIP 内タイルツリー）は Cesium に URL を供給できないため警告付きスキップ（http(s) 参照は従来どおり動作）。
    - `wms:`/`theme:`/`bookmark:` 行をパーサで明示スキップ（`wms:` 行が XYZ キャッチオールでエンドポイント URL の偽タイルレイヤーになる既存バグも解消）。
    - import UI に `.zip` ドロップ対応 — 展開は同じ kasczip 経路（sticky 扱いでセッション中保持）。`.kasc` が無い ZIP でも対応形式のメンバ全件をレイヤー化する合成 `.kasc` を生成。
    - i18n: importHint に `.zip` を追加（全20言語）。
- 検証: `tsc --noEmit` 0 エラー / inline script チェック全通過。

## v21.1.0
- 新機能: KASUGAI Canvas のデータ取り込み・レイヤー形式を追加移植。
    - `gpkg:`/`geopackage:` インスペクタ構文: パネル iframe（通常時は basemap-widget 永続 iframe、未応答時フォールバック）で sql.js(SQLite WASM)を遅延ロードし GeoPackage をデコード。`table=`/`where=`/`limit=`/`columns=` に対応し、`bbox=auto`（既定 ON）は GPkgBinary ヘッダのエンベロープで表示範囲フィルター＋カメラ移動で再クエリ。`layer_styles` テーブルの QGIS 埋め込み QML（useAsDefault 優先）を自動適用し、`style=` 明示指定はそちらを優先。`duckdb:` で .gpkg/`format=gpkg` 指定も同経路へ振り分け。
    - `sql:` インスペクタ構文: タイトル後の `|` 以降を SELECT 文として既存 DuckDB-Wasm 経路で実行し結果のジオメトリ列を描画。`:bbox` プレースホルダは表示範囲エンベロープへ置換されカメラ移動で再クエリ（要 spatial 拡張）。末尾 `| off`/`| style=` を認識。basemap-widget 側の ddbLoad コピーにも同一分岐を追加（同期規約）。
    - ローカルファイル取り込み: Manage タブに「Add files」ボタンを追加。`.geojson/.json`(JSON.parse)、`.fgb`(flatgeobuf deserialize)、`.parquet`(hyparquet)、`.gpkg`(sql.js)、`.csv/.tsv`(lon/lat列→Point)を iframe 内でデコードし `importAdd` で GeoJSON レイヤー追加。`.kasc/.txt` は設定テキストへ行追記（`importKasc`）。サーバー不要で完結。
    - `gpkg:`/`sql:` レイヤーも `bbox=auto` 時は `_ddbLayers` に `engine` 付きで登録し、既存のカメラ移動デバウンス再クエリ機構を共用。
    - `qmlStyle` ハンドラを拡張し `{qmlText}` による URL fetch 不要の埋め込み QML コンパイルに対応。
    - i18n: importTitle/importAddFile/importHint を全20言語で追加。
- 検証: `tsc --noEmit` 0 エラー / inline script チェック全通過。

## v21.0.0
- 新機能: kasugai_canvas からの機能移植（A グループ＋ベクトルフォーマット群）。
    - Street View: `googleMapsApiKey:` 設定時は Street View Static metadata API でパノラマを検証し、確認した `pano_id` 付き URL を開きます（outdoor 優先・失敗時は従来の viewpoint URL にフォールバック）。
    - Google 検索プロバイダ: Search タブに `google` を追加。Geocoding + Places Text Search を並列実行・重複除去してマージします。
    - AI ツール追加: `searchPlaces`（Google Places 検索）、`vectorSearch`（読込済みベクトルレイヤーの属性・値検索）、`setFlySettings`（fly ルートの速度/AGL/pitch/loop/view を即時反映＋`properties.fly` へ永続化）、`buildShareUrl`（任意視点のパーマリンククエリ生成）、`showReport`（Markdown レポートのモーダル表示＋ダウンロード/コピー）。
    - FlatGeobuf: `flatgeobuf:`/`fgb:` インスペクタ構文と AI ツール `addFlatGeobufLayer`。パネル iframe で `flatgeobuf` ESM を遅延 import → `deserialize()` でストリームデコード → GeoJSON レイヤーとして追加。
    - GeoParquet: `parquet:`/`geoparquet:` 構文と AI ツール `addParquetLayer`。`hyparquet`+`hyparquet-compressors` を遅延 import → `asyncBufferFromUrl`（Range 対応）→ `parquetReadObjects`。geo メタデータの `primary_column` 優先でジオメトリ列を検出し、WKB は自前デコーダ（EWKB/Z/M/SRID 対応）で GeoJSON 化。
    - DuckDB-Wasm クエリレイヤー: `duckdb:` 構文と AI ツール `addDuckDbLayer`。`where=`/`limit=`/`columns=`/`format=`/`geom=`/`lon=`/`lat=`/`covering=`/`bbox=auto` の SQL プッシュダウンを実装。GeoParquet 1.1 の `covering.bbox` を `parquet_kv_metadata` から自動検出し、行グループ min/max 統計で非該当ブロックの転送自体をスキップ（部分読込）。`bbox=auto` は `reearth.camera.viewport` 連動でカメラ停止後に再クエリ → `layers.override` で差替え。
- 改善: DuckDB-Wasm の実行を basemap-widget の永続 iframe に移しました。レイヤーパネル iframe は `safeShowUI` のたびに再生成されるため旧構成では wasm インスタンスが毎回失われていました（計測: 13–22s が毎回発生 → 初回 ~17s 以降 3–9s に改善）。ホスト未応答時は 3 秒でパネル iframe へフォールバックします。
- ドキュメント: `duckdb-persistence.html` を追加。DuckDB 永続化の検証結果（セッション内再利用・ブラウザ再起動時の再ダウンロード不可避の実測根拠）、フォーマット別使いどころ比較（GeoJSON/FGB/Parquet/DuckDB）、sandbox 環境制約の記録をまとめています。
- 修正: AI Chat iframe の生成 HTML 内 JS 文字列 `'</body></html>'` に Workbench の `_zushi_resize` 注入が誤マッチしスクリプトが早期終了する問題を `'<\/body><\/html>'` エスケープで解消。AI Chat の i18n 辞書を拡張側へ移し `aiConfig.i18n` で配信する構成に変更（iframe テンプレートを ~21KB 削減）。
- その他: QuickJS に `setTimeout` が無い制約に合わせ、カメラ移動デバウンスを `waitViaUiTimer` 委譲＋遅延購読で実装。sandbox iframe では HTTP キャッシュ・CacheStorage・localStorage・IndexedDB・ServiceWorker が全て不可（opaque origin）であることを実測確認し、上流へ reearth/reearth-visualizer#2497 として機能要望を登録。
- 検証: `tsc --noEmit` 0 エラー / inline script チェック全通過 / Workbench AI テスト 44/44 全パス（`addFlatGeobufLayer`、`addParquetLayer`、`addDuckDbLayer` の追加・削除を含む、コンソールエラーなし）。

## v20.1.0
- 新機能: FLY タブにプリセット選択を追加しました（kasugai_canvas の Fly モードから移植）。速度・地上高・ピッチの組み合わせを「徒歩 (h2 s5 p-5)」「車載 (h2 s60 p-10)」「ドローン (h200 s60 p-30)」「広域 (h1000 s300 p-45)」からワンクリックで適用でき、再生中でも即時に反映されます。数値を手動で編集すると自動的に「カスタム」表示になり、入力値がプリセットと一致した場合はそのプリセット名が選択されます。
- 新機能: FLY タブに「逆転」ボタンを追加しました。読み込み済みルートの起終点を入れ替えて逆方向に飛行できます。進行度はミラーされるため、再生中・一時停止中に押してもカメラ位置を保ったまま反転します（再生前のプレビュー状態でも有効で、そのまま Play すると逆方向で再生されます）。
- 新機能: FLY タブに「取込」ボタンを追加しました。GeoJSON ファイル（LineString 含む）を描画ルートとして取り込み、clientStorage に永続化します（リロード後もルート一覧に残ります）。同名ルートがある場合は自動で連番を付けます。
- 改善: Navigation Toolbar の 2D ボタンを 2D/3D トグルにしました（kasugai_canvas のトグルに倣ったプラグイン API 範囲での実装）。「2D」で真俯瞰へ移行するとき現在のカメラ姿勢を保存し、「3D」でその姿勢へ復帰します。保存姿勢がない場合は同位置の -30° 斜め俯瞰にフォールバック。真俯瞰のままユーザーが手動でチルトした場合は自動で「2D」表示に戻ります。なお kasugai 側は `constrainedAxis` でチルトをロックしますが、プラグイン API ではカメラコントローラを触れないため、姿勢の保存・復帰による近似としています。
- 新機能: FLY パネル表示中に地図をダブルクリックするとルート再生/一時停止をトグルできるようになりました（kasugai_canvas の `dblclick` → `toggleFlyPathDirection` の移植。`reearth.viewer.on("doubleClick")` 経由で拡張側が受け取り FLY パネルへ通知）。右ダブルクリック（400ms 以内の右クリック2回）で逆方向再生をトグルします。逆再生中は進行方向に合わせてカメラ方位が反転し、ループ有効時は終端で先頭へ折り返します。FLY パネルを開いている時だけ有効なため、通常の地図ダブルクリック（ズーム等）は従来通り動作します。操作説明をヘルプ下に全20言語で追加しました。
- 新機能: FLY タブの再生ボタン行に「◀ 逆再生」ボタンを追加しました。右ダブルクリックと同じ逆方向再生/一時停止トグルをパネル上から直接操作できます（再生中に押すと方向反転、逆再生中に押すと一時停止）。
- 改善: FLY のボタン状態をマウス操作と同期しました。再生中の方向に応じて Play/◀ ボタンがハイライト（`fly-dir-on` + `aria-pressed`）され、逆再生中は Play が有効のままになり押すと前進へ切替わります（左ダブルクリックと同じ動作）。ステータス行は逆再生中に `◀` マーカーを表示します。
- 新機能: FLY パネル表示中かつルート読込済みの間（再生/一時停止/停止後）、マウスホイールで速度を調整できるようになりました（kasugai_canvas の wheel ハンドラ移植。`reearth.viewer.on("wheel")` → パネルの速度欄を ±1km/h 更新し即時反映、下回転=加速も同仕様）。さらに kasugai と同様、この間はホイールズーム自体を無効化します — `reearth.camera.overrideScreenSpaceCameraController`（実 Cesium `screenSpaceCameraController` へ `Object.assign` されるプラグイン API）で `zoomEventTypes` から `wheel` を除去するため、近似のスナップバックではなく真のズーム抑止です（kasugai 同様右ドラッグでのズームは有効のまま）。ルート未読込時やパネルを閉じたときは既定値へ復元され、従来通りホイールズームできます。

## v20.0.0
- 改善: FLY タブの動作を見直しました。
    - ルートラインの表示制御を整理: ルート線は「Show route」トグルと FLY パネルの開閉に連動するようになりました。他タブへの切替・属性パネルの自動オープン・ウィジェット最小化で線は自動的に消え、パネルを開き直すとトグルが ON の場合のみ復帰します（従来は一度描画されるとレイヤー一覧にも出ず、消す手段が分かりにくい状態でした）。描画したルートも選択直後にプレビュー表示されるようになりました。
    - 速度・地上高・ピッチ・視点・ループの入力値は即時反映になりました（数値入力は 250ms デバウンス、再生中・一時停止中も有効）。従来は Play 押下時にのみ読み込まれ、しかもインスペクタ行 / GeoJSON `properties.fly` の値で入力が毎回上書きされていたため手入力が実質無効でした。ルート既定値はルート選択時のみ反映され、一度でも編集した後はユーザー入力が優先されます。
    - 視点（View）の説明を改善: POV/Follow 表記を分かりやすい「搭乗（Ride）」/「空撮（Aerial）」に変更し、意味をセレクトのツールチップとヘルプに追記（全20言語 `flyViewHint` / `flyHelp`）。インスペクタの `view=` 指定は `camera`(=pov/fpv/first/ride) と `center`(=chase/follow/3rd/aerial) のエイリアスを受け付けます（`properties.fly.view` も同様）。
    - Follow（center）視点で地上高が小さいときカメラが地形に埋まる退化ケースを修正（最低 30m のフォロー高度を確保）。
    - 「保存」ボタン（旧 GeoJSON ボタン）で選択ルートの GeoJSON を `<ルート名>.geojson` として直接ダウンロードできるようになりました（従来の textarea 表示＋クリップボードコピーは廃止）。
    - AI チャットの playFlyPath でルート再生するとき FLY パネルが自動で開くようになりました。
- 検証: `workbench/check_inline_scripts.js` に mock-sandbox フォールバックを追加し、`legendInnerHtml` 等の外部変数参照で eval が失敗していた layers-and-tiles-list.ts の生成スクリプトも構文検証できるようになりました。

## v19.2.0
- 新機能: AI Chat 拡張に独自のプロパティスキーマを追加しました。これまでインスペクターは「プロパティがありません」と表示されるだけでしたが、AI Chat ウィジェットのインスペクターに「Gemini APIキー」「Gemini モデル」の入力欄が表示され、ここに書いた値はプロジェクトと共に保存・利用されます。
    - 優先順位は「AI Chat インスペクターのスキーマ値 > レイヤーパネル inspectorText の geminiApiKey:/geminiModel: 行 > セッションキー > clientStorage 保存キー」です。スキーマ値・インスペクタ値はどちらも keySource `inspector` として扱われ、チャット設定のパスワード欄には表示されません。
    - 公開サイトではスキーマに書いたキーが全訪問者に配布される点に注意が必要です（フィールドの説明文にも明記）。
- 追加: APIキーのセキュリティ状況を明示しました。チャット設定画面に使用中キーの出所（inspector/storage/session/server proxy）を表示する行を追加（全20言語の `keySrc` キー）、`index.html` に経路別の公開範囲・評価をまとめた「Gemini APIキーのセキュリティ状況」セクションを追加しました。

## v19.1.0
- 新機能: AI チャットがサーバーサイドプロキシ `/api/gemini`（Vercel 環境変数 `GEMINI_API_KEY`）経由でも動作するようになりました。`/api/gemini-env` でキー設定を検出し、設定済みならブラウザにキーを一切配らずにチャットを利用できます。未設定・プロキシ失敗時は従来通りユーザー自身のキーでの直接呼び出しにフォールバックします。
- セキュリティ: API キー関連の警告を UI に追加しました。AI チャット設定パネルに「キーはブラウザに保存され DevTools で閲覧可能」の警告（`keyWarn`）、管理パネルの設定テキスト欄に「`geminiApiKey:` / `yahooAppId:` はプロジェクトと共に全訪問者へ公開される」警告（`manageSecretWarn`）をそれぞれ全20言語で表示します。
- 追加: AI チャット設定に「Save key on this browser」チェックボックスを追加しました。オフ（既定）で保存するとキーは拡張メモリのみに保持され clientStorage へ書き込まれません（リロード・ブラウザ再起動で消去。keySource `session`）。オンにすると従来通り clientStorage に永続化されます。

## v19.0.1
- 修正: AI Chat ウィジェットが完全に無反応かつ英語表示のままになる問題を修正しました。UI 生成テンプレートリテラル内の `\'` `\/` `\s` が展開時に食われて inline `<script>` 全体が `SyntaxError` になっていたため、`\\'` `\\/` `\\s` の二重エスケープに変更しています。
- 追加: 全拡張の生成 HTML 内 `<script>` をテンプレートリテラル評価後の形で構文検証する `workbench/check_inline_scripts.js` を追加し、同種のエスケープ破壊の再発を防止します。AGENTS.md にこの罠の注意書きを追記。

## v19.0.0
- メジャーリリース: AI 対応（Gemini function calling による AI チャット + AI からの全機能操作）および AI による完全自動開発環境の確立を以て V19 とします（v18.5.0 として展開した内容を統合）。
- 新機能: AI Chat がプラグインの全機能を操作できるようになりました。Gemini function calling のツールを大幅に拡張しています。
    - カメラ/ナビゲーション: `setCamera`（`camera.setView` で即時配置）、`lookAt`（注目点への向き変更、半径 `radius` 必須のため付与）、`zoomIn`/`zoomOut`（Navigation Toolbar 相当）、`flyToCurrentLocation`（ジオロケーション→飛行）、`flyToUrl`（共有 URL/`?lat=..` クエリ解析→飛行）。
    - FLY: `createFlyPath`（座標列から描画ルートを `flyRoute:` ストレージへ作成→即再生可能）、`deleteFlyPath`（描画ルート削除+UI 選択肢から除去）。
    - パネル/情報表示: `showPanel`（layers/legend/search/attr/cams/display/info/fly/share/manage 全タブを `activateTab` で開く）、`showInfo`（INFO タブに URL 読込+表示）、`listLegends`（凡例一覧）、`showFeatureAttributes`（属性一致で ATTR パネルに属性表表示、`fly:false` で表示のみ）、`getInspectorText`/`applyInspectorText`（設定テキストの読取・適用、Manage パネルと同等）。
    - 表示設定: `setDepthTest`、`setGeojsonDrape`（3dtiles/terrain/both）、`setBackground`（背景色）。
    - 検索: `searchLocation` に `provider: gsi|yahoo|auto` を追加。Yahoo は Search タブと同一プロキシ経由で、inspector の `yahooAppId` を `aiConfig` 経由で受け取ります。
    - `openUrl`（任意 URL を新タブで開く。Google Maps/Earth リンク向け）、`runCode` の `api.*` メソッドも全ツール分に拡張。
- 改善: AI 操作時の UI 状態同期を追加しました。
    - レイヤー追加/表示切替はレイヤーパネル側で実行するよう変更し、チェックボックスを `aiLayerState` メッセージで即時同期（AI 追加レイヤーもパネル管理対象に）。
    - Terrain/Shadow/DepthTest/GeoJSON Drape も `terrainState`/`shadowState`/`depthTestState`/`geojsonDrapeState` で Display タブのトグルと同期。
    - `openUrl`/Street View がポップアップブロックされた場合に備え、チャットの bot メッセージ内 URL をクリック可能なリンクに変更。
- 検証: `workbench/ai_tool_test.js`（CDP 経由で実際の iframe→拡張→パネルのメッセージ経路を駆動する E2E テスト）で全 35 項目の動作を確認済み。
- 修正: `lookAt` に `radius` を付与（viewer が `BoundingSphere(center, radius)` を組み立てるため、未指定では無操作になっていました）。

## v18.4.0
- 新機能: 第4の拡張「AI Chat」ウィジェット（`ai-chat`）を追加しました。KASUGAI Canvas の AI 連携（Gemini function calling）を Re:Earth プラグイン向けに移植したものです。
    - ブラウザの widget iframe から Gemini `generateContent` を直接呼び出し、function calling の往復ループで地図を操作します（BYO APIキー方式。`localStorage` が使えないサンドボックスのため、キーは `reearth.data.clientStorage` に保存）。
    - インスペクタ行 `geminiApiKey: キー` / `geminiModel: モデル名` でも設定可能（レイヤーパネルが拡張間メッセージ `aiConfig` で ai-chat へ転送。公開サイトでのキー漏洩に注意）。
    - ツール実装は2系統: `reearth.*` API で直接実行するもの（flyTo・getCamera・listLayers・setLayerVisible・focusLayer・GeoJSON/XYZ/3D Tiles 追加・AI追加レイヤーのみの removeLayer・captureView・getShareUrl）は ai-chat 内で処理。インスペクタ依存のもの（カメラプリセット・ベースマップ切替・fly ルート再生/停止・Terrain/Shadow・Street View・地物属性 flyTo）は拡張間メッセージ `aiToolRequest`/`aiToolResult` でレイヤーパネルへ委譲します。
    - `searchLocation`（地理院 msearch）と `runCode`（iframe 内サンドボックス eval、`api.*` 非同期メソッド + fetch 利用可）は iframe 側で実行します。
    - fly ルートの再生はレイヤーパネル UI の `aiFlyPlay`/`aiFlyStop` メッセージで既存の rAF ループを起動します。
    - UI は既存の `GEO_I18N` 方式で20言語対応。`lang:` 設定はレイヤーパネルから転送されます。
- 変更: `basemap-widget` の拡張間メッセージに `selectBasemap`（URL またはタイトル指定でのベースマップ切替）を追加しました。

## v18.3.0
- 新機能: KASUGAI Canvas（Cesium アプリ）から Fly モードを移植し、「FLY」タブを追加しました。
    - インスペクタ行 `fly_geojson: 名前 | URL | speed=30 | height=0 | pitch=-10 | loop=true | view=camera|center` で飛行ルートを定義できます（`route:名前` で描画保存済みルートも参照可能。`| off` で無効化）。
    - 飛行アニメーションは UI iframe 側の `requestAnimationFrame` で駆動し、フレーム毎に `reearth.camera.setView` を適用します（拡張サンドボックスにはタイマーが無いため）。
    - 速度 km/h（負値で逆再生）、対地高度 AGL、ピッチ、ループ再生、POV/追従視点（view=camera/center）、GeoJSON `properties.fly` によるルート単位の指定、`heightReference: "MSL"` による絶対高度に対応。
    - `reearth.viewer.tools.getTerrainHeightAsync` による地形高さサンプリングでルートを自動的に地形追従させます（API 非搭載時は自動スキップ）。
    - 「描画」ボタンで `reearth.sketch` のポリライン描画 → `clientStorage` に保存（`flyRoute:名前`）。保存ルートの選択・削除・GeoJSON コピーが可能。
    - 選択中のルートは黄色ポリラインの一時レイヤーで地図上にプレビュー表示します。
    - `sketch` / `viewer.tools` / `capture` 等の新しい API は `flyInit` でホスト側の実装有無を検出し、非対応機能は UI を無効化します。
- 新機能: SHARE タブに「Street View」「Capture」ボタンを追加しました。
    - Street View: `camera.getGlobeIntersection`（地形考慮の注視点）から Google Street View を `viewer.open` で開きます。
    - Capture: `viewer.capture` で現在のビューを PNG 画像として表示します。
- 改善: `AGENTS.md` に Re:Earth プラグイン API の公式参照先（docs.reearth.io / reearth-visualizer リポジトリ）を明記しました。
- 変更: タブバーを KASUGAI Canvas スタイルに統一しました。
    - FLY / Share / Settings のタブを廃止し、タブバー右端のアイコンボタン（✈️ / 🔗 / ⚙️）に置き換えました。
    - タブ順を `レイヤー / 凡例 / 検索 / 属性 / カメラ / 表示 / 情報` に変更（表示タブ = 旧 Settings パネル: Terrain/Shadow/Depth/GeoJSON Drape）。
    - ⚙️（管理）ボタンは新規「管理」パネルを開き、インスペクターの設定テキストの確認・編集・適用が可能です（`setPropertyValue` で inspectorText へ書き戻し、即時反映）。

## v18.2.0
- 新機能: UI を英語ベースの i18n で多言語化しました（20言語対応）。
    - 対応言語: en / ja / zh-CN / zh-TW / ko / es / fr / de / it / pt / ru / nl / pl / uk / tr / ar / hi / id / th / vi
    - 翻訳辞書（`GEO_I18N`）をプラグイン内に埋め込み、UI 側で `t(key)` + `data-i18n` 属性により適用します。
    - 静的 UI（タブ、ボタン、ラベル、プレースホルダ、title/aria）と動的メッセージ（検索・共有・カメラ・地形/影/深度のステータス、エラー）の両方を翻訳対象にしました。
    - 言語は iframe 内の `navigator.language` から自動検出し、未対応言語は英語へフォールバックします。
    - インスペクターテキストの `lang: <コード>` 行で言語を明示指定可能（`lang: auto` で自動検出に戻ります）。
    - `basemap-widget` も同方式で対応（`(なし)` オプション、Google Earth タイトル）。レイヤーパネルの `lang:` 設定は拡張間メッセージで basemap ウィジェットへ転送されます。
    - レイヤー名・カメラタイトル・凡例タイトル・住所・地物属性などのユーザーデータは翻訳対象外です。

## v18.1.11
- 改善: 属性・値一覧のパネル幅（300px/600px）とマウス認識領域を単一関数で制御するようリファクタリングしました。
    - 拡張側に `setAttributePanelExpanded(expanded, activeTab)` を追加し、`_attrPanelExpanded` フラグに応じて幅と iframe サイズを一括変更します。
    - UI 側に `applyAttrPanelSize(expanded, width, height)` を追加し、ウィジェット表示と `body` の `width/height/overflow` を同一関数で切り替えます。
    - 開閉メッセージを `expandAttributePanel` / `restoreAttributePanel` / `attrPanelHeight` から `setAttributePanelExpanded` / `setAttrPanelSize` に統一しました。
    - 閉じる際は `safeShowUI` による iframe 再作成を維持し、600px のマウス認識領域が残る既知の問題を回避します。

## v18.1.10
- 改善: 属性・値一覧クローズ時の UI 再描画後、直前に表示していたタブへ自動復帰するようにしました。
    - クローズ時にアクティブタブの ID を親（拡張側）へ送信して保管し、再作成された UI がロード時（`requestRestoreState`）に受け取ってタブを復元します。

## v18.1.9
- 修正: 属性・値一覧を閉じた後にマウス認識領域が 600px のまま残る問題を、UI iframe の再作成方式で確実に解消しました。
    - Re:Earth エンジンは `resize(600)` での拡大は反映するものの、`resize(300)` での縮小を確実には反映しないことが判明（拡大・縮小の非対称）。
    - クローズ時（`restoreAttributePanel` 受信時）は `reearth.ui.show` による UI 再描画（`safeShowUI`）で iframe 自体を破棄・再作成し、基本サイズ（300px）で確実に復帰するようにしました。
    - 再作成方式では不要となった `attrPanelRestored` 返送処理を削除しました。
    - 注意: クローズ時にパネルが再描画されるため、表示中のタブは初期状態（LAYERS）に戻ります。

## v18.1.8
- 修正: 属性・値一覧を閉じて 300px 幅に戻った後も、マウス認識領域が 600px のまま残る問題を修正しました。
    - 原因: 復元時の処理順序が「UI が body サイズをクリア → 親が resize」となっており、正常動作している拡張時の順序（親が resize → UI が body サイズ変更）と逆だったため、iframe（= マウス認識領域）が縮小されませんでした。
    - 復元時も拡張時と同じ順序に統一: クローズ時は body をクリアせず、親の `resize(300)` 実行後に返送される `attrPanelRestored` で body サイズをクリアするようにしました。
    - メッセージ喪失時のフォールバックとして、クローズ 1 秒後に body サイズを保険的にクリアする処理を追加しました。

## v18.1.7
- 修正: v18.1.5 / v18.1.6 で属性・値一覧の幅が 600px に広がらなくなった問題を解消しました。
    - サイズ制御を、600px 拡張が正常動作していた v18.1.4 の方式（親からの `attrPanelHeight` 通知で UI が body サイズを固定する方式）に戻しました。
    - v18.1.4 で導入したガード類（クローズ後の遅延メッセージ無視・`attrPanelRestored` による強制復元・最小化/タブ切替時の自動クローズ）は維持しています。

## v18.1.6
- 修正: 属性・値一覧を開いてもパネル幅が 600px にならない問題を修正しました。
    - 拡張時の高さを固定定数 `ATTR_PANEL_EXPANDED_HEIGHT`（400px）にし、拡張側の `reearth.ui.resize` と UI 側の body サイズの両方が同じ 600×400 を明示指定するようにしました（auto-resize への依存を排除）。
    - 画面高さからの動的計算（1/3 クランプ）を廃止し、サイズを完全に決定的にしました。

## v18.1.5
- 修正: 属性・値一覧クローズ後もマウス認識領域が 600px のまま残る問題を、サイズ制御の単純化で解消しました。
    - 非同期の往復メッセージ（`attrPanelHeight` / `attrPanelRestored`）によるサイズ制御を全廃しました。
    - UI 側のフラグ `window._attrPanelExpanded` を唯一の状態とし、`applyAttrPanelSize(expanded)` がフラグ設定と body サイズ（= iframe の当たり判定）を同期的に一括適用します。
    - 拡張側は `expandAttributePanel` / `restoreAttributePanel` 受信時に幅（600px / 300px）を resize するだけの単純な構造にしました。

## v18.1.4
- 修正: 属性・値一覧を閉じてパネルが 300px 幅に戻った後も、マウスの認識領域が拡張時（600px）のまま残ることがある問題を解消しました。
    - 拡張/通常の状態を UI 側（`window._attrPanelExpanded`）と拡張側（`_attrPanelExpanded`）のフラグで一元管理し、expand/restore をべき等化しました。
    - 閉じた後に遅れて届く `attrPanelHeight` 応答を無視するガードを追加しました（開いてすぐ閉じた際のレース対策）。
    - restore 時に拡張側から `attrPanelRestored` を返送し、UI 側の body 固定サイズを必ずクリアするようにしました。
    - 最小化ボタン・タブ切替時に属性・値一覧が開いていれば自動的に閉じ、パネルを基本サイズに戻すようにしました。

## v18.1.3
- 修正: ベースマップ切替時に、ベースマップが再描画で最上位に載りテレインへのドレープで他のレイヤを隠す問題を解消しました。
    - ベースマップの表示をレイヤの show/hide 方式から Re:Earth 公式のベースマップ機構 `reearth.viewer.overrideProperty({ tiles })` に変更しました。
    - シーンタイルはエンジン側で常に imagery collection の最下層に固定されるため、切替タイミングに関係なく他のタイルレイヤより下に描画されます。
    - ベースマップをレイヤとして追加する処理（レイヤーパネル / Basemap Selector 双方）を廃止しました。旧方式で追加済みの basemap レイヤは自動的に非表示化されます。

## v18.1.2
- 修正: ベースマップが他のタイルレイヤより後に追加され、テレインへのドレープで他のレイヤを隠していた問題を解消しました。
    - レイヤーパネルがベースマップレイヤを他のタイルレイヤより先に追加するようにし、描画順を「ベースマップ → その他のレイヤ（設定順）」に修正しました。
    - Basemap Selector ウィジェットはレイヤ追加を行わず、既存ベースマップレイヤの表示切替のみを担当します（未追加時のみフォールバックで追加）。

## v18.1.1
- 修正: SHARE タブの「Generate Link」から URL 取得ロジックを削除し、常に `?lat=...&lng=...` 形式のクエリ文字列のみを出力するようにしました。
- `baseurl: https://...` 設定と `_baseUrl` 変数を削除しました。

## v18.1.0
- 新機能: GeoJSON レイヤーの 3D ドレープをインスペクター / Settings タブで制御できるようになりました。
    - `geojson:` 行に `terrain` / `3dtiles` / `both` を指定できます。
      - 例: `geojson: 東京都/行政区域 | https://... | on | terrain`
      - 例: `geojson: 東京都/行政区域 | https://... | on | 3dtiles`
    - Settings タブの `GeoJSON 3D Drape` ドロップダウンで、全 GeoJSON レイヤーの classificationType を一括切り替えできます。
    - `terrain`（地面/Terrain のみ）、`3dtiles`（3D タイル）、`both`（両方）から選択できます。

## v18.0.0
- 新機能: Basemap Selector に 🌐 アイコンを追加し、Google Earth で現在の視点を新しいウィンドウで開く機能を追加しました。
    - クリックするとカメラ位置・方位・傾きを Google Earth 形式に変換して `https://earth.google.com/web/` を開きます。
    - KASUGAI Canvas と同じ後退補正ロジックで、カメラ位置から実際の注視点を算出して再現性を高めています。

## v17.1.1
- 修正: basemap ウィジェットのレイヤーパネルとの表示を揃えるため、余白・幅・配置位置を調整しました。
    - レイヤーパネルおよび basemap パネルの外側余白を 5px に統一。
    - basemap ウィジェットの幅を 291px、左マージンを 9px に調整。
    - 枠の角丸をレイヤーパネルに合わせて削除。
    - BASE: エントリの読み込みを安定させるため、表示方法を `reearth.ui.show` の `width` 指定に戻しました。

## v17.1.0
- 新機能: ベースマップ選択・データ帰属表示をレイヤーパネルから分離し、専用ウィジェット "Basemap Selector" を左下に配置しました。
    - 新しいウィジェット `basemap-widget` が既存の `base:` エントリから追加された basemap レイヤーを一覧し、選択と帰属テキストを表示します。
    - レイヤーパネルから basemap ドロップダウンと帰属表示を削除しました。
    - basemap レイヤーの `data.attribution` に帰属情報を保持するようにしました。

## v17.0.1
- 修正: 属性・値一覧の URL クリック動作を属性タブと同じにしました。
    - URL の値をハイパーリンク化し、リンククリックで属性パネル/新規タブを開きます。
    - リンクテキストは `attrUrlOpen`（`panel` / `newtab`）の設定に従います。
    - `↗` アイコンクリックで新規タブで開きます。

## v17.0.0
- 新機能: 属性・値一覧を大幅に強化しました。
    - 検索タブと属性タブの両方から「属性・値一覧」を開けるようになりました。
    - 表示中のベクトルレイヤーの属性を一覧表示し、レイヤー選択・文字列検索・列ソートに対応。
    - 行クリックで該当地物へ FlyTo できます。
    - 開くと 600px 幅・親の 1/3 高さで固定表示。閉じると 300px 幅に確実に復帰します。
    - スクロールバー表示を最適化しました。

## v16.1.0
- 新機能: レイヤーパネル内に属性・値一覧パネルを追加しました。
    - 「属性・値一覧」ボタンでパネルを開き、表示中のベクトルレイヤーの属性と値を一覧表示します。
    - レイヤー選択、属性検索、列ソート、行クリックによる FlyTo に対応。
    - 表示時はウィジット幅の 2 倍、高さ 100% で展開します。
    - 閉じると幅を元の 1 倍に戻します。

## v16.0.2
- 修正: v16.0.1 で GeoJSON polygon に追加した `height: 0` を取り消しました。高さを定義するとテレインへのドレープ（GroundPrimitive 化）が無効になるためです。Cesium の `heightReference must also have a defined height` 警告は再び出ますが、ドレープ動作は意図通りのため無害です。
- 修正: `flyToAndNotify` の待機処理を UI iframe への委譲方式（`startTimer` / `timerDone` メッセージ）に変更しました。QuickJS ランタイムに `setTimeout` が無いため待機がスキップされていた問題を解消し、カメラ飛行完了後にマーカーが追加されるようになります。

## v16.0.1
- 修正: 起動時の初期化処理が二重に実行されていた問題を解消しました（`tryInitFromProperty` の重複呼び出しと TDZ で無効化されていた初期化ブロックを削除）。
- 修正: GeoJSON のデフォルト polygon スタイルに `height: 0` を追加し、Cesium の `heightReference must also have a defined height` 警告を解消しました。
- 改善: デバッグログを `DEBUG_LOG` フラグ（既定: false）でゲートし、本番でのコンソールログ出力を抑制しました。デバッグ時はソース先頭の `DEBUG_LOG` を `true` にしてください（UI 側ログにも反映されます）。

## v16.0.0
- 新機能: ベクトル検索に文字列検索を追加しました。
    - レイヤー・属性を「全選択」にして文字列で検索できます。
    - 検索結果をクリックすると該当する属性値の位置へ FlyTo します。
- 新機能: 検索機能を「住所検索」と「ベクトル検索」に分離しました。
    - 住所検索: Yahoo Local Search API または 国土地理院 住所検索 API を利用。
    - ベクトル検索: GeoJSON / CSV レイヤーの属性値をレイヤー・属性・文字列で検索。
- 修正: 検索タブの Yahoo 初期選択が AppID 未設定時に地理院になるよう改善。
- 修正: 拡張 sandbox では `fetch` が使えないため、ベクトルデータの URL 取得を UI iframe 側に移動。

## v15.6.0
- 新機能: 属性付きベクトル地物の検索（ベクトル検索）を追加しました。
    - Search タブに「属性」「値」の2段階ドロップダウンを配置。
    - 表示中の GeoJSON レイヤーを取得し、属性名と属性値の一覧を生成。
    - 属性値を選択して「Fly」で該当地物に移動します。
    - レイヤー追加・変更後は「ベクトルデータを更新」ボタンで再読み込みできます。

## v15.5.1
- 修正: 検索タブのレイアウトを調整しました。
    - プロバイダー選択ドロップダウンを「Search」見出しの右側に配置。
    - 検索ワード入力欄と検索ボタンを1段目に配置し、パネル幅内に収まるようにしました。

## v15.5.0
- 新機能: 検索タブで Yahoo Local Search API と 国土地理院（GSI）住所検索 API を選択できるようにしました。
    - `yahooAppId:` が設定されていない場合は、地理院検索が初期選択されます。
    - `yahooAppId:` が設定されている場合は、Yahoo 検索が初期選択されます。

## v15.4.0
- 新機能: 地物を選択した際に属性（Attr）タブを自動で開くようにしました。

## v15.3.0
- 変更: `attrUrlOpen` の既定値を `newtab` にしました。
    - 未指定の場合は `newtab` として動作します。
    - `attrUrlOpen: panel` と明示すれば属性パネル内の iframe 表示に戻ります。
- 変更: `attrUrlOpen` から `split` モードを削除しました。
    - `attrUrlOpen: panel|newtab` の 2 値のみサポートします。
    - 先頭に書いた `attrUrlOpen` の値が優先されます。

## v15.2.0
- 新機能: 属性（Attr）パネルのURLクリック動作をインスペクター設定で切り替え可能にしました。
    - `attrUrlOpen: panel|newtab` を設定テキストに記述できます。
    - `panel`: 属性パネル内の iframe 表示（従来通り）。
    - `newtab`: `window.parent` へ `openUrl` postMessage を送信し、`reearth.viewer.open(url)` で新しいタブ/ウィンドウに開きます（既定）。
    - 旧 `openUrlInNewTab: true` も `newtab` として利用できます（互換性のため）。
    - 既定値は `attrUrlOpen: newtab` です。

## v15.1.4
- 変更: SHARE タブの「Generate Link」でレイヤー ID リストを生成しないように変更
    - レイヤー ID はセッション専用のため、クエリ文字列に含めても他ページで再現できません。
    - 生成される文字列は `lat` / `lng` / `height` / `heading` / `pitch` のみ（必要に応じて）となります。

## v15.1.3
- 変更: SHARE タブの「Generate Link」は `?` 以降のクエリ文字列のみを生成するように変更
    - `reearth.viewer.viewport.query` は `?` 以降のみに対応するため、生成的に URL 全体ではなく `?lat=...&lng=...` 形式の文字列を出力します。
    - 生成結果は現在のページの URL に貼り付けて、または入力欄にそのまま貼り付けて使用できます。

## v15.1.2
- 修正: ハッシュ（`#`）パラメータの自動取得を廃止
    - Re:Earth Visualizer の UI iframe は `allow-same-origin` なしのサンドボックスのため、親ページの URL ハッシュにアクセスできません。
    - `reearth.viewer.viewport.query` は `?`（search）パラメータのみを提供し、`#` は取得できないことを確認しました。
    - 自動 URL 読込・SHARE タブの「URL読込 & FlyTo」は `?` パラメータのみに対応します。
- 補足: SHARE タブの URL ペースト入力＆Load は、貼り付けられた文字列から `?` と `#` の両方を解析可能です（手入力 URL の場合）。

## v15.1.1
- 新機能: SHARE タブに「現在位置から FlyTo」ボタンを追加
    - 端末の現在位置を取得し、カメラをその位置へ FlyTo します（既存の `requestGeolocation` フローを利用）。
- 機能強化: 手動 URL 読込（SHARE タブの「URL読込 & FlyTo」）で `?` パラメータと `#` ハッシュパラメータの両方に対応
    - UI 側で `?` / `#` の両方を解析し、メインプラグイン側の `reearth.viewer.viewport.query` とマージして適用します。

## v15.1.0
- 新機能: SHARE タブに「URL読込 & FlyTo」ボタンを追加
    - `reearth.viewer.viewport.query` から現在の URL パラメータを取得し、位置情報があればカメラを移動（flyTo）できます。
    - `lat` / `lng` / `height` / `heading` / `pitch` / `layers` に対応。
- 新機能: 起動時に URL パラメータを自動読み取り、位置情報があれば自動で FlyTo する機能を追加
    - プラグイン読み込み後に `reearth.viewer.viewport.query` を取得し、自動的にカメラ位置とレイヤー表示を復元します。

## v15.0.2
- バグ修正: レイヤー初期非表示設定が反映されず表示されていた問題を修正。
    - `setLayerVisibility` でレイヤーが実際に登録されているか確認する処理を追加。
    - `hide` / `show` メッセージでレイヤー登録のタイミング遅延に対応するリトライ処理を追加。

## v15.0.0
- 新機能: Shareによる位置情報の共有
- 新機能: Kasugaiとの連携
    - 参考: https://yamamoto-ryuzo.github.io/kasugai/

## v14.2.0
- バグ修正: 属性（Attr）パネル内でURLのリンクをクリックした際、Re:Earth の Sandbox 制限により外部サイトがエラーで開けない問題に対応しました。
    - Re:Earth の公式 API である `reearth.viewer.open(url)` を使用して安全に新しいタブを開くように修正しました。

## v14.0.0
- 新機能: 属性（Attr）タブの追加
    - Re:Earth上の地物を選択した際に、その属性情報を一覧表示する機能を追加しました。
    - 何も選択されていない場合は「No feature selected.」と表示されます。

## v13.0.0
- 修正: Re:Earth Visualizer の仕様変更に伴う地形（terrain）周りの不具合対応。
    - 背景: Visualizer 側で `terrain` のデフォルトが `reearth_terrain` に変更されたため、従来 `terrain: { enabled: true }` のみを送っていたプラグインでは期待する Cesium/Cesium ION の地形が使われず表示や挙動が変わる、あるいはエラーになる事象を確認しました。
    - 対策: プラグイン側から `terrain.type` を明示的に指定するように修正しました（例: Cesium ION を利用する場合は `type: "cesiumion"` を送る）。
- バグ修正: `reearth.extension.on("message", async (msg) => { ... })` のようにハンドラが Promise を直接返す実装によるメッセージチャネルの競合（非同期応答エラー）を解消するため、同期ハンドラに戻し内部を IIFE でラップする実装に変更しました。

## v12.0.0
- システムレイヤ制御機能の追加：
    - Inspectorの設定テキストで、Re:Earth側で登録済みのシステムレイヤ（プリセットレイヤ）の表示/非表示を初期制御できるようになりました。
    - 書式: `layer: レイヤ名 | off` （または `on`）
- ドキュメント更新：index.html にシステムレイヤ制御の設定方法を追記しました。

## v11.3.0
- 凡例の機能強化：
    - グルーピング機能を追加：`legend:Group|URL` 形式で記述することで、凡例をグループ化できます。
    - スクロール対応：レイヤリスト、凡例、情報パネルなどにスクロールバーを追加し、表示領域を最適化しました。
## v11.0.0
- 🔎 SEARCH（検索）：住所・施設名で検索して該当地点にワンクリックで FlyTo できます。検索は Yahoo! ジオコーダ API（サーバー経由のプロキシ）を利用可能です。Inspector に `yahooAppId: YOUR_APPID` を設定してください。
- レイヤ追加時に初期表示の ON/OFF を指定可能に：レイヤを追加する際にデフォルトで表示するか非表示にするかを指定できるようになりました。
## v10.0.0
- ナビゲーション（コンパス）機能を追加：UI上でカメラの方位（heading）を表示するコンパスを導入。クリックで方位を北（0°）にリセットし、Visualizer と連携して現在のカメラ方位を取得・同期できます。
- 2D 表示機能を追加：2D ビューへの切替ツールを導入。
## v9.0.0
- レイヤグループ化機能を追加：
    - `layer.data.group` またはタイトル内の `/` (スラッシュ) 区切りによる階層表示に対応。
    - **通常グループ (`/`)**: フォルダのように動作し、親のON/OFFで子を一括制御。
    - **排他グループ (`//`)**: ラジオボタンのように動作し、グループ内で1つのみ選択可能に（`親//子` のように記述）。
    - UI改善: 排他グループは二重丸アイコンと丸いチェックボックスで視覚的に区別。
## v8.0.0　
- ベースマップ機能を追加：`base:` 行で指定した XYZ タイルをベースマップとして扱い、UI にドロップダウン表示（Layers ヘッダ上）して 1 つだけ選択可能に。
	- `base:` はベースマップ専用として扱い、従来の `xyz:` は引き続きユーザーレイヤとして扱います。
	- ベースマップはユーザーレイヤ一覧に表示されません（内部で表示制御のみ行う）。
	- ドロップダウンと実際のアクティブベースマップの整合性を改善（URL のエンコード/比較ロジック強化、最後に追加したベースマップを優先選択）。
## v7.3.0
- GeoJSON レイヤー機能を追加：`geojson:` 行でURLを指定し、GeoJSONデータを表示可能に。
## v7.2.0
- 3D Tiles レイヤー機能を追加：`3dtiles:` 行でURLを指定し、3D Tilesを表示可能に。
## v7.1.0
- Depth Test トグルを追加：Google Photorealistic 3D Tiles 利用時の透過対策として、地下の隠蔽設定を切り替え可能に。
## v7.0.0
- 凡例機能を追加：`legend:` 行で画像URLを指定し、Legendタブで確認可能に。
## v6.0.0
- カメラプリセット機能を追加：`cam:` 行でカメラ位置を登録し、Cams タブからワンクリックで FlyTo 移動。
- 名前付きパラメータ対応：`h=高度` `d=方位°` `p=傾き°` を任意の順序で指定可能。未指定パラメータは現在のカメラ設定を維持。
- Current Camera パネルを追加：現在のカメラ位置をリアルタイムで確認・編集し、手動 FlyTo が可能。
## v5.0.0
- インスペクタ一括設定を導入（`inspectorText`）：行ごとに `xyz:` / `info:` で設定可能に。
- 背景色をインスペクターで設定可能に。
## v4.0.0
- Info表示を追加：プラグインの Info タブで外部 HTML を表示できるように。
## v3.0.0
- Terrain / Shadow トグルを実装：地形表示と影表示の切り替え。
## v2.0.0
- レイヤー一覧 UI を追加：読み込んだレイヤーの表示/非表示や管理を容易に。
## v1.0.0
- XYZ タイル管理の基本機能を実装：XYZ タイルの追加・表示をサポート。
