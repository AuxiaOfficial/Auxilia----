# Auxilia 项目长期约定

## 项目定位
Windows 桌面日程管理软件。三条不可违背的产品哲学：
- P1 不捆绑只参照：TaskLine 是看板不是列车时刻表，到点绝不自动开跑
- P2 启动成本趋近零：Shift+Space → 打字 → 回车，≤5 秒 ≤1 次点击
- P3 预期与实际的差量才是价值：必写 prospect，结束必答三问

## 技术栈（硬约束，不得更换）
Tauri 2 + React 19 + TypeScript(strict) + Vite 6 + Tailwind v4 + Zustand + Motion + SQLite(tauri-plugin-sql) + date-fns + lucide-react

**黑名单**：antd / MUI / element-plus / echarts / recharts / chart.js / moment / dayjs / lodash 全量 / styled-components / emotion。图表必须手写 SVG。

## 视觉铁律
- 背景纯 `#000000`，95% 灰阶
- token 只出现在 `src/styles/tokens.css`，组件内禁止硬编码色值
- 颜色只允许出现在：倒计时最后 60 秒（`--warn #FFB84D`）、删除危险（`--danger #FF5A5A`）、徽章 tier
- 禁止：渐变背景、彩色阴影、发光、卡片边框、分割线、emoji 装饰

## 工作流约定
每个阶段：开新会话 → 贴 P0 宪法 + 当期 prompt + STATE.md → **先复述计划再写代码** → 自己跑一遍 → 开 QA 会话逐条判定 → 全过后更新 STATE.md。
QA 只报告不修改代码。

## 用户偏好
- 中文沟通
- 交付要可执行：给能直接复制的提示词，而不是泛泛建议
- 喜欢把模糊需求变成结构化规格，接受"我替你做决策 + 标注待确认"
