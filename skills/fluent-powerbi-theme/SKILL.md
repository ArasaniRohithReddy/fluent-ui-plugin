---
name: fluent-powerbi-theme
description: Create and apply a Fluent 2-aligned Power BI report theme (theme JSON with dataColors, textClasses, and visualStyles "visual defaults"). Use to make Power BI reports look like Fluent 2, generate a brand theme, or set report-wide visual defaults.
---

# Fluent 2 Power BI report theme

A Power BI **report theme JSON** is how you express Fluent 2 in Power BI. It sets the palette, text styles, and — via `visualStyles` — the **visual defaults** applied to every visual (rounded corners, spacing, borders, backgrounds). A ready base theme ships at `mcp/data/powerbi-theme.base.json`; generate a brand-specific one with the `fluent_generate_powerbi_theme` MCP tool.

## Structure (Fluent 2 mapping)
```jsonc
{
  "$schema": "https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.155.json",
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
`visualStyles."*"."*"` sets the report-wide default; add per-visual entries (e.g. `"textSlicer"`, `"card"`) to override. The Learn "Visual defaults" page demonstrates this with a **live interactive report** (no static screenshots) — modern Fluent defaults for corners, padding, and borders. See `mcp/data/powerbi-visual-defaults.json` for the property knobs (JSON paths + Fluent values).

## Apply it
Power BI Desktop → **View ▸ Themes ▸ Browse for themes** → pick the JSON. In a PBIP project, register it under `StaticResources` (see the `fluent-pbip-report` skill). Keep `dataColors` accessible against the background (≥ 3:1).

## Learn more
| Topic | How to find |
|---|---|
| Report themes | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/desktop-report-themes")` |
| Visual defaults | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults")` |
| Theme schema | `https://github.com/microsoft/powerbi-desktop-samples/tree/main/Report%20Theme%20JSON%20Schema` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
