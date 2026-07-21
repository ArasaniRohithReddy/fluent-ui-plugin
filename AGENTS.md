# fluent-ui — build flawless Fluent 2 UIs

This project is the **fluent-ui** plugin: **agents + skills + an MCP server** that help developers, designers, and UI engineers implement **Microsoft Fluent 2 (Fluent UI 2.0)** *correctly and automatically* across **Web**, **Power BI**, and **Power Platform**. It also **adopts/migrates** existing UIs to Fluent 2 — Fluent UI **v8 → v9** (keeping **Fluent 1 (v8)** alongside **Fluent 2 (v9)**), from other design systems, and hardcoded values → tokens.

**Fluent 2 is the center of everything.** Every surface applies the *same* Fluent design language — the same design tokens, type ramp (Segoe UI), spacing scale, corner radius, elevation, motion, and accessibility rules. Web is the primary surface; Power BI and Power Platform apply the same language through their own theming systems.

> This file is read natively by GitHub Copilot (CLI, VS Code, Visual Studio, desktop app), Cursor, Gemini CLI, Windsurf, and Cline. Claude reads `CLAUDE.md`, which imports this file. It guarantees consistent Fluent 2 guidance even where the plugin's agents/skills aren't loaded.

## The `fluent-ui` MCP tools (use them — don't guess)
| Tool | Use it to |
|------|-----------|
| `fluent_search_components` / `fluent_get_component` | Find the right Fluent component + real props, imports, usage, a11y |
| `fluent_list_tokens` / `fluent_get_token` | Get exact design-token names + values (color, type, spacing, radius, shadow, motion) |
| `fluent_generate_theme` | Turn a brand color into a Fluent light+dark brand theme (brand ramp + CSS vars) |
| `fluent_generate_powerbi_theme` | Produce a valid, Fluent-aligned Power BI report theme JSON |
| `fluent_scaffold_pbip` | Scaffold a Fluent-themed Power BI **PBIP/PBIR** project |
| `fluent_powerplatform_guidance` | Power Apps / Power Pages / PCF Fluent guidance + snippets |
| `fluent_generate_code` | Scaffold a Fluent web component/layout (React v9 or Web Components) |
| `fluent_accessibility_checklist` | Fluent 2 accessibility checklist to self-review against |
| `fluent_design_guidance` | Fluent 2 design-language foundations (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI) |
| `fluent_migration_guidance` | Scenario guidance to adopt/migrate existing UI to Fluent 2 (Fluent UI v8→v9, from another design system, hardcoded→tokens, per-surface) |

## Golden rules (never violate)
1. **Never hardcode token values.** No raw hex/px that duplicates a token — look them up (`fluent_get_token`) and consume as `tokens.*` (Griffel), CSS variables, or theme values.
2. **Always theme via `FluentProvider`** (web) with a real theme (`webLightTheme`/`webDarkTheme` or a brand theme). Support light, dark, and high-contrast.
3. **Choose components from the real catalog** (`fluent_search_components`/`fluent_get_component`); prefer composition/slots over custom markup.
4. **Accessibility is non-negotiable** (`fluent_accessibility_checklist`): names/roles, focus order, 4.5:1 contrast, 24px targets, keyboard.

## Surface quickstarts
- **Web (React v9):** `npm i @fluentui/react-components` → wrap app in `<FluentProvider theme={webLightTheme}>` → style with `makeStyles` + `tokens`.
- **Web Components v3:** `@fluentui/web-components`, `setTheme(...)`, `<fluent-*>` elements.
- **Copilot / AI chat UI:** `@fluentui-copilot/react-copilot` (Storybook: https://ai.fluentui.dev) — ChatInput, Copilot message, Suggestions, Prompt starters, Citations.
- **Power BI:** `fluent_generate_powerbi_theme` → import in Desktop (View ▸ Themes ▸ Browse); `fluent_scaffold_pbip` for a themed PBIP/PBIR project.
- **Power Apps:** modern controls + `App.Theme` (seed `#0f6cbd`). **Power Pages:** Fluent design-token CSS over Bootstrap. **PCF:** Fluent React v9 + `FluentProvider` with `context.fluentDesignLanguage.tokenTheme`.

## Skills (load for depth)
`fluent-web-ui` · `fluent-theming` · `fluent-design-tokens` · `fluent-design-language` · `fluent-accessibility` · `fluent-ai-copilot-ui` · `fluent-powerbi-theme` · `fluent-pbip-report` · `fluent-powerapps` · `fluent-powerpages` · `fluent-pcf-component` · `fluent-migration` · `fluent-design-review`

## Agents
`fluent-ui-builder` (primary/router) · `fluent-web-engineer` · `fluent-powerbi-designer` · `fluent-power-platform-engineer` · `fluent-migration-engineer` · `fluent-design-reviewer`

## MCP server
`node mcp/dist/index.js` (build: `cd mcp && npm install && npm run build`). Per-IDE config templates live in `hosts/` — see `hosts/README.md`.

## Reference
Fluent 2 design system: https://fluent2.microsoft.design · React docs/Storybook: https://react.fluentui.dev
