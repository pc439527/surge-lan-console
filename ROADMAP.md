# Surge LAN Console — 开发路线图（Roadmap）

> DeepSeek Harness 按 Phase 顺序开发。Phase 11–14 已完成基础实现，后续迭代从 Phase 15 开始。

---

## Phase 01–10 — Web Console Foundation（已完成）

React + TypeScript + Vite、Design System、Layout、SurgeClient、Connections、Dashboard、Network、Rules / Modules / Scripts / Configuration、Polish / QA。

---

# Local Core / Persistence Roadmap

## Phase 11 — Local Core + SQLite + Data Password（已完成）

**已实现：** Node.js 22 Local Core、`node:sqlite`、WAL / migration、数据密码、scrypt、AES-256-GCM DEK envelope、HttpOnly Session、Unlock rate limit、AuthGate、Immediate Lock、Docker Core service、Nginx `/api` proxy。

**运行语义：** 未解锁时 Web fail-closed；Core 重启后必须重新输入数据密码。

## Phase 12 — Connection Persistence + Core Surge Proxy（已完成）

**已实现：**

```text
connections table
Secret Vault CRUD
Browser Storage one-time migration
/api/connections
/api/surge/:connectionId/v1/*
Core X-Key injection
SSRF / DNS rebinding validation
Timeout / response limit / error mapping
```

- Connection 元数据持久化到 SQLite；
- Surge API Key 以 AES-256-GCM 密文进入 Vault；
- 浏览器不再持久化真实 X-Key；
- 老 `localStorage/sessionStorage` 数据首次解锁后自动迁移，成功后清理；
- Core 只允许访问 SQLite 中登记且解析到 RFC1918 / link-local / Tailscale CGNAT 范围的目标；
- 新增 Surge 设备不再需要修改 Nginx 静态设备白名单。

## Phase 13 — Notification Center + Bark（已完成基础实现）

**已实现：**

```text
notification_channels
notification_rules
notification_history
event_states
Event Bus
Bark Provider
Test notification
Quiet Hours
Cooldown
Fingerprint dedupe
Recovery notification
```

首批事件：Device Offline / Recovery、Surge Authentication Error、DNS Failure / High Latency / Recovery、Policy Node Unreachable / Recovery、Event Warning / Error、Profile Reload Success / Failure、Scheduled Job Failure / Recovery、Engine Restart、Unauthorized Ban、Daily Digest。

Bark Token URL 仅加密存入 Vault，Settings 可替换 Token、启停渠道、测试推送、调整事件规则并查看通知历史。

## Phase 14 — Scheduler + Collector（已完成基础实现）

**已实现：**

```text
scheduled_jobs
job_runs
collector_samples
Device Heartbeat
Metrics Collector
Event Collector
DNS Health Check
Node Quality Check
Profile Reload
Daily Digest
```

默认频率：Metrics 60s、Events 30s、DNS 10min、Node Quality 30min、Heartbeat 60s；Profile Reload 与 Daily Digest 默认关闭。频率可在 Settings 调整，并有最小安全间隔。

### Runtime Vault Lease

为满足“浏览器关闭后任务仍运行”，解锁后的 DEK 可在 **Core 进程内存**保留一份 Runtime Vault Lease：

- 永不写入 SQLite / 文件 / 日志；
- 浏览器关闭或普通 Session 超时不会停止 Scheduler；
- Settings「立即锁定」会撤销所有 Session 并清零 Runtime DEK；
- Core 重启会清零 Runtime DEK；
- 重启后 Scheduler 定义仍从 SQLite 恢复，但受保护任务需用户再次输入数据密码后自动恢复执行。

---

## Phase 15 — Analytics + Backup + Config History（当前）

**下一阶段内容：**

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

**验收目标：** 历史趋势来自 SQLite，不依赖页面常驻；数据保留策略可配置；备份使用 SQLite 安全快照而不是直接复制活跃 WAL；恢复前验证数据库完整性。

---

## 版本里程碑

| 版本 | 对应范围 | 状态 |
| --- | --- | --- |
| V1 / V1.1 / V1.2 | Web Console Foundation | 已完成 |
| v0.4.0 | 自动测速、请求详情增强 | 已完成 |
| v0.5.0 | Fleet Console | 已完成 |
| Local Core | Phase 11 | 已完成 |
| Connection Vault / Core Proxy | Phase 12 | 已完成 |
| Notification / Bark | Phase 13 | 已完成基础实现 |
| Scheduler / Collector | Phase 14 | 已完成基础实现 |
| V2 Analytics / Backup | Phase 15 | 下一阶段 |

> 原则：Secret 只在 Core 内解密；业务模块发布 Event，不直接调用 Bark；后台采集与调度不依赖浏览器常驻。
