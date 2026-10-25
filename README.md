# Auxilia

> 不替你安排时间，只帮你看清时间。

Auxilia 是一个 Windows 桌面专注计时器。它和日程软件最大的区别是：**TaskLine 只是看板，不会自动推进你的时间**——只有你亲手点击，任务才会开始计时。

---

## 为什么做这个

传统日程工具把一天切成格子，然后让你为「没按格子走」而内疚。
Auxilia 反过来：**任务池是仓库，TaskLine 是参考时间轴**。今天几点做什么由你当场决定，软件只负责看清时间、记录专注、在你结束时问你三个问题。

---

## 功能

**任务池**
搜索、内联重命名（双击 / F2）、批量删除、右键菜单、导出码与导入码、拖拽。

**新建任务（六步）**
持续性（长期 / 完成即删 / 到期删除）→ 计时方式（倒计时 / 正计时 / 定时触发）→ 时长 → 提示力度 → 显示方式 → 完成。
时长用双列滚轮调，手感是「步进电机」：一格一跳、到点骤停，另有 5 个快捷胶囊。

**TaskLine**
可以建多条（工作日 / 周末…）。把任务拖进去会生成一个按任务计划时长计算的**时长块**，块的下边缘可以拉伸微调；块与块之间**自动避让，不会重叠**。点击块才会开始任务。

**执行**
多任务并行（第二个会提醒）、暂停/继续、时间戳差计时（永不累加）、崩溃恢复、倒计时归零自动进入结束流程并把窗口拉到最前。

**结束与沉淀**
先恭喜，再三问（问题数量 0–3 可在设置里改），最后提示你站起来休息。
「跳过」= 照常结算 coin，只是不写复盘。完成后按专注时长发 coin、累计任务等级。

**成就**
20 枚徽章（次数 / 时长 / 连续天数 / 复盘四条线，图标来自 [lucide](https://lucide.dev/)）、半年热力图、任务占比环形图、近 14 天柱状图、可拖拽的装饰墙。

**复盘**
日 / 周 / 月到期红点提醒；写完自动拼成 markdown 归档到本地目录（可自选）；历史运行记录可按「7 天 / 30 天 / 全部」和「按时间 / 按字数」筛选。

**系统集成**
全局快捷键唤起（默认 `Shift+Space`，可改）、托盘左键打开 / 右键暂停·中止、无边框窗口、贴顶迷你浮条（96×26，圆角由 Win32 区域裁剪保证）、浮窗、开机自启。

---

## 技术栈

| 层 | 选择 |
|---|---|
| 外壳 | Tauri 2（Rust） |
| 前端 | React 19 + TypeScript strict + Vite 6 |
| 样式 | Tailwind v4 + CSS 变量（唯一颜色来源），不引 UI 组件库 |
| 状态 | Zustand |
| 动效 | Motion，图表全部手写 SVG |
| 数据 | SQLite（rusqlite，bundled）+ WAL，Rust 侧持有唯一写连接 |

执行引擎在 Rust：500ms tick、时间戳差计时、暂停不计入时长、60s 心跳、崩溃后恢复未结束的 run。

---

## 快速开始

前置：Node 20+、Rust（本机用 `x86_64-pc-windows-gnu` + MinGW 链接器）、WebView2（Win10/11 自带）。

```powershell
npm install

npm run dev        # 浏览器预览（内存假数据，只用来调视觉）
npm run desktop    # 真实桌面端（需要 vite 已经在 5183 上跑）
npm run typecheck
npm run build
```

开发版 exe 在 `src-tauri/target/debug/auxilia.exe`，**它依赖 Vite 服务**，关掉 `npm run dev` 就会白屏。

---

## 打包

```powershell
npm run desktop:build      # 等价于 tauri build，产出 NSIS 安装包
```

产物：`src-tauri/target/release/bundle/nsis/Auxilia_x.y.z_x64-setup.exe`
便携版：`src-tauri/target/release/auxilia.exe`（自包含，不需要 Node/Vite）

> **国内网络注意**：`tauri build` 首次会从 GitHub 下载 NSIS 和 `nsis_tauri_utils.dll`，很容易超时。
> 手动取 `nsis-3.13.zip` 解开，让 `%LOCALAPPDATA%\tauri\NSIS\` 里同时存在
> `Bin/makensis.exe`、`Stubs/lzma-x86-unicode`、`Plugins/x86-unicode/additional/nsis_tauri_utils.dll`、
> `Include/MUI2.nsh` 等文件，之后就能离线打包。

---

## 目录

```
src/                    前端
  components/           界面（layout / task / taskline / creation / timer / finish / achievement / review / settings / ui）
  lib/                  db.ts（唯一写 SQL 的地方）、ipc.ts、physics、time、nav、sound、badgeIcons
  store/                zustand stores
  windows/              mini / float / flash 三个辅助窗口入口
src-tauri/              Rust
  src/engine.rs         执行引擎（计时、暂停、调度、崩溃恢复）
  src/db.rs             连接与迁移
  src/windows.rs        窗口模型、圆角、闪屏
  src/tray.rs           托盘
  src/hotkey.rs         全局快捷键
  migrations/           001_init.sql / 002_seed.sql
docs/                   产品规格、技术架构、协作手册
prompts/                分阶段开发提示词
STATE.md                当前进度、已做决策、踩过的坑
```

---

## 数据与隐私

全部本地：`%APPDATA%\com.auxilia.desktop\auxilia.db`（SQLite）。
不上传、不联网、无遥测。卸载软件不会删这个文件。

---

## 设计约束（写代码前先看）

- 纯黑背景，灰阶只分两层；颜色只用于「倒计时告急」「删除危险」
- 不引 UI 组件库、不引图表库，图表手写 SVG
- 右键菜单、对话框一律自绘，只在输入框里保留系统菜单
- 计时只用时间戳差，**永远不要**用 `setInterval` 累加
- `TaskLine` 不驱动执行

更多决策与踩坑记录见 [STATE.md](./STATE.md)。

---

## 已知限制

- 仅 Windows（GNU 工具链）。macOS / Linux 未验证
- 手机端、宣传素材未做
- 首次打包依赖 NSIS 下载（见上文）
- 装饰墙的徽章目前直接用线性图标，没有成套的插画资产
