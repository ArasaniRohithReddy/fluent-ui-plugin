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
| `fluent_powerbi_visuals` | Catalog of every Power BI visual + its Learn doc URL and how the Fluent 2 base theme styles it (mapped to the 21-page Fluent 2 showcase) |
| `fluent_powerplatform_guidance` | Power Apps / Power Pages / PCF Fluent guidance + snippets |
| `fluent_generate_code` | Scaffold a Fluent web component/layout (React v9 or Web Components) |
| `fluent_accessibility_checklist` | Fluent 2 accessibility checklist to self-review against |
| `fluent_design_guidance` | Fluent 2 design-language foundations (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI) |
| `fluent_migration_guidance` | Scenario guidance to adopt/migrate existing UI to Fluent 2 (Fluent UI v8→v9, from another design system, hardcoded→tokens, per-surface) |
| `fluent_get_images` | Direct URLs to the official Fluent 2 visuals — anatomy diagrams, do/don't examples, state/type illustrations, and Motion demo videos — for any component or topic. Use to **show** a user a diagram or hand them a source link |
| `fluent_get_config` / `fluent_recall` | Load the user's resolved presets (config > memory > default) + the recorded decision log |
| `fluent_init_config` / `fluent_set_config` | Scaffold (first-run) or update the user's `fluent.config.json` presets |
| `fluent_remember` | Record a clarified design decision to `.fluent/memory.json` |

## Golden rules (never violate)
1. **Never hardcode token values.** No raw hex/px that duplicates a token — look them up (`fluent_get_token`) and consume as `tokens.*` (Griffel), CSS variables, or theme values.
2. **Always theme via `FluentProvider`** (web) with a real theme (`webLightTheme`/`webDarkTheme` or a brand theme). Support light, dark, and high-contrast.
3. **Choose components from the real catalog** (`fluent_search_components`/`fluent_get_component`); prefer composition/slots over custom markup.
4. **Accessibility is non-negotiable** (`fluent_accessibility_checklist`): names/roles, focus order, 4.5:1 contrast, 24px targets, keyboard.

## Presets config & memory (optional, zero-config)
Users may declare presets in **`fluent.config.json`** (brand, theme, typography, shape, size/density, accessibility, iconStyle, targets, migration, content) and agents persist decisions in **`.fluent/memory.json`**. Both are optional — **zero-config always works** on built-in Fluent 2 defaults; readers never throw on missing files.
- **Precedence (first wins):** explicit `fluent.config.json` value → recorded `.fluent/memory.json` decision → built-in Fluent 2 default. (A runtime tool argument overrides all three for that one call.)
- **Start of task:** call `fluent_get_config` to load resolved presets. If `configExists:false` **and** memory has no `presets-optout` decision, make the **first-run offer once** — "set up design presets now, or use Fluent 2 defaults?" — on yes run `fluent_init_config`; on no/silent `fluent_remember` a `presets-optout` decision and build on defaults.
- **Record decisions:** persist clarified choices with `fluent_remember` (append-only) so they're never re-asked; `fluent_recall` reads them back; `fluent_set_config` updates the config. Load the `fluent-config` skill for the field→token mapping.
- **Show, don't just tell:** when the user asks to *see* or get a *link* to a Fluent 2 diagram, anatomy, do/don't example, or Motion video, call `fluent_get_images` (filter by `owner`/`kind`/`type`) and hand back the real source URLs — never invent image links.

## Surface quickstarts
- **Web (React v9):** `npm i @fluentui/react-components` → wrap app in `<FluentProvider theme={webLightTheme}>` → style with `makeStyles` + `tokens`.
- **Web Components v3:** `@fluentui/web-components`, `setTheme(...)`, `<fluent-*>` elements.
- **Copilot / AI chat UI:** `@fluentui-copilot/react-copilot` (Storybook: https://ai.fluentui.dev) — ChatInput, Copilot message, Suggestions, Prompt starters, Citations.
- **Power BI:** `fluent_generate_powerbi_theme` → import in Desktop (View ▸ Themes ▸ Browse); `fluent_scaffold_pbip` for a themed PBIP/PBIR project.
- **Power Apps:** modern controls + `App.Theme` (seed `#0f6cbd`). **Power Pages:** Fluent design-token CSS over Bootstrap. **PCF:** Fluent React v9 + `FluentProvider` with `context.fluentDesignLanguage.tokenTheme`.

## Skills (load for depth)
`fluent-web-ui` · `fluent-theming` · `fluent-design-tokens` · `fluent-design-language` · `fluent-accessibility` · `fluent-ai-copilot-ui` · `fluent-powerbi-theme` · `fluent-pbip-report` · `fluent-powerbi-adopt` · `fluent-powerapps` · `fluent-powerpages` · `fluent-pcf-component` · `fluent-migration` · `fluent-design-review` · `fluent-config`

## Agents
`fluent-ui-builder` (primary/router) · `fluent-web-engineer` · `fluent-powerbi-designer` · `fluent-power-platform-engineer` · `fluent-migration-engineer` · `fluent-design-reviewer`

## MCP server
`node mcp/dist/index.js` (build: `cd mcp && npm install && npm run build`). Per-IDE config templates live in `hosts/` — see `hosts/README.md`.

## Reference
Fluent 2 design system: https://fluent2.microsoft.design · React docs/Storybook: https://react.fluentui.dev
