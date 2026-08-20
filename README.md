# Surge LAN Console

> 面向局域网的 Surge Web 管理控制台。它直接通过 **Surge HTTP API** 管理 iOS、tvOS 与 macOS 上的 Surge 实例，无需额外的业务后端。

Surge LAN Console 是一个基于 React 的单页应用，提供仪表盘、设备总览、策略与请求管理、流量和 DNS 观察、配置与脚本入口、事件日志及 API 诊断。界面采用 Liquid Glass 风格，支持浅色、深色和跟随系统外观，并针对手机触控视口提供独立的单列/卡片式布局。

| 项目 | 当前实现 |
| --- | --- |
| 运行模型 | 浏览器直接调用 Surge HTTP API；容器只负责静态文件与可选的固定上游反向代理 |
| 支持平台 | Surge iOS、tvOS、macOS；按端点探测可用能力，可手动覆盖平台判定 |
| 浏览器体验 | PWA、浅色/深色/系统外观、桌面侧边栏、移动端抽屉与底部导航 |
| 质量门禁 | `pnpm verify` 依次执行类型检查、ESLint、Vitest 与生产构建 |

## 功能概览

| 模块 | 说明 |
| --- | --- |
| Dashboard | 查看实时上传/下载速率、活动连接、API 延迟、策略组、近期请求和事件。 |
| Fleet Console | 汇总已保存设备的在线状态、流量、活动请求与 API Key 状态，并可切换活动设备。 |
| Connections | 维护多个 Surge 实例的名称、协议、主机、端口、平台覆盖和 API Key。 |
| Policies | 浏览策略组、切换策略、执行测速，并展示策略选择结果。 |
| Requests | 搜索、筛选和暂停近期请求流；手机端使用卡片列表，桌面端使用表格。 |
| Traffic / DNS | 观察实时流量与 DNS 缓存，支持 DNS 延迟测试和刷新缓存。 |
| Rules / Modules / Scripts | 按 API 能力展示规则、模块和脚本功能；不支持的端点会标记为不可用。 |
| Configuration | 只读查看当前配置，并默认以 `sensitive=0` 请求以避免主动读取敏感配置内容。 |
| Events | 按级别筛选、搜索和浏览系统信息、警告与错误事件。 |
| Settings / API Diagnostics | 切换外观和演示模式；逐端点检查状态、延迟、解析结果与脱敏后的响应结构。 |

> **移动端适配：** 首页在手机上按单列内容区组织主要面板，指标卡在常见手机宽度下采用两列；设备管理、事件日志和请求日志均在 390px 与 320px 触控视口下验证过无横向溢出。窄屏设备卡的状态徽标保持单行，避免折行影响扫读。

## 快速开始

### 前置条件

本地开发建议使用 **Node.js 22**、Corepack 和 pnpm。部署容器需要 Docker Engine；使用 Compose 部署时还需要 Docker Compose v2。

```bash
corepack enable
pnpm install
pnpm dev
```

开发服务器启动后，打开终端输出的本地地址。首次使用可进入 **Connections** 添加 Surge 实例，也可在 **Settings** 启用演示模式预览界面。

### 质量验证

```bash
pnpm verify
```

该命令会顺序执行以下检查：

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 静态检查 |
| `pnpm test` | Vitest 单元与组件测试 |
| `pnpm build` | 生产构建与 PWA 产物生成 |

## 连接 Surge 实例

在 **Connections** 页面填写连接名称、协议、主机、端口和 Surge HTTP API Key。连接信息保存在当前浏览器中；API Key 默认仅保留在 `sessionStorage`，关闭标签页后会消失。只有开启“Remember API Key”时，Key 才会保存到 `localStorage`。

| 模式 | 适用情形 | 注意事项 |
| --- | --- | --- |
| 浏览器直连 | 控制台和 Surge 位于同一局域网，且控制台通过 HTTP 访问 | 推荐用于多设备管理。浏览器必须能直接访问目标 Surge HTTP API。 |
| 控制台反向代理 | 控制台经 HTTPS 打开、目标 Surge API 仅提供 HTTP，导致浏览器拦截混合内容 | 当前 Nginx 配置是**单一固定上游**，仅适合一个明确配置的设备。 |

> **重要：反向代理是部署级配置，不是动态设备路由。** `nginx.conf` 中的 `/v1/` 会固定转发到 `proxy_pass` 指定的 Surge 地址。若在多个连接上同时开启“通过控制台反向代理访问”，这些请求仍会落到同一个上游。多设备场景请优先使用浏览器直连，或为每台设备部署独立控制台/受控代理映射。

如果浏览器直连失败，请确认 Surge 已启用 HTTP API、设备与浏览器网络可达、端口正确，并检查目标平台的 CORS 与 HTTPS 策略。401/403 通常表示 API Key 无效；404/405 则可能意味着当前 Surge 平台或版本没有开放对应接口。

## Docker 部署

镜像采用双阶段构建：Node 22 构建前端，Nginx 托管静态产物。容器监听 80 端口，默认映射到宿主机 8080。

### Docker Compose

在部署前，请先检查 `docker-compose.yml` 和 `nginx.conf`：若需要固定上游代理，必须把 `location /v1/` 内的 `proxy_pass` 与 `Host` 改为目标 Surge 的地址和端口。

```bash
docker compose up -d --build
# 打开：http://<宿主机地址>:8080
```

查看服务状态和日志：

```bash
docker compose ps
docker compose logs -f surge-console
```

### Docker CLI

```bash
docker build \
  --build-arg APP_VERSION=$(git describe --always --dirty) \
  --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
  --build-arg GIT_BRANCH=$(git branch --show-current) \
  --build-arg BUILD_TIME=$(date -Iseconds) \
  -t surge-lan-console:local .

docker run -d \
  --name surge-console \
  --restart unless-stopped \
  --security-opt no-new-privileges:true \
  -p 8080:80 \
  surge-lan-console:local
```

> 该项目面向受信任的局域网或受控 VPN。不要在没有额外身份认证、访问控制和 TLS 终止层的情况下，将控制台直接暴露到公共互联网。

## 项目结构

```text
src/
├── api/             # Surge API 客户端、端点、错误分类、能力探测和响应规范化
├── app/             # 路由、应用根组件和 Surge 客户端上下文
├── components/      # 布局、数据状态和基础 UI 组件
├── features/        # Dashboard、Fleet、连接、策略、请求、流量、DNS、日志等业务模块
├── stores/          # 连接、API Key 和用户偏好状态
├── styles/          # 设计令牌、玻璃效果和全局响应式规则
└── test/            # 测试初始化和端到端质量断言
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| Framework | React 19、TypeScript、Vite |
| 样式与 UI | Tailwind CSS 4、Radix UI、Lucide React、Liquid Glass 设计令牌 |
| 状态与数据 | Zustand、TanStack Query、Axios、Zod |
| 数据展示 | ECharts、TanStack Table、CodeMirror 6 |
| 路由与 PWA | React Router、`vite-plugin-pwa` |
| 测试 | Vitest、Testing Library、jsdom |
| 容器 | Node 22 Alpine 构建 + Nginx Alpine 静态托管 |

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [PROJECT_SPEC.md](./PROJECT_SPEC.md) | 需求与功能规格。 |
| [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) | Liquid Glass 视觉与交互规范。 |
| [ROADMAP.md](./ROADMAP.md) | 阶段路线与验收标准。 |
| [docs/OPTIMIZATION_PLAN.md](./docs/OPTIMIZATION_PLAN.md) | 兼容性、诊断和实机优化记录。 |
| [AGENTS.md](./AGENTS.md) | 项目开发约束与质量要求。 |

## 设计与参考

项目的交互与可访问性目标参考 Apple Human Interface Guidelines、Apple Design Resources 以及 Surge HTTP API / Surge Manual。YASD 与 Surge Web Dashboard 仅作为 API 调用方式、连接模型和数据结构的参考，不作为界面设计标准。

## License

TBD
