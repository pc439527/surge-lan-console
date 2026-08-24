# Surge LAN Console — Apple HIG 2026 Audit

> Baseline: Apple Human Interface Guidelines (2026), iOS/iPadOS 27 and macOS 27 design resources.
>
> This project is a web console. The goal is **Apple-like hierarchy, readability, adaptability and accessibility**, not a pixel-for-pixel copy of native AppKit/UIKit controls.

## Current assessment

| Area | Assessment |
| --- | --- |
| Overall direction | Good |
| Liquid Glass layering | Good |
| Light / Dark semantic tokens | Good |
| Typography | Needs improvement |
| Touch targets | Needs improvement |
| Mobile reflow | Needs improvement |
| Accessibility fallbacks | Needs improvement |
| Information hierarchy | Needs improvement |

## Principles to keep

1. Liquid Glass is reserved for navigation, controls and floating layers.
2. Data-heavy content such as tables, logs, charts and metrics stays on stable content surfaces.
3. Light/Dark use semantic tokens; business components must not hardcode theme colors.
4. Protocol names such as HTTP/HTTPS/TCP/UDP/QUIC/DNS remain text labels; color is supplementary, not the only semantic carrier.
5. Desktop remains information-dense, while touch devices receive larger hit regions without forcing desktop controls to become oversized.

## P0 implementation rules

### Typography

- Page title: 26px / 600
- Section title: 17px / 600
- Card title: 14px / 600
- Body: 14px / 400
- Table: 13px / 400
- Metadata: 12px / 400
- Protocol/status micro labels: prefer 11–12px
- Avoid new 10px business UI text.

### Touch targets

On coarse-pointer devices, interactive targets should provide at least a 44×44px hit region where practical.

Apply this to:

- buttons and icon buttons
- mobile bottom navigation
- sidebar collapse/expand controls
- compact segmented controls and other frequently tapped controls

Desktop pointer layouts may keep compact visual dimensions.

### Responsive reflow

- Desktop: dense sortable tables are allowed.
- Mobile (< 768px): important tables must reflow into cards/lists rather than depend on horizontal scrolling.
- Drawers should become full-screen sheets where appropriate.
- Safe-area insets must remain respected.

### Accessibility

Support, at minimum:

- `prefers-reduced-motion`
- `prefers-reduced-transparency`
- `prefers-contrast: more`
- `forced-colors: active`
- keyboard focus-visible states

When transparency is reduced, `.glass` must fall back to an opaque/elevated surface instead of retaining blur-only styling.

## P1 information hierarchy

Dashboard changes should be subtractive:

- reduce equal-weight card containers
- group related data into sections
- make Traffic / Policy / Health hierarchy obvious
- avoid adding more blur, gradients or shadows as a substitute for hierarchy

## Language

Visible product UI should primarily use Chinese. Preserve standard technical acronyms and protocol names, including:

- HTTP / HTTPS / TCP / UDP / QUIC / DNS
- API
- MitM
- IP

Avoid mixed product labels such as `Dashboard`, `Requests`, `Pause`, `Uptime` when a stable Chinese label already exists.

## Validation matrix

Before merging design changes, verify:

- 2560×1440
- 1920×1080
- 1440×900
- 1366×768
- 768px tablet width
- 430px mobile width
- 390px mobile width
- Light mode
- Dark mode
- keyboard navigation
- coarse pointer / touch
- reduced motion
- reduced transparency / increased contrast
- no unexpected horizontal page overflow

## Figma reference

Audit/reference file:

https://www.figma.com/design/twnB2GtNKWNNYG2Lv0HhFg

Use the Apple macOS 27 / iOS 27 official UI kits as dimensional and hierarchy references. Do not introduce native-only patterns that reduce usability in a desktop web console.
