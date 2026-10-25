//! 数据库层：连接 + 迁移 + 三个通用 SQL 命令的实现（前端 `src/lib/db.ts` 唯一依赖）
//! 选型说明：用 rusqlite(bundled) 而不是 tauri-plugin-sql——我们需要在 Rust 侧
//! 直接参与事务（引擎、崩溃恢复、导出导入），plugin-sql 只能从 JS 侧发起。

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::{Map, Value};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::models::SqlStmt;

const MIGRATION_INIT: &str = include_str!("../migrations/001_init.sql");
const MIGRATION_SEED: &str = include_str!("../migrations/002_seed.sql");

/// 全局数据库状态。单连接 + Mutex：WAL 模式下单写连接是 docs/02 §11 的既定方案。
pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    /// 启动时打开 app_data_dir/auxilia.db 并跑迁移
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法定位应用数据目录：{e}"))?;
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("无法创建应用数据目录 {}：{e}", dir.display()))?;
        let file = dir.join("auxilia.db");
        let conn = Connection::open(&file)
            .map_err(|e| format!("无法打开数据库 {}：{e}", file.display()))?;

        // PRAGMA 用 execute_batch：journal_mode 会返回一行结果，pragma_update 会报错
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )
        .map_err(|e| format!("初始化数据库 PRAGMA 失败：{e}"))?;

        conn.execute_batch(MIGRATION_INIT)
            .map_err(|e| format!("执行 001_init.sql 失败：{e}"))?;

        // docs/02 的 001 里没有 last_fired_at（P6 §6.1 才要求），这里幂等补列，
        // 这样 001_init.sql 保持对文档的原样拷贝，重复启动也不会报 duplicate column。
        ensure_column(&conn, "tasks", "last_fired_at", "INTEGER")?;
        // TaskLine 的块需要"持续时间"才能画出长度（001 里只有 minute_of_day 一个点）
        ensure_column(&conn, "taskline_entries", "duration_minutes", "INTEGER")?;
        conn.execute(
            "UPDATE taskline_entries SET duration_minutes = 30 WHERE duration_minutes IS NULL",
            [],
        )
        .map_err(|e| format!("回填 TaskLine 块时长失败：{e}"))?;

        conn.execute_batch(MIGRATION_SEED)
            .map_err(|e| format!("执行 002_seed.sql 失败：{e}"))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// 统一入口：拿锁 → 执行 → 释放。**不要**在 await 期间持有闭包内的连接。
    pub fn with<T>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .conn
            .lock()
            .map_err(|_| "数据库连接锁已损坏，请重启 Auxilia".to_string())?;
        f(&mut guard)
    }
}

fn ensure_column(conn: &Connection, table: &str, column: &str, ty: &str) -> Result<(), String> {
    let exists = {
        let mut stmt = conn
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| format!("读取表结构失败（{table}）：{e}"))?;
        let mut rows = stmt
            .query([])
            .map_err(|e| format!("读取表结构失败（{table}）：{e}"))?;
        let mut found = false;
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("读取表结构失败（{table}）：{e}"))?
        {
            let name: String = row.get(1).map_err(|e| format!("读取列名失败：{e}"))?;
            if name == column {
                found = true;
                break;
            }
        }
        found
    };
    if exists {
        return Ok(());
    }
    conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {ty}"))
        .map_err(|e| format!("为 {table} 增加列 {column} 失败：{e}"))
}

/* ---------------- JSON <-> SQLite 值映射 ---------------- */

/// 前端传来的参数：布尔存 0/1，对象/数组降级成 JSON 字符串
fn json_to_sql(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().unwrap_or(0.0)),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

/// 读回来的值：number / string / null 三种，布尔按库里 0/1 原样返回
fn sql_to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        // 本期 schema 没有 BLOB 列，真出现时降级成 UTF-8 lossy，保证不 panic
        ValueRef::Blob(b) => Value::String(String::from_utf8_lossy(b).into_owned()),
    }
}

/// `db_select`：每行一个 JSON 对象，key 用 SQL 里的列别名（前端靠别名拿 camelCase）
pub fn select(conn: &Connection, sql: &str, params: &[Value]) -> Result<Vec<Value>, String> {
    let mut stmt = conn
        .prepare(sql)
        .map_err(|e| format!("SQL 解析失败：{e}"))?;
    let columns: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|c| (*c).to_string())
        .collect();
    let bound: Vec<SqlValue> = params.iter().map(json_to_sql).collect();
    let mut rows = stmt
        .query(params_from_iter(bound.iter()))
        .map_err(|e| format!("SQL 执行失败：{e}"))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| format!("读取结果行失败：{e}"))? {
        let mut obj = Map::with_capacity(columns.len());
        for (idx, name) in columns.iter().enumerate() {
            let value = row
                .get_ref(idx)
                .map_err(|e| format!("读取列 {name} 失败：{e}"))?;
            obj.insert(name.clone(), sql_to_json(value));
        }
        out.push(Value::Object(obj));
    }
    Ok(out)
}

/// `db_execute`：返回受影响行数
pub fn execute(conn: &Connection, sql: &str, params: &[Value]) -> Result<u64, String> {
    let bound: Vec<SqlValue> = params.iter().map(json_to_sql).collect();
    let affected = conn
        .execute(sql, params_from_iter(bound.iter()))
        .map_err(|e| format!("SQL 执行失败：{e}"))?;
    Ok(affected as u64)
}

/// `db_tx`：多条语句一个事务，任何一条失败就整体回滚
pub fn tx(conn: &mut Connection, stmts: &[SqlStmt]) -> Result<(), String> {
    let transaction = conn
        .transaction()
        .map_err(|e| format!("开启事务失败：{e}"))?;
    for (index, stmt) in stmts.iter().enumerate() {
        let bound: Vec<SqlValue> = stmt.params.iter().map(json_to_sql).collect();
        transaction
            .execute(&stmt.sql, params_from_iter(bound.iter()))
            .map_err(|e| format!("事务第 {} 条语句失败：{e}", index + 1))?;
    }
    transaction.commit().map_err(|e| format!("提交事务失败：{e}"))
}

/// 读一个布尔型设置（settings 表里存 '1'/'0'）
pub fn setting_bool(conn: &Connection, key: &str, fallback: bool) -> Result<bool, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| format!("读取设置失败：{e}"))?;
    let mut rows = stmt
        .query([key])
        .map_err(|e| format!("读取设置失败：{e}"))?;
    match rows.next().map_err(|e| format!("读取设置失败：{e}"))? {
        Some(row) => {
            let value: String = row.get(0).map_err(|e| format!("读取设置失败：{e}"))?;
            Ok(value == "1" || value.eq_ignore_ascii_case("true"))
        }
        None => Ok(fallback),
    }
}
