# Surge LAN Console

> 运行于局域网浏览器中的 Surge Web 管理控制台，通过 Surge HTTP API 管理 Apple TV / iPhone / Mac 等 Surge 实例。

**Apple 风格的专业网络管理工具。** 功能参考 Surge Web Dashboard / YASD，视觉重新设计，采用 Apple iOS 26 / macOS 26 的 Liquid Glass 设计语言，支持 Light / Dark 两套外观。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| `PROJECT_SPEC.md` | 项目需求与功能规格 |
| `DESIGN_SYSTEM.md` | iOS 26 / Liquid Glass 设计规范 |
| `AGENTS.md` | DeepSeek Harness 开发约束与硬性规则 |
| `ROADMAP.md` | Phase 01–10 开发路线与验收标准 |
| `OPTIMIZATION_PLAN.md` | v0.2.0 实机兼容改造方案（Task 01–10，从 P0 开始顺序执行） |

## 快速开始

### 本地开发

```bash
pnpm install
pnpm dev
```

### 验证（typecheck + lint + test + build）

```bash
pnpm verify
```

### Docker 部署

支持两种方式：

**方式一：docker compose（推荐）**

```bash
docker compose up -d --build
# → http://<host>:8080
```

**方式二：docker run**

```bash
docker build -t surge-lan-console:0.1.0 .
docker run -d --name surge-console -p 8080:80 surge-lan-console:0.1.0
```

容器内为 Nginx 静态托管（SPA fallback + PWA + gzip + 安全头）。浏览器直连 Surge HTTP API（与 YASD 相同架构），无需后端服务。

> 连接 Apple TV / iPhone 时若遇到 CORS 拦截，确认 Surge 的 HTTP API 已启用且设备与浏览器同网段；必要时可在宿主机 Nginx 上加一层 `/v1/` 反向代理。

### HTTPS 访问（v0.2.2 反向代理模式）

控制台若通过 HTTPS（如 Tailscale 域名）打开，而 Surge API 是纯 HTTP，浏览器会拦截混合内容请求，连接测试将永远失败——**设备本身是好的**。解决方式：

1. 在连接表单中勾选 **「通过控制台反向代理访问」**；
2. 浏览器将请求发往控制台同源 `/v1/`，由 `nginx.conf` 中的 `location /v1/` 转发到 Surge 设备；
3. 代理目标地址在 `nginx.conf` 中配置（默认 `192.168.50.10:6171`），如设备变化请同步修改并重新部署。

局域网内直接使用 `http://<host>:8080` 访问时无需开启。

## 技术栈

| 项目 | 技术 |
| --- | --- |
| Framework | React 19 |
| Language | TypeScript |
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
| Schema | Zod（API 响应 runtime 校验，见 `src/api/schemas.ts`） |
| Test | Vitest |
| E2E | Playwright（规划中，未启用） |

## 设计来源

### Design References — Apple

- Apple Human Interface Guidelines
- Apple Design Resources
- iOS & iPadOS 26 Design Kit
- WWDC25 — Meet Liquid Glass
- HIG — Materials
- HIG — Layout
- HIG — Sidebar
- HIG — Color
- HIG — Dark Mode
- HIG — Typography
- HIG — Lists and Tables

> Apple 官方把 Liquid Glass 描述为跨 Apple 平台的统一动态材质，同时强调导航层与内容层的区分，以及可读性、适应性和 Reduced Transparency / Reduced Motion 等辅助功能。

### Technical References — Surge

- Surge HTTP API（本项目的功能基线）
- Surge Manual
- Surge Scripting API

### Technical References — YASD / Surge Web Dashboard

- **仅参考**其 Surge API 调用、连接方式、数据模型和浏览器端实现思路。
- **不参考**其 UI 作为项目设计标准。

## License

TBD