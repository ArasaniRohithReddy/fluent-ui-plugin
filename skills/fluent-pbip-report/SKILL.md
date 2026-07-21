---
name: fluent-pbip-report
description: Scaffold and understand Fluent 2-themed Power BI projects in the PBIP (Power BI Project) + PBIR (enhanced report) format — folder/file structure, theme registration, and visual defaults. Use to create a source-controllable, Fluent-styled Power BI report.
---

# Fluent 2 Power BI reports (PBIP / PBIR)

**PBIP** is Power BI Desktop's text/folder project format (developer mode); **PBIR** is the enhanced report format that stores a report as a folder of JSON files (source-controllable, code-reviewable, programmatically editable). Use the `fluent_scaffold_pbip` MCP tool to generate a Fluent 2-themed project from the template in `templates/pbip/`.

## Enable in Power BI Desktop
Options → **Preview features** → enable **Power BI Project (.pbip) save option** and **Store reports using enhanced metadata format (PBIR)**. Then *File ▸ Save as ▸ .pbip*.

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
- The **base theme** goes under `StaticResources/SharedResources/BaseThemes`; the **custom Fluent theme** under `StaticResources/RegisteredResources` and is referenced from `report.json` (`themeCollection.customTheme`).
- **Visual defaults** live in the theme's `visualStyles` (see `fluent-powerbi-theme`) and apply report-wide — the Fluent look (corners/spacing/borders/type) comes from there.

## Steps
1. `fluent_scaffold_pbip` (or copy `templates/pbip/`) → rename `FluentReport` to your report name (file + folder names and internal references). 2. Drop in your Fluent theme (or `fluent_generate_powerbi_theme`). 3. Point the semantic model at your data (edit TMDL / connect in Desktop). 4. Open the `.pbip` in Power BI Desktop; it upgrades preview schemas as needed. 5. Author visuals — they inherit the Fluent visual defaults.

## Caveats
- PBIP/PBIR/TMDL and the Fluent base theme are **preview**; schemas are **monthly-versioned** (`$schema` like `report 3.0.0`, `visualContainer 2.4.0`, `reportThemeSchema-2.155`). Bump versions to target newer Desktop builds.
- TMDL is **tab-indented**. `compatibilityLevel` may auto-upgrade when opened in Desktop.

## Learn more
| Topic | How to find |
|---|---|
| Projects (PBIP) overview | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/developer/projects/projects-overview")` |
| Report format (PBIR) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/developer/projects/projects-report")` |
| Fabric item JSON schemas | `https://developer.microsoft.com/json-schemas/fabric/` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
