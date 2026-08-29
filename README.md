# Surge LAN Console

> 面向局域网的 Surge Web 管理控制台。React Web UI 通过本地 **Surge Console Core**（Node.js 22）提供数据保护、SQLite 持久化、通知推送、后台调度与历史分析；所有真实 Surge 请求统一经 Core 代理并注入解密后的 API Key，支持 iOS、tvOS 与 macOS 上的 Surge 实例。

![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D22.16-339933)

Surge LAN Console 提供仪表盘、设备总览（Fleet）、健康中心、策略与节点质量、请求与流量、DNS 观察、规则/模块/脚本、配置历史、事件日志、通知中心与自动化任务。界面遵循 Apple Liquid Glass 设计语言，支持浅色、深色与跟随系统外观，并按桌面 / 平板 / 手机自适应布局。

## 核心特性

| 能力 | 说明 |
| --- | --- |
| 数据保护 | 首次启动创建 4 位数字数据 PIN；scrypt 派生主密钥，随机 256-bit DEK 以 AES-256-GCM 封装；解锁后的 DEK 仅存在于 Core 内存 |
| Session | HttpOnly + SameSite=Strict Cookie；PIN 连续错误触发 5–30 分钟递增封禁；未解锁时 Web fail-closed |
| 连接保险库 | Connection 元数据与 API Key 持久化到 SQLite（Key 加密入 Secret Vault）；浏览器不再保存真实 X-Key，旧浏览器存储首次解锁后一次性迁移并清理 |
| Core Surge 代理 | Web -> /api/surge/:connectionId/v1/* -> Core -> 局域网 Surge；目标必须是 SQLite 已登记连接且解析到 RFC1918 / link-local / Tailscale CGNAT 范围，杜绝 SSRF / DNS rebinding |
| 通知引擎 | Bark Provider、事件规则、冷却、指纹去重、安静时段、故障恢复通知与历史记录；Token 加密入 Vault，永不回显 |
| 后台自动化 | Scheduler + Collectors 常驻 Core：心跳、指标、事件、DNS 健康、节点质量、运行时指标、策略流量、配置快照与 SQLite 备份；浏览器关闭不停止任务（Runtime Vault Lease） |
| 历史分析 | Traffic 24h/7d/30d rollup、DNS 趋势、Policy P50/P95/可用率、内存/Uptime、错误趋势——全部读取 SQLite 聚合，不依赖页面常驻 |
| 配置历史 | 只抓取 sensitive=0 配置；自动/手动快照、SHA-256 去重、两版本 Diff |
| 备份 / 恢复 | 基于 SQLite Online Backup 的一致快照，恢复前校验 SHA-256 / quick_check / schema，失败自动回滚 restore-point |
| 更新检查 | Settings 对照当前 Build Info 与远端 GitHub / Manifest 版本，Token 仅存在于 Core 环境变量 |
| 质量门禁 | pnpm verify 全量检查 + GitHub Actions（Verify / Visual Smoke）双 CI |

## 页面总览

| 模块 | 说明 |
| --- | --- |
| Dashboard | 实时速率、活动连接、API 延迟、策略组、近期请求与事件；Capability Probe 表现真实端点健康 |
| Fleet Console | 汇总全部已保存设备的在线状态、流量、API 延迟（RTT）与 Key 状态，可切换活动设备 |
| Health Center | Availability / Performance 分开表达：端点健康、性能警告、历史趋势（Memory / Uptime / DNS / Policy / Errors） |
| Node Quality | 节点测速结果筛选、搜索、排序与可达率统计；移动端 Card/List 化 |
| Policies | 策略组浏览、切换、测速与结果展示 |
| Requests | 请求流搜索、筛选、暂停；手机端卡片列表、桌面表格 |
| Traffic / DNS | 实时流量与 24h/7d/30d 趋势、策略流量排名；DNS 缓存观察、延迟测试、刷新 |
| Rules / Modules / Scripts | 按 API 能力展示；平台不支持时标记 N/A 而非反复 404 |
| Configuration | 只读查看配置；Profile Snapshot 历史与 Diff（sensitive=0） |
| Events | 按级别筛选、搜索系统信息、警告与错误 |
| Connections | Connection CRUD + 连接测试；平台覆盖判定（iOS / tvOS / macOS） |
| Settings | 外观、立即锁定、Retention、Backup / Restore、Update Check、API Diagnostics、Notifications、Automation |
| Design System | 内置设计令牌与组件预览页 |

## 当前架构

| 项目 | 当前实现 |
| --- | --- |
| Web UI | React 19 + TypeScript(strict) + Vite + Tailwind 4；Nginx 托管静态资源；PWA 支持 |
| Local Core | Node.js 22 内置 HTTP / crypto / SQLite；提供同源 /api/* |
| 数据保护 | 4 位 PIN + scrypt + AES-256-GCM DEK envelope；DEK 仅存 Core 内存（Session + Runtime Vault Lease） |
| 持久化 | ./data/surge-console.db（容器 /data/）；WAL + migration |
| Surge 访问 | 统一走 Core Proxy，浏览器无真实 X-Key，无静态设备白名单 |
| 支持平台 | Surge iOS、tvOS、macOS；按端点探测能力，可手动覆盖 |
| 质量门禁 | pnpm verify（类型、Lint、测试、构建）+ Playwright Visual Smoke 矩阵 |

### 开发阶段

按 [ROADMAP.md](./ROADMAP.md) 推进：Phase 01–10 Web Console 基础、Phase 11 Local Core / 数据密码、Phase 12 Connection Vault / Core 代理、Phase 13 通知中心 + Bark、Phase 14 Scheduler / Collector、Phase 15 Analytics / Backup / Config History 均已完成；当前处于 **Phase 16 — Real-device Correctness / UX Hardening / Visual QA**（进行中）。

## 本地开发

前置条件：**Node.js 22.16+**、Corepack、pnpm（Local Core 依赖 Node 22 自带 node:sqlite，不支持 Node 20）。

```bash
corepack enable
pnpm install
```

终端 1 启动 Local Core：

```bash
pnpm core:dev
```

终端 2 启动 Web UI：

```bash
pnpm dev
```

Vite 将 /api/* 转发至 http://127.0.0.1:8787。首次打开页面创建 4 位数字数据 PIN，之后输入 PIN 自动解锁。

Local Core 默认配置：

```text
Host:             0.0.0.0
Port:             8787
Database:         ./data/surge-console.db
Session idle:     30 minutes
Session absolute: 12 hours
```

裸跑 Core 时可通过以下环境变量覆盖；Compose 固定内部 Host、Port 与 `/data`，并从 `.env` 转发 Session 和 Update Check 配置：

```text
SLC_HOST
SLC_PORT
SLC_DATA_DIR
SLC_DATABASE_PATH
SLC_SESSION_IDLE_MINUTES
SLC_SESSION_ABSOLUTE_HOURS
SLC_UPDATE_MANIFEST_URL
SLC_UPDATE_GITHUB_REPO
SLC_UPDATE_GITHUB_TOKEN
SLC_UPDATE_BRANCH
SLC_UPDATE_CACHE_MINUTES
```

### 质量验证

```bash
pnpm verify
```

包含：前端 / Core typecheck、ESLint、Vitest、Core Node Test、前端生产构建与 Core 构建。涉及布局的变更还需通过 Visual Smoke：pnpm build:visual 以确定性 MockSurgeClient 构建，Playwright Chromium 在 1920×1080 / 1440×900 / 1366×768 / 768×1024 / 430×932 / 390×844 × Light / Dark 全矩阵截图并执行横向 overflow 门禁（96 张）。

## 安全模型

- Secret 只在 Core 内解密：数据密码 → DEK 全部驻留 Core 进程内存；Surge API Key / Bark Token 以 AES-256-GCM 密文入 Vault；
- 浏览器通过 SurgeClient 统一访问，代理路径由 Core 重写目标与 X-Key，浏览器传入的 X-Key 不可信；
- Core 代理仅为 SQLite 已登记 + 允许 LAN 范围解析目标服务，禁止把任意 URL 变成开放代理；
- 写操作校验 SameSite Cookie 与 Origin；响应 Cache-Control: no-store；
- 日志禁止输出数据密码、DEK、Cookie、Surge Key、Bark Token。

## Docker 部署

```bash
docker compose up -d --build
```

两个容器：

```text
surge-console   Nginx + React UI   绑定 127.0.0.1:8080
surge-core      Node Core          internal :8787（不发布宿主机端口）
```

生产 SQLite 存放在 Compose named volume surge-console-data → /data/surge-console.db。Web 容器依赖 Core health check 通过后启动。宿主机绑定回环地址以便通过 Tailscale / 反向代理安全暴露（例如转发至 127.0.0.1:8080）。首次开放访问前请立即完成 PIN 初始化，避免未初始化实例被其他网络用户抢先设置。若改用宿主 bind mount，请确保目录由容器 UID 1000 拥有且权限为 0700。

打开 http://<宿主机地址>:8080。可选构建标识：

```bash
GIT_COMMIT=$(git rev-parse --short HEAD) GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) docker compose up -d --build
```

## 项目结构

```text
src/
├── api/             # Surge API 客户端、端点、错误分类、能力探测、normalizer（raw fixture + 单测）
├── api/mock/        # Visual Smoke 确定性 MockSurgeClient
├── app/             # 路由、应用根组件、SurgeClient / Query 上下文
├── components/      # 布局、数据状态与基础 UI 组件
├── domain/          # 设备、健康、测速等纯逻辑服务
├── features/        # Dashboard、Fleet、Health、Node Quality、Connections、Settings 等页面
├── lib/             # Core API（Zod 校验）、版本、格式化、主题
├── stores/          # 浏览器端偏好（仅 UI preference）
├── styles/          # 设计令牌、玻璃效果、全局响应式规则
└── test/            # 前端测试初始化

server/
├── src/
│   ├── index.ts            # Core 启动入口
│   ├── app.ts              # HTTP 路由 / 会话 / Origin 校验 / 限速
│   ├── auth-service.ts     # 数据 PIN 与 Vault 解锁
│   ├── connection-service.ts # Connection + Secret Vault CRUD
│   ├── surge-transport.ts  # 代理传输 + SSRF/DNS rebinding 防护
│   ├── secret-vault.ts / runtime-vault.ts / session-store.ts
│   ├── notification-service.ts / event-bus.ts
│   ├── scheduler-service.ts + collectors（health/policy-traffic/runtime-metrics/event-collector/dns-health…）
│   ├── traffic-analytics / policy-traffic-analytics / health-analytics / error-analytics / runtime-analytics
│   ├── profile-history.ts / backup-service.ts / retention-service.ts / update-check-service.ts
│   ├── database.ts         # SQLite + migrations
│   └── config.ts / security.ts / errors.ts
├── test/                # Node Core 集成测试
└── Dockerfile
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| Web Framework | React 19、TypeScript（strict）、Vite 7 |
| Local Core | Node.js 22 HTTP / Crypto / node:sqlite |
| 样式与 UI | Tailwind CSS 4、Radix UI、Lucide React、Liquid Glass 设计令牌 |
| 状态与数据 | Zustand、TanStack Query、Axios、Zod |
| 数据展示 | ECharts、TanStack Table、CodeMirror 6 |
| 路由与 PWA | React Router 7、vite-plugin-pwa |
| 测试 / QA | Vitest、Testing Library、Node Test Runner、Playwright Chromium（Visual Smoke） |
| 容器 | Nginx Alpine + Node 22 Alpine Core |

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [ROADMAP.md](./ROADMAP.md) | 阶段路线与验收标准（Phase 11–16） |
| [PROJECT_SPEC.md](./PROJECT_SPEC.md) | 需求与功能规格 |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Liquid Glass 视觉与交互规范 |
| [docs/APPLE_HIG_2026_AUDIT.md](./docs/APPLE_HIG_2026_AUDIT.md) | Apple HIG 审计与可访问性约束 |
| [docs/OPTIMIZATION_PLAN.md](./docs/OPTIMIZATION_PLAN.md) | 兼容性、诊断与实机优化记录 |
| [AGENTS.md](./AGENTS.md) | 开发约束（供 AI Agent 使用） |

## 安全边界

本项目面向受信任的局域网或受控 VPN。即使设置了数据 PIN，也不要绕过 TLS 终止、网络访问控制与反向代理把控制台直接暴露到公共互联网。经 Tailscale / HTTPS 访问时，Nginx 会为 Cookie 追加 Secure 标志。

## License

[MIT](./LICENSE)
