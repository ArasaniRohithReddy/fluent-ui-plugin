# fluent-ui: build token-accurate Fluent 2 UIs, automatically

[![CI](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/ArasaniRohithReddy/fluent-ui-plugin?color=0f6cbd&label=release)](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![GitHub Discussions](https://img.shields.io/badge/GitHub-Discussions-5c2e91.svg)](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/discussions)

> Agents · Skills · MCP tools that help developers, designers, and UI engineers implement **Microsoft Fluent 2 (Fluent UI 2.0)** correctly and fast, across **Web**, **Power BI**, **Power Platform**, and **native iOS / Android / Windows**, from any AI IDE.

**🌐 Live site (itself a Fluent UI React v9 app, built with this plugin): [arasanirohithreddy.github.io/fluent-ui-plugin](https://arasanirohithreddy.github.io/fluent-ui-plugin/)** · **[Install & usage guide](GUIDE.md)** · **[Per-host matrix](hosts/README.md)**

**Version:** [1.0.0](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/latest) · **License:** MIT · **Fluent 2 is the core** of everything here: every surface applies the *same* design language (tokens, Segoe UI type ramp, spacing, corner radius, elevation, motion, accessibility).

---

## Why this exists
Fluent 2 is large and precise: the right component, the right token, the right theme, and accessibility, every time. Doing that by hand is slow and error-prone. `fluent-ui` turns the official Fluent 2 design system into **grounded, executable help**: apply the **design-language foundations** (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI), look up real components and token values, generate brand themes, produce valid Power BI themes and **PBIP/PBIR** projects, and get Power Apps / Power Pages / PCF guidance, so users get token-accurate, accessible Fluent 2 without doing it manually.

Beyond greenfield, it also:
- **Adopt/migrate existing UIs to Fluent 2**: Fluent UI v8 to v9 (keeps Fluent 1 alongside Fluent 2), from other design systems, and hardcoded values to tokens.
- **Support Fluent 1 (v8) as a first-class target**, not just a migration source — including the collision traps where v8 and v9 export the *same name* for different components, so a wrong import compiles cleanly and misbehaves at runtime.
- **Cover the native platforms**: real iOS, Android and Windows types, imports and API. The same component *name* maps to a different *type* on every platform — and on Android both Fluent generations ship in the **same Maven artifacts**, separated only by Kotlin package — so native code can't safely be inferred from the web API.
- **Optional user presets (`fluent.config.json`) + persistent memory**: agents honor your brand/accessibility/shape/size presets and remember your decisions; fully zero-config by default (no setup required).

## What's inside

### 🤖 Agents (`agents/`)
| Agent | Role |
|---|---|
| `fluent-ui-builder` | Primary router that builds and delegates across all surfaces |
| `fluent-web-engineer` | Fluent 2 web apps (React v9 / Web Components) |
| `fluent-powerbi-designer` | Fluent themes + PBIP/PBIR reports |
| `fluent-power-platform-engineer` | Power Apps, Power Pages, PCF |
| `fluent-native-engineer` | Fluent on iOS, Android and Windows (SwiftUI/UIKit, Compose, WinUI 3, WPF) |
| `fluent-migration-engineer` | Adopts/migrates existing UI to Fluent 2 (Fluent UI v8 to v9, other design systems, hardcoded to tokens) |
| `fluent-design-reviewer` | Audits UI against Fluent 2 + a11y |

### 📚 Skills (`skills/`)
`fluent-web-ui` · `fluent-theming` · `fluent-design-tokens` · `fluent-design-language` · `fluent-accessibility` · `fluent-ai-copilot-ui` · `fluent-powerbi-theme` · `fluent-pbip-report` · `fluent-powerbi-adopt` · `fluent-powerapps` · `fluent-powerpages` · `fluent-pcf-component` · `fluent-migration` · `fluent-design-review` · `fluent-config` · `fluent-v8` · `fluent-native` · `fluent-figma`

### 🛠️ MCP tools (`mcp/`, Node + TypeScript)
| Tool | Does |
|---|---|
| `fluent_search_components` / `fluent_get_component` | Search the catalog; get real props, imports, a11y, samples, usage do/don't |
| `fluent_list_tokens` / `fluent_get_token` | Exact token values (color/type/spacing/radius/shadow/motion), light/dark/HC |
| `fluent_generate_theme` | Brand hex to Fluent `BrandVariants` ramp + `createLightTheme`/`createDarkTheme` |
| `fluent_generate_powerbi_theme` | Valid, Fluent-aligned Power BI report theme JSON |
| `fluent_scaffold_pbip` | Fluent-themed **PBIP/PBIR** Power BI project |
| `fluent_pbir_audit` | Read-only census of an existing PBIR report: pages + per-page canvas, visual/type/schema histograms, theme wiring, inline-override counts, inline fonts, hardcoded colors, bookmarks that captured formatting, geometry, effectiveness matrix |
| `fluent_pbir_apply_theme` | Register a theme in an existing PBIR report (append the `CustomTheme` item, computed `reportVersionAtImport`) |
| `fluent_pbir_normalize_inline` | Delete the inline overrides that make a theme inert, with a full ledger (dry run by default) |
| `fluent_pbir_verify` | Assertions V1-V9 including the theme-effectiveness ratio (target >= 0.90) |
| `fluent_powerbi_visuals` | Every Power BI visual + its Learn doc URL + Fluent 2 base-theme styling (mapped to the 21-page showcase) |
| `fluent_powerplatform_guidance` | Power Apps / Power Pages / PCF Fluent guidance |
| `fluent_generate_code` | Fluent web scaffolds (React v9 / Web Components) |
| `fluent_accessibility_checklist` | Fluent 2 WCAG 2.1 AA checklist |
| `fluent_design_guidance` | Fluent 2 design-language foundations: color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI |
| `fluent_migration_guidance` | Adopt/migrate to Fluent 2: Fluent UI v8 to v9, from another design system, hardcoded to tokens, per-surface |
| `fluent_get_images` | Direct URLs to official Fluent 2 visuals (anatomy diagrams, do/don't examples, state/type illustrations, Motion demo videos) for any component or topic (show a diagram or hand over a source link) |
| `fluent_get_config` / `fluent_recall` | Load the user's resolved presets (config > memory > default) + the recorded decision log |
| `fluent_init_config` / `fluent_set_config` | Scaffold (first-run) or update the user's `fluent.config.json` presets |
| `fluent_remember` | Record a design decision to `.fluent/memory.json` (append-only) |
| `fluent_v8_lookup` / `fluent_v8_guidance` | **Fluent 1 (Fluent UI React v8 / Office UI Fabric)**: real v8 symbols, the per-component v8 to v9 map, and the collision traps where v8 and v9 export the *same name* |
| `fluent_native_component` / `fluent_native_guidance` | **Native iOS / Android / Windows**: real type names, imports and namespaces, key API and samples, plus which generation is current vs frozen |
| `fluent_figma_guidance` | Figma MCP design-to-code: entitlements (rate limits per seat and plan), the client-catalog gate, remote vs desktop server, and Figma-variable to Fluent-token mapping. Credential-free |

## Host coverage
The MCP server is a standard stdio server; agents/skills/instructions fan out via `AGENTS.md`, `CLAUDE.md`, and `.github/`. `node hosts/register-mcp.mjs` auto-registers **9 hosts across 10 config locations**; **3 MCP dialects** cover everything else. Priority hosts: **GitHub Copilot CLI, VS Code, VS Code Insiders, Visual Studio, GitHub Copilot desktop app**; also Cursor, Claude, Gemini, Antigravity, Windsurf, Cline. See **[`hosts/README.md`](hosts/README.md)** for copy-paste configs.

## Quickstart
```bash
# 1) Clone and build the MCP server
git clone https://github.com/ArasaniRohithReddy/fluent-ui-plugin.git
cd fluent-ui-plugin/mcp
npm install
npm run build            # -> mcp/dist/index.js

# 2) Register it in your IDE (pick the matching template)
#    Copilot dialect   -> hosts/mcp.copilot.json
#    VS Code / VS       -> hosts/mcp.vscode.json
#    Claude-style       -> hosts/mcp.claude-style.json
#    Or register every installed host at once:
#    node hosts/register-mcp.mjs
```
**Did it work?** Restart your host, then ask it to run `fluent_accessibility_checklist`.
A grounded Fluent 2 checklist back means the server is live; "tool not found" means the config path is wrong.

Then ask your assistant things like:
- *"Build a Fluent 2 sign-in form with dark mode."*
- *"Generate a Power BI theme from brand `#742774` and scaffold a PBIP report."*
- *"What's `borderRadiusMedium`? Give me a Fluent Combobox with a label."*
- *"Make my Power Apps canvas app match Fluent 2."*
- *"Review this component against Fluent 2 and accessibility."*

## Grounding & provenance (why it's trustworthy)
- **Design system:** crawled the official **fluent2.microsoft.design**, 69 public pages + **14 gated AI/Copilot component pages** (captured via authenticated employee session).
- **Tokens & components:** extracted from installed **`@fluentui/react-theme` / `@fluentui/tokens` / `@fluentui/react-components`** source (real values, not guesses); 61 components catalogued with usage.
- **Power BI:** theme JSON **schema-validated** against `reportThemeSchema-2.156`; PBIP/PBIR scaffold validated against the official Fabric item schemas.
- **Power Platform & host integration:** grounded in Microsoft Learn with cited sources.

## Repo layout
```
plugin.json            # plugin manifest (+ mirrors in .claude-plugin/.codex-plugin/.github)
.mcp.json              # bundled MCP server registration (Copilot dialect)
AGENTS.md · CLAUDE.md  # portable instructions (fan out to most hosts)
agents/                # 7 agents (*.agent.md)
skills/                # 18 skills (SKILL.md)
mcp/                   # MCP server: 28 tools (src/, dist/, data/)
templates/pbip/        # PBIP/PBIR project template
hosts/                 # per-IDE MCP config templates + install guide
assets/                # sample configs/apps + the fluent.config JSON schema
scripts/               # PBIR engine + data-build scripts
site/                  # the live site (Fluent UI React v9 app)
docs/                  # architecture · presentation · coverage + the published site build
.github/               # CI workflows, issue/PR templates, Copilot instructions
```
> Not published: `research/` (grounded research notes) and `assets/screenshots/` (Fluent 2 site captures) are **gitignored local-only** working folders — they hold gated/copyright Microsoft content, so they are not in the repository.

## Docs
- [`GUIDE.md`](GUIDE.md): install it, then use it — per-host setup and worked examples.
- [`docs/architecture.md`](docs/architecture.md): how the pieces fit together.
- [`docs/COVERAGE.md`](docs/COVERAGE.md): what's covered, measured against the source of truth.
- [`docs/presentation.md`](docs/presentation.md): leadership presentation outline.
- [`CHANGELOG.md`](CHANGELOG.md): what changed in each release.
- [`NOTICE`](NOTICE): attribution, trademarks, and how sign-in-gated Microsoft material is handled.

## Contributing and community
This is an open-source project (MIT) and contributions are welcome.
- **Bugs:** open a [bug report](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/issues/new?template=bug_report.yml).
- **Features:** open a [feature request](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/issues/new?template=feature_request.yml).
- **Questions and ideas:** join [GitHub Discussions](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/discussions).
- **Pull requests:** see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the dev setup and process.
- **Security:** please follow the [Security Policy](SECURITY.md).

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## License
MIT © Rohith Reddy Arasani. Fluent, Fluent 2, Power BI, and Power Platform are trademarks of Microsoft.
