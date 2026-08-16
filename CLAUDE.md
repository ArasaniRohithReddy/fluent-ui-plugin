# CLAUDE.md

This project is the **fluent-ui** plugin (agents + skills + MCP server) for building **Microsoft Fluent 2 (Fluent UI 2.0)** UIs across Web, Power BI, Power Platform, and the native platforms — iOS, Android and Windows. It also adopts/migrates existing UIs to Fluent 2, including Fluent UI **v8 → v9**.

Full guidance — MCP tools, golden rules, surface quickstarts, skills, and agents — lives in **AGENTS.md**:

@AGENTS.md

Quick reminders:
- Never hardcode token values — use the `fluent_get_token` / `fluent_list_tokens` MCP tools and consume `tokens.*` / CSS variables.
- Always wrap web apps in `FluentProvider` with a real theme; support light/dark/high-contrast.
- Pick components via `fluent_search_components` / `fluent_get_component`; validate a11y with `fluent_accessibility_checklist`.
- For **design-language foundations** (color, type, layout, elevation, iconography, motion, shapes, material, content, responsible AI) call `fluent_design_guidance`; to **adopt/migrate** an existing UI to Fluent 2 — Fluent UI **v8→v9** (Fluent 1 stays alongside Fluent 2), from another design system, or hardcoded → tokens — call `fluent_migration_guidance` (or route to the `fluent-migration-engineer` agent).
- To **show or link the official Fluent 2 visuals** — anatomy diagrams, do/don't examples, state/type illustrations, or Motion demo videos — call `fluent_get_images` (filter by `owner`/`kind`/`type`) and hand back the real source URLs. Never invent image links.
- **Presets & memory (optional, zero-config):** honor the user's `fluent.config.json` presets and `.fluent/memory.json` decisions with precedence **config > memory > Fluent 2 default**. Call `fluent_get_config` at the start of a task; make the one-time first-run offer (`fluent_init_config` on opt-in, else `fluent_remember` a `presets-optout` decision); record decisions with `fluent_remember` / `fluent_recall` and update via `fluent_set_config`. Everything still works with no config — load the `fluent-config` skill.
- **Honor `guidelines`:** the resolved config carries the team's own rules verbatim in `guidelines.rules` / `guidelines.constraints`. Apply the rules, and treat a constraint as outranking every preset and inferred default — raise the conflict instead of overriding it silently.
- **Native platforms (iOS / Android / Windows):** call `fluent_native_component` / `fluent_native_guidance`. A component's *name* is shared across platforms; its *type* is not — never translate the web API into Swift, Kotlin or XAML by hand. On Android both generations ship in the **same Maven artifacts**, separated only by Kotlin package (`tokenized.*` = Fluent 2 Compose, `<area>.*` = Fluent 1 Views).
- **Fluent 1 (v8):** call `fluent_v8_lookup` / `fluent_v8_guidance`. v8 and v9 export **the same names** for different components, so the wrong import compiles cleanly and then misbehaves at runtime.
- **Figma:** call `fluent_figma_guidance` — and check entitlement *before* promising a workflow: a **View/Collab** seat gets ~6 tool calls per **month** (20 on Starter), a **Dev/Full** seat 200/day. Auth is the host's own OAuth flow; never ask for, store or forward a Figma token.
- Skills live in `skills/<name>/SKILL.md`; agents in `agents/*.agent.md`; MCP server at `mcp/dist/index.js`.
