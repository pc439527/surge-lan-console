# AGENTS.md — DeepSeek Harness 开发约束

> 本文件专门约束 DeepSeek Harness 在本项目中的开发行为。所有 Agent 在开始编码前必须通读本文件，并在开发过程中持续遵守。

---

## 1. 技术栈（锁定，不得随意更换）

| 项目 | 技术 |
| --- | --- |
| Framework | React 19 |
| Language | TypeScript（strict mode） |
| Build | Vite |
| Package | pnpm |
| UI Base | shadcn/ui |
| CSS | Tailwind CSS 4 |
| State | Zustand |
| Server State | TanStack Query |
| HTTP | Axios |
| Routing | React Router |
| Chart | ECharts |
| Table | TanStack Table |
| Config Editor | CodeMirror 6 |
| Icons | Lucide React |
| Schema | Zod |
| Date | date-fns |
| Test | Vitest |
| E2E | Playwright |

## 2. 架构

Feature-Based 目录结构：

```text
src/
│
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   └── providers.tsx
│
├── api/
│   ├── surge-client.ts
│   ├── endpoints.ts
│   ├── errors.ts
│   └── types.ts
│
├── features/
│   ├── connection/
│   ├── dashboard/
│   ├── policies/
│   ├── requests/
│   ├── traffic/
│   ├── dns/
│   ├── rules/
│   ├── modules/
│   ├── scripts/
│   ├── profiles/
│   └── events/
│
├── components/
│   ├── ui/
│   ├── glass/
│   ├── layout/
│   ├── charts/
│   ├── tables/
│   └── feedback/
│
├── stores/
│   ├── connection-store.ts
│   └── preferences-store.ts
│
├── hooks/
├── lib/
├── styles/
│   ├── tokens.css
│   ├── glass.css
│   └── globals.css
│
└── types/
```

## 3. SurgeClient 规范

所有 Surge 请求必须经过 `SurgeClient`，**禁止**页面中直接 `axios.get(...)`。

统一接口：

```ts
class SurgeClient {
  testConnection()

  getFeatures()
  setFeature()

  getOutboundMode()
  setOutboundMode()

  getPolicies()
  getPolicyGroups()
  getPolicyTestResults()
  testPolicies()
  selectPolicy()

  getRecentRequests()
  getActiveRequests()
  killRequest()

  getTraffic()

  getEvents()
  getRules()

  getDnsCache()
  flushDns()
  testDnsDelay()

  getModules()
  updateModules()

  getScripts()
  evaluateScript()
  runCronScript()

  getCurrentProfile()
  reloadProfile()

  getMetrics()
}
```

对应官方 API（例如）：`/v1/policy_groups`、`/v1/requests/recent`、`/v1/traffic`、`/v1/events`、`/v1/dns`、`/v1/modules`、`/v1/scripting`、`/v1/profiles/current` 等。

认证：固定使用 `X-Key` Header。

## 4. 设计约束

- 遵循 `DESIGN_SYSTEM.md`：Liquid Glass 只用于导航与控制层（Sidebar、Toolbar、弹窗、浮动层），内容区使用 Content Material。
- 禁止 `glass on glass`。
- Light / Dark / System 三种主题必须完整实现为语义 Token。
- 禁止在组件中硬编码主题颜色（`bg-[#ffffff]` 等）。
- 圆角、间距、字号、动画遵循 Design System 中的 Token 体系。
- 图标统一 Lucide，单色，SF Symbols 风格，不用 emoji 图标。

## 5. 数据与安全

- Connection 元数据（不含 API Key）存 LocalStorage。
- API Key 默认存 sessionStorage；仅用户主动勾选 `Remember API Key` 才存 LocalStorage。
- 禁止：Console 输出 Key、URL Query 携带 Key、Git Commit 中提交 Key、配置文件硬编码 Key。
- API 刷新频率遵循 `PROJECT_SPEC.md` 第 8 节 Refresh Policy，统一由 TanStack Query 管理。
- 页面隐藏时 Traffic 等轮询要降频 / 暂停。

## 6. 错误与加载

- 统一错误模型：`ConnectionError | AuthenticationError | TimeoutError | ApiError | UnsupportedFeatureError | BrowserSecurityError`。
- 禁止直接显示 `AxiosError: ERR_NETWORK`，必须转换为友好错误视图（见 PROJECT_SPEC 第 9 节）。
- 每个页面 / 组件必须有：Loading（Skeleton）、Empty、Error 三种状态。
- 破坏性操作（DNS Flush、Module 开关等）必须有确认。

## 7. 开发流程

- 按 `ROADMAP.md` 的 Phase 顺序开发，不要跳 Phase。
- 完成一个任务前必须通过：`pnpm typecheck`、`pnpm lint`、`pnpm build`（以及相关 `pnpm test`）。
- 不要为了"提前接完 API"而越过当前 Phase。
- 不要修改与当前任务无关的代码。

---

## 8. Project Rules（硬性规则）

1. This project is an independent Surge LAN Console.
2. Do not copy the YASD user interface.
3. YASD may only be used as API and behavior reference.
4. Follow Apple iOS 26 / macOS 26 Liquid Glass design principles.
5. Liquid Glass is reserved for navigation and controls.
6. Do not use glass-on-glass.
7. Content-heavy areas use solid/translucent content materials.
8. Light, Dark and System themes are mandatory.
9. Never hardcode theme colors in feature components.
10. All Surge API calls must go through SurgeClient.
11. Never use Axios directly inside React components.
12. Never expose the Surge API key in URLs or console logs.
13. Use TypeScript strict mode.
14. Every feature must implement loading, empty and error states.
15. Destructive operations require confirmation.
16. Desktop-first, responsive second.
17. Prefer clarity over decorative effects.
18. Do not add dependencies without justification.
19. Run typecheck, lint and build before marking a task complete.
20. Do not modify unrelated code while implementing a feature.
