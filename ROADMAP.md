# Surge LAN Console — 开发路线图（Roadmap）

> DeepSeek Harness 按 Phase 顺序开发。每个 Phase 完成后必须通过验收标准才能进入下一 Phase。

---

## Phase 01 — Scaffold

**内容：** React + TS + Vite / Tailwind / Router / Query / Zustand / Theme。

**验收：** `pnpm dev`、`pnpm build`、`pnpm test` 全部正常。

## Phase 02 — Design System

**内容：** Tokens / Light / Dark / Glass / Button / Input / Select / Switch / Card / Dialog / Drawer / Toast / Skeleton。

**验收：** 所有基础组件符合 `DESIGN_SYSTEM.md`；Light / Dark / System 主题可切换。

## Phase 03 — Layout

**内容：** Sidebar / TopBar / Content / Connection Switcher / Responsive。

**验收：** Desktop / Tablet / Mobile 三档布局均可工作。

## Phase 04 — SurgeClient

**内容：** X-Key / Timeout / Errors / AbortSignal。

**验收：** SurgeClient 全部方法定义完成；统一错误模型生效；单元测试覆盖超时 / 401 / 网络错误。

## Phase 05 — Connections

**内容：** Create / Test / Save / Edit / Delete / Connect / Switch。

**验收：** 首次启动连接页、Last Connection 自动重连、Connection 切换器均可用；API Key 存储符合当前浏览器安全规范。

## Phase 06 — Dashboard

**内容：** Traffic / Metrics / Policies / Recent Requests / Events / Outbound Mode。

**验收：** 指标、Traffic、策略组、Recent Requests、Events、Outbound Mode 可用；各卡片有 Skeleton / Empty / Error。

## Phase 07 — Network

**内容：** Policies / Requests / Traffic / DNS。

**验收：** 策略延迟与测速；Requests 筛选与详情；Traffic 降频；DNS 缓存与 Flush。

## Phase 08 — Surge

**内容：** Rules / Modules / Scripts / Configuration / Events。

**验收：** 能力探测、平台不支持状态、Configuration `sensitive=0`、Events 筛选与搜索均可用。

## Phase 09 — Polish

**内容：** Animation / Responsive / Empty State / Loading / Error / Accessibility / PWA。

**验收：** `prefers-reduced-motion`、响应式、键盘可达性和 PWA 均符合规范。

## Phase 10 — QA

至少覆盖：API Key 错误、IP 错误、设备离线、请求超时、策略切换、DNS Flush、主题切换、刷新/重开浏览器。

**验收：** 所有场景有正确错误/空/恢复状态；`pnpm verify` 通过。

---

# Local Core / Persistence Roadmap

## Phase 11 — Local Core + SQLite + Data Password（当前）

**目标：** 从纯静态 SPA 升级为 `React + Local Core`，先建立后续持久化、通知与自动任务所需基础设施。

**内容：**

```text
server/
Node.js 22
node:sqlite
SQLite migration
Data password
scrypt KDF
AES-256-GCM DEK envelope
HttpOnly Session
Unlock rate limit
AuthGate
Immediate Lock
Docker Core service
Nginx /api proxy
```

**安全边界：**

- SQLite 禁止保存明文数据密码；
- 数据密码只用于派生主密钥；
- 随机 DEK 用 AES-256-GCM 加密后持久化；
- 解锁后的 DEK 只保存在 Core Session 内存；
- Core 重启必须使 Session 失效；
- `/api/auth/unlock` 必须有限速；
- Core 容器默认不发布宿主机端口；
- 此 Phase 不迁移现有 Surge API Key，避免一次性改变全部连接链路。

**验收：**

```text
首次打开 → 创建密码 → 自动进入
再次打开 → 输入密码 → 解锁
错误密码 → 401
连续错误 → 429
Settings → 立即锁定 → 返回密码页
Core restart → 重新输入密码
SQLite 文件持久化于 ./data
pnpm verify 通过
Docker Compose 两容器 healthy
```

## Phase 12 — Connection Persistence + Core Surge Proxy

**目标：** 把连接与 Surge API Key 从浏览器迁移到 SQLite/Vault，并逐步淘汰静态 Nginx `/v1/` 目标白名单。

**内容：**

```text
connections table
Secret Vault CRUD
Browser storage migration wizard
/api/connections
/api/surge/:connectionId/v1/*
Core X-Key injection
SSRF validation
Timeout / Abort / error mapping
```

**验收：**

- 浏览器不再持久化 Surge API Key；
- 前端不再能读取解密后的 API Key；
- 新增设备不需要修改 `nginx.conf`；
- Core 仅可访问 SQLite 中已登记的 Surge 目标；
- 老浏览器连接数据可一次性迁移，迁移后可安全清理旧 Storage。

## Phase 13 — Notification Center + Bark

**目标：** Bark 作为第一个通知 Provider，但业务模块只发布统一 Event，不直接调用 Bark。

**内容：**

```text
notification_channels
notification_rules
notification_history
Event Bus
Bark Provider
Test notification
Quiet Hours
Cooldown
Fingerprint dedupe
Recovery notification
```

**首批事件：**

```text
Device Offline / Recovery
Surge API Authentication Error
DNS Failure / High Latency / Recovery
Policy Node Unreachable / Recovery
Event Warning / Error
Profile Reload Success / Failure
Scheduled Job Failure / Recovery
Engine Restart
Unauthorized Ban
```

**验收：** 同一异常不会重复刷屏；恢复事件单独通知；Bark Token 加密存储；Settings 可测试推送并查看通知历史。

## Phase 14 — Scheduler + Collector

**内容：**

```text
scheduled_jobs
job_runs
Profile Reload
Device Heartbeat
DNS Health Check
Node Health Check
Metrics Collector
Event Collector
Daily Digest
```

**默认建议：** Metrics 60s、Events 30s、DNS 10min、Node Quality 30min；所有频率可配置并设置最小安全间隔。

**验收：** Core 即使没有浏览器打开也能执行任务；任务结果写入 SQLite；失败有退避/去重；重启后调度恢复。

## Phase 15 — Analytics + Backup + Config History

**内容：**

```text
24h / 7d / 30d Traffic
Policy Traffic
DNS Trend
Memory / Uptime
Error Trend
Policy P50 / P95 / Availability
Profile Snapshot / SHA-256 / Diff
SQLite retention
Daily backup
Restore validation
Console update check
```

**验收：** 历史趋势来自 SQLite，不依赖页面常驻；数据保留策略可配置；备份不会复制损坏 WAL 状态；恢复前必须验证数据库完整性。

---

## 版本里程碑

| 版本 | 对应范围 | 触发条件 |
| --- | --- | --- |
| V1（0.1.0） | Connection Manager / Dashboard / Traffic / Policies / Requests / Events / DNS / Theme / Responsive | Phase 01–07 |
| V1.1 | Rules / Modules / Scripts / Configuration | Phase 08 |
| V1.2 | Multiple Surge / PWA / Request Details / Advanced Filters | Phase 09–10 |
| v0.4.0 | 自动测速并选择策略组最快可达节点；请求详情增强 | Policies / Requests 增强 |
| v0.5.0 | Fleet Console：多设备聚合控制台 | Fleet 完成 |
| Next | Local Core / SQLite / Data Password | Phase 11 |
| Next + 1 | Connection Vault / Core Surge Proxy | Phase 12 |
| Next + 2 | Bark / Notification Center / Scheduler | Phase 13–14 |
| V2 | Analytics / Config History / Backup | Phase 15 |

> 原则：**先建立 Core 与数据安全边界，再开发 Bark 和定时任务。通知模块不得反向决定数据模型；Collector 与 Scheduler 必须在浏览器关闭后仍能工作。**
