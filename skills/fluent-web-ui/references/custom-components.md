# Beyond `className` — custom style hooks and custom controls

Two escape hatches sit above slots and `className`. Both are `_unstable`, both are production-supported, and both have a trap that fails silently.

| You want to | Use | Page |
|---|---|---|
| Restyle Fluent components **app-wide** without forking them | `CustomStyleHooksProvider_unstable` | [Advanced styling techniques](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-advanced-styling-techniques--docs) |
| Own the **markup and styling architecture** but keep Fluent's behaviour + ARIA | `use{Component}Base_unstable` | [Building custom controls](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-building-custom-controls--docs) |

> Reach for tokens and theming first. *"Teams should look to tokens and variables first when considering how to change the look and feel of an app. Sometimes more powerful tools are required to accomplish a goal or handle edge cases."*

Both pages publish their code only in the MDX source; the rendered/`llms` text drops fenced blocks. Snippets below come from [`AdvancedStylingTechniques.mdx`](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/AdvancedStylingTechniques.mdx) and [`BuildingCustomControls.mdx`](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/BuildingCustomControls.mdx).

---

# Part 1 — Custom style hooks

## Where the hook plugs in

Every v9 component already calls a lookup into your provider. This *is* `Button`:

```tsx
export const Button: ForwardRefComponent<ButtonProps> = React.forwardRef((props, ref) => {
  const state = useButton_unstable(props, ref);

  useButtonStyles_unstable(state);                          // packaged default styles
  useCustomStyleHook_unstable('useButtonStyles_unstable')(state);  // yours, if a provider exists

  return renderButton_unstable(state);
}) as ForwardRefComponent<ButtonProps>;
```
> "`useCustomStyleHook_unstable` reaches into a `CustomStyleHooksProvider` (if it exists) and calculates any styles that match the component type."

Rationale: [RFC microsoft/fluentui#25333](https://github.com/microsoft/fluentui/pull/25333).

## ⚠️ Trap 1 — forget `getSlotClassNameProp_unstable` and you break every consumer's `className`

> "⚠️ Custom style hooks **must also append the slot's original className prop as returned by `getSlotClassNameProp_unstable`, after the custom styles**. This ensures that the className prop added by the user will take precedence over custom styles." — [microsoft/fluentui#34166](https://github.com/microsoft/fluentui/pull/34166)

Your hook runs *after* the component's own styles, so without this line your app-wide theme quietly outranks every per-instance `className` in the codebase.

```ts
import { getSlotClassNameProp_unstable, makeStyles, mergeClasses, type ButtonState } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: { border: '2px solid green', backgroundColor: 'pink', borderRadius: '64px' },
  icon: { color: 'blue', backgroundColor: 'white' },
});

export const useFancyButtonStyles = (state: unknown) => {
  const buttonState = state as ButtonState;
  const styles = useStyles();

  buttonState.root.className = mergeClasses(
    buttonState.root.className,
    styles.root,
    getSlotClassNameProp_unstable(buttonState.root),  // ← consumer className last, so it wins
  );

  if (buttonState.icon) {
    buttonState.icon.className = mergeClasses(
      buttonState.icon.className,
      styles.icon,
      getSlotClassNameProp_unstable(buttonState.icon),
    );
  }
};
```
> The upstream sample hardcodes `'green'`/`'pink'` to make the demo obvious. In real code use `tokens.*` — see `references/griffel.md`, Rule 4.

## Wiring it up

```ts
// FancyAppCustomStyleHooksValue.ts
import { type CustomStyleHooksContextValue } from '@fluentui/react-components';
import { useFancyButtonStyles } from './useFancyButtonStyles';

export const FANCY_CUSTOM_STYLE_HOOKS: CustomStyleHooksContextValue = {
  useButtonStyles_unstable: useFancyButtonStyles,
  // ... more component styles as needed for your theme.
};
```
```tsx
// App.tsx
import { Button, FluentProvider, webLightTheme, CustomStyleHooksProvider_unstable } from '@fluentui/react-components';
import { FANCY_CUSTOM_STYLE_HOOKS } from './FancyAppCustomStyleHooksValue';

export function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <Button>I am a Vanilla Fluent Button</Button>
      <CustomStyleHooksProvider_unstable value={FANCY_CUSTOM_STYLE_HOOKS}>
        <Button icon={<AlertRegular />}>I am a *Fancy* Button</Button>
      </CustomStyleHooksProvider_unstable>
    </FluentProvider>
  );
}
```
The key is the hook **name**, not the component — `useButtonStyles_unstable`, `useImageStyles_unstable`, and so on.

## ⚠️ Trap 2 — nested providers do **not** merge

> "One caveat is that `CustomStyleHooksProvider` **does not automatically merge contexts' values**."

```tsx
<CustomStyleHooksProvider_unstable value={{ useButtonStyles_unstable: useSmartButtonStyles, useImageStyles_unstable: useSmartImageStyles }}>
  <CustomStyleHooksProvider_unstable value={{ useButtonStyles_unstable: useFancyButtonStyles }}>
    {/* ⚠️ The nested "CustomStyleHooksProvider_unstable" provider completely overwrites the Smart values. */}
    {/*    I.e. only "useFancyButtonStyles" will be passed down.                                          */}
    {/*    The app will only look Fancy, but not Smart. It needs both.                                    */}
  </CustomStyleHooksProvider_unstable>
</CustomStyleHooksProvider_unstable>
```
Not "Image loses its override" in a way you'd notice in a test — the inner subtree just renders default Images. **Merge manually**, and remember the composition order is the precedence order:

```tsx
export const useSmancyCustomButtonStyles = (state: unknown) => {
  const buttonState = state as ButtonState;
  useFancyButtonStyles(buttonState);   // "Fancy" comes first
  useSmartButtonStyles(buttonState);   // "Smart" comes second, so it wins where there are conflicts
};

export const SMANCY_CUSTOM_STYLE_HOOKS: CustomStyleHooksContextValue = {
  useButtonStyles_unstable: useSmancyCustomButtonStyles,
  // ... more component style overrides
};
```
Then use a **single** provider at the top of the app.

> The upstream MDX's final "simplified App" snippet has a copy/paste defect — an unbalanced `</CustomStyleHooksProvider_unstable>` and a reference to `useAppCustomButtonStyles` that the surrounding sample never defines. One provider, one merged value, as above, is the intent.

---

# Part 2 — Custom controls on base state hooks

> "A custom control is a component you own entirely — its markup, its styles, its design tokens — that still needs to behave like its Fluent counterpart: correct ARIA roles, keyboard navigation, focus management, and slot structure. Building one from scratch means reimplementing behavior that Fluent UI has already solved."

## Pick the right layer — three of them

| Layer | API | Use when |
|---|---|---|
| 3. **Styled component** | `Button`, `Input` | Default for v9 apps. Built-in accessibility, design tokens, standard visuals, optional style overrides. |
| 2. **Composition hook** | `useButton_unstable`, `useInput_unstable` | *"the right choice for Fluent DS extensions"* — you own rendering but want Fluent's visual language as a starting point. |
| 1. **Base state hook** | `useButtonBase_unstable`, `useInputBase_unstable` | Full control of rendering **and** styling architecture; a custom design system with different visual patterns; Fluent behaviour/a11y primitives with *no* styling opinions. |

> "Base state hooks are **not a replacement for composition hooks in most cases**. If you are customizing a Fluent component's appearance or adding design variants, composition hooks are the right starting point."

Layer definitions, verbatim in substance:
1. `use{Component}Base_unstable` — behavior, state, and semantic structure. No styling.
2. `use{Component}_unstable` — applies design-level concerns (appearance, size) on top of base state.
3. `{Component}` — the default styled experience.

## What you get, and what you must supply

| Base state hooks **include** | Base state hooks **exclude** |
|---|---|
| Component behavior and state logic | Design props (`appearance`, `size`, `shape`) |
| ARIA attributes and keyboard interaction patterns | Style logic (Griffel styles, token styling) |
| Semantic slot structure (which slots exist, their expected element types) | Motion and transitions |
| | Default slot content |

## ⚠️ The rule that fails silently: pass the ref to the base hook

> "Preserve base root props and ref wiring — **always pass the ref to `use{Component}Base_unstable`, never attach it yourself**."

Attaching the ref to your own root element compiles and looks fine, but the base hook loses the node it needs for focus management and measurement.

## The full pattern

```tsx
import * as React from 'react';
import { assertSlots, mergeClasses, slot, type Slot } from '@fluentui/react-components';
import { useButtonBase_unstable } from '@fluentui/react-button';
import type { ButtonBaseProps, ButtonBaseState } from '@fluentui/react-button';

// --- Types ---
type LoadingButtonSlots = {
  root: NonNullable<ButtonBaseState['root']>;
  icon?: ButtonBaseState['icon'];
  loadingIndicator?: Slot<'span'>;
};

type LoadingButtonProps = ButtonBaseProps & { isLoading?: boolean; loadingIndicator?: Slot<'span'> };

type LoadingButtonState = ButtonBaseState & {
  isLoading: boolean;
  loadingIndicator?: ReturnType<typeof slot.optional>;
  components: LoadingButtonSlots;
};

// --- State hook: delegate ARIA, keyboard and semantics to the base hook ---
const useLoadingButtonState = (
  props: LoadingButtonProps,
  ref: React.Ref<HTMLButtonElement | HTMLAnchorElement>,
): LoadingButtonState => {
  const { isLoading = false, loadingIndicator, ...baseProps } = props;
  const baseState = useButtonBase_unstable(baseProps, ref);   // ← ref goes HERE

  return {
    ...baseState,
    isLoading,
    // slot.optional resolves the slot prop: uses the caller's value if provided,
    // otherwise renders the defaultProps content. Returns undefined if renderByDefault is false.
    loadingIndicator: slot.optional(loadingIndicator, {
      renderByDefault: true,
      defaultProps: { children: 'Loading...', 'aria-live': 'polite' },
      elementType: 'span',
    }),
    components: { ...baseState.components, loadingIndicator: 'span' },
  };
};

// --- Styles hook: consumer class names LAST ---
const useLoadingButtonStyles = (state: LoadingButtonState): void => {
  state.root.className = mergeClasses(
    'loadingButton',
    state.isLoading && 'loadingButton--busy',
    state.root.className,   // consumer class names win
  );
  if (state.loadingIndicator) {
    state.loadingIndicator.className = mergeClasses('loadingButton__indicator', state.loadingIndicator.className);
  }
};

// --- Render: assertSlots gives type-safe <state.slot /> elements ---
const renderLoadingButton = (state: LoadingButtonState) => {
  assertSlots<LoadingButtonSlots>(state);
  return (
    <state.root>
      {state.isLoading ? (
        state.loadingIndicator && <state.loadingIndicator />
      ) : (
        <>
          {state.icon && <state.icon />}
          {state.root.children}
        </>
      )}
    </state.root>
  );
};

// --- Component ---
export const LoadingButton = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, LoadingButtonProps>((props, ref) => {
  const state = useLoadingButtonState(props, ref);
  useLoadingButtonStyles(state);
  return renderLoadingButton(state);
});
```
`assertSlots` and `slot.*` need the `@fluentui/react-jsx-runtime` JSX pragma — see `references/slots.md` → *Rendering*.

## Authoring checklist (upstream's, condensed)

- [ ] Ref passed to `use{Component}Base_unstable` — never attached by hand.
- [ ] Existing slot class names are the **last** `mergeClasses` argument, so user `className` keeps precedence.
- [ ] Keyboard behavior, ARIA semantics and focus handling re-verified after any rendering change.
- [ ] All visual states validated: `:hover`, `:active`, `:focus-visible`, disabled.
- [ ] Screen-reader tested after custom rendering changes.
- [ ] State / styles / render kept in **separate** functions (`useCustomButtonState`, `useCustomButtonStyles`, `renderCustomButton`).

## Accessibility is now partly yours

> "Base state hooks provide ARIA attributes and interaction patterns, but they **do not enforce visual accessibility**."

You must supply: visible focus indicators on all interactive elements · sufficient colour contrast · distinct hover, pressed and disabled visual states. See the `fluent-accessibility` skill (`references/focus-management.md` covers `createFocusOutlineStyle` / `createCustomFocusIndicatorStyle`).

## See also
| Topic | Where |
|---|---|
| RFC behind base state hooks | <https://github.com/microsoft/fluentui/blob/master/docs/react-v9/contributing/rfcs/react-components/convergence/base-state-hooks.md> |
| Standard style overrides | `references/griffel.md` · [Styling components](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-styling-components--docs) |
| Part-level composition inside an existing component | `references/slots.md` |
| What `_unstable` does and does not mean | `references/package-maturity.md` |
