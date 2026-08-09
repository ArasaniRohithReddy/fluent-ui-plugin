# v8 styling and icons — merge-styles, import paths, `styled()`, MDL2

`fluent_v8_guidance section=styling` returns the machine-readable import map (16 symbol groups with `safest` / `alsoValid` / `doNotEmit`), the verified style-slot sets and the selector constants; `section=icons` returns the icon registry, aliases and the ~197 verified MDL2 names. Use those for lookup — this file is the reasoning and the recipes.

## 1. Import paths — get these right or the build breaks

v8 removed unrestricted deep imports: the package `exports` map gates resolution, so only declared entry points work. **92** `@fluentui/react/lib/X` entry points exist (one per component family plus `Styling`, `Utilities`, `Icons`, …). The barrel `@fluentui/react` always works; deep imports cut bundle size and are what the SPFx docs use.

| Symbols | Import from | Also valid | ⛔ Never emit from |
|---|---|---|---|
| `mergeStyles`, `mergeStyleSets`, `concatStyleSets`, `concatStyleSetsWithProps`, `keyframes`, `fontFace`, `Stylesheet`, `InjectionMode` | `@fluentui/react/lib/Styling` | `@fluentui/merge-styles`, `@fluentui/style-utilities`, `@fluentui/react` | — |
| `IStyle`, `IRawStyle`, `IStyleSet`, `IProcessedStyleSet`, `ITheme`, `IPartialTheme`, `IPalette`, `ISemanticColors`, `IEffects`, `IFontStyles`, `GlobalClassNames` | `@fluentui/react/lib/Styling` | `@fluentui/theme`, `@fluentui/merge-styles` | — (use `import type`) |
| **`IStyleFunctionOrObject`**, `IStyleFunction`, `IPropsWithStyles`, `ICustomizableProps` | **`@fluentui/react/lib/Utilities`** | `@fluentui/react`, `@fluentui/utilities` | **`@fluentui/react/lib/Styling`** — `Styling` does not export it; the build fails |
| **`styled`**, `classNamesFunction`, `css`, `memoizeFunction`, `customizable`, `getNativeProps`, `getId`, `IsFocusVisibleClassName`, `IRenderFunction`, `setRTL` | **`@fluentui/react/lib/Utilities`** | `@fluentui/utilities`, `@fluentui/react` | `@fluentui/react/lib/Styling` |
| `getFocusStyle`, `getFocusOutlineStyle`, `getInputFocusStyle`, `getGlobalClassNames`, `getScreenSelector`, `getHighContrastNoAdjustStyle`, `normalize`, `noWrap`, `hiddenContentStyle` | `@fluentui/react/lib/Styling` | `@fluentui/style-utilities` | — |
| `HighContrastSelector`, `HighContrastSelectorWhite/Black`, `ScreenWidthMin*` / `ScreenWidthMax*` | `@fluentui/react/lib/Styling` | `@fluentui/style-utilities` | `EdgeChromiumHighContrastSelector` (deprecated; now literally identical) |
| `FontSizes`, `FontWeights`, `IconFontSizes`, `DefaultPalette`, `DefaultEffects`, `ZIndexes`, `AnimationStyles`, `AnimationVariables`, `DefaultFontStyles`, `createFontStyles` | `@fluentui/react/lib/Styling` | `@fluentui/style-utilities`, `@fluentui/theme` | — |
| `createTheme`, `loadTheme`, `getTheme`, `registerOnThemeChangeCallback`, `removeOnThemeChangeCallback` | `@fluentui/react/lib/Styling` | `@fluentui/style-utilities`, `@fluentui/theme` | — |
| **`NeutralColors`, `SharedColors`, `CommunicationColors`, `Depths`** | **`@fluentui/theme`** | — | **`@fluentui/react/lib/Styling` and `@fluentui/react`** — they are not in the `Styling` export list. The single most common broken generated import. |
| `registerIcons`, `registerIconAlias`, `unregisterIcons`, `setIconOptions`, `getIcon`, `getIconClassName`, `buildClassMap` | `@fluentui/react/lib/Styling` | `@fluentui/style-utilities` | `registerIconAliases` (plural — internal, not exported) |
| `initializeIcons` | `@fluentui/font-icons-mdl2` | `@fluentui/react/lib/Icons`, `@fluentui/react` | `@uifabric/icons` (the v7 registrar — duplicate registration) |
| `Icon`, `FontIcon`, `ImageIcon`, `IIconProps` | `@fluentui/react/lib/Icon` | `@fluentui/react` | — |
| `Stack`, `StackItem`, `IStackTokens`, `IStackStyles` | `@fluentui/react/lib/Stack` | `@fluentui/react` | — |
| `AddIcon`, `DeleteIcon`, `SearchIcon`, `createSvgIcon` (MDL2 SVG) | `@fluentui/react-icons-mdl2` | — | `@fluentui/react-icons` (that's the **v9** Fluent System set) |
| `ThemeProvider`, `ThemeContext`, `useTheme` | **`@fluentui/react`** (barrel) | — | `@fluentui/react/lib/ThemeProvider` — **does not exist**. (`.../lib/utilities/ThemeProvider` matches the source layout but was **not** confirmed against the `exports` map — prefer the barrel.) |

Deprecated exports to stop emitting: `IconNames` (const enum), `IIconProps.iconType` / `IconType`, `IIconProps.ariaLabel` (use native `aria-label`), `Fabric`, the bare `Button` export (use `DefaultButton`/`PrimaryButton`/…), `Grid`/`IGrid*` (use `ButtonGrid`), v8's `makeStyles`, `withResponsiveMode`, `BaseComponent`. Subset files such as `@fluentui/font-icons-mdl2/lib/fabric-icons-3` work mechanically but are undocumented internals — treat as unsupported. Per-component prop deprecations are in `components.md`.

## 2. The `styles` prop

v8 uses **merge-styles**: static class generation, no CSS custom properties, no atomic compilation. Every styled component takes a `styles` prop typed `IStyleFunctionOrObject<IXStyleProps, IXStyles>` — an object *or* a function of the style props. Merge order is **base styles → `Customizer` / `theme.components` → `props.styles` (wins)**.

```tsx
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { getFocusStyle, FontWeights, HighContrastSelector } from '@fluentui/react/lib/Styling';
import { useTheme } from '@fluentui/react';
import type { IButtonStyles, ITheme } from '@fluentui/react';

const getStyles = (t: ITheme): IButtonStyles => ({
  root: [
    getFocusStyle(t, { inset: 2, borderRadius: t.effects.roundedCorner4 }),   // options-object form
    {
      borderRadius: t.effects.roundedCorner4,
      backgroundColor: t.semanticColors.primaryButtonBackground,
      [HighContrastSelector]: { border: '1px solid WindowText' },
    },
  ],
  rootHovered: { backgroundColor: t.palette.themeDarkAlt },                   // state = its own slot
  label: { fontWeight: FontWeights.semibold },
});

export const Save = () => <PrimaryButton text="Save" styles={getStyles(useTheme())} />;
```

- **States are separate slots, not pseudo-selectors:** `rootHovered`, `rootPressed`, `rootChecked`, `rootDisabled`, `rootFocused`, `rootExpanded`, plus per-part `iconHovered`, `labelDisabled`, `menuIcon*`, `splitButton*`. `IButtonStyles` alone has **56 slots**.
- Sub-components are reached through **`subComponentStyles`** (present on `ITextFieldStyles`, `IDropdownStyles`, `IPanelStyles`, …), not by drilling into the DOM.
- `getFocusStyle`'s positional-argument overload is deprecated — always pass the options object.

Verified style-slot sets — `ITextFieldStyles` `root, fieldGroup, prefix, suffix, field, icon, description, wrapper, errorMessage, revealButton, revealSpan, revealIcon, subComponentStyles` · `IPanelStyles` `root, overlay, hiddenPanel, main, commands, contentInner, scrollableContent, navigation, closeButton, header, headerText, content, footer, footerInner, subComponentStyles` · `IDialogStyles` **only `root` and `main`** (title/subtext live on `IDialogContentStyles`: `content, subText, header, button, inner, innerContent, title, topButton`) · `IDetailsListStyles` `root, focusZone, headerWrapper, contentWrapper` · `IIconStyles` `root, imageContainer` · `IStackStyles` `root, inner`. `IDropdownStyles` is the widest, with a slot per item state (`dropdownItemSelected`, `dropdownItemDisabled`, `dropdownItemSelectedAndDisabled`, `dropdownItemHidden`, `dropdownItemHeader`, `dropdownDivider`, …) plus `panel`, `callout` and `subComponentStyles`. When in doubt, read the component's `*.types.ts` — it is the authority.

## 3. Standalone classes and custom components

```tsx
import { mergeStyleSets } from '@fluentui/react/lib/Styling';

const classNames = mergeStyleSets({
  root: { display: 'flex', ':hover': { background: 'red' } },
  label: ['ms-MyLabel', { fontWeight: 600 }],     // → 'ms-MyLabel label-1'
});
<div className={classNames.root} />;
```

`mergeStyles(...)` returns a single class name; `mergeStyleSets(...)` returns slot→class (the slot name becomes the class prefix); `concatStyleSets(...)` composes **without** generating class names (cheaper when you only need composition); `concatStyleSetsWithProps(props, ...)` evaluates style *functions* first — it's what `styled()` uses internally.

For a reusable themed component, follow v8's own `Base` + `.styles` + `styled()` pattern:

```tsx
// MyThing.tsx
import { styled } from '@fluentui/react/lib/Utilities';
import { MyThingBase } from './MyThing.base';
import { getStyles } from './MyThing.styles';

export const MyThing = styled(MyThingBase, getStyles, undefined, { scope: 'MyThing' });

// MyThing.base.tsx
import { classNamesFunction } from '@fluentui/react/lib/Utilities';
const getClassNames = classNamesFunction<IMyThingStyleProps, IMyThingStyles>();   // memoized, cache 50

export const MyThingBase: React.FC<IMyThingProps> = props => {
  const classNames = getClassNames(props.styles, { theme: props.theme!, className: props.className });
  return <div className={classNames.root} />;
};
```

Pass **immutable scalars only** into `getClassNames` — the memoization is identity-based, so a fresh object each render defeats the cache. `getGlobalClassNames({ root: 'ms-MyThing' }, theme)` emits the `ms-*` global class names (or uniquified ones when `theme.disableGlobalClassNames` is set).

Handy building blocks from `lib/Styling`: `normalize` (`boxShadow none, margin 0, padding 0, boxSizing border-box`), `noWrap` (`overflow hidden, textOverflow ellipsis, whiteSpace nowrap`), `hiddenContentStyle` (visually hidden, still announced), `getScreenSelector(min, max)`, and the breakpoint constants `ScreenWidthMinSmall` 320 / `Medium` 480 / `Large` 640 / `XLarge` 1024 / `XXLarge` 1366 / `XXXLarge` 1920 (`ScreenWidthMinUhfMobile` 768).

## 4. Icons — `initializeIcons()` and its two failure modes

`initializeIcons` is re-exported from `@fluentui/react` (and from `@fluentui/react/lib/Icons`) in 8.125.7 — installing `@fluentui/font-icons-mdl2` explicitly just lets you import it from its own package, which is the most stable path. On older 8.x pins you may need `@fluentui/react/lib/Icons`.

| Symptom | Cause | Fix |
|---|---|---|
| Blank gap; DOM shows `<i data-icon-name="Add">` with **empty content**; console: *"The icon "X" was used but not registered."* | `initializeIcons()` never ran, or ran after first render | Call it once at entry module scope |
| **Tofu boxes** / boxes-with-question-marks — registry is fine, glyph isn't | The `.woff` never loaded: CDN blocked, CSP `font-src` missing, or a wrong `baseUrl` | Allow the font host in CSP, or self-host: `initializeIcons('/assets/fluent-icons/')` |
| *"Some icons were re-registered…"* | Two registrars (app **and** a library, or `@uifabric/icons` from v7 alongside v8) | Register once; **first registration wins**. `initializeIcons(undefined, { disableWarnings: true })` only silences the noise |

Diagnostic: inspect the element — `data-icon-name` present with empty text means *not registered*; present with a glyph box means *font failed to load*.

Runtime alternative to the argument: `window.FabricConfig = { iconBaseUrl: '/assets/fluent-icons/' }`, set **before** Fluent loads. **Never hardcode the CDN URL** — the default base is a date-stamped release constant, so pinning it silently freezes users on a stale icon font.

To replace a built-in glyph you must **unregister first** (registration is first-wins):

```tsx
import { registerIcons, unregisterIcons } from '@fluentui/react/lib/Styling';

unregisterIcons(['Add']);
registerIcons({ icons: { Add: <svg viewBox="0 0 20 20" width="1em" height="1em"><path d="…" /></svg> } });
```

Icon names are **case-insensitive** (lowercased, then resolved through an alias table — e.g. `Trash`→`Delete`, `OneDrive`→`OneDriveLogo`, `ToggleOn`→`ToggleLeft`).

**Font vs SVG.** `@fluentui/react-icons-mdl2` (`<AddIcon />`) needs no `initializeIcons()`, no CDN and no `font-src`, and tree-shakes — but it does **not** replace the font icons v8 uses internally (Dropdown caret, DetailsList sort arrows, TextField reveal), and it can't do dynamic `iconName` lookup. Most apps need the font registrar regardless.

For icon *names*, call `fluent_v8_guidance section=icons` (≈197 verified MDL2 names, the alias table and verified codepoints) rather than guessing, or `microsoft_docs_search(query="Fluent UI React v8 initializeIcons registerIcons MDL2 icons")`.
