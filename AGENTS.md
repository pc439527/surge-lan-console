# AGENTS.md — DeepSeek Harness 开发约束

> 本文件专门约束 DeepSeek Harness 在本项目中的开发行为。所有 Agent 在开始编码前必须通读本文件，并在开发过程中持续遵守。

---

## 1. 技术栈（锁定，不得随意更换）

| 项目 | 技术 |
| --- | --- |
| Web Framework | React 19 |
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
| Schema | Zod（API 响应 runtime 校验） |
| Test | Vitest + Node Test Runner |
| Local Core | Node.js 22.13+（内置 HTTP / Crypto / SQLite） |
| Local DB | `node:sqlite`，SQLite WAL + migration |
| E2E | Playwright（规划中，未启用） |

### 依赖原则

- 不要仅为一个简单能力引入第三方包；优先使用项目已有依赖和 Node 标准库。
- 新增依赖必须说明原因，并确保 `pnpm-lock.yaml` 同步更新。
- Local Core 当前刻意使用 Node 内置 `http`、`crypto`、`node:sqlite`，不要在没有明确收益的情况下替换为框架或原生扩展。

## 2. 架构

### Web

```text
src/
├── app/
├── api/
├── features/
├── components/
├── stores/
├── hooks/
├── lib/
├── styles/
└── types/
```

### Local Core

```text
server/
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── config.ts
│   ├── database.ts
│   ├── auth-service.ts
│   ├── security.ts
│   └── session-store.ts
├── test/
└── Dockerfile
```

Local Core 负责：

```text
/api/auth/*
SQLite
Secret Vault
Session
未来：Connections / Surge Proxy / Scheduler / Notifications / Collectors / Backup
```

Web 不得直接打开 SQLite 文件，不得在浏览器中实现密码校验或 Secret 解密。

## 3. SurgeClient 规范

当前浏览器 Surge 链路仍必须经过 `SurgeClient`，禁止页面中直接 `axios.get(...)`。

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

认证固定使用 `X-Key` Header。

### Phase 12 之后

浏览器不得再直接持有 Surge API Key。届时前端仍使用统一 Client abstraction，但实际请求改为：

```text
Web → /api/surge/:connectionId/* → Core → Surge HTTP API
```

Core 必须从 SQLite 中解析 connectionId，并注入解密后的 X-Key；禁止客户端传任意目标 URL/IP 形成开放代理。

## 4. 设计约束

- 遵循 `DESIGN_SYSTEM.md`：Liquid Glass 只用于导航与控制层；内容区使用 Content Material。
- 禁止 `glass on glass`。
- Light / Dark / System 三种主题必须完整实现为语义 Token。
- 禁止在组件中硬编码主题颜色。
- 圆角、间距、字号、动画遵循 Token 体系。
- 图标统一 Lucide，单色，SF Symbols 风格，不用 emoji 图标。
- 数据密码页属于安全入口，必须简洁，不显示 Dashboard 内容预览，不允许“跳过/稍后设置”。

## 5. 数据与安全

### 5.1 数据密码 / Vault

- 禁止保存明文数据密码。
- 当前 KDF：scrypt。
- 当前 Secret encryption：AES-256-GCM。
- 初始化时随机生成 256-bit DEK；SQLite 只持久化加密后的 DEK envelope。
- 解锁后的 DEK 只允许存在 Core Session 内存。
- Core 重启必须使全部 Session 失效。
- Cookie 必须 `HttpOnly; SameSite=Strict`；HTTPS 时必须增加 `Secure`。
- Unlock 必须有限速，错误信息不得泄露 Vault 内部结构。
- 日志禁止输出密码、DEK、Cookie、Surge API Key、Bark Key/Token。

### 5.2 SQLite

- 数据库默认目录：`./data/surge-console.db`，Docker 内为 `/data/surge-console.db`。
- `data/` 必须保持 Git ignored。
- Schema 变更必须通过 migration，不得启动时 DROP/重建用户数据表。
- 使用 WAL；备份功能实现前不得直接复制活跃 DB + WAL 作为“可靠备份”。
- Secret 字段只存 ciphertext / iv / auth tag。

### 5.3 过渡期浏览器 Storage

在 Phase 12 完成前：

- Connection 元数据（不含 API Key）仍存 LocalStorage。
- API Key 默认存 sessionStorage；仅用户主动勾选 Remember API Key 才存 LocalStorage。
- 禁止 Console 输出 Key、URL Query 携带 Key、Git Commit 提交 Key、配置硬编码 Key。

Phase 12 完成后必须迁移到 SQLite/Vault，并提供旧 Storage 一次性迁移/清理流程。

## 6. Core API 规范

- Web 统一通过 `/api/*` 访问 Local Core。
- 开发环境由 Vite proxy `/api` → `127.0.0.1:8787`。
- 生产由 Nginx `/api/` → `surge-core:8787`。
- `surge-core` Compose 服务默认禁止发布宿主机端口。
- Core 响应 JSON 必须 `Cache-Control: no-store`。
- Auth 错误统一 `{ error: { code, message } }`。
- 不得出现“Core 不可用时绕过认证进入主界面”的 fallback。
- 后续写操作必须评估 CSRF / Origin 校验；不能因为是 LAN 就默认可信所有浏览器来源。

## 7. 错误与加载

- Surge 统一错误模型：`ConnectionError | AuthenticationError | TimeoutError | ApiError | UnsupportedFeatureError | BrowserSecurityError`。
- Core API 前端错误统一转换为 `CoreApiError`，禁止直接显示 AxiosError。
- 每个页面 / 组件必须有 Loading、Empty、Error 三种状态。
- 破坏性操作必须有确认。
- AuthGate 的 Core unavailable 状态必须明确告诉用户检查 Core，不允许自动切换 legacy bypass。

## 8. 开发流程

- 按 `ROADMAP.md` Phase 顺序开发，不要跳 Phase。
- 当前阶段优先顺序：Phase 11 → 12 → 13 → 14 → 15。
- 完成一个任务前必须通过：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
# 或统一：
pnpm verify
```

- 前端代码修改完成后必须重建 Docker Compose，并验证：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 surge-core
docker compose logs --tail=100 surge-console
```

- 必须验证真实页面：首次密码初始化、再次解锁、Settings 立即锁定、Core unavailable 状态。
- 最终答复必须说明 CI / Docker / 页面验证结果；未实际验证不得写“已验证”。
- 不要修改与当前任务无关的代码。

## 9. Notification / Scheduler 预留规则

Phase 13 开始：

- Bark 只能作为 Notification Provider，不允许业务 Feature 直接调用 Bark URL。
- 业务模块发布统一 Event，Notification Engine 负责规则、去重、Cooldown、Quiet Hours、Recovery。
- Bark Device Key/Token 必须进 Vault。
- Scheduler 必须运行在 Core，不允许依赖浏览器页面常驻。
- Scheduled job 必须记录 job_runs，并支持失败/恢复事件。
- 默认禁止每次 polling failure 都推送；必须达到阈值后触发。

---

## 10. Project Rules（硬性规则）

1. This project is an independent Surge LAN Console.
2. Do not copy the YASD user interface.
3. YASD may only be used as API and behavior reference.
4. Follow Apple iOS / macOS Liquid Glass design principles.
5. Liquid Glass is reserved for navigation and controls.
6. Do not use glass-on-glass.
7. Content-heavy areas use solid/translucent content materials.
8. Light, Dark and System themes are mandatory.
9. Never hardcode theme colors in feature components.
10. All browser-side Surge API calls must go through SurgeClient.
11. Never use Axios directly inside React components.
12. Never expose the Surge API key in URLs or console logs.
13. Never expose data password, DEK, Session token or notification secrets in logs.
14. Use TypeScript strict mode.
15. Every feature must implement loading, empty and error states.
16. Destructive operations require confirmation.
17. Desktop-first, responsive second.
18. Prefer clarity over decorative effects.
19. Do not add dependencies without justification.
20. Run `pnpm verify` before marking a task complete.
21. Core unavailable must fail closed, not fail open.
22. SQLite schema changes require migrations.
23. Background automation belongs to Core, never to browser timers.
24. Do not modify unrelated code while implementing a feature.
