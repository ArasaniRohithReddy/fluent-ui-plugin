---
name: fluent-powerbi-theme
description: Create and apply a Fluent 2-aligned Power BI report theme (theme JSON with dataColors, textClasses, and visualStyles "visual defaults"). Use to make Power BI reports look like Fluent 2, generate a brand theme, set report-wide visual defaults, or match a report's series colours to Fluent's first-party React charts (@fluentui/react-charts / DataVizPalette).
---

# Fluent 2 Power BI report theme

A Power BI **report theme JSON** is how you express Fluent 2 in Power BI. It sets the palette, text styles, and — via `visualStyles` — the **visual defaults** applied to every visual (rounded corners, spacing, borders, backgrounds). A ready base theme ships at `mcp/data/powerbi-theme.base.json`; generate a brand-specific one with the `fluent_generate_powerbi_theme` MCP tool.

> **Fluent has first-party charts, and this theme now matches them.** `@fluentui/react-charts` **9.3.24** is the Fluent 2 (v9) React chart library, and its data-visualisation palette is exported as **`DataVizPalette`**. `fluent_generate_powerbi_theme` emits `dataColors` **straight from those qualitative slots, in slot order**, so series N in a Power BI visual and series N in a React chart are the same hex. See *Palette parity* below and `mcp/data/fluent-charts.json`.

## Base theme: Fluent 2 (preview)
Power BI has three **base themes**; your **custom theme layers on top**, overriding only the properties it declares:
- **Fluent 2 (preview)** — modern Fluent 2 styling: uniform fonts/colors/sizes; **titles + subtitles on, axis titles off**; more padding + rounded corners; grey wallpaper; new pages default to 1920×1080.
- **Classic 2026** — current default base theme for new reports.
- **Classic 2018** — legacy base theme.

The Fluent 2 base theme applies **consistent defaults across every visual category** — bars, columns, lines, area, combo, ribbon/waterfall, part-to-whole, scatter, table/matrix, maps, cards/callouts, AI-powered, and more (the official 21-page Fluent 2 showcase report demonstrates all of them). So a **custom theme only needs to override brand palette + type**; the structural Fluent look (cards, spacing, borders, titles, grey canvas) comes from the base theme.

**Enable Fluent 2:** Desktop → *File ▸ Options and Settings ▸ Options ▸ Preview features* → **Modern visual defaults and customize theme improvements** → restart. Switch base themes in *View ▸ Themes ▸ Customize current theme ▸ Base theme*. **Preview is Desktop-only** — to use Fluent 2 in the Power BI *service*, create/update the report in Desktop first (Customize-theme options aren't available in the service).

**Built-in style presets** (per visual, *Format visual ▸ Style*): Charts — *Default* (axis, no labels) / *Data labels*; Line — smooth default, *Straight lines with/without data labels*; Buttons — *Default / Outline / Transparent / Icon & Text* (button color = first data color; default/hover/pressed states); Navigators — *Default / Tab*; Slicers — *Default* (dropdown) / *List* / *Tile* (each also sets slicer mode); Cards — less padding, no reference-label background; Small multiples — *1×4/4×1*; Tables/matrix — existing presets, modernized. A custom theme can add its own via `visualStyles.<visualType>.<presetName>`.

## Structure (Fluent 2 mapping)
```jsonc
{
  "$schema": "https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.156.json",
  "name": "Fluent 2",
  // DataVizPalette qualitative slots 1..40, in slot order (light theme shown).
  "dataColors": ["#637CEF","#E3008C","#2AA0A4","#9373C0","#13A10E","#3A96DD","#CA5010","#57811B","..."],
  "good": "#107C10", "neutral": "#C19C00", "bad": "#C50F1F",
  "firstLevelElements": "#242424",   // Fluent colorNeutralForeground1 (text)
  "secondLevelElements": "#616161",  // Fluent colorNeutralForeground3
  "background": "#FFFFFF",           // Fluent colorNeutralBackground1
  "secondaryBackground": "#F0F0F0",
  "tableAccent": "#0F6CBD",          // brand accent (chrome, not a series colour)
  "textClasses": {
    "title":     { "fontFace": "Segoe UI Semibold", "fontSize": 14, "color": "#242424" },
    "header":    { "fontFace": "Segoe UI Semibold", "fontSize": 12, "color": "#242424" },
    "callout":   { "fontFace": "Segoe UI Semibold", "fontSize": 28, "color": "#242424" },
    "label":     { "fontFace": "Segoe UI", "fontSize": 12 }
  },
  "visualStyles": {
    "*": { "*": { /* global visual defaults: rounded corners, spacing, border, background */ } }
  }
}
```
- **Type ramp → `textClasses`** (Segoe UI / Segoe UI Semibold sized from the Fluent ramp).
- **Fluent's data-viz palette → `dataColors`** (`DataVizPalette` qualitative slots, *not* a brand-led list — see *Palette parity*).
- **Fluent neutrals → `firstLevelElements`…`fourthLevelElements` + `background`.**
- **Fluent status → `good`/`neutral`/`bad`** (`good` = DataVizPalette `success`, `bad` = `error`).
- **Fluent radius/spacing/elevation → `visualStyles` defaults** (corner radius ~4px controls / ~8px cards).

## Palette parity with Fluent charts

Fluent's React charts and a Fluent-themed report used to disagree: the theme carried a hand-picked 12-colour list led by the brand blue `#0F6CBD`, while `@fluentui/react-charts` paints from `DataVizPalette`. Put a Power BI visual next to a React chart on one slide and the same series came out two different colours.

`fluent_generate_powerbi_theme` now emits the palette itself:

| | Before | After |
|---|---|---|
| `dataColors` | 12 hand-picked colours, `#0F6CBD` first | **40 `DataVizPalette` qualitative slots, in slot order** — `#637CEF`, `#E3008C`, `#2AA0A4`, `#9373C0`, `#13A10E`, … |
| `brandColor` | overwrote `dataColors[0]` | recolors **brand accents only** (`tableAccent`, `maximum`/`center`/`minimum`); opt back in with `brandFirstDataColor: true` |
| `good` / `bad` | `#107C10` / `#C50F1F` | same values, now **sourced** from `DataVizPalette.success` / `.error` |
| dark canvas | not supported | `paletteTheme: "dark"` emits the dark variants (21 of 40 qualitative slots and 6 of 7 semantic colours differ in dark) |

Why 40 and not 8: a Fluent chart cycles all 40 slots (`getNextColor` wraps at 40), and Power BI cycles `dataColors` the same way — matching the full list is what makes series N agree for *any* N. `reportThemeSchema-2.156` puts no upper bound on `dataColors`. Use `dataColorCount` to trim if you want a shorter file, understanding only the first N series will match.

**Why `neutral` is left alone.** `DataVizPalette` has no neutral. Its nearest member is `warning` (`#F7630C`), which reads as an alert rather than a middle state, so `neutral` stays at `#C19C00` — Fluent `gold.primary`, which is qualitative slot 30's dark value, so it is still a Fluent data-viz colour.

```
fluent_generate_powerbi_theme { brandColor: "#0F6CBD", name: "Contoso" }
fluent_generate_powerbi_theme { paletteTheme: "dark" }          // dark-canvas report
fluent_generate_powerbi_theme { dataColorCount: 12 }            // shorter file, first 12 match
```

On the React side, **omit `color` on each series** and the chart cycles the same palette. Pin one with `DataVizPalette.color7`, or use `DataVizPalette.success` / `.error` when the colour carries meaning.

## Which chart, on which surface

`fluent_powerbi_visuals` answers this for **both** surfaces in one call:

```
fluent_powerbi_visuals { query: "trend over time" }                          // Power BI visuals + Fluent charts
fluent_powerbi_visuals { query: "trend over time", surface: "fluent-charts" } // React only
fluent_powerbi_visuals { query: "part to whole",   surface: "powerbi" }       // report only
```

Each Fluent chart record carries its import, real props (from the package's API-Extractor report), upstream do's/don'ts, accessibility behaviour and the Power BI visual it corresponds to. Some map cleanly (`LineChart` ↔ *Line chart*, `DonutChart` ↔ *Pie & donut chart*, `GaugeChart` ↔ *Gauge*); some do not — `SankeyChart`, `GanttChart` and `PolarChart` are AppSource custom visuals in Power BI, and `HeatMapChart` is a Matrix with conditional formatting. Maps, AI-powered visuals and slicers are Power BI-only.

**Get the package right.** Three sibling packages export the *same component names*:

| Package | Version | Tier | Use |
|---|---|---|---|
| `@fluentui/react-charts` | 9.3.24 | **stable** | Fluent 2 / v9 — **this is the current one** |
| `@fluentui/react-charting` | 5.25.11 | legacy | v8-era stack; don't start new work here |
| `@fluentui/chart-web-components` | 0.0.94 | preview | pre-1.0; only `<fluent-horizontal-bar-chart>` and `<fluent-donut-chart>` exist |

Both React packages export `LineChart`, `DonutChart`, `Legends`, `Sparkline` **and `DataVizPalette`**, so the wrong import compiles cleanly and then renders with the wrong design system.

## Accessibility (both surfaces)
- **Never encode by colour alone.** React: `allowMultipleShapesForPoints` on `LineChart`, per-legend `shape` on `Legends`. Power BI: markers, data labels, conditional-formatting icons.
- **Don't hand-pick adjacent hexes.** The qualitative slots are ordered for separation; omit `color` (React) or keep the generated `dataColors` (Power BI).
- **Check contrast, don't eyeball it.** `getColorContrast(c1, c2)` and `getContrastTextColor(bg)` ship from `@fluentui/react-charts`. Keep `dataColors` ≥ 3:1 against the background.
- **Respect the theme.** Render charts inside `FluentProvider`; use `paletteTheme: "dark"` for a dark-canvas report.
- **Cap the series count.** Upstream caps a line chart at 9 series: "too many lines make it hard to read".

Full rules with their evidence: `mcp/data/fluent-charts.json` → `accessibility.rules`. The charts are stated by upstream to be **WCAG 2.1 MAS C compliant** (react-charts README).

## Visual defaults
`visualStyles."*"."*"` sets the report-wide default; add per-visual entries (e.g. `"textSlicer"`, `"card"`) to override. The Learn "Visual defaults" page demonstrates this with a **live interactive report** (no static screenshots) — modern Fluent defaults for corners, padding, and borders. These come from the **base theme**; your custom theme overrides only what it declares (including **structural colors** like `firstLevelElements`/`background`). See `mcp/data/powerbi-visual-defaults.json` for the property knobs, structural colors, base themes, canvas, and style presets (JSON paths + Fluent values).

### Data visuals vs chrome (borderless overrides)
Fluent 2 rounds and softly shadows **data** visuals (charts, tables, cards) via `visualStyles."*"."*"` (radius 8px, 1px neutral-stroke border, subtle drop shadow, Segoe UI Semibold title, subtitle off). It **deliberately keeps chrome visuals borderless and shadowless** so they are not boxed: the shipped theme adds per-visual-type overrides that turn `border`, `dropShadow` (and for text/image, `background`/`title`) **off** for `textbox`, `image`, `shape`, `basicShape`, and `actionButton`. Preserve this split when editing the theme, so captions, logos, background shapes, and navigation buttons keep their designed look. The theme also turns chart **data labels on** and moves the **legend to the bottom** for the common bar, column, line, combo, pie, and donut charts. See `perVisualTypeOverrides` in `mcp/data/powerbi-visual-defaults.json`.

**Visual catalog:** `mcp/data/powerbi-visuals.json` lists **every Power BI visual** (35 across 10 categories, plus the report features) — each with its official Learn doc URL, when-to-use, and how the Fluent 2 base theme styles it — mapped to the 21-page Fluent 2 base-theme showcase report that demonstrates them. `mcp/data/fluent-charts.json` is its React counterpart: **27 components** of `@fluentui/react-charts@9.3.24` plus the full `DataVizPalette`. `fluent_powerbi_visuals` searches both.

## Apply it
Power BI Desktop → **View ▸ Themes ▸ Browse for themes** → pick the JSON. In a PBIP project, register it under `StaticResources` (see the `fluent-pbip-report` skill), or hand the generated JSON straight to `fluent_pbir_apply_theme` — the tool's output is pure JSON with no preamble for exactly that reason. Keep `dataColors` accessible against the background (≥ 3:1).

## Learn more
| Topic | How to find |
|---|---|
| Base themes (Fluent 2 preview) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults")` |
| Report themes (apply) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/desktop-report-themes")` |
| Custom theme JSON (structural colors, style presets) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/report-themes-create-custom")` |
| Theme schema | `https://github.com/microsoft/powerbi-desktop-samples/tree/main/Report%20Theme%20JSON%20Schema` |
| Fluent React charts | `https://github.com/microsoft/fluentui/tree/master/packages/charts/react-charts` · Storybook: `https://storybooks.fluentui.dev/charts/` |
| `DataVizPalette` source | `https://github.com/microsoft/fluentui/blob/master/packages/charts/react-charts/library/src/utilities/colors.ts` |
| Palette concepts (qualitative vs semantic) | `https://github.com/microsoft/fluentui/blob/master/packages/charts/react-charting/docs/colors.md` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
