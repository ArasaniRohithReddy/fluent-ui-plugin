# Architecture

`fluent-ui` has three cooperating layers plus a grounded data layer.

```
                         ┌─────────────────────────────────────────────┐
   User in any IDE  ──▶  │  Agents (agents/*.agent.md)                  │
   (Copilot, VS Code,    │   fluent-ui-builder ─ router                │
    Cursor, Claude, …)   │   web · powerbi · power-platform · reviewer │
                         └───────────────┬─────────────────────────────┘
                                         │ load for depth
                         ┌───────────────▼─────────────────────────────┐
                         │  Skills (skills/<name>/SKILL.md) × 14        │
                         │   web-ui · theming · tokens · a11y · ai …    │
                         └───────────────┬─────────────────────────────┘
                                         │ call for facts / generation
                         ┌───────────────▼─────────────────────────────┐
                         │  MCP server (mcp/, stdio) — 18 tools         │
                         │   components · tokens · theme · powerbi …    │
                         └───────────────┬─────────────────────────────┘
                                         │ reads
                         ┌───────────────▼─────────────────────────────┐
                         │  Grounded data (mcp/data/, templates/)       │
                         │   fluent-tokens · fluent-components(+usage)  │
                         │   powerbi-theme.base · powerplatform · pbip  │
                         └─────────────────────────────────────────────┘
```

## Layers

**Agents** (`agents/*.agent.md`) — orchestration. A primary router (`fluent-ui-builder`) plus five specialists. Frontmatter declares `name`, `description`, and the `skills` each may load. They *do the work* and call MCP tools; they never hardcode Fluent values.

**Skills** (`skills/<name>/SKILL.md`) — grounded, task-specific knowledge (14). Each carries concise Fluent 2 guidance + a Microsoft-Learn / `mslearn` CLI lookup path. Skills are read natively by Copilot, VS Code, Cursor, Claude Code, etc.

**MCP server** (`mcp/`, Node + TypeScript, `@modelcontextprotocol/sdk`) — deterministic tools that make the guidance executable. Tool modules live in `mcp/src/tools/`; `mcp/src/util.ts` loads data + color math. Built to `mcp/dist/index.js` (stdio). The config tools (`fluent_get_config`, `fluent_init_config`, `fluent_set_config`, `fluent_remember`, `fluent_recall`) additionally read/write two optional **user-project** files — `fluent.config.json` (presets) and `.fluent/memory.json` (resolved presets + append-only decision log) — resolving each setting as **config > memory > built-in Fluent 2 default** (zero-config safe; never throws on missing files).

**Data** (`mcp/data/`, `templates/`) — the source of truth the tools serve:
- `fluent-tokens.json` — 366 color tokens × light/dark/high-contrast + type ramp, spacing, radius, stroke, shadow, motion (extracted from `@fluentui/react-theme` + `@fluentui/tokens`).
- `fluent-components.json` — 99 components (incl. 33 AI/Copilot) with real props from `.d.ts`.
- `fluent-components-usage.json` — 61 usage entries (when-to-use, anatomy, do/don't) from the official site.
- `powerbi-theme.base.json` (+ `powerbi-visual-defaults.json`) — schema-valid Fluent Power BI theme.
- `powerplatform.json` — Power Apps / Power Pages / PCF guidance.
- `design-guidance.json` — Fluent 2 design-language foundations (color, typography, layout, elevation, iconography, motion, shapes, material, content, responsible AI).
- `fluent-images.json` — media index: every diagram, do/don't example, anatomy illustration and Motion video from the site with its real CDN URL + alt text (vision-OCR-recovered where the site alt was empty); powers `fluent_get_images`.
- `migration.json` — adopt/migrate scenarios (Fluent UI v8→v9, from another design system, hardcoded→tokens, per-surface).
- `templates/pbip/` — schema-valid PBIP/PBIR project the scaffolder clones.

## Data flow (example)
"Generate a theme from `#742774`" → agent/skill → `fluent_generate_theme` → builds a 16-slot `BrandVariants` ramp → returns `createLightTheme`/`createDarkTheme` code + CSS vars. The app runs the official builders, so the final theme is authentic.

**Presets:** at the start of a task an agent calls `fluent_get_config`, which reads the user's optional `fluent.config.json` + `.fluent/memory.json` and returns the resolved presets (config > memory > default) with a per-field `source` plus `configExists` / `memoryExists`. On a first run (no config, no `presets-optout`) it offers to scaffold presets via `fluent_init_config`; clarified choices are appended to `.fluent/memory.json` with `fluent_remember`. With neither file present it returns the all-defaults object — zero-config still builds.

## Host fan-out
The MCP server is universal (stdio). Instructions fan out via `AGENTS.md` (Copilot, VS Code, Cursor, Gemini, Windsurf, Cline), `CLAUDE.md` (Claude Code), and `.github/copilot-instructions.md` (+ `.github/prompts/`). Per-IDE MCP config templates live in `hosts/`. See `hosts/README.md`.

## Extending
- **New token/component data** → update `mcp/data/*.json` (tools pick it up; no code change).
- **New tool** → add `mcp/src/tools/<x>.ts` (`registerX(server)`) + call it in `mcp/src/index.ts`.
- **New skill/agent** → add `skills/<name>/SKILL.md` / `agents/<name>.agent.md`.
- Rebuild: `cd mcp && npm run build`. Smoke test: `node mcp/smoke.mjs`.
