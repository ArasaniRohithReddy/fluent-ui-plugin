# Positioning (`positioning` prop) — flip, overflow, autoSize, offset, arrows

Floating surfaces in Fluent v9 are positioned by the **same** engine (`@fluentui/react-positioning`, a wrapper over [Floating UI](https://floating-ui.com/)) and configured by the **same** `positioning` prop. Upstream names `Tooltip`, `Menu` and `Popover`; `Combobox`/`Dropdown` (listbox) take it too. Learn it once.

Sources: [Positioning components](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-positioning-components--docs) (20 stories) and the published types [`@fluentui/react-positioning@9.23.1/dist/index.d.ts`](https://unpkg.com/@fluentui/react-positioning@9.23.1/dist/index.d.ts) unless noted.

> "Fluent components that have slots which are positioned will always expose a `positioning` prop where the positioning of the slot can be configured."

---

## The two ways to pass it

```tsx
// 1. Shorthand — placement only
<Popover positioning="above-start">…</Popover>

// 2. Object — everything else
<Popover positioning={{ position: 'above', align: 'start', offset: { mainAxis: 8 } }}>…</Popover>
```
`PositioningShorthand = PositioningProps | PositioningShorthandValue`.

**The 12 legal shorthand values — and they are not freely combinable:**

| Base | Legal suffixes |
|---|---|
| `above`, `below` | `-start`, `-end` |
| `before`, `after` | `-top`, `-bottom` |

`'above' | 'above-start' | 'above-end' | 'below' | 'below-start' | 'below-end' | 'before' | 'before-top' | 'before-bottom' | 'after' | 'after-top' | 'after-bottom'`

There is no `above-top` or `before-start`. Vertical positions take horizontal alignments and vice versa — see the next rule for *why*, because in object form the same mistake compiles.

---

## Silent-failure rules

### 1. `position` outranks `align`, and a same-axis pair is silently rewritten to `center`

> "Position has higher priority than align. If position is vertical (`'above' | 'below'`) and align is also vertical (`'top' | 'bottom'`) or if both position and align are horizontal (`'before' | 'after'` and `'start' | 'end'` respectively), then **provided value for 'align' will be ignored and 'center' will be used instead**."

```tsx
<Popover positioning={{ position: 'above', align: 'top' }} />    // ❌ align silently becomes 'center'
<Popover positioning={{ position: 'above', align: 'start' }} />  // ✅
<Popover positioning={{ position: 'after', align: 'top' }} />    // ✅
<Popover positioning={{ align: 'start' }} />                     // ❌ no position → also 'center'
```
No warning, no type error — just a surface that isn't where you designed it. `align` alone does nothing: *"Only has an effect if used with the @see position option."* The rule is one function, [`toFloatingUIPlacement.ts`](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-positioning/library/src/utils/toFloatingUIPlacement.ts):

```ts
const shouldAlignToCenter = (p?: Position, a?: Alignment): boolean => {
  const positionedVertically = p === 'above' || p === 'below';
  const alignedVertically = a === 'top' || a === 'bottom';
  return (positionedVertically && alignedVertically) || (!positionedVertically && !alignedVertically);
};
```

### 2. `pinned: true` is how a popup escapes the viewport

> "Disables automatic repositioning of the component; it will always be placed according to the values of `align` and `position` props, **regardless of the size of the component, the reference element or the viewport**."

`pinned` turns off flip *and* shift. Reach for `fallbackPositions` or a boundary instead; only pin when the design genuinely requires a fixed side.

### 3. `flipBoundary` and `overflowBoundary` are **two different** boundaries — set both

- `flipBoundary` — bounds the **flip** behaviour (switching `above` → `below`).
- `overflowBoundary` — bounds the **overflow/shift** behaviour (nudging along the cross axis).

Setting only one leaves the other on its default (the clipping parents / viewport), which is exactly how a menu ends up half outside a scrolling panel. Upstream's own `autoSize` example sets both to the same node:

```tsx
const [boundaryRef, setBoundaryRef] = React.useState<HTMLDivElement | null>(null);

<div ref={setBoundaryRef} className={styles.boundary}>
  <Menu positioning={{ overflowBoundary: boundaryRef, flipBoundary: boundaryRef, autoSize: true }}>…</Menu>
</div>
```
> Use a **state callback ref** (`React.useState<HTMLElement | null>`), not `useRef`. A `useRef` is `null` on first render and never triggers the re-render that hands the boundary to the positioning engine.

`PositioningBoundary = PositioningRect | HTMLElement | HTMLElement[] | 'clippingParents' | 'scrollParent' | 'window'`. A `Rect` (`{ width, height, x, y }`) is allowed *"when a boundary is not an actual element, but some kind of computed values"* — pair it with `useIsomorphicLayoutEffect` + `getBoundingClientRect()`.

### 4. `matchTargetSize` requires `box-sizing: border-box`

> "⚠️ Make sure that the positioned element use `box-sizing: border-box`"

The type is literally `matchTargetSize?: 'width'` — width is the only supported dimension. Without `border-box`, the surface's own padding and border are added *on top of* the matched width and it overhangs its target.

```tsx
<Popover positioning={{ matchTargetSize: 'width' }}>
  <PopoverTrigger disableButtonEnhancement>
    <Button className={styles.target}>Click me</Button>
  </PopoverTrigger>
  <PopoverSurface style={{ boxSizing: 'border-box' }}>Same width as the target</PopoverSurface>
</Popover>
```
This is the combobox/autocomplete pattern — *"useful for autocomplete or combobox input fields where the popover should match the width of the text input field."*

### 5. A custom `offset` on a component with an arrow **replaces** the arrow offset

`react-positioning` exports `mergeArrowOffset` for exactly this: *"Generally when adding an arrow to popper, it's necessary to offset the position of the popper by the height of the arrow. A simple utility to merge a provided offset with an arrow height to return the final offset."*

```ts
mergeArrowOffset(userOffset: Offset | undefined | null, arrowHeight: number): Offset
```
Companions: `createArrowStyles({ arrowHeight })` and `createArrowHeightStyles(arrowHeight)` — *"pass the `arrowHeight` param to createArrowStyles"* for a constant arrow, or `createArrowStyles({ arrowHeight: undefined })` + `createArrowHeightStyles(n)` when the arrow can be different sizes. Use `arrowPadding` to stop the arrow sitting on a rounded corner: *"Defines padding between the corner of the popup element and the arrow. Use to prevent the arrow from overlapping a rounded corner."*

### 6. `autoSize: 'always' | 'height-always' | 'width-always'` are obsolete no-ops

> "Note that options `'always'`/`'height-always'`/`'width-always'` are **now obsolete, and equivalent to** `true`/`'height'`/`'width'`."

The type still accepts them (`AutoSize = 'height' | 'height-always' | 'width' | 'width-always' | 'always' | boolean`), so old code compiles and means something different than its author intended. Use `true | 'height' | 'width'`.

> "`autoSize` sets inline max-width and max-height styles to the element to ensure it fits within the available space." It sets **max** constraints — it does not shrink content, so the surface still needs its own `overflow` handling.

### 7. `onPositioningEnd` reports a **physical** placement, not Fluent's vocabulary

> "Positioning happens outside of the React render lifecycle for performance purposes so that a position update does not need to: trigger by a re-render / be dependent on a re-render."

That is why you cannot observe the final placement from render. The callback's `event.detail` is `{ placement, escaped, referenceHidden }` and `placement` is Floating UI's physical enum — `'top' | 'top-start' | 'top-end' | 'right' | … | 'left-end'` — **not** `above`/`below`/`before`/`after`. Mapping code that compares it to `position` will never match.

```tsx
type OnPositioningEndEvent = Parameters<Exclude<PositioningProps['onPositioningEnd'], undefined>>[0];

const onPositioningEnd = React.useCallback((e: OnPositioningEndEvent) => {
  const { placement, escaped, referenceHidden } = e.detail;
  const visibility = escaped || referenceHidden ? 'hidden' : 'visible';
}, []);

<Popover positioning={{ positioningRef, onPositioningEnd, position: 'below' }}>…</Popover>
```
`escaped` / `referenceHidden` come from Floating UI's hide middleware — upstream added them *"so consumers can respond to visibility conditions without relying on CSS attribute selectors."* The same payload is available as the DOM event **`fui-positioningend`**.

> "⚠️ *Very few use cases would actually require listening to position updates. Please remember that there is a difference between this and the **open/close state** which is normally handled in React.*"

### 8. You probably don't need `positioningRef.updatePosition()` any more

> "⚠️ In later versions of Fluent UI, position updates are triggered once the target or container dimensions change. This was previously the main use case for imperative position updates. **Please think carefully if your scenario needs this pattern in the future.**"

A resize observer already runs; `disableUpdateOnResize: true` is what turns it off. `updatePosition()` is for movement that changes neither dimension.

---

## The whole prop surface

| Prop | Type | Default | What it does |
|---|---|---|---|
| `position` | `'before' \| 'after' \| 'above' \| 'below'` | — | Side. Outranks `align`. |
| `align` | `'center' \| 'start' \| 'end' \| 'top' \| 'bottom'` | — | Alignment. Only meaningful with `position`, on the *other* axis. |
| `offset` | `number \| { mainAxis: number; crossAxis?: number } \| (p) => …` | — | Displacement from the target. |
| `target` | `HTMLElement \| PositioningVirtualElement \| null` | — | Manual anchor override. |
| `positioningRef` | `Ref<PositioningImperativeRef>` | — | `{ updatePosition(), setTarget() }`. |
| `flipBoundary` | `PositioningBoundary \| null` | clipping parents | Bounds the **flip**. |
| `overflowBoundary` | `PositioningBoundary \| null` | clipping parents | Bounds the **overflow/shift**. |
| `overflowBoundaryPadding` | `number \| { top; end; bottom; start }` | — | Detect overflow earlier, before the surface touches the boundary. |
| `fallbackPositions` | `PositioningShorthandValue[]` | — | Used only *"if flip fails to stop the positioned element from overflowing its boundaries"*. |
| `autoSize` | `boolean \| 'height' \| 'width'` | — | Inline `max-height`/`max-width` to fit available space. |
| `pinned` | `boolean` | — | Disables **all** automatic repositioning. |
| `coverTarget` | `boolean` | — | Position *over* the target instead of beside it. |
| `shiftToCoverTarget` | `boolean` | `false` | Cover the target **only when there isn't enough space**. |
| `matchTargetSize` | `'width'` | — | Match the target's width. Needs `box-sizing: border-box`. |
| `arrowPadding` | `number` | — | Keeps the arrow off rounded corners. |
| `strategy` | `'fixed' \| 'absolute'` | `absolute` | CSS `position` used. |
| `useTransform` | `boolean` | `true` | Position via CSS `transform`. |
| `onPositioningEnd` | `(e: OnPositioningEndEvent) => void` | — | Fires after each positioning pass (also `fui-positioningend`). |
| `disableUpdateOnResize` | `boolean` | — | Turns off the resize observer. |
| `unstable_disableTether` | `boolean \| 'all'` | — | Lets the surface stay fully in viewport when the reference leaves it. **`unstable_` prefix — API may change.** |
| `enabled` | `boolean` | `true` | `false` positions nothing. |

`Offset` in full: `OffsetShorthand = number`, `OffsetObject = { mainAxis: number; crossAxis?: number }` (note **`mainAxis` is required** in the object form), or `OffsetFunction` receiving `{ positionedRect, targetRect, position, alignment? }`:

```tsx
const offset: PositioningProps['offset'] = ({ positionedRect, targetRect, position, alignment }) =>
  ({ crossAxis: 10, mainAxis: positionedRect.width / 2 });
```

---

## Recipes worth copying

**Anchor to a different element** — reuse one popover instance across triggers:
```tsx
const [target, setTarget] = React.useState<HTMLElement | null>(null);
<Popover positioning={{ position: 'above', align: 'start', target }}>…</Popover>
<Button ref={setTarget}>Target</Button>
```

**Follow the mouse (virtual element)** — cheaper than re-rendering per mousemove:
```tsx
const positioningRef = React.useRef<PositioningImperativeRef>(null);

const onMouseMove = React.useCallback((e: React.MouseEvent) => {
  const { clientX: x, clientY: y } = e;
  const virtualElement: PositioningVirtualElement = {
    getBoundingClientRect: () => ({ width: 0, height: 0, top: y, right: x, bottom: y, left: x, x, y }),
  };
  positioningRef.current?.setTarget(virtualElement);
}, []);

<Tooltip positioning={{ positioningRef, offset: { crossAxis: 0, mainAxis: 15 } }} relationship="label" content="Follows the cursor" />
```
`setTarget` is documented as *"Useful for avoiding double renders with the target option."* For context menus there is also `usePositioningMouseTarget()` (marked `@internal`).

**Force a fallback direction** for a listbox that flips sideways:
```tsx
<Combobox positioning={{ fallbackPositions: ['below'] }} />
```

**Keep animations while disabling transform positioning:**
> "If you would like to retain transform styles while allowing transform animations, leave the popover surface the positioned one, and make its child node the actual styled element."
```tsx
<Popover positioning={{ useTransform: false }}>…</Popover>
```

**Boundary padding — stay on the design grid:**
> "*Design guidance recommen[d]s using **8px** or **4px** if a padding is required. Custom values are also possible but should stay within a 4px grid, please consult your designer if a custom padding is required.*"
```tsx
positioning={{ overflowBoundary: boundaryRef, overflowBoundaryPadding: { end: 8, top: 0, start: 0, bottom: 0 } }}
```

**Submenu diagonal travel** — `useSafeZoneArea()` (same package) draws an invisible triangle so the pointer can cut the corner toward a submenu without it closing: options `{ debug, disabled, timeout, onSafeZoneEnter, onSafeZoneMove, onSafeZoneLeave, onSafeZoneTimeout }`, returning `{ containerRef, targetRef, elementToRender }`. `debug: true` *"makes drawn shapes visible."*

---

## Checklist before shipping a floating surface

- [ ] Does it stay inside its **scroll container**, not just the viewport? Set `flipBoundary` **and** `overflowBoundary`.
- [ ] Long list? `autoSize: true` (or `'height'`) plus your own `overflow: auto`.
- [ ] Is `align` on the opposite axis from `position`? Otherwise it becomes `center`.
- [ ] Any `pinned: true` — is that deliberate?
- [ ] Custom `offset` on an arrowed surface — merged with `mergeArrowOffset`?
- [ ] `matchTargetSize` — is `box-sizing: border-box` set on the surface?
- [ ] RTL: `before`/`after` are logical and swap sides (`before: rtl ? 'right' : 'left'` in [`toFloatingUIPlacement.ts`](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-positioning/library/src/utils/toFloatingUIPlacement.ts)), and Floating UI flips `start`/`end` for you. `top`/`bottom` sit on the vertical axis and never flip.

## See also
| Topic | Where |
|---|---|
| Component-specific positioning defaults | `fluent_get_component` · [Popover](https://storybooks.fluentui.dev/react/?path=/docs/components-popover--docs) · [Menu](https://storybooks.fluentui.dev/react/?path=/docs/components-menu--docs) · [Tooltip](https://storybooks.fluentui.dev/react/?path=/docs/components-tooltip--docs) |
| Migrating v0 `Popup`/`align`/`position` | [from v0 / Positioning](https://storybooks.fluentui.dev/react/?path=/docs/concepts-migration-from-v0-positioning--docs) |
| Portals + SSR (positioned surfaces render in a portal) | `fluent-theming` → `references/ssr.md` |
