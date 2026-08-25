# Surge LAN Console — 开发路线图（Roadmap）

> DeepSeek Harness 按 Phase 顺序开发。Phase 11–14 已完成基础实现，Phase 15 正在持续完善 Analytics / Backup / Config History。

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
collector_state
Device Heartbeat
Metrics Collector
Event Collector + cursor dedupe
DNS Health Check (/v1/test/dns_delay)
Node Quality Check + node dedupe
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

## Phase 15 — Analytics + Backup + Config History（进行中）

### 已完成

- [x] **24h / 7d / 30d Traffic**：Metrics Collector 写入 SQLite 5 分钟 / 1 小时 rollup；Traffic 页面按需读取长期趋势，不依赖浏览器常驻。
- [x] **Policy Traffic**：复用 `/v1/metrics` 的 per-policy 累计 counter，按 5 分钟保存并处理 Surge 重启 counter reset；Traffic 页面支持 24h / 7d / 30d 策略流量排名、上传、下载、总量与占比。
- [x] **DNS Trend**：基于后台 `/v1/test/dns_delay` 采样提供 24h / 7d 趋势、平均、P95、峰值与采样数；不再把 Core→Surge API RTT 当成 DNS 延迟。
- [x] **Policy P50 / P95 / Availability**：Node Quality Collector 的真实节点结果跨策略组去重后计算 24h / 7d P50、P95、可用率与最近状态。
- [x] **Memory / Uptime**：优先通过 `/v1/metrics` 采集真实运行时指标；旧设备不支持时仅从 `/v1/traffic.startTime` 回退 Uptime，Memory 保持 N/A；Health Center 提供 24h / 7d 历史趋势。
- [x] **Error Trend**：按连接聚合 Surge Warning / Error 与 Scheduler Failure；Bark Failure 因当前通知历史为全局口径，单独作为 Console 全局指标展示。
- [x] **Profile Snapshot / SHA-256 / Diff**：只抓取 `sensitive=0` 配置；支持 6h 自动快照、手动快照、Reload 后快照、SHA-256 去重、历史列表与两版本 Diff。
- [x] **SQLite retention**：高频 Metrics 原始样本 2d、健康/事件原始样本 7d、5min Traffic rollup 30d、1h Traffic rollup 365d、Policy Traffic counter 30d、Job Runs 30d、Notification History 90d。
- [x] **Daily backup**：使用 Node `node:sqlite` Online Backup API 对活跃 WAL 数据库生成一致快照；默认每日自动备份，支持手动备份，最近保留 30 份。
- [x] **Backup validation / Restore preflight foundation**：备份先写 `.partial`，执行 `PRAGMA quick_check`、schema migration version 与 SHA-256 校验，全部通过后再原子改名；Settings 可重新验证已有备份。

### 待完成

- [ ] **Restore execution**：在 Restore preflight 通过后提供受控恢复流程；需要停 Scheduler / 关闭 DB、原子替换、重启 Core，并设计失败回滚。当前仅实现“恢复前验证”，尚未开放在线恢复按钮。
- [ ] **Console update check**：当前版本与仓库最新版本 / commit 比较，并提供更新提示。
- [ ] **Retention settings**：将当前安全默认保留周期开放为受约束的 Settings 配置。

**验收原则：**

- 历史趋势必须来自 SQLite，不依赖页面常驻；
- 长期统计不能直接无限保存高频原始 JSON，应使用 retention / rollup；
- 备份必须使用 SQLite Online Backup，不直接复制活跃 `.db/.db-wal/.db-shm`；
- Restore 执行前必须重新通过数据库完整性与 schema 校验；
- Secret 永远不进入浏览器持久化、Analytics、Backup metadata 或日志明文。

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
| V2 Analytics / Backup | Phase 15 | 进行中 |

> 原则：Secret 只在 Core 内解密；业务模块发布 Event，不直接调用 Bark；后台采集与调度不依赖浏览器常驻。
