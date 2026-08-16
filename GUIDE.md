# fluent-ui plugin: install and usage guide

A complete guide to installing and using the **fluent-ui** plugin, which helps you build and adopt **Microsoft Fluent 2 (Fluent UI 2.0)** across Web, Power BI, Power Platform, the native platforms (iOS, Android, Windows), Fluent 1 (v8) and Figma design-to-code, from any MCP-capable AI IDE.

- Live site: https://arasanirohithreddy.github.io/fluent-ui-plugin/
- Repository: https://github.com/ArasaniRohithReddy/fluent-ui-plugin
- Per-host install matrix: [`hosts/README.md`](hosts/README.md)

---

## 1. What it is

`fluent-ui` is an AI-assistant plugin made of three layers:

1. **MCP tools** (29): a portable, standard MCP server (stdio) that runs everywhere. It returns grounded Fluent 2 data and generates code, themes, and projects.
2. **Agents** (7): a router plus specialists for web, native (iOS/Android/Windows), Power BI, Power Platform, migration, and design review.
3. **Skills** (18) and **instructions** (`AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`): loaded natively by hosts that support them.

Everything is grounded in the official `fluent2.microsoft.design` site and the real `@fluentui` packages, so results are verified, not guessed.

## 2. Prerequisites

- **Node.js 18 or newer** (the MCP server runs on Node).
- **Git** to clone the repository.

## 3. Install (two steps)

### Step 1: build the MCP server once

```bash
git clone https://github.com/ArasaniRohithReddy/fluent-ui-plugin.git
cd fluent-ui-plugin/mcp
npm install
npm run build          # produces mcp/dist/index.js
```

`main` is always green (every push is gated by CI), so cloning it is safe. If you would rather pin to a fixed, tested point instead of tracking `main`, clone a release tag:

```bash
git clone --branch v1.0.0 --depth 1 https://github.com/ArasaniRohithReddy/fluent-ui-plugin.git
```

Releases are listed at [/releases](https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases). To move to a newer one later, `git fetch --tags && git checkout v<x.y.z>`, then re-run `npm install && npm run build` and restart your host.

Every host launches the same command: `node <PATH>/fluent-ui-plugin/mcp/dist/index.js`. Replace `<PATH>` with where you cloned the repository.

### Step 2: register it in your host

The fastest path is the bundled helper, which registers `fluent-ui` into every AI IDE installed on your machine (absolute path, backs up each file, safe to re-run):

```bash
node hosts/register-mcp.mjs            # register into all installed hosts
node hosts/register-mcp.mjs --dry-run  # preview first, write nothing
node hosts/register-mcp.mjs --figma    # also register Figma's remote MCP server (OAuth is host-owned)
```

Then restart each host so it loads the tools. To register by hand instead, pick your host below. There are three MCP config dialects; templates live in [`hosts/`](hosts/).

| Host | MCP config file | Dialect |
|---|---|---|
| **GitHub Copilot CLI** | `~/.copilot/mcp-config.json` (or `/mcp add`) | `mcpServers` + `type: local` + `tools: ["*"]` |
| **GitHub Copilot desktop app** | inherits the Copilot CLI config | same as CLI |
| **VS Code / VS Code Insiders** | `.vscode/mcp.json` (or **MCP: Add Server**) | `servers` + `type: stdio` |
| **Visual Studio 2022 / 2026** | bundled `.vscode/mcp.json`, or `%USERPROFILE%\.mcp.json` | `servers` + `type: stdio` |
| **Cursor** | `.cursor/mcp.json` or `~/.cursor/mcp.json` | `mcpServers` (no type) |
| **Claude Desktop / Claude Code** | `claude_desktop_config.json` / `.mcp.json` | `mcpServers` (no type) |
| **Gemini CLI** | `~/.gemini/settings.json` | `mcpServers` (no type) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` (no type) |
| **Cline** | `cline_mcp_settings.json` | `mcpServers` (no type) |
| **Google Antigravity** | MCP config UI ("Open MCP Config") | `mcpServers` (no type) |

**Copilot dialect** (CLI, desktop app):
```json
{
  "mcpServers": {
    "fluent-ui": {
      "type": "local",
      "command": "node",
      "args": ["<PATH>/fluent-ui-plugin/mcp/dist/index.js"],
      "tools": ["*"]
    }
  }
}
```

**VS Code / Visual Studio dialect**:
```json
{
  "servers": {
    "fluent-ui": {
      "type": "stdio",
      "command": "node",
      "args": ["<PATH>/fluent-ui-plugin/mcp/dist/index.js"]
    }
  }
}
```

**Claude-style dialect** (Cursor, Claude, Gemini, Windsurf, Cline, Antigravity):
```json
{
  "mcpServers": {
    "fluent-ui": {
      "command": "node",
      "args": ["<PATH>/fluent-ui-plugin/mcp/dist/index.js"]
    }
  }
}
```

### Agents, skills, and instructions

Hosts that support them load these automatically from the repo:
- `AGENTS.md` (root): read by Copilot, VS Code, Cursor, Gemini, Windsurf, Cline.
- `CLAUDE.md` (root): Claude Code (imports `AGENTS.md`).
- `.github/copilot-instructions.md`: Copilot family, VS Code, Visual Studio.
- `agents/*.agent.md` and `skills/**/SKILL.md`: VS Code and Copilot.

Full per-host details, including where each file is discovered, are in [`hosts/README.md`](hosts/README.md).

## 4. How to use it

After installing, just ask your AI assistant in **natural language**. The router agent (`fluent-ui-builder`) picks the right specialist, skill, and MCP tool for your request. You do not call tools manually.

### Web (Fluent UI React v9 and Web Components)
- "Build an accessible Fluent 2 sign-in form with email and password."
- "Create a Fluent 2 dashboard card with a title, body, and a primary action."
- "What is the design token for the brand color?" (returns `colorBrandBackground` = `#0f6cbd`)
- "Give me the exact spacing and corner-radius tokens for a card."
- "Show me the Card component anatomy." (returns the official diagram URL)
- "Which Fluent component should I use for multi-select filtering?"

### Power BI
- "Make my Power BI report look like Fluent 2." (generates a Fluent theme JSON)
- "Scaffold a Fluent-themed PBIP/PBIR project called SalesReport."
- "Which Power BI visual should I use for part-to-whole, and what is its doc?"
- "How do I enable the Fluent 2 base theme in Power BI Desktop?"

### Power Platform
- "How do I apply Fluent 2 styling in a Power Apps canvas app?"
- "Generate a Fluent 2 PCF component skeleton."
- "What are the Fluent 2 guidelines for Power Pages?"

### Adopt or migrate existing UI
- "Migrate this Fluent UI v8 button to v9."
- "Convert these hardcoded hex values and pixels to Fluent 2 tokens."
- "Review this component against Fluent 2 and list what to fix."

### Native (iOS, Android, Windows)
- "What is the Fluent Avatar type on iOS, and is it SwiftUI or UIKit?"
- "Which Kotlin package do I import for a Fluent 2 Compose button on Android?"
- "Which Windows generation should I target — WinUI 3, WinUI 2, or the WPF Fluent theme?"

### Fluent 1 (v8) and Figma
- "Does `Nav` mean the same component in v8 and v9?" (returns the collision trap)
- "Give me the real v8 symbol and its v9 replacement for this component."
- "How do I go from a Figma frame to Fluent 2 code, and what are the rate limits?"

### Design guidance, tokens, and visuals
- "Summarize the Fluent 2 motion guidance."
- "Show the do and don't examples for buttons." (returns real image URLs)
- "Give me the Motion principle demo videos."

### Presets and persistent memory (optional, zero-config)
- "Set our brand color to #742774 and remember it."
- "We always use pill-shaped primary buttons. Remember that."
- "What presets and decisions are recorded for this project?"

With no config or memory present, everything still works using sensible built-in Fluent 2 defaults.

## 5. What is inside

**Agents** (`agents/*.agent.md`): `fluent-ui-builder` (router), `fluent-web-engineer`, `fluent-powerbi-designer`, `fluent-power-platform-engineer`, `fluent-native-engineer`, `fluent-migration-engineer`, `fluent-design-reviewer`.

**Skills** (`skills/**/SKILL.md`): web UI, theming, design tokens, design language, accessibility, AI/Copilot UI, Power BI theme, PBIP report, Power BI adoption, Power Apps, Power Pages, PCF, migration, design review, config, Fluent 1 (v8), native (iOS/Android/Windows), and Figma.

**MCP tools** (29): `fluent_generate_powerbi_theme`, `fluent_scaffold_pbip`, `fluent_pbir_audit`, `fluent_pbir_apply_theme`, `fluent_pbir_normalize_inline`, `fluent_pbir_verify`, `fluent_powerbi_visuals`, `fluent_powerplatform_guidance`, `fluent_accessibility_checklist`, `fluent_list_tokens`, `fluent_get_token`, `fluent_search_components`, `fluent_get_component`, `fluent_generate_theme`, `fluent_generate_code`, `fluent_design_guidance`, `fluent_migration_guidance`, `fluent_get_images`, `fluent_icon_search`, `fluent_get_config`, `fluent_init_config`, `fluent_set_config`, `fluent_remember`, `fluent_recall`, `fluent_v8_lookup`, `fluent_v8_guidance`, `fluent_figma_guidance`, `fluent_native_component`, `fluent_native_guidance`.

## 6. Verify it is working

Ask your host to run a tool directly, for example:
- "Run `fluent_accessibility_checklist`."
- "Run `fluent_powerbi_visuals` for the AI-powered category."

If you get a grounded Fluent 2 response, the plugin is live.

## 7. Troubleshooting

- **The tools do not appear.** Confirm `mcp/dist/index.js` exists (run `npm run build` in `mcp/`), and that the path in your config is correct and absolute.
- **Wrong dialect.** Copilot uses `mcpServers` with `type: local`; VS Code and Visual Studio use `servers` with `type: stdio`; everything else uses `mcpServers` with no `type`.
- **Node version.** Use Node 18 or newer.
- **Visual Studio.** Do not use the `mcpServers` shape; it reads the `servers` / `stdio` dialect only.

## 8. Links

- Live site: https://arasanirohithreddy.github.io/fluent-ui-plugin/
- Per-host install matrix: [`hosts/README.md`](hosts/README.md)
- Coverage report: [`docs/COVERAGE.md`](docs/COVERAGE.md)
- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Official Fluent 2 site: https://fluent2.microsoft.design
