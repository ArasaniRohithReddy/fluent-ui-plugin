---
name: fluent-figma
description: Turn Figma designs into Fluent 2 code with the Figma MCP server — entitlement reality (seat/plan rate limits, the client-catalog allowlist), remote vs desktop server, the design-context flow, and mapping Figma variables to Fluent v9 tokens. Use when a Figma link or frame is the input.
---

# Figma → Fluent 2

The **Figma MCP server** feeds design context to an agent; this skill turns it into real `@fluentui/react-components` v9 code. Data: `mcp/data/figma.json`. Hosts: `hosts/figma.md`.

> It is the **Figma MCP server**. "Dev Mode MCP server" is the retired name — most guides are stale and still use it, plus the old tool names `get_code` / `get_image`.

## Read this first — the paywall is real

Access is a **rate limit, not an on/off switch**. Anyone can connect; low-tier users just run out, usually mid-task.

| Seat | Starter | Professional | Organization | Enterprise |
|---|---|---|---|---|
| **View, Collab** | 6 / **month** | 6 / **month** | 6 / **month** | 6 / **month** |
| **Dev, Full** | 6 / month | 200/day · 10/min | 200/day · 15/min | 600/day · 20/min |

**A View/Collab seat, or any Starter plan, gets ~6 tool calls per month — enough to fail, not enough to work.** The flow below costs 3–5 calls per frame. **A Dev seat on Professional is the realistic floor.** Say so *before* the job, not after they hit the wall.

`whoami` is **rate-limit exempt** and reports plans + seat type — call it first to diagnose entitlement (`add_code_connect_map` and `generate_figma_design` are also exempt). Also gated: **write-to-canvas** needs a Full or Dev seat on a paid plan (Dev is read-only outside drafts); **Code Connect needs Organization or Enterprise**.

## The catalog gate — a hard blocker

> "Only clients listed in the Figma MCP Catalog can connect to the Figma MCP Server."

If a host isn't allowlisted, a *perfectly correct* config entry still fails at authorization. Figma publishes first-party install steps for **VS Code, Cursor, Claude Code, Codex, Gemini CLI** (and Xcode). **Copilot CLI, Windsurf, Cline, Claude Desktop, Antigravity, and Visual Studio appear in no Figma install doc** — call them unconfirmed, don't promise support. See `hosts/figma.md`.

## We never handle credentials

Auth belongs to **the host's OAuth flow** (remote) or **the signed-in Figma desktop session** (local). This plugin writes a URL and a `type` — nothing else. Never ask for, store, cache, proxy, or forward a Figma token; never put an `Authorization`/`X-Figma-Token` header in a config file; never register an OAuth client or drive the consent screen. Personal access tokens are REST-API-only and **not supported for MCP** (the server advertises only `Bearer` + scope `mcp:connect`). If calls are unauthorized, the user runs their host's auth step.

## Which server

**Remote (recommended)** — `https://mcp.figma.com/mcp`, transport `streamable-http`, no desktop app. Link-only: every request needs a `?node-id=` link. Exclusive tools: `download_assets`, `search_design_system`, `get_libraries`, `whoami`.

**Local / desktop** — `http://127.0.0.1:3845/mcp`, transport `http`. Figma now calls this niche — "some specific organization and enterprise use cases." Needs the **Figma desktop app running** with **Dev Mode** (`Shift+D`) and the desktop MCP server enabled from the inspect panel. Its one advantage is selection-based prompting. Never use `/sse`.

## Before you call anything

1. **Tools present?** If `get_design_context` is missing, stop and point the user at `hosts/figma.md`. **Never fabricate design data.**
2. **Entitlement** — `whoami`, then warn if View/Collab or Starter.
3. **Node-specific link** — *Copy link to selection* (`?node-id=…`). A file-only URL fails on remote; reject it.
4. **Both libraries on** — Fluent ships tokens in a **separate** file from components, so the **Fluent 2 Core UI Kit** *and* the **Fluent 2 design language** library must both be enabled or variables won't resolve.

## The flow

`get_metadata` (large frames first — big selections truncate) → `get_code_connect_map` → `get_design_context` with `clientFrameworks: "React"` + `clientLanguages` → `get_variable_defs` → `get_screenshot` → `download_assets` (remote, ≤20 nodes/call).

Figma's priority order for what comes back: **Code Connect snippet > component doc links > design annotations > design tokens > raw hex / absolute positioning (lean on the screenshot).**

## Translate — never paste

`get_design_context` returns **React + Tailwind**, and Figma is explicit that "the server isn't designed to return production-ready code… treat it as a REFERENCE." Emit v9 + Griffel `makeStyles` + `tokens.*`. **Tailwind must never land in a Fluent project.**

**Tokens.** `get_variable_defs` returns names *as authored* — Fluent's global/alias model means path-style names like `Brand/Background/Default` or `Spacing/Horizontal/M`, not `colorBrandBackground`. Prefer any **code syntax** value returned (Figma passes that exact string through) — *but whether Microsoft populates code syntax in the published kits is unverified*, so plan to map by name: `Brand/Background/Default → tokens.colorBrandBackground` · `Spacing/Horizontal/M → tokens.spacingHorizontalM` · radius → `tokens.borderRadius*` · elevation → `tokens.shadow*`. Confirm with `fluent_get_token`. **Never emit a raw hex or px that duplicates a token.**

**Components.** Without Code Connect the server has no component identity — map the Figma component name + variants to the Fluent v9 component + props yourself (`fluent_get_component`). **Microsoft publishes no official Code Connect mappings for Fluent**, and no community ones were found either — don't claim otherwise. An Org/Enterprise team can author their own on a duplicated Fluent library — the only deterministic route.

**Structure.** `FluentProvider` (`webLightTheme`/`webDarkTheme`) · icons from `@fluentui/react-icons`, never inline `<svg>` · Auto Layout → flex + spacing tokens. **Verify** against `get_screenshot`, then `fluent_accessibility_checklist`.

## Gotchas

| Symptom | Cause → fix |
|---|---|
| `<div className="bg-[#0f6cbd]">` not `<Button appearance="primary">` | No Code Connect → map component identity yourself. |
| Hardcoded hex; inline styles / Tailwind | Figma names ≠ Fluent names; agent copied the reference idiom → map by name, rewrite as `makeStyles`. |
| No `FluentProvider`; absolute positioning | Not expressible in a frame; frame lacked Auto Layout → add the provider, rebuild as flex/grid. |
| Variables come back unresolved | Design language library off → enable both libraries. |
| Images break a week later | Asset URLs expire in **~7 days** → download and commit now. |
| Rate limit hit mid-task | View/Collab or Starter → no in-tool fix; warn up front. |
| Every call unauthorized | Host not in the catalog, or OAuth never completed. |

**Platform routing:** Fluent 2 Web → v9 · **iOS** → `fluentui-apple` (Figma ships a `figma-swiftui` skill) · **Android** → `fluentui-android` Compose · **Windows UI Kit** → WinUI 3. Never emit React for a mobile or Windows kit.

**`create_design_system_rules`** is an MCP **prompt**, not a tool — an agent can't call it, and "not all agents and clients support MCP prompts." This skill *is* the ruleset.

## Learn more
| Topic | How to find |
|---|---|
| Servers, limits, per-host registration, kit URLs | `mcp/data/figma.json` · `hosts/figma.md` |
| Fluent Figma kits · Figma MCP docs | `https://www.figma.com/@microsoft` · `https://developers.figma.com/docs/figma-mcp-server/` |
| Fluent tokens & components | MCP `fluent_get_token` · skills `fluent-design-tokens`, `fluent-web-ui` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
