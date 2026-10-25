# Auxilia 项目状态

> 每次开新会话都要把这份文件贴进去。
> 维护规则：每完成一项就更新「已完成 / 待办」，并刷新「验收情况」。

## 当前阶段

P8 交互打磨（第二轮）：拖拽、键盘、浮窗、反馈动画、属性编辑已完成

## 怎么跑

```powershell
$env:PATH="C:\Users\19350\.workbuddy\binaries\node\versions\22.22.2-6;$env:PATH"
$env:PATH="C:\Users\19350\.cargo\bin;$env:PATH"

npm install
npm run dev            # 浏览器预览（内存假数据）
npm run desktop        # 真实桌面端（需要 Vite 已在 5183 跑）
npm run typecheck / build
npm run desktop:build  # NSIS 安装包（尚未验证）
```

开发版 exe：`src-tauri\target\debug\auxilia.exe`（依赖 Vite，否则白屏）。
Rust 是 GNU 目标（`x86_64-pc-windows-gnu`，链接器 `D:/mingw64/bin/gcc.exe`），不要改回 MSVC。

## 已完成

### 骨架 / 数据 / 主流程（P0-P7）
脚手架、13 张表 + 迁移、任务 CRUD、新建六步、阻尼滚轮、TaskLine、执行引擎（并行/暂停/崩溃恢复）、结束流程、成就、复盘。

### 交互与细节（P8 第一轮）
自绘右键菜单、任务/TaskLine 重命名、拖拽修复（`dragDropEnabled:false` + `dropEffect`）、跳过复盘结算、设置页、复盘写 md、运行记录、灰阶两层、slogan 打字机、图标、键盘 Esc/Enter/方向键。

### 交互与细节（P8 第二轮）
- **拖拽**：关闭 Tauri 原生拖放接管（`dragDropEnabled:false`），这才是"鼠标显示 🚫"的根因；
  自绘拖拽幽灵（隐藏原生拖影 + 水平速度驱动倾角，停下自动回正）
- **TaskLine 时长块**：`taskline_entries.duration_minutes`（迁移 + 回填 30）；
  块长 = 任务计划时长（正计时/定时默认 30m）；悬停显示幽灵块（标题 + 落点 + 时长）；
  块下边缘可拖拽拉伸，5 分钟吸附
- **键盘统一层**：新建抽屉每步自动聚焦第一个选项（方向键立即可用）、
  数字键 1-9 直选当前步的选项、Enter 触发该步主按钮；开始面板 Enter = 开始（Shift+Enter 换行）
- **完成置顶**：`timer:finished` 由 Rust 直接 `show_main`，不再只切换视图
- **闪光/水波**：隐藏窗口里的 CSS 动画早已播完 → Rust 在 `show()` 后 `eval` 派发 `aux-flash` 重播
- **提示音**：首次点击/按键时 `unlockAudio()` 解锁 AudioContext（自动播放策略）
- **浮窗**：去掉双击全屏（改为 `startDragging()` 手动拖）；右键原生菜单（打开软件界面 / 关闭浮窗）
- **托盘**：左键单击打开主界面；右键菜单新增「暂停 / 继续当前任务」「中止当前任务」
- **删除执行中的任务**：先 `abort` 再删除，提示「已中止并删除」
- **任务属性面板**：右键 → 修改属性，可改计时方式/计划时长/提示力度/显示方式
- **导入码**：默认 `copy` 策略（同一个码反复导回也不再是 0 个），空结果有提示
- **运行记录**：支持 7 天 / 30 天 / 全部 + 按时间 / 按字数排序
- **装饰墙**：陈列架质感、按 tier 的灰度徽章、hover 显示名字、可加入提示
- **滚轮**：改成步进电机模型 —— 每格位移用「前段慢、末段快」曲线，到点骤停，无回弹
- **图标**：黑底 + 指针 A（左 15°/右 40°，末端收尖）+ 尖头横杆 + 右下弧刻度；
  重绘脚本 `scripts/make-icon.ps1`
- **新手引导**：三步（定位 → 改快捷键 → 建第一个任务），截图见对话记录

### 交互与细节（P8 第三轮）
- **时间轴层级**：小时刻度拆成两层（线在底、数字在顶层 `z-30`）；任务块整体让开左侧 44px 刻度槽，
  永远不会压住时间；块高 < 44px 时自动切成单行紧凑布局
- **时间轴不重叠**：落点/拖动/拉伸都会算一次碰撞（`clampStart` / `maxDurationFor`），
  冲突时自动贴到邻居的末尾或前面，拉伸最多到下一块的开头
- **去掉"当前时间"横线**：只保留一个 4px 小圆点，避免被误读成刻度分隔
- **浮窗黑框（真因）**：WebView2 的透明合成在本机不生效，圆角外侧露出的是窗口底色。
  改用 Win32 `SetWindowRgn` + `CreateRoundRectRgn` 直接把窗口区域裁成圆角矩形，
  已验证：屏幕上只剩一个圆角药丸，不再有黑方块
- **图标**：改用用户提供的 `compass_A_stretched_black.png` 生成全套图标
- **徽章**：12 枚（首次完成 / 10·50·100 次 / 1·10·100 小时 / 连续 3·7·30 天 / 首次复盘 / 复盘十篇），
  图标全部来自 lucide（`src/lib/badgeIcons.tsx` 做名字→组件映射），
  列表已解锁优先 + 按奖励升序，锁定态降透明度
- **装饰墙**：徽章改用真实图标渲染

### P9 打包
- 图标换成用户提供的 `compass_A_v4_black.png`
- 徽章扩到 **20 枚**（次数 6 / 时长 5 / 连续 5 / 复盘 4），成就页 **两列五排一页 10 个**，带上一页/下一页
- 装饰墙不再画圆形底框，直接挂 lucide 图标（按 tier 调明度 + 投影）
- 时间轴去掉"当前时间"的横线与小圆点
- 打包前清空开发期的测试数据（删 `%APPDATA%\com.auxilia.desktop\auxilia.db`）
- **已产出安装包**：`src-tauri\target\release\bundle\nsis\Auxilia_0.1.0_x64-setup.exe`（2.43 MB）
  根目录另存一份便于取用；便携版 `src-tauri\target\release\auxilia.exe`（6.46 MB，无需 Vite）

> 打包坑：本机访问 GitHub release 超时，NSIS 下不下来。已手动从镜像取 `nsis-3.13.zip`
> 和 `nsis_tauri_utils.dll` 放进 `%LOCALAPPDATA%\tauri\NSIS\`（目录结构必须含
> `Bin/makensis.exe`、`Stubs/lzma[-solid]-x86-unicode`、`Plugins/x86-unicode/additional/nsis_tauri_utils.dll`、
> `Include/MUI2.nsh` 等），之后 `npx tauri build --bundles nsis` 可离线完成。
> 重装系统后需要重新布一次这个目录。

## 待办

- 真机验收：拖拽手感、浮窗圆角是否还有黑框、滚轮"步进"力度
- 装饰墙的徽章现在只有一个字，后续可画真正的图形徽章
- 设置里还没有「按任务模板」的提醒配置（目前全局 + 单任务属性两层）
- P9：打包安装包（`desktop:build` 未验证过）、内存实测

## 关键决策（不得推翻）

- TaskLine 不驱动执行，只有点击才跑；块长 = 计划时长（无则 30 分钟）
- 计时只用时间戳差；暂停不计入时长与 coin；中止 0 coin 不扣分
- 跳过复盘 = 正常结算，只是不写三问
- 视觉：纯黑 #000，两层灰阶（#f3f3f3 / #a8a8a8），`--text-dim` 只给占位符
- 右键菜单、对话框全部自绘（输入框内保留原生菜单）
- 拖拽必须走 HTML5 DnD（窗口必须 `dragDropEnabled:false`）

## 已知坑

- **Tauri 默认 `dragDropEnabled:true` 会吃掉 WebView2 里的 HTML5 拖拽**（表现：🚫 光标、无拖影）
- 隐藏窗口的 CSS 动画不会因为 `show()` 重播，必须由 Rust `eval` 触发
- 无手势的 AudioContext 是 suspended，`resume()` 也需要手势 → 首次交互先解锁
- React 的 wheel 监听是被动的，`preventDefault` 无效，必须原生 `{passive:false}`
- `cargo build` 前必须先退出 `auxilia.exe`
- CDP 截图不保留 alpha，透明圆角只能真机看
- flash 全屏窗口必须 `set_ignore_cursor_events(true)`，否则吃掉所有点击

## 验收情况（实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` / `build` | 通过 |
| `cargo build` | 通过 |
| 拖拽入 TaskLine（合成事件） | 通过：写入 `duration_minutes=30`、落点 625 |
| 右键菜单 | 通过：含「修改属性」 |
| 属性面板 | 通过（截图确认） |
| 导入码 copy | 通过：imported=1，任务数 8→9 |
| 闪屏重播事件 | 通过：flash 页收到 1 次 `aux-flash`，窗口可见约 480ms |
| 浮窗右键菜单命令 | 通过（`ui_popup_menu` 返回 ok） |
| 引导三步 | 通过（截图） |

## 待用户确认

- 真实鼠标拖拽的手感（倾斜幅度、幽灵块位置）
- 浮窗是否还有黑边（`set_background_color` + 手动拖拽后）
- 滚轮步进速度（现在 70–190ms 到达）
