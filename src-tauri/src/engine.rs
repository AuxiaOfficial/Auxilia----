//! 执行引擎（多任务并行版）。
//! 铁律：`active_seconds = closed_seconds + (now - segment_started_at)/1000`，
//! 任何地方都不许写 `elapsed += 1`。所有落库时长都由 `run_segments` 求和得出。
//!
//! 锁约定（防死锁）：引擎内存态只用一把锁；**任何时刻都不允许同时持有引擎锁与数据库锁**，
//! 一律「先用引擎锁算出结论 → 释放 → 再用数据库锁落库」。

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::Db;
use crate::models::{new_id, now_ms, FinishResult, RunSnapshot, TaskRef, TaskRow};

#[derive(Default)]
struct Inner {
    /// task_id -> 快照
    runs: HashMap<String, RunSnapshot>,
    /// 倒计时已到点并 emit 过的 run_id（防止每 500ms 重复 emit）
    fired: HashSet<String>,
    /// task_id -> 当前未闭合的 run_segments.id
    open_segments: HashMap<String, i64>,
    /// task_id -> 暂停开始的毫秒时间戳（续跑时结算 paused_seconds）
    paused_at: HashMap<String, i64>,
    /// 崩溃恢复出来、尚未被用户处置的 task_id
    recovered: HashSet<String>,
}

pub struct Engine {
    inner: Mutex<Inner>,
    last_heartbeat: AtomicI64,
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

impl Engine {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            last_heartbeat: AtomicI64::new(now_ms()),
        }
    }

    fn guard(&self) -> Result<MutexGuard<'_, Inner>, String> {
        self.inner
            .lock()
            .map_err(|_| "引擎状态锁已损坏，请重启 Auxilia".to_string())
    }

    /// 给前端的权威快照；`run:changed` 的 payload 与 `runs_active` 命令共用
    pub fn active(&self) -> Vec<RunSnapshot> {
        match self.guard() {
            Ok(inner) => {
                let mut list: Vec<RunSnapshot> = inner.runs.values().cloned().collect();
                list.sort_by_key(|r| r.started_at);
                list
            }
            Err(_) => Vec::new(),
        }
    }

    pub fn get(&self, task_id: &str) -> Option<RunSnapshot> {
        let inner = self.inner.lock().ok()?;
        inner.runs.get(task_id).cloned()
    }

    fn insert_run(&self, snap: RunSnapshot, segment_id: i64) -> Result<(), String> {
        let mut inner = self.guard()?;
        inner.fired.remove(&snap.run_id);
        inner.recovered.remove(&snap.task_id);
        inner.open_segments.insert(snap.task_id.clone(), segment_id);
        inner.paused_at.remove(&snap.task_id);
        inner.runs.insert(snap.task_id.clone(), snap);
        Ok(())
    }

    fn take_run(&self, task_id: &str) -> Option<RunSnapshot> {
        let mut inner = self.inner.lock().ok()?;
        inner.open_segments.remove(task_id);
        inner.paused_at.remove(task_id);
        inner.recovered.remove(task_id);
        inner.runs.remove(task_id)
    }

    fn update_run(&self, task_id: &str, f: impl FnOnce(&mut RunSnapshot)) -> Option<RunSnapshot> {
        let mut inner = self.inner.lock().ok()?;
        let run = inner.runs.get_mut(task_id)?;
        f(run);
        Some(run.clone())
    }

    fn open_segment(&self, task_id: &str) -> Option<i64> {
        let inner = self.inner.lock().ok()?;
        inner.open_segments.get(task_id).copied()
    }

    fn clear_open_segment(&self, task_id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.open_segments.remove(task_id);
        }
    }

    fn mark_fired(&self, run_id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.fired.insert(run_id.to_string());
        }
    }

    fn paused_at(&self, task_id: &str) -> Option<i64> {
        let inner = self.inner.lock().ok()?;
        inner.paused_at.get(task_id).copied()
    }

    fn is_recovered(&self, task_id: &str) -> bool {
        match self.inner.lock() {
            Ok(inner) => inner.recovered.contains(task_id),
            Err(_) => false,
        }
    }

    /// 启动 1.5s 后要 emit `run:recovered` 的列表
    pub fn recovered_tasks(&self) -> Vec<TaskRef> {
        match self.guard() {
            Ok(inner) => inner
                .recovered
                .iter()
                .filter_map(|task_id| inner.runs.get(task_id))
                .map(|run| TaskRef {
                    task_id: run.task_id.clone(),
                    title: run.task_title.clone(),
                })
                .collect(),
            Err(_) => Vec::new(),
        }
    }
}

/* ============================================================
   命令实现
   ============================================================ */

pub fn emit_runs(app: &AppHandle, engine: &Engine) {
    // 前端 runStore 里是 listen<RunSnapshot[]>('run:changed')，这里必须是数组
    let _ = app.emit("run:changed", engine.active());
}

fn load_task(conn: &rusqlite::Connection, task_id: &str) -> Result<Option<TaskRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, title, lifecycle, duration_mode, planned_seconds, display_mode,
                    alert_dialog, alert_flash, alert_sound
             FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
        )
        .map_err(|e| format!("查询任务失败：{e}"))?;
    let mut rows = stmt.query([task_id]).map_err(|e| format!("查询任务失败：{e}"))?;
    match rows.next().map_err(|e| format!("查询任务失败：{e}"))? {
        Some(row) => Ok(Some(TaskRow {
            id: row.get(0).map_err(|e| format!("读取任务失败：{e}"))?,
            title: row.get(1).map_err(|e| format!("读取任务失败：{e}"))?,
            lifecycle: row.get(2).map_err(|e| format!("读取任务失败：{e}"))?,
            mode: row.get(3).map_err(|e| format!("读取任务失败：{e}"))?,
            planned_seconds: row.get(4).map_err(|e| format!("读取任务失败：{e}"))?,
            display_mode: row.get(5).map_err(|e| format!("读取任务失败：{e}"))?,
            alert_dialog: row.get::<_, i64>(6).unwrap_or(0) != 0,
            alert_flash: row.get::<_, i64>(7).unwrap_or(0) != 0,
            alert_sound: row.get::<_, i64>(8).unwrap_or(0) != 0,
        })),
        None => Ok(None),
    }
}

pub fn run_start(
    db: &Db,
    engine: &Engine,
    app: &AppHandle,
    task_id: &str,
    prospect: &str,
    planned_seconds: i64,
) -> Result<RunSnapshot, String> {
    let task = db
        .with(|conn| load_task(conn, task_id))?
        .ok_or_else(|| "任务不存在或已被删除".to_string())?;

    // 多任务并行：同一任务不允许重复起跑（不同任务可以并行）
    if engine.get(task_id).is_some() {
        return Err(format!("「{}」已经在计时中，先结束它", task.title));
    }

    let now = now_ms();
    let planned = if planned_seconds > 0 {
        planned_seconds
    } else {
        task.planned_seconds
    };
    let run_id = new_id();

    // 先写库（库是唯一真相），再改内存态
    let segment_id = db.with(|conn| -> Result<i64, String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        txn.execute(
            "INSERT INTO task_runs
               (id, task_id, prospect, started_at, ended_at, active_seconds, paused_seconds,
                interruptions, outcome, reflect_moment, reflect_next, result, coin_earned)
             VALUES (?1, ?2, ?3, ?4, NULL, 0, 0, 0, '', '', '', NULL, 0)",
            rusqlite::params![&run_id, &task.id, prospect, now],
        )
        .map_err(|e| format!("写入执行记录失败：{e}"))?;
        txn.execute(
            "INSERT INTO run_segments (run_id, started_at, ended_at) VALUES (?1, ?2, NULL)",
            rusqlite::params![&run_id, now],
        )
        .map_err(|e| format!("写入计时段落失败：{e}"))?;
        let seg = txn.last_insert_rowid();
        txn.execute(
            "UPDATE tasks SET status = 'running', run_count = run_count + 1,
                    last_active_at = ?1, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, &task.id],
        )
        .map_err(|e| format!("更新任务状态失败：{e}"))?;
        txn.execute(
            "INSERT INTO app_state (id, run_id, heartbeat, clean_exit) VALUES (1, ?1, ?2, 0)
             ON CONFLICT(id) DO UPDATE SET run_id = excluded.run_id,
                                           heartbeat = excluded.heartbeat,
                                           clean_exit = 0",
            rusqlite::params![&run_id, now],
        )
        .map_err(|e| format!("写入运行状态失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(seg)
    })?;

    let snapshot = RunSnapshot {
        run_id,
        task_id: task.id.clone(),
        task_title: task.title.clone(),
        mode: task.mode.clone(),
        planned_seconds: planned.max(0),
        segment_started_at: Some(now),
        closed_seconds: 0,
        paused_seconds: 0,
        started_at: now,
        prospect: prospect.to_string(),
        display_mode: task.display_mode.clone(),
        alert_dialog: task.alert_dialog,
        alert_flash: task.alert_flash,
        alert_sound: task.alert_sound,
    };
    engine.insert_run(snapshot.clone(), segment_id)?;
    emit_runs(app, engine);
    Ok(snapshot)
}

pub fn run_pause(db: &Db, engine: &Engine, app: &AppHandle, task_id: &str) -> Result<RunSnapshot, String> {
    let snap = engine
        .get(task_id)
        .ok_or_else(|| "该任务当前没有在计时".to_string())?;
    let Some(segment_started_at) = snap.segment_started_at else {
        return Err("任务已经处于暂停状态".to_string());
    };
    let now = now_ms();
    let segment_id = engine.open_segment(task_id);

    db.with(|conn| -> Result<(), String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        if let Some(seg) = segment_id {
            txn.execute(
                "UPDATE run_segments SET ended_at = ?1 WHERE id = ?2",
                rusqlite::params![now, seg],
            )
            .map_err(|e| format!("闭合计时段落失败：{e}"))?;
        }
        txn.execute(
            "UPDATE tasks SET status = 'paused', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, task_id],
        )
        .map_err(|e| format!("更新任务状态失败：{e}"))?;
        // 每暂停一次记一次中断；paused_seconds 在续跑时按时间戳差结算
        txn.execute(
            "UPDATE task_runs SET interruptions = interruptions + 1 WHERE id = ?1",
            rusqlite::params![&snap.run_id],
        )
        .map_err(|e| format!("记录中断次数失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(())
    })?;

    // 内存态：闭合当前区间（差值来自时间戳，不是 tick 累加）
    let closed_added = ((now - segment_started_at).max(0)) / 1000;
    let updated = engine
        .update_run(task_id, |run| {
            run.closed_seconds += closed_added;
            run.segment_started_at = None;
        })
        .ok_or_else(|| "该任务当前没有在计时".to_string())?;
    engine.clear_open_segment(task_id);
    if let Ok(mut inner) = engine.inner.lock() {
        inner.paused_at.insert(task_id.to_string(), now);
    }
    emit_runs(app, engine);
    Ok(updated)
}

pub fn run_resume(db: &Db, engine: &Engine, app: &AppHandle, task_id: &str) -> Result<RunSnapshot, String> {
    let snap = engine
        .get(task_id)
        .ok_or_else(|| "该任务当前没有在计时".to_string())?;
    if snap.segment_started_at.is_some() {
        return Err("任务正在计时中".to_string());
    }
    let now = now_ms();
    let pause_seconds = engine
        .paused_at(task_id)
        .map(|t| ((now - t).max(0)) / 1000)
        .unwrap_or(0);
    let paused_total = snap.paused_seconds + pause_seconds;

    let segment_id = db.with(|conn| -> Result<i64, String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        txn.execute(
            "INSERT INTO run_segments (run_id, started_at, ended_at) VALUES (?1, ?2, NULL)",
            rusqlite::params![&snap.run_id, now],
        )
        .map_err(|e| format!("写入计时段落失败：{e}"))?;
        let seg = txn.last_insert_rowid();
        txn.execute(
            "UPDATE tasks SET status = 'running', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, task_id],
        )
        .map_err(|e| format!("更新任务状态失败：{e}"))?;
        txn.execute(
            "UPDATE task_runs SET paused_seconds = ?1 WHERE id = ?2",
            rusqlite::params![paused_total, &snap.run_id],
        )
        .map_err(|e| format!("写入暂停时长失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(seg)
    })?;

    let updated = engine
        .update_run(task_id, |run| {
            run.segment_started_at = Some(now);
            run.paused_seconds = paused_total;
        })
        .ok_or_else(|| "该任务当前没有在计时".to_string())?;
    if let Ok(mut inner) = engine.inner.lock() {
        inner.open_segments.insert(task_id.to_string(), segment_id);
        inner.paused_at.remove(task_id);
    }
    emit_runs(app, engine);
    Ok(updated)
}

/// 结束：active_seconds 一律由 run_segments 求和得出（绝不用计时器累加）
pub fn run_finish(
    db: &Db,
    engine: &Engine,
    app: &AppHandle,
    task_id: &str,
    outcome: &str,
    reflect_moment: &str,
    reflect_next: &str,
) -> Result<FinishResult, String> {
    let snap = engine
        .get(task_id)
        .ok_or_else(|| "该任务当前没有在计时".to_string())?;
    let now = now_ms();
    let segment_id = engine.open_segment(task_id);

    let result = db.with(|conn| -> Result<FinishResult, String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        if let Some(seg) = segment_id {
            txn.execute(
                "UPDATE run_segments SET ended_at = ?1 WHERE id = ?2",
                rusqlite::params![now, seg],
            )
            .map_err(|e| format!("闭合计时段落失败：{e}"))?;
        }
        let active_seconds: i64 = txn
            .query_row(
                "SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN 0
                                          ELSE (ended_at - started_at) / 1000 END), 0)
                 FROM run_segments WHERE run_id = ?1",
                rusqlite::params![&snap.run_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("统计专注时长失败：{e}"))?;
        // 每分钟 1 coin，不足一分钟按一分钟算（短任务也应有正反馈）
        let coin_earned = if active_seconds > 0 {
            (active_seconds + 59) / 60
        } else {
            0
        };

        txn.execute(
            "UPDATE task_runs SET ended_at = ?1, active_seconds = ?2, paused_seconds = ?3,
                    outcome = ?4, reflect_moment = ?5, reflect_next = ?6,
                    result = 'completed', coin_earned = ?7
             WHERE id = ?8",
            rusqlite::params![
                now,
                active_seconds,
                snap.paused_seconds,
                outcome,
                reflect_moment,
                reflect_next,
                coin_earned,
                &snap.run_id
            ],
        )
        .map_err(|e| format!("写入执行结果失败：{e}"))?;

        let (total_seconds, lifecycle): (i64, String) = txn
            .query_row(
                "SELECT total_seconds, lifecycle FROM tasks WHERE id = ?1",
                rusqlite::params![task_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("读取任务累计时长失败：{e}"))?;
        let new_total = total_seconds + active_seconds;
        // 每 100 分钟升一级（docs/02 §5.2）
        let level = new_total / 6000 + 1;

        if lifecycle == "disposable" {
            // 一次性任务：完成后物理删除（级联清 task_runs / run_segments / taskline_entries）
            txn.execute("DELETE FROM tasks WHERE id = ?1", rusqlite::params![task_id])
                .map_err(|e| format!("删除一次性任务失败：{e}"))?;
        } else {
            txn.execute(
                "UPDATE tasks SET total_seconds = ?1, level = ?2, status = 'idle',
                        last_active_at = ?3, updated_at = ?3 WHERE id = ?4",
                rusqlite::params![new_total, level, now, task_id],
            )
            .map_err(|e| format!("更新任务累计失败：{e}"))?;
        }

        txn.execute(
            "UPDATE wallet SET coin = coin + ?1 WHERE id = 1",
            rusqlite::params![coin_earned],
        )
        .map_err(|e| format!("结算 Coin 失败：{e}"))?;
        txn.execute(
            "UPDATE app_state SET run_id = NULL, heartbeat = ?1, clean_exit = 0 WHERE id = 1",
            rusqlite::params![now],
        )
        .map_err(|e| format!("清理运行状态失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;

        Ok(FinishResult {
            coin_earned,
            active_seconds,
            level,
        })
    })?;

    engine.take_run(task_id);
    emit_runs(app, engine);

    // 徽章求值（内部会 emit badge:earned），失败不影响结束流程
    if let Err(err) = crate::badges::evaluate(db, app) {
        eprintln!("[auxilia] 徽章求值失败：{err}");
    }
    Ok(result)
}

pub fn run_abort(db: &Db, engine: &Engine, app: &AppHandle, task_id: &str) -> Result<(), String> {
    let snap = engine
        .get(task_id)
        .ok_or_else(|| "该任务当前没有在计时".to_string())?;
    let now = now_ms();
    let segment_id = engine.open_segment(task_id);
    // 崩溃恢复出来的那次执行，用户选"放弃"时应记 crashed 而不是 aborted
    let result = if engine.is_recovered(task_id) {
        "crashed"
    } else {
        "aborted"
    };

    db.with(|conn| -> Result<(), String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        if let Some(seg) = segment_id {
            txn.execute(
                "UPDATE run_segments SET ended_at = ?1 WHERE id = ?2",
                rusqlite::params![now, seg],
            )
            .map_err(|e| format!("闭合计时段落失败：{e}"))?;
        }
        let active_seconds: i64 = txn
            .query_row(
                "SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN 0
                                          ELSE (ended_at - started_at) / 1000 END), 0)
                 FROM run_segments WHERE run_id = ?1",
                rusqlite::params![&snap.run_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("统计专注时长失败：{e}"))?;
        txn.execute(
            "UPDATE task_runs SET ended_at = ?1, active_seconds = ?2, paused_seconds = ?3,
                    result = ?4, coin_earned = 0 WHERE id = ?5",
            rusqlite::params![now, active_seconds, snap.paused_seconds, result, &snap.run_id],
        )
        .map_err(|e| format!("写入执行结果失败：{e}"))?;
        // 中止不计入 tasks.total_seconds（"此次不计入成就"）
        txn.execute(
            "UPDATE tasks SET status = 'idle', last_active_at = ?1, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, task_id],
        )
        .map_err(|e| format!("更新任务状态失败：{e}"))?;
        txn.execute(
            "UPDATE app_state SET run_id = NULL, heartbeat = ?1, clean_exit = 0 WHERE id = 1",
            rusqlite::params![now],
        )
        .map_err(|e| format!("清理运行状态失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(())
    })?;

    engine.take_run(task_id);
    emit_runs(app, engine);
    Ok(())
}

/* ============================================================
   崩溃恢复
   ============================================================ */

/// 启动时调用。返回需要 emit `run:recovered` 的 { taskId }（lib.rs 延迟 1.5s 发）。
pub fn recover_on_startup(db: &Db, engine: &Engine) -> Result<Vec<TaskRef>, String> {
    let now = now_ms();
    let state = db.with(|conn| -> Result<Option<(Option<String>, i64, i64)>, String> {
        let mut stmt = conn
            .prepare("SELECT run_id, heartbeat, clean_exit FROM app_state WHERE id = 1")
            .map_err(|e| format!("读取运行状态失败：{e}"))?;
        let mut rows = stmt.query([]).map_err(|e| format!("读取运行状态失败：{e}"))?;
        match rows.next().map_err(|e| format!("读取运行状态失败：{e}"))? {
            Some(row) => Ok(Some((
                row.get::<_, Option<String>>(0).map_err(|e| format!("读取运行状态失败：{e}"))?,
                row.get::<_, i64>(1).map_err(|e| format!("读取运行状态失败：{e}"))?,
                row.get::<_, i64>(2).map_err(|e| format!("读取运行状态失败：{e}"))?,
            ))),
            None => Ok(None),
        }
    })?;

    let Some((run_id, heartbeat, clean_exit)) = state else {
        db.with(|conn| -> Result<(), String> {
            conn.execute(
                "INSERT OR IGNORE INTO app_state (id, run_id, heartbeat, clean_exit) VALUES (1, NULL, ?1, 0)",
                rusqlite::params![now],
            )
            .map(|_| ())
            .map_err(|e| format!("初始化运行状态失败：{e}"))
        })?;
        return Ok(Vec::new());
    };

    let Some(run_id) = run_id.filter(|id| !id.is_empty()) else {
        db.with(|conn| -> Result<(), String> {
            conn.execute(
                "UPDATE app_state SET clean_exit = 0, heartbeat = ?1 WHERE id = 1",
                rusqlite::params![now],
            )
            .map(|_| ())
            .map_err(|e| format!("初始化运行状态失败：{e}"))
        })?;
        return Ok(Vec::new());
    };

    // 读未结束的 run + 任务信息
    let open = db.with(|conn| -> Result<Option<OpenRun>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT r.id, r.task_id, t.title, t.duration_mode, t.planned_seconds,
                        t.display_mode, t.alert_dialog, t.alert_flash, t.alert_sound,
                        r.started_at, r.prospect, r.paused_seconds, t.status
                 FROM task_runs r JOIN tasks t ON t.id = r.task_id
                 WHERE r.id = ?1 AND r.ended_at IS NULL",
            )
            .map_err(|e| format!("查询未结束执行失败：{e}"))?;
        let mut rows = stmt
            .query([&run_id])
            .map_err(|e| format!("查询未结束执行失败：{e}"))?;
        match rows.next().map_err(|e| format!("查询未结束执行失败：{e}"))? {
            Some(row) => Ok(Some(OpenRun {
                run_id: row.get(0).map_err(|e| format!("读取执行记录失败：{e}"))?,
                task_id: row.get(1).map_err(|e| format!("读取执行记录失败：{e}"))?,
                title: row.get(2).map_err(|e| format!("读取执行记录失败：{e}"))?,
                mode: row.get(3).map_err(|e| format!("读取执行记录失败：{e}"))?,
                planned_seconds: row.get(4).map_err(|e| format!("读取执行记录失败：{e}"))?,
                display_mode: row.get(5).map_err(|e| format!("读取执行记录失败：{e}"))?,
                alert_dialog: row.get::<_, i64>(6).unwrap_or(0) != 0,
                alert_flash: row.get::<_, i64>(7).unwrap_or(0) != 0,
                alert_sound: row.get::<_, i64>(8).unwrap_or(0) != 0,
                started_at: row.get(9).map_err(|e| format!("读取执行记录失败：{e}"))?,
                prospect: row.get(10).map_err(|e| format!("读取执行记录失败：{e}"))?,
                paused_seconds: row.get(11).map_err(|e| format!("读取执行记录失败：{e}"))?,
                status: row.get(12).map_err(|e| format!("读取执行记录失败：{e}"))?,
            })),
            None => Ok(None),
        }
    })?;

    let Some(open) = open else {
        db.with(|conn| -> Result<(), String> {
            conn.execute(
                "UPDATE app_state SET run_id = NULL, heartbeat = ?1, clean_exit = 0 WHERE id = 1",
                rusqlite::params![now],
            )
            .map(|_| ())
            .map_err(|e| format!("清理运行状态失败：{e}"))
        })?;
        return Ok(Vec::new());
    };

    // 收口最后的 segment：只有上次是 running 才允许把 ended_at 延到心跳时刻
    // （心跳是"最后存活时刻"，比崩溃后的 now 更准；paused 状态下的 ended_at 已经精确，不动它）
    let last_alive = if heartbeat > 0 { heartbeat } else { open.started_at };
    let active_seconds = db.with(|conn| -> Result<i64, String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        if open.status == "running" || open.status == "paused" {
            txn.execute(
                "UPDATE run_segments SET ended_at = ?1
                 WHERE run_id = ?2 AND (ended_at IS NULL OR ended_at < ?1)",
                rusqlite::params![last_alive, &open.run_id],
            )
            .map_err(|e| format!("收口计时段落失败：{e}"))?;
        }
        let active: i64 = txn
            .query_row(
                "SELECT COALESCE(SUM(CASE WHEN ended_at IS NULL THEN 0
                                          ELSE (ended_at - started_at) / 1000 END), 0)
                 FROM run_segments WHERE run_id = ?1",
                rusqlite::params![&open.run_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("统计专注时长失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(active)
    })?;

    if clean_exit != 0 {
        // 上次是正常退出（托盘"退出"）：不打扰用户，静默记为 crashed
        db.with(|conn| -> Result<(), String> {
            let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
            txn.execute(
                "UPDATE task_runs SET ended_at = ?1, active_seconds = ?2, result = 'crashed',
                        coin_earned = 0 WHERE id = ?3",
                rusqlite::params![last_alive, active_seconds, &open.run_id],
            )
            .map_err(|e| format!("归档执行记录失败：{e}"))?;
            txn.execute(
                "UPDATE tasks SET status = 'idle', updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, &open.task_id],
            )
            .map_err(|e| format!("重置任务状态失败：{e}"))?;
            txn.execute(
                "UPDATE app_state SET run_id = NULL, heartbeat = ?1, clean_exit = 0 WHERE id = 1",
                rusqlite::params![now],
            )
            .map_err(|e| format!("清理运行状态失败：{e}"))?;
            txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
            Ok(())
        })?;
        return Ok(Vec::new());
    }

    // 异常退出：把这次执行恢复成"暂停中"的内存态，让前端走结束流程（补记 / 放弃）
    db.with(|conn| -> Result<(), String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        txn.execute(
            "UPDATE tasks SET status = 'paused', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, &open.task_id],
        )
        .map_err(|e| format!("重置任务状态失败：{e}"))?;
        txn.execute(
            "UPDATE app_state SET run_id = ?1, heartbeat = ?2, clean_exit = 0 WHERE id = 1",
            rusqlite::params![&open.run_id, now],
        )
        .map_err(|e| format!("写入运行状态失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(())
    })?;

    let snapshot = RunSnapshot {
        run_id: open.run_id.clone(),
        task_id: open.task_id.clone(),
        task_title: open.title.clone(),
        mode: open.mode.clone(),
        planned_seconds: open.planned_seconds,
        segment_started_at: None, // 暂停态：时间不再走
        closed_seconds: active_seconds,
        paused_seconds: open.paused_seconds,
        started_at: open.started_at,
        prospect: open.prospect.clone(),
        display_mode: open.display_mode.clone(),
        alert_dialog: open.alert_dialog,
        alert_flash: open.alert_flash,
        alert_sound: open.alert_sound,
    };
    if let Ok(mut inner) = engine.inner.lock() {
        inner.recovered.insert(open.task_id.clone());
        inner.runs.insert(open.task_id.clone(), snapshot);
    } else {
        return Err("引擎状态锁已损坏，请重启 Auxilia".to_string());
    }
    Ok(vec![TaskRef {
        task_id: open.task_id,
        title: open.title,
    }])
}

struct OpenRun {
    run_id: String,
    task_id: String,
    title: String,
    mode: String,
    planned_seconds: i64,
    display_mode: String,
    alert_dialog: bool,
    alert_flash: bool,
    alert_sound: bool,
    started_at: i64,
    prospect: String,
    paused_seconds: i64,
    status: String,
}

/// 启动补办提醒（FR-E8）：错过触发时间的 scheduled 任务。返回后由 lib.rs emit `scheduled:missed`。
pub fn scheduled_missed(db: &Db, now: i64) -> Result<Vec<TaskRef>, String> {
    let list = db.with(|conn| -> Result<Vec<TaskRef>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, title FROM tasks
                 WHERE deleted_at IS NULL AND duration_mode = 'scheduled'
                   AND scheduled_at IS NOT NULL AND scheduled_at < ?1 - 60000
                   AND (expire_at IS NULL OR expire_at > ?1)
                   AND (last_fired_at IS NULL OR last_fired_at < scheduled_at)
                 ORDER BY scheduled_at ASC LIMIT 5",
            )
            .map_err(|e| format!("查询错过的定时任务失败：{e}"))?;
        let mut rows = stmt
            .query(rusqlite::params![now])
            .map_err(|e| format!("查询错过的定时任务失败：{e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("查询错过的定时任务失败：{e}"))?
        {
            out.push(TaskRef {
                task_id: row.get(0).map_err(|e| format!("读取定时任务失败：{e}"))?,
                title: row.get(1).map_err(|e| format!("读取定时任务失败：{e}"))?,
            });
        }
        Ok(out)
    })?;
    // 标记已提醒，避免下一次启动重复打扰（用户不点就当天算了）
    for task in &list {
        if let Err(err) = db.with(|conn| -> Result<(), String> {
            conn.execute(
                "UPDATE tasks SET last_fired_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, &task.task_id],
            )
            .map(|_| ())
            .map_err(|e| format!("标记定时任务失败：{e}"))
        }) {
            eprintln!("[auxilia] {err}");
        }
    }
    Ok(list)
}

/* ============================================================
   后台调度：tokio interval(500ms)
   ============================================================ */

pub async fn tick(app: &AppHandle) {
    let now = now_ms();
    let db = app.state::<Db>();
    let engine = app.state::<Engine>();
    let db = db.inner();
    let engine = engine.inner();
    countdown_tick(db, engine, app, now);
    scheduled_tick(db, engine, app, now);
    heartbeat_tick(db, engine, app, now);
}

/// ① 倒计时归零：只标记"已到点"+ emit，不自动完成任务（交给前端走结束流程）
fn countdown_tick(db: &Db, engine: &Engine, app: &AppHandle, now: i64) {
    let mut due: Vec<(String, String, i64)> = Vec::new(); // task_id, run_id, 精确到点时刻
    if let Ok(inner) = engine.inner.lock() {
        for run in inner.runs.values() {
            if run.mode != "countdown" || run.planned_seconds <= 0 {
                continue;
            }
            let Some(segment_started_at) = run.segment_started_at else {
                continue; // 暂停中或已到点
            };
            if inner.fired.contains(&run.run_id) {
                continue; // 已经 emit 过，别再每 500ms 吵一次
            }
            if run.active_seconds(now) < run.planned_seconds {
                continue;
            }
            let remaining = (run.planned_seconds - run.closed_seconds).max(0);
            // 用"剩余秒数换算毫秒"定位真实到点时刻，避免多算到 tick 边界（±500ms）
            due.push((
                run.task_id.clone(),
                run.run_id.clone(),
                segment_started_at + remaining * 1000,
            ));
        }
    }

    for (task_id, run_id, ended_at) in due {
        let segment_id = engine.open_segment(&task_id);
        let close_at = ended_at.min(now);
        if let Err(err) = db.with(|conn| -> Result<(), String> {
            let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
            if let Some(seg) = segment_id {
                txn.execute(
                    "UPDATE run_segments SET ended_at = ?1 WHERE id = ?2",
                    rusqlite::params![close_at, seg],
                )
                .map_err(|e| format!("闭合计时段落失败：{e}"))?;
            }
            txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
            Ok(())
        }) {
            eprintln!("[auxilia] 倒计时收口失败：{err}");
        }

        let planned = engine
            .update_run(&task_id, |run| {
                run.closed_seconds = run.planned_seconds;
                run.segment_started_at = None;
            })
            .map(|run| run.planned_seconds)
            .unwrap_or(0);
        let _ = planned;
        engine.clear_open_segment(&task_id);
        engine.mark_fired(&run_id);

        // 前端只订阅这几个阈值事件（禁止每秒推送）
        let _ = app.emit(
            "timer:finished",
            serde_json::json!({ "taskId": task_id }),
        );
        // 到点必须把软件叫到最前面：用户要的是"直接被扔进复盘"，而不是自己去托盘里翻
        let _ = crate::windows::show_main(app);
        emit_runs(app, engine);
    }
}

/// ② scheduled 到点：空闲就自动开跑，有任务在跑就询问 + 顺延一个周期
fn scheduled_tick(db: &Db, engine: &Engine, app: &AppHandle, now: i64) {
    let due = match db.with(|conn| -> Result<Vec<TaskRef>, String> {
        // 只看最近 60 秒内到点的：更早的错过的交给启动补办提醒（FR-E8）
        let mut stmt = conn
            .prepare(
                "SELECT id, title FROM tasks
                 WHERE deleted_at IS NULL AND duration_mode = 'scheduled'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= ?1 AND scheduled_at > ?1 - 60000
                   AND (expire_at IS NULL OR expire_at > ?1)
                   AND (last_fired_at IS NULL OR last_fired_at < scheduled_at)
                 ORDER BY scheduled_at ASC LIMIT 3",
            )
            .map_err(|e| format!("查询到点的定时任务失败：{e}"))?;
        let mut rows = stmt
            .query(rusqlite::params![now])
            .map_err(|e| format!("查询到点的定时任务失败：{e}"))?;
        let mut out = Vec::new();
        while let Some(row) = rows
            .next()
            .map_err(|e| format!("查询到点的定时任务失败：{e}"))?
        {
            out.push(TaskRef {
                task_id: row.get(0).map_err(|e| format!("读取定时任务失败：{e}"))?,
                title: row.get(1).map_err(|e| format!("读取定时任务失败：{e}"))?,
            });
        }
        Ok(out)
    }) {
        Ok(list) => list,
        Err(err) => {
            eprintln!("[auxilia] {err}");
            return;
        }
    };
    if due.is_empty() {
        return;
    }

    for task in due {
        // 先记触发时间，确保同一个 scheduled 任务不会重复触发
        if let Err(err) = db.with(|conn| -> Result<(), String> {
            conn.execute(
                "UPDATE tasks SET last_fired_at = ?1, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![now, &task.task_id],
            )
            .map(|_| ())
            .map_err(|e| format!("标记定时任务失败：{e}"))
        }) {
            eprintln!("[auxilia] {err}");
        }

        let busy = !engine.active().is_empty();
        if busy {
            // 有任务在跑：通知前端询问是否打断，并把 scheduled_at 顺延一个周期（24h）
            // 避免同一到点窗口反复触发（每 500ms 一次 tick）
            if let Err(err) = db.with(|conn| -> Result<(), String> {
                conn.execute(
                    "UPDATE tasks SET scheduled_at = scheduled_at + 86400000, updated_at = ?1
                     WHERE id = ?2 AND scheduled_at IS NOT NULL",
                    rusqlite::params![now, &task.task_id],
                )
                .map(|_| ())
                .map_err(|e| format!("顺延定时任务失败：{e}"))
            }) {
                eprintln!("[auxilia] {err}");
            }
            let _ = app.emit("scheduled:conflict", &task);
        } else {
            // 空闲：直接开跑（ephemeral，不弹窗，prospect 留空）
            if let Err(err) = run_start(db, engine, app, &task.task_id, "", 0) {
                eprintln!("[auxilia] 自动开始「{}」失败：{err}", task.title);
            }
        }
    }
}

/// ③ 心跳：每 60s 写 app_state.heartbeat + run_segments 快照 + 刷新托盘 tooltip
fn heartbeat_tick(db: &Db, engine: &Engine, app: &AppHandle, now: i64) {
    let last = engine.last_heartbeat.load(Ordering::Relaxed);
    if now - last < 60_000 {
        return;
    }
    engine.last_heartbeat.store(now, Ordering::Relaxed);

    let (open_segments, primary_run): (Vec<i64>, Option<String>) =
        match engine.inner.lock() {
            Ok(inner) => (
                inner.open_segments.values().copied().collect(),
                inner.runs.values().next().map(|run| run.run_id.clone()),
            ),
            Err(_) => (Vec::new(), None),
        };

    if let Err(err) = db.with(|conn| -> Result<(), String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        // 快照：把仍打开的 segment 的 ended_at 刷成"最后存活时刻"，
        // 崩溃后 recover_on_startup 就能拿到准确到 60s 的时长
        for seg in &open_segments {
            txn.execute(
                "UPDATE run_segments SET ended_at = ?1 WHERE id = ?2",
                rusqlite::params![now, seg],
            )
            .map_err(|e| format!("写入计时段落快照失败：{e}"))?;
        }
        txn.execute(
            "INSERT INTO app_state (id, run_id, heartbeat, clean_exit) VALUES (1, ?1, ?2, 0)
             ON CONFLICT(id) DO UPDATE SET run_id = excluded.run_id,
                                           heartbeat = excluded.heartbeat,
                                           clean_exit = 0",
            rusqlite::params![primary_run, now],
        )
        .map_err(|e| format!("写入心跳失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(())
    }) {
        eprintln!("[auxilia] 心跳写入失败：{err}");
    }

    // 托盘 tooltip 每分钟刷一次（每秒刷系统 API 太贵）
    crate::tray::update_tooltip(app);
}

/// 正常退出：clean_exit = 1，下次启动就不会弹补记对话框
pub fn mark_clean_exit(app: &AppHandle) {
    let now = now_ms();
    let db = app.state::<Db>();
    if let Err(err) = db.inner().with(|conn| -> Result<(), String> {
        conn.execute(
            "UPDATE app_state SET clean_exit = 1, heartbeat = ?1 WHERE id = 1",
            rusqlite::params![now],
        )
        .map(|_| ())
        .map_err(|e| format!("写入退出标记失败：{e}"))
    }) {
        eprintln!("[auxilia] {err}");
    }
}
