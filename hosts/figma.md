# Registering Figma's MCP server per host

This page is about **Figma's own MCP server** — a *third-party* server that gives an agent design context from a Figma file. It is separate from `fluent-ui`'s MCP server (see `hosts/README.md` for that one). Registering it is **opt-in**: it points a host at a third-party network endpoint, so never add it silently.

Grounded reference data for everything below lives in `mcp/data/figma.json`; the agent-facing workflow lives in `skills/fluent-figma/SKILL.md`.

> Naming: the product is the **Figma MCP server**. "Dev Mode MCP server" is the retired name, and most published guides are stale.

## Read this before you register anything

**1. Two hard gates, and neither is ours to fix.**

- **Rate limits go by _seat_, not plan** — this is the detail people get backwards. A **View/Collab seat gets ~6 tool calls per month** (and, counter-intuitively, **20/month on Starter** — Starter is the most generous tier for that seat). **Dev/Full seats get 200/day** on Professional and Organization, **600/day** on Enterprise. **A Dev seat is the realistic floor** — 6 a month is enough to fail, not enough to work. Code Connect additionally requires **Organization or Enterprise**. Tell the user before they start. Source: <https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/>
- **The client catalog.** *"Only clients listed in the [Figma MCP Catalog](https://www.figma.com/mcp-catalog/) can connect to the Figma MCP Server."* If a host isn't allowlisted, a perfectly correct config entry **still fails at authorization**. `fluent-ui` cannot register itself as an OAuth client, and there is no workaround.

**2. We never handle credentials.** Auth is the **host's** OAuth flow (remote) or the **signed-in Figma desktop session** (local). Write a URL and a `type` — nothing else. Never write an `Authorization` or `X-Figma-Token` header into a config file (these files are plaintext and often synced), never prompt for a Figma token, and never store, cache, proxy, or forward one. Personal access tokens are a **REST API** mechanism and are **not supported for the MCP server**.

**3. Never use `/sse`.** Figma publishes only `/mcp` endpoints; SSE is legacy and Claude Code marks it deprecated.

## The two servers

| | **Remote — recommended** | **Local / desktop** |
|---|---|---|
| Endpoint | `https://mcp.figma.com/mcp` | `http://127.0.0.1:3845/mcp` |
| Transport | `streamable-http` | `http` |
| Figma desktop app | not needed | **required, running** |
| Enablement | OAuth in the host | Design file → **Dev Mode** (`Shift+D`) → inspect panel → **Enable desktop MCP server** |
| Selection prompting | ❌ link-only (`?node-id=`) | ✅ |
| Exclusive tools | `download_assets`, `search_design_system`, `get_libraries`, `whoami` | — |

Figma positions the local server as niche — *"for some specific organization and enterprise use cases, but we strongly recommend using the remote version."* Use the same per-host shapes below, swapping the URL and naming the entry `figma-desktop`.

## Catalog status of the hosts we support

Figma's catalog page is JS-rendered and could not be read directly, so "confirmed" below means **Figma publishes first-party install instructions for that host**.

| Host | In Figma's install docs | Config shape verified | Register it? |
|---|---|---|---|
| VS Code | ✅ | ✅ | Yes |
| Cursor | ✅ | ✅ | Yes |
| Claude Code | ✅ | ✅ | Yes |
| Codex | ✅ | CLI command only | Yes, via CLI |
| Gemini CLI | ✅ | ✅ | Yes |
| VS Code Insiders / VSCodium | ❌ | same dialect as VS Code | Only if the user accepts it may not connect |
| GitHub Copilot CLI | ❌ | shape verified from `github/github-mcp-server` | Unconfirmed — warn first |
| Windsurf | ❌ | secondary sources only | Unconfirmed — warn first |
| Cline | ❌ | secondary sources only | Unconfirmed — warn first |
| Claude Desktop | ❌ | n/a — `mcpServers` is stdio-only | **No.** Use the Connectors UI |
| Google Antigravity | ❌ | ❌ nothing verified | **No.** Don't guess |
| Visual Studio 2022/2026 | ❌ | ❌ nothing verified | **No.** Don't guess |

**Do not imply universal support.** Copilot CLI, Windsurf, Cline, Claude Desktop, Antigravity, and Visual Studio are named in **no** Figma install doc — say so rather than guessing.

---

## Confirmed hosts

### VS Code — user `mcp.json` (`MCP: Open User Configuration`) or `.vscode/mcp.json`
Key `servers`, `type` **`"http"`**.
```json
{
  "servers": {
    "figma": { "type": "http", "url": "https://mcp.figma.com/mcp" }
  }
}
```
Auth: start the `figma` server in the MCP view → browser opens → **Allow Access**. VS Code requires **GitHub Copilot enabled** on the account to use MCP at all. Figma's own doc also shows an optional `"inputs": []` sibling key. Local variant: same shape, id `figma-desktop`, url `http://127.0.0.1:3845/mcp`.

### Cursor — `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project)
Key `mcpServers`; Cursor infers HTTP from `url`, and Figma's official snippet omits `type`.
```json
{
  "mcpServers": {
    "figma": { "url": "https://mcp.figma.com/mcp" }
  }
}
```
Auth: **Settings → MCP → Connect → Open → Allow access**. Figma's preferred path is its Cursor plugin — type `/add-plugin figma` in agent chat (bundles MCP config + skills + asset rules).

### Claude Code — `.mcp.json` or `~/.claude.json`
CLI (recommended):
```bash
claude mcp add --scope user --transport http figma https://mcp.figma.com/mcp
```
JSON form — **`type` is mandatory**; `streamable-http` is accepted as an alias for `http`:
```json
{
  "mcpServers": {
    "figma": { "type": "http", "url": "https://mcp.figma.com/mcp" }
  }
}
```
> ⚠️ **`hosts/README.md` documents the Claude-style dialect as `type` *(omit)*.** That is correct for **stdio**, but Claude Code hard-fails on a `url` entry with no `type`: `MCP server "<name>" has a "url" but no "type"; add "type": "http"`. **Always emit `"type": "http"` for HTTP entries.**

Auth: `/mcp` → `figma` → **Authenticate** → **Allow Access**. Figma also ships a plugin: `claude plugin install figma@claude-plugins-official`.

### Codex
```bash
codex mcp add figma --url https://mcp.figma.com/mcp
```
Then authenticate when prompted. Figma documents the CLI command only — **no on-disk config shape is verified**, so don't hand-edit a Codex config file for this.

### Gemini CLI — `~/.gemini/settings.json` or project `.gemini/settings.json`
Official path:
```bash
gemini extensions install https://github.com/figma/mcp-server-guide
# then, inside gemini:
/mcp auth figma
```
Gemini's dialect uses **`httpUrl`** (not `url`) plus an explicit `oauth` block:
```json
{
  "mcpServers": {
    "figma": { "httpUrl": "https://mcp.figma.com/mcp", "oauth": { "enabled": true } }
  }
}
```

---

## Unconfirmed hosts — register only after warning the user

The config shapes here are the best available, but **Figma does not document these clients**, so the catalog gate may reject them at authorization no matter how the file is written.

### GitHub Copilot CLI — `~/.copilot/mcp-config.json`
Key `mcpServers`, `type` **`"http"`** (Copilot CLI's vocabulary is `local`/`http`, not VS Code's `stdio`). Shape verified from `github/github-mcp-server`'s own remote-server example, **not** from Figma.
```json
{
  "mcpServers": {
    "figma": { "type": "http", "url": "https://mcp.figma.com/mcp", "tools": ["*"] }
  }
}
```
⚠️ Whether Copilot CLI performs the Figma OAuth flow for a third-party remote server is **unverified**.

### Windsurf — `~/.codeium/windsurf/mcp_config.json`
Windsurf uses **`serverUrl`**, not `url` — the wrong key fails **silently**.
```json
{
  "mcpServers": {
    "figma": { "serverUrl": "https://mcp.figma.com/mcp" }
  }
}
```
⚠️ Secondary sources only. Windsurf's native OAuth handling for remote MCP is unconfirmed.

### Cline — `cline_mcp_settings.json` (path varies by VS Code profile — detect it, don't guess)
Cline uses **`streamableHttp`** (camelCase), unlike Claude Code's `streamable-http`.
```json
{
  "mcpServers": {
    "figma": { "type": "streamableHttp", "url": "https://mcp.figma.com/mcp", "disabled": false, "autoApprove": [] }
  }
}
```
⚠️ Secondary sources only.

### Claude Desktop — **do not write a `url` entry**
`claude_desktop_config.json`'s `mcpServers` is **stdio-only**; a raw `url` there is silently broken. Point the user at **Settings → Connectors → Add custom connector**, which handles OAuth. A community `npx mcp-remote` stdio bridge exists but is **not Figma-sanctioned and unverified for Figma** — don't ship it as our recommendation.

### Google Antigravity · Visual Studio 2022/2026
**Nothing verified** — no Figma documentation, no confirmed remote-MCP config shape for a third-party HTTP server. Do not write a Figma entry for these; tell the user we can't confirm it.

### Generic fallback (Figma's "other editors" snippet)
```json
{ "mcpServers": { "figma": { "url": "https://mcp.figma.com/mcp" } } }
```
This is a *shape*, not a claim of catalog support.

## `type` / URL-field cheat-sheet

| Host | Top key | Remote `type` | URL field |
|---|---|---|---|
| VS Code family | `servers` | `"http"` | `url` |
| Cursor | `mcpServers` | omit (or `"http"`) | `url` |
| Claude Code | `mcpServers` | **`"http"` required** | `url` |
| Copilot CLI | `mcpServers` | `"http"` | `url` |
| Gemini CLI | `mcpServers` | n/a | **`httpUrl`** + `oauth.enabled` |
| Windsurf | `mcpServers` | n/a | **`serverUrl`** |
| Cline | `mcpServers` | `"streamableHttp"` | `url` |
| Claude Desktop | `mcpServers` | **stdio only** → Connectors UI | n/a |

## After registering — print this, don't automate it

```
Figma MCP registered (remote, https://mcp.figma.com/mcp).
ACTION REQUIRED — complete sign-in inside your host:
  VS Code      : start "figma" in the MCP view -> Allow Access
  Cursor       : Settings -> MCP -> Connect -> Allow access
  Claude Code  : /mcp -> figma -> Authenticate
  Gemini CLI   : /mcp auth figma
  Codex        : authenticate when prompted
fluent-ui never sees or stores your Figma credentials.
```

## Verify & troubleshoot

- **Reachability (safe, unauthenticated):** `curl https://mcp.figma.com/.well-known/oauth-protected-resource` — returns Figma's public discovery document. Useful to distinguish a corporate proxy from an auth problem.
- **Tools live?** Ask the host to run **`whoami`** — it's rate-limit exempt and reports plans and seat type, so it also tells you whether the user has a workable entitlement.
- **Connects but everything is unauthorized** → the host isn't in the catalog, or OAuth was never completed.
- **Entry written but the server never appears** → wrong key or field for that dialect (`serverUrl` vs `httpUrl` vs `url`), or a missing `"type"` on Claude Code. See the cheat-sheet.
- **Restart the host** (or reload its MCP servers) after editing any config.

## What we must never do

| ❌ | Why |
|---|---|
| Register an OAuth client at `api.figma.com/v1/oauth/mcp/register` | Client allowlist; arguably breaches the Figma Developer Terms |
| Automate or scrape `https://www.figma.com/oauth/mcp` | Credential mishandling |
| Ask for, store, cache, or proxy a Figma PAT or OAuth token | Not supported by MCP; unacceptable risk |
| Inject `Authorization` / `X-Figma-Token` headers into a host config | Writes a secret into a plaintext, often-synced file |
| Write a Figma entry without an explicit opt-in | Surprising third-party network config |
| Put a `url` entry in `claude_desktop_config.json` | Silently broken (stdio-only) |
| Claim a host is supported because the JSON shape looks right | The catalog gate decides, not the file |
