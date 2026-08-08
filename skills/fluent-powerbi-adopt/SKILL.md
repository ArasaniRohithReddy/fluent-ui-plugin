---
name: fluent-powerbi-adopt
description: Apply the Microsoft Fluent 2 theme to an EXISTING Power BI PBIP/PBIR report and repair the layout distortion the theme introduces (overlapping visuals, clipped or shifted titles, out-of-bounds visuals, mis-sized slicers and buttons, small-multiple reflow, broken bookmarks or page navigation), while preserving every interactive behavior. Use to adopt Fluent 2 in a report that already exists, not to scaffold a new one.
---

# Adopt Fluent 2 into an existing Power BI report (PBIP / PBIR)

**Read this first, because it inverts the intuition.** A Power BI theme sets **defaults**. It only styles a property that a visual has **not overridden inline**. In real reports, **68 to 95 percent of visuals carry inline overrides** for exactly the properties the Fluent theme sets, so registering a theme alone changes almost nothing. Microsoft states this directly: "Reset to default **doesn't affect styling you set on individual visuals from the formatting pane**." ([visual defaults](https://learn.microsoft.com/en-us/power-bi/create-reports/power-bi-reports-visual-defaults))

Measured across four real reports (2,249 visuals): 68%, 80%, 84%, and 95% of visuals carried theme-defeating inline overrides. In one 1,243-visual report that was 2,596 overridden properties across 840 visuals (background 748, border 714, visualHeader 607, title 521), plus 545 visuals with an inline `fontFamily` and 644 with an inline `fontSize` defeating `textClasses`.

**So the job is: register the theme, then clear the inline overrides the theme should own.** Layout repair is a secondary phase that is usually empty.

> **Never re-tint an override.** Rewriting an inline `#E6E6E6` to a Fluent `#D1D1D1` leaves the override in place and the theme still inert. The correct move is to **delete the overridden property** so the theme's value applies. Re-tinting is the single most common way this task is failed.

## Do it with the deterministic tools, not by hand
A real report is 1,265 files and 6.28 MB. Reading it all costs roughly 1.5M tokens, and a single page can hold 199 visuals, so hand-editing does not scale and silently misses most of the work. Use the tools:

| Step | Tool | What it does |
|---|---|---|
| 1. Baseline | `fluent_pbir_audit` | Pages, visuals, visual-type and schema-version histograms, current theme wiring, per-key inline-override counts, inline font counts, geometry findings |
| 2. Apply | `fluent_pbir_apply_theme` | Writes the theme, appends the `CustomTheme` item to the existing `RegisteredResources` package, sets `themeCollection.customTheme` with a computed `reportVersionAtImport` |
| 3. Clear overrides | `fluent_pbir_normalize_inline` | Deletes the inline overrides the theme owns, dry-run first, returns a full ledger of every change |
| 4. Prove it | `fluent_pbir_verify` | Runs the assertions below, including the theme-effectiveness ratio |

## Prove success numerically (do not claim success without this)
Counting pages and visuals cannot detect this failure: a run that changes nothing passes it. Report the **theme-effectiveness ratio** per theme-owned key, before and after:

`effectiveness(key) = 1 - (data visuals with an inline override for key / data visuals)`

Target **0.90 or higher** on `border`, `background`, `title`, `visualHeader`. On the failing report above this read **0.00 across the board**, which would have caught the failure in seconds.

## When this applies
- The report is **PBIR**: a `*.Report` folder whose `definition/` folder contains `pages/`. This is file-editable and officially supports modification from non-Power BI applications.
- It does **not** apply to a binary `.pbix` or to PBIR-Legacy (the root `report.json` holding the whole report). Convert first in Power BI Desktop: Options > Preview features > enable "Store reports using enhanced metadata format (PBIR)", then re-save.

> The Learn note that a `report.json` "doesn't support external editing" refers to the **PBIR-Legacy root file**, which PBIR replaces. In a PBIR report, `definition/report.json` **is** externally editable, and adding a new `CustomTheme` resource to it is supported.

## Absolute rules (never violate)
- **Never edit the semantic model.** No measure, column, DAX, or relationship changes. Themes and layout live in the report layer only.
- **Never edit without a restore point.** Use a clean git working tree, or copy the whole `*.Report` folder to `<name>.Report.backup-<timestamp>` before any edit.
- **Never change any `name`, `id`, GUID, object name, `pageBinding.name`, `parentGroupName`, or `$schema` value,** and never change a `visualInteractions` target in `page.json`. Bookmarks, navigation, drill-through, tooltips, groups, and cross-filtering cross-reference these; renaming them silently breaks the report.
- **Never re-tint an inline override.** Delete the overridden property so the theme applies. Rewriting the value to a Fluent hex leaves the theme inert and is the classic false success.
- **Never touch data-role formatting (`visual.objects`)** while normalizing container styling. Only `visual.visualContainerObjects` carries the properties the theme owns.
- **Never clear an override that a bookmark captures** without also updating that bookmark, or the bookmark snaps the old styling back.
- **Never "fix" an overlap you have not classified as unintentional.** Most overlaps in real reports are deliberate and pre-existing.
- **Never produce invalid JSON.** Every file must still satisfy the `$schema` declared at its top.

## Workflow
1. **Safety and baseline.** Confirm git is clean, or copy the whole `*.Report` folder to a timestamped backup. Then run `fluent_pbir_audit` and keep the output: it is the baseline, and no model can produce it by hand.
2. **Acquire and validate the theme.** Generate it with `fluent_generate_powerbi_theme`, or use a theme JSON the user supplies. Validate that it parses, has a `reportThemeSchema` `$schema`, and that its internal `name` is the theme you intend to apply. Check the byte size and the `name` field: silently registering a different theme than intended is a real failure mode.
3. **Apply the theme.** Use `fluent_pbir_apply_theme`. It writes the theme file, **appends** the `CustomTheme` item to the **existing** `RegisteredResources` package (creating the package only if absent), sets `themeCollection.customTheme`, and computes `reportVersionAtImport` correctly.
4. **Census the inline overrides.** Run `fluent_pbir_normalize_inline` with `policy: "report"` (a dry run). This tells you exactly how much of the theme is currently being defeated and where.
5. **Clear the overrides the theme owns.** Re-run with `policy: "theme-wins"` and `dryRun: false`. Review the ledger it returns: every file, visual, key, property, before, after, and reason. Visuals whose formatting is captured by a bookmark are reported rather than changed unless you opt in.
6. **Update bookmarks that captured formatting.** For every visual you normalized that a bookmark captures, update the captured `objects` in that `*.bookmark.json`, or the bookmark restores the old look.
7. **Verify.** Run `fluent_pbir_verify` and print the theme-effectiveness matrix before and after. Do not claim success until the ratio clears 0.90 on the theme-owned keys and every identifier assertion passes.
8. **Layout check (usually empty).** Only now, re-run the audit's geometry findings and compare against the baseline. Fix only regressions the change actually introduced. Applying a custom theme normally changes no geometry at all, so expect this phase to be a no-op and be suspicious if it is not.
9. **Report.** Theme applied and where it was registered, the restore point, the before and after effectiveness matrix, the ledger summary, bookmarks updated, anything skipped and why, and the identifier integrity check. Close by asking the user to open the report in Power BI Desktop to confirm visually.

## The inline-override shape (memorize this)
Theme JSON and PBIR inline JSON are **different formats**. The theme uses plain values:
```json
"border": [{ "show": true, "radius": 8, "width": 1 }]
```
The inline override inside `visual.json` wraps every value in an expression literal:
```json
"visualContainerObjects": {
  "border": [{ "properties": {
    "color": { "expr": { "Literal": { "Value": "'#E6E6E6'" } } },
    "radius": { "expr": { "Literal": { "Value": "0D" } } }
  }}]
}
```
Strings are single-quoted inside `Value`; numbers carry a `D` suffix; booleans are `true`/`false`. Deleting the property (or the whole card when it becomes empty) is what hands control back to the theme.

## Layout effects: only when the Fluent 2 BASE theme is switched on
The effects below come from the Fluent 2 **base** theme, which can only be enabled in Power BI Desktop (Options > Preview features > "Modern visual defaults and customize theme improvements", then View > Themes > Customize current theme > Base theme). **They do not occur when you apply a custom theme as files**, which is what this skill does. Treat this table as a verification checklist for users who also switch the base theme, not as the expected outcome of your work.

| Fluent 2 base-theme change | Layout risk to check |
|---|---|
| Increased padding and rounded corners on all visuals | Content area shrinks, so content clips and tight neighbors collide on render |
| Titles and subtitles on by default (axis titles off) | Added header height pushes content down, so it overflows or clips |
| Slicers change mode (list to dropdown or tile) | Footprint height or width changes, so slicers overlap neighbors |
| Small multiples reflow (2x2 to 1x4 or 4x1) | Space requirement changes, so the visual overflows or leaves gaps |
| Buttons and navigators restyled (fill uses the first data color) | Nav bars misalign and button size or spacing shifts |
| Cards use less padding and no reference-label background | Card content re-anchors and alignment with neighbors drifts |
| New pages default to 1920x1080 (existing pages keep their size) | Always measure against each page's own width and height |
| Uniform fonts and sizes across visuals | Text reflows, wraps, or clips where labels were tightly fit |

Because a custom theme cannot switch the base theme, **your custom theme must carry the whole Fluent 2 structural look itself** (radius, border, background, title type, page background). Do not assume the base theme will supply it: every real report tested was still on a 2022-era base theme.

## Detection rules (defaults; adjust to the report)
- **Out-of-bounds:** `x < 0 || y < 0 || x + width > page.width || y + height > page.height`, using **each page's own** `width`/`height`. Real canvases are arbitrary (1350x1142, 1350x4423, 1850x1537 all occur); never assume 1280x720 or 1920x1080.
- **Overlap:** boxes A and B intersect when `A.x < B.x + B.width && A.x + A.width > B.x && A.y < B.y + B.height && A.y + A.height > B.y`. Expect many pre-existing intentional overlaps (one 16-page report has 244); only regressions matter.
- **Collision-on-render:** flag pairs whose edge gap is under about 8px (the Fluent 2 border-plus-shadow allowance) even if the boxes do not intersect.
- **Header overflow risk:** flag a visual gaining a default title or subtitle where the content height leaves under about 24px of slack after the added header.
- **Exclude from overlap checks:** background shapes and images (lowest `z`, page-spanning), currently-hidden visuals, and grouped children (evaluate them through their parent).

## PBIR cheat-sheet
```
<name>.Report/
  definition.pbir                      # report to model reference; do not edit refs
  definition/
    report.json                        # themeCollection {baseTheme, customTheme}, resourcePackages, objects
    version.json
    pages/
      pages.json                       # pageOrder[], activePageName, landingPageName
      <pageName>/
        page.json                      # width, height (canvas bounds), displayName, objects,
                                       # pageBinding, visualInteractions[], filterConfig
        visuals/<visualName>/
          visual.json                  # see the field table below
          mobile.json                  # mobile layout; do not touch unless asked
    bookmarks/
      bookmarks.json                   # order and groups
      <bookmarkName>.bookmark.json     # captured state INCLUDING formatting objects
  StaticResources/
    RegisteredResources/               # custom theme JSON and images (each needs a report.json entry)
```

### visual.json fields (schema-derived; the names people get wrong)
| Field | Notes |
|---|---|
| `$schema`, `name`, `position` | The only **required** fields. `position` = `{x, y, z, width, height, tabOrder, angle}`. |
| `visual` | **Optional.** Holds `visualType`, `objects` (data-role formatting), and `visualContainerObjects` (container styling the theme owns). |
| `visualGroup` | Present **instead of** `visual` on group containers. Roughly **1 in 4** `visual.json` files has `visualGroup` and **no** `visual` node, so never assume `visual.visualType` exists. |
| `parentGroupName` | Group membership. **This is the field**, not `group`. |
| `isHidden` | Default visibility. **This is the field**, not `visibility` (`visibility` is a page-level enum). |
| `filterConfig`, `annotations`, `howCreated` | Leave alone. |

**Schema versions drift within a single report.** One 1,243-visual report contained five `visualContainer` versions at once (2.5.0, 2.7.0, 2.8.0, 2.9.0, 2.10.0); newer reports use 2.11.0. Do not hand-check schemas file by file: run `fluent_pbir_audit`, which reports the version histogram and the max per kind (which is what `reportVersionAtImport` needs).

### Registering the theme correctly
`themeCollection.customTheme` requires `{name, reportVersionAtImport, type: "RegisteredResources"}`, where `reportVersionAtImport` is an object `{visual, page, report}`:
- `visual` = the **maximum** `visualContainer` schema version across all `visual.json`
- `page` = the **maximum** `page` schema version across all `page.json`
- `report` = the version in `definition/report.json`'s own `$schema`

Real reports already have a `RegisteredResources` package holding images, so **append** the `CustomTheme` item to it rather than creating a second package. `customTheme.name` must **equal** the item's `name`. Convention: item `name` without `.json`, `path` with it. `fluent_pbir_apply_theme` does all of this.

## The Fluent 2 theme, at a glance
The Fluent 2 report theme rounds data-visual containers (radius 8px, 1px Fluent Neutral Stroke 1 border) with a subtle drop shadow, uses Segoe UI Semibold titles with subtitles off, sets the page background and wallpaper through `visualStyles.page`, and turns chart data labels on with the legend at the bottom. It deliberately leaves textboxes, images, shapes, and buttons **borderless and shadowless** so captions, logos, and navigation elements are not boxed. Because the Fluent 2 base theme cannot be enabled from files, this custom theme carries the entire structural look. Generate the full JSON with `fluent_generate_powerbi_theme`.

## Learn more
| Topic | How to find |
|---|---|
| Report format (PBIR) files and fields | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/developer/projects/projects-report")` |
| Fluent 2 base theme and visual defaults | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/power-bi-reports-visual-defaults")` |
| Create custom report themes | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-bi/create-reports/report-themes-create-custom")` |
| PBIR definition JSON schemas | `https://github.com/microsoft/json-schemas/tree/main/fabric/item/report/definition` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
