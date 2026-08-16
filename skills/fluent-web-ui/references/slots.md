# Slots — the supported way to reach inside a Fluent component

A **slot** is a named part of a component that is designed to be modified or replaced, exposed as a top-level prop of the same name. Slots replaced v8's render callbacks.

Source: [Customizing components with slots](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-customizing-components-with-slots--docs) unless noted. The published page strips its code blocks; the snippets here are from the MDX source, [`apps/public-docsite-v9/src/Concepts/Slots/Slots.mdx`](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Slots/Slots.mdx).

> "Each slot is exposed as a top-level prop of the same name. Some slots have default content and others are empty by default. Slots may target different types of elements or components to restrict the type of content. You can fill a slot with a primitive value, JSX/TSX, props objects, or a render function."

---

## Decide *before* you reach for a slot

**Use a slot to:** set the content of a part · style a part (via its `className`) · pass props to a part · subscribe to a part's event handlers · change a part's element type (via `as`) · completely replace a part's content.

**Do NOT use a slot when** — upstream is explicit, and each of these has a better tool:

| Situation | Use instead |
|---|---|
| Change **every instance** of a component | **Theme it.** *"prefer to customize the theme … if you want to have borders to be a specific color on `:hover`, you can create a theme that overrides `colorNeutralStroke1Hover`."* |
| Slightly adjust **one instance** | **`makeStyles` + `className`.** *"create a class style using `makeStyles` and then apply it to the component using `className`."* |
| Change **behavior**, make significant layout changes, replace non-slot parts, or wrap with different props | **The hooks API.** *"The hooks API gives you complete control to recompose a component but is more complex than using slots."* → `references/custom-components.md` |

Some slots are **conditional** — passing content is not enough to make them render. `Avatar`'s `label` slot *"only renders when there is no image provided"*, and its `icon` slot *"only renders when neither an image nor a name are provided."* Setting `icon` on an `Avatar` that has a `name` produces nothing, silently.

**Slots are not `children`.** *"The primary content within a component is defined by adding children"* — children carry hierarchies and heterogeneous content (`Accordion` → `AccordionItem` → `AccordionHeader`/`AccordionPanel`). Slots carry parts.

---

## The four ways to fill a slot

### 1. Shorthand value (primitive or JSX)
```tsx
<Input contentBefore="$" value="10" contentAfter=".00" />
<Button icon={<CalendarRegular24 />} />
```
> "Any shorthand value provided to a slot is **converted to that slot's children content**."

So the slot's own wrapper element stays:
```html
<button class="fui-Button">
  <span class="fui-Button__icon">        <!-- the slot element is still here -->
    <img src="site-icon.png" alt="branded site icon" />
  </span>
</button>
```

### 2. Props object — the everyday case
A slot accepts the props of whatever it renders: native element props for an intrinsic slot, component props for a component slot.
```tsx
// Avatar's `badge` slot renders a PresenceBadge, so it takes PresenceBadge props
<Avatar name="Support" badge={{ status: 'available', 'aria-label': 'available' }} />

// className on a slot is the supported styling hook
const useStyles = makeStyles({ badge: { color: tokens.colorBrandStroke1 } });
<Avatar name="IT probably" badge={{ status: 'busy', className: useStyles().badge }} />
```

### 3. `as` — change the element type
```tsx
// AccordionHeader is a div by default; its inner `button` slot is a button by default
<AccordionHeader as="h1" button={{ as: 'a' }}>Accordion Header as h1</AccordionHeader>
```
```html
<h1 class="fui-AccordionHeader"><a class="fui-AccordionHeader__button">Accordion Header as h1</a></h1>
```
> "you must choose from **one of the available element types the slot supports**" — the union in `Slot<Type, AlternateAs>`, nothing else.

### 4. Render function — the escape hatch, last resort
Pass a function as the slot's `children` to replace the slot's **containing element too**:
```tsx
const renderBigLetterIcon = (Component, props) => <b>B</b>;

<Button icon={{ children: renderBigLetterIcon }}>Bold</Button>;
```
> "This is an **escape hatch** in the slots API, so prefer the other techniques whenever possible. If you replace the entire slot, **verify accessibility, layout, and styling still work properly**."

That warning is the whole point: the `span.fui-Button__icon` — and every class Fluent put on it — disappears. Also note the render function signature drops `children` and `as`:
```ts
type SlotRenderFunction<Props> = (Component: React.ElementType<Props>, props: Omit<Props, 'children' | 'as'>) => React.ReactNode;
```
Under React 18+ `strict` you may need to assert it — see `references/package-maturity.md` → *React version floors* for the `satisfies SlotRenderFunction<…>` pattern.

---

## For component authors

### `Slot<Type, AlternateAs>`

| Declaration | Renders |
|---|---|
| `Slot<'div'>` | A `div` is always rendered |
| `Slot<typeof Button>` | A `Button` component accepting `Button` props |
| `Slot<'span', 'div' \| 'pre'>` | A `span` by default; the caller may pick `div` or `pre` via `as` |

> "Currently, `AlternateAs` **only supports intrinsic element types**. This is necessary to ensure components restrict slots where `Type` is a component type. Substituting other component types has caused deep typing, accessibility, and event handler problems in the past."

Types live in `@fluentui/react-utilities` → `compose/types.ts`:
```ts
type WithSlotShorthandValue<Props extends { children?: unknown }> =
  | Props
  | Extract<SlotShorthandValue, Props['children']>;

type WithSlotRenderFunction<Props extends { children?: unknown }> = Props & {
  children?: Props['children'] | SlotRenderFunction<Props>;
};
```

### Optional vs NonNullable — two independent axes
```ts
type SpinnerSlots = {
  root: NonNullable<Slot<'div'>>;
  spinner?: Slot<'span'>;
  label?: Slot<typeof Label>;
};

indicator: NonNullable<Slot<'div'>>;   // RadioButton: the indicator must always render
```
- Trailing `?` = the **prop** is optional.
- `NonNullable<T>` = the caller **may not pass `null`** to opt the slot out.
> "Non-nullable and optional/required slots are independent from one another."

### The `root` slot, and *primary* slots
> "Every component has a `root` slot… Properties passed to the component are generally applied to the root slot… The `className` and `style` props are **always** passed to the root slot."

But when a component wraps an intrinsic element, the interesting props go to that inner **primary** slot instead:
```ts
export type InputSlots = {
  root: NonNullable<Slot<'span'>>;   // className/style land here
  input: NonNullable<Slot<'input'>>; // value/placeholder land here — the primary slot
  contentBefore?: Slot<'span'>;
  contentAfter?: Slot<'span'>;
};
```
This is why `<Input className={x} />` styles the wrapping `span`, not the `<input>`. To style the actual field, use `input={{ className: x }}`.

### The 3-hook rendering architecture
> "The Fluent UI hooks architecture breaks up component rendering primarily into 3 parts: `use{Component}()` takes in props and produces state · `use{Component}Styles()` uses state to define and apply class styles · `render{Component}()` renders the elements."

```ts
const useButton_unstable = (props: ButtonProps, ref: React.Ref<HTMLButtonElement | HTMLAnchorElement>): ButtonState => ({
  root: slot.always({ ...props, ref }, { elementType: 'button' }),
  icon: slot.optional(props.icon, { elementType: 'span' }),
});

const useButtonStyles_unstable = (state: ButtonState) => { /* mutates state, adding classNames */ };
```
- **`slot.always`** — *"creates a slot that will always render, and as such the user may not provide `null` to opt-out of this slot (NonNullable slot)."*
- **`slot.optional`** — *"creates a slot that can be opted out of and is not rendered by default, it only renders if `props.icon` is different from `undefined`."*

Both *"ensure the local logic provided by the state hook will remain on the slots internals"* — which is why you must not rebuild a slot object by hand.

### Rendering: `assertSlots` + the JSX pragma
```tsx
/** @jsxRuntime automatic */
/** @jsxImportSource @fluentui/react-jsx-runtime */

import { assertSlots } from '@fluentui/react-utilities';

const renderButton_unstable = (state: ButtonState) => {
  const { iconOnly, iconPosition } = state;
  assertSlots<ButtonSlots>(state);
  return (
    <state.root>
      {iconPosition !== 'after' && state.icon && <state.icon />}
      {!iconOnly && state.root.children}
      {iconPosition === 'after' && state.icon && <state.icon />}
    </state.root>
  );
};
```
> `assertSlots` *"ensures the state has the expected slots… you can simply use `<state.slot />` and all properties provided to a `slot` creation will be already baked into it."*

**The pragma is not optional.** The `createElement` custom JSX pragma *"ensures that all race conditions between logic provided in the state hook and the render method are properly handled, and is **required for `slot.always`, `slot.optional` and `assertSlots` to work properly**."* Omit the two pragma comments and the component still compiles — it just misbehaves.

### `_unstable` — read the framing, don't over-warn
> "If you see the suffix `_unstable` that means that the API **may have a breaking change in the future**. It does **not** mean the code is unstable or unfit for production."

---

## Related: the media object recipe

Not a slots feature, but the canonical "media + text" composition when `Persona` doesn't fit ([Media Object recipe](https://storybooks.fluentui.dev/react/?path=/docs/concepts-recipes-media-object--docs)). Ingredients: `@fluentui/react-icons`, `@fluentui/react-image`, `@fluentui/react-text`.

- **Two layouts, and grid wins for lists.** Flex = a parent `display:flex; flex-direction:row` plus a `column` text child; grid = one parent with `display:grid; grid-auto-flow:column`. *"the grid layout has one less layer of DOM compared to the flex layout. This is especially important when the component is going to be used repeatedly in a list."*
- With `grid-auto-flow: column`, the media must span the text's rows — `grid-row-start: span 4` for four lines. To avoid hardcoding that, use `grid-template-columns: max-content [middle] auto` and end the media / start the text at the `middle` line.
- Best practices, verbatim in substance: *"The higher up the text line, the more important it is. You should not apply higher weights to the lines underneath."* and *"When using `grid-template-columns` make sure the DOM makes sense and does not differ from how the grid is placing them. Do not have your DOM be `<media> <text>` when the rendered result looks like `<text> <media>`."* — a reversed visual order is a screen-reader order bug.
- If the media is an `Avatar` or `PresenceBadge`, use [`Persona`](https://storybooks.fluentui.dev/react/?path=/docs/components-persona--docs) instead of hand-rolling this.

## See also
| Topic | Where |
|---|---|
| Which slots a component has | MCP `fluent_get_component` |
| `className` precedence, `mergeClasses` | `references/griffel.md` |
| Owning render entirely (base state hooks) | `references/custom-components.md` |
| App-wide restyling without forking components | `references/custom-components.md` → *Custom style hooks* |
