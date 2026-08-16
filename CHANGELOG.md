# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.1.0]: https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/tag/v1.1.0
[1.0.0]: https://github.com/ArasaniRohithReddy/fluent-ui-plugin/releases/tag/v1.0.0
