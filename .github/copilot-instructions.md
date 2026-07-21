# Fluent 2 (Fluent UI 2.0) — Copilot instructions

When helping in this repository (or any project that uses Microsoft **Fluent 2 / Fluent UI 2.0**), follow these rules and use the **`fluent-ui`** MCP tools. Fluent 2 is the design system; the same tokens/type-ramp/spacing/radius/elevation apply on Web, Power BI, and Power Platform.

## Always
- **Never hardcode token values.** Look them up with `fluent_get_token` / `fluent_list_tokens` and consume as `tokens.*` (Griffel `makeStyles`), CSS variables, or theme values — no raw hex/px that duplicates a token.
- **Theme via `FluentProvider`** with a real theme (`webLightTheme`/`webDarkTheme` or a brand theme from `fluent_generate_theme`); support light, dark, and high contrast.
- **Choose components** with `fluent_search_components` / `fluent_get_component`; prefer Fluent components + slots over custom markup.
- **Verify accessibility** with `fluent_accessibility_checklist` (names/roles, visible focus, keyboard, 4.5:1 contrast, 24px targets).

## MCP tools
`fluent_search_components`, `fluent_get_component`, `fluent_list_tokens`, `fluent_get_token`, `fluent_generate_theme`, `fluent_generate_powerbi_theme`, `fluent_scaffold_pbip`, `fluent_powerplatform_guidance`, `fluent_generate_code`, `fluent_accessibility_checklist`, `fluent_design_guidance`, `fluent_migration_guidance`.

For **design-language foundations** (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI) call `fluent_design_guidance`. To **adopt/migrate an existing UI to Fluent 2** — Fluent UI **v8→v9** (Fluent 1 stays alongside Fluent 2), from another design system, or hardcoded values → tokens — call `fluent_migration_guidance`.

## Surfaces
- **Web:** `@fluentui/react-components` (v9) + `FluentProvider`; or `@fluentui/web-components` (v3). Copilot/AI UI: `@fluentui-copilot/react-copilot`.
- **Power BI:** `fluent_generate_powerbi_theme` + `fluent_scaffold_pbip` (PBIP/PBIR).
- **Power Platform:** Power Apps modern controls + `App.Theme`; Power Pages Fluent-token CSS; PCF Fluent React v9 (`context.fluentDesignLanguage.tokenTheme`).

See `AGENTS.md` for the full guide and `skills/` for task-specific depth.
