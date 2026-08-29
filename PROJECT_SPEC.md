# Surge LAN Console — 项目需求文档

> 定位：一个运行于局域网浏览器中的 Surge Web 管理控制台，通过 Surge HTTP API 管理 Apple TV / iPhone / Mac 等 Surge 实例。
> 目标：**Apple 风格的专业网络管理工具**，不做成简单的 YASD 换皮。

---

## 1. 核心目标

```text
连接 Surge
     ↓
运行状态
     ↓
策略控制
     ↓
请求分析
     ↓
事件排查
     ↓
DNS / Modules / Scripts
     ↓
配置查看
```

## 2. 官方能力依据

Surge 官方 HTTP API 已满足本项目绝大部分核心需求。认证使用 `X-Key` Header，支持 HTTP/HTTPS、GET/POST；官方已提供 Policies、Policy Groups、Requests、Profile、DNS、Modules、Scripts、Events、Rules、Traffic、功能开关和 Prometheus Metrics 等接口。

**架构非常简单：**

```text
┌─────────────────────────────┐
│      Surge LAN Console      │
│        React SPA            │
└──────────────┬──────────────┘
               │
               │ HTTP API
               │ X-Key
               ▼
┌─────────────────────────────┐
│          Surge             │
│      Apple TV / iOS         │
│     192.168.x.x:6171        │
└─────────────────────────────┘
```

**第一版不需要数据库、不需要账号系统、不需要后端。**

## 3. 首次启动逻辑

首次进入：

```text
Surge LAN Console

Connect to Surge
```

输入字段：

| 字段 | 示例 |
| --- | --- |
| Connection Name | Apple TV |
| Protocol | HTTP |
| Host | 192.168.x.x |
| Port | 6171 |
| API Key | •••••••• |

操作流程：

```text
Test Connection
        ↓
Connecting...
        ↓
✓ Connected · 18ms
        ↓
Save & Continue
```

保存后进入 Dashboard。以后启动：

```text
读取 Last Connection
        ↓
自动测试
   ↙          ↘
Connected    Failed
   ↓           ↓
Dashboard   Connect Page
```

## 4. 多 Surge 实例

从第一版就设计 Connection Profile：

```text
Apple TV
192.168.x.6:6171
● Online


MacBook Pro
192.168.x.20:6171
○ Offline


iPhone
192.168.x.30:6171
● Online
```

Header 点击当前设备弹出切换器：

```text
Connections

● Apple TV
  192.168.x.6

○ MacBook
  192.168.x.20

──────────────
＋ Add Connection
Manage Connections
```

## 5. UI 总体结构（桌面）

```text
┌─────────────────────────────────────────────────────────────┐
│ SIDEBAR │                     CONTENT                       │
│         │                                                   │
│ Logo    │ Dashboard                               Toolbar   │
│         │                                                   │
│ Overview│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│         │ │ UP   │ │ DOWN │ │ REQ  │ │TOTAL │            │
│ Network │ └──────┘ └──────┘ └──────┘ └──────┘            │
│ Policy  │                                                   │
│ Request │ ┌───────────────────┐ ┌────────────────────┐     │
│ Traffic │ │ Traffic           │ │ Policy Groups      │     │
│ DNS     │ │                   │ │                    │     │
│ Rules   │ └───────────────────┘ └────────────────────┘     │
│         │                                                   │
│ Surge   │ ┌───────────────────┐ ┌────────────────────┐     │
│ Modules │ │ Recent Requests   │ │ Recent Events      │     │
│ Scripts │ └───────────────────┘ └────────────────────┘     │
│ Config  │                                                   │
│ Events  │                                                   │
│         │                                                   │
│ System  │                                                   │
│ Setting │                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 页面规格

### 6.1 Dashboard

顶部四指标：

```text
Upload          Download        Active Requests   Total Traffic
4.06 KB/s       2.27 KB/s       12                19.16 GB
```

下方布局：

```text
60% Traffic（图表）    40% Policies（策略组）
50% Recent Requests    50% Events（最近事件）
```

### 6.2 Traffic

- ECharts 图表；固定配色：**Upload = Blue，Download = Purple**
- 时间范围：1 min / 5 min / 15 min / 30 min，默认 **5 min**
- 采样：**1 second**
- 页面隐藏时降频 / 暂停 polling，避免后台一直请求 Apple TV

### 6.3 Policies

卡片 + Table 混合：

```text
Proxy

Selected
HK 01

Available

● HK 01       42 ms
● HK 02       61 ms
● JP Tokyo    72 ms
● SG          95 ms
● US LA      168 ms
○ HK 05     Timeout
```

延迟分级：

```text
<100       Green
100–250    Orange
>250       Red
timeout    Gray
```

操作：Select / Test / Retest Group。

### 6.4 Requests（桌面 Table）

列：Time / Host / Method / Policy / Rule / Status / Duration / Traffic

支持：Search、Policy ▼ 筛选、Status ▼ 筛选、Protocol ▼ 筛选、Pause。

点击 Row 打开右侧 **Drawer**（不跳页面）。

### 6.5 Request Drawer

Liquid Glass / Elevated Material：

```text
Request Detail

Overview
  Time / Domain / URL / Method / Protocol / Status

Routing
  Rule / Policy / Source / Destination

Network
  Connection / DNS / Duration / Traffic

Headers
  Request Header / Response Header
```

### 6.6 Events

```text
Events

[ All ] [ Info ] [ Warn ] [ Error ]

Search events...
```

内容示例：

```text
10:22:30   WARN
Rule set ChinaMax_All.list load failed

10:21:15   INFO
Profile reloaded

10:19:52   ERROR
Connection refused (POSIX:61)
```

数据来源：Surge `/v1/events`。

### 6.7 DNS

布局：`┌ Cache ┐ DNS Test`

Table：Domain / IP / TTL

Actions：Refresh、Flush DNS。Flush 必须二次确认：

```text
Clear DNS Cache?

Cancel    Clear
```

### 6.8 Modules

```text
Modules

Search

─────────────────

Advertising Block     Installed Module        [ON]
YouTube               Remote Module           [OFF]
```

Switch 操作二次确认可做成配置项。

### 6.9 Scripts

页面显示：Name / Type / Status / Path / Action

允许操作：Evaluate / Run Cron / View。

**第一版不做 Script 在线编辑。**

### 6.10 Configuration

CodeMirror 6 展示当前 Profile：

```ini
[General]

loglevel = notify


[Proxy]

...


[Proxy Group]

...


[Rule]

...
```

默认 `sensitive=0`（`/v1/profiles/current?sensitive=0`）隐藏敏感字段；支持 `/v1/profiles/reload`。

### 6.11 首页快速控制（Outbound Mode）

右上角 `RULE ˅`，点击弹出：

```text
Outbound Mode

● Rule
○ Proxy
○ Direct
```

对应 `GET /v1/outbound` 与 `POST /v1/outbound`。

### 6.12 Feature 控制

Settings / Dashboard 提供：

```text
MitM          ●
Rewrite       ●
Scripting     ●
Capture       ○
```

对应 `/v1/features/mitm`、`/v1/features/rewrite`、`/v1/features/scripting`、`/v1/features/capture`。

---

## 7. API Key 安全

```ts
{
  id,
  name,
  protocol,
  host,
  port
}
```

- Connection（不含 Key）保存于 **LocalStorage**。
- API Key 默认保存于 **sessionStorage**；仅当用户主动勾选 `Remember API Key` 才允许 LocalStorage。
- 禁止：Console 输出 Key、URL Query 携带 Key、Git Commit、配置文件硬编码。
- 本项目固定使用 `X-Key` Header 认证（不采用 Query 方式）。

## 8. API 请求频率（Refresh Policy）

统一由 TanStack Query 管理：

| API | Refresh |
| --- | ---: |
| Traffic | 1s |
| Active Requests | 2s |
| Recent Requests | 3s |
| Events | 3s |
| Policies | 10s |
| Feature State | 10s |
| DNS | 手动 / 30s |
| Modules | 手动 |
| Scripts | 手动 |
| Configuration | 手动 |

## 9. 错误模型

```ts
type SurgeError =
  | ConnectionError
  | AuthenticationError
  | TimeoutError
  | ApiError
  | UnsupportedFeatureError
  | BrowserSecurityError
```

页面禁止直接显示 `AxiosError: ERR_NETWORK`，需转换为友好提示：

```text
Cannot connect to Surge

192.168.x.6:6171

Please verify:
• Surge HTTP API is enabled
• Device is reachable
• Port is correct
• API Key is valid
```

## 10. 加载与空状态

- 全部页面统一 Skeleton，禁止一堆 `Loading...`。
- Dashboard 初次加载：Card Skeleton、Chart Skeleton、Table Skeleton。
- 每个页面必须有 Empty State。

## 11. 版本范围

### V1（0.1.0 发布）

```text
Connection Manager
Dashboard
Traffic
Policies
Requests
Events
DNS
Outbound Mode
Feature Toggle
Light Mode
Dark Mode
System Theme
Responsive
```

**完成这些才发布 0.1.0，第一版不把所有 API 接完。**

### V1.1

```text
Rules
Modules
Scripts
Configuration
```

### V1.2

```text
Multiple Surge
PWA
Request Details
Advanced Filters
Keyboard Shortcuts
```

### V2

基于 `/v1/metrics`（Prometheus，iOS 5.22.0+ / Mac 6.9.0+）：

```text
Analytics
24h Traffic
Policy Traffic
Error Trend
DNS Cache Trend
Uptime
Memory
```

必须做 **Capability Detection**，确认接口支持再展示。

---

## 12. 最终产品视觉目标

```text
        Apple 系统工具
               +
        Surge 网络控制台
               +
      Grafana 的数据可读性
               +
       Linear 的操作效率
```

而不是：普通 Bootstrap Admin；也不是：整个页面全部磨砂玻璃。
