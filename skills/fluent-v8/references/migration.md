# Should you migrate off v8 — and how

Answer honestly, then get back to the code in front of you. `fluent_v8_guidance section=version-decision` returns the 13-point decision data; `section=support` the support status with sources; `section=migration` the 101-row v8→v9 map, shims, coexistence topology and codemod/ESLint tooling; `section=lineage` the full package family tree.

## The other two lines you may be migrating *from*

- **Office UI Fabric React v7** (`office-ui-fabric-react@^7`, plus any `@uifabric/*`) is terminal at **7.204.1** (26 Feb 2025). The upgrade path is `office-ui-fabric-react@7` → `@fluentui/react@8`; it is breaking in two ways — the scope rename, and v8's deep-import rules (`styling.md`). ⚠️ `@fluentui/react@^7` is an **alias publish of v7**: same code, v8-looking name. Treat it as v7.
- **Northstar** (`@fluentui/react-northstar@0.x`, formerly Stardust) was the *Teams* library — a third independent line with its own Teams-era design language, **EOL July 2025**. It is not an "old v8". Its migration target is v9 + `teamsLightTheme`. React support: `0.6x` → 16/17, **`0.70+` → React 18 only**. Its `0.x` versioning is inverted — **minor = breaking**.

## What's actually true as of 2026-08-09

- **v8 is still shipping.** `8.125.7` released 2 Jul 2026, and Microsoft did real engineering as recently as Oct–Nov 2025 to add **React 19** support (`8.125.0` bumped the peer range; `8.125.1` migrated the source). *(Versions read from the repo `package.json` + `CHANGELOG.md`; not cross-checked against npm dist-tags.)*
- **No EOL has been announced.** No end-of-support date, deprecation notice, or maintenance-mode policy for `@fluentui/react` exists in any first-party source — repo README, package README, the archived v8 wiki, or the SPFx/PCF/Office Learn docs. What Microsoft *does* say is: *"Fluent UI v8 is still widely used. We encourage you to migrate to Fluent UI v9."* There is a community discussion about v8 LTS/EOL ([#29100](https://github.com/microsoft/fluentui/discussions/29100)) — link it, don't quote it; its contents could not be verified here.
- **Microsoft's own EOL mechanism hasn't fired.** Their repo-organization RFC says a line entering maintenance/EOL gets branched off the default branch (`react-northstar` → `react-v0`; **`react` → `react-v8`**). `react-v0` exists. **`react-v8` does not** — v8 still lives on `master` beside v9. That's *inference from repo structure*, but it's the most defensible signal available and worth re-checking periodically. Calibration: Northstar shipped a *feature* release seven months **after** its declared EOL, so "EOL" in Fluent-land doesn't mean "frozen" either.
- **Many Tier-1 v8 components have no v9 equivalent** — `DetailsList` (+`ShimmeredDetailsList`), `GroupedList`, `CommandBar`, `ContextualMenu`, `HoverCard`, `Facepile`, `DocumentCard`, `Coachmark`, `ActivityItem`, `ScrollablePane`+`Sticky`, `MarqueeSelection`, `Selection`, `FocusZone`, `FocusTrapZone`, `Layer`, `Overlay`, `Callout`, `ResizeGroup`, `OverflowSet`, `Announced`, every PeoplePicker, `Keytips`, `ButtonGrid`, `MaskedTextField`, `ThemeGenerator`, `ResponsiveMode`, `withViewport`, `DragDropHelper`, `Stack`, and more. **Get the authoritative list — 96 exports across 40 families, each with `whyBlocking` and its `lib` import — from `fluent_v8_guidance section=v8-only`, or per component with `fluent_v8_lookup name="DetailsList"`.** Four others exist **only** as `0.x` compat packages outside the v9 suite: `Calendar`, `DatePicker`, `TimePicker`, `ColorPicker`.
- **SPFx pins v8** on every current release, with no official v9 story. **PCF** supports either, but never both in one manifest. (**Office Add-ins are the exception** — Microsoft scaffolds and recommends v9 there.) Details in `platforms.md`.
- **v8 is the only Fluent React line with any IE11 story** — sunset 15 Jun 2022, with no plan to *remove* existing compatibility. v9 never supported IE11.

## Want the Fluent 2 look without leaving v8?

`@fluentui/fluent2-theme` restyles a v8 app with Fluent 2 visuals and changes no API — see `theming.md`.

## When you do migrate

That's the `fluent-migration` skill (and the `fluent-migration-engineer` agent): side-by-side coexistence, `@fluentui/react-migration-v8-v9` shims, `PortalCompatProvider` so v9 overlays render correctly inside a v8 tree, and `createV8Theme` for bridging themes. Coexistence is officially supported — *"Combining Fluent UI React v9 components with Fluent UI React v8 or v0 components is possible and allows gradual migration."*

Before you swap any import, read `collisions-and-traps.md`: 23 export names exist in **both** libraries with different behaviour, so a mechanical rename type-checks and then misbehaves at runtime.

`fluent_v8_guidance section=docs-errata` lists 17 verified errors in Microsoft's own v8→v9 migration docs — check it before trusting a mapping you read there.
