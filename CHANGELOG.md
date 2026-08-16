# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — 2026-08-16

A source-mining pass over fluent2.microsoft.design, the Fluent UI React
Storybook, `microsoft/fluentui` and the native repos. It added the capabilities
that were missing and, more importantly, fixed the places where we were
confidently wrong.

### Added
- **Icon search** (`fluent_icon_search`) — 2,976 icon families searchable by
  *meaning*, returning the exact verified export and import. Fluent names icons
  for the object, not the function, so `Refresh24Regular` and `Logout24Regular`
  are compile errors while the real names are `ArrowSync24Regular` and
  `SignOut24Regular`. Every name is validated against the upstream export
  manifest at build time; the build fails rather than emit an unproven one.
- **Fluent charts** — the 27 `@fluentui/react-charts` components and the
  47-token `DataVizPalette`, wired into `fluent_generate_powerbi_theme` so a
  Fluent-themed Power BI report and a Fluent-themed React chart use the **same
  series colours**.
- **Design-name → code-token bridge** — 52 mappings resolving the design site's
  names to the token that actually produces the value.
- **Figma community plugins** — six, each labelled with real provenance; only
  *Variables Import* is verifiably Microsoft-authored. Plus a **DTCG token
  export**, which closes the code→Figma direction Figma's own MCP server
  doesn't cover.
- Component lifecycle/roadmap data, so "is this stable or preview?" is
  answerable; 348 alias colour tokens; SSR, Griffel and focus-management
  references.

### Changed
- **Components 99 → 353**, generated from the Storybook's machine-readable API
  rather than hand-maintained. Props 449 → 1,961, with `required` flags, 266
  slots, 65 deprecations and a maturity tier so preview packages stop looking
  like suite exports.
- **Native 155 → 185**, every entry read from source at a pinned tag.
- **v8 collisions 23 → 26**, recomputed mechanically from both API-Extractor
  reports. The previous list omitted `Button`, `Checkbox`, `Dropdown`, `Label`
  and `Link` — the whole point of the feature — and missed five more that a
  naive parse drops, because API Extractor writes `export { Image_2 as Image }`.
- **`fluent_generate_theme` now reproduces Microsoft's Theme Designer exactly**
  (13 colours × 16 stops, ΔE 0). It previously interpolated in HSL; upstream
  uses D50 Lab/LCH with arc-length-reparameterised Bézier curves.
- Design-language topics 36 → 42.

### Fixed
- **`fluent_scaffold_pbip` produced a report that `fluent_pbir_verify` then
  rejected** (7 passed, 2 failed). Now 9 of 9.
- **The Web Components starter could never have worked** — it emitted
  `<fluent-card>`, which doesn't exist in v3, and omitted the side-effect import
  without which nothing registers at all.
- **`fluent_design_guidance {topic:"all"}` returned 506,264 characters**, enough
  to displace the conversation it was meant to help. Now 7,334. Migration's
  `all` went 83,011 → 1,070.
- An **empty string acted as a wildcard** — `get_component {name:""}`
  confidently returned `Button`.
- A **malformed `fluent.config.json` was reported as absent and then silently
  overwritten**, destroying the user's file.
- **We recommended the opposite of upstream on High Contrast** (`upstream: "Do
  not use High Contrast themes!"`), and our SSR guidance omitted `SSRProvider`,
  which upstream states causes hydration failures.
- The **corner-radius scale is offset one step** between the design site and the
  code tokens: the site's "Large" (8px) is `borderRadiusXLarge`, because
  `borderRadiusLarge` is 6px.
- A **Figma rate limit repeated in eight files was backwards** — limits go by
  *seat*, not plan, and Starter is the most generous tier for a View/Collab seat
  (20/month, not 6).
- `Nav`'s sample used identifiers its own import didn't provide; `Tree` and
  `DataGrid` advertised `SelectionMode_2`, an API-Extractor mangled internal
  name that isn't a real type; `DataGrid` lacked `items`/`columns`/`getRowId`.

### Provenance
`mcp/data/local/` is gitignored, so a checkout that has it returns richer
content than a fresh clone. Every response now carries `$provenance` marking
`published` vs `local-overlay`, and `fluent_get_config` answers "what would a
clone see?" in one call. The test suite runs green in **both** states, because
CI runs the clone view.

**389 checks** (260 smoke · 15 v8 · 114 PBIR).

## [1.1.0] — 2026-08-16

The first release since `1.0.0` roughly doubles the surface area: Fluent 1 (v8),
the three native platforms, and Figma, plus a provenance pass that makes the
data's own limits visible to the people relying on it.

### Added
- **Fluent 1 (Fluent UI React v8) as a first-class target** — 106 components and
  the 23 **name collisions** where v8 and v9 export the *same* symbol for
  different components, so a wrong import compiles cleanly and misbehaves at
  runtime. Tools: `fluent_v8_lookup`, `fluent_v8_guidance`. Skill: `fluent-v8`.
- **Native platforms — iOS, Android, Windows** — 155 real types with their
  imports and API. A component's *name* is shared across platforms; its *type*
  is not, and on Android both Fluent generations ship in the **same Maven
  artifacts** separated only by Kotlin package. Tools:
  `fluent_native_component`, `fluent_native_guidance`. Agent:
  `fluent-native-engineer`. Skill: `fluent-native`.
- **Figma design-to-code** — `fluent_figma_guidance`, and
  `hosts/register-mcp.mjs --figma` now registers Figma's hosted MCP server
  alongside `fluent-ui`, using each host's verified config dialect. OAuth is run
  by the host; the installer never asks for, stores or forwards a token.
- **Two more hosts** in the installer: **Claude Code** and **Gemini CLI** (10
  targets, 3 config dialects).
- **`ocrText`** on media items — the copy rendered *inside* an image, searchable
  and rendered separately from `alt`. `alt` describes an image; `ocrText` quotes
  it, which matters where Microsoft's exact wording *is* the guidance.
- **Provenance at the point of use** — lookups now surface the caveats that apply
  to the answer instead of parking them in a section a caller had to know to ask
  for.
- `scripts/sync-plugin-manifests.mjs` and `scripts/split-gated-content.mjs`.
- This changelog.

### Changed
- **Sign-in-gated Microsoft guidance is no longer redistributed.** Some Fluent 2
  pages (the AI/Copilot component usage pages and four "Working with AI" topics)
  sit behind an employee sign-in. The published datasets now carry only factual
  scaffolding — component and part names, section headings, the official
  documentation URL, links to publicly hosted images — plus a `gatedNotice`
  pointing at the source. Readers with access keep the full text locally in
  `mcp/data/local/` (gitignored) and the tools merge it back transparently, so
  nothing is lost for them. See `NOTICE`.
- The plugin manifest is generated from the root `plugin.json` into its three
  host-specific copies rather than maintained by hand, and its description now
  covers native, Fluent 1 and Figma.
- The MCP server reports its version from `package.json` instead of a hardcoded
  string.
- `fluent-v8.json`'s `meta.counts` is split into `upstreamLibraryCounts` (totals
  for the upstream v8 library) and `datasetCounts` (measured from the file). As
  one ambiguous `counts` block it read as a census of the file and contradicted
  it.
- The Pages site is usable on phones, and states the agent and skill counts.

### Fixed
- `NOTICE` claimed no sign-in-gated content was redistributed while ~141 KB was.
- The published host config templates contained the author's local Windows path,
  so the "copy-paste" configs worked for nobody else.
- Stale counts across `README`, `GUIDE`, `docs/` and the site — tools, skills,
  agents and media totals now match what ships.
- `fluent_get_images` searches and renders on-screen text.

## [1.0.0] — 2026-08-09

Initial release: Fluent 2 for **Web** (React v9 + Web Components), **Power BI**
(themes, PBIP/PBIR projects, and the audit → apply → normalize → verify pipeline
for existing reports) and **Power Platform** (Power Apps, Power Pages, PCF),
with design tokens, the design-language foundations, accessibility checks, and
user presets plus memory.

[1.2.0]: https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/tag/v1.2.0
[1.1.0]: https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/tag/v1.1.0
[1.0.0]: https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/tag/v1.0.0
