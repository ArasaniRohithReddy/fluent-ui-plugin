# v8 theming — `createTheme`, palette, `semanticColors`, ThemeGenerator

Call `fluent_v8_guidance section=theming` for the machine-readable data: all 50 palette slots, all 103 `semanticColors` with their v9 mappings, `fonts`, `effects`, `spacing`, and the theme-generation algorithm. This file is the judgement layer on top of it.

## Pick the right API

| API | Use it for | Pitfall |
|---|---|---|
| **`createTheme(partial): ITheme`** | Building a theme object. Pure, side-effect free: fills every slot from the defaults, then merges your partial. | `mergeThemes` recomputes `semanticColors` **from `partialTheme.palette` only** — a *partial* palette yields a mixed theme where unmapped semantics keep default blue. **Supply all 50 palette slots.** Setting `themePrimary` without `accent` auto-sets `accent = themePrimary`. Never pass `depComments: true` programmatically — it appends the literal string `' /* @deprecated */'` to color **values**. |
| **`<ThemeProvider theme>`** | **The recommended way to apply a theme.** Merges with the parent theme, provides `ThemeContext` + `CustomizerContext` + `FocusRectsProvider`, and is the **only** mechanism that applies `theme.components`. Nestable for sectional theming. | Emits a merge-styles class with **literal values** — v8 has **no CSS custom properties**. Renders a real `<div>` by default. The merge is memoized on object identity, so an inline `theme={{…}}` literal re-merges every render. Does **not** fire `registerOnThemeChangeCallback`. |
| `loadTheme(partial)` | Global application when you have legacy SCSS relying on `@microsoft/load-themed-styles`. | Module singleton — **last call wins app-wide**, can't be scoped or nested, and must run before first render or you get FOUC. Officially superseded by `ThemeProvider`. |
| `getTheme()` | Reading the `loadTheme` singleton from non-React code. | Does **not** see `<ThemeProvider>` themes. `getTheme(true)` **replaces** the singleton with a fresh default theme, silently discarding what was loaded. |
| `useTheme()` | Reading the active theme inside a function component. Never returns undefined. | The final fallback allocates a fresh default theme, so an unwrapped component **silently renders default Fluent blue instead of erroring**. Class components use `<ThemeContext.Consumer>`. |
| `<Customizer settings scopedSettings>` | **Legacy only** — maintaining pre-v8 code. | `@deprecated` for theming as of v8; slated for removal. Replaces rather than layers a partial theme, and only reaches components wrapped by `customizable()`/`styled()`. Migrate `settings={{ theme }}` → `<ThemeProvider theme>`, and `scopedSettings={{ X: { styles } }}` → `theme={{ components: { X: { styles } } }}`. |

## Prefer `semanticColors` over raw `palette`

`ITheme` carries a **50-slot `palette`** (raw colors) and **103 `semanticColors`** (roles). Palette slots say *what a color is*; semantic slots say *what it's for* — and semantics are what v8 components actually consume, so styling against them survives a palette swap, an inverted (dark) palette, and the invariant status colors.

```tsx
const styles = (t: ITheme): IStyle => ({
  color: t.semanticColors.bodyText,             // ✅ role
  borderColor: t.semanticColors.inputBorder,
  // color: t.palette.neutralPrimary,           // ❌ same value today, wrong after a theme swap
});
```

Frequently used semantic slots (light-theme default → the palette slot it derives from):

| Slot | Default | Derives from |
|---|---|---|
| `bodyBackground` | `#ffffff` | `white` |
| `bodyText` | `#323130` | `neutralPrimary` |
| `bodySubtext` | `#605e5c` | `neutralSecondary` |
| `disabledText` / `disabledBodyText` | `#a19f9d` | `neutralTertiary` |
| `link` | `#0078d4` | `themePrimary` |
| `linkHovered` | `#004578` | `themeDarker` |
| `inputBorder` | `#605e5c` | `neutralSecondary` |
| `inputBorderHovered` | `#323130` | `neutralPrimary` |
| `inputFocusBorderAlt` | `#0078d4` | `themePrimary` |
| `buttonBackground` / `buttonText` | `#ffffff` / `#323130` | `white` / `neutralPrimary` |
| `primaryButtonBackground` / `primaryButtonText` | `#0078d4` / `#ffffff` | `themePrimary` / `white` |
| `focusBorder` | `#605e5c` | `neutralSecondary` |
| `menuItemBackgroundHovered` | `#f3f2f1` | `neutralLighter` |
| `cardStandoutBackground` | `#ffffff` | `white` |
| `cardShadow` | `effects.elevation4` | *(not a palette slot)* |

The status slots are **invariant** — they don't derive from the palette and don't change when you rebrand: `errorText` `#a4262c` (dark `#F1707B`), `errorBackground` `#FDE7E9` (dark `#442726`), `successBackground` `#DFF6DD` (dark `#393D1B`), `warningBackground` `#FFF4CE` (dark `#433519`), `severeWarningBackground` `#FED9CC` (dark `#4F2A0F`).

## The rest of the theme object

| Group | Values |
|---|---|
| `theme.effects` | `roundedCorner2` **2px**, `roundedCorner4` **4px**, `roundedCorner6` **6px**; `elevation4` `0 1.6px 3.6px 0 rgba(0,0,0,.132), 0 .3px .9px 0 rgba(0,0,0,.108)`, plus `elevation8`, `elevation16`, `elevation64`. **That's the whole radius scale — v8 has no pill/circular token** (hand-roll `borderRadius: '50%'`). |
| `theme.fonts` (`IFontStyles`) | `tiny`/`xSmall` 10px·400 · `small`/`smallPlus` 12px·400 · `medium` **14px·400** · `mediumPlus` 16px·400 · `large` 18px·400 · `xLarge` 20px·600 · `xLargePlus` 24px·600 · `xxLarge` 28px·600 · `xxLargePlus` 32px·600 · `superLarge` 42px·600 · `mega` 68px·600. **v8 emits no `lineHeight`** — set it yourself where vertical rhythm or WCAG 1.4.12 matters. |
| `FontWeights` | `light` 100, `semilight` 300, `regular` 400, `semibold` 600, `bold` 700. |
| `theme.spacing` | `s2` 4px, `s1` 8px, `m` **16px**, `l1` 20px, `l2` 32px. ⚠️ `ISpacing` is marked `@internal` and *"will be changed post design review"*, and v8's own component styles hard-code pixels instead — don't build a spacing system on it. |
| `AnimationVariables` | `easeFunction1` `cubic-bezier(.1,.9,.2,1)`, `easeFunction2` `cubic-bezier(.1,.25,.75,.9)`; `durationValue1..4` = **0.167s / 0.267s / 0.367s / 0.467s**. `AnimationStyles` has **no `prefers-reduced-motion` handling** — add it yourself (see `accessibility.md`). |
| `ZIndexes` | `Nav` 1, `FocusStyle` 1, `Coachmark` 1000, **`Layer` 1000000**, `KeytipLayer` 1000001. |

## Dark theme — the part that surprises people

**`createTheme({ isInverted: true })` does not invert anything.** It returns the identical light palette; only ~19 hard-coded invariant semantic slots (plus `cardShadowHovered`) change. A usable dark theme needs an **explicit inverted palette** — the ramp reverses (`themeDarker` becomes the *lightest* blue, `black` → `#ffffff`, `white` → `#1b1a19`). Microsoft's own `DarkCustomizations` sample additionally overrides **13 `semanticColors`** and **15 component styles**, and defines only 24 of the 50 palette slots (the status/accent families stay at their light defaults). Budget for that.

## Generating a palette from one brand color

v8's generator lives in `@fluentui/react/lib/ThemeGenerator` (+ `@fluentui/react/lib/Color`) and derives 23 Fabric slots from three base colors — `primaryColor`, `backgroundColor`, `foregroundColor` (defaults `#0078d4` / `#ffffff` / `#323130`):

```tsx
import { ThemeGenerator, themeRulesStandardCreator } from '@fluentui/react/lib/ThemeGenerator';
import { getColorFromString, isDark } from '@fluentui/react/lib/Color';
import { createTheme } from '@fluentui/react/lib/Styling';

const rules = themeRulesStandardCreator();
ThemeGenerator.insureSlots(rules, /* isInverted */ false);
ThemeGenerator.setSlot(rules.primaryColor, getColorFromString('#0b6a0b')!, false, true, true);

const palette = ThemeGenerator.getThemeAsJson(rules);   // filter to FabricSlots — see below
export const brandTheme = createTheme({ palette, isInverted: false });
```

Four things bite here. `getThemeAsJson` returns **more than the 23 Fabric slots** (it also emits `primaryColor`, `primaryColorShade1..8`, `backgroundColor*`, `foregroundColor*`) — filter with the `FabricSlots` enum. It uses `rule.color.str`, which preserves the user's literal input (`'red'`) — read `rule.color.hex` for deterministic `#rrggbb`. `getColorFromString` needs a DOM `Document`, so pre-parse in Node/SSR (`isDark(color)` chooses `isInverted`). And the generated ramp **differs from `DefaultPalette`** — `#0078d4` generates `themeLighterAlt #f3f9fd` / `themeLighter #d0e7f8`, not the hand-tuned `#eff6fc` / `#deecf9`. Leaving foreground/background untouched keeps Fluent's hand-tuned neutrals; the generator never emits `accent`, the translucent slots, or the 24 status colors, so `createTheme` fills those from `DefaultPalette`.

**Headless alternative.** Because `getColorFromString` needs a DOM, the official generator can't run in Node or CI. This repo ships a dependency-free reimplementation at `scripts/v8/`: `generate-theme.mjs` (brand/text/background → full theme JSON or a paste-ready `createTheme({…})` snippet), `audit-theme.mjs` (exits non-zero on an invalid theme), `convert-theme.mjs` (v8 ⇄ v9). See `scripts/v8/README.md`.

## The Fluent 2 look without leaving v8

`@fluentui/fluent2-theme` is an official Microsoft package — *"A Fluent2 theme for Fluent UI React 8.x"* — released in lockstep with v8. It exports `Fluent2WebLightTheme` / `Fluent2WebDarkTheme` for `<ThemeProvider theme={…}>`. It is **cosmetic only**: it changes no component API, prop, DOM structure or behaviour, and only ~32 component keys carry Fluent 2 overrides — everything else keeps its v8 look. Recommend it to teams hard-pinned to v8 (SPFx, PCF Fluent 8) who want the Fluent 2 visuals. Details: `fluent_v8_guidance section=fluent2-theme`.

Note also that `@fluentui/react-charting` stays v8-based regardless of which version the rest of your app uses.
