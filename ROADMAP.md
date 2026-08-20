# Surge LAN Console — 开发路线图（Roadmap）

> DeepSeek Harness 按 Phase 顺序开发。每个 Phase 完成后必须通过验收标准才能进入下一 Phase。

---

## Phase 01 — Scaffold

**内容：**

```text
React + TS + Vite
Tailwind
Router
Query
Zustand
Theme
```

**验收：**

```bash
pnpm dev
pnpm build
pnpm test
```

全部正常。

## Phase 02 — Design System

**内容：** 这一阶段**不接 Surge**，先把 UI 做漂亮。

```text
Tokens
Light
Dark
Glass
Button
Input
Select
Switch
Card
Dialog
Drawer
Toast
Skeleton
```

**验收：** 所有基础组件符合 `DESIGN_SYSTEM.md`；Light / Dark / System 主题可切换；Storybook 或文档页展示全部组件（可选）。

## Phase 03 — Layout

**内容：**

```text
Sidebar
TopBar
Content
Connection Switcher
Responsive
```

**验收：** 桌面（236px Sidebar）/ Tablet（Icon Sidebar）/ Mobile（Bottom Navigation）三档布局均可工作。

## Phase 04 — SurgeClient

**内容：**

```text
X-Key
Timeout
Errors
AbortSignal
```

**验收：** SurgeClient 全部方法定义完成；统一错误模型生效；单元测试覆盖超时 / 401 / 网络错误。

## Phase 05 — Connections

**内容：**

```text
Create
Test
Save
Edit
Delete
Connect
Switch
```

**验收：** 首次启动连接页、Last Connection 自动重连、Connection 切换器均可用；API Key 存储符合安全规范（sessionStorage 默认）。

## Phase 06 — Dashboard

**内容：**

```text
Traffic
Metrics
Policies
Recent Requests
Events
Outbound Mode
```

**验收：** 四指标卡片、Traffic 图表、策略组、Recent Requests、Events、右上角 Outbound Mode 切换均可用；各卡片有 Skeleton / Empty / Error 状态。

## Phase 07 — Network

**内容：**

```text
Policies
Requests
Traffic
DNS
```

**验收：** Policies 卡片+表格、延迟分级颜色、Select / Test / Retest；Requests Table + 筛选 + Pause；Request Drawer；Traffic 时间范围切换与页面隐藏降频；DNS 缓存表格、Flush 二次确认。

## Phase 08 — Surge

**内容：**

```text
Rules
Modules
Scripts
Configuration
Events
```

**验收：** Events 筛选与搜索；Rules 页面；Modules 开关（二次确认可配置）；Scripts Evaluate / Run Cron / View（无在线编辑）；Configuration CodeMirror 展示（`sensitive=0`）。

## Phase 09 — Polish

**内容：**

```text
Animation
Responsive
Empty State
Loading
Error
Accessibility
PWA
```

**验收：** 动画曲线与时长符合 Design System；`prefers-reduced-motion` 生效；Table → Cards 响应式；键盘可达性；PWA 可安装（第二阶段）。

## Phase 10 — QA

**至少测试以下场景：**

```text
API Key 错误
IP 错误
Apple TV 离线
请求超时
切换节点
切换 Rule / Direct / Proxy
DNS Flush
Light → Dark
刷新浏览器
重新打开浏览器
```

**验收：** 所有场景有正确的错误 / 空 / 恢复状态；`pnpm test` 与 `pnpm build` 通过。

---

## 版本里程碑

| 版本 | 对应范围 | 触发条件 |
| --- | --- | --- |
| V1（0.1.0） | Connection Manager / Dashboard / Traffic / Policies / Requests / Events / DNS / Outbound Mode / Feature Toggle / Light / Dark / System Theme / Responsive | Phase 01–07 完成（+ 部分 09/10） |
| V1.1 | Rules / Modules / Scripts / Configuration | Phase 08 完成 |
| V1.2 | Multiple Surge / PWA / Request Details / Advanced Filters / Keyboard Shortcuts | Phase 09 完成 |
| v0.4.0 | 自动测速并选择策略组最快可达节点；请求详情增强（阶段耗时、连接信息与复制操作） | 独立里程碑：Policies 与 Requests 增强完成 |
| v0.5.0 | Fleet Console：多设备在线状态、模式、活动请求与实时速率汇总，一键切换设备 | 独立里程碑：多设备聚合控制台完成 |
| V2 | Analytics（24h Traffic / Policy Traffic / Error Trend / DNS Cache Trend / Uptime / Memory） | 基于 `/v1/metrics`，需 Capability Detection |

> 原则：**第一版不把所有 API 接完**，完成 V1 范围即发布 0.1.0。
