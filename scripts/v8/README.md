# `scripts/v8` - deterministic Fluent UI React v8 theme tooling

Generate, audit and convert **Fluent UI React v8** (`@fluentui/react`) themes from the
command line. No dependencies, Node 18+, plain ES modules. Every value is grounded in
`data/theming.json`, a verified extract of `@fluentui/react@8.125.7` /
`@fluentui/theme@2.7.2` source.

## Why this exists

Producing a v8 theme normally means running the official `ThemeGenerator` in a browser:
`getColorFromString` writes to a DOM element to resolve colours, and `createTheme` pulls in
the whole React package. That rules out a CLI, an MCP tool and a CI check.

This module reimplements the colour maths (`color/shades.ts`, `rgb2hsv`, `hsv2rgb`,
`hsv2hsl`), the derivation graph (`ThemeRulesStandard.ts`) and the semantic derivation
(`makeSemanticColors.ts`) exactly, so the same theme comes out of `node` as out of the
theming designer.

## The four commands

```powershell
# 1. Generate. With no --brand this is DefaultPalette, byte for byte.
node scripts/v8/generate-theme.mjs --brand "#8a2be2"
node scripts/v8/generate-theme.mjs --brand "#8a2be2" --out theme.json --ts theme.ts
node scripts/v8/generate-theme.mjs --brand "#2899f5" --background "#1b1a19" --text "#f3f2f1"

# 2. Audit an existing theme. Exits non-zero on any error (--strict also on warnings).
node scripts/v8/audit-theme.mjs theme.json
node scripts/v8/audit-theme.mjs theme.json --all --json

# 3. Convert to Fluent 2 (v9) and back.
node scripts/v8/convert-theme.mjs to-v9 theme.json --ts v9theme.ts
node scripts/v8/convert-theme.mjs to-v8 brandRamp.json --background "#1b1a19"

# 4. Prove it still works.
node scripts/v8/selftest.mjs        # 209 checks, exits non-zero on any failure
```

### `generate-theme.mjs`

| flag | meaning |
|---|---|
| `--brand <hex>` | `primaryColor`; repaints the nine `theme*` slots |
| `--text <hex>` | `foregroundColor`; repaints `neutralPrimary`, `neutralDark`, `black` and the mid neutrals |
| `--background <hex>` | `backgroundColor`; repaints `white` and the six background-derived neutrals |
| `--inverted` | force `isInverted`; otherwise inferred with `isDark(backgroundColor)` |
| `--out <path>` | write the full theme as JSON |
| `--ts <path>` | write a paste-ready `createTheme({...})` snippet |
| `--full` | also emit all 103 `semanticColors` (normally omitted - `createTheme` derives them) |
| `--name <id>` | export name in the TS snippet (default `appTheme`) |
| `--json` | machine-readable output on stdout |

### `audit-theme.mjs`

Checks three things and exits `1` if any **error** is found:

- **completeness** - all 50 `IPalette` slots, all 103 `ISemanticColors` slots.
- **contrast** - 44 pairs against WCAG 2.2 AA (4.5:1 text, 3:1 non-text).
- **derivation** - a `semanticColors` value that matches no palette slot is *hardcoded* and
  will not move when the brand colour does. A value that matches a *different* palette slot
  is *re-pointed*, which is a legitimate choice, so it is only info.

### `convert-theme.mjs`

`to-v9` emits a 16-stop brand ramp plus v9 token overrides, and lists every slot it could
not carry across. `to-v8` accepts a bare ramp object, a 16-item array, or a file with a
`brandRamp` / `brand` property.

## Honest limitations

These are real and deliberate. Read them before trusting the output.

**1. Generating from `#0078d4` does NOT reproduce `DefaultPalette`.**
`DefaultPalette` is hand-tuned; the generator is not. Feeding the stock brand hex back
through the algorithm produces eight different `theme*` values:

| slot | generated | `DefaultPalette` |
|---|---|---|
| `themeLighterAlt` | `#f3f9fd` | `#eff6fc` |
| `themeLighter` | `#d0e7f8` | `#deecf9` |
| `themeLight` | `#a9d3f2` | `#c7e0f4` |
| `themeTertiary` | `#5ca9e5` | `#71afe5` |
| `themeSecondary` | `#1a86d9` | `#2b88d8` |
| `themeDarkAlt` | `#006cbe` | `#106ebe` |
| `themeDark` | `#005ba1` | `#005a9e` |
| `themeDarker` | `#004377` | `#004578` |

Call `generateV8Theme()` with **no** `primaryColor` to get `DefaultPalette` exactly - that
is the same trick the official designer uses (every slot is pre-seeded and marked
customised, so an untouched base colour keeps Microsoft's tuning). `generate-theme.mjs`
prints a warning whenever you hit this.

**2. The v9 brand-ramp stop positions are INFERRED, not verified.**
The research lists *"v9 brand ramp positional mapping (inferred from stale generator
comments, not shipped `brandWeb` values)"* under `unverified`. Only four stops are anchored
to real v8 slots - 80 = `themePrimary`, 70 = `themeDarkAlt`, 60 = `themeDark`,
40 = `themeDarker` - and the other twelve are interpolated across HSL lightness. Every stop
carries its provenance in the output; compare against a real `BrandVariants` before
shipping.

**3. `fonts` carry `fontSize` and `fontWeight` only.**
The research verified the v8 type ramp sizes but not the `fontFamily` strings
`createFontStyles` builds. Emitting a guessed family would be shipping an unverified value
as fact, so the field is omitted; `createTheme` fills it at runtime.

**4. There is no dark palette to generate from.**
26 dark palette slots are `null` in the research (`palette.dark.accent`, the whole
yellow/orange/magenta/purple/blue/teal/green families, both translucents). Only the 24 slots
in Microsoft's own `DarkCustomizations` sample were verifiable. A dark theme here therefore
comes from supplying `--background` and `--text`, not from an inverted palette table.

**5. `isInverted: true` on its own does nothing to the palette.**
This is upstream behaviour, not a gap here: `createTheme({ isInverted: true })` returns the
identical light palette and only ~20 hard-coded invariant semantic slots plus
`cardShadowHovered` change. Microsoft's own dark sample additionally overrides 13
`semanticColors` and 15 component styles, which is the honest measure of what a real dark
theme needs. Both facts are emitted as warnings.

**6. High contrast is out of scope.**
v8 handles HC through `HighContrastSelector` and CSS system keywords (`WindowText`,
`Window`, `Highlight`, ...), not through theme slots, so a v8 theme JSON has no HC fields
to generate or audit.

**7. `theme.components`, `theme.schemes` and `defaultFontStyle` are not modelled.**
They are listed under `unmappable.v8ToV9` and only `ThemeProvider` applies them. They pass
through untouched and are reported as lossy on conversion.

**8. Shipped v8 quirks are reproduced, not fixed.**
`blockingIcon` equals `blockingBackground` (so the icon is invisible) and `warningIcon` is
grey rather than amber. Both are the real shipped values. The auditor reports the
`blockingIcon` bug as a warning and waives its 1:1 contrast so a stock theme does not fail
its own audit.

## Contrast waivers

A failing pair is downgraded to info, with the ratio still printed, in three cases:

- `disabled` - WCAG 2.2 1.4.3 and 1.4.11 both exempt disabled controls.
- `decorative` - 1.4.11 exempts purely decorative graphics; Fluent's default dividers are
  1.19:1 and are not meant to read as UI.
- `upstreamBug` - the shipped default is broken and is reported once as its own finding.

Without waivers Microsoft's own reference theme fails its own audit, and a tool that cries
wolf on the reference theme gets ignored.

## Using the engine directly

```js
import {
  generateV8Theme, auditV8Theme, v8ThemeToV9, v9ToV8Theme,
  getShade, contrastRatio, V8ThemeError,
} from './scripts/v8/lib.mjs';

const { theme, warnings } = generateV8Theme({ primaryColor: '#8a2be2' });
const report = auditV8Theme(theme);          // { ok, summary, contrast, hardcoded, findings }
const v9 = v8ThemeToV9({ theme });           // { brandRamp, tokenOverrides, lossy, conflicts }
const back = v9ToV8Theme({ brandRamp: v9.brandRamp });
```

Every user-caused failure is a `V8ThemeError` with an actionable message, so the CLIs never
print a stack trace.

## v8 facts the engine encodes

- The `Shade` enum comments in `ThemeRulesStandard.ts` disagree with the actual
  `_makeFabricSlotRule` calls. The calls win; this module follows the calls.
- `rgb2hsv` rounds hue to integer degrees and s/v to integer percent. That rounding is lossy
  and is exactly what makes v8 ramps reproducible - it must not be "improved".
- `getShade` `_lighten` reduces saturation as well as raising value; `_darken` leaves
  saturation alone.
- `getBackgroundShade` indexes `BlackTintTableBG` from the far end (`length - 1 - index`)
  when inverted.
- `ThemeGenerator.getThemeAsJson` emits more than the 23 `FabricSlots` (it also emits
  `primaryColor`, `primaryColorShade1..8` and the background/foreground equivalents). Those
  are not `IPalette` slots and must be filtered before reaching `createTheme`.
- `createTheme` auto-sets `palette.accent` to `themePrimary` when `themePrimary` is supplied
  without an explicit `accent`.
- `mergeThemes` recomputes `semanticColors` from `partialTheme.palette` **only**, so a
  partial palette yields a theme where unmapped semantics keep default-blue values. Always
  supply all 50 slots; `createV8Theme` completes them from `DefaultPalette` and reports
  which ones it filled.
- `depComments: true` appends the literal string `' /* @deprecated */'` to deprecated colour
  **values**. Never enable it programmatically. It is not implemented here.
- `getTheme(true)` replaces the `loadTheme` singleton with a fresh default theme, silently
  discarding whatever was loaded.
- Five semantic slots are deprecated (`listTextColor`, `menuItemBackgroundChecked`,
  `warningHighlight`, `warningText`, `successText`). They are still emitted because `ITheme`
  still declares them, and the auditor lists them.

## Source

`data/theming.json` is a verbatim copy of the verified research extract. `meta.sources`
lists the 50 upstream files it was read from; `unverified` lists everything that could not
be confirmed. No value in this directory was invented.
