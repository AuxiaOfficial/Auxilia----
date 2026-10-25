//! 徽章求值 + Coin 兑换 + 装饰购买。
//! 条件格式只支持 docs/02 §6.5 那一类：{"all":[{"gte":["metric", n]}, ...]}
//! 指标：run_count / total_seconds / streak_days / reviews_count

use rusqlite::Connection;
use serde_json::Value as Json;
use tauri::{AppHandle, Emitter};

use crate::db::Db;
use crate::models::{now_ms, BadgeEarned};

struct Metrics {
    run_count: i64,
    total_seconds: i64,
    streak_days: i64,
    reviews_count: i64,
}

/// 求值并 emit 新解锁的徽章
pub fn evaluate(db: &Db, app: &AppHandle) -> Result<Vec<BadgeEarned>, String> {
    let earned = db.with(evaluate_in)?;
    for badge in &earned {
        let _ = app.emit("badge:earned", badge);
    }
    Ok(earned)
}

fn evaluate_in(conn: &mut Connection) -> Result<Vec<BadgeEarned>, String> {
    let metrics = Metrics::load(conn)?;
    let now = now_ms();

    let candidates: Vec<(String, String, i64, String)> = {
        let mut stmt = conn
            .prepare(
                "SELECT b.code, b.name, b.reward_coin, b.condition
                 FROM badges b LEFT JOIN user_badges ub ON ub.code = b.code
                 WHERE ub.code IS NULL
                 ORDER BY b.code ASC",
            )
            .map_err(|e| format!("查询徽章目录失败：{e}"))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| format!("查询徽章目录失败：{e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("查询徽章目录失败：{e}"))?);
        }
        out
    };
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
    let mut earned = Vec::new();
    for (code, name, reward_coin, condition) in candidates {
        if !condition_met(&condition, &metrics) {
            continue;
        }
        txn.execute(
            "INSERT OR IGNORE INTO user_badges (code, earned_at, redeemed) VALUES (?1, ?2, 0)",
            rusqlite::params![&code, now],
        )
        .map_err(|e| format!("解锁徽章 {code} 失败：{e}"))?;
        earned.push(BadgeEarned {
            code,
            name,
            reward_coin,
        });
    }
    txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
    Ok(earned)
}

impl Metrics {
    fn load(conn: &Connection) -> Result<Self, String> {
        let (run_count, total_seconds): (i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(active_seconds), 0)
                 FROM task_runs WHERE result = 'completed'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("统计执行数据失败：{e}"))?;
        let reviews_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reviews", [], |row| row.get(0))
            .map_err(|e| format!("统计复盘数量失败：{e}"))?;
        Ok(Self {
            run_count,
            total_seconds,
            streak_days: streak_days(conn)?,
            reviews_count,
        })
    }
}

/// 连续天数：用 SQLite 的 julianday 拿"本地日序号"，纯整数比较，不引日期库
fn streak_days(conn: &Connection) -> Result<i64, String> {
    let today: i64 = conn
        .query_row(
            "SELECT CAST(julianday(date('now','localtime')) AS INTEGER)",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("计算今日日期失败：{e}"))?;
    let days: Vec<i64> = {
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT CAST(julianday(date(started_at/1000,'unixepoch','localtime')) AS INTEGER) AS d
                 FROM task_runs WHERE result = 'completed' AND active_seconds > 0
                 ORDER BY d DESC LIMIT 400",
            )
            .map_err(|e| format!("统计连续天数失败：{e}"))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, i64>(0))
            .map_err(|e| format!("统计连续天数失败：{e}"))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|e| format!("统计连续天数失败：{e}"))?);
        }
        out
    };
    // 今天还没跑时，从昨天开始往回数（不给用户"断签"的焦虑）
    let mut cursor = if days.first() == Some(&today) {
        today
    } else {
        today - 1
    };
    let mut streak = 0;
    for day in days {
        if day == cursor {
            streak += 1;
            cursor -= 1;
        } else if day < cursor {
            break;
        }
    }
    Ok(streak)
}

fn condition_met(condition: &str, metrics: &Metrics) -> bool {
    let Ok(root) = serde_json::from_str::<Json>(condition) else {
        return false;
    };
    let Some(list) = root.get("all").and_then(|v| v.as_array()) else {
        return false;
    };
    if list.is_empty() {
        return false;
    }
    list.iter().all(|item| {
        let Some(args) = item.get("gte").and_then(|v| v.as_array()) else {
            return false;
        };
        let Some(metric) = args.first().and_then(|v| v.as_str()) else {
            return false;
        };
        let Some(target) = args.get(1).and_then(|v| v.as_i64()) else {
            return false;
        };
        let actual = match metric {
            "run_count" => metrics.run_count,
            "total_seconds" => metrics.total_seconds,
            "streak_days" => metrics.streak_days,
            "reviews_count" => metrics.reviews_count,
            _ => return false, // 不认识的指标一律判不满足，避免误发奖励
        };
        actual >= target
    })
}

/// 徽章兑换：reward_coin 加到 wallet，redeemed=1，返回新余额（已兑换则返回当前余额）
pub fn badge_redeem(db: &Db, code: &str) -> Result<i64, String> {
    db.with(|conn| -> Result<i64, String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        let found: Result<(i64, i64), _> = txn.query_row(
            "SELECT b.reward_coin, ub.redeemed
             FROM user_badges ub JOIN badges b ON b.code = ub.code
             WHERE ub.code = ?1",
            rusqlite::params![code],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        let (reward, redeemed) = found.map_err(|_| "这个徽章还没有解锁".to_string())?;

        if redeemed == 0 {
            txn.execute(
                "UPDATE user_badges SET redeemed = 1 WHERE code = ?1",
                rusqlite::params![code],
            )
            .map_err(|e| format!("标记徽章已兑换失败：{e}"))?;
            txn.execute(
                "UPDATE wallet SET coin = coin + ?1 WHERE id = 1",
                rusqlite::params![reward],
            )
            .map_err(|e| format!("发放 Coin 失败：{e}"))?;
        }
        let coin: i64 = txn
            .query_row("SELECT coin FROM wallet WHERE id = 1", [], |row| row.get(0))
            .unwrap_or(0);
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(coin)
    })
}

/// 装饰购买：校验 Coin 足够 → 写 owned_decorations → 扣款 → 返回余额
pub fn decoration_buy(db: &Db, decoration_id: &str) -> Result<i64, String> {
    db.with(|conn| -> Result<i64, String> {
        let txn = conn.transaction().map_err(|e| format!("开启事务失败：{e}"))?;
        let price: i64 = txn
            .query_row(
                "SELECT price FROM decorations WHERE id = ?1",
                rusqlite::params![decoration_id],
                |row| row.get(0),
            )
            .map_err(|_| "装饰不存在".to_string())?;
        let owned: i64 = txn
            .query_row(
                "SELECT COUNT(*) FROM owned_decorations WHERE decoration_id = ?1",
                rusqlite::params![decoration_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("查询已购装饰失败：{e}"))?;
        if owned > 0 {
            let coin: i64 = txn
                .query_row("SELECT coin FROM wallet WHERE id = 1", [], |row| row.get(0))
                .unwrap_or(0);
            txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
            return Ok(coin);
        }
        let coin: i64 = txn
            .query_row("SELECT coin FROM wallet WHERE id = 1", [], |row| row.get(0))
            .map_err(|e| format!("读取钱包失败：{e}"))?;
        if coin < price {
            // 直接返回 Err，txn 随作用域回滚
            return Err(format!("Coin 不足，还差 {} 枚", price - coin));
        }
        txn.execute(
            "UPDATE wallet SET coin = coin - ?1 WHERE id = 1",
            rusqlite::params![price],
        )
        .map_err(|e| format!("扣款失败：{e}"))?;
        txn.execute(
            "INSERT INTO owned_decorations (decoration_id, bought_at) VALUES (?1, ?2)",
            rusqlite::params![decoration_id, now_ms()],
        )
        .map_err(|e| format!("写入已购装饰失败：{e}"))?;
        txn.commit().map_err(|e| format!("提交事务失败：{e}"))?;
        Ok(coin - price)
    })
}
