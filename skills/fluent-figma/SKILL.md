---
name: fluent-figma
description: Turn Figma designs into Fluent 2 code with the Figma MCP server — entitlement reality (seat/plan rate limits, the client-catalog allowlist), remote vs desktop server, the design-context flow, mapping Figma variables to Fluent v9 tokens, the community plugins Microsoft links, and the DTCG token export that pushes Fluent tokens INTO Figma. Use when a Figma link or frame is the input, or when tokens need to go the other way.
---

# Figma → Fluent 2

The **Figma MCP server** feeds design context to an agent; this skill turns it into real `@fluentui/react-components` v9 code. Data: `mcp/data/figma.json`. Hosts: `hosts/figma.md`.

> It is the **Figma MCP server**. "Dev Mode MCP server" is the retired name — most guides are stale and still use it, plus the old tool names `get_code` / `get_image`.

## Read this first — the paywall is real

Access is a **rate limit, not an on/off switch**. Anyone can connect; low-tier users just run out, usually mid-task.

| Seat | Starter | Professional | Organization | Enterprise |
|---|---|---|---|---|
| **View, Collab** | up to 20 / **month** | up to 6 / **month** | up to 6 / **month** | up to 6 / **month** |
| **Dev, Full** | 20 / month (plan cap) | 200/day · 10/min | 200/day · 15/min | 600/day · 20/min |

**A View/Collab seat gets 6 calls a month on a paid plan — and 20 on Starter, the one place the seat cap is *not* 6.** The flow below costs 3–5 calls per frame, so even 20 is four frames. **A Dev seat on Professional is the realistic floor.** Say so *before* the job, not after they hit the wall.

> Corrected 2026-08: this table used to say 6/month everywhere. Figma's own page gives View/Collab on **Starter** "Up to 20/month", and its remediation prose reads *"If you're on a Starter plan (20 tool calls per month), upgrade to a Pro, Organization, or Enterprise plan."* Figma leaves the Dev/Full × Starter cell blank; that prose states the Starter cap as a **plan** fact, so read 20/month for a Starter user whatever their seat. Source: <https://developers.figma.com/docs/figma-mcp-server/rate-limits-access/>

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
| Rate limit hit mid-task | View/Collab seat (6/month on a paid plan, 20 on Starter) or a Starter plan → no in-tool fix; warn up front. |
| Every call unauthorized | Host not in the catalog, or OAuth never completed. |

**Platform routing:** Fluent 2 Web → v9 · **iOS** → `fluentui-apple` (Figma ships a `figma-swiftui` skill) · **Android** → `fluentui-android` Compose · **Windows UI Kit** → WinUI 3. Never emit React for a mobile or Windows kit.

> **The Android kit alias is dead.** `https://aka.ms/Fluent2Toolkits/Android/Figma` — still published on `fluent2.microsoft.design/get-started/design` — 302s to `bing.com?ref=aka&shorturl=…`, the fallback aka.ms serves for an unregistered short link. Hand out the direct URL instead: `https://www.figma.com/community/file/836835062056249539/microsoft-fluent-android` (from `microsoft/fluentui`'s own `ResourcesDesignResources.md`). The Web and iOS aliases still 301 correctly.

## Community plugins — link ≠ authorship

`fluent_figma_guidance { section: "plugins" }`. **We cannot run, invoke, automate, or trigger a Figma plugin.** Plugins execute only inside the Figma editor's sandbox, launched by a signed-in human. `use_figma` writes to a canvas through Figma's *own* Plugin API bridge — that is not running a community plugin, and it can't be pointed at one. Say what we can do (name the plugin, generate the file it eats) and stop.

| Plugin | Provenance |
|---|---|
| **Variables Import** | **Microsoft — proven.** `microsoft/figma-variables-import` `manifest.json` declares `"id":"1253424530216967528"`, the exact id in the community URL; `package.json` author `Travis Spomer <travis@microsoft.com>`; MIT, © 2023 Microsoft. |
| Accessibility Assistant (was *A11y – Focus Order*) · A11y – Color Contrast Checker · Content Reel · Icon Scaling Tool | **Linked** by Microsoft from the Resources section of `fluent2.microsoft.design` — a recommendation, **not** authorship. `publisher: null`, `official: false`. |
| Token Mapper | Cited by `microsoft/microsoft-ui-xaml` for **XAML ThemeResource** keys. Windows-scoped; not a web token mapper. |

Never describe an `official:false` plugin as first-party. The community page's own JSON-LD `creator` is **not** usable evidence — it returns the same third party on Content Reel *and* on Variables Import, which Microsoft provably wrote. `figma.com/community/*` answers an intermittent JS bot challenge: **HTTP 202 with an empty body means unverifiable, never dead** (~1 attempt in 4 returns the real page).

## Push tokens the other way — DTCG export

The Figma MCP server only reads *out* of Figma. **Variables Import** reads DTCG JSON *in*, so this is the only route from code tokens to Figma Variables.

```
fluent_figma_guidance { section: "tokens-export" }                 # plan, manifest, samples, gaps
fluent_figma_guidance { section: "tokens-export", dtcgFile: "light", maxChars: 200000 }
node scripts/figma/dtcg-export.mjs --out ./fluent-dtcg             # write the real files
```

Emits two collections — **Fluent Global** (brand ramps, spacing, radius, stroke, font size/family/weight, line height, durations) and **Fluent Theme** (modes *Light*, *Dark*, *HighContrast*). Only types that are **both** DTCG *and* handled by the plugin are used: `color`, `dimension`, `duration`, `number`, `fontFamily`, `fontWeight`. Every token carries `$extensions.codeSyntax = "tokens.<name>"` — after import, `get_variable_defs` answers with the real Fluent token name instead of a path you have to guess.

**Not expressible, by design:** `shadow` (multi-layer CSS; Figma has no shadow *variable* — shadows are effect styles), motion **curves** (`cubic-bezier`; no Figma curve type), and the **typography ramp** composites (Figma models those as text styles — the primitives *are* exported). Emit nothing the plugin would reject.

**Traps.** Never use the plugin's convenience type `fontSize`: it runs values through rem→px, so `"14px"` becomes **224**. Use `dimension`. The colour parser accepts only `#RRGGBB`/`#RRGGBBAA` — `rgba(...)` and `transparent` are converted first. And verbatim from the README, cross-file aliases are source-build-only: *"The following are supported **only** when running a local copy of this plugin, not from the Figma Community: Aliases to any other supported token in a different JSON file and Figma file, if the other Figma file has published the variables to a team library."* This export sidesteps it by emitting literal values and no aliases.

**`create_design_system_rules`** is an MCP **prompt**, not a tool — an agent can't call it, and "not all agents and clients support MCP prompts." This skill *is* the ruleset.

## Learn more
| Topic | How to find |
|---|---|
| Servers, limits, per-host registration, kit URLs | `mcp/data/figma.json` · `hosts/figma.md` |
| Community plugins + provenance · DTCG token export | `fluent_figma_guidance { section: "plugins" }` · `{ section: "tokens-export" }` · `scripts/figma/dtcg-export.mjs` |
| Fluent Figma kits · Figma MCP docs | `https://www.figma.com/@microsoft` · `https://developers.figma.com/docs/figma-mcp-server/` |
| Fluent tokens & components | MCP `fluent_get_token` · skills `fluent-design-tokens`, `fluent-web-ui` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
