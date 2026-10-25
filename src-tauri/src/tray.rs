//! 托盘：图标 + 菜单「显示 / 退出」。tooltip 由引擎每 60s 刷新。
//! 不做状态托管——需要时用 app.tray_by_id 直接取回图标，避免锁与生命周期纠缠。

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    AppHandle, Manager,
};

pub const TRAY_ID: &str = "auxilia-tray";

pub fn create(app: &AppHandle) -> Result<(), String> {
    let show = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)
        .map_err(|e| format!("创建托盘菜单项失败：{e}"))?;
    let toggle = MenuItem::with_id(app, "toggle", "暂停 / 继续当前任务", true, None::<&str>)
        .map_err(|e| format!("创建托盘菜单项失败：{e}"))?;
    let abort = MenuItem::with_id(app, "abort", "中止当前任务", true, None::<&str>)
        .map_err(|e| format!("创建托盘菜单项失败：{e}"))?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)
        .map_err(|e| format!("创建托盘菜单项失败：{e}"))?;
    let menu = Menu::with_items(app, &[&show, &toggle, &abort, &quit])
        .map_err(|e| format!("创建托盘菜单失败：{e}"))?;

    let mut builder = tauri::tray::TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Auxilia")
        .show_menu_on_left_click(false)
        // 左键单击 = 打开主界面（用户直觉）
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = crate::windows::show_main(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                let _ = crate::windows::show_main(app);
            }
            "toggle" => {
                // 托盘里最常用的两个动作，不用把窗口叫出来就能操作
                let db = app.state::<crate::db::Db>();
                let engine = app.state::<crate::engine::Engine>();
                if let Some(run) = engine.active().first().cloned() {
                    if run.segment_started_at.is_some() {
                        let _ = crate::engine::run_pause(db.inner(), engine.inner(), app, &run.task_id);
                    } else {
                        let _ = crate::engine::run_resume(db.inner(), engine.inner(), app, &run.task_id);
                    }
                }
            }
            "abort" => {
                let db = app.state::<crate::db::Db>();
                let engine = app.state::<crate::engine::Engine>();
                if let Some(run) = engine.active().first().cloned() {
                    let _ = crate::engine::run_abort(db.inner(), engine.inner(), app, &run.task_id);
                }
            }
            "quit" => {
                // 真正退出只走这里：先允许退出，再记 clean_exit，最后 exit
                crate::allow_exit();
                crate::engine::mark_clean_exit(app);
                app.exit(0);
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder
        .build(app)
        .map_err(|e| format!("创建托盘图标失败：{e}"))?;
    Ok(())
}

/// tooltip：`写方案 · 24:31`；没有运行中的任务时显示 `Auxilia`
pub fn update_tooltip(app: &AppHandle) {
    let runs = app.state::<crate::engine::Engine>().active();
    let text = match runs.first() {
        Some(run) => {
            let now = crate::models::now_ms();
            let active = run.active_seconds(now);
            let seconds = if run.mode == "countdown" && run.planned_seconds > 0 {
                (run.planned_seconds - active).max(0)
            } else {
                active
            };
            format!("{} · {}", run.task_title, clock(seconds))
        }
        None => "Auxilia".to_string(),
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(text));
    }
}

fn clock(total_seconds: i64) -> String {
    let total = total_seconds.max(0);
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let seconds = total % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}
