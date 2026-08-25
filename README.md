# Surge LAN Console

> 面向局域网的 Surge Web 管理控制台。React Web UI 通过本地 **Surge Console Core** 提供数据保护、SQLite 持久化与后续自动任务能力，同时继续通过 **Surge HTTP API** 管理 iOS、tvOS 与 macOS 上的 Surge 实例。

Surge LAN Console 提供仪表盘、设备总览、策略与请求管理、流量和 DNS 观察、配置与脚本入口、事件日志及 API 诊断。界面采用 Liquid Glass 风格，支持浅色、深色和跟随系统外观，并针对手机触控视口提供独立的单列/卡片式布局。

## 当前架构

| 项目 | 当前实现 |
| --- | --- |
| Web UI | React 19 + TypeScript + Vite；Nginx 托管静态资源 |
| Local Core | Node.js 22 内置 HTTP/crypto/SQLite；提供 `/api/*` |
| 数据保护 | 首次启动创建数据密码；scrypt 派生主密钥；随机 DEK 使用 AES-256-GCM 封装 |
| Session | HttpOnly + SameSite=Strict Cookie；解锁后的 DEK 只保存在 Core 内存，Core 重启即失效 |
| SQLite | 开发默认 `./data/surge-console.db`；容器使用 `/data/surge-console.db`；WAL + migration |
| Surge 访问 | 当前仍保留浏览器直连及 Nginx `/v1/` 白名单代理；下一阶段迁移为 Core 统一代理 |
| 支持平台 | Surge iOS、tvOS、macOS；按端点探测可用能力，可手动覆盖平台判定 |
| 质量门禁 | `pnpm verify` 执行前后端类型检查、ESLint、测试与生产构建 |

> **迁移状态：** Local Core 第一阶段负责数据密码、Session 和 SQLite 基础设施；现有 Connections/API Key 仍沿用浏览器存储模型，后续 Phase 会迁移到 SQLite + Core Secret Vault。当前不会自动把浏览器中的 API Key 写入数据库。

## 功能概览

| 模块 | 说明 |
| --- | --- |
| Security Gate | 首次创建数据密码；后续输入密码解锁；Settings 可立即锁定 |
| Dashboard | 查看实时上传/下载速率、活动连接、API 延迟、策略组、近期请求和事件 |
| Fleet Console | 汇总已保存设备的在线状态、流量、活动请求与 API Key 状态，并可切换活动设备 |
| Connections | 维护多个 Surge 实例的名称、协议、主机、端口、平台覆盖和 API Key |
| Policies | 浏览策略组、切换策略、执行测速，并展示策略选择结果 |
| Requests | 搜索、筛选和暂停近期请求流；手机端使用卡片列表，桌面端使用表格 |
| Traffic / DNS | 观察实时流量与 DNS 缓存，支持 DNS 延迟测试和刷新缓存 |
| Rules / Modules / Scripts | 按 API 能力展示规则、模块和脚本功能；不支持的端点会标记为不可用 |
| Configuration | 只读查看当前配置，并默认以 `sensitive=0` 请求以避免主动读取敏感配置内容 |
| Events | 按级别筛选、搜索和浏览系统信息、警告与错误事件 |
| Settings / API Diagnostics | 切换外观、锁定控制台、演示模式；逐端点检查状态、延迟、解析结果与脱敏后的响应结构 |

## 本地开发

### 前置条件

需要 **Node.js 22.13+**、Corepack 与 pnpm。Local Core 使用 Node 22 自带的 `node:sqlite`，因此不再支持 Node 20 开发环境。

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

Vite 会把 `/api/*` 转发至 `http://127.0.0.1:8787`。首次打开页面时需要创建数据密码；以后打开页面只需输入该密码回车/点击“解锁”。

Local Core 默认配置：

```text
Host:             0.0.0.0
Port:             8787
Database:         ./data/surge-console.db
Session idle:     30 minutes
Session absolute: 12 hours
```

可通过环境变量覆盖：

```text
SLC_HOST
SLC_PORT
SLC_DATA_DIR
SLC_DATABASE_PATH
SLC_SESSION_IDLE_MINUTES
SLC_SESSION_ABSOLUTE_HOURS
```

### 质量验证

```bash
pnpm verify
```

包含：

```text
Frontend typecheck
Core typecheck
ESLint
Frontend Vitest
Core auth/SQLite lifecycle tests
Frontend production build
Core TypeScript build
```

## 数据密码与 SQLite

首次初始化时，Core 会：

1. 使用 scrypt 从数据密码派生本地主密钥；
2. 随机生成 256-bit Data Encryption Key（DEK）；
3. 使用 AES-256-GCM 加密 DEK；
4. SQLite 只保存密码校验材料和加密后的 DEK，不保存明文密码；
5. 解锁后，DEK 仅存在于当前 Core Session 内存中。

密码错误达到连续阈值后，`/api/auth/unlock` 会短暂限速。生产访问由 Nginx 提供同源 `/api/`，Core 容器默认不暴露宿主机端口。

当前数据库 migration 创建：

```text
schema_migrations
app_meta
secrets
```

后续会继续增加：

```text
connections
notification_channels
notification_rules
notification_history
scheduled_jobs
job_runs
events
metric_samples
policy_test_history
profile_snapshots
```

## 连接 Surge 实例

在 **Connections** 页面填写连接名称、协议、主机、端口和 Surge HTTP API Key。

在连接迁移到 Core 之前：

- Connection 元数据仍保存在当前浏览器 LocalStorage；
- API Key 默认仅保留在 `sessionStorage`；
- 只有开启“Remember API Key”时，Key 才保存到 `localStorage`。

| 模式 | 适用情形 | 注意事项 |
| --- | --- | --- |
| 浏览器直连 | 控制台和 Surge 位于同一局域网，且控制台通过 HTTP 访问 | 浏览器必须能直接访问目标 Surge HTTP API |
| 控制台反向代理 | 控制台经 HTTPS 打开、目标 Surge API 仅提供 HTTP | 当前仍使用 `/v1/` + `X-Surge-Target` 白名单代理 |

> `/v1/` 代理是过渡方案。下一阶段会改为 `/api/surge/{connectionId}/v1/*`，由 Core 从 SQLite 读取目标与解密后的 API Key，最终移除浏览器可见的 Surge Key 和静态 Nginx 设备白名单。

## Docker 部署

推荐使用 Docker Compose。现在部署包含两个容器：

```text
surge-console   Nginx + React UI      :8080
surge-core      Node Core             internal :8787
```

生产 SQLite 存在 Compose named volume：

```text
surge-console-data → /data/surge-console.db
```

使用 named volume 是为了让以非 root 用户运行的 Core 在 Linux 上也能稳定获得数据库写权限。

启动：

```bash
docker compose up -d --build
```

检查：

```bash
docker compose ps
docker compose logs -f surge-core
docker compose logs -f surge-console
docker volume ls
```

打开：

```text
http://<宿主机地址>:8080
```

生产环境不要单独启动 `surge-console` 静态容器，否则 `/api/auth/*` 无法工作。Compose 会等待 `surge-core` health check 通过后再启动 Web 容器。

## 项目结构

```text
src/
├── api/             # Surge API 客户端、端点、错误分类、能力探测和响应规范化
├── app/             # 路由、应用根组件和 Surge 客户端上下文
├── components/      # 布局、数据状态和基础 UI 组件
├── features/        # Dashboard、Fleet、连接、策略、请求、流量、DNS、日志、Auth 等
├── lib/             # Core API、版本、Query Keys 等共享能力
├── stores/          # 连接、API Key 和用户偏好状态（待迁移）
├── styles/          # 设计令牌、玻璃效果和全局响应式规则
└── test/            # 前端测试初始化

server/
├── src/
│   ├── app.ts           # Core HTTP routes / auth rate limit
│   ├── auth-service.ts  # 数据密码与 Vault 解锁流程
│   ├── config.ts        # Core 环境配置
│   ├── database.ts      # SQLite + migrations
│   ├── security.ts      # scrypt / AES-256-GCM / token helpers
│   ├── session-store.ts # 内存 Session / DEK lifecycle
│   └── index.ts         # Core 启动入口
├── test/                # Node Core 集成测试
└── Dockerfile
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| Web Framework | React 19、TypeScript、Vite |
| Local Core | Node.js 22 HTTP / Crypto / SQLite |
| 样式与 UI | Tailwind CSS 4、Radix UI、Lucide React、Liquid Glass 设计令牌 |
| 状态与数据 | Zustand、TanStack Query、Axios、Zod |
| 数据展示 | ECharts、TanStack Table、CodeMirror 6 |
| 路由与 PWA | React Router、`vite-plugin-pwa` |
| 测试 | Vitest、Testing Library、Node Test Runner |
| 容器 | Nginx Alpine + Node 22 Alpine Core |

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [PROJECT_SPEC.md](./PROJECT_SPEC.md) | 需求与功能规格 |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Liquid Glass 视觉与交互规范 |
| [ROADMAP.md](./ROADMAP.md) | 阶段路线与验收标准 |
| [docs/OPTIMIZATION_PLAN.md](./docs/OPTIMIZATION_PLAN.md) | 兼容性、诊断和实机优化记录 |
| [AGENTS.md](./AGENTS.md) | DeepSeek Harness 开发约束 |

## 安全边界

该项目面向受信任的局域网或受控 VPN。即使已经增加数据密码，也不要在没有 TLS 终止、网络访问控制和适当反向代理保护的情况下直接暴露到公共互联网。

## License

TBD
