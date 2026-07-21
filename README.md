# fluent-ui — build flawless Fluent 2 UIs, automatically

> Agents · Skills · MCP tools that help developers, designers, and UI engineers implement **Microsoft Fluent 2 (Fluent UI 2.0)** correctly and fast — across **Web**, **Power BI**, and **Power Platform** — from any AI IDE.

**Version:** 1.0.0 · **License:** MIT · **Fluent 2 is the core** of everything here: every surface applies the *same* design language (tokens, Segoe UI type ramp, spacing, corner radius, elevation, motion, accessibility).

---

## Why this exists
Fluent 2 is large and precise — the right component, the right token, the right theme, and accessibility, every time. Doing that by hand is slow and error-prone. `fluent-ui` turns the official Fluent 2 design system into **grounded, executable help**: apply the **design-language foundations** (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI), look up real components and token values, generate brand themes, produce valid Power BI themes and **PBIP/PBIR** projects, and get Power Apps / Power Pages / PCF guidance — so users design flawlessly without doing it manually.

Beyond greenfield, it also:
- **Adopt/migrate existing UIs to Fluent 2** — Fluent UI v8→v9 (keeps Fluent 1 alongside Fluent 2), from other design systems, and hardcoded values → tokens.

## What's inside

### 🤖 Agents (`agents/`)
| Agent | Role |
|---|---|
| `fluent-ui-builder` | Primary router — builds and delegates across all surfaces |
| `fluent-web-engineer` | Fluent 2 web apps (React v9 / Web Components) |
| `fluent-powerbi-designer` | Fluent themes + PBIP/PBIR reports |
| `fluent-power-platform-engineer` | Power Apps, Power Pages, PCF |
| `fluent-migration-engineer` | Adopts/migrates existing UI to Fluent 2 (Fluent UI v8→v9, other design systems, hardcoded→tokens) |
| `fluent-design-reviewer` | Audits UI against Fluent 2 + a11y |

### 📚 Skills (`skills/`)
`fluent-web-ui` · `fluent-theming` · `fluent-design-tokens` · `fluent-design-language` · `fluent-accessibility` · `fluent-ai-copilot-ui` · `fluent-powerbi-theme` · `fluent-pbip-report` · `fluent-powerapps` · `fluent-powerpages` · `fluent-pcf-component` · `fluent-migration` · `fluent-design-review`

### 🛠️ MCP tools (`mcp/`, Node + TypeScript)
| Tool | Does |
|---|---|
| `fluent_search_components` / `fluent_get_component` | Search the catalog; get real props, imports, a11y, samples, usage do/don't |
| `fluent_list_tokens` / `fluent_get_token` | Exact token values (color/type/spacing/radius/shadow/motion), light/dark/HC |
| `fluent_generate_theme` | Brand hex → Fluent `BrandVariants` ramp + `createLightTheme`/`createDarkTheme` |
| `fluent_generate_powerbi_theme` | Valid, Fluent-aligned Power BI report theme JSON |
| `fluent_scaffold_pbip` | Fluent-themed **PBIP/PBIR** Power BI project |
| `fluent_powerplatform_guidance` | Power Apps / Power Pages / PCF Fluent guidance |
| `fluent_generate_code` | Fluent web scaffolds (React v9 / Web Components) |
| `fluent_accessibility_checklist` | Fluent 2 WCAG 2.1 AA checklist |
| `fluent_design_guidance` | Fluent 2 design-language foundations: color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI |
| `fluent_migration_guidance` | Adopt/migrate to Fluent 2 — Fluent UI v8→v9, from another design system, hardcoded→tokens, per-surface |

## Works in every major host
The MCP server is a standard stdio server; agents/skills/instructions fan out via `AGENTS.md`, `CLAUDE.md`, and `.github/`. Priority hosts: **GitHub Copilot CLI, VS Code, VS Code Insiders, Visual Studio, GitHub Copilot desktop app**; also Cursor, Claude, Gemini, Antigravity, Windsurf, Cline. See **[`hosts/README.md`](hosts/README.md)** for copy-paste configs (3 MCP dialects).

## Quickstart
```bash
# 1) Build the MCP server
cd mcp
npm install
npm run build            # -> mcp/dist/index.js

# 2) Register it in your IDE (pick the matching template)
#    Copilot dialect   -> hosts/mcp.copilot.json
#    VS Code / VS       -> hosts/mcp.vscode.json
#    Claude-style       -> hosts/mcp.claude-style.json
```
Then ask your assistant things like:
- *"Build a Fluent 2 sign-in form with dark mode."*
- *"Generate a Power BI theme from brand `#742774` and scaffold a PBIP report."*
- *"What's `borderRadiusMedium`? Give me a Fluent Combobox with a label."*
- *"Make my Power Apps canvas app match Fluent 2."*
- *"Review this component against Fluent 2 and accessibility."*

## Grounding & provenance (why it's trustworthy)
- **Design system:** crawled the official **fluent2.microsoft.design** — 69 public pages + **14 gated AI/Copilot component pages** (captured via authenticated employee session).
- **Tokens & components:** extracted from installed **`@fluentui/react-theme` / `@fluentui/tokens` / `@fluentui/react-components`** source (real values, not guesses) — 61 components catalogued with usage.
- **Power BI:** theme JSON **schema-validated** against `reportThemeSchema-2.155`; PBIP/PBIR scaffold validated against the official Fabric item schemas.
- **Power Platform & host integration:** grounded in Microsoft Learn with cited sources.

## Repo layout
```
plugin.json            # plugin manifest (+ mirrors in .claude-plugin/.codex-plugin/.github)
.mcp.json              # bundled MCP server registration (Copilot dialect)
AGENTS.md · CLAUDE.md  # portable instructions (fan out to most hosts)
agents/                # 6 agents (*.agent.md)
skills/                # 13 skills (SKILL.md)
mcp/                   # MCP server (src/, dist/, data/)
templates/pbip/        # PBIP/PBIR project template
hosts/                 # per-IDE MCP config templates + install guide
docs/                  # architecture + presentation
research/              # grounded research notes (design, code, powerbi, power platform, hosts)
assets/screenshots/    # Fluent 2 reference captures
```

## Docs
- [`docs/architecture.md`](docs/architecture.md) — how the pieces fit together.
- [`docs/presentation.md`](docs/presentation.md) — leadership presentation outline.

## License
MIT © Rohith Reddy Arasani. Fluent, Fluent 2, Power BI, and Power Platform are trademarks of Microsoft.
