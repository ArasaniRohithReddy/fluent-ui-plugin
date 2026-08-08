# Fluent 2 (Fluent UI 2.0) — Copilot instructions

When helping in this repository (or any project that uses Microsoft **Fluent 2 / Fluent UI 2.0**), follow these rules and use the **`fluent-ui`** MCP tools. Fluent 2 is the design system; the same tokens/type-ramp/spacing/radius/elevation apply on Web, Power BI, and Power Platform.

## Always
- **Never hardcode token values.** Look them up with `fluent_get_token` / `fluent_list_tokens` and consume as `tokens.*` (Griffel `makeStyles`), CSS variables, or theme values — no raw hex/px that duplicates a token.
- **Theme via `FluentProvider`** with a real theme (`webLightTheme`/`webDarkTheme` or a brand theme from `fluent_generate_theme`); support light, dark, and high contrast.
- **Choose components** with `fluent_search_components` / `fluent_get_component`; prefer Fluent components + slots over custom markup.
- **Verify accessibility** with `fluent_accessibility_checklist` (names/roles, visible focus, keyboard, 4.5:1 contrast, 24px targets).

## MCP tools
`fluent_search_components`, `fluent_get_component`, `fluent_list_tokens`, `fluent_get_token`, `fluent_generate_theme`, `fluent_generate_powerbi_theme`, `fluent_scaffold_pbip`, `fluent_pbir_audit`, `fluent_pbir_apply_theme`, `fluent_pbir_normalize_inline`, `fluent_pbir_verify`, `fluent_powerbi_visuals`, `fluent_powerplatform_guidance`, `fluent_generate_code`, `fluent_accessibility_checklist`, `fluent_design_guidance`, `fluent_migration_guidance`, `fluent_get_images`, `fluent_get_config`, `fluent_init_config`, `fluent_set_config`, `fluent_remember`, `fluent_recall`.

For **design-language foundations** (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI) call `fluent_design_guidance`. To **adopt/migrate an existing UI to Fluent 2** — Fluent UI **v8→v9** (Fluent 1 stays alongside Fluent 2), from another design system, or hardcoded values → tokens — call `fluent_migration_guidance`.

## Presets config & memory (optional, zero-config)
Users may declare presets in **`fluent.config.json`** (brand, theme, typography, shape, size/density, accessibility, iconStyle, targets, migration, content) and agents persist decisions in **`.fluent/memory.json`** — both optional; **zero-config always works** on built-in Fluent 2 defaults (readers never throw on missing files). Precedence: explicit `fluent.config.json` value → recorded `.fluent/memory.json` decision → built-in default. Call `fluent_get_config` at the start of a task; if no config exists **and** there's no `presets-optout` decision, make the **first-run offer once** ("set up design presets now, or use Fluent 2 defaults?") — run `fluent_init_config` on opt-in, else `fluent_remember` a `presets-optout` decision and build on defaults. Record clarified decisions with `fluent_remember` (`fluent_recall` reads them; `fluent_set_config` updates the config). Load the `fluent-config` skill.

## Surfaces
- **Web:** `@fluentui/react-components` (v9) + `FluentProvider`; or `@fluentui/web-components` (v3). Copilot/AI UI: `@fluentui-copilot/react-copilot`.
- **Power BI:** `fluent_generate_powerbi_theme` + `fluent_scaffold_pbip` (PBIP/PBIR) + `fluent_powerbi_visuals` (every visual + Learn doc + Fluent 2 styling). For an EXISTING PBIR report: `fluent_pbir_audit` then `fluent_pbir_apply_theme` then `fluent_pbir_normalize_inline` then `fluent_pbir_verify` (a theme only styles what no visual overrode inline).
- **Power Platform:** Power Apps modern controls + `App.Theme`; Power Pages Fluent-token CSS; PCF Fluent React v9 (`context.fluentDesignLanguage.tokenTheme`).

See `AGENTS.md` for the full guide and `skills/` for task-specific depth.
