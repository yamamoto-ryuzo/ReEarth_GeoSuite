// KASUGAI Canvas 連携エンドポイント。
// GeoSuite ベースマップパネルの「CV」ボタンから呼ばれ、現在シーンを
// .kasc プロジェクトとして KASUGAI Canvas アプリで開く。
//
//   GET  /canvas/status  → 起動中インスタンス・インストール状態の検出
//   POST /canvas/open    → {name, kasc} を %LOCALAPPDATA%\kasugai\canvas-export\
//                          <slug>\<slug>.kasc へ書き出し、起動中なら
//                          /api/projects/register + switchProject、
//                          未起動なら kasugai_canvas.exe を .kasc 引数で起動
//                          （.kasc 関連付けと同じ入口。起動済み二重起動も
//                          exe 側が /api/projects/register へ振り替える）
//
// 信頼境界: 127.0.0.1 専用のローカルエージェント経路（/vector と同等）。
// 到達者は .kasc の内容をローカルへ書き込み Canvas アプリを起動できる点に注意。
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

const CANVAS_PORT: u16 = 8510;
const CANVAS_EXE_NAME: &str = "kasugai_canvas.exe";
const CANVAS_SETUP_URL: &str =
    "https://raw.githubusercontent.com/yamamoto-ryuzo/kasugai_canvas/main/download/kasugai_canvas_setup.exe";
// .kasc 本文の上限（geo_suite 側は拡張ctx 4MB 制約で同程度に絞られる想定。
// DATA/ の data: 埋め込みを考慮し 16MB までは受ける）
const KASC_MAX_BYTES: usize = 16 * 1024 * 1024;

fn export_root() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local).join("kasugai").join("canvas-export");
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".kasugai").join("canvas-export")
}

// プロジェクト ID / フォルダ名に使える文字だけ残す（Canvas 側の
// sanitize_project_id と同じ規則: 非ASCIIは - 化）
fn sanitize_slug(name: &str) -> String {
    let id: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = id.trim_start_matches('.').trim_matches('-');
    let mut id: String = trimmed.chars().take(64).collect();
    if id.is_empty() {
        id = "scene".to_string();
    }
    id
}

// 起動中の Canvas 本体サーバー（既定 8510）の /health。
// {"status":"ok","name":"kasugai_canvas","version":..,"port":..} 以外は None
async fn canvas_health() -> Option<Value> {
    let res = reqwest::Client::new()
        .get(format!("http://127.0.0.1:{CANVAS_PORT}/health"))
        .timeout(Duration::from_millis(1500))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let v = res.json::<Value>().await.ok()?;
    (v.get("name").and_then(Value::as_str) == Some("kasugai_canvas")).then_some(v)
}

#[cfg(windows)]
fn reg_query_value(key: &str, value: &str) -> Option<String> {
    let out = std::process::Command::new("reg")
        .args(["query", key, "/v", value])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    // "    InstallLocation    REG_SZ    C:\kasugai\kasugai_canvas"
    for line in text.lines() {
        let line = line.trim();
        if !line.starts_with(value) {
            continue;
        }
        if let Some(pos) = line.find("REG_SZ") {
            let v = line[pos + 6..].trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

// インストール済み kasugai_canvas.exe のパスを解決する。
// 1) HKCU Uninstall の InstallLocation（インストーラ既定 C:\kasugai\kasugai_canvas）
// 2) .kasc 関連付け（HKCU\Software\Classes\KASUGAI.Canvas\shell\open\command）の exe
// 3) 既定パス直撃ち
#[cfg(windows)]
fn find_canvas_exe() -> Option<PathBuf> {
    if let Some(dir) = reg_query_value(
        r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\KASUGAI Canvas",
        "InstallLocation",
    ) {
        let exe = Path::new(&dir).join(CANVAS_EXE_NAME);
        if exe.is_file() {
            return Some(exe);
        }
    }
    if let Some(cmd) = reg_query_value(
        r"HKCU\Software\Classes\KASUGAI.Canvas\shell\open\command",
        "",
    ) {
        // '"<exe>" "--open-browser" "%1"' の先頭クォート内が exe パス
        if let Some(rest) = cmd.trim().strip_prefix('"') {
            if let Some(end) = rest.find('"') {
                let exe = PathBuf::from(&rest[..end]);
                if exe.is_file() {
                    return Some(exe);
                }
            }
        }
    }
    let exe = PathBuf::from(r"C:\kasugai\kasugai_canvas").join(CANVAS_EXE_NAME);
    exe.is_file().then_some(exe)
}

#[cfg(not(windows))]
fn find_canvas_exe() -> Option<PathBuf> {
    None
}

// exe を .kasc パス引数で起動する。Canvas 側は「.kasc を外部プロジェクト登録
// → ブラウザを開く」を行い、既起動インスタンスがあれば登録を転送して終了する
#[cfg(windows)]
fn spawn_canvas(exe: &Path, kasc_path: &Path) -> std::io::Result<()> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    std::process::Command::new(exe)
        .arg("--open-browser")
        .arg(kasc_path)
        .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
}

#[cfg(not(windows))]
fn spawn_canvas(_exe: &Path, _kasc_path: &Path) -> std::io::Result<()> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "canvas launch is windows-only",
    ))
}

async fn register_and_switch(kasc_path: &Path) -> Option<String> {
    let client = reqwest::Client::new();
    let path_str = kasc_path.to_string_lossy().to_string();
    let reg = client
        .post(format!(
            "http://127.0.0.1:{CANVAS_PORT}/api/projects/register"
        ))
        .json(&json!({ "path": path_str }))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?;
    if !reg.status().is_success() {
        return None;
    }
    let body = reg.json::<Value>().await.ok()?;
    let id = body.get("id").and_then(Value::as_str)?.to_string();
    // 起動中アプリのプロジェクト選択を切り替える（リモートコマンド経由・
    // フロントの executeChatTool が処理）。失敗しても登録自体は済んでいる
    let _ = client
        .post(format!("http://127.0.0.1:{CANVAS_PORT}/api/command"))
        .json(&json!({ "name": "switchProject", "args": { "projectId": id } }))
        .timeout(Duration::from_secs(3))
        .send()
        .await;
    Some(id)
}

// GET /canvas/status — パネル表示用の検出状態
pub async fn status() -> impl axum::response::IntoResponse {
    let running = canvas_health().await;
    let exe = find_canvas_exe();
    Json(json!({
        "canvas": true,
        "running": running.is_some(),
        "version": running
            .as_ref()
            .and_then(|v| v.get("version").cloned())
            .unwrap_or(Value::Null),
        "installed": exe.is_some(),
        "install_dir": exe
            .as_ref()
            .and_then(|p| p.parent().map(|d| d.display().to_string()))
            .unwrap_or_default(),
        "download": CANVAS_SETUP_URL,
    }))
}

// POST /canvas/open {name?, kasc} — .kasc を書き出して Canvas で開く
pub async fn open(body: axum::body::Bytes) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let err = |code: StatusCode, msg: &str| {
        (code, Json(json!({ "status": "error", "error": msg })))
    };
    let req: Value = serde_json::from_slice(&body)
        .map_err(|_| err(StatusCode::BAD_REQUEST, "invalid json"))?;
    let kasc = req
        .get("kasc")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if kasc.trim().is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "kasc is empty"));
    }
    if kasc.len() > KASC_MAX_BYTES {
        return Err(err(
            StatusCode::PAYLOAD_TOO_LARGE,
            "kasc too large (>16MB)",
        ));
    }
    let slug = sanitize_slug(req.get("name").and_then(Value::as_str).unwrap_or("scene"));
    let dir = export_root().join(&slug);
    let kasc_path = dir.join(format!("{slug}.kasc"));
    std::fs::create_dir_all(&dir)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &format!("export dir: {e}")))?;
    // DATA/ は .kasc の相対参照の受け皿。空でも作っておく
    let _ = std::fs::create_dir_all(dir.join("DATA"));
    std::fs::write(&kasc_path, &kasc)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &format!("write .kasc: {e}")))?;

    // 起動中インスタンスへ登録 + プロジェクト切替（ブラウザは開き直さず、
    // 既存タブ内で切り替わる。タブが無ければ切替は次回起動時に効く）
    if canvas_health().await.is_some() {
        return match register_and_switch(&kasc_path).await {
            Some(id) => Ok(Json(json!({
                "status": "opened",
                "mode": "running",
                "id": id,
                "path": kasc_path.display().to_string(),
            }))),
            None => Ok(Json(json!({
                "status": "registered_failed",
                "path": kasc_path.display().to_string(),
            }))),
        };
    }

    // 未起動: インストール済みなら exe 起動（.kasc 関連付けと同じ入口。
    // 起動中検出とのレースでは exe 側が register へ振り替える）
    if let Some(exe) = find_canvas_exe() {
        return match spawn_canvas(&exe, &kasc_path) {
            Ok(()) => Ok(Json(json!({
                "status": "opened",
                "mode": "launched",
                "path": kasc_path.display().to_string(),
            }))),
            Err(e) => Err(err(
                StatusCode::INTERNAL_SERVER_ERROR,
                &format!("launch failed: {e}"),
            )),
        };
    }

    // 未インストール: 書き出した .kasc の場所とインストーラ URL を返す
    Ok(Json(json!({
        "status": "not_installed",
        "download": CANVAS_SETUP_URL,
        "path": kasc_path.display().to_string(),
    })))
}
