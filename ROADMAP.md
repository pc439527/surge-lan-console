# Surge LAN Console — 开发路线图（Roadmap）

> DeepSeek Harness 按 Phase 顺序开发。Phase 11–15 已完成 Local Core、持久化、通知、后台采集、Analytics、Backup / Restore 与 Config History 基础闭环；当前进入 Phase 16，重点由“继续堆功能”转向真实设备正确性、状态语义、响应式一致性与可执行视觉门禁。

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
Provider backoff
```

首批事件：Device Offline / Recovery、Surge Authentication Error、DNS Failure / High Latency / Recovery、Policy Node Unreachable / Recovery、Event Warning / Error、Profile Reload Success / Failure、Scheduled Job Failure / Recovery、Engine Restart、Unauthorized Ban、Daily Digest。

Bark Token URL 仅加密存入 Vault，Settings 可替换 Token、启停渠道、测试推送、调整事件规则并查看通知历史。Quiet Hours 不会产生“只收到恢复、未收到故障”的状态错配；Provider 连续失败使用指数退避。

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
Runtime Metrics
Policy Traffic Counters
Profile Snapshot
Profile Reload
Daily Digest
SQLite Backup
```

默认频率：Metrics 60s、Events 30s、DNS 10min、Node Quality 30min、Runtime Metrics 5min、配置快照 6h、SQLite Backup 24h、Heartbeat 60s；Profile Reload 与 Daily Digest 默认关闭。频率可在 Settings 调整，并有最小安全间隔。

### Runtime Vault Lease

为满足“浏览器关闭后任务仍运行”，解锁后的 DEK 可在 **Core 进程内存**保留一份 Runtime Vault Lease：

- 永不写入 SQLite / 文件 / 日志；
- 浏览器关闭或普通 Session 超时不会停止 Scheduler；
- Settings「立即锁定」会撤销所有 Session 并清零 Runtime DEK；
- Core 重启会清零 Runtime DEK；
- 重启后 Scheduler 定义仍从 SQLite 恢复，但受保护任务需用户再次输入数据密码后自动恢复执行。

---

## Phase 15 — Analytics + Backup + Config History（已完成）

### 已完成

- [x] **24h / 7d / 30d Traffic**：Metrics Collector 写入 SQLite 5 分钟 / 1 小时 rollup；Traffic 页面按需读取长期趋势，不依赖浏览器常驻。
- [x] **Policy Traffic**：复用 `/v1/metrics` 的 per-policy 累计 counter，按 5 分钟保存并处理 Surge 重启 counter reset；Traffic 页面支持 24h / 7d / 30d 策略流量排名、上传、下载、总量与占比。
- [x] **DNS Trend**：基于后台 `/v1/test/dns_delay` 采样提供 24h / 7d 趋势、平均、P95、峰值与采样数；不再把 Core→Surge API RTT 当成 DNS 延迟。
- [x] **Policy P50 / P95 / Availability**：Node Quality Collector 的真实节点结果跨策略组去重后计算 24h / 7d P50、P95、可用率与最近状态。
- [x] **Memory / Uptime**：优先通过 `/v1/metrics` 采集真实运行时指标；旧设备不支持时仅从 `/v1/traffic.startTime` 回退 Uptime，Memory 保持 N/A；Health Center 提供 24h / 7d 历史趋势。
- [x] **Error Trend**：按连接聚合 Surge Warning / Error 与 Scheduler Failure；Bark Failure 因当前通知历史为全局口径，单独作为 Console 全局指标展示。
- [x] **Profile Snapshot / SHA-256 / Diff**：只抓取 `sensitive=0` 配置；支持 6h 自动快照、手动快照、Reload 后快照、SHA-256 去重、历史列表与两版本 Diff。
- [x] **SQLite retention**：高频 Metrics 原始样本 2d、健康/事件原始样本 7d、5min Traffic rollup 30d、1h Traffic rollup 365d、Policy Traffic counter 30d、Job Runs 30d、Notification History 90d。
- [x] **Retention settings**：上述保留周期已开放为受约束 Settings 配置，Core 强制最小/最大范围；缩短周期后立即清理，恢复默认值同样即时生效。
- [x] **Daily backup**：使用 Node `node:sqlite` Online Backup API 对活跃 WAL 数据库生成一致快照；默认每日自动备份，支持手动备份，最近保留 30 份。
- [x] **Backup validation / Restore preflight**：备份先写 `.partial`，执行 `PRAGMA quick_check`、schema migration version 与 SHA-256 校验，全部通过后再原子改名；Settings 可重新验证已有备份。
- [x] **Restore execution**：恢复前强制重新校验 SHA-256 / quick_check / schema，自动创建 `restore-point`，安全停止 Scheduler / Session / Runtime Vault，关闭 SQLite/WAL 后同文件系统原子替换；失败执行文件级 rollback，完成后由容器自动重启 Core。
- [x] **Console update check**：Settings 显示当前 Build Info，并由 Core 服务端比较最新版本 / commit；支持私有 GitHub 只读 Token 或 HTTP(S) Update Manifest，远端结果默认缓存 10 分钟，支持手动强制刷新。Token 仅存在于 Core 环境变量，不进入浏览器、SQLite 或响应。

**验收原则：**

- 历史趋势必须来自 SQLite，不依赖页面常驻；
- 长期统计不能直接无限保存高频原始 JSON，应使用 retention / rollup；
- 备份必须使用 SQLite Online Backup，不直接复制活跃 `.db/.db-wal/.db-shm`；
- Restore 执行前必须重新通过数据库完整性、schema 与 SHA-256 校验；
- 恢复失败必须保留可回滚路径，不在 SQLite 打开状态下覆盖数据库；
- Secret 永远不进入浏览器持久化、Analytics、Backup metadata 或日志明文；
- GitHub Update Token 只允许通过 Core 环境变量提供，不写入 SQLite / Web Storage / 前端 Bundle。

---

## Phase 16 — Real-device Correctness + UX Hardening + Visual QA（进行中）

### 已完成

- [x] **DNS Raw Unit Calibration**：统一 DNS cache `timeCost` 到毫秒语义；兼容 epoch 秒 / epoch 毫秒 / TTL 秒，不再把实机小数秒误显示为 `0.014ms` 或错误“已过期”。
- [x] **Capability-aware Scripts**：平台明确不支持 `/v1/scripting` 时不再制造重复 404，直接回退解析当前配置 `[Script]`。
- [x] **Health Semantics**：Availability 与 Performance 分离；可访问但高延迟端点显示性能警告，`unsupported` 保持 N/A。
- [x] **Notification / Automation IA**：通知历史、规则、任务运行记录限制默认展示量并改内部滚动，避免无限拉长主页面。
- [x] **Dashboard Capability Health**：Dashboard 不再用任意业务 query success 猜测全局 API 正常；改用 Capability Probe 表达真实端点状态。
- [x] **Fleet Latency Semantics**：设备总览区分轻量 `API RTT` 与并行请求的“快照耗时”。
- [x] **Node Quality Browsing**：增加全部 / 已测速 / 未测速 / 不可达筛选、搜索、排序和正确的可达率分母；移动端使用 Card/List。
- [x] **Unified Page Width / Header**：共享 `page-container` 统一为 1600px 宽度合同；PageHeader 收敛到 Design System 26px；桌面顶栏不再重复产品品牌/页面标题。
- [x] **Visual Smoke Foundation**：deterministic visual build + Playwright Chromium，覆盖 Dashboard / Policies / Node Quality / Requests / Traffic / DNS / Rules / Events。
- [x] **Viewport Matrix**：1920×1080、1440×900、1366×768、768×1024、430×932、390×844 × Light / Dark，共 96 张截图。
- [x] **Horizontal Overflow Guard**：每张 full-page PNG 必须与请求 viewport 同宽；页面被 intrinsic-width 撑宽时 CI 直接失败。
- [x] **Rules Mobile Overflow**：修复手机端筛选条把 390px 页面撑宽到约 728px 的问题；底部导航 Material 同步加强，内容不再明显透出。
- [x] **Compact Phone Metrics**：390 / 430 手机 MetricStrip 保持 2×2，仅极窄 `<360px` 容器退化为单列，避免统计区异常拉长。
- [x] **Runtime Build Refresh**：页面轮询 no-cache `/version.json`；服务器部署版本与当前 tab bundle 不一致时提示刷新并请求 Service Worker 更新，避免长期开着旧 UI/build hash。

### 进行中 / 待收尾

- [ ] **Tablet table density**：768px 级别平板优先保持紧凑表格；labelled-card reflow 收窄到真正手机宽度，避免 Node Quality 等页面变成超长卡片流。
- [ ] **Visual baseline / pixel diff**：当前 Visual Smoke 已能产出稳定截图并阻断横向溢出；选定视觉基线后再增加像素差阈值，避免在 UI 尚未最终收敛时制造高噪声 baseline churn。
- [ ] **Secondary page coverage**：逐步扩展 Health / Modules / Scripts / Configuration 等页面的 deterministic visual coverage；Core-dependent 页面需要可控 fixture 后再纳入。

### Phase 16 验收原则

- API 单位/状态必须以 raw response fixture、normalizer 和测试为依据，不靠 UI 猜测；
- `unsupported` ≠ `error`，慢 ≠ 不可用；
- 桌面 / 平板 / 手机根据实际 content width reflow，不根据单个页面自行定义宽度；
- 手机密集表格必须 Card/List 化，但 768px 级别平板不应无条件展开为超长卡片流；
- Light / Dark、390 / 430、768、1366、1440、1920 的布局变更必须经过 Visual Smoke；
- CI 绿灯不等于视觉验收完成，必须检查变更涉及的目标截图；
- 修复 overflow 应解决 intrinsic-width 根因并增加门禁，禁止只用全局 `overflow-x:hidden` 掩盖问题。

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
| V2 Analytics / Backup | Phase 15 | 已完成 |
| Phase 16 | Correctness / UX / Visual QA | 进行中 |

> 原则：Secret 只在 Core 内解密；业务模块发布 Event，不直接调用 Bark；后台采集与调度不依赖浏览器常驻；当前迭代优先修正确性和交互一致性，不新增重复数据链路。
