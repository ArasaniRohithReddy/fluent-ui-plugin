# `scripts/pbir` - deterministic Power BI PBIR tooling

Audit, theme, repair and verify a **PBIR** Power BI report (a `*.Report` folder whose
`definition/` contains `pages/`) from the command line. No dependencies, Node 18+,
plain ES modules. The `fluent_pbir_*` MCP tools are thin wrappers around this same
engine, so everything here works with no MCP server running.

## Why this exists

A Power BI custom theme only styles properties a visual has **not** overridden inline.
Measured across four real reports (2,249 visuals), **68 to 95 percent of visuals carry
inline `visualContainerObjects` overrides** for exactly the properties a Fluent 2 theme
sets. Registering a theme therefore changes almost nothing.

The fix is to **delete the inline override** so the theme's default applies.

> Re-tinting an override (rewriting an inline `#E6E6E6` to a Fluent `#D1D1D1`) is an
> anti-pattern. The override survives, so the theme is still inert. That behavior only
> exists behind the explicit `--policy remap-colors` flag, and it warns.

## The four commands

```powershell
# 1. Baseline. Read-only, writes nothing.
node scripts/pbir/audit.mjs "<reportDir>"            # human readable
node scripts/pbir/audit.mjs "<reportDir>" --json     # machine readable

# 2. Register the theme (dry run by default; add --apply to write).
node scripts/pbir/apply-theme.mjs "<reportDir>" --theme <themePath> --name Fluent2 --apply

# 3. The core fix: delete the inline overrides the theme owns.
node scripts/pbir/normalize-inline.mjs "<reportDir>"                       # dry run
node scripts/pbir/normalize-inline.mjs "<reportDir>" --apply --ledger ledger.json

# 4. Prove it landed. Exits non-zero when any assertion fails.
node scripts/pbir/verify.mjs "<reportDir>" --write-baseline baseline.json   # before
node scripts/pbir/verify.mjs "<reportDir>" --expected-theme <themePath> --baseline baseline.json
```

Self-test (synthetic fixture, exits non-zero on failure):

```powershell
node scripts/pbir/selftest.mjs      # also: cd mcp && npm run test:pbir
```

## The number that matters

Counting pages and visuals cannot detect the failure this tooling exists to fix: a run
that changed nothing passes a count check. Report the **theme-effectiveness ratio**
instead, per theme-owned key:

```
effectiveness(key) = 1 - (data visuals with an inline theme-owned override for key / data visuals)
```

Target **0.90 or higher**. `audit`, `normalize-inline` and `verify` all print the matrix.

## Safety rules the engine enforces

- Only `visual.visualContainerObjects` container cards are modified. Data-role formatting
  under `visual.objects` is never touched (opt in with `--include-data-object-typography`
  to clear `fontFamily` / `fontSize` there so the theme `textClasses` apply).
- Only properties the theme actually declares **for that visual's type** are removed. A
  property the theme declares only under `tableEx` is not removed from an `image`.
- Content and semantics are protected: `title.text`, `title.heading`, the whole `general`
  card (`altText`, `keepLayerOrder`) and the whole `visualLink` card.
- Visuals whose formatting a bookmark captured are skipped and reported, because the
  bookmark snaps the old style back. `--include-bookmarked` forces them through; re-capture
  those bookmarks in Power BI Desktop afterwards.
- Names, ids, GUIDs, `parentGroupName`, `pageBinding.name`, `$schema`, `position` and
  `visualInteractions` targets are never modified. `verify` V9 hashes the whole identifier
  set to prove it.
- Every write is confined to the report directory. Writers preserve each file's existing
  formatting (real PBIR files are CRLF, 2-space, no trailing newline).

## PBIR facts the engine encodes

- `visual.json` top-level keys are `$schema, name, position, visual, visualGroup,
  parentGroupName, filterConfig, isHidden, annotations, howCreated`. There is no
  `visibility` and no `group`. About a quarter of `visual.json` files are group containers
  with `visualGroup` and **no** `visual` node, so `visual.visualType` may not exist.
- Inline values use the wrapper `{"properties":{"<prop>":{"expr":{"Literal":{"Value":"'#E6E6E6'"}}}}}`
  (strings are single-quoted inside `Value`, numbers carry a `D`/`L`/`M` suffix, booleans and
  null are bare, colors add `{"solid":{"color":...}}` and may be a `ThemeDataColor` reference).
  This is **not** the theme-JSON shape (`"border": [{ "show": true, "radius": 8 }]`).
- One report can hold several `visualContainer` schema versions at once (2.5.0 through 2.11.0).
- `themeCollection.customTheme` needs `{name, reportVersionAtImport, type: "RegisteredResources"}`
  and `reportVersionAtImport` is an **object** `{visual, page, report}`: visual = MAX
  `visualContainer` version, page = MAX `page` version, report = the version in
  `definition/report.json`'s own `$schema`.
- Real reports already have a `RegisteredResources` package holding images, so the
  `CustomTheme` item is **appended**; the package is created only when absent.
  `customTheme.name` must equal the item's `name`. Convention: item `name` without `.json`,
  `path` with it.
- Canvas size is arbitrary per page (1350x1142, 1350x4423, 1850x1537, ...). Geometry checks
  use each page's own `width`/`height`.
