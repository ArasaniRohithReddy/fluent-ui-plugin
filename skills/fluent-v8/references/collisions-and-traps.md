# v8 traps and the four v8/v9 name classes

Everything here **compiles**. It ships, and then misbehaves at runtime. Encode these as review rules.

Machine-readable: `fluent_v8_guidance section=collisions` (26) · `section=renames` (9) · `section=casing-traps` (1) · `section=behavior-traps` (3) · `section=traps` (22); per-symbol via `fluent_v8_lookup name="Button"`.

## Four classes, four different fixes

The dataset separates these deliberately, because "collision" was previously used for all four and the fix is not the same:

| Class | What it means | The fix |
|---|---|---|
| **collision** | The *same* identifier is exported by both `@fluentui/react` and `@fluentui/react-components` | Alias one import — `import { Button as V8Button } from '@fluentui/react'` |
| **casing trap** | Same word, different casing, different component | Check the exact spelling; the compiler cannot |
| **rename** | v8 name → a **different** v9 name | Rename the symbol, don't just re-point the import |
| **behaviour trap** | Name survives, API semantics changed | Rewrite the call site |

Membership is **computed**, not curated: it is the intersection of the PascalCase exports in the two upstream API-Extractor reports — [`packages/react/etc/react.api.md`](https://github.com/microsoft/fluentui/blob/master/packages/react/etc/react.api.md) (1,458 exports) and [`packages/react-components/react-components/etc/react-components.api.md`](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-components/etc/react-components.api.md) (2,027 exports). Regenerate with `node scripts/build-v8-data.mjs --refresh-upstream`.

## 1. Collisions — 26 names exported by BOTH libraries

`Breadcrumb` · `Button` · `Checkbox` · `ColorPicker` · `CompoundButton` · `Dialog` · `DialogContent` · `Dropdown` · `Image` · `Label` · `Link` · `List` · `MessageBar` · `Nav` · `PartialTheme` · `Persona` · `Rating` · `SearchBox` · `SelectionMode` · `Slider` · `SpinButton` · `Spinner` · `TagPicker` · `Text` · `Theme` · `Tooltip`

With both libraries installed, **the import path alone decides the semantics**.

| Name | v8 (`@fluentui/react`) | v9 (`@fluentui/react-components`) | What breaks |
|---|---|---|---|
| `Button` | base **class** behind `DefaultButton`/`PrimaryButton`/`IconButton`; `text`, `iconProps`, `primary`, `styles` | *the* button: `children`, `icon` slot, `appearance`, `shape`, `size` | Highest-traffic collision in either library. A v8 import in a v9 app renders an unthemed base button and every v8 prop is silently ignored |
| `Checkbox` | `onChange(ev, checked?)`, `indeterminate`, `boxSide` | `onChange(ev, data)` with `data.checked: boolean \| 'mixed'`, `labelPosition` | `indeterminate` does nothing in v9 — it became `checked="mixed"` |
| `Dropdown` | `options: IDropdownOption[]`, `selectedKey`, `onChange(ev, option, index)` | `<Option>` children, `selectedOptions`, `onOptionSelect(ev, data)` — from **`@fluentui/react-combobox`** | Options-array vs children; `selectedKey` has no counterpart |
| `Slider` | `onChange(value, range?, ev?)` — **value first** | `onChange(ev, data)` — **event first** | Worst argument-order break in the library: the handler reads an event as a number |
| `SpinButton` | `value`/`defaultValue` are **strings** | `value`/`defaultValue` are `number \| null` | String→number plus the data object → `NaN` |
| `SearchBox` | `onChange(ev, newValue: string)`, `onSearch`, `onClear` | `onChange(ev, data)` reading `data.value`; no `onSearch`/`onClear` | "Press Enter to search" silently stops working |
| `Spinner` | `size: SpinnerSize` (enum → number) | `size: 'tiny' … 'huge'` (strings) | Size ignored; every spinner renders medium |
| `Link` | `href`, `underline`, `styles` | `appearance`, `inline`, `disabledFocusable` | `underline` has no counterpart; links stop looking like links |
| `Label` | `required`, `disabled`, `styles` | `size`, `weight`, `required?: boolean \| Slot` | Shared props make the swap compile; the type ramp silently changes |
| `CompoundButton` | `secondaryText`, `onRenderDescription` | `secondaryContent` slot | The description never renders |
| `DialogContent` | carries `title`, `subText`, close button | a bare scrollable body slot | A ported `<DialogContent title subText>` renders an empty box |
| `Dialog` | `hidden` defaults to **true** | `open` defaults to false | Inverted visibility — the #1 generated-code bug |
| `List` | **virtualized** (page windowing) | semantic `<List>`/`<ListItem>`, **no virtualization** | 100 000 rows render into the DOM |
| `Nav` | `groups: INavLinkGroup[]`, `selectedKey`, `onLinkClick` | `NavDrawer`/`NavItem`, `selectedValue`, `onNavItemSelect` | Same export name, **zero** API overlap |
| `Persona` | `text`, `size={PersonaSize.size48}`, `presence={PersonaPresence.online}` | `name`, `size={48}`, `presence={{status:'available'}}` | Empty persona |
| `Text` | `variant="xLarge"` | `size={100..1000}` | `variant` silently ignored |
| `Image` | `imageFit={ImageFit.cover}` (enum) | `fit="cover"` (string) | Image renders unfitted |
| `Tooltip` | v8 exports **both** `Tooltip` and `TooltipHost` | one `Tooltip`, `relationship` **required** | v9 `Tooltip` maps to v8 `TooltipHost`, not to v8 `Tooltip` |
| `Theme` / `PartialTheme` | `palette`, `semanticColors`, `fonts`, `effects` (from `@fluentui/theme`) | a **flat token record** (from `@fluentui/react-theme`) | Two incompatible theme types with one name — the cause of most "my theme doesn't apply" reports |
| `SelectionMode` | numeric **enum**: `none=0, single=1, multiple=2` | string union `'single' \| 'multiselect'` | `SelectionMode.multiple` does not exist in v9; a v8 member is a number |
| `Breadcrumb`, `ColorPicker`, `MessageBar`, `Rating`, `TagPicker` | array/enum-driven props | children composition + string literals | Data-array → JSX; enums → string literals |

Ask for the exact import pair and the alias to use:

```ts
// fluent_v8_lookup { name: "Button" } returns both, plus `disambiguate`:
import { Button as V8Button } from '@fluentui/react';        // v8 base class
import { Button } from '@fluentui/react-components';         // v9 Fluent 2 button
```

## 2. Casing trap — `ComboBox` (v8) vs `Combobox` (v9)

One letter. Two different components. `ComboBox` with a capital `B` is v8's (`options: IComboBoxOption[]`, `allowFreeform`, `text`, `selectedKey`); `Combobox` with a lowercase `b` is v9's, from `@fluentui/react-combobox` (`<Option>` children, `freeform`, `selectedOptions`). Because the two spellings are genuinely different identifiers, **no compiler will flag the mistake** — the import resolves to whichever library exports that exact spelling, and only one of the two has to be installed for it to build.

## 3. Renames — v8 name → a different v9 name

| v8 | v9 | What breaks |
|---|---|---|
| `Toggle` | `Switch` | `onText`/`offText` must become adjacent content |
| `Pivot` + `PivotItem` | `TabList` + `Tab` | Panel content disappears — v9 `Tab` renders no panel |
| `Shimmer` | `Skeleton` | `shimmerElements` array → children; the `isDataLoaded` crossfade is gone |
| `Separator`, `VerticalDivider` | `Divider` | Two-to-one; the wrapper/divider style slots have no target |
| `ProgressIndicator` | `ProgressBar` | `percentComplete` is 0–1, `value` is 0–`max` → off-by-100 |
| `TooltipHost` | `Tooltip` | ⚠️ v8 also exports a *different* component named `Tooltip` — see the collision above |
| `ContextualMenu` | `Menu` (+`MenuTrigger`/`MenuPopover`/`MenuList`) | Nested `subMenuProps` trees have no mechanical translation |
| `SwatchColorPicker` | `SwatchPicker` | `IColorCellProps` has no analogue; `onChange` arity differs |
| `ThemeProvider` | `FluentProvider` | `palette`/`semanticColors` have no v9 counterpart |

## 4. Behaviour traps — the name survives, the semantics changed

1. **`onChange` second argument.** v8 passes the **value**; v9 passes a **data object** (`data.checked`, `data.value`). Applies to every v8 `I<Name>Props` that declares `onChange` — derived from the API report: `Checkbox`, `ChoiceGroup`, `ChoiceGroupOption`, `ColorPicker`, `ComboBox`, `Dropdown`, `Rating`, `SearchBox`, `Slider`, `SpinButton`, `SwatchColorPicker`, `TextField`, `TimePicker`, `Toggle` and the `Base*Picker` family. *(An earlier version of this table listed `Link`, `Label`, `Image` and `Spinner` — none of them declares an `onChange` in v8.)*
2. **`styles` prop.** On virtually every v8 component; **does not exist** in v9. Any generated `styles={{root:{…}}}` is silently dropped, and vice versa. Use `className` + Griffel `makeStyles`.
3. **`Icon`.** v8 renders a font glyph from an `iconName` string and needs a one-time global `initializeIcons()`. v9 uses `@fluentui/react-icons` — one React component per icon (`<DeleteRegular/>`). `initializeIcons()` is a no-op for v9, and missing it in v8 renders boxes.

## The runtime traps (v8 on its own)

1. **`<Dialog hidden>` is inverted.** `hidden` **defaults to `true`** — the dialog is hidden unless you pass `hidden={false}`. `Panel` and `Modal` use `isOpen` (default closed). Getting this backwards is the single most common v8 bug, and mechanically renaming `hidden`→`open` during a migration produces an always-open dialog.
   ```tsx
   import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
   import { PrimaryButton, DefaultButton } from '@fluentui/react/lib/Button';

   <Dialog hidden={!isVisible} onDismiss={close}                                  // ✅ inverted
     dialogContentProps={{ type: DialogType.normal, title: 'Delete item?',
       subText: 'This action cannot be undone.', closeButtonAriaLabel: 'Close' }}
     modalProps={{ isBlocking: true, titleAriaId: 'delete-title' }}>
     <DialogFooter>
       <PrimaryButton onClick={confirm} text="Delete" />
       <DefaultButton onClick={close} text="Cancel" />
     </DialogFooter>
   </Dialog>
   ```
2. **`INavLink` requires both `name` and `url`.** For an onClick-only link pass `url: ''` — omitting it is a TypeScript error, and putting a real href in there navigates away.
   ```tsx
   import { Nav, INavLinkGroup } from '@fluentui/react/lib/Nav';

   const groups: INavLinkGroup[] = [{ links: [
     { key: 'home', name: 'Home', url: '', onClick: () => go('home') },          // ✅ url: ''
   ] }];
   <Nav groups={groups} selectedKey={selected} onLinkClick={(ev, item) => { /* … */ }} />
   ```
3. **`Slider` reverses its own argument order between two callbacks.** `onChange(value, range?, event?)` — **value first**. `onChanged(event, value, range?)` — **event first**. Mixing them up silently reads an event object as a number.
4. **v8/v9 name collisions that compile but misbehave.** See §1–§4 above.
5. **`Layer` stops event propagation by default.** ~30 React synthetic events are `stopPropagation()`'d at the boundary, so an ancestor's `onKeyDown` (a global Escape handler, say) never fires for content inside a `Callout`/`Panel`/`Modal`. Set `eventBubblingEnabled` when you need it.
6. **`ThemeProvider` emits no CSS variables.** Anything expecting `--fui-*` or `var(--…)` from a v8 theme is wrong — v8 bakes literal values into generated classes.
7. **A component outside any provider doesn't error.** `useTheme()` falls back to a fresh default theme, so it renders in default Fluent blue and looks "almost right".
8. **`SpinButton.value` / `defaultValue` are `string`s in v8** (they become `number` in v9) — a silent type/logic break when code moves between versions.

## Related

Import-path traps that break the *build* rather than the behaviour live in `styling.md`. Accessibility defaults that are wrong-by-omission live in `accessibility.md`. Runnable migration tooling lives in the `fluent-migration` skill and `fluent_migration_guidance scenario=tooling`.
