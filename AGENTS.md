# fluent-ui — build token-accurate Fluent 2 UIs

This project is the **fluent-ui** plugin: **agents + skills + an MCP server** that help developers, designers, and UI engineers implement **Microsoft Fluent 2 (Fluent UI 2.0)** *correctly and automatically* across **Web**, **Power BI**, **Power Platform**, and the **native platforms — iOS, Android and Windows**. It also **adopts/migrates** existing UIs to Fluent 2 — Fluent UI **v8 → v9** (keeping **Fluent 1 (v8)** alongside **Fluent 2 (v9)**), from other design systems, and hardcoded values → tokens.

**Fluent 2 is the center of everything.** Every surface applies the *same* Fluent design language — the same design tokens, type ramp (Segoe UI), spacing scale, corner radius, elevation, motion, and accessibility rules. Web is the primary surface; Power BI, Power Platform and the native platforms apply the same language through their own theming systems.

> **Same design language, different type names.** A component's *name* is shared across platforms; its *type* is not. `Avatar` is `MSFAvatar` on iOS, a `tokenized.*` Composable on Android, and a WinUI 3 control on Windows — and on Android the Fluent 1 and Fluent 2 generations ship in the **same Maven artifact**, separated only by Kotlin package. Never infer native code from the web API: look it up with `fluent_native_component`.

> This file is read natively by GitHub Copilot (CLI, VS Code, Visual Studio, desktop app), Cursor, Gemini CLI, Windsurf, and Cline. Claude reads `CLAUDE.md`, which imports this file. It guarantees consistent Fluent 2 guidance even where the plugin's agents/skills aren't loaded.

## The `fluent-ui` MCP tools (use them — don't guess)
| Tool | Use it to |
|------|-----------|
| `fluent_search_components` / `fluent_get_component` | Find the right Fluent component + real props, imports, usage, a11y |
| `fluent_list_tokens` / `fluent_get_token` | Get exact design-token names + values (color, type, spacing, radius, shadow, motion) |
| `fluent_generate_theme` | Turn a brand color into a Fluent light+dark brand theme (brand ramp + CSS vars) |
| `fluent_generate_powerbi_theme` | Produce a valid, Fluent-aligned Power BI report theme JSON |
| `fluent_scaffold_pbip` | Scaffold a Fluent-themed Power BI **PBIP/PBIR** project |
| `fluent_pbir_audit` | Read-only census of an existing **PBIR** report: pages + each page's real canvas, visual/type/schema histograms, theme wiring, per-key **inline-override counts**, inline fonts, hardcoded colors, bookmarks that captured formatting, geometry, and the theme-effectiveness matrix |
| `fluent_pbir_apply_theme` | Register a theme in an existing PBIR report: write it to `RegisteredResources`, **append** the `CustomTheme` item to the existing package, and set `themeCollection.customTheme` with a **computed** `reportVersionAtImport` |
| `fluent_pbir_normalize_inline` | The core fix: **delete** the inline `visualContainerObjects` overrides the theme owns so the theme actually applies, with a full change ledger (dry run by default) |
| `fluent_pbir_verify` | Prove the adoption landed: assertions V1-V9 including the **theme-effectiveness ratio** (target >= 0.90) |
| `fluent_powerbi_visuals` | Catalog of every Power BI visual + its Learn doc URL and how the Fluent 2 base theme styles it (mapped to the 21-page Fluent 2 showcase) |
| `fluent_powerplatform_guidance` | Power Apps / Power Pages / PCF Fluent guidance + snippets |
| `fluent_generate_code` | Scaffold a Fluent web component/layout (React v9 or Web Components) |
| `fluent_accessibility_checklist` | Fluent 2 accessibility checklist to self-review against |
| `fluent_design_guidance` | Fluent 2 design-language foundations (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI) |
| `fluent_migration_guidance` | Scenario guidance to adopt/migrate existing UI to Fluent 2 (Fluent UI v8→v9, from another design system, hardcoded→tokens, per-surface) |
| `fluent_get_images` | Direct URLs to the official Fluent 2 visuals — anatomy diagrams, do/don't examples, state/type illustrations, and Motion demo videos — for any component or topic. Use to **show** a user a diagram or hand them a source link |
| `fluent_icon_search` | Find the right Fluent icon by meaning and get its **exact** verified export name + import (a guessed icon name is always a compile error) |
| `fluent_get_config` / `fluent_recall` | Load the user's resolved presets (config > memory > default) + the recorded decision log |
| `fluent_init_config` / `fluent_set_config` | Scaffold (first-run) or update the user's `fluent.config.json` presets |
| `fluent_remember` | Record a clarified design decision to `.fluent/memory.json` |
| `fluent_v8_lookup` / `fluent_v8_guidance` | **Fluent 1 (Fluent UI React v8 / Office UI Fabric)**: real v8 symbols, the v8→v9 per-component map, and the collision traps where v8 and v9 export the *same name* so code compiles and then misbehaves |
| `fluent_native_component` / `fluent_native_guidance` | **Native platforms** — iOS, Android, Windows. Real type names, imports/namespaces, key API and samples, plus which generation is current vs frozen. The same component name resolves to a different type on each platform, so never infer native code from the web API |
| `fluent_figma_guidance` | Figma MCP design-to-code: **entitlements first** (a View/Collab seat gets ~6 tool calls per *month* — 20 on Starter), the client-catalog gate, remote vs desktop server, and Figma-variable→Fluent-token mapping. Credential-free — auth is the host's own OAuth flow |

## Golden rules (never violate)
1. **Never hardcode token values.** No raw hex/px that duplicates a token — look them up (`fluent_get_token`) and consume as `tokens.*` (Griffel), CSS variables, or theme values.
2. **Always theme via `FluentProvider`** (web) with a real theme (`webLightTheme`/`webDarkTheme` or a brand theme). Support light, dark, and high-contrast.
3. **Choose components from the real catalog** (`fluent_search_components`/`fluent_get_component`); prefer composition/slots over custom markup.
4. **Accessibility is non-negotiable** (`fluent_accessibility_checklist`): names/roles, focus order, 4.5:1 contrast, 24px targets, keyboard.

## Presets config & memory (optional, zero-config)
Users may declare presets in **`fluent.config.json`** (brand, theme, typography, shape, size/density, accessibility, iconStyle, targets, migration, content) and agents persist decisions in **`.fluent/memory.json`**. Both are optional — **zero-config always works** on built-in Fluent 2 defaults; readers never throw on missing files.
- **Precedence (first wins):** explicit `fluent.config.json` value → recorded `.fluent/memory.json` decision → built-in Fluent 2 default. (A runtime tool argument overrides all three for that one call.)
- **Start of task:** call `fluent_get_config` to load resolved presets. If `configExists:false` **and** memory has no `presets-optout` decision, make the **first-run offer once** — "set up design presets now, or use Fluent 2 defaults?" — on yes run `fluent_init_config`; on no/silent `fluent_remember` a `presets-optout` decision and build on defaults.
- **House rules outrank defaults.** `guidelines.rules` and `guidelines.constraints` hold the team's own rules in their own words, captured verbatim at intake because no enum can express *"data grids are compact, everything else comfortable"*. Apply the rules as if the user had just restated them, and treat a **constraint** as outranking every preset and inferred default — if a request conflicts with one, say so rather than silently overriding it.
- **Record decisions:** persist clarified choices with `fluent_remember` (append-only) so they're never re-asked; `fluent_recall` reads them back; `fluent_set_config` updates the config. Load the `fluent-config` skill for the field→token mapping.
- **Show, don't just tell:** when the user asks to *see* or get a *link* to a Fluent 2 diagram, anatomy, do/don't example, or Motion video, call `fluent_get_images` (filter by `owner`/`kind`/`type`) and hand back the real source URLs — never invent image links.

## Surface quickstarts
- **Web (React v9):** `npm i @fluentui/react-components` → wrap app in `<FluentProvider theme={webLightTheme}>` → style with `makeStyles` + `tokens`.
- **Web Components v3:** `@fluentui/web-components`, `setTheme(...)`, `<fluent-*>` elements.
- **Copilot / AI chat UI:** `@fluentui-copilot/react-copilot` (Storybook: https://ai.fluentui.dev) — ChatInput, Copilot message, Suggestions, Prompt starters, Citations.
- **Power BI:** `fluent_generate_powerbi_theme` → import in Desktop (View ▸ Themes ▸ Browse); `fluent_scaffold_pbip` for a themed PBIP/PBIR project.
- **Existing Power BI report (PBIR):** a theme only styles what no visual overrode inline, so run `fluent_pbir_audit` then `fluent_pbir_apply_theme` then `fluent_pbir_normalize_inline` then `fluent_pbir_verify`. The same engine runs standalone: `node scripts/pbir/audit.mjs <reportDir>`.
- **Power Apps:** modern controls + `App.Theme` (seed `#0f6cbd`). **Power Pages:** Fluent design-token CSS over Bootstrap. **PCF:** Fluent React v9 + `FluentProvider` with `context.fluentDesignLanguage.tokenTheme`.
- **iOS:** `MicrosoftFluentUI` (CocoaPods) / `FluentUI` (SPM). One evolving library — Fluent 2 is a **version cutover at 0.13.0**, not a separate package. Types are `MSF*`; both UIKit and SwiftUI are supported.
- **Android:** `com.microsoft.fluentui:*`. Both generations ship in the **same artifacts**: `com.microsoft.fluentui.tokenized.*` is Fluent 2 (Compose, active), `com.microsoft.fluentui.<area>.*` is Fluent 1 (Views, feature-frozen). The import — not the dependency — decides which you get.
- **Windows:** WinUI 3 via `Microsoft.WindowsAppSDK` is current. **WinUI 2 (`Microsoft.UI.Xaml`) is maintenance-only** — 2.8 (July 2022) was its last feature release. WPF has an official in-box Fluent theme from .NET 9 (`PresentationFramework.Fluent`); the popular *WPF-UI* package is community, not Microsoft.
- **Figma → code:** check entitlement *first* with `whoami` (rate-limit exempt). Limits go by **seat**, not plan: a **View/Collab** seat gets ~6 calls per **month** (20 on Starter), while a **Dev/Full** seat gets 200/day (600/day on Enterprise) — so a Dev seat is the realistic floor. The host owns auth — this plugin never touches a token.

## Skills (load for depth)
`fluent-web-ui` · `fluent-theming` · `fluent-design-tokens` · `fluent-design-language` · `fluent-accessibility` · `fluent-ai-copilot-ui` · `fluent-powerbi-theme` · `fluent-pbip-report` · `fluent-powerbi-adopt` · `fluent-powerapps` · `fluent-powerpages` · `fluent-pcf-component` · `fluent-migration` · `fluent-design-review` · `fluent-config` · `fluent-v8` · `fluent-native` · `fluent-figma`

## Agents
`fluent-ui-builder` (primary/router) · `fluent-web-engineer` · `fluent-powerbi-designer` · `fluent-power-platform-engineer` · `fluent-native-engineer` · `fluent-migration-engineer` · `fluent-design-reviewer`

## MCP server
`node mcp/dist/index.js` (build: `cd mcp && npm install && npm run build`). Per-IDE config templates live in `hosts/` — see `hosts/README.md`.

## Reference
Fluent 2 design system: https://fluent2.microsoft.design · React docs/Storybook: https://react.fluentui.dev
