# FluentReport — PBIP + PBIR scaffold (Fluent 2)

A minimal, **structurally valid** Power BI Project (PBIP) using the enhanced report
format (**PBIR**) and a **TMDL** semantic model, pre-wired with the **Fluent 2**
custom report theme. The `fluent-ui` MCP scaffolder copies this folder and
token-substitutes the placeholder name/ids.

## Folder structure

```text
templates/pbip/
├── FluentReport.pbip                         # PBIP pointer -> report folder
├── .gitignore                                # ignores .pbi/ local cache files
├── FluentReport.Report/
│   ├── .platform                             # Fabric item metadata (type: Report)
│   ├── definition.pbir                       # report definition + datasetReference (byPath)
│   ├── StaticResources/
│   │   ├── SharedResources/BaseThemes/
│   │   │   └── CY24SU10.json                 # bundled base theme (real MS file)
│   │   └── RegisteredResources/
│   │       └── Fluent2.json                  # our custom Fluent 2 theme (copy of mcp/data/powerbi-theme.base.json)
│   └── definition/                           # PBIR (enhanced) report definition
│       ├── report.json                       # themeCollection + resourcePackages + settings
│       ├── version.json                      # PBIR version ("2.0.0")
│       └── pages/
│           ├── pages.json                    # page order + active page
│           └── fluentpage01/
│               ├── page.json                 # page "Overview" (1280x720)
│               └── visuals/
│                   └── fluentcard01/
│                       └── visual.json       # sample textbox title visual
└── FluentReport.SemanticModel/
    ├── .platform                             # Fabric item metadata (type: SemanticModel)
    ├── definition.pbism                      # semantic model definition (TMDL, version "4.2")
    └── definition/
        ├── database.tmdl                     # database object (compatibilityLevel 1567)
        ├── model.tmdl                         # model object + table refs
        └── tables/
            └── Metrics.tmdl                  # one self-contained calculated (DATATABLE) table
```

## Schema versions used (all validated, 0 errors)

| File | `$schema` (developer.microsoft.com/json-schemas/…) |
|------|-----------------------------------------------------|
| `FluentReport.pbip` | `fabric/pbip/pbipProperties/1.0.0` |
| `*.Report/.platform`, `*.SemanticModel/.platform` | `fabric/gitIntegration/platformProperties/2.0.0` |
| `definition.pbir` | `fabric/item/report/definitionProperties/2.0.0` |
| `report.json` | `fabric/item/report/definition/report/3.0.0` |
| `version.json` | `fabric/item/report/definition/versionMetadata/1.0.0` |
| `pages.json` | `fabric/item/report/definition/pagesMetadata/1.0.0` |
| `page.json` | `fabric/item/report/definition/page/2.0.0` |
| `visual.json` | `fabric/item/report/definition/visualContainer/2.4.0` |
| `definition.pbism` | `fabric/item/semanticModel/definitionProperties/1.0.0` |
| `Fluent2.json` (theme) | `…/powerbi-desktop-samples/…/reportThemeSchema-2.155.json` |

## Theme registration (how Fluent 2 is wired)

`definition/report.json` binds the theme in two coordinated places:

1. `themeCollection.baseTheme` → `CY24SU10` (`type: SharedResources`).
2. `themeCollection.customTheme` → `Fluent2.json` (`type: RegisteredResources`).
3. `resourcePackages[]` declares both files so Power BI can locate them:
   * `SharedResources` → `BaseThemes/CY24SU10.json` (`type: BaseTheme`)
   * `RegisteredResources` → `Fluent2.json` (`type: CustomTheme`)

The custom theme filename in `themeCollection.customTheme.name`,
the `resourcePackages` item `name`/`path`, and the file under
`StaticResources/RegisteredResources/` must all match (`Fluent2.json`).

## Tokens the scaffolder should substitute

| Token | Where | Notes |
|-------|-------|-------|
| `FluentReport` | folder names, `.pbip` `artifacts[].report.path`, `.platform` `displayName` | report + model base name |
| Report `logicalId` `11111111-…` | `*.Report/.platform` | regenerate a fresh GUID per item |
| Model `logicalId` `22222222-…` | `*.SemanticModel/.platform` | regenerate a fresh GUID per item |
| `fluentpage01` | `pages.json`, page folder, `page.json` `name` | page id (≤50 chars, unique) |
| `fluentcard01` | visual folder, `visual.json` `name` | visual id |
| `lineageTag`/`id` GUIDs (`4444…`, `5555…`, `6666…`) | TMDL files | regenerate to avoid collisions |

The scaffold is valid **as-is** (it opens with the literal name `FluentReport`);
tokens only need substitution when generating a differently named project.

## Preview features required in Power BI Desktop

- **Power BI Project (.pbip) save option**
- **Store reports using enhanced metadata format (PBIR)**
- **Store semantic model using TMDL format**
- **Modern visual defaults and customize theme improvements** (to get the Fluent 2 base theme)

## Provenance / sources

- PBIP / PBIR / TMDL folder contracts: Microsoft Learn
  `developer/projects/projects-overview`, `projects-report`, `projects-dataset`.
- File shapes mirrored from real exports: `gbrueckl/FabricStudio`
  (`resources/templateFiles/Empty.Report`) and
  `data-goblin/power-bi-agentic-development` (PBIR + TMDL examples).
- `CY24SU10.json` is the real Microsoft base theme copied verbatim from the
  above sample repos.
- JSON schemas: `github.com/microsoft/json-schemas` (fabric item report/semanticModel)
  and the report theme schema in `github.com/microsoft/powerbi-desktop-samples`.

## Notes / caveats

- PBIP, PBIR, and the Fluent 2 base theme are all **preview** features; exact
  schema versions advance monthly. Bump the `$schema` versions if you target a
  newer Power BI Desktop.
- `Metrics.tmdl` is a self-contained **calculated `DATATABLE`** table, so the
  model opens with data and needs no gateway/data source.
- TMDL files are **tab-indented**; keep tabs (not spaces) when editing.
- All JSON files here were validated against their official Draft-7 schemas with
  zero errors. TMDL structure mirrors a real Desktop export but was not run
  through Power BI Desktop in this environment — see `research/powerbi.md`.
