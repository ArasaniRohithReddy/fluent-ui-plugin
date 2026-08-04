---
name: fluent-powerbi-adopt
description: Apply the Microsoft Fluent 2 theme to an EXISTING Power BI PBIP/PBIR report and repair the layout distortion the theme introduces (overlapping visuals, clipped or shifted titles, out-of-bounds visuals, mis-sized slicers and buttons, small-multiple reflow, broken bookmarks or page navigation), while preserving every interactive behavior. Use to adopt Fluent 2 in a report that already exists, not to scaffold a new one.
---

# Adopt Fluent 2 into an existing Power BI report (PBIP / PBIR)

Applying a Fluent 2 theme to a report that was laid out under a different theme rarely changes a visual's stored `x/y/width/height`, but it changes each visual's **rendered footprint** (padding, rounded corners, borders, titles, slicer mode, small-multiple grid). That is what causes overlaps, clipped titles, and out-of-bounds visuals after the theme is applied. This skill covers applying the theme by editing the report-definition JSON on disk, then detecting and repairing that distortion without breaking bookmarks, page navigation, drill-through, groups, or intentional overlaps.

Use `fluent_migration_guidance` with `scenario: "powerbi-report"` for the machine-readable version of the effect map, detection rules, safety rules, and never-rename list. Use `fluent_generate_powerbi_theme` to produce the Fluent 2 theme JSON and `fluent_powerbi_visuals` to see how Fluent 2 styles each visual type.

## When this applies
- The report is **PBIR**: a `*.Report` folder with a `definition/` folder that contains `pages/`. This is file-editable.
- It does **not** apply to a binary `.pbix` or to PBIR-Legacy (a single `report.json` holding the whole model). Convert first in Power BI Desktop: Options > Preview features > enable "Store reports using enhanced metadata format (PBIR)", then re-save.

## Absolute rules (never violate)
- **Never edit the semantic model.** No measure, column, DAX, or relationship changes. Themes and layout live in the report layer only.
- **Never edit without a restore point.** Use a clean git working tree, or copy the whole `*.Report` folder to `<name>.Report.backup-<timestamp>` before any edit.
- **Never change any `name`, `id`, GUID, object name, `pageBinding.name`, or `$schema` value.** Bookmarks, navigation, drill-through, and tooltips cross-reference these; renaming them silently breaks the report.
- **Never "fix" an overlap you have not classified as unintentional.** Many overlaps are deliberate (bookmark toggle groups, background shapes, buttons over cards).
- **Never move or resize a bookmark-controlled visual without updating every affected `*.bookmark.json`,** or the bookmark snaps it back.
- **Never produce invalid JSON.** Every file must still satisfy the `$schema` declared at its top.
- **Never batch-move visuals to solve overlaps.** Apply the smallest change that resolves each issue.

## Workflow
Track progress with a todo list and work **one page at a time** so a mistake stays contained.

1. **Safety and baseline.** Confirm git is clean (or make the backup copy). Snapshot every visual's `name`, `position {x, y, z, width, height, tabOrder}`, visual type, default visibility, and group membership so you can diff against it and revert a single visual if a fix regresses.
2. **Discover.** Map the PBIR tree (see the cheat-sheet). Inventory pages, per-page canvas size, visuals, bookmarks, buttons and their actions, and existing registered resources. For large reports, run a small read-only script (`execute`) that walks `pages/*/visuals/*/visual.json` and emits a table of positions, types, visibility, and groups.
3. **Understand data bindings (optional, read-only).** If a `powerbi-model` MCP server is available, list tables and measures so a later geometry fix never disturbs a data binding or a conditional-format rule. Skip this if no model is available; everything else still works.
4. **Acquire and validate the theme.** Generate it with `fluent_generate_powerbi_theme`, or fetch a Fluent 2 theme JSON from a URL the user supplies. Validate it parses and is a real Power BI theme (has `name` plus theme content such as `dataColors`, structural colors, `textClasses`, or `visualStyles`). Never guess a theme URL.
5. **Apply the theme.** Write the JSON to `StaticResources/RegisteredResources/<ThemeName>.json`, add a `resourcePackages` entry (type `RegisteredResources`), and set `themeCollection.customTheme` in `report.json`. During PBIR preview, adding a brand-new resource to `report.json` may be rejected; if so, replace the contents of an already-registered custom theme, or ask the user to register it once via Desktop (View > Themes > Browse for themes), after which the file is editable. Re-validate `report.json`.
6. **Detect distortion.** Combine geometry checks with the Fluent 2 effect map (below): out-of-bounds, unintended overlaps, collision-on-render, header or title overflow, slicer footprint change, small-multiple reflow, and button or navigator restyle. Diff every finding against the Phase 1 baseline so you report what the theme changed, not pre-existing conditions.
7. **Classify each overlap before touching it.** Leave intentional pairs alone (bookmark toggle groups, background shapes with lower `z`, members of the same group, buttons or shapes over a card or image). Fix only pairs where both visuals are default-visible content, in no shared toggle or group relationship, that intersect or collide only because of the theme. When unsure, treat as intentional and flag it.
8. **Repair, minimally,** in this order of preference: a theme-level fix (adjust the custom theme's `visualStyles` so a global cause is corrected everywhere at once), then per-visual formatting (toggle the offending default on that visual), then a small geometry nudge (keep it inside the page, preserve relative arrangement and a consistent gap, snap to a sensible grid). Propagate every geometry change to bookmarks immediately.
9. **Preserve interactions.** For every visual you moved, resized, or restyled, update each `*.bookmark.json` that captures it. Verify every button or shape `action` still targets a valid bookmark or page. Keep `z`-order so interactive elements stay above decorative backgrounds, and keep `tabOrder` sensible.
10. **Validate.** Every edited JSON still parses and conforms to its `$schema`. Re-run detection and confirm each fixed distortion is resolved and no new one was introduced. Confirm counts match the baseline: same number of pages, visuals, bookmarks, and navigation actions.
11. **Report.** Summarize the theme applied and method, the restore point, distortions found (page, visual, issue, severity), fixes applied (theme-level, per-visual, or geometry, with before and after), bookmarks and navigation updated, what you left intentionally unchanged and why, anything needing manual review, and the integrity check versus baseline. Geometry analysis cannot fully verify rendering, so ask the user to open the report in Power BI Desktop to confirm.

## Fluent 2 effect map (why layout shifts)
| Fluent 2 change | Layout risk to check |
|---|---|
| Increased padding and rounded corners on all visuals | Content area shrinks, so content clips and tight neighbors collide on render |
| Titles and subtitles on by default (axis titles off) | Added header height pushes content down, so it overflows or clips |
| Slicers change mode (list to dropdown or tile) | Footprint height or width changes, so slicers overlap neighbors |
| Small multiples reflow (2x2 to 1x4 or 4x1) | Space requirement changes, so the visual overflows or leaves gaps |
| Buttons and navigators restyled (default, hover, pressed; fill uses the first data color) | Nav bars misalign and button size or spacing shifts |
| Cards use less padding and no reference-label background | Card content re-anchors and alignment with neighbors drifts |
| New pages default to 1920x1080 (existing pages keep their size) | Out-of-bounds checks must use each page's actual width and height, not the new default |
| Uniform fonts and sizes across visuals | Text reflows, wraps, or clips where labels were tightly fit |

## Detection rules (defaults; adjust to the report)
- **Out-of-bounds:** `x < 0 || y < 0 || x + width > page.width || y + height > page.height`.
- **Overlap:** boxes A and B intersect when `A.x < B.x + B.width && A.x + A.width > B.x && A.y < B.y + B.height && A.y + A.height > B.y`.
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
      pages.json                       # pageOrder[], activePageName
      <pageName>/
        page.json                      # width, height (canvas bounds), displayName, objects, pageBinding
        visuals/<visualName>/
          visual.json                  # position{x,y,z,width,height,tabOrder,angle}, visual{visualType,objects}, visibility, group
          mobile.json                  # mobile layout; do not touch unless asked
    bookmarks/
      bookmarks.json                   # order and groups
      <bookmarkName>.bookmark.json     # captured per-visual state (visibility, position, format, filters)
  StaticResources/
    RegisteredResources/               # custom theme JSON and images (each needs a report.json entry)
```
Confirm exact field names against the `$schema` at the top of each file; PBIR schemas are versioned monthly.

## The Fluent 2 theme, at a glance
The Fluent 2 report theme rounds data-visual containers (radius 8px, 1px Fluent Neutral Stroke 1 border) with a subtle drop shadow, uses Segoe UI Semibold titles with subtitles off, sets the page background to a light neutral, and turns chart data labels on with the legend at the bottom. It deliberately leaves textboxes, images, shapes, and buttons **borderless and shadowless** so captions, logos, and navigation elements are not boxed. Generate the full JSON with `fluent_generate_powerbi_theme`.

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
