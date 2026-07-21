---
name: fluent-accessibility
description: Make Fluent 2 UIs accessible (WCAG 2.1 AA) — contrast, focus, keyboard, target size, names/roles, high contrast, and reduced motion. Use when building or reviewing any Fluent 2 surface (web, Power BI, Power Apps/Pages, PCF) for accessibility.
---

# Fluent 2 accessibility

Fluent 2 components are accessible **by default**, but only if you use them correctly and don't override their semantics. Target **WCAG 2.1 AA**.

## The essentials
- **Contrast:** text ≥ **4.5:1** (large/bold text ≥ 3:1); non-text/UI (icons, borders, states) ≥ **3:1**. Never convey meaning by color alone — pair with text/icon/shape. Verify colors with `fluent_get_token` and a contrast check.
- **Focus:** every interactive control must show Fluent's focus indicator. Don't remove `:focus-visible`. Preserve a logical **focus order** and manage focus for dialogs/menus/Copilot messages (trap + restore).
- **Keyboard:** everything operable with keyboard alone (Tab/Shift+Tab, Enter/Space, arrow keys within composites like `Menu`, `TabList`, `RadioGroup`). No keyboard traps (except intended modal focus).
- **Names & roles:** label every control — use `Label`/`Field` (web), `aria-label`/`aria-labelledby` where needed, and icon-only buttons need an accessible name. Prefer real Fluent components over custom markup so roles come for free.
- **Target size:** interactive targets ≥ **24×24 px** (prefer 32–40 px touch).
- **High contrast:** support Windows High Contrast / forced-colors — Fluent tokens adapt; don't hardcode colors that break it.
- **Motion:** honor `prefers-reduced-motion`; keep motion functional, use Fluent duration/easing tokens.
- **Text:** support zoom/reflow to 200%; don't disable resizing.

## Do it with Fluent
- Wrap web apps in `FluentProvider` (drives themed, accessible tokens incl. high contrast) and set `dir` for RTL.
- Use `Field` to wire label + validation message + `aria-describedby` automatically.
- Use the `fluent_accessibility_checklist` MCP tool to self-review before shipping.

## Test
- Automated: axe / **Accessibility Insights for Web** (FastPass).
- Manual: keyboard-only pass; screen reader (Narrator/NVDA/VoiceOver); 200% zoom; Windows High Contrast; color-blind check.

## Learn more
| Topic | How to find |
|---|---|
| Fluent 2 accessibility guidance | `https://fluent2.microsoft.design/accessibility` |
| WCAG 2.1 AA | `microsoft_docs_search(query="accessibility WCAG 2.1 AA requirements")` |
| Accessibility Insights | `microsoft_docs_search(query="Accessibility Insights for Web FastPass")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
