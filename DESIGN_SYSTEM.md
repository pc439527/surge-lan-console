# Surge LAN Console — Design System（iOS 26 / Liquid Glass）

> 本项目视觉采用 Apple iOS 26 / macOS 26 的 Liquid Glass 设计语言，同时支持 Light / Dark 两套外观。
> 注意：这是 **Web 对 Liquid Glass 视觉语言的实现近似**，不是 Apple 原生 Liquid Glass Framework。

---

## 1. 核心设计原则

Liquid Glass 是跨平台统一的动态材质，应主要用于**导航、控制、浮动层**，**而不是把整个内容区域全部玻璃化**；同时明确避免 `glass on glass`。

- 日志、表格、流量图等数据内容 → 保持稳定、清晰的标准 Material。
- Sidebar、Toolbar、弹窗、浮动控制器 → 使用玻璃层。

## 2. 三个视觉层

### Layer 1 — Background（页面背景）

Light：

```css
--background: #F5F7FB;
```

配合极轻的 Blue / Lavender / White 环境光。

Dark：

```css
--background: #080B11;
```

环境光：Deep Blue / Indigo / Black。

### Layer 2 — Content Material（内容层）

用于：Traffic、Requests、Events、DNS、Policies、Tables、Charts、Metrics。**不要强 Glass。**

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

这样长时间看日志不会累。

### Layer 3 — Liquid Glass（导航与控制层）

只用于：Sidebar、Top Toolbar、Floating Action、Dropdown、Popover、Dialog、Drawer、Connection Switcher、Segmented Control、Context Menu。

Light：

```css
.glass {
  background: rgba(255, 255, 255, 0.48);

  backdrop-filter:
    blur(28px)
    saturate(180%);

  -webkit-backdrop-filter:
    blur(28px)
    saturate(180%);

  border:
    1px solid rgba(255,255,255,.52);

  box-shadow:
    0 8px 32px rgba(30,60,120,.10);
}
```

Dark：

```css
.dark .glass {
  background: rgba(20,24,32,.58);

  border:
    1px solid rgba(255,255,255,.10);

  box-shadow:
    0 10px 36px rgba(0,0,0,.28);
}
```

---

## 3. Light Mode

| Token | 值 |
| --- | --- |
| Background | `#F4F7FC` |
| 主体 | White / Ice Blue |
| 玻璃 | `rgba(255,255,255,0.45~0.70)` |
| Text Primary | `#111827` |
| Text Secondary | `#667085` |
| Text Tertiary | `#98A2B3` |
| Accent | `#0A84FF`（Apple Blue） |

整体：柔和、通透、低对比边框、没有重阴影、少量蓝紫色环境光。

## 4. Dark Mode

> Dark 不是 `filter: invert()`，是重新设计。

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

Light/Dark 是完整语义主题，不是逐组件写死颜色。

## 5. Theme 设计

```text
Appearance

● System
○ Light
○ Dark
```

实现：`<html data-theme="light">` 或 `<html class="dark">`。

所有颜色只能引用：

```css
var(--background)
var(--surface)
var(--glass)
var(--text-primary)
var(--border)
var(--accent)
```

**禁止**在业务代码中写 `bg-[#ffffff]` 之类的硬编码颜色。

---

## 6. 圆角体系

| Token | 值 |
| --- | --- |
| XS | 8px |
| SM | 10px |
| MD | 14px |
| LG | 18px |
| XL | 22px |
| Glass | 24px |
| Pill | 9999px |

应用：

```text
Dashboard Card   16–18px
Sidebar          22–24px
Modal            22px
Button           10–12px
```

## 7. 间距体系

只允许：`4 8 12 16 20 24 32 40 48`

```text
主页面      24px
Card Gap    16px
Card Padding 16 / 20px
```

## 8. 字体

Web 不强制打包 Apple 字体文件：

```css
font-family:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

数字：

```css
font-variant-numeric: tabular-nums;
```

代码 / IP：

```css
font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

减少花式 Typography，把信息密度和扫描效率放在第一位。

## 9. 页面字号

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

## 10. Icon 规范

- 开发：Lucide
- 视觉：SF Symbols 风格（Stroke、简单、单色）
- 尺寸：16 / 18 / 20 px
- 禁止：emoji icon、彩色 SVG 一大堆、不同图标库混用

## 11. Sidebar 规格

- 展开：**236px**；收起：**72px**
- 使用 Liquid Glass

```text
Surge LAN Console

OVERVIEW
  Dashboard

NETWORK
  Policies
  Requests
  Traffic
  DNS
  Rules

SURGE
  Modules
  Scripts
  Configuration
  Events

SYSTEM
  Connections
  Settings

──────────────

Current Connection
● Apple TV
192.168.50.10
```

---

## 12. 动画

统一曲线：`cubic-bezier(.2,.8,.2,1)`

```text
Hover       120ms
Button      160ms
Popover     180ms
Drawer      240ms
Page        200ms
```

禁止：大幅 Bounce、复杂 3D、持续漂浮、闪光。

支持：

```css
@media (prefers-reduced-motion: reduce) { ... }
```

## 13. Responsive

- 目标：**Desktop First**（2560×1440 / 1920×1080 / 1440×900 / 1366×768）
- Tablet：Sidebar → Icon Sidebar
- Mobile：Sidebar → Bottom Navigation；Table → Cards；Drawer → Full Screen Sheet
