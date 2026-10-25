//! 全局快捷键：默认 Shift+Space 切换主窗口，可在引导/设置里改。
//! 注册失败必须 emit `hotkey:failed` 并给出中文原因，**不允许静默失效**（E-6）。

use std::str::FromStr;

use rusqlite::Connection;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_HOTKEY: &str = "Shift+Space";
const SETTING_KEY: &str = "hotkey";

/// 从 settings 读当前快捷键，读不到就用默认值
pub fn load(conn: &Connection) -> String {
    let found: rusqlite::Result<String> = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [SETTING_KEY],
        |row| row.get(0),
    );
    found.unwrap_or_else(|_| DEFAULT_HOTKEY.to_string())
}

fn bind(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut = Shortcut::from_str(accelerator)
        .map_err(|_| format!("无法识别的快捷键组合：{accelerator}"))?;
    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            // 只响应按下，避免抬起时又切回一次
            if event.state == ShortcutState::Pressed {
                crate::windows::toggle_main(app);
            }
        })
        .map_err(|e| format!("{accelerator} 可能被输入法或其它软件占用（{e}）"))
}

/// 启动时注册（失败只提示，不中断启动）
pub fn register(app: &AppHandle, accelerator: &str) {
    if let Err(reason) = bind(app, accelerator) {
        eprintln!("[auxilia] 快捷键注册失败：{reason}");
        let _ = app.emit("hotkey:failed", &reason);
    }
}

/// 改键：先解绑旧的，再绑新的；成功才落库
pub fn rebind(app: &AppHandle, conn: &Connection, accelerator: &str) -> Result<(), String> {
    let _ = app.global_shortcut().unregister_all();
    if let Err(err) = bind(app, accelerator) {
        // 回滚：尽量恢复原来的键，避免用户没快捷键可用
        let previous = load(conn);
        let _ = bind(app, &previous);
        return Err(err);
    }
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![SETTING_KEY, accelerator],
    )
    .map_err(|e| format!("保存快捷键设置失败：{e}"))?;
    Ok(())
}
