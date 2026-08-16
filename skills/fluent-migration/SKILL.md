---
name: fluent-migration
description: Adopt or migrate an EXISTING app/report to Fluent 2 — Fluent UI v8 to v9 (shims, side-by-side, component mapping), from another design system (MUI/Chakra/Ant Design/Bootstrap), replacing hardcoded values with tokens, and per-surface adoption (Power BI, Power Apps, Power Pages, PCF). Use whenever someone already has UI and wants to move it to Fluent 2.
---

# Adopting / migrating to Fluent 2

Fluent 2 isn't only for greenfield UIs — this skill guides moving an **existing** app or report onto Fluent 2 incrementally. Call the `fluent_migration_guidance` MCP tool for structured, per-scenario steps, and **audit first** with the `fluent-design-review` skill.

## 1. Fluent UI React v8 → v9 (the big one)
v9 (`@fluentui/react-components`) is the code implementation of Fluent 2; v8 is `@fluentui/react` (legacy). Migrate **incrementally, side-by-side** — prefer full v9 for new code; use shims only to avoid a big-bang rewrite.
- **Packages:** `@fluentui/react-components` (v9); `@fluentui/react-migration-v8-v9` (shim components — v8 props, render v9 underneath); `@fluentui/react-portal-compat` (`PortalCompatProvider` so v9 overlays are themed inside a v8 tree).
- **Theme bridge:** `createV8Theme(brandColors, themeV9, isDarkTheme?, themeV8?)` runs v8 components under a v9-derived theme; `createV9Theme(themeV8, baseThemeV9?)` goes the other way when v8 owns the brand; `createBrandVariants(palette, interpolation?)` turns a v8 `IPalette` into a v9 brand ramp. All three from `@fluentui/react-migration-v8-v9`. Or generate a v9 brand theme from your brand color with `fluent_generate_theme` and wrap new UI in `FluentProvider`.
- **Component mapping (subset):** `DefaultButton/PrimaryButton/IconButton → Button`; `TextField → Input/Textarea in Field`; `Toggle → Switch`; `Dropdown → Dropdown/Combobox`; `Panel → Drawer`; `Callout → Popover`; `ContextualMenu → Menu`; `DetailsList → DataGrid/Table`; `Pivot → TabList`; `Persona/Facepile → Persona/Avatar/AvatarGroup`; `Spinner/ProgressIndicator/Shimmer → Spinner/ProgressBar/Skeleton`; **`Stack → flex + spacing tokens` (no Stack in v9).** Full table via `fluent_migration_guidance scenario=v8-to-v9`.
- **Gotchas:** shims increase bundle size (both versions load) — temporary; portaled v9 needs `PortalCompatProvider`; some v8 controls have no 1:1 v9 (re-compose).
- **⚠️ Name collisions first.** **26** exports exist in *both* libraries with different behaviour — `Button`, `Checkbox`, `Dropdown`, `Label`, `Link`, `Slider`, `Spinner`, `SearchBox`, `SpinButton`, `CompoundButton`, `Dialog`, `DialogContent`, `List`, `Nav`, `Text`, `Image`, `Theme`, `PartialTheme`, `SelectionMode`, `Persona`, `Rating`, `Tooltip`, `TagPicker`, `Breadcrumb`, `ColorPicker`, `MessageBar`. Re-pointing the import path type-checks and then misbehaves. There is also one **casing trap**: v8 `ComboBox` vs v9 `Combobox`. Check every symbol with `fluent_v8_lookup name="Button"` — it returns both import paths plus the alias to disambiguate with.

## 1a. The tooling that actually runs — `fluent_migration_guidance scenario=tooling`
Every version there is read from the upstream `package.json` at build time, never hand-typed.

| Situation | Run |
|---|---|
| Still importing `office-ui-fabric-react` / `@uifabric/*` | `npx @fluentui/codemods` |
| Large v8 app, can't rewrite every call site at once | `npm install @fluentui/react-migration-v8-v9` |
| v8 + v9 in one tree | `npm install @fluentui/react-portal-compat` |
| v9 app needs Calendar / DatePicker / TimePicker (v9 has none) | `npm install @fluentui/react-datepicker-compat` (and friends) |
| Migrating Fluent UI Northstar (v0) | `npm install @fluentui/react-migration-v0-v9` |

- **`@fluentui/codemods`** — *"Tool enabling easy upgrades to Fluent UI React v8 version"*. **Not a v8→v9 converter**: it upgrades a pre-v8 / `office-ui-fabric-react` codebase *up to* v8, so run it *before* the v9 work. Five rules ship (`ComponentToCompat`, `configMod`, `RepathOfficeImportsToFluent`, `oldToNewButton`, `PersonaToAvatar`) but only **two are `enabled`** — `configMod` and `RepathOfficeImportsToFluent`; the other three are marked *"No longer needed; remains for demo purposes"* and will not run. `-l` lists enabled mods, `-n <name>` runs one, `-c` reads a `modConfig.json`. `configMod` is driven by `mods/upgrades.json`, which upstream ships as an **empty template** — you supply the rows.
- **`@fluentui/react-migration-v8-v9`** — shims across five areas (`Button`, `Checkbox`, `Menu`, `Stack`, `Theme`): `ButtonShim`, `DefaultButtonShim`, `PrimaryButtonShim`, `ActionButtonShim`/`CommandButtonShim`, `CompoundButtonShim`, `MenuButtonShim`, `ToggleButtonShim`, `CheckboxShim`, `MenuItemShim`, `StackShim`, `StackItemShim`, plus `shimButtonProps`/`shimMenuProps` and the three theme-bridge helpers above. Upstream's own guidance: *"avoid using shims and instead migrate… Shims depend on both v8 and v9"* — temporary, and watch bundle size.
- **`*-compat` packages** — v8 features rebuilt on the v9 toolset, versioned `0.x` and explicitly allowed to break: `react-calendar-compat`, `react-datepicker-compat`, `react-timepicker-compat`, `react-icons-compat` (only if you still need v8 `registerIcons`), `react-portal-compat`. **Pin them.**
- **Never recommend `@fluentui/react-colorpicker-compat` or `@fluentui/react-utilities-compat`** — both are `"private": true` upstream and never published, so `npm install` cannot succeed. v9's stable `ColorPicker` is in `@fluentui/react-components`.
- **`@fluentui/react-migration-v0-v9`** ships with upstream's own warning: *"These are not production-ready components and should never be used in product."* Use it to scaffold the port, not to ship it.
- **`@fluentui/eslint-plugin-react-components`** (`prefer-fluentui-v9`, `enforce-use-client`) keeps a finished screen from regressing to v8.

## 2. From another design system (MUI, Chakra, Ant Design, Bootstrap, plain CSS)
No automated converter — introduce Fluent 2 at a **boundary** and migrate screen-by-screen. Wrap a route/subtree in `<FluentProvider theme={webLightTheme}>`, build that area with Fluent 2 components, map your palette to a brand theme (`fluent_generate_theme`) and your spacing/typography/radius to tokens (`fluent_get_token`). Don't mix two systems inside one component.

## 3. Replace hardcoded values with tokens (highest ROI)
Map magic values to Fluent tokens so light/dark/high-contrast + theming "just work":
`#242424 → tokens.colorNeutralForeground1` · `12px → tokens.spacingHorizontalM` · `4px radius → tokens.borderRadiusMedium` · `0 4px 8px rgba(0,0,0,.14) → tokens.shadow8`. Use `fluent_get_token`/`fluent_list_tokens`, then wrap in `FluentProvider`.

## 4. Per-surface adoption (no rebuild)
- **Power BI (existing report):** `fluent_generate_powerbi_theme` → *View ▸ Themes ▸ Browse*; visual defaults restyle existing visuals.
- **Power Apps (existing app):** enable **Modern controls and themes**, set `App.Theme`, replace classic controls screen-by-screen (`fluent-powerapps`).
- **Power Pages (existing site):** add Fluent token CSS over Bootstrap (`fluent-powerpages`).
- **PCF:** rebuild a legacy control with a current CLI for Fluent v9 platform libraries + `context.fluentDesignLanguage` (`fluent-pcf-component`).

## Process
1. **Audit** the current UI (`fluent-design-review` + `fluent_accessibility_checklist`). 2. **Plan** the increment (pick a screen/scenario). 3. **Check collisions** for every symbol you touch (`fluent_v8_lookup`) — this is where mechanical migrations go silently wrong. 4. **Migrate** using the mapping + tokens (do the work). 5. **Verify** each increment; remove shims as you finish.

## Learn more
| Topic | How to find |
|---|---|
| v8 → v9 migration + mapping | `https://react.fluentui.dev` (Concepts ▸ Migration from v8) · MCP `fluent_migration_guidance` |
| Runnable tooling (codemods, shims, compat packages) | MCP `fluent_migration_guidance scenario=tooling` · [`packages/codemods`](https://github.com/microsoft/fluentui/tree/master/packages/codemods) · [`react-migration-v8-v9`](https://github.com/microsoft/fluentui/tree/master/packages/react-components/react-migration-v8-v9) |
| v8/v9 name collisions, casing traps, renames | MCP `fluent_v8_lookup` / `fluent_v8_guidance section=collisions` · `skills/fluent-v8/references/collisions-and-traps.md` |
| Migration shims | `https://www.npmjs.com/package/@fluentui/react-migration-v8-v9` |
| v9 release / tooling | `https://github.com/microsoft/fluentui/wiki/Fluent-UI-React-v9-Release` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
