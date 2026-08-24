# Surge LAN Console — Design System（Apple HIG 2026 / OS 27）

> 本项目参考 Apple Human Interface Guidelines 2026、iOS/iPadOS 27 与 macOS 27 的 Liquid Glass 设计语言，同时支持 Light / Dark 两套外观。
>
> 这是 **Web 对 Apple 设计语言的适配实现**，不是 Apple 原生 Liquid Glass Framework，也不要求逐像素复制 AppKit/UIKit。优先级依次是：信息层级、可读性、交互明确、响应式适配、可访问性、视觉一致性。

详见：`docs/APPLE_HIG_2026_AUDIT.md`。

---

## 1. 核心设计原则

### 1.1 内容优先

Surge LAN Console 是高信息密度的网络管理工具。视觉设计必须帮助用户快速判断状态、定位异常和执行操作，不能让装饰效果压过数据本身。

### 1.2 Liquid Glass 只作为功能层

Liquid Glass 主要用于**导航、控制、浮动层**，而不是把整个内容区域全部玻璃化；明确避免 `glass on glass`。

- 日志、表格、流量图、请求详情、DNS 结果等数据内容 → 稳定、清晰的 Content Material。
- Sidebar、Toolbar、Dropdown、Popover、Dialog、Drawer、Connection Switcher、Segmented Control → Liquid Glass。
- Dashboard 不通过增加 Blur / Gradient / Shadow 制造层级；优先通过布局、留白、Typography 和 Section 分组建立层级。

### 1.3 Web 适配优先

Apple 原生组件是尺寸和层级参考，不应为了“像原生”牺牲 Web Console 的效率。

- Mouse / Trackpad：允许紧凑信息密度。
- Coarse Pointer / Touch：交互区域按 44×44px 基线适配。
- Mobile：重新排版，而不是把 Desktop 页面整体缩小。

---

## 2. 三个视觉层

### Layer 1 — Background

Light：

```css
--background: #F4F7FC;
```

配合极轻的 Blue / Lavender / White 环境光，不使用高饱和渐变做主背景。

Dark：

```css
--background: #070A0F;
```

环境光：Deep Blue / Indigo / Black。

### Layer 2 — Content Material

用于：Traffic、Requests、Events、DNS、Policies、Tables、Charts、Metrics。

**不要强 Glass。**

Light：

```css
background: rgba(255,255,255,.78);
border: 1px solid rgba(15,23,42,.07);
```

Dark：

```css
background: rgba(18,22,30,.82);
border: 1px solid rgba(255,255,255,.07);
```

长时间查看日志和请求时，稳定表面比更强的透明效果重要。

### Layer 3 — Liquid Glass

只用于：Sidebar、Top Toolbar、Floating Action、Dropdown、Popover、Dialog、Drawer、Connection Switcher、Segmented Control、Context Menu。

```css
.glass {
  background: var(--glass);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid var(--glass-border);
  box-shadow: var(--shadow-glass);
}
```

Web 版不继续叠加更强 Blur。OS 27 的视觉更新主要作为边缘、层级、动态感参考，而不是通过继续增加透明度模拟。

---

## 3. Light / Dark

### Light

| Token | 值 |
| --- | --- |
| Background | `#F4F7FC` |
| 主体 | White / Ice Blue |
| Glass | `rgba(255,255,255,0.45~0.70)` |
| Text Primary | `#111827` |
| Text Secondary | `#667085` |
| Text Tertiary | `#98A2B3` |
| Accent | `#0A84FF` |

### Dark

Dark 不是 `filter: invert()`，必须使用完整语义主题。

| Token | 值 |
| --- | --- |
| Background | `#070A0F` |
| Surface | `#10141C` |
| Elevated | `#151A24` |
| Glass | `rgba(20,24,32,.55)` |
| Text Primary | `#F5F7FA` |
| Text Secondary | `#A8B0BD` |
| Text Tertiary | `#747D8B` |
| Accent | `#0A84FF` |

所有业务组件只引用语义 Token，禁止业务代码新增类似 `bg-[#ffffff]` 的主题硬编码。

---

## 4. Typography

Web 不打包 Apple 字体文件，使用系统字体栈：

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

数字：

```css
font-variant-numeric: tabular-nums;
```

代码 / IP：

```css
font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

### 页面字号

| 角色 | 规格 |
| --- | --- |
| Page Title | 26 / 600 |
| Section Title | 17 / 600 |
| Card Title | 14 / 600 |
| Metric | 28 / 600 |
| Body | 14 / 400 |
| Table | 13 / 400 |
| Metadata | 12 / 400 |
| Code | 12 / Mono |
| Protocol / Micro Label | 11–12 / 600 |

规则：

- 新增业务 UI 默认不得使用 10px 字号。
- 11px 仅允许非常短的辅助标签；正文、状态说明、连接信息优先 12–14px。
- 不使用 Light 字重承载关键内容。
- 信息层级主要依靠字号、字重、颜色和留白，不依靠多种字体。

---

## 5. 圆角与间距

### Radius

| Token | 值 |
| --- | --- |
| XS | 8px |
| SM | 10px |
| MD | 14px |
| LG | 18px |
| XL | 22px |
| Glass | 24px |
| Pill | 9999px |

### Spacing

只允许：`4 8 12 16 20 24 32 40 48`

```text
主页面       24px
Card Gap     16px
Card Padding 16 / 20px
```

避免为了“高级感”无规律增加大留白；这是运维控制台，不是营销页面。

---

## 6. Icon

- 开发：Lucide。
- 视觉：SF Symbols 风格（Stroke、简单、单色）。
- 尺寸：16 / 18 / 20px。
- 禁止 Emoji 作为功能图标。
- 禁止同时混用多套彩色图标库。
- 技术协议 `HTTP / HTTPS / TCP / UDP / QUIC / DNS` 使用文字 Badge，不用图片代替。
- 协议颜色只是辅助识别，文字本身必须始终存在。

---

## 7. Sidebar / Toolbar

Sidebar：

- 展开：236px。
- 收起：72px。
- 使用 Liquid Glass。
- Section label 最低 12px。
- 收起/展开按钮在 Touch 场景必须具有至少 44×44px Hit Area。

Toolbar：

- 保持导航与控制层属性，可使用 Glass。
- 不把主要业务数据放进 Toolbar。
- 首要操作使用清晰文字或熟悉图标，不依赖悬停提示才能理解。

---

## 8. Controls / Touch Target

Desktop 可保持紧凑控件：

```text
Small Button  32px
Medium Button 36px
Large Button  40px
```

但在：

```css
@media (hover: none) and (pointer: coarse)
```

交互控件的实际 Hit Area 应至少达到 **44×44px**，包括：

- Button / Icon Button
- Mobile Bottom Navigation
- Sidebar collapse / expand
- Segmented Control
- 高频点击的筛选、排序、开关

通过 `.touch-target` 等统一 Utility 完成，不要求 Desktop 视觉尺寸跟随变大。

---

## 9. Accessibility

必须支持：

```css
@media (prefers-reduced-motion: reduce) { ... }
@media (prefers-reduced-transparency: reduce) { ... }
@media (prefers-contrast: more) { ... }
@media (forced-colors: active) { ... }
```

规则：

1. Reduced Motion：禁用非必要动画和长过渡。
2. Reduced Transparency：Glass 改为不透明 Content Surface，关闭 Backdrop Blur。
3. Increased Contrast：提高边界和弱文字可辨识度。
4. Forced Colors：允许系统高对比主题接管颜色。
5. 所有键盘可操作控件必须保留 `focus-visible` 状态。
6. 颜色不能作为状态的唯一表达方式。

---

## 10. Responsive

目标：Desktop First。

### Desktop

- 2560×1440
- 1920×1080
- 1440×900
- 1366×768

保持高信息密度和可排序表格。

### Tablet

- Sidebar → Icon Sidebar。
- 重要控制保持足够 Hit Area。
- 不因为空间减少而缩小正文到不可读字号。

### Mobile

- Sidebar → Bottom Navigation。
- Table → Cards / List。
- Drawer → Full Screen Sheet。
- 保持 Safe Area。
- 页面不得依赖整体横向滚动完成主要任务。

其中 `Table → Cards` 是强制规则：移动端不能只使用 `min-width + overflow-x-auto` 作为主要解决方案。

---

## 11. Dashboard Information Hierarchy

Dashboard 优化采用“做减法”策略：

1. 减少同权重、同边框、同圆角的大量 Card。
2. Traffic / Policy / Health 应形成明确主次。
3. 次要状态优先放入 Section 内部，而不是继续新增独立 Card。
4. 关键异常通过语义状态、文案和位置提升，不通过增加阴影或高饱和色提升。
5. 同一屏内避免超过两级强视觉容器嵌套。

---

## 12. Language

可见产品文案以中文为主，技术协议和行业标准缩写保留原文。

保留：

```text
HTTP HTTPS TCP UDP QUIC DNS
API
MitM
IP
```

统一：

```text
Dashboard   → 概览
Requests    → 请求
Pause       → 暂停
Uptime      → 运行时间
Version     → 版本
```

如 API 原始字段、原始日志或 Surge 官方名称必须保持英文，不强制翻译。

---

## 13. Motion

统一曲线：

```css
cubic-bezier(.2,.8,.2,1)
```

```text
Hover       120ms
Button      160ms
Popover     180ms
Drawer      240ms
Page        200ms
```

禁止：大幅 Bounce、复杂 3D、持续漂浮、闪光。

---

## 14. Validation Matrix

每次 Design / Layout 相关 PR 至少检查：

- 2560×1440
- 1920×1080
- 1440×900
- 1366×768
- 768px Tablet
- 430px Mobile
- 390px Mobile
- Light
- Dark
- Keyboard navigation
- Coarse pointer / Touch
- Reduced Motion
- Reduced Transparency / Increased Contrast
- 无意外页面横向溢出

设计调整以 `docs/APPLE_HIG_2026_AUDIT.md` 为当前审阅基线。
