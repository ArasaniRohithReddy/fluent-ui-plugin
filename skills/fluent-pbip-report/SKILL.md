---
name: fluent-pbip-report
description: Scaffold and understand Fluent 2-themed Power BI projects in the PBIP (Power BI Project) + PBIR (enhanced report) format — folder/file structure, theme registration, and visual defaults. Use to create a source-controllable, Fluent-styled Power BI report.
---

# Fluent 2 Power BI reports (PBIP / PBIR)

**PBIP** is Power BI Desktop's text/folder project format (developer mode); **PBIR** is the enhanced report format that stores a report as a folder of JSON files (source-controllable, code-reviewable, programmatically editable). Use the `fluent_scaffold_pbip` MCP tool to generate a Fluent 2-themed project from the template in `templates/pbip/`.

## Programmatic Fluent 2 requires PBIP/PBIR
To apply/edit Fluent 2 **programmatically** (as files, in source control, without opening Desktop), the report must be in **PBIP + PBIR**. A binary **`.pbix` is not file-editable** by file-editing tools (and a PBIR report embedded in a `.pbix` isn't exposed as loose JSON).
- A **custom theme JSON** can be generated and applied to **any** report **manually** in Desktop via *View ▸ Themes ▸ Browse for themes* — no PBIR needed.
- But **wiring the theme + setting the Fluent 2 base theme + canvas size + per-visual defaults as files** (no Desktop) needs **PBIR** — the `visualStyles` theme, `report.json` `themeCollection`, and each page's size all live in editable JSON. PBIR is a *publicly documented format that supports modifications from non-Power BI applications*.
- **Preview nuance:** during preview, `report.json` can't be edited to *add a brand-new* resource; edits are supported only for resources Desktop already registered. So register/scaffold once in Desktop (or start from `templates/pbip`, which already registers `Fluent2.json`), then edit the theme JSON, `page.json` canvas, and `visual.json` defaults as files.

## Enable in Power BI Desktop
Options → **Preview features** → enable **Power BI Project (.pbip) save option** and **Store reports using enhanced metadata format (PBIR)**. Then *File ▸ Save as ▸ .pbip*.

Also enable **Modern visual defaults and customize theme improvements** to get the **Fluent 2 (preview)** base theme, then restart. Fluent 2 is **Desktop-only during preview** — to use it in the Power BI *service*, create/update the report in Desktop first (the Customize-theme options aren't available in the service).

## Folder structure (from `templates/pbip/`)
```
FluentReport.pbip                      # entry point (points at the artifacts)
FluentReport.Report/
  .platform
  definition.pbir                      # report definition pointer (PBIR)
  definition/
    report.json                        # report config incl. themeCollection
    version.json
    pages/
      pages.json                       # page order + active page
      fluentpage01/
        page.json
        visuals/fluentcard01/visual.json
  StaticResources/
    SharedResources/BaseThemes/CY24SU10.json   # Fluent 2 base theme (preview)
    RegisteredResources/Fluent2.json           # custom Fluent theme (visualStyles)
FluentReport.SemanticModel/
  .platform
  definition.pbism
  definition/
    database.tmdl
    model.tmdl
    tables/Metrics.tmdl
```

## Theme + visual defaults
- **Base theme** (`StaticResources/SharedResources/BaseThemes/<name>.json`, e.g. `CY24SU10`) is referenced from `report.json` as `themeCollection.baseTheme` (`type: "SharedResources"`); the **custom Fluent theme** (`StaticResources/RegisteredResources/<name>.json`) as `themeCollection.customTheme` (`type: "RegisteredResources"`), each with a matching `resourcePackages` item (`BaseTheme` / `CustomTheme`).
- **Canvas:** Fluent 2 new pages default to **1920×1080** (the initial page keeps **1280×720**); set per page in `definition/pages/<page>/page.json` (`width`/`height`). Wallpaper/background are grey.
- **Visual defaults** live in the theme's `visualStyles` (see `fluent-powerbi-theme`) and apply report-wide — the Fluent look (corners/spacing/borders/type) comes from there.
- **Visual catalog:** `mcp/data/powerbi-visuals.json` maps **every Power BI visual** to its official Learn doc + how the Fluent 2 base theme styles it (the 21-page Fluent 2 showcase report demonstrates each category).

## Steps
1. `fluent_scaffold_pbip` (or copy `templates/pbip/`) → rename `FluentReport` to your report name (file + folder names and internal references). 2. Drop in your Fluent theme (or `fluent_generate_powerbi_theme`). 3. Point the semantic model at your data (edit TMDL / connect in Desktop). 4. Open the `.pbip` in Power BI Desktop; it upgrades preview schemas as needed. 5. Author visuals — they inherit the Fluent visual defaults.

## Caveats
- PBIP/PBIR/TMDL and the Fluent base theme are **preview**; schemas are **monthly-versioned** (`$schema` like `report 3.3.0`, `visualContainer 2.9.0`, `reportThemeSchema-2.156`). Bump versions to target newer Desktop builds.
- TMDL is **tab-indented**. `compatibilityLevel` may auto-upgrade when opened in Desktop.

## Learn more
| Topic | How to find |
|---|---|
| Projects (PBIP) overview | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/developer/projects/projects-overview")` |
| Report format (PBIR) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/developer/projects/projects-report")` |
| Base themes (Fluent 2 preview) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults")` |
| Visualizations overview (all visual types) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/visuals/power-bi-visualizations-overview")` — per-visual docs + Fluent 2 styling are catalogued in `mcp/data/powerbi-visuals.json` |
| Fabric item JSON schemas | `https://developer.microsoft.com/json-schemas/fabric/` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
