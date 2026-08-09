# Installing `fluent-ui` across IDEs, editors & agents

`fluent-ui` has two layers:

1. **MCP server (universal)** — a standard stdio server that runs everywhere. This is the portable core.
2. **Agents / Skills / Instructions** — loaded natively by hosts that support them (Copilot family, VS Code, Cursor, Claude Code, Gemini, Windsurf, Cline).

## Prerequisites (once)
```bash
cd mcp
npm install
npm run build     # produces mcp/dist/index.js
```
Launch command used by every host:
```
node "C:\Users\v-arasanir\Downloads\Rohith's Rough\fluent.ui\mcp\dist\index.js"
```
> Replace that path if you move the plugin. `npx` publish is optional; local `node` works everywhere today.

## Automated setup (recommended)
Instead of editing each host's config by hand, run the bundled helper once. It finds every AI IDE / host installed on your machine, registers `fluent-ui` with the **absolute** path to the built server (so it works from any workspace), backs up every file it touches, and is safe to re-run:
```bash
node hosts/register-mcp.mjs            # register into all installed hosts
node hosts/register-mcp.mjs --dry-run  # preview changes, write nothing
node hosts/register-mcp.mjs --path "C:\\path\\to\\fluent.ui\\mcp\\dist\\index.js"   # custom server path
```
It covers the GitHub Copilot CLI (`~/.copilot/mcp-config.json`), VS Code and VS Code Insiders (user `mcp.json`), VSCodium, Cursor, Windsurf, and Claude Desktop, using the correct dialect for each. Build the server first (above). **After it runs, restart each host** (or reload its MCP servers) so the `fluent_*` tools appear.

> Why this is needed: installing the plugin loads the **agents, skills, and instructions** automatically (they are Markdown the host reads natively), but the **MCP server is a separate process** each host must be told to launch. The repo's bundled `.mcp.json` uses a **relative** path that only resolves when your working directory is this repo, so from any other workspace the server can't be found. Registering the absolute path (what the helper does) fixes that everywhere. Prefer the manual per-host steps below if you want full control.

## The 3 MCP config "dialects"
Copy the matching template from this folder:
| Dialect | Top key | `type` | Extra | Template |
|---|---|---|---|---|
| **Copilot** (CLI, desktop app) | `mcpServers` | `local` | `"tools": ["*"]` | `hosts/mcp.copilot.json` |
| **VS Code / Visual Studio** | `servers` | `stdio` | — | `hosts/mcp.vscode.json` |
| **Claude-style** (Cursor, Claude, Gemini, Antigravity, Windsurf, Cline) | `mcpServers` | *(omit — see below)* | — | `hosts/mcp.claude-style.json` |

> **`type` is only omittable for stdio.** The *(omit)* above is correct for `fluent-ui` itself, which is a local stdio server. It does **not** generalise: a Claude-style entry that points at a **remote HTTP URL** must carry `"type": "http"` explicitly, or Claude Code fails to connect. If you add a hosted server (for example Figma's `https://mcp.figma.com/mcp`) alongside `fluent-ui`, set the type on that entry. Never write `"sse"` — it is deprecated.

> **Bundled configs:** this repo ships `.vscode/mcp.json` — VS Code, VS Code Insiders, and **Visual Studio** auto-discover it (`servers`/`stdio`, `${workspaceFolder}` path). The root `.mcp.json` is the **Copilot CLI / Claude Code** registration (`mcpServers`/`local` dialect); Visual Studio does **not** read that shape, so rely on `.vscode/mcp.json` there.

## Per-host setup

### 1. GitHub Copilot CLI  *(priority)*
- **MCP:** merge `hosts/mcp.copilot.json` into `~/.copilot/mcp-config.json` (or run `/mcp add`).
- **Agents/Skills/Instructions:** install this repo as a Copilot plugin (or place `agents/`, `skills/`, `AGENTS.md`, `.github/copilot-instructions.md` where Copilot discovers them). All auto-load.

### 2. VS Code & VS Code Insiders  *(priority)*
- **MCP:** copy `hosts/mcp.vscode.json` to `.vscode/mcp.json` (or run **MCP: Add Server**). Start the server from the MCP view.
- **Agents/Skills/Instructions:** VS Code natively reads `skills/**/SKILL.md`, `agents/*.agent.md`, `AGENTS.md`, and `.github/copilot-instructions.md` / `.github/instructions/**` / `.github/prompts/**`. No translation needed.

### 3. Visual Studio 2022 / 2026  *(priority)*
- **MCP:** Visual Studio auto-discovers the bundled **`.vscode/mcp.json`** (`servers`/`stdio`) — just start the server. For a user- or solution-level install, copy the `servers`/`stdio` shape from `hosts/mcp.vscode.json` to `%USERPROFILE%\.mcp.json` or `<solution>\.vs\mcp.json`. Do **not** put this shape in the root `.mcp.json` (that file is the Copilot/Claude dialect).
- **Instructions:** `.github/copilot-instructions.md` is honored. (Custom `.agent.md` agents aren't supported in VS yet.)

### 4. GitHub Copilot desktop app  *(priority)*
- Built on Copilot CLI — it inherits `~/.copilot/mcp-config.json` plus skills/agents/`AGENTS.md`. Use the Copilot dialect (`hosts/mcp.copilot.json`).

### 5. Cursor
- **MCP:** `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) using `hosts/mcp.claude-style.json`.
- **Rules:** Cursor reads `AGENTS.md`; optionally add `.cursor/rules/fluent-ui.mdc`. Skills via `SKILL.md`.

### 6. Claude Desktop / Claude Code
- **Claude Desktop:** add the server to `claude_desktop_config.json` (`mcpServers`, `hosts/mcp.claude-style.json`).
- **Claude Code:** `.mcp.json` (claude-style) + `CLAUDE.md` (imports `AGENTS.md`) + `skills/`.

### 7. Gemini CLI
- **MCP:** `~/.gemini/settings.json` (or project `.gemini/settings.json`) `mcpServers` → `hosts/mcp.claude-style.json`.
- **Instructions:** `GEMINI.md` / `AGENTS.md`.

### 8. Windsurf
- **MCP:** `~/.codeium/windsurf/mcp_config.json` (`hosts/mcp.claude-style.json`).
- **Rules:** `AGENTS.md` / workspace rules.

### 9. Cline
- **MCP:** `cline_mcp_settings.json` (`hosts/mcp.claude-style.json`).
- **Rules:** `.clinerules` / `AGENTS.md`.

### 10. Google Antigravity
- **MCP:** supported via the MCP config UI ("Open MCP Config", `mcpServers`). Verify the on-disk `mcp_config.json` path on your installed build.

## Instruction fan-out (author once)
- `AGENTS.md` (root) — read by Copilot, VS Code, Cursor, Gemini, Windsurf, Cline.
- `CLAUDE.md` (root) — Claude Code (imports `AGENTS.md`).
- `.github/copilot-instructions.md` — Copilot family, VS Code, Visual Studio.
- `.github/prompts/*.prompt.md` — reusable prompts (VS Code / Copilot).

Verify tools are live by asking the host to run **`fluent_accessibility_checklist`** or **`fluent_generate_powerbi_theme`**.
