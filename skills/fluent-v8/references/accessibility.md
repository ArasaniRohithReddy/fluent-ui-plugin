# Accessibility on v8

v8 gives you the primitives, but several defaults are wrong-by-omission. Use the `fluent-accessibility` skill for the WCAG 2.1 AA baseline; below are the v8-specific mechanics. `fluent_v8_guidance section=accessibility` returns the machine-readable component notes, keyboard patterns, 29 known gaps and a 28-item checklist.

## `FocusZone` — roving tabindex

Turns a group of items into **one** tab stop.

```tsx
import { FocusZone, FocusZoneDirection } from '@fluentui/react/lib/FocusZone';
<FocusZone direction={FocusZoneDirection.vertical} isCircularNavigation>{items}</FocusZone>
```

`FocusZoneDirection`: `vertical` 0 (↑↓ — nav, menus, rows), `horizontal` 1 (←→ — toolbars, Pivot), `bidirectional` 2 (**default**, 2-D geometric — grids, tiles), `domOrder` 3 (all arrows, linear DOM order, RTL-aware). ⚠️ The default does *geometric* focus math and is usually wrong on a wrapping flex list — **always set `direction` explicitly**; `domOrder` is often what people actually want. ARIA requires wrapping in menus, so pair `role="menu"` patterns with `isCircularNavigation`. **`handleTabKey` creates a keyboard trap by design** (the source itself calls it "an unfortunate side effect") — WCAG 2.1.2 risk. `shouldRaiseClicks` (default **true**) fires clicks on Enter/Space for non-button elements: convenient, but it papers over missing semantics.

## `FocusTrapZone`

Bumper-based focus trap with a module-level stack so nesting works. `forceFocusInsideTrap` defaults **true**; `firstFocusableSelector` is deprecated → `firstFocusableTarget`; `ignoreExternalFocusing` → `disableRestoreFocus`. Two real bugs to avoid: **`enableAriaHiddenSiblings` is not on by default here** (it *is* on `Modal`/`Popup`), so a screen reader in browse mode still reads the page behind your "modal"; and `FocusTrapZone` provides **no dialog semantics at all** — no `role="dialog"`, no `aria-modal`, no Escape handling. Prefer `Modal`/`Dialog`/`Panel`, which compose `FocusTrapZone` + `Popup` + `Layer` + `Overlay` correctly. Always keep at least one focusable child (an empty trap can loop).

## `Layer` / `LayerHost`

Portals to the end of `<body>` (`ZIndexes.Layer` = 1 000 000). v8 records a *virtual* parent so click-outside and focus containment still work, but **assistive technology and CSS know nothing about it**: DOM order no longer matches visual order (WCAG 1.3.2), and any trigger↔content relationship must be re-declared with `aria-owns` / `aria-controls` / `aria-expanded`. Use `<LayerHost id="x" />` + `<Layer hostId="x">` to place portalled content near its trigger; `setLayerHostSelector` is the standard SPFx fix for portal placement.

## `Announced` — the live region

```tsx
import { Announced } from '@fluentui/react/lib/Announced';
<Announced message={`${results.length} results found`} />   {/* aria-live defaults to 'polite' */}
```

Three gotchas: the root is hard-coded `role="status"` regardless of `aria-live`, so `aria-live="assertive"` produces a contradictory pair — for true alerts use your own `role="alert"` region. Re-rendering with the **same string announces nothing** (vary the text). And keep **one** instance mounted and change `message`; mounting/unmounting per event is unreliable.

## High contrast

v8 has **no high-contrast theme** — it relies on the OS forcing colors plus per-component media-query patches, so branch every custom style yourself:

```tsx
import { HighContrastSelector } from '@fluentui/react/lib/Styling';
import type { ITheme, IStyle } from '@fluentui/react/lib/Styling';

const getRootStyle = (t: ITheme): IStyle => ({
  border: `1px solid ${t.semanticColors.inputBorder}`,
  [HighContrastSelector]: { border: '1px solid WindowText', color: 'WindowText' },
});
```

`HighContrastSelector` = `@media screen and (-ms-high-contrast: active), screen and (forced-colors: active)` — it already covers modern Chromium. **Audit rule: grep for `-ms-high-contrast` *without* a `forced-colors` clause — that CSS is dead in current Chrome/Edge.** `HighContrastSelectorWhite`/`Black` detect polarity; `getHighContrastNoAdjustStyle()` opts out (`forcedColorAdjust: 'none'`). Inside these blocks use CSS system colors (`WindowText`, `Window`, `Highlight`, `HighlightText`, `GrayText`, `ButtonText`, `ButtonFace`), never theme slots.

## Known v8 gaps — you must close these yourself

| Gap | Consequence |
|---|---|
| **No `prefers-reduced-motion` anywhere in `AnimationStyles`** (~40 animations run unconditionally) | WCAG 2.3.3 fail, 2.2.2 risk. Add your own media query. |
| **Focus rings are opt-in via a body class** — `getFocusStyle` only paints under `.ms-Fabric--isFocusVisible`, and v8 sets `outline: transparent` unconditionally | Without `ThemeProvider`/`Fabric`/`FocusRects` there is **no visible focus indicator at all**. WCAG 2.4.7. |
| Focus ring is a **1px** double ring (white inner + `#605e5c` outer) | Can fall below 3:1 on non-neutral backgrounds (WCAG 1.4.11 / 2.4.13). |
| **Type ramp carries no line-height** | Text-spacing and reflow behaviour is unpredictable (WCAG 1.4.12). |
| **`themePrimary` `#0078d4` on white ≈ 4.53:1** | Passes AA by 0.03; any tint or overlay tips it under. (Fluent 2 moved to `#0f6cbd` ≈ 5.44:1 for exactly this reason.) v8 does **no** contrast validation when you `createTheme`. |

## Grep list for reviews

Icon-only `IconButton`/`ActionButton`/`CommandBarButton` with no `ariaLabel` (v8 auto-`aria-hidden`s an unnamed icon, so the button announces as just "button") · `<Callout>` with no `role` · `<FocusZone>` with no `direction` · `enableAriaHiddenSiblings={false}` · `shouldFocusOnContainer` on `ContextualMenu` (in-source warning: *"breaks the default focus behaviour when using assistive technologies"*) · `shouldApplyApplicationRole` on `DetailsList` · `<Overlay>` used alone as a "modal" (no role, no trap, no Escape) · custom `styles.root` that drops `getFocusStyle` · `outline: none` in app CSS over v8 components · `aria-label` on a *decorative* `Icon` · async updates with no `<Announced>` · `Pivot` items given a custom `role` ≠ `'tab'` (source drops `aria-selected`) · `Nav` with `linkAs`/`onRenderLink` swapping the `ActionButton` for a `<div>` (loses button semantics and `aria-current`).
