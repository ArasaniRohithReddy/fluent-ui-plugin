---
name: fluent-powerbi-theme
description: Create and apply a Fluent 2-aligned Power BI report theme (theme JSON with dataColors, textClasses, and visualStyles "visual defaults"). Use to make Power BI reports look like Fluent 2, generate a brand theme, or set report-wide visual defaults.
---

# Fluent 2 Power BI report theme

A Power BI **report theme JSON** is how you express Fluent 2 in Power BI. It sets the palette, text styles, and — via `visualStyles` — the **visual defaults** applied to every visual (rounded corners, spacing, borders, backgrounds). A ready base theme ships at `mcp/data/powerbi-theme.base.json`; generate a brand-specific one with the `fluent_generate_powerbi_theme` MCP tool.

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
  "dataColors": ["#0F6CBD","#107C10","#CA5010","#5C2E91","#038387","#A4262C", "..."],
  "good": "#107C10", "neutral": "#C19C00", "bad": "#C50F1F",
  "firstLevelElements": "#242424",   // Fluent colorNeutralForeground1 (text)
  "secondLevelElements": "#616161",  // Fluent colorNeutralForeground3
  "background": "#FFFFFF",           // Fluent colorNeutralBackground1
  "secondaryBackground": "#F0F0F0",
  "tableAccent": "#0F6CBD",
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
- **Fluent brand + accessible categorical palette → `dataColors`** (brand `#0F6CBD` first).
- **Fluent neutrals → `firstLevelElements`…`fourthLevelElements` + `background`.**
- **Fluent status → `good`/`neutral`/`bad`.**
- **Fluent radius/spacing/elevation → `visualStyles` defaults** (corner radius ~4px controls / ~8px cards).

## Visual defaults
`visualStyles."*"."*"` sets the report-wide default; add per-visual entries (e.g. `"textSlicer"`, `"card"`) to override. The Learn "Visual defaults" page demonstrates this with a **live interactive report** (no static screenshots) — modern Fluent defaults for corners, padding, and borders. These come from the **base theme**; your custom theme overrides only what it declares (including **structural colors** like `firstLevelElements`/`background`). See `mcp/data/powerbi-visual-defaults.json` for the property knobs, structural colors, base themes, canvas, and style presets (JSON paths + Fluent values).

### Data visuals vs chrome (borderless overrides)
Fluent 2 rounds and softly shadows **data** visuals (charts, tables, cards) via `visualStyles."*"."*"` (radius 8px, 1px neutral-stroke border, subtle drop shadow, Segoe UI Semibold title, subtitle off). It **deliberately keeps chrome visuals borderless and shadowless** so they are not boxed: the shipped theme adds per-visual-type overrides that turn `border`, `dropShadow` (and for text/image, `background`/`title`) **off** for `textbox`, `image`, `shape`, `basicShape`, and `actionButton`. Preserve this split when editing the theme, so captions, logos, background shapes, and navigation buttons keep their designed look. The theme also turns chart **data labels on** and moves the **legend to the bottom** for the common bar, column, line, combo, pie, and donut charts. See `perVisualTypeOverrides` in `mcp/data/powerbi-visual-defaults.json`.

**Visual catalog:** `mcp/data/powerbi-visuals.json` lists **every Power BI visual** (35 across 10 categories, plus the report features) — each with its official Learn doc URL, when-to-use, and how the Fluent 2 base theme styles it — mapped to the 21-page Fluent 2 base-theme showcase report that demonstrates them. Use it to recommend the right visual and hand the user its doc.

## Apply it
Power BI Desktop → **View ▸ Themes ▸ Browse for themes** → pick the JSON. In a PBIP project, register it under `StaticResources` (see the `fluent-pbip-report` skill). Keep `dataColors` accessible against the background (≥ 3:1).

## Learn more
| Topic | How to find |
|---|---|
| Base themes (Fluent 2 preview) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults")` |
| Report themes (apply) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/desktop-report-themes")` |
| Custom theme JSON (structural colors, style presets) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/report-themes-create-custom")` |
| Theme schema | `https://github.com/microsoft/powerbi-desktop-samples/tree/main/Report%20Theme%20JSON%20Schema` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
