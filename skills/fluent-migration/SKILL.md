---
name: fluent-migration
description: Adopt or migrate an EXISTING app/report to Fluent 2 — Fluent UI v8 to v9 (shims, side-by-side, component mapping), from another design system (MUI/Chakra/Ant Design/Bootstrap), replacing hardcoded values with tokens, and per-surface adoption (Power BI, Power Apps, Power Pages, PCF). Use whenever someone already has UI and wants to move it to Fluent 2.
---

# Adopting / migrating to Fluent 2

Fluent 2 isn't only for greenfield UIs — this skill guides moving an **existing** app or report onto Fluent 2 incrementally. Call the `fluent_migration_guidance` MCP tool for structured, per-scenario steps, and **audit first** with the `fluent-design-review` skill.

## 1. Fluent UI React v8 → v9 (the big one)
v9 (`@fluentui/react-components`) is the code implementation of Fluent 2; v8 is `@fluentui/react` (legacy). Migrate **incrementally, side-by-side** — prefer full v9 for new code; use shims only to avoid a big-bang rewrite.
- **Packages:** `@fluentui/react-components` (v9); `@fluentui/react-migration-v8-v9` (shim components — v8 props, render v9 underneath); `@fluentui/react-portal-compat` (`PortalCompatProvider` so v9 overlays are themed inside a v8 tree).
- **Theme bridge:** `createV8Theme(brandVariants, v9Theme)` (from the migration package) runs v8 under a v9-derived theme; or generate a v9 brand theme from your brand color with `fluent_generate_theme` and wrap new UI in `FluentProvider`.
- **Component mapping (subset):** `DefaultButton/PrimaryButton/IconButton → Button`; `TextField → Input/Textarea in Field`; `Toggle → Switch`; `Dropdown → Dropdown/Combobox`; `Panel → Drawer`; `Callout → Popover`; `ContextualMenu → Menu`; `DetailsList → DataGrid/Table`; `Pivot → TabList`; `Persona/Facepile → Persona/Avatar/AvatarGroup`; `Spinner/ProgressIndicator/Shimmer → Spinner/ProgressBar/Skeleton`; **`Stack → flex + spacing tokens` (no Stack in v9).** Full table via `fluent_migration_guidance scenario=v8-to-v9`.
- **Gotchas:** shims increase bundle size (both versions load) — temporary; portaled v9 needs `PortalCompatProvider`; some v8 controls have no 1:1 v9 (re-compose).

## 2. From another design system (MUI, Chakra, Ant Design, Bootstrap, plain CSS)
No automated converter — introduce Fluent 2 at a **boundary** and migrate screen-by-screen. Wrap a route/subtree in `<FluentProvider theme={webLightTheme}>`, build that area with Fluent 2 components, map your palette to a brand theme (`fluent_generate_theme`) and your spacing/typography/radius to tokens (`fluent_get_token`). Don't mix two systems inside one component.

## 3. Replace hardcoded values with tokens (highest ROI)
Map magic values to Fluent tokens so light/dark/high-contrast + theming "just work":
`#242424 → tokens.colorNeutralForeground1` · `12px → tokens.spacingHorizontalM` · `4px radius → tokens.borderRadiusMedium` · `0 4px 8px rgba(0,0,0,.14) → tokens.shadow8`. Use `fluent_get_token`/`fluent_list_tokens`, then wrap in `FluentProvider`.

## 4. Per-surface adoption (no rebuild)
- **Power BI (existing report):** `fluent_generate_powerbi_theme` → *View ▸ Themes ▸ Browse*; visual defaults restyle existing visuals.
- **Power Apps (existing app):** enable **Modern controls and themes**, set `App.Theme`, replace classic controls screen-by-screen (`fluent-powerapps`).
- **Power Pages (existing site):** add Fluent token CSS over Bootstrap (`fluent-powerpages`).
- **PCF:** rebuild a legacy control with a current CLI for Fluent v9 platform libraries + `context.fluentDesignLanguage` (`fluent-pcf-component`).

## Process
1. **Audit** the current UI (`fluent-design-review` + `fluent_accessibility_checklist`). 2. **Plan** the increment (pick a screen/scenario). 3. **Migrate** using the mapping + tokens (do the work). 4. **Verify** each increment; remove shims as you finish.

## Learn more
| Topic | How to find |
|---|---|
| v8 → v9 migration + mapping | `https://react.fluentui.dev` (Concepts ▸ Migration from v8) · MCP `fluent_migration_guidance` |
| Migration shims | `https://www.npmjs.com/package/@fluentui/react-migration-v8-v9` |
| v9 release / tooling | `https://github.com/microsoft/fluentui/wiki/Fluent-UI-React-v9-Release` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
