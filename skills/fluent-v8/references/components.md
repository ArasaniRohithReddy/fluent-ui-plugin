# Building with v8 components

**~118 authorable components** across **71 families**. Composition is the exception, not the rule: most v8 components are **data-driven** (`items`, `options`, `groups`, `columns`) with `onRender*` escape hatches — the opposite of v9.

Look a component up with `fluent_v8_lookup name="DetailsList"` for its exact import, v9 equivalent (or v8-only status), collisions and traps. The families below are for orientation.

| Area | Components |
|---|---|
| Buttons | `DefaultButton`, `PrimaryButton`, `ActionButton`, `IconButton`, `CommandBarButton`, `CompoundButton` (+ `split` / `menuProps` / `splitButtonMenuProps`) |
| Inputs | `TextField`, `MaskedTextField`, `Dropdown`, `ComboBox`, `VirtualizedComboBox`, `Checkbox`, `ChoiceGroup`, `Toggle`, `Slider`, `SpinButton`, `SearchBox`, `Rating`, `ColorPicker`, `SwatchColorPicker`, `Calendar`, `DatePicker`, `Label`, `Link` |
| Pickers | `NormalPeoplePicker`, `CompactPeoplePicker`, `ListPeoplePicker`, `TagPicker`, `ExtendedPeoplePicker`, `FloatingPeoplePicker`, `SelectedPeopleList` |
| Data | `DetailsList` (+ `DetailsRow`/`DetailsHeader`/`DetailsColumn`), `ShimmeredDetailsList`, `GroupedList`, `List`, `Selection`/`SelectionZone`, `MarqueeSelection`, `DragDropHelper` |
| Navigation | `Nav`, `Breadcrumb`, `CommandBar`, `Pivot`/`PivotItem`, `ContextualMenu`, `OverflowSet`, `Keytips` |
| Surfaces | `Panel`, `Dialog`, `Modal`, `Callout`/`FocusTrapCallout`, `TooltipHost`, `Popup`, `ScrollablePane`+`Sticky`, `HoverCard`, `TeachingBubble`, `Coachmark` |
| Content | `Persona`, `Facepile`, `DocumentCard`, `ActivityItem`, `MessageBar`, `Text`, `Image`, `Icon`, `Separator`, `VerticalDivider` |
| Progress | `Spinner`, `ProgressIndicator`, `Shimmer` |
| Utility | `Stack`/`StackItem`, `FocusZone`, `FocusTrapZone`, `Layer`/`LayerHost`, `Overlay`, `Announced`, `ResizeGroup`, `ResponsiveMode`, `withViewport`, `ThemeProvider` |

Two things v8 does **not** export, despite persistent belief: there is no `RadioButton` (use `ChoiceGroup` + `ChoiceGroupOption`) and no `Portal` (use `Layer` + `LayerHost`).

Before wiring a component up, check `collisions-and-traps.md` — `Dialog`'s inverted `hidden`, `Slider`'s reversed callbacks and the v8/v9 name collisions all compile cleanly.

## Layout — `Stack`

`Stack` is a `@fluentui/foundation-legacy` component, so it behaves unlike everything else: its `styles` signature is `(props, theme, tokens) => IStackStyles`, **not** `IStyleFunctionOrObject`, and gaps are implemented as **margins** on `> *:not(:first-child)`, not CSS `gap`.

```tsx
import { Stack, IStackTokens } from '@fluentui/react/lib/Stack';
import { Text } from '@fluentui/react/lib/Text';

const tokens: IStackTokens = { childrenGap: 12, padding: 16 };   // also maxWidth, maxHeight

<Stack horizontal horizontalAlign="space-between" verticalAlign="center" tokens={tokens}>
  <Text variant="xLarge" block nowrap>Title</Text>
  <Stack.Item grow>{/* … */}</Stack.Item>
</Stack>
```

- **Default direction is column.** `horizontalAlign` → `justifyContent` when `horizontal`, `alignItems` when vertical (and vice-versa for `verticalAlign`) — this swap is the #1 silent layout bug.
- `Alignment` = `'start' | 'end' | 'center' | 'space-between' | 'space-around' | 'space-evenly' | 'baseline' | 'stretch'`.
- Child `grow` in a **vertical** Stack requires `verticalFill` on the parent. `wrap` renders an extra inner div (the `inner` slot) with negative margins.
- `StackItem` props: `grow`, `shrink`, `disableShrink`, `align`, `verticalFill`, `basis`, `order`; item tokens are `margin` and `padding`.
- Deprecated props: `gap`, `maxWidth`, `maxHeight`, `padding` → use `tokens.*`; also `doNotRenderFalsyValues`.
- `Text`: `variant?: keyof IFontStyles`, `block`, `nowrap`, `as`. Ellipsis-on-overflow needs **both** `block` and `nowrap`.

## Surfaces

```tsx
import { Panel, PanelType } from '@fluentui/react/lib/Panel';
import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';

<Panel
  isOpen={isOpen}                                   // Panel/Modal: isOpen. Dialog: hidden (inverted)
  onDismiss={() => setIsOpen(false)}                // onDismissed fires AFTER the animation
  headerText="Edit item"
  type={PanelType.medium}
  closeButtonAriaLabel="Close"                      // effectively mandatory — icon-only close
  isFooterAtBottom
  onRenderFooterContent={() => (
    <>
      <PrimaryButton onClick={save} styles={{ root: { marginRight: 8 } }}>Save</PrimaryButton>
      <DefaultButton onClick={() => setIsOpen(false)}>Cancel</DefaultButton>
    </>
  )}
>
  <p>Panel body</p>
</Panel>
```

`PanelType`: `smallFluid` 0, `smallFixedFar` 1 *(default)*, `smallFixedNear` 2, `medium` 3, `large` 4, `largeFixed` 5, then `extraLarge`, `custom`, `customNear` *(numeric values 6–8 inferred, not verified)*. `customWidth` applies only with `PanelType.custom`. `isOpen` is **tri-state**: leaving it `undefined` lets the Panel manage its own visibility.

⚠️ If you supply `onRenderHeader`, it receives a **third `headerTextId` argument** and you **must** put that id on the element containing the title — the popup uses it as `aria-labelledby`. Ignoring it silently destroys the dialog's accessible name.

`Modal`: `isOpen` (default `false`, **not** inverted), `isBlocking` (default `false`), `isDarkOverlay` (default `true`), `isAlert` (forces `alertdialog` and overrides the role inferred from `isBlocking`/`isModeless`), `titleAriaId`, `subtitleAriaId`, `dragOptions`. `IDragOptions` **requires** `moveMenuItemText`, `closeMenuItemText` and `menu`.

`Callout`: `target`, `directionalHint` (default `bottomAutoEdge`), `gapSpace` 0, `beakWidth` 16, `isBeakVisible` (default `true`), `onDismiss`, the `preventDismissOn*` family (`preventDismissOnEvent` **takes priority over all three** of scroll/resize/lost-focus), and — critically — **`role` has no default**, so a Callout without one is a semantically anonymous div.

Tooltips need an explicit id relationship. `setAriaDescribedBy` is deprecated precisely because it put `aria-describedby` on a generic `<div>` that screen readers ignore:

```tsx
import { TooltipHost } from '@fluentui/react/lib/Tooltip';
import { useId } from '@fluentui/react-hooks';

const tooltipId = useId('tooltip');
<TooltipHost content="More information" id={tooltipId}>
  <button aria-describedby={tooltipId}>Info</button>
</TooltipHost>
```

Also on `TooltipHost`: `className` targets **the tooltip**, not the host — use `hostClassName` / `styles.root` for the host.

## Lists — the sticky-header recipe

`ScrollablePane` + `Sticky` is the canonical v8 list layout (and one of the things with **no v9 equivalent**):

```tsx
import { ScrollablePane, ScrollbarVisibility } from '@fluentui/react/lib/ScrollablePane';
import { Sticky, StickyPositionType } from '@fluentui/react/lib/Sticky';
import { DetailsList, DetailsListLayoutMode, IDetailsHeaderProps } from '@fluentui/react/lib/DetailsList';
import { SelectionMode } from '@fluentui/react/lib/Selection';
import { IRenderFunction } from '@fluentui/react/lib/Utilities';

const onRenderDetailsHeader: IRenderFunction<IDetailsHeaderProps> = (props, defaultRender) => (
  <Sticky stickyPosition={StickyPositionType.Header} isScrollSynced>{defaultRender!(props)}</Sticky>
);

<div style={{ position: 'relative', height: 400 }}>
  <ScrollablePane scrollbarVisibility={ScrollbarVisibility.auto}>
    <DetailsList
      items={items}
      columns={columns}                                   // IColumn[]
      selectionMode={SelectionMode.multiple}
      layoutMode={DetailsListLayoutMode.fixedColumns}
      ariaLabelForGrid="Documents"                        // all four of these matter
      ariaLabelForSelectAllCheckbox="Select all rows"
      ariaLabelForSelectionColumn="Toggle selection"
      checkButtonAriaLabel="Select row"
      onRenderDetailsHeader={onRenderDetailsHeader}
    />
  </ScrollablePane>
</div>
```

`Sticky.stickyPosition`: `Both` 0, `Header` 1, `Footer` 2. `ScrollablePane.scrollContainerFocus` makes the container focusable for keyboard-only scrolling — *only* if it holds no other focusable items, and then it also needs `scrollContainerAriaLabel`. `DetailsList` defaults to `role="grid"`; the deprecated `shouldApplyApplicationRole` puts screen readers into application mode — never use it. Rename `IColumn.isCollapsable` → `isCollapsible`, and `DetailsList.ariaLabel` → `ariaLabelForGrid`.

## Progress and loading

```tsx
import { ProgressIndicator } from '@fluentui/react/lib/ProgressIndicator';
import { Shimmer, ShimmerElementType } from '@fluentui/react/lib/Shimmer';

<ProgressIndicator label="Uploading" description="12 of 40 files" percentComplete={0.3} />  {/* 0–1! */}
<ProgressIndicator label="Working on it" />                                                {/* indeterminate */}

<Shimmer
  ariaLabel="Loading content"
  isDataLoaded={loaded}
  shimmerElements={[
    { type: ShimmerElementType.circle, height: 24 },
    { type: ShimmerElementType.gap, width: 16 },
    { type: ShimmerElementType.line, height: 16, width: '80%' },
  ]}
>
  {loaded && <ActualContent />}
</Shimmer>
```

`percentComplete` is **0–1**, and omitting it gives the indeterminate animation; `barHeight` defaults to `2`; the deprecated `title` prop is now `label`. `Shimmer` element defaults: line 16, gap 16, circle 24. `Spinner`: `size` (`SpinnerSize.xSmall` 12px / `small` 16 / `medium` 20 / `large` 28), `labelPosition` (default `'bottom'`), `ariaLive` (default `'polite'`) — **label updates are announced**, so don't churn them. `SpinnerType` and `ISpinnerProps.type` are deprecated in favour of `size`.

## Deprecated props you'll meet in existing code

`fluent_v8_guidance section=docs-errata` lists 17 documented errors in Microsoft's own migration docs; the table below is the per-component prop rename set.

| Component | Deprecated → use instead |
|---|---|
| `Dialog` | `isOpen`→`hidden`; `title`/`subText`/`type`/`contentClassName`/`topButtonsProps`→`dialogContentProps`; `isBlocking`/`isDarkOverlay`/`className`/`containerClassName`/`onDismissed`/`onLayerDidMount`→`modalProps`; `ariaLabelledById`→`modalProps.titleAriaId`; `ariaDescribedById`→`modalProps.subtitleAriaId` |
| `Dropdown` | `placeHolder`→`placeholder`; `onChanged`→`onChange`; `isDisabled`→`disabled`; `onRenderPlaceHolder`→`onRenderPlaceholder`; `IDropdownOption.isSelected`→`selected` |
| `Panel` | `ignoreExternalFocusing`, `forceFocusInsideTrap`, `firstFocusableSelector`→`focusTrapZoneProps`; `componentId` (unused) |
| `Nav` | `expandButtonAriaLabel`/`selectedAriaLabel`→ group `expandAriaLabel` / `INavLink.ariaCurrent`; `INavLink.iconClassName`→`iconProps.className` |
| `Toggle` | `onChanged`→`onChange`; `onAriaLabel`/`offAriaLabel` |
| `SearchBox` | `labelText`, `onChanged`→`onChange` |
| `Persona` | `primaryText`→`text`; `onRenderCoin`; named `PersonaSize.tiny`/`extraExtraSmall`/… → numeric `size8`/`size24`/… |
| `Pivot` | `PivotLinkFormat` / `PivotLinkSize` enums → the string literals `'links'` / `'tabs'` and `'normal'` / `'large'` |
| `MessageBar` | `ariaLabel`→ native `aria-label`; `overflowButtonAriaLabel`→`expandButtonProps` |
| `Icon` | `ariaLabel`→ native `aria-label`; `iconType`/`IconType`; `IIconStyles.imageContainer`→`root` |
| `Modal` / `Popup` | `enableAriaHiddenSiblings={false}` — deprecated because it **breaks modal behavior for some screen readers** |
| `TooltipHost` | `setAriaDescribedBy` → explicit `id` + `aria-describedby` |
| Others | `ResizeGroup.styles` → `className` + CSS (removed to cut bundle size) · `Rating.min` · `Image.errorSrc` · `Facepile.chevronButtonProps` · `TeachingBubble.hasCloseIcon`/`targetElement` · `Coachmark.collapsed` → `isCollapsed` |

Only three v8 components are deprecated **as a whole**: `Fabric`, the bare `Button` export, and `Grid`. Everything else is supported.
