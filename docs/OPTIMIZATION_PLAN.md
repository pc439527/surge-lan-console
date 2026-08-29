# Surge LAN Console 优化与实机兼容改造方案

> Repository: `pc439527/surge-lan-console`
> Branch: `main`
> Project: Surge LAN Console
> Target: Surge HTTP API / Apple TV / tvOS
> Updated: 2026-08-20

---

## 1. 项目目标

Surge LAN Console 是一个面向局域网 Surge 实例的 Web 管理控制台。

主要使用场景：

- Apple TV 安装 Surge
- Surge 开启 HTTP API
- Web Console 部署在局域网服务器
- 浏览器访问 Web Console
- 添加一个或多个 Surge 实例
- 实时查看 Surge 状态
- 查看流量
- 查看请求
- 查看策略组
- 查看 DNS
- 查看规则
- 查看模块
- 查看脚本
- 查看事件
- 管理配置
- 进行基础控制操作

当前目标设备：

```text
Surge Instance:
Apple TV
192.168.x.6:6171

Console 当前访问地址示例：

http://192.168.x.22
```

项目不应该只是「Surge API 的页面映射」，而应该逐步成为：

> 一个适合桌面、iPad、iPhone 使用的局域网 Surge 运维控制台。

---

## 2. 当前阶段判断

项目基础框架已经基本建立：

- React
- TypeScript
- TanStack Query
- Surge API Client
- 多 Surge 实例
- Dashboard
- Policies
- Requests
- Traffic
- DNS
- Rules
- Modules
- Scripts
- Events
- Connections
- Dark / Light / System Theme
- Docker / nginx
- Mock API
- 基础运行时 API Schema Validation

近期代码已经处理了一部分关键问题，包括：

- 多实例 Query Key 隔离
- Requests Pause
- Traffic 累计流量计算
- AbortSignal
- Traffic / Requests / Events Zod 校验
- nginx 安全 Headers
- 本地 Verify

但是经过 Apple TV Surge 实机连接测试后发现：

> 当前主要问题已经不是「缺页面」，而是「API 数据真实性、跨平台兼容、页面状态、排版、部署版本一致性」。

因此下一阶段必须从：

```text
Feature Development
```

切换到：

```text
Real Device Calibration
+
API Compatibility
+
UI Architecture
+
Production Reliability
```

---

## 3. 当前实机发现的问题

### 3.1 Dashboard 页面高度严重失衡

当前 Dashboard 大致结构：

```text
┌─────────────────────────────┐
│ Upload / Download / Requests│
└─────────────────────────────┘
┌───────────────────┬─────────┐
│ Traffic Chart     │ Policies│
│                   │ Group   │
│                   │ Group   │
│                   │ Group   │
│                   │ ...     │
│                   │ ...     │
└───────────────────┴─────────┘
```

问题：

右侧策略组数量较多。

当前 Grid：

```tsx
<div className="grid gap-4 xl:grid-cols-5">
```

Traffic：

```tsx
<Card className="xl:col-span-3">
```

Policy：

```tsx
<Card className="xl:col-span-2">
```

同一个 Grid Row 下：

```text
Traffic Card
Policy Card
```

默认会被拉成相同高度。

但是 Traffic Chart 本身：

```tsx
h-64
```

只有约：

```text
256px
```

因此造成：

```text
Traffic Chart
↓
几百甚至上千 px 空白
↓
下一区域
```

优化原则：

> Dashboard 不应该展示完整 Policies。
>
> Dashboard 的职责：**Overview**，而不是 **Full Management**。

---

## 4. Dashboard 重构方案

### 4.1 新 Dashboard 信息架构

建议改成：

```text
┌──────────────────────────────────────────────────────┐
│ Dashboard                            RULE ▼          │
│ Apple TV · 192.168.x.6 · Connected                  │
└──────────────────────────────────────────────────────┘
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ ↑ Upload   │ │ ↓ Download │ │ Connections│ │ Traffic    │
│ 35 B/s     │ │ 97 B/s     │ │ 63         │ │ 2.27 GB    │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
┌──────────────────────────────────┬───────────────────┐
│ Realtime Traffic                 │ Surge Status      │
│                                  │                   │
│          Traffic Chart           │ Mode      RULE    │
│                                  │ Proxy     HongKong│
│                                  │ DNS       Active  │
│                                  │ MITM      Enabled │
│                                  │ Scripts   Enabled │
└──────────────────────────────────┴───────────────────┘
┌──────────────────────────────────┬───────────────────┐
│ Important Policy Groups          │ System Status     │
│                                  │                   │
│ Telegram        Hong Kong        │ API       Healthy │
│ Netflix         Hong Kong        │ Latency   12ms    │
│ Spotify         Taiwan           │ Version   x.x.x   │
│ YouTube         Proxy            │ Uptime    ...     │
│                                  │                   │
│ View All →                       │                   │
└──────────────────────────────────┴───────────────────┘
┌──────────────────────────────────┬───────────────────┐
│ Recent Requests                  │ Recent Events     │
│                                  │                   │
│ chatgpt.com       10ms           │ Profile reloaded │
│ api.example.com   4ms           │ ...               │
│ tailscale.com      2ms           │                   │
│                                  │                   │
│ View All →                       │ View All →        │
└──────────────────────────────────┴───────────────────┘
```

---

## 5. Dashboard 数据建议

顶部 KPI：

| KPI | 数据 |
| --- | --- |
| Upload | 当前上传速度 |
| Download | 当前下载速度 |
| Connections | 当前活动连接 |
| Traffic | 当前 Surge Session 总流量 |

第二层：

```text
Realtime Traffic
```

显示：

```text
Upload
Download
```

最近：

```text
5 minutes
```

默认即可。

Dashboard 不需要提供：

```text
1m
5m
15m
30m
```

详细区间切换留给 Traffic 页面。

---

## 6. Dashboard Policy Group 优化

当前首页把全部 Policy Group 塞进去。

不建议。

Dashboard 最多显示：

```text
6 ~ 8
```

推荐优先显示：

```text
Proxy
Telegram
YouTube
Netflix
Spotify
Apple
GlobalMedia
Intelligence
```

或者按照：

```text
最近实际使用
```

排序。

最后：

```text
查看全部策略 →  跳转 /policies
```

---

## 7. Dashboard Card 高度规则

禁止：

```text
stretch
```

导致左右 Card 强制一样高。

建议：

```tsx
<div className="grid items-start gap-4 xl:grid-cols-5">
```

或者彻底拆 Row：

```text
Row 1: Traffic + System Status
Row 2: Policy Summary + Runtime Status
Row 3: Requests + Events
```

---

## 8. Requests 页面问题

实机目前出现：

```text
-1787158896ms
```

明显错误。

当前 GitHub main 已经有：

```ts
const ms = row.completedDate - row.startDate;
```

并判断：

```ts
ms > 0 ? ... : "—"
```

因此需要首先确认：

```text
运行版本 != GitHub main 的可能性。
```

---

## 9. 必须增加 Build Information（P0）

应用必须在构建时写入：

```text
Version
Git Commit
Build Time
Environment
```

例如：

```text
Version        0.2.0
Git Commit     da3065f
Build          2026-08-20 01:23:18
Environment    production
```

建议环境变量：

```text
VITE_APP_VERSION=
VITE_GIT_COMMIT=
VITE_BUILD_TIME=
```

Vite Config 自动注入：

```ts
import { execSync } from "node:child_process";
const gitCommit = execSync("git rev-parse --short HEAD")
  .toString()
  .trim();
```

Settings → System → About 展示 Version / Commit / Build / API Version。

Sidebar Bottom 可以简化显示：

```text
v0.2.0 · da3065f
```

---

## 10. Requests 时间标准化

不要直接假定 `startDate` / `completedDate` 一定具有相同单位。

必须建立 `normalizeTimestamp()`。

### 10.1 Timestamp Normalizer

创建 `src/api/normalize/timestamp.ts`：

```ts
export function normalizeEpoch(value?: number): number | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  // Unix seconds
  if (value < 10_000_000_000) {
    return value * 1000;
  }
  // Unix milliseconds
  if (value < 10_000_000_000_000) {
    return value;
  }
  return undefined;
}
```

然后：

```ts
const start = normalizeEpoch(row.startDate);
const completed = normalizeEpoch(row.completedDate);
if (!start || !completed) {
  return "—";
}
const duration = completed - start;
if (duration < 0) {
  return "—";
}
```

---

## 11. Request Status 统一

当前 Surge Request 可能存在：

```text
Active
Completed
DNS Lookup
Rule Evaluating
Establishing Connection
```

状态显示：

| 状态 | 颜色 |
| --- | --- |
| Active | Yellow |
| Completed | Green |
| DNS Lookup | Blue |
| Rule Evaluating | Purple |
| Establishing Connection | Blue |
| Failed | Red |

不要只根据 `completed` 来判断。

---

## 12. Request URL 规范化

目前经常看到：

```text
192.168.50.53:53 (Port Map)
223.5.5.5:53 (Port Map)
```

建议显示列：

```text
Host
Protocol
Policy
Rule
Status
Duration
```

详情 Drawer 再显示：

```text
URL
Source
Destination
Upload
Download
Start Time
Complete Time
Timing Records
Process
Request Header
```

---

## 13. Rules 页面为空的问题（P0）

Requests 已经证明规则正在执行：

```text
RULE-SET LAN
RULE-SET ChinaMedia.list
RULE-SET OpenAI.list
DOMAIN
FINAL
```

但：

```text
Rules = 0
```

这极有可能是 API Response Shape 解析问题。

---

## 14. 禁止 API 静默降级为空数组

当前存在类似逻辑：

```ts
return Array.isArray(raw) ? raw : [];
```

这是危险设计。

因为：

```text
API Response Unexpected 会变成 []
页面最终显示 No Rules
```

用户会误认为 Surge 没规则，实际上 Frontend Parser Failed。

---

## 15. API Response State 规范

以后所有 API 页面统一采用：

```ts
type ApiState =
  | "loading"
  | "success"
  | "empty"
  | "unsupported"
  | "unauthorized"
  | "network-error"
  | "parse-error";
```

页面不可再只有 Loading / Success / Empty。

---

## 16. Rules API Normalizer

创建 `src/api/normalize/rules.ts`，支持 `[{...}]` 以及 `{"rules": []}`，甚至其它已确认的 Surge 平台差异：

```ts
export function normalizeRules(raw: unknown): RuleInfo[] {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (
    raw &&
    typeof raw === "object" &&
    "rules" in raw &&
    Array.isArray((raw as any).rules)
  ) {
    return (raw as any).rules;
  }
  throw new SurgeResponseError(
    "Unexpected response structure for /v1/rules"
  );
}
```

重点：**未知数据 ≠ 空数据**。

---

## 17. Apple TV API Raw Response 调试机制

下一阶段非常重要。

增加 **Development / Diagnostics** 模式。

对于每一个 Endpoint：

```text
GET /v1/rules
```

保存：

```text
status
latency
response type
response summary
parse result
```

开发模式允许 View Raw Response，但需要自动遮盖：

```text
password
authorization
token
key
```

---

## 18. API Diagnostics 页面

新增 `Settings → API Diagnostics`：

```text
API Diagnostics
Apple TV
192.168.x.6:6171

Connection
────────────────────────
Host Reachable       ✓
Authentication       ✓
Latency              8ms

API
────────────────────────────────────────
Endpoint                 State     Result
/v1/outbound             ✓         rule
/v1/traffic              ✓         2 interfaces
/v1/requests/recent      ✓         63 requests
/v1/policy_groups        ✓         21 groups
/v1/rules                ⚠         Parse Error
/v1/dns                  ✓         128 cache
/v1/modules              —         Unsupported
/v1/scripting            ✓         0 scripts
/v1/events               ✓         0 events
```

点击 `/v1/rules` 展开：

```text
HTTP Status     200
Latency         7ms
Response Type   object
Parser          Failed
Reason          Expected Array<RuleInfo>
Raw Structure   { "rules": [...] }
```

---

## 19. Diagnostics 的意义

以后页面出现 Modules 空，可以明确知道是：

```text
0 modules
还是 404 Unsupported
还是 Parse Failed
还是 Network Error
```

这是后续多平台兼容的重要基础。

---

## 20. DNS 页面问题

当前 DNS 实机有两个明显问题：

```text
所有缓存显示 已过期
只展示 dnsCache，却没有展示 local
```

---

## 21. DNS 页面结构

```text
DNS
[ Dynamic Cache 128 ] [ Local Records 16 ]
Search                           Refresh   Flush DNS
Domain              Result                Server
─────────────────────────────────────────────────
apple.com           17.x.x.x              223.5.5.5
                    17.x.x.x
Path      SYSTEM → DIRECT
Query     12ms
TTL       2m 13s
```

---

## 22. DNS Dynamic / Local 分离

API：`/v1/dns`，数据 `{ dnsCache: [], local: [] }` 必须同时展示。

Tabs：`动态缓存` / `本地记录`。

---

## 23. DNS expiresTime 不可直接假设

当前 `expiresTime - Date.now()` 不一定正确。

必须先拿 Apple TV Raw Response 验证 `expiresTime` 到底是：

```text
Unix Seconds
Unix Milliseconds
TTL Seconds
Relative Timestamp
```

在确认以前：宁可显示 `—`，也不要错误显示 `已过期`。

---

## 24. DNS 列建议

Dynamic：

| Field | UI |
| --- | --- |
| domain | 域名 |
| data | IP |
| server | DNS Server |
| path | DNS Path |
| timeCost | 查询耗时 |
| expiresTime | TTL |

Local：

| Field | UI |
| --- | --- |
| domain | 域名 |
| data | 地址 |
| source | 来源 |
| server | DNS |
| comment | 注释 |

---

## 25. Modules 页面

当前：`Modules → Search → Empty Card`，用户无法判断「没有模块」还是「接口失败」。必须加入统一状态。

---

## 26. Empty State 组件

增加 `src/components/data-state/`：

```text
DataLoading
DataEmpty
DataError
DataUnsupported
DataUnauthorized
```

Empty：

> 没有发现已安装模块  
> 当前 Surge 实例没有返回模块数据。

Unsupported：

> 当前 Surge 平台不支持该接口  
> Apple TV / tvOS 可能不支持完整的模块管理 API。

Error：

> 无法读取模块  
> API: GET /v1/modules  
> 错误: HTTP 500  
> [重新加载]

---

## 27. Scripts 页面

同样处理。页面不得把 API ERROR 显示成 No Scripts。

- Scripts Empty：没有发现脚本，当前配置未启用 HTTP / Rule / DNS / Event / Cron 脚本。
- Unsupported：当前 Surge 实例不支持脚本查询接口。

---

## 28. Events 页面

当前 Empty：「没有匹配的事件」。应该区分「没有事件」和「无法读取事件」：

```text
Events
[全部] [信息] [警告] [错误]
Search
────────────────────────────
暂无事件
Surge 当前没有返回系统事件。
```

---

## 29. 多实例 Query Key 必须全部统一

现有已经建立 `surgeKeys(connectionId)`，必须扩展到所有 Feature：

```ts
export const surgeKeys = {
  all: (connectionId: string) => ["surge", connectionId] as const,
  traffic: (connectionId: string) => [...surgeKeys.all(connectionId), "traffic"] as const,
  requests: (connectionId: string) => [...surgeKeys.all(connectionId), "requests"] as const,
  policies: (connectionId: string) => [...surgeKeys.all(connectionId), "policies"] as const,
  dns: (connectionId: string) => [...surgeKeys.all(connectionId), "dns"] as const,
  rules: (connectionId: string) => [...surgeKeys.all(connectionId), "rules"] as const,
  modules: (connectionId: string) => [...surgeKeys.all(connectionId), "modules"] as const,
  scripts: (connectionId: string) => [...surgeKeys.all(connectionId), "scripts"] as const,
  events: (connectionId: string) => [...surgeKeys.all(connectionId), "events"] as const,
  features: (connectionId: string) => [...surgeKeys.all(connectionId), "features"] as const,
};
```

禁止 `queryKey: ["/v1/dns"]`——两个 Surge 实例会共用 Cache。

---

## 30. Connection Switch 行为

切换 `Apple TV A → Apple TV B` 必须：UI 数据立即切换 namespace，不能短暂显示 A 的 Rules / DNS / Modules / Traffic 然后才刷新成 B。

---

## 31. Traffic 页面数据结构优化

Traffic 的 UI 提供 `1分钟/5分钟/15分钟/30分钟`，但内部存储不应该根据当前选择决定：

```text
Collector → 始终保留最近 30 分钟 → UI Filter → 1m / 5m / 15m / 30m
```

---

## 32. Traffic Ring Buffer

采样 1 second，最大 30 min × 60 sec = 1800 points。

```ts
const MAX_POINTS = 1800;

setSamples((prev) => {
  const next = [...prev, sample];
  if (next.length > MAX_POINTS) {
    return next.slice(next.length - MAX_POINTS);
  }
  return next;
});

const visibleSamples = samples.filter(
  (item) => item.time >= Date.now() - selectedWindow,
);
```

---

## 33. Traffic Sampling

浏览器 `document.hidden === true` 时降低刷新频率：Visible 1s / Hidden 5s。恢复前台后立即 refresh。

---

## 34. Traffic Chart 优化

- Upload 蓝 / Download 紫，使用 CSS token `--chart-upload` / `--chart-download`，不要组件内硬编码颜色。
- smooth line、low opacity gradient、minimal grid、tooltip、adaptive Y axis。
- Tooltip：`01:23:18 / Download 1.42 MB/s / Upload 125 KB/s`。

---

## 35. Traffic Window Total

窗口流量（`251 KB ↓ 189 KB ↑`）应该来自累计 byte delta（`end - start`），而不是 `speed × interval`。

---

## 36. Policies 页面优化

增强可读性：

```text
Telegram                  Proxy
Current: Hong Kong · 6 Policies
▼ Expand
  ● Proxy          Test
  ○ Hong Kong      37 ms
  ○ United States  121 ms
  ○ Japan          56 ms
  ○ Korea          78 ms
  ○ Singapore      62 ms
```

---

## 37. Policies Latency

测速后直接显示每个策略延迟：

| 延迟 | 颜色 |
| --- | --- |
| < 100ms | Green |
| 100~250 | Orange |
| > 250 | Red |

---

## 38. Policy Group 默认折叠

默认 collapsed，但当前选中始终在 Card Header 显示，页面不会因为节点多变得特别长。

---

## 39. Rules 页面重新设计

```text
Rules
Search
[ALL] [DOMAIN] [RULE-SET] [IP-CIDR] [GEOIP] [FINAL]
Type         Content                     Policy
────────────────────────────────────────────────────
RULE-SET     LAN                         DIRECT
RULE-SET     ChinaMedia.list             DIRECT
RULE-SET     OpenAI.list                 Proxy
DOMAIN       api.example.com            DIRECT
FINAL        —                           Proxy

底部: 136 Rules
```

---

## 40. Rule Parsing

不要把规则只建模为 `type/content/policy`，要允许 `raw`：

```ts
interface RuleInfo {
  type?: string;
  content?: string;
  policy?: string;
  raw?: unknown;
}
```

这样 Surge 新版本字段变化时不会完全丢失。

---

## 41. API Runtime Validation 扩展

目前 Traffic / Requests / Events 已有 Zod。下一阶段扩展 Policies / Policy Groups / DNS / Rules / Modules / Scripting / Features / Profile。

Schema 原则：**宽松验证 + 严格关键字段**，不要过度 strict——macOS / iOS / tvOS 接口可能存在差异。

---

## 42. API Normalization Layer

建议目录重构：

```text
src/api/
├ client.ts
├ endpoints.ts
├ errors.ts
├ schemas.ts
│
├ normalize/
│   ├ index.ts
│   ├ timestamp.ts
│   ├ traffic.ts
│   ├ requests.ts
│   ├ dns.ts
│   ├ rules.ts
│   ├ policies.ts
│   ├ modules.ts
│   └ events.ts
│
└ mock/
```

数据流程：

```text
HTTP → Raw Response → Zod / Shape Detection → Normalizer → Domain Model → React Query → UI
```

禁止：`HTTP Raw → UI`。

---

## 43. Error Model

```ts
type SurgeErrorType =
  | "network"
  | "timeout"
  | "unauthorized"
  | "unsupported"
  | "invalid-response"
  | "server-error";

class SurgeError extends Error {
  type: SurgeErrorType;
  status?: number;
  endpoint?: string;
  cause?: unknown;
}
```

---

## 44. HTTP Status Mapping

| 状态 | 含义 |
| --- | --- |
| 401 | unauthorized |
| 403 | unauthorized / forbidden |
| 404 | unsupported |
| 408 | timeout |
| 5xx | server-error |
| fetch error | network |

注意：404 对于 Surge API 很可能意味着「当前平台不支持」而不是页面故障。

---

## 45. Data State UI 统一

每个 Feature 统一 `<DataView query={...} empty={...}>...</DataView>`，减少每页重复 `if (isLoading) / if (error) / if (!data)`。

---

## 46. Mobile / iPad 优化

目标设备：Desktop / iPad Landscape / iPad Portrait / iPhone。

---

## 47. Breakpoint

| 设备 | 范围 |
| --- | --- |
| Desktop | >= 1280 |
| Tablet | 768 ~ 1279 |
| Mobile | < 768 |

---

## 48. Desktop Sidebar

保持 240~260px。

---

## 49. iPad Landscape

保持 Sidebar 220px，Main 占剩余宽度。

---

## 50. iPad Portrait / Mobile

不要一直保持左 Sidebar，改 Top Navigation + Drawer Sidebar（☰ 打开 Drawer）。

---

## 51. Mobile Dashboard

四个 KPI：Desktop 4 columns / Tablet 2 columns / Mobile 2 columns，甚至 horizontal scroll。不建议 4 个挤成极小卡片。

---

## 52. Tables Mobile Strategy

Requests / DNS / Rules 在 Mobile 不适合完整 Table：Desktop Table、Mobile List Card（如 chatgpt.com / HTTPS · Proxy / FINAL / Completed 10ms），点击打开详情。

---

## 53. iOS Safe Area

支持 `env(safe-area-inset-top/bottom/left/right)`，特别是 PWA + Landscape 模式。

---

## 54. UI Design Direction

维持当前设计方向：Apple / iOS inspired + Dark Control Panel + Minimal + Low Contrast Border + Blue Accent。避免典型后台管理系统（Ant Design 企业后台风、大量蓝色、大量 Table、大量边框）。

---

## 55. Card 风格

Dark：Background `#0D1117` / token，Card slightly brighter，Border 1px subtle，Radius 14~18px。

Light：Background `#F5F5F7`，Card rgba white，Border subtle gray。

---

## 56. Layout Width

宽屏 Dashboard 增加 `max-width: 1600px; margin: auto;`（或 Main content max 1680），而不是无限拉伸。

---

## 57. Typography

| 元素 | 规格 |
| --- | --- |
| 页面标题 | 28~32px / 700 |
| Section | 14~16px / 600 |
| Data | 24~30px / 700 |
| Body | 13~14px |
| Secondary | 12~13px |

---

## 58. Connection 页面优化

```text
● Apple TV                            Current
192.168.x.6 · Port 6171
Status: Connected · Latency: 8ms · Platform: tvOS
[Test] [Edit] [...]
```

删除操作放 `...`，不直接显示红色 Delete，降低误操作风险。

---

## 59. Connection Test

Test 需要明确区分 `Host unreachable` 与 `Authentication failed`：

```text
✓ Connected
Host: 192.168.x.6 · Latency: 8ms · Authentication: OK

⚠ Host reachable · Authentication failed
请检查 HTTP API 密码。
```

---

## 60. Connection Storage Security

密码不要 `console.log`，不进入 Query Key / URL / Error Message / Diagnostics Raw。LocalStorage 至少明确「仅保存在当前浏览器」，未来可考虑 WebCrypto。

---

## 61. Settings 页面建议

```text
Settings
General: Theme / Language / Polling / Display
Connection: Current Apple TV / API 192.168.x.6:6171 / Diagnostics
System: Version / Commit / Build / Environment
```

---

## 62. Sidebar 优化

```text
概览: 仪表盘
网络: 策略 / 请求 / 流量 / DNS / 规则
SURGE: 模块 / 脚本 / 配置 / 事件
系统: 连接 / 设置
以后可增加: 设备
```

---

## 63. Sidebar Current Connection

底部显示 `● Apple TV / 192.168.x.6:6171 / v0.2.0 · da3065f`。点击弹出 Connection Switcher。

---

## 64. Loading Skeleton

统一 KPI / Chart / List / Table Skeleton，高度接近真实内容，避免 Layout Shift。

---

## 65. Empty State 避免巨大空白

Empty Card 应该 `min-height 180~220px` 就够，不要巨大 400px Card 中央一句「无事件」。

---

## 66. Dashboard Loading

Dashboard 单独加载各 Widget：一个 API 慢不能导致整个 Dashboard 空。Events Widget 失败显示 Unavailable 即可。

---

## 67. API Polling Frequency

| API | 频率 |
| --- | --- |
| Traffic | 1s |
| Active Requests | 1s |
| Recent Requests | 2s |
| Policies | 30s |
| DNS | 5s / manual |
| Rules | manual / 60s |
| Modules | 60s |
| Scripts | 60s |
| Events | 5s |
| Profile | manual |

不要所有 API 1s polling。

---

## 68. React Query staleTime

traffic 0 / requests 0 / policies 30_000 / rules 60_000 / dns 5_000 / modules 60_000 / scripts 60_000。

---

## 69. Visibility Polling

页面 hidden 时降频（Traffic 1s→5s，Requests 1s→5s），其它停止 polling，恢复后 refetch。

---

## 70. Request Cancellation

所有 API Query 必须支持 AbortSignal；切换连接时 cancel previous request，避免 A 的响应晚于 B 的响应回来污染 UI。

---

## 71. API Request Timeout

Normal API 5000ms / Policy Test 30000ms / Connection Test 5000ms。

---

## 72. Mock API

Mock 应保留。Production = Real API，Development = Real API / Mock API。禁止 Production fallback to Mock：真实 API 失败必须显示 Error，不能自动展示 Mock 数据。

---

## 73. Mock 标识

Demo Mode 必须明显标识（如 Header 显示 `DEMO`），避免用户误以为模拟数据是真实 Surge。

---

## 74. API Capability Detection

```ts
interface SurgeCapabilities {
  traffic: boolean;
  requests: boolean;
  policyGroups: boolean;
  rules: boolean;
  dns: boolean;
  modules: boolean;
  scripts: boolean;
  events: boolean;
  profile: boolean;
}
```

Connection 成功后后台探测一次，UI 根据 capability 显示 Supported / Unsupported。

---

## 75. 不建议隐藏 Unsupported 页面

即使 tvOS 不支持 Modules，也保留菜单，页面显示「当前 Apple TV Surge 不支持模块查询 API」，比菜单突然消失更容易理解。

---

## 76. API Compatibility Matrix

以后维护 `docs/API_COMPATIBILITY.md`：

| API | macOS | iOS | tvOS |
| --- | --- | --- | --- |
| Traffic | ✓ | ✓ | ✓ |
| Requests | ✓ | ✓ | ✓ |
| Policy Groups | ✓ | ✓ | ✓ |
| DNS | ✓ | ✓ | ✓ |
| Rules | ✓ | ? | ? |
| Modules | ✓ | ? | ? |
| Scripts | ✓ | ? | ? |
| Events | ✓ | ? | ? |

通过实机逐步确认，不要凭猜测填 Supported。

---

## 77. API Debug Log

开发环境增加 API Debug，记录 time / connection / endpoint / status / latency / parser，例如：

```text
01:20:13  Apple TV  /v1/traffic          200  8ms  OK
01:20:14  Apple TV  /v1/requests/recent  200 12ms  OK
01:20:14  Apple TV  /v1/rules            200  6ms  PARSE_ERROR
```

只保留最近 100~200 条。

---

## 78. Production 日志

Production 不记录完整 response body / password / authorization，只记录 metadata。

---

## 79. Tests

至少建立：

- Unit: API Normalizer / Timestamp / Format / Query Keys
- Component: Data State
- Integration: Mock Client
- Build: Typecheck / Lint / Test / Build

---

## 80. 必须新增测试

- Timestamp: seconds / milliseconds / invalid / completed < start / zero / undefined
- Rules Normalizer: Array / {rules: []} / invalid object / null
- DNS Normalizer: dnsCache / local / missing fields / tvOS differences
- Query Keys: AppleTV-A / AppleTV-B 必须产生不同 key。

---

## 81. 本地 Verify

继续 `pnpm verify`：

```json
{
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
}
```

每次提交前必须通过。

---

## 82. Docker 部署一致性

必须处理 `GitHub Main != Running Bundle` 的问题。

---

## 83. Docker Image Tag

不要长期 `latest`，建议 `surge-lan-console:0.2.0` 或 `surge-lan-console:da3065f`。

---

## 84. Docker Label

```dockerfile
LABEL org.opencontainers.image.revision=$GIT_COMMIT
LABEL org.opencontainers.image.version=$APP_VERSION
```

---

## 85. Build Args

```dockerfile
ARG APP_VERSION
ARG GIT_COMMIT
ARG BUILD_TIME
```

构建：

```bash
docker build \
  --build-arg APP_VERSION=0.2.0 \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg BUILD_TIME=$(date -Iseconds) \
  -t surge-lan-console:$(git rev-parse --short HEAD) .
```

---

## 86. 浏览器缓存

SPA 的 `index.html` 必须 `no-cache`，assets `immutable`：

```nginx
location = /index.html {
    add_header Cache-Control "no-cache";
}
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

---

## 87. PWA / Service Worker

如果项目存在 Service Worker，必须检查是否造成 Old Bundle 继续被缓存。当前没有明确 PWA 使用需求，建议现阶段关闭 Service Worker，直到版本更新机制成熟；否则必须实现 `New Version Available [刷新]`。

---

## 88. Deployment Version Check

启动后 Frontend Build 可以请求 `/version.json`：

```json
{
  "version": "0.2.0",
  "commit": "da3065f",
  "build": "2026-08-20T01:20:00+08:00"
}
```

方便排查 Cache。

---

## 89. Security

LAN Admin Tool 仍建议保留 CSP / X-Frame-Options / Permissions-Policy / Referrer-Policy。

---

## 90. API Password

必须确保 password 不进入 URL Query / Browser History / Console Log / Error UI / Analytics，建议 Header。

---

## 91. Dangerous Operations

Flush DNS / Kill Request / Delete Connection / Profile Change / Module Toggle 需要区分风险。

---

## 92. Flush DNS

点击清除 DNS 建议确认：

> 确定清除 Apple TV 的 DNS 缓存？该操作会立即清除当前 Surge DNS Cache。  
> [取消] [清除]

---

## 93. Kill Request

可以不二次确认（影响单连接），但需要 Toast「连接已终止」。

---

## 94. Delete Connection

必须确认，并显示 `Apple TV / 192.168.x.6` 避免删错实例。

---

## 95. Config 页面

Viewer First：第一阶段查看 / 搜索 / 复制，第二阶段再考虑编辑 / 保存 / Reload。配置修改风险远高于查看。

---

## 96. Source Code Architecture

```text
src/
  api/      client / normalize / schemas / errors / mock
  components/  data-state / cards / charts / layout
  features/   dashboard / policies / requests / traffic / dns / rules /
              modules / scripts / events / connections / settings
  lib/      format / time / version
  stores/
  styles/
```

---

## 97. Shared Queries

Feature Queries 不散落：`features/shared/queries.ts` 负责 traffic / requests / events / policies；各 Feature 特有 Query 放自己目录。

---

## 98. Shared Formatters

统一 `formatBytes / formatRate / formatDuration / formatTimestamp / formatLatency`，禁止各页面自己写 ms→s、bytes→MB，否则单位规则漂移。

---

## 99. formatDuration 修正

```ts
export function formatDuration(ms?: number) {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}
```

---

## 100. Dashboard 实时 Request Count

必须明确数字含义。当前建议显示 `Active Connections`（活动连接）而不是 Requests；如果数字来自 active requests，UI 就写「活动连接」。

---

## 101. Traffic Total 定义

Dashboard 总流量推荐显示 `Session Traffic`（Surge 当前运行会话累计流量），tooltip 说明。

---

## 102. Tooltip

重要但容易误解的数据（Total Traffic / Active Connections / Policy Mode / DNS TTL）增加 Tooltip，保持 UI 简洁同时补足解释。

---

## 103. 第一阶段 P0（必须优先完成）

- Build Version / Git Commit 展示
- 确认 192.168.x.22 部署代码与 GitHub main 一致
- 修复浏览器旧 Bundle / Cache
- Dashboard Grid 高度问题
- Dashboard Policies 改摘要
- Requests 时间统一
- /v1/rules 实机 Raw Response 校准
- Rules Parser 修复
- 所有页面区分 Error / Empty / Unsupported
- 新增 API Diagnostics

---

## 104. 第二阶段 P1

- DNS local records
- DNS expiresTime 校准
- DNS timeCost
- DNS path
- Rules Query Key namespace
- DNS Query Key namespace
- Modules Query Key namespace
- Scripts Query Key namespace
- Traffic 30min Ring Buffer
- Policies 延迟展示
- iPad 响应式优化
- Tables → Mobile Cards

---

## 105. 第三阶段 P2

- Surge Capability Detection
- API Compatibility Matrix
- Profile Viewer
- Config Viewer
- Device 页面
- API Debug History
- Connection Switcher
- PWA
- Version Update Notification

---

## 106. 不应该优先开发的内容

当前暂时不要优先：漂亮动画、复杂图表、大量配置编辑、自动修改 Surge 配置、用户系统、数据库、云端账户、复杂权限。

> 当前核心：数据必须是真的、状态必须准确、页面必须能解释 API 状态、不同 Surge 实例不能串数据、部署版本必须可确认。

---

## 107. DeepSeek Harness 开发执行顺序

建议严格按下面顺序处理。

### Task 01 — Build Identity

实现 Version / Git Commit / Build Time。

验收：Settings 可以看到 Commit SHA，并且 `GitHub HEAD == 页面 Commit`。

### Task 02 — Dashboard Layout Refactor

解决 Traffic Card 巨大空白：Traffic Card 不被 Policy Card 高度撑开；Policies Dashboard 最多 8 个。

### Task 03 — Common Data State

实现 Loading / Empty / Unsupported / Error / Unauthorized 组件，替换 Rules / DNS / Modules / Scripts / Events 现有空页面。

### Task 04 — API Diagnostics

新增 `/settings/diagnostics`，列出 Endpoint / HTTP Status / Latency / Parser Status / Result Count。

### Task 05 — Rules Calibration

真实请求 `GET /v1/rules`，记录 Raw Shape，调整 Zod / Normalizer / Types / UI，直到 Rules 页面能显示 Apple TV 当前真实规则。

### Task 06 — DNS Calibration

真实请求 `GET /v1/dns`，验证 dnsCache / local / expiresTime / timeCost / path，调整 UI。

### Task 07 — Timestamp Standardization

所有 startDate / completedDate / event date / dns expires 统一时间 Normalizer。

### Task 08 — Multi Instance Completion

所有 Query Key 加 connectionId namespace。

### Task 09 — Traffic Ring Buffer

始终保存 30min，UI Filter 1 / 5 / 15 / 30。

### Task 10 — Responsive UI

重点 iPad Landscape / iPad Portrait / iPhone。

---

## 108. 完成后的 Dashboard 验收标准

Desktop 打开 Dashboard 后无需滚动即可看到 KPI、Traffic、Status、Policy Summary；向下滚动少量看到 Requests、Events。不能策略组过长造成大量空白。

---

## 109. Rules 验收标准

Requests 能看到 `RULE-SET OpenAI.list`，Rules 页面也应该能够找到对应 `OpenAI.list`。如果 API 不支持，页面必须明确显示 Unsupported，不能「没有规则」。

---

## 110. DNS 验收标准

不能再出现「所有 DNS 都已过期」，除非 Raw API 证明的确如此。必须支持 Dynamic + Local。

---

## 111. Modules 验收标准

三种情况必须区分：0 modules / Unsupported / API Error。

---

## 112. Scripts 验收标准

三种情况必须区分：0 scripts / Unsupported / API Error。

---

## 113. Events 验收标准

三种情况必须区分：0 events / Unsupported / API Error。

---

## 114. Requests 验收标准

禁止出现 negative duration / NaN / undefinedms；未知显示 `—`。

---

## 115. 多实例验收

创建 Apple TV A / B，A Proxy = Hong Kong，B Proxy = Japan。反复切换 A → B → A，不能出现 B 短暂看到 Hong Kong。

---

## 116. Deployment 验收

部署 Commit A → 页面 Commit A；部署 Commit B → 刷新浏览器 Commit B，不能仍然显示 Commit A。

---

## 117. 最终产品方向

Surge LAN Console 不复制 YASD。YASD 只用于 Surge API / Data Structures / Compatibility / Interaction Logic 参考。

```text
Surge LAN Console
A lightweight, real-time, multi-instance
Surge control center for local networks.
```

---

## 118. 下一版本建议

建议版本 `v0.2.0`，主题：Real Device Compatibility。

Release Scope：Dashboard Refactor / API Diagnostics / Rules Fix / DNS Fix / Data State / Build Identity / Multi-instance Completion / Traffic Fix。

暂不继续大量新增 Feature。

---

## 119. v0.2.0 Done Definition

全部满足才认为 v0.2.0 complete：

- Dashboard 无巨大空白
- Apple TV Rules 数据正确
- DNS 数据正确
- Requests 无负数时间
- Modules 状态明确
- Scripts 状态明确
- Events 状态明确
- API Diagnostics 可用
- Git Commit 可见
- 多实例缓存完全隔离
- 30 分钟 Traffic 正常
- iPad 横屏正常
- Light / Dark 正常
- pnpm verify 通过
- Docker Build 正常
- 新版本不会被旧 Cache 卡住

---

## 120. 最重要的开发原则

整个下一阶段始终遵循下面四条：

1. **Unknown is not Empty** — 未知返回格式 ≠ 空数据
2. **Unsupported is not Error** — tvOS 不支持 ≠ 程序出错
3. **Dashboard is Summary** — Dashboard ≠ 所有功能全部塞进去
4. **Real Data First** — 任何 UI 开发以前优先确认真实 Apple TV API Response，而不是根据 Mock / Types / Guess 进行开发

---

END
