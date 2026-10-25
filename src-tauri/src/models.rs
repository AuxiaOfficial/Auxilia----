//! 与前端 `src/lib/types.ts` 共享的 serde 结构体。
//! 铁律：`RunSnapshot` 字段名必须与前端逐字一致（camelCase），否则前端计时会全错。

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// 全后端唯一的时间入口：毫秒 i64（docs/02 §5.2）
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// nanoid(12) 等价物：时间纳秒 + 进程内自增序号混合，避免额外依赖且同进程内不重复。
pub fn new_id() -> String {
    const ALPHABET: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    let mut n = nanos ^ (seq.wrapping_mul(0x9E37_79B9_7F4A_7C15));
    let mut buf = [b'0'; 12];
    for slot in buf.iter_mut().rev() {
        *slot = ALPHABET[(n % 36) as usize];
        n /= 36;
    }
    String::from_utf8_lossy(&buf).into_owned()
}

/// 运行时快照：`runs_active` 返回值，也是 `run:changed` 事件的 payload 元素。
/// 前端 `runStore` 里 `listen<RunSnapshot[]>('run:changed', ...)` 要的是数组。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSnapshot {
    pub run_id: String,
    pub task_id: String,
    pub task_title: String,
    /// "countdown" | "countup" | "scheduled"
    pub mode: String,
    pub planned_seconds: i64,
    /// None = 暂停中（或倒计时已到点）
    pub segment_started_at: Option<i64>,
    /// 已闭合区间的秒数和（不含当前区间、不含暂停）
    pub closed_seconds: i64,
    pub paused_seconds: i64,
    pub started_at: i64,
    pub prospect: String,
    pub display_mode: String,
    pub alert_dialog: bool,
    pub alert_flash: bool,
    pub alert_sound: bool,
}

impl RunSnapshot {
    /// 纯时间戳差推算，永不累加（docs/02 §6.1 铁律）
    pub fn active_seconds(&self, now: i64) -> i64 {
        self.closed_seconds + self.segment_started_at.map_or(0, |s| (now - s).max(0) / 1000)
    }
}

/// `run_finish` 的返回值（前端 `runRepo.finish` 期望的字段名）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishResult {
    pub coin_earned: i64,
    pub active_seconds: i64,
    pub level: i64,
}

/// `db_tx` 的一条语句
#[derive(Debug, Deserialize)]
pub struct SqlStmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<serde_json::Value>,
}

/// `badge:earned` 的 payload
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeEarned {
    pub code: String,
    pub name: String,
    pub reward_coin: i64,
}

/// `scheduled:conflict` / `scheduled:missed` 的 payload（前端读 taskId + title）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRef {
    pub task_id: String,
    pub title: String,
}

/// tasks 表里引擎真正关心的列
#[derive(Debug, Clone)]
pub struct TaskRow {
    pub id: String,
    pub title: String,
    pub lifecycle: String,
    pub mode: String,
    pub planned_seconds: i64,
    pub display_mode: String,
    pub alert_dialog: bool,
    pub alert_flash: bool,
    pub alert_sound: bool,
}
