# Focus management and screen-reader announcements (React v9)

Fluent UI v9 has a **real focus API**. Do not hand-roll a focus trap, an arrow-key roving tabindex, or a focus-restore stack — every one of them already exists, is tested, and is exported from `@fluentui/react-components`.

Focus is powered by **[tabster](https://github.com/microsoft/tabster)** (attribute-driven focus behaviours) and **[keyborg](https://github.com/microsoft/keyborg)** (is the user navigating with the keyboard right now?). *"Fluent UI components use tabster for focus handling functionality, so that they can be easily integrated with application-level tabster functionality such as delooser and cross-iframe focusing."* — [Components Overview](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-overview--docs)

> Application-level focus handling is explicitly **out of scope** for the components: *"Focus handling (except of the points mentioned in Scope) on an application level needs to be handled by the application, preferably using tabster."* — same page. That is what these hooks are for.

Every hook here is exported from `@fluentui/react-components` (verified against `packages/react-components/react-components/src/index.ts`, v9.74.6).

---

## Pick the right hook

| Need | Hook | Source |
|---|---|---|
| Arrow keys move focus within a group (toolbar, grid, list) | `useArrowNavigationGroup` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usearrownavigationgroup--docs) |
| A focusable container that holds other focusables (card with buttons) | `useFocusableGroup` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usefocusablegroup--docs) |
| Imperatively find first/last/next/prev/all focusables | `useFocusFinders` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usefocusfinders--docs) |
| Focus trap + `aria-hidden` the rest of the page (custom modal) | `useModalAttributes` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usemodalattributes--docs) |
| Focus an element by name, possibly before it exists | `useObservedElement` + `useFocusObserved` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-useobservedelement--docs) |
| Restore focus after the focused element is removed | `useRestoreFocusSource` + `useRestoreFocusTarget` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-userestorefocussource--docs) |
| Hand a DOM region to a *different* focus framework (v8 `FocusZone`) | `useUncontrolledFocus` | [docs](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-useuncontrolledfocus--docs) |

All seven return **DOM attribute objects** — spread them, don't call them as refs:
```tsx
const attributes = useArrowNavigationGroup({ axis: 'horizontal' });
return <div {...attributes}>{items}</div>;
```

---

## `useArrowNavigationGroup` — roving arrow keys

> "This hook enables keyboard navigation using the arrow keys (up/down/left/right), among a collection of focusable elements… In addition to the arrow keys, Home and End keys will navigate to the first and last focusable element in the collection respectively."
> "**NOTE:** Elements with `tabindex="-1"` are considered unfocusable by tabster and will be skipped."
> — [useArrowNavigationGroup](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usearrownavigationgroup--docs) (built on the [tabster Mover API](https://tabster.io/docs/mover/))

```tsx
import { useArrowNavigationGroup } from '@fluentui/react-components';

function Formatting() {
  const attributes = useArrowNavigationGroup({ axis: 'horizontal', circular: true, memorizeCurrent: true });
  return <div {...attributes} role="toolbar">{/* buttons */}</div>;
}
```

`UseArrowNavigationGroupOptions`:

| Option | Type / default | Meaning |
|---|---|---|
| `axis` | `'vertical'` (default) \| `'horizontal'` \| `'grid'` \| `'grid-linear'` \| `'both'` | Which arrows move focus. `grid` = 2-D; `grid-linear` = 2-D that wraps row-to-row |
| `circular` | `boolean` | Wrap past the first/last element instead of stopping |
| `memorizeCurrent` | `boolean`, **default `true`** | Tabbing back into the group returns to the last focused item |
| `tabbable` | `boolean` | Tab also moves *within* the group, not just in and out |
| `ignoreDefaultKeydown` | `{ Tab?, Escape?, Enter?, ArrowUp?, … }` | Let your own handler own specific keys |

---

## `useFocusableGroup` — nested focusables

```tsx
const attributes = useFocusableGroup({ tabBehavior: 'limited-trap-focus' });
return <div {...attributes} tabIndex={0}>{/* card containing buttons */}</div>;
```
`tabBehavior`: `'unlimited'` · `'limited'` (Tab moves in, then out) · `'limited-trap-focus'` (Enter moves in, Escape moves out).

> "⚠️ Nested focusable elements are not standard, and are generally considered to be an anti-pattern. Please clarify with your accessibility champ to make sure that your feature warrants using nested focusable elements since there is no easy way to define how they should behave."
> — [useFocusableGroup](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usefocusablegroup--docs)

---

## `useFocusFinders` — imperative traversal

Returns five functions, all scoped to a container element:

```tsx
const { findAllFocusable, findFirstFocusable, findLastFocusable, findNextFocusable, findPrevFocusable } =
  useFocusFinders();

React.useEffect(() => {
  if (open) findFirstFocusable(dialogRef.current)?.focus();
}, [open, findFirstFocusable]);
```

| Function | Signature |
|---|---|
| `findAllFocusable` | `(container, acceptCondition?: (el) => boolean) => HTMLElement[]` |
| `findFirstFocusable` / `findLastFocusable` | `(container) => HTMLElement \| null \| undefined` |
| `findNextFocusable` / `findPrevFocusable` | `(currentElement, options?: { container })` — container defaults to `document.body` |

Source: [useFocusFinders](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usefocusfinders--docs)

---

## `useModalAttributes` — focus trap + `aria-hidden`

> "The hook creates accessible focus traps that set [aria-hidden]… The hook will also handle reverting focus back to the trigger once the modal dialog is unmounted from DOM."
> "⚠️ Do not use this hook without appropriate guidance from your accessibility champ. Focus trap is only one of many requirements to consider when creating a modal dialog. **Consider the `Dialog` and `Popover` components** if you need modal dialog like components."
> — [useModalAttributes](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usemodalattributes--docs)

**Reach for `Dialog` / `Drawer` / `Popover` first.** Use this hook only for a genuinely custom surface.

```tsx
const { triggerAttributes, modalAttributes } = useModalAttributes({ trapFocus: true, legacyTrapFocus: true });
const { findFirstFocusable } = useFocusFinders();

<Button ref={triggerRef} {...triggerAttributes} onClick={() => setOpen(true)}>Open</Button>
{open && (
  <div {...modalAttributes} ref={dialogRef} role="dialog" aria-modal="true" aria-label="Example dialog">…</div>
)}
```

`UseModalAttributesOptions`:

| Option | Effect |
|---|---|
| `trapFocus` | Turns on the modalizer: everything outside becomes inaccessible |
| `legacyTrapFocus` | *"enables traditional force-focus behavior to match previous versions of Fluent. Without this, users can tab out of the focus trap and into the browser chrome. This matches the behavior of the native `<dialog>` element and inert. **We recommend setting this to true** based on user feedback and consistency."* |
| `alwaysFocusable` | Element stays reachable in Tab order even when another modalizer is active |
| `id` | Modalizer id (generated if omitted) |

Without `legacyTrapFocus` you get the **inert** trap: *"users can tab out of the current document. However no other element in the document apart from the contents of the modal can be focused… this means that insert focus traps inside iframes will leak focus to a parent document."* — `InertFocusTrap` story on the same page.

The hook does **not** move focus in — do that yourself with `findFirstFocusable`, and handle `Escape`.

---

## `useObservedElement` + `useFocusObserved` — focus by name, possibly async

> "Observed elements are a way to assign a name to an element that is not a HTML id which can be used for focusing… Observed elements can also be used to focus asynchronously. **Any focus attempts will be retried until a configurable timeout is reached.** This can be useful for loading or virtualization scenarios where the element to be focused might not yet exist in DOM."
> — [useObservedElement](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-useobservedelement--docs) (tabster [observed](https://tabster.io/docs/observed/))

```tsx
const attributes = useObservedElement('settings-panel');             // or ['a', 'b'] — multiple names
const focus = useFocusObserved('settings-panel', { timeout: 1000 }); // default timeout 1000ms

<Button onClick={() => focus()}>Go to settings</Button>
<div {...attributes} tabIndex={-1}>…</div>
```
`useFocusObserved` returns a function returning `{ result: Promise<boolean>, cancel() }`, so you can await or abort the attempt.

---

## `useRestoreFocusSource` / `useRestoreFocusTarget` — don't lose focus to `<body>`

> "When the attribute returned by `useRestoreFocusSource` is applied to an element, it will be ready to restore focus to the last 'bookmarked' element that was set using `useRestoreFocusTarget`. The restore focus target **needs to be focused** before focus is lost from a source."
> — [useRestoreFocusSource](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-userestorefocussource--docs)

The canonical case: an inline feedback/undo control that removes itself, dropping focus onto `<body>`.

```tsx
const restoreFocusSourceAttribute = useRestoreFocusSource();  // the region that will disappear
const restoreFocusTargetAttribute = useRestoreFocusTarget();  // where focus should land

<Button {...restoreFocusTargetAttribute}>Send message</Button>
{!sent && (
  <div {...restoreFocusSourceAttribute}>
    <Button appearance="subtle" icon={<ThumbLikeRegular />} aria-label="Like" onClick={() => setSent(true)} />
  </div>
)}
```
Mnemonic: **target = bookmark, source = the thing that may vanish.** The restore only fires if the target was focused at some point, deliberately — *"to prevent focus randomly jumping across an application."*

---

## `useUncontrolledFocus` — hand a region to another framework

> "Tabster is intended to be used as the only focus management framework in an application… the `useUncontrolledFocus` hook can be used to explicitly remove explicit focus controlling for a region of DOM. This is particularly useful to support legacy v8 focus management components such as `FocusZone` and `FocusTrapZone`."
> — [useUncontrolledFocus](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-useuncontrolledfocus--docs)

```tsx
const attr = useUncontrolledFocus();
return <div {...attr}><LegacyV8FocusZone /></div>;
```
Essential during a v8 → v9 side-by-side migration; see the `fluent-v8` skill.

---

## Focus indicators

> "⚠️ A bad focus indicator can have serious accessibility consequences and can render your experience unusable by certain user. Please ensure before creating a custom focus indicator that you have gotten the necessary feedback from designers and accessibility experts."
> — [Focus indicator](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-focus-indicator--docs)

Three utilities, all exported from `@fluentui/react-components`.

### `useKeyboardNavAttribute` — keyboard-only styling hook

> "Instantiates keyborg and adds `data-keyboard-nav` attribute to a referenced element to ensure keyboard navigation awareness synced to keyborg logic without having to cause a re-render on react tree."

```tsx
function Root({ children }) {
  const ref = useKeyboardNavAttribute<HTMLDivElement>();
  return <div ref={ref}>{children}</div>;
}
```
```html
<div data-keyboard-nav="">…</div>  <!-- present only while navigating with the keyboard -->
<div>…</div>                       <!-- mouse navigation: attribute removed -->
```
It returns a **ref**, not attributes — the one hook on this page that does. The attribute is set and removed imperatively, so it never re-renders your tree.

### `createFocusOutlineStyle` — the default Fluent outline

Use this unless you have a specific reason not to. It draws the outline as an `::after` pseudo-element, so **the element needs `position: relative`**, and it already ships a `@media (forced-colors: active)` branch that repaints the outline to the system `Highlight` colour.

```tsx
import { makeStyles, createFocusOutlineStyle } from '@fluentui/react-components';

const useStyles = makeStyles({
  focusIndicator: createFocusOutlineStyle({
    selector: 'focus-within',           // 'focus' (default) | 'focus-within'
    style: { outlineOffset: { top: '6px', bottom: '6px', left: '4px', right: '4px' } },
  }),
});
```
`style` accepts `outlineColor` (default `tokens.colorStrokeFocus2`), `outlineRadius` (default `tokens.borderRadiusMedium`), `outlineWidth` (default `2px`) and `outlineOffset` (a string, or a per-side `{ top, bottom, left, right }`). It also sets `:focus` / `:focus-visible { outline-style: none }` for you unless you pass `enableOutline: true`.

### `createCustomFocusIndicatorStyle` — anything else

```tsx
const useStyles = makeStyles({
  focusIndicator: createCustomFocusIndicatorStyle({
    textDecorationColor: tokens.colorStrokeFocus2,
    textDecorationLine: 'underline',
    textDecorationStyle: 'double',
    outlineStyle: 'none',              // ❗ you must remove the default outline yourself
  }),
  root: {
    ':focus-visible': { outlineStyle: 'none' },
  },
});
```
> "If you're using `createCustomFocusIndicatorStyle` instead of `createFocusOutlineStyle` keep in mind that the default outline style is not going to be removed (as it is in `createFocusOutlineStyle`), and is your responsibility to manually remove it from your styles."
> — `createCustomFocusIndicatorStyle` source, [`@fluentui/react-tabster`](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-tabster/src/focus/createCustomFocusIndicatorStyle.ts)

Both helpers key off tabster's focus-visible attribute rather than raw `:focus`, which is why the indicator appears for keyboard users and not for mouse clicks. Keep contrast ≥ 3:1 and a ≥ 2px perimeter (WCAG 2.2 [2.4.13 Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)).

---

## Announcing to screen readers

Live-region output is a separate API from focus. Three pieces, all from `@fluentui/react-components`.

### `AriaLiveAnnouncer` — mount once, near the root

> "`AriaLiveAnnouncer` provides a sample implementation of an `aria-live` region that can be used to announce messages to screen readers. It injects announcements into the DOM, and also exposes a function (to its children in a React tree) that can be used to announce messages. It's designed to be used with `useAnnounce()` or `useTypingAnnounce()` hooks."
> — [AriaLiveAnnouncer](https://storybooks.fluentui.dev/react/?path=/docs/utilities-aria-live-arialiveannouncer--docs)

### `useAnnounce` — announce a message

```tsx
import { AriaLiveAnnouncer, useAnnounce, Button } from '@fluentui/react-components';

function SaveButton() {
  const { announce } = useAnnounce();
  return <Button onClick={() => announce('Draft saved', { polite: true })}>Save</Button>;
}

// <AriaLiveAnnouncer><App /></AriaLiveAnnouncer>
```
`announce(message, options)` — `options.batchId` (a later message with the same id **replaces** the earlier one), `options.polite` (interruptible; announced when the user is idle), `options.priority` (higher goes first).

> "This hook requires an aria-live announcer implementation that is configured through the `<AnnounceProvider />` (for custom live region implementations), or `<AriaLiveAnnouncer>` (for the out-of-the-box Fluent live region implementation). **Define this context near the top level of your application.**"
> — [useAnnounce](https://storybooks.fluentui.dev/react/?path=/docs/utilities-aria-live-useannounce--docs)

### `useTypingAnnounce` — announce while the user types

> "`typingAnnounce()` will wait until the user stops typing for at least 0.5s before firing the live region… It is fine to call `typingAnnounce` multiple times in quick succession… so long as all messages have the same `batchId`; only the last message will be announced."
> — [useTypingAnnounce](https://storybooks.fluentui.dev/react/?path=/docs/utilities-aria-live-usetypingannounce--docs)

```tsx
const announceId = useId('charLimit');
const { typingAnnounce, inputRef } = useTypingAnnounce<HTMLInputElement>();

<Input ref={inputRef} onChange={(_, d) => {
  if (d.value.length > 20) typingAnnounce('You have reached the maximum character limit', { batchId: announceId });
}} />
```
Without the debounce, the announcement collides with the screen reader's own keystroke echo. Debugging live regions: [Debugging notifications](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-debugging-notifications--docs). When to announce at all: [Notification best practices](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-notification-best-practices--docs).

---

## Review checklist

- [ ] No hand-rolled focus trap, roving tabindex, or focus-restore stack — a hook above covers it
- [ ] Custom modal uses `useModalAttributes` (`legacyTrapFocus: true` recommended) + `findFirstFocusable` on open + `Escape` to close — or, better, the `Dialog` component
- [ ] Anything that removes the focused node pairs `useRestoreFocusTarget` (bookmark) with `useRestoreFocusSource` (the disappearing region)
- [ ] Composite widgets use `useArrowNavigationGroup`, not per-key `onKeyDown`
- [ ] Custom focus styles come from `createFocusOutlineStyle` / `createCustomFocusIndicatorStyle`, never a bare `:focus { outline: none }`
- [ ] `createFocusOutlineStyle` targets carry `position: relative`
- [ ] Custom indicators reviewed by an accessibility champ; contrast ≥ 3:1
- [ ] Status changes announced via `AriaLiveAnnouncer` + `useAnnounce` / `useTypingAnnounce`, with a single `AriaLiveAnnouncer` at the root
- [ ] Foreign focus frameworks (v8 `FocusZone` / `FocusTrapZone`) fenced off with `useUncontrolledFocus`
