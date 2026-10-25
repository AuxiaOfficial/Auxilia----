//! 所有 #[tauri::command]。命令名与参数名必须和前端 `src/lib/db.ts` 完全一致
//! （Tauri v2 默认把 JS 的 camelCase 参数映射到 Rust 的 snake_case）。

use std::collections::HashMap;
use std::io::{Read, Write};

use base64::Engine as _;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

use crate::badges;
use crate::db::{self, Db};
use crate::engine::{self, Engine};
use crate::models::{new_id, now_ms, FinishResult, RunSnapshot, SqlStmt};
use crate::windows;

const CODE_PREFIX: &str = "aux1:";
const B64: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::URL_SAFE_NO_PAD;

/* ============================================================
   通用 SQL（前端 db.ts 的 select / exec 原语）
   ============================================================ */

#[tauri::command]
pub async fn db_select(
    db: State<'_, Db>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Value>, String> {
    db.inner().with(|conn| db::select(conn, &sql, &params))
}

#[tauri::command]
pub async fn db_execute(
    db: State<'_, Db>,
    sql: String,
    params: Vec<Value>,
) -> Result<u64, String> {
    db.inner().with(|conn| db::execute(conn, &sql, &params))
}

#[tauri::command]
pub async fn db_tx(db: State<'_, Db>, statements: Vec<SqlStmt>) -> Result<(), String> {
    db.inner().with(|conn| db::tx(conn, &statements))
}

/* ============================================================
   执行引擎
   ============================================================ */

#[tauri::command]
pub async fn run_start(
    app: AppHandle,
    db: State<'_, Db>,
    engine_state: State<'_, Engine>,
    task_id: String,
    prospect: String,
    planned_seconds: i64,
) -> Result<RunSnapshot, String> {
    let snap = engine::run_start(
        db.inner(),
        engine_state.inner(),
        &app,
        &task_id,
        &prospect,
        planned_seconds,
    )?;
    sync_run_windows(&app, &snap.display_mode);
    Ok(snap)
}

/// 按任务的 display_mode 唤起/收起 mini、float 窗口。
/// 规则：有 run 在用某种显示方式就显示对应窗口；全部结束就收起来。
pub fn sync_run_windows(app: &AppHandle, starting: &str) {
    let runs = app.state::<Engine>().active();
    let wants = |mode: &str| runs.iter().any(|r| r.display_mode == mode) || starting == mode;

    if wants("topbar") {
        let _ = windows::set_mini_position(app);
        let _ = windows::show_window(app, "mini");
    } else {
        let _ = windows::hide_window(app, "mini");
    }

    if wants("float") {
        let _ = windows::show_window(app, "float");
    } else {
        let _ = windows::hide_window(app, "float");
    }
}

#[tauri::command]
pub async fn run_pause(
    app: AppHandle,
    db: State<'_, Db>,
    engine_state: State<'_, Engine>,
    task_id: String,
) -> Result<RunSnapshot, String> {
    engine::run_pause(db.inner(), engine_state.inner(), &app, &task_id)
}

#[tauri::command]
pub async fn run_resume(
    app: AppHandle,
    db: State<'_, Db>,
    engine_state: State<'_, Engine>,
    task_id: String,
) -> Result<RunSnapshot, String> {
    engine::run_resume(db.inner(), engine_state.inner(), &app, &task_id)
}

#[tauri::command]
pub async fn run_finish(
    app: AppHandle,
    db: State<'_, Db>,
    engine_state: State<'_, Engine>,
    task_id: String,
    outcome: String,
    reflect_moment: String,
    reflect_next: String,
) -> Result<FinishResult, String> {
    let result = engine::run_finish(
        db.inner(),
        engine_state.inner(),
        &app,
        &task_id,
        &outcome,
        &reflect_moment,
        &reflect_next,
    )?;
    sync_run_windows(&app, "none");
    Ok(result)
}

#[tauri::command]
pub async fn run_abort(
    app: AppHandle,
    db: State<'_, Db>,
    engine_state: State<'_, Engine>,
    task_id: String,
) -> Result<(), String> {
    engine::run_abort(db.inner(), engine_state.inner(), &app, &task_id)?;
    sync_run_windows(&app, "none");
    Ok(())
}

#[tauri::command]
pub async fn runs_active(engine_state: State<'_, Engine>) -> Result<Vec<RunSnapshot>, String> {
    Ok(engine_state.inner().active())
}

/* ============================================================
   复盘：写 markdown 到用户指定目录
   ============================================================ */

/// 默认目录：文档/Auxilia/复盘（拿不到「文档」就退到 app_data_dir/reviews）
pub fn default_review_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("无法定位文档目录：{e}"))?;
    Ok(base.join("Auxilia").join("复盘"))
}

#[tauri::command]
pub async fn review_default_dir(app: AppHandle) -> Result<String, String> {
    Ok(default_review_dir(&app)?.to_string_lossy().to_string())
}

/// 把复盘正文写成 .md；dir 为空就用默认目录。返回最终路径。
#[tauri::command]
pub async fn review_save_md(
    app: AppHandle,
    dir: Option<String>,
    filename: String,
    content: String,
) -> Result<String, String> {
    let folder = match dir {
        Some(d) if !d.trim().is_empty() => std::path::PathBuf::from(d.trim()),
        _ => default_review_dir(&app)?,
    };
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("无法创建目录 {}：{e}", folder.display()))?;

    // 文件名只保留安全字符，避免 Windows 非法字符把导出搞失败
    let safe: String = filename
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c => c,
        })
        .collect();
    let safe = safe.trim().trim_end_matches('.').to_string();
    let safe = if safe.is_empty() { "复盘".to_string() } else { safe };
    let mut path = folder.join(format!("{safe}.md"));

    // 重名就加序号，绝不覆盖用户已经写过的内容
    let mut index = 2;
    while path.exists() {
        path = folder.join(format!("{safe}-{index}.md"));
        index += 1;
        if index > 999 {
            break;
        }
    }

    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("写入 {} 失败：{e}", path.display()))?;
    Ok(path.to_string_lossy().to_string())
}

/* ============================================================
   快捷键
   ============================================================ */

#[tauri::command]
pub async fn hotkey_get(db: State<'_, Db>) -> Result<String, String> {
    db.inner().with(|conn| Ok(crate::hotkey::load(conn)))
}

#[tauri::command]
pub async fn hotkey_set(
    app: AppHandle,
    db: State<'_, Db>,
    accelerator: String,
) -> Result<(), String> {
    let accel = accelerator.trim().to_string();
    if accel.is_empty() {
        return Err("快捷键不能为空".to_string());
    }
    db.inner()
        .with(|conn| crate::hotkey::rebind(&app, conn, &accel))
}

/* ============================================================
   成就 / 装饰
   ============================================================ */

#[tauri::command]
pub async fn badge_redeem(db: State<'_, Db>, code: String) -> Result<i64, String> {
    badges::badge_redeem(db.inner(), &code)
}

#[tauri::command]
pub async fn decoration_buy(db: State<'_, Db>, decoration_id: String) -> Result<i64, String> {
    badges::decoration_buy(db.inner(), &decoration_id)
}

/* ============================================================
   窗口
   ============================================================ */

#[tauri::command]
pub async fn ui_toggle_main(app: AppHandle) -> Result<(), String> {
    windows::toggle_main(&app);
    Ok(())
}

#[tauri::command]
pub async fn ui_show_main(app: AppHandle) -> Result<(), String> {
    windows::show_main(&app)
}

#[tauri::command]
pub async fn ui_hide_main(app: AppHandle) -> Result<(), String> {
    windows::hide_main(&app)
}

#[tauri::command]
pub async fn ui_show_window(app: AppHandle, label: String) -> Result<(), String> {
    windows::show_window(&app, &label)
}

#[tauri::command]
pub async fn ui_hide_window(app: AppHandle, label: String) -> Result<(), String> {
    windows::hide_window(&app, &label)
}

#[tauri::command]
pub async fn ui_set_mini_position(app: AppHandle) -> Result<(), String> {
    windows::set_mini_position(&app)
}

#[tauri::command]
pub async fn ui_popup_menu(app: AppHandle, label: String) -> Result<(), String> {
    windows::popup_window_menu(&app, &label)
}

#[tauri::command]
pub async fn ui_flash(app: AppHandle) -> Result<(), String> {
    windows::flash(&app)
}

/* ============================================================
   导入导出（aux1: + deflate + base64url，与前端 pako.deflateRaw 兼容）
   ============================================================ */

#[tauri::command]
pub async fn export_code(db: State<'_, Db>, ids: Vec<String>) -> Result<String, String> {
    if ids.is_empty() {
        return Err("请先选择要导出的任务".to_string());
    }
    let payload = db.inner().with(|conn| build_export(conn, &ids))?;
    let json_text =
        serde_json::to_string(&payload).map_err(|e| format!("序列化导出数据失败：{e}"))?;
    let mut encoder = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
    encoder
        .write_all(json_text.as_bytes())
        .map_err(|e| format!("压缩导出数据失败：{e}"))?;
    let compressed = encoder
        .finish()
        .map_err(|e| format!("压缩导出数据失败：{e}"))?;
    // 超过 8000 字符时前端会提示分批（E-9），Rust 侧照常返回
    Ok(format!("{CODE_PREFIX}{}", B64.encode(compressed)))
}

#[tauri::command]
pub async fn import_code(
    db: State<'_, Db>,
    code: String,
    strategy: String,
) -> Result<usize, String> {
    let raw = code.trim();
    let Some(encoded) = raw.strip_prefix(CODE_PREFIX) else {
        return Err("导入码格式不正确：缺少 aux1: 前缀".to_string());
    };
    let bytes = B64
        .decode(encoded.trim())
        .map_err(|e| format!("导入码解码失败：{e}"))?;
    let mut decoder = flate2::read::DeflateDecoder::new(&bytes[..]);
    let mut json_text = String::new();
    decoder
        .read_to_string(&mut json_text)
        .map_err(|e| format!("导入码解压失败：{e}"))?;
    let payload: Value =
        serde_json::from_str(&json_text).map_err(|e| format!("导入码内容不是合法 JSON：{e}"))?;
    let version = payload.get("v").and_then(|v| v.as_i64()).unwrap_or(0);
    if version != 1 {
        return Err(format!("导入码版本不支持：v{version}"));
    }
    let strategy = match strategy.as_str() {
        "overwrite" => "overwrite",
        "copy" => "copy",
        _ => "skip",
    };
    db.inner().with(|conn| apply_import(conn, &payload, strategy))
}

/* ---------------- 导入导出内部实现 ---------------- */

fn build_export(conn: &mut rusqlite::Connection, ids: &[String]) -> Result<Value, String> {
    let placeholders = vec!["?"; ids.len()].join(",");
    let params: Vec<Value> = ids.iter().map(|id| Value::String(id.clone())).collect();
    let tasks = db::select(
        conn,
        &format!(
            "SELECT id, title, note, lifecycle, expire_at, duration_mode, planned_seconds,
                    scheduled_at, alert_dialog, alert_flash, alert_sound, display_mode,
                    total_seconds, level, run_count, created_at, updated_at
             FROM tasks WHERE id IN ({placeholders})"
        ),
        &params,
    )?;
    let entries = db::select(
        conn,
        &format!(
            "SELECT id, taskline_id, task_id, minute_of_day, sort_index
             FROM taskline_entries WHERE task_id IN ({placeholders})"
        ),
        &params,
    )?;
    Ok(json!({ "v": 1, "tasks": tasks, "entries": entries }))
}

fn text(obj: &Value, key: &str) -> String {
    match obj.get(key) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn int(obj: &Value, key: &str) -> Option<i64> {
    match obj.get(key) {
        Some(Value::Number(n)) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Some(Value::String(s)) => s.parse::<i64>().ok(),
        Some(Value::Bool(b)) => Some(i64::from(*b)),
        _ => None,
    }
}

fn flag(obj: &Value, key: &str) -> i64 {
    match obj.get(key) {
        Some(Value::Bool(b)) => i64::from(*b),
        Some(Value::Number(n)) => i64::from(n.as_i64().unwrap_or(0) != 0),
        _ => 0,
    }
}

fn pick(obj: &Value, key: &str, allowed: &[&str], fallback: &str) -> String {
    let value = text(obj, key);
    if allowed.contains(&value.as_str()) {
        value
    } else {
        fallback.to_string()
    }
}

fn apply_import(
    conn: &mut rusqlite::Connection,
    payload: &Value,
    strategy: &str,
) -> Result<usize, String> {
    let tasks = payload
        .get("tasks")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let entries = payload
        .get("entries")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if tasks.is_empty() {
        return Err("导入码里没有任务".to_string());
    }
    let now = now_ms();
    let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
    let mut imported = 0usize;
    let mut id_map: HashMap<String, String> = HashMap::new();

    for task in &tasks {
        let title = text(task, "title");
        if title.is_empty() {
            continue;
        }
        let created_at = int(task, "created_at").unwrap_or(now);
        let lifecycle = pick(
            task,
            "lifecycle",
            &["permanent", "disposable", "expiring"],
            "permanent",
        );
        let mode = pick(
            task,
            "duration_mode",
            &["countdown", "countup", "scheduled"],
            "countdown",
        );
        let display_mode = pick(task, "display_mode", &["topbar", "none", "float"], "topbar");
        let original_id = text(task, "id");

        // 重复判定：标题 + 创建时间（docs/02 §6.6）
        let existing: Option<String> = txn
            .query_row(
                "SELECT id FROM tasks WHERE title = ?1 AND created_at = ?2 LIMIT 1",
                rusqlite::params![&title, created_at],
                |row| row.get(0),
            )
            .ok();

        match existing {
            Some(existing_id) => match strategy {
                "overwrite" => {
                    txn.execute(
                        "UPDATE tasks SET note = ?1, lifecycle = ?2, expire_at = ?3,
                                duration_mode = ?4, planned_seconds = ?5, scheduled_at = ?6,
                                alert_dialog = ?7, alert_flash = ?8, alert_sound = ?9,
                                display_mode = ?10, updated_at = ?11
                         WHERE id = ?12",
                        rusqlite::params![
                            text(task, "note"),
                            lifecycle,
                            int(task, "expire_at"),
                            mode,
                            int(task, "planned_seconds").unwrap_or(0),
                            int(task, "scheduled_at"),
                            flag(task, "alert_dialog"),
                            flag(task, "alert_flash"),
                            flag(task, "alert_sound"),
                            display_mode,
                            now,
                            &existing_id
                        ],
                    )
                    .map_err(|e| format!("覆盖任务「{title}」失败：{e}"))?;
                    id_map.insert(original_id, existing_id);
                    imported += 1;
                }
                "copy" => {
                    let new_task_id = new_id();
                    txn.execute(
                        "INSERT INTO tasks
                           (id, title, note, lifecycle, expire_at, duration_mode, planned_seconds,
                            scheduled_at, alert_dialog, alert_flash, alert_sound, display_mode,
                            status, total_seconds, level, run_count, last_active_at,
                            created_at, updated_at, deleted_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                                 'idle', 0, 1, 0, NULL, ?13, ?14, NULL)",
                        rusqlite::params![
                            &new_task_id,
                            format!("{title}（副本）"),
                            text(task, "note"),
                            lifecycle,
                            int(task, "expire_at"),
                            mode,
                            int(task, "planned_seconds").unwrap_or(0),
                            int(task, "scheduled_at"),
                            flag(task, "alert_dialog"),
                            flag(task, "alert_flash"),
                            flag(task, "alert_sound"),
                            display_mode,
                            now,
                            now
                        ],
                    )
                    .map_err(|e| format!("创建「{title}」副本失败：{e}"))?;
                    id_map.insert(original_id, new_task_id);
                    imported += 1;
                }
                // skip：跳过，条目也不会被导入
                _ => {}
            },
            None => {
                let new_task_id = if original_id.is_empty() {
                    new_id()
                } else {
                    original_id.clone()
                };
                let target_id = if id_map.values().any(|v| v == &new_task_id) {
                    new_id()
                } else {
                    new_task_id
                };
                txn.execute(
                    "INSERT INTO tasks
                       (id, title, note, lifecycle, expire_at, duration_mode, planned_seconds,
                        scheduled_at, alert_dialog, alert_flash, alert_sound, display_mode,
                        status, total_seconds, level, run_count, last_active_at,
                        created_at, updated_at, deleted_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                             'idle', 0, 1, 0, NULL, ?13, ?14, NULL)",
                    rusqlite::params![
                        &target_id,
                        title,
                        text(task, "note"),
                        lifecycle,
                        int(task, "expire_at"),
                        mode,
                        int(task, "planned_seconds").unwrap_or(0),
                        int(task, "scheduled_at"),
                        flag(task, "alert_dialog"),
                        flag(task, "alert_flash"),
                        flag(task, "alert_sound"),
                        display_mode,
                        created_at,
                        now
                    ],
                )
                .map_err(|e| format!("导入任务「{title}」失败：{e}"))?;
                id_map.insert(original_id, target_id);
                imported += 1;
            }
        }
    }

    // TaskLine 条目：只导入目标任务确实存在的，id 一律重建避免主键冲突
    for entry in &entries {
        let Some(target_task) = id_map.get(&text(entry, "task_id")) else {
            continue;
        };
        let taskline_id = text(entry, "taskline_id");
        if taskline_id.is_empty() {
            continue;
        }
        let minute_of_day = int(entry, "minute_of_day").unwrap_or(0).clamp(0, 1439);
        txn.execute(
            "INSERT OR IGNORE INTO taskline_entries
               (id, taskline_id, task_id, minute_of_day, sort_index)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                new_id(),
                taskline_id,
                target_task,
                minute_of_day,
                int(entry, "sort_index").unwrap_or(0)
            ],
        )
        .map_err(|e| format!("导入时间轴条目失败：{e}"))?;
    }

    txn.commit().map_err(|e| format!("提交导入失败：{e}"))?;
    Ok(imported)
}
