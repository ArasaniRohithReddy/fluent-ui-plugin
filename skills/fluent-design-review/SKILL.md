---
name: fluent-design-review
description: Audit an existing UI against Fluent 2 — token usage, theming, component correctness, type/spacing/radius/elevation, accessibility, content, and per-surface rules (web, Power BI, Power Apps/Pages, PCF). Use to review, critique, or verify Fluent 2 compliance and get concrete fixes.
---

# Fluent 2 design review

Use this checklist to audit any UI against **Fluent 2** and report prioritized, high-confidence fixes. Review and recommend — don't silently rewrite. Verify claims with the `fluent-ui` MCP tools (`fluent_get_token`, `fluent_get_component`, `fluent_accessibility_checklist`).

## Checklist
**1. Tokens (no magic values).** Flag raw hex/px that duplicate a token → give the correct `tokens.*` / CSS variable (e.g. `#242424` → `colorNeutralForeground1`; `4px` radius → `borderRadiusMedium`; `12px` gap → `spacingHorizontalM`). Confirm with `fluent_get_token`.

**2. Theming.** App wrapped in a real theme (web: `FluentProvider` + `webLightTheme`/`webDarkTheme` or a brand theme)? **Light + dark + high-contrast** all supported? Single provider, no ad-hoc color overrides?

**3. Components.** Correct Fluent component for the job (vs. a custom re-implementation)? Uses slots/states/appearances properly? Cross-check with `fluent_get_component`.

**4. Type & rhythm.** Type ramp (Segoe UI, correct sizes/weights), spacing scale, corner-radius scale, and elevation/shadow all match Fluent 2 — not arbitrary values.

**5. Accessibility.** Names/roles, focus order + visible focus, keyboard, 4.5:1 contrast, 24px targets, high contrast, reduced motion. Run `fluent_accessibility_checklist` and the `fluent-accessibility` skill.

**6. Content.** Sentence-case labels, concise action verbs, consistent terminology (per Fluent content design).

**7. Per-surface.**
- *Web:* Griffel `makeStyles` + `tokens`, no inline hardcoded styles.
- *Power BI:* theme JSON is schema-valid; `visualStyles` defaults consistent with Fluent shape/elevation.
- *Power Apps:* modern controls + `App.Theme` (not classic-with-fake-theme).
- *PCF:* `FluentProvider` with `context.fluentDesignLanguage.tokenTheme`; portaled surfaces re-wrapped.
- *Power Pages:* Fluent tokens as CSS variables mapped onto Bootstrap.

## Output format
Group findings by severity:
- **Blocker** — breaks Fluent compliance or accessibility.
- **Should-fix** — clear deviation with an easy correct fix.
- **Polish** — refinement.

For each: *what* the issue is, *why* it deviates (cite the token/guideline), and the *exact fix*. End with a one-line summary and offer to implement via the relevant builder agent (`fluent-web-engineer`, `fluent-powerbi-designer`, `fluent-power-platform-engineer`).

## Learn more
| Topic | How to find |
|---|---|
| Design language | `https://fluent2.microsoft.design/design-principles` |
| Design tokens | `https://fluent2.microsoft.design/design-tokens` |
| Component usage | MCP `fluent_get_component` · `https://fluent2.microsoft.design/components/web/react/` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
