---
name: fluent-v8
description: Build on Fluent UI React v8 (@fluentui/react) — "Fluent 1", formerly Office UI Fabric React (office-ui-fabric-react). Identify v8 vs v7 vs Northstar vs v9/Fluent 2; decide whether to stay on v8, migrate, or run side-by-side; bootstrap ThemeProvider + initializeIcons; get import paths, createTheme/semanticColors theming, merge-styles styling, Stack layout and accessibility (FocusZone, FocusTrapZone, Layer, Announced, HighContrastSelector) right; and avoid the v8/v9 traps that compile and then misbehave. Use for SPFx, PCF/Dynamics and LOB apps on v8, and before any v8 to v9 migration.
---

# Fluent 1 — building on Fluent UI React v8 (`@fluentui/react`)

**Read this first, because the rest of this plugin assumes Fluent 2.** Fluent UI React **v8** (`@fluentui/react`) is *Fluent 1*: a different design language, a different styling engine (`merge-styles`, not Griffel), a different theme model (`ITheme.palette` + `semanticColors`, not flat `tokens.*`) and a different icon system (MDL2 font, not SVG components). It is **not** old Fluent 2 — nothing transfers in either direction between this file and the v9 skills.

This skill is about doing v8 *well*; migrating off it is the `fluent-migration` skill's job, so don't editorialise about it here.

> **The other `fluent_*` MCP tools in this plugin return Fluent 2 / v9 data.** Never paste a `tokens.*` name, a v9 prop or a `FluentProvider` snippet into a v8 file — use them only to compare, or to plan a migration. The **v8** tools are `fluent_v8_lookup` and `fluent_v8_guidance` (§6).

**Verified against `microsoft/fluentui@master`, 2026-08-09:** `@fluentui/react@8.125.7`, `@fluentui/theme@2.7.2`, `@fluentui/font-icons-mdl2@8.5.74`, `@fluentui/react-icons-mdl2@1.4.7`. Anything unconfirmed is labelled as such.

## 1. Which library do you actually have?

Four different things get called "Fluent UI React" — check `package.json` first; full lineage in `references/migration.md`.

| In `package.json` | Verdict |
|---|---|
| `@fluentui/react@^8` | **v8 = Fluent 1**, the mainline — **this skill**. Actively released, no announced EOL. |
| `@fluentui/react@^7` | ⚠️ **Trap**: alias publish of `office-ui-fabric-react@7`. Treat as **v7**. |
| `office-ui-fabric-react@^5`–`^7`, any `@uifabric/*` | **Office UI Fabric React v7**, terminal at 7.204.1. *Correct* on SPFx ≤ 1.17; upgrade → `@fluentui/react@8`. |
| `@fluentui/react-northstar@0.x` | **Northstar**, the *Teams* line, **EOL July 2025** — not an "old v8". Target v9 + `teamsLightTheme`. |
| `@fluentui/react-components@^9` | **v9 = Fluent 2** — use `fluent-web-ui` / `fluent-theming`. |

**Fastest visual check in DevTools:** `ms-` class names with no `--fui-*` custom properties = Fluent 1; confirm with a **2px** button corner and `#0078d4` (Fluent 2 is `fui-*`, **4px**, `#0f6cbd`). The widely-repeated claim that "Fluent 1 is the rounder one" is **backwards** — v8's radius scale tops out at 6px.

## 2. Stay, migrate, or run side-by-side?

- **Stay on v8** when the host pins it (SPFx on every current release; PCF `<platform-library name="Fluent" version="8.121.1" />`), or when the app leans on the ~42 v8-only components (`DetailsList`, `CommandBar`, `Layer`, `FocusZone`, the PeoplePickers, …). v8 still ships — `8.125.7`, 2 Jul 2026, React 19 support added Oct–Nov 2025 — and **no EOL has been announced**.
- **Fluent 2 look without migrating:** `@fluentui/fluent2-theme` restyles a v8 app cosmetically, no API changes (`references/theming.md`).
- **Side-by-side** is officially supported for incremental migration (`@fluentui/react-migration-v8-v9` shims, `PortalCompatProvider`, `createV8Theme`) — that work belongs to `fluent-migration`. Read `references/migration.md` first: the evidence, the caveats, and why a mechanical import swap is dangerous.

## 3. Bootstrap

```tsx
// src/index.tsx — npm i @fluentui/react. Do both once, at entry, at module scope.
import { initializeIcons } from '@fluentui/font-icons-mdl2';
import { ThemeProvider, createTheme } from '@fluentui/react';

initializeIcons();                       // before any Fluent component renders

const appTheme = createTheme({ palette: { /* all 50 slots — references/theming.md */ } });

export const App = () => (
  <ThemeProvider theme={appTheme} applyTo="body">
    <Shell />
  </ThemeProvider>
);
```

**`ThemeProvider` is the supported v8 theming root** — `Fabric` is deprecated in v8 itself and `Customizer` is deprecated *for theming*. `applyTo` takes `'element' | 'body' | 'none'`; `as={React.Fragment}` avoids the extra `<div>`. A missing or duplicated `initializeIcons()` has two distinct symptoms — empty gaps vs. tofu boxes — diagnosed in `references/styling.md`.

## 4. Traps that compile and then misbehave

Full set with fixes and code: `references/collisions-and-traps.md`.

- **`<Dialog hidden>` is inverted** — `hidden` defaults to `true`, so pass `hidden={!isVisible}`. `Panel`/`Modal` use `isOpen` (default closed). Renaming `hidden`→`open` in a migration produces an always-open dialog.
- **`ProgressIndicator.percentComplete` is 0–1**, while v9's `ProgressBar.value` is **0–max** — an off-by-100 waiting to happen.
- **v8 `List` is virtualized; v9 `List` is not.** Same export name, and 100 000 rows land in the DOM.
- **`Slider.onChange(value, range?, event?)` vs `onChanged(event, value, range?)`** — reversed argument order; mixing them silently reads an event object as a number.
- **`Layer` stops ~30 React synthetic events** at its boundary, so ancestor handlers (a global Escape, say) never fire. Set `eventBubblingEnabled`.
- **`ThemeProvider` emits no CSS custom properties** (v8 bakes literal values into classes), and nothing errors outside a provider — `useTheme()` falls back to a fresh default theme, so the UI just looks "almost right" in default Fluent blue.
- **Import traps that break the build:** `IStyleFunctionOrObject` and `styled` live in `@fluentui/react/lib/Utilities` (**not** `lib/Styling`); `NeutralColors`/`SharedColors`/`CommunicationColors`/`Depths` in `@fluentui/theme` (**not** `@fluentui/react`); `@fluentui/react/lib/ThemeProvider` does not exist — use the barrel.

## 5. Where the detail lives

| For | Read |
|---|---|
| Components: `Stack`, surfaces, lists, progress, deprecated props | `references/components.md` |
| v8/v9 name collisions and the full trap list with fixes | `references/collisions-and-traps.md` |
| Theme APIs, palette, `semanticColors`, effects/fonts/spacing, dark theme, ThemeGenerator, `fluent2-theme` | `references/theming.md` |
| Import paths, `styles` prop + style slots, `mergeStyleSets`/`styled()`, icon registration | `references/styling.md` |
| `FocusZone`, `FocusTrapZone`, `Layer`, `Announced`, high contrast, gaps, review grep list | `references/accessibility.md` |
| SPFx, PCF/Dynamics, Office, Teams pins; `@microsoft/sp-office-ui-fabric-core` | `references/platforms.md` |
| Support status, v8-only components, the v8 → v9 path, v7/Northstar lineage | `references/migration.md` |

## 6. Ask the MCP server instead of recalling

The `fluent-v8` dataset (106 components, 180 exports, 23 collisions, 22 traps, theming, styling, icons, platforms, 17 docs errata) is queryable — call it, don't recite lists.

- **`fluent_v8_lookup name="DetailsList"`** — import path, v9 equivalent or v8-only status with `whyBlocking`, collisions, traps. Run it before writing or migrating any v8 symbol.
- **`fluent_v8_guidance section=…`** — `lineage` · `version-decision` · `support` · `theming` · `fluent2-theme` · `styling` · `icons` · `design-language` · `accessibility` · `platforms` · `migration` · `v8-only` · `collisions` · `traps` · `docs-errata` · `unverified`.
- `scripts/v8/` generates, audits and converts v8 themes headlessly (no DOM) — `scripts/v8/README.md`.

## Always
Check which library you actually have (§1) · call `initializeIcons()` **once** at entry · theme through **`ThemeProvider`**, not `Customizer`, and give `createTheme` **all 50 palette slots** · style against **`semanticColors`** + `theme.effects`/`theme.fonts`, never raw hex · remember `<Dialog hidden>` is inverted · add `[HighContrastSelector]` branches and `prefers-reduced-motion` yourself.

## Learn more
| Topic | How to find |
|---|---|
| v8 component docs + demos | `https://developer.microsoft.com/en-us/fluentui` *(SPA — not fetchable)* |
| v8 source of truth: props, style slots, enums | `https://github.com/microsoft/fluentui/tree/master/packages/react/src/components` — each `*.types.ts` is authoritative |
| v8 → v9 mapping | `https://react.fluentui.dev/?path=/docs/concepts-migration-from-v8-component-mapping--docs` · skill `fluent-migration` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
