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
| Visual QA | Playwright Chromium + deterministic Visual Smoke（CI 已启用） |

### 依赖原则

- 优先使用项目已有依赖和 Node 标准库；不要仅为一个简单能力引入第三方包。
- 新增依赖必须说明原因，并同步 `pnpm-lock.yaml`。
- Local Core 使用 Node 内置 `http/https`、`crypto`、`dns`、`node:sqlite`，没有明确收益不得替换。
- Visual Smoke 当前通过固定 Playwright CLI + Chromium 运行；不要为了截图任务再引入第二套浏览器测试框架。

## 2. 架构

```text
Web (React)
  ↓ /api
Local Core (Node 22)
  ├─ Auth / Session / Runtime Vault
  ├─ SQLite / Migrations / Secret Vault
  ├─ Connections / Surge Proxy / X-Key Injection
  ├─ Event Bus / Notification Engine / Bark
  ├─ Scheduler / Collectors / Job Runs
  └─ Phase 15: Analytics / Backup / Config History
```

Web 不得直接打开 SQLite，不得实现密码校验或 Secret 解密。浏览器所有真实 Surge 请求仍通过 `SurgeClient` abstraction，但 transport 必须指向 Core Proxy。

## 3. SurgeClient 规范

- React 组件禁止直接调用 Axios 请求 Surge。
- 统一使用 `SurgeClient` 方法。
- Phase 12+ 实际链路固定为：

```text
Web → /api/surge/:connectionId/v1/* → Core → registered LAN Surge → X-Key injected by Core
```

- 浏览器不得读取解密后的 Surge API Key。
- Core Proxy 只允许 SQLite 已登记连接，且目标解析结果必须全部属于允许的 LAN 范围；禁止把任意 URL/Host 变成开放代理。
- 浏览器传入的 `X-Key` 不可信；Core 必须以 Vault 中解密的值覆盖。

## 4. 设计约束

### 4.1 文档优先级

涉及 UI / Layout / Typography 冲突时，DeepSeek Harness 按以下顺序执行：

1. `DESIGN_SYSTEM.md` — 当前实现规范，最高优先级；
2. `docs/APPLE_HIG_2026_AUDIT.md` — Apple HIG 审计与可访问性约束；
3. `PROJECT_SPEC.md` — 产品/页面需求；
4. `docs/OPTIMIZATION_PLAN.md` — 历史优化记录，仅作背景，不得覆盖当前 Design System。

本文件中的安全、架构、数据约束始终属于硬性规则，不受上述 UI 文档优先级影响。

### 4.2 UI 硬性规则

- 遵循 `DESIGN_SYSTEM.md`；Liquid Glass 只用于导航和控制层，内容区使用 Content Material。
- 禁止 glass-on-glass。
- Light / Dark / System 必须完整支持语义 Token。
- 禁止 Feature 组件硬编码主题颜色。
- 图标统一 Lucide，单色；不用 emoji 作为功能图标。
- 数据密码页不允许“跳过/稍后设置”。
- 页面内容区统一使用共享 `AppLayout` / `page-container` 宽度合同；不得为单个页面重新引入独立 max-width 桶。
- 普通页面标题使用共享 `PageHeader`；Dashboard 的特殊 Hero 若调整，应提炼共享变体，禁止重新出现顶部标题与页面标题重复。
- 新业务 UI 默认字号不得低于 11px；正文/表格优先使用 Design System 中的 12–14px 层级，避免为了“塞下内容”使用 10px。
- 手机端密集表格必须 reflow 为 Card/List；平板端应优先保留紧凑表格，不得把 768px 级别页面无条件展开成超长卡片流。
- coarse pointer 交互目标不得小于 44×44px。

## 5. 数据与安全

### 5.1 Data Password / Vault

- 禁止保存明文数据密码。
- KDF：scrypt；Secret encryption：AES-256-GCM。
- 初始化时随机生成 256-bit DEK，SQLite 仅保存加密后的 DEK envelope。
- 解锁后的 DEK 只允许存在 **Core 进程内存**：Browser Session copy + Runtime Vault Lease；不得写磁盘、数据库、日志或返回 Web。
- Runtime Vault Lease 用于浏览器关闭后的 Scheduler / Notification；普通 Session 超时不清它。
- Settings「立即锁定」必须撤销全部 Browser Session，并清零 Runtime Vault Lease。
- Core shutdown/restart 必须清零所有 DEK 内存；重启后受保护后台任务等待下一次用户解锁。
- Cookie：`HttpOnly; SameSite=Strict`；HTTPS 时增加 `Secure`。
- Unlock 必须限速。
- 日志禁止输出数据密码、DEK、Cookie、Surge API Key、Bark Token URL。

### 5.2 SQLite / Migration

- 默认 `./data/surge-console.db`，Docker `/data/surge-console.db`。
- `data/` 必须 Git ignored。
- Schema 变更只能通过 migration，禁止 DROP/重建用户数据表。
- 使用 WAL。
- Phase 15+ 备份必须使用 SQLite 安全快照/一致性机制；禁止直接复制活跃 DB + WAL 冒充可靠备份。
- Secret 表只能存 ciphertext / iv / auth tag。

### 5.3 Browser Storage

Phase 12 后：

- Connection 元数据与 Secret 的 Source of Truth 均为 Core SQLite/Vault。
- 浏览器只允许保存非敏感 UI preference（例如 active connection id、theme）。
- 禁止持久化真实 API Key / Bark Token。
- 旧 `surge-lan-console.connections` 与旧 key storage 只用于一次性迁移；迁移成功后必须清理。

## 6. Core API 规范

- Web 统一访问 `/api/*`。
- Vite dev `/api` → `127.0.0.1:8787`；生产 Nginx `/api/` → `surge-core:8787`。
- Core 容器默认不发布宿主机端口。
- JSON 响应 `Cache-Control: no-store`。
- 错误统一 `{ error: { code, message } }`。
- Core unavailable 必须 fail closed。
- 写操作检查 SameSite Cookie + Origin；不能因为是 LAN 就默认信任所有浏览器来源。
- Proxy response 有大小限制和 timeout。

## 7. Notification / Event 规范

- Bark 只是 Notification Provider，Feature / Collector 禁止直接构造 Bark URL。
- 业务与后台模块只能向 Event Bus 发布统一 Event。
- Notification Engine 负责 Rule、Cooldown、Fingerprint dedupe、Quiet Hours、Recovery、History。
- Bark Token URL 必须进 Vault，API/UI 永不回显明文。
- Recovery 只在对应 fingerprint 曾进入 Active error state 后发送。
- 不得每次 polling failure 都推送。

## 8. Scheduler / Collector 规范

- Scheduler 必须运行在 Core，禁止依赖 browser timer。
- `scheduled_jobs` 是配置 Source of Truth；每次运行写 `job_runs`。
- Collector 数据写 `collector_samples`，Phase 15+ 继续复用该链路做聚合/Retention。
- 最小安全间隔必须由 Core 强制，不能只靠 UI。
- 关闭浏览器不停止任务；Immediate Lock / Core Restart 会停止受保护任务直到重新解锁。
- Job failure / recovery 通过 Event Bus 进入通知引擎。

## 9. 错误与 UI 状态

- Surge：统一 `SurgeError` taxonomy。
- Core：统一 `CoreApiError`，React 不直接显示 AxiosError。
- 每个页面必须有 Loading / Empty / Error 或明确可恢复状态。
- 平台 API 明确 `unsupported` 时应显示 N/A / 不支持，不得误判为故障，也不得继续产生可避免的 404 请求。
- Availability 与 Performance 必须分开表达；接口可用但延迟过高应是性能警告，不应伪装成“全部正常”或“不可用”。
- 破坏性操作需要确认。

## 10. DeepSeek Harness 开发流程

- 当前开发阶段：**Phase 16 — Real-device Correctness / UX Hardening / Visual QA**；不要倒退重新把 Secret 放回浏览器，也不要在当前阶段无必要扩张新功能面。
- 开发前先读 `ROADMAP.md`、本文件、`DESIGN_SYSTEM.md` 和相关 Feature。
- 代码保持 TypeScript strict。
- 正常完成任务前应执行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm verify
```

- 涉及前端布局/样式的变更，除 `pnpm verify` 外必须通过 `.github/workflows/visual-smoke.yml`。
- Visual Smoke 使用 `pnpm build:visual` 的 deterministic MockSurgeClient，当前矩阵覆盖 1920×1080、1440×900、1366×768、768×1024、430×932、390×844 的 Light / Dark，并包含横向 viewport overflow 门禁。
- Visual Smoke 是布局/渲染门禁，不等于真实 Surge 设备 API 验收；涉及 API semantics 的任务仍需保留 raw fixture / unit test，并在可用时用真实设备响应验证。
- 涉及前端/部署后正常应重建 Docker Compose 并验证真实页面；构建版本应能通过 `/version.json` 与 UI Build Info 对照。
- 如果用户明确要求跳过某个门禁，本次任务按用户指令执行，但最终必须准确说明哪些验证未执行。
- 不要修改与当前任务无关的代码。

## 11. Project Rules（硬性）

1. Independent Surge LAN Console; YASD 只作 API / behavior reference，不复制 UI。
2. Follow Apple iOS / macOS Liquid Glass principles。
3. Browser Surge calls use SurgeClient abstraction。
4. Never expose real X-Key / Bark Token / data password / DEK / Session token。
5. TypeScript strict。
6. SQLite schema changes require migrations。
7. Background automation belongs to Core。
8. Core unavailable fail closed。
9. Secret only decrypted inside Core。
10. Phase 16 继续复用 `collector_samples/job_runs/notification_history` 与 Phase 15 Analytics 数据链路，不另起重复数据链路。
11. Responsive 修复优先解决根因并增加可执行门禁，不用 `overflow-x:hidden` 掩盖页面被撑宽。
12. CI 通过不等于视觉验收完成；涉及布局时必须检查对应 Visual Smoke 目标 viewport。
