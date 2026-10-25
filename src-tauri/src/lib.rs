//! App 构建、插件注册、生命周期串联。
//! 关键决策：关闭主窗口只 hide 不退出；退出只走托盘；退出前写 clean_exit=1。

mod badges;
mod commands;
mod db;
mod engine;
mod hotkey;
mod models;
mod tray;
mod windows;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{Emitter, Manager, WindowEvent};

use crate::db::Db;
use crate::engine::Engine;

/// 是否允许真正退出进程（只有托盘「退出」会置位）
static EXIT_ALLOWED: AtomicBool = AtomicBool::new(false);

pub fn allow_exit() {
    EXIT_ALLOWED.store(true, Ordering::SeqCst);
}

pub fn exit_allowed() -> bool {
    EXIT_ALLOWED.load(Ordering::SeqCst)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // 单实例必须最先注册：第二次启动时唤起已有窗口
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = crate::windows::show_main(app);
        }))
        // 自启动：默认开启，带 --minimized（启动后不显示主窗口）
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::db_select,
            commands::db_execute,
            commands::db_tx,
            commands::run_start,
            commands::run_pause,
            commands::run_resume,
            commands::run_finish,
            commands::run_abort,
            commands::runs_active,
            commands::hotkey_get,
            commands::hotkey_set,
            commands::badge_redeem,
            commands::decoration_buy,
            commands::ui_toggle_main,
            commands::ui_show_main,
            commands::ui_hide_main,
            commands::ui_show_window,
            commands::ui_hide_window,
            commands::ui_set_mini_position,
            commands::ui_flash,
            commands::ui_popup_menu,
            commands::export_code,
            commands::import_code,
            commands::review_save_md,
            commands::review_default_dir,
        ])
        // 浮窗右键菜单：id 形如 "mini:open" / "float:close"
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            let Some((label, action)) = id.split_once(':') else {
                return;
            };
            match action {
                "open" => {
                    let _ = windows::show_main(app);
                }
                "close" => {
                    let _ = windows::hide_window(app, label);
                }
                _ => {}
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // ① 数据库（含迁移）——必须在一切之前
            let database = Db::open(&handle).map_err(boxed)?;
            app.manage(database);

            // ② 引擎状态
            app.manage(Engine::new());

            // ③ 崩溃恢复（docs/02 §5.4 / P6 §6.4）
            let recovered = {
                let db = app.state::<Db>();
                let engine = app.state::<Engine>();
                engine::recover_on_startup(db.inner(), engine.inner()).unwrap_or_else(|err| {
                    eprintln!("[auxilia] 崩溃恢复失败：{err}");
                    Vec::new()
                })
            };
            if !recovered.is_empty() {
                let _ = handle.emit("run:changed", app.state::<Engine>().inner().active());
                // 恢复出来的 run 也要把 mini/float 唤起来，否则用户看不到还在计时
                commands::sync_run_windows(&handle, "none");
            }

            // ④ 关闭主窗口 = 隐藏（真正退出只走托盘）
            if let Some(main) = app.get_webview_window("main") {
                let win = main.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }
            // 辅助窗口同样只隐藏不销毁（销毁重建会有白屏）
            for label in ["mini", "float", "flash"] {
                if let Some(win) = app.get_webview_window(label) {
                    // Windows 上要让 WebView2 真的透出桌面，必须把 webview 底色设成全透明，
                    // 否则圆角外面那圈就是黑的（用户看到的"黑框"）。
                    let _ = win.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
                    // 再把窗口区域裁成圆角：不依赖 WebView2 的透明合成
                    if label == "mini" {
                        windows::round_window(&win, 13.0);
                    } else if label == "float" {
                        windows::round_window(&win, 12.0);
                    }
                    let handle = win.clone();
                    win.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = handle.hide();
                        }
                    });
                }
            }

            // ⑤ 托盘 + 快捷键（键位存在 settings 里，用户改过就用改过的）
            tray::create(&handle).map_err(boxed)?;
            let accelerator = app
                .state::<Db>()
                .inner()
                .with(|conn| Ok(hotkey::load(conn)))
                .unwrap_or_else(|_| hotkey::DEFAULT_HOTKEY.to_string());
            hotkey::register(&handle, &accelerator);

            // ⑥ 自启动默认开启（settings 里 autostart 显式写 '0' 才关）
            {
                use tauri_plugin_autostart::ManagerExt;
                let enabled = app
                    .state::<Db>()
                    .inner()
                    .with(|conn| crate::db::setting_bool(conn, "autostart", true))
                    .unwrap_or(true);
                let manager = handle.autolaunch();
                let outcome = if enabled {
                    manager.enable()
                } else {
                    manager.disable()
                };
                if let Err(err) = outcome {
                    eprintln!("[auxilia] 自启动设置失败：{err}");
                }
            }

            // ⑦ --minimized：启动后直接藏在托盘
            let minimized = std::env::args().any(|arg| arg == "--minimized");
            if minimized {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }

            // ⑧ mini 首次贴顶居中
            if let Err(err) = windows::set_mini_position(&handle) {
                eprintln!("[auxilia] {err}");
            }
            tray::update_tooltip(&handle);

            // ⑨ 后台调度：500ms tick（docs/02 §6.1）
            let tick_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut ticker = tokio::time::interval(Duration::from_millis(500));
                ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
                loop {
                    ticker.tick().await;
                    engine::tick(&tick_handle).await;
                }
            });

            // ⑩ 延迟 1.5s 再发恢复/补办事件，等前端订阅完成
            let boot_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                for task in recovered {
                    let _ = boot_handle.emit(
                        "run:recovered",
                        serde_json::json!({ "taskId": task.task_id }),
                    );
                }
                let db = boot_handle.state::<Db>();
                match engine::scheduled_missed(db.inner(), models::now_ms()) {
                    Ok(list) => {
                        for task in list {
                            let _ = boot_handle.emit("scheduled:missed", &task);
                        }
                    }
                    Err(err) => eprintln!("[auxilia] {err}"),
                }
            });

            Ok(())
        });

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(err) => {
            eprintln!("[auxilia] 启动失败：{err}");
            return;
        }
    };

    app.run(|app_handle, event| match event {
        // 关闭窗口 / Alt+F4 一律不退出：只隐藏到托盘
        tauri::RunEvent::ExitRequested { api, .. } => {
            if !exit_allowed() {
                api.prevent_exit();
            }
        }
        // 正常退出路径：写 clean_exit=1，下次启动不弹补记框
        tauri::RunEvent::Exit => {
            engine::mark_clean_exit(app_handle);
        }
        _ => {}
    });
}

/// 把 String 错误转成 Box<dyn Error>，让 setup 里的 `?` 能用
fn boxed(message: String) -> Box<dyn std::error::Error> {
    message.into()
}
