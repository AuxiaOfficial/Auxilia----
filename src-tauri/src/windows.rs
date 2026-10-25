//! 窗口模型：四个窗口都在 tauri.conf.json 预创建，前端只能 show/hide，不销毁不重建。
//! 销毁重建会有 300ms+ 白屏（docs/02 §3）。

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewWindow};

fn window(app: &AppHandle, label: &str) -> Result<WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("窗口 {label} 不存在（tauri.conf.json 里应预创建）"))
}

/// Shift+Space 用：可见 → 隐藏；隐藏 → 显示并聚焦
pub fn toggle_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let visible = win.is_visible().unwrap_or(false);
        if visible {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

pub fn show_main(app: &AppHandle) -> Result<(), String> {
    let win = window(app, "main")?;
    win.show().map_err(|e| format!("显示主窗口失败：{e}"))?;
    win.set_focus().map_err(|e| format!("聚焦主窗口失败：{e}"))?;
    Ok(())
}

pub fn hide_main(app: &AppHandle) -> Result<(), String> {
    window(app, "main")?
        .hide()
        .map_err(|e| format!("隐藏主窗口失败：{e}"))
}

pub fn show_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let win = window(app, label)?;
    win.show().map_err(|e| format!("显示窗口 {label} 失败：{e}"))?;
    Ok(())
}

pub fn hide_window(app: &AppHandle, label: &str) -> Result<(), String> {
    let win = window(app, label)?;
    win.hide().map_err(|e| format!("隐藏窗口 {label} 失败：{e}"))?;
    Ok(())
}

/// mini 贴主屏顶部居中（x 居中、y = 0），DPI 变化后由前端再次调用
pub fn set_mini_position(app: &AppHandle) -> Result<(), String> {
    let win = window(app, "mini")?;
    let monitor = match win.primary_monitor() {
        Ok(Some(m)) => Some(m),
        _ => win.current_monitor().ok().flatten(),
    };
    let Some(monitor) = monitor else {
        return Ok(()); // 拿不到显示器信息就保持原位，不算错误
    };
    let scale = monitor.scale_factor();
    let origin = monitor.position();
    let size = monitor.size();
    // tauri.conf 里 96×26 是逻辑像素，居中要用物理像素算
    let window_width = (96.0 * scale).round() as i32;
    let x = origin.x + (size.width as i32 - window_width) / 2;
    win.set_position(PhysicalPosition::new(x, origin.y))
        .map_err(|e| format!("定位迷你窗口失败：{e}"))?;
    Ok(())
}

/// 闪屏：显示 → 480ms 后自动隐藏（前端的涟漪动画也按这个时长设计）。
/// 必须 set_ignore_cursor_events，否则全屏窗口会吃掉用户的所有点击。
pub fn flash(app: &AppHandle) -> Result<(), String> {
    let win = window(app, "flash")?;
    win.set_ignore_cursor_events(true)
        .map_err(|e| format!("设置闪屏穿透失败：{e}"))?;
    win.show().map_err(|e| format!("显示闪屏失败：{e}"))?;
    // 关键：隐藏窗口里的 CSS 动画早就播完了，show() 不会重播，
    // 所以必须由 Rust 显式通知前端重新起一轮（之前水波"完全看不到"就是这个原因）。
    let _ = win.eval("window.dispatchEvent(new Event('aux-flash'))");
    let target = win.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(520)).await;
        let _ = target.hide();
    });
    Ok(())
}

/// 把窗口本身裁成圆角矩形。
/// 为什么不用 CSS：Windows 上 WebView2 的透明合成并不总是生效，
/// 圆角外侧那圈"黑框"其实是窗口自己的底色。用 SetWindowRgn 直接把窗口
/// 区域切掉，任何显卡/驱动下都不会再露出直角。
#[cfg(windows)]
pub fn round_window(win: &WebviewWindow, radius: f64) {
    use windows_sys::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};

    let Ok(hwnd) = win.hwnd() else { return };
    let Ok(size) = win.outer_size() else { return };
    let scale = win.scale_factor().unwrap_or(1.0);
    let w = size.width as i32;
    let h = size.height as i32;
    let r = (radius * scale).round().max(1.0) as i32;

    unsafe {
        let rgn = CreateRoundRectRgn(0, 0, w + 1, h + 1, r * 2, r * 2);
        if !rgn.is_null() {
            // 最后一个参数 true：重绘窗口
            SetWindowRgn(hwnd.0 as _, rgn, 1);
        }
    }
}

#[cfg(not(windows))]
pub fn round_window(_win: &WebviewWindow, _radius: f64) {}

/// 浮窗右键菜单。id 里带窗口 label，回到 app 层的 on_menu_event 统一处理。
pub fn popup_window_menu(app: &AppHandle, label: &str) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem};

    let win = window(app, label)?;
    let open = MenuItem::with_id(app, format!("{label}:open"), "打开软件界面", true, None::<&str>)
        .map_err(|e| format!("创建菜单项失败：{e}"))?;
    let close = MenuItem::with_id(app, format!("{label}:close"), "关闭浮窗", true, None::<&str>)
        .map_err(|e| format!("创建菜单项失败：{e}"))?;
    let menu = Menu::with_items(app, &[&open, &close]).map_err(|e| format!("创建菜单失败：{e}"))?;
    win.popup_menu(&menu).map_err(|e| format!("弹出菜单失败：{e}"))
}
