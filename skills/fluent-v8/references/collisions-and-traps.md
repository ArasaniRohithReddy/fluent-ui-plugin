# v8 traps and v8/v9 name collisions

Everything here **compiles**. It ships, and then misbehaves at runtime. Encode these as review rules.

Machine-readable versions: `fluent_v8_guidance section=collisions` (23 entries) and `section=traps` (22 entries); per-symbol via `fluent_v8_lookup name="Dialog"`.

## v8/v9 name collisions

With both libraries installed, **the import path alone decides the semantics**.

| Name | v8 (`@fluentui/react`) | v9 (`@fluentui/react-components`) | What breaks |
|---|---|---|---|
| `List` | **virtualized** (page-based windowing) | semantic `<List>`/`<ListItem>`, **no virtualization** | 100 000 rows render into the DOM |
| `ProgressIndicator` → `ProgressBar` | `percentComplete` **0–1** | `value` **0–max** (`max` default 1) | Off-by-100 progress |
| `Nav` | `groups: INavLinkGroup[]`, `selectedKey`, `onLinkClick` | `NavDrawer`/`NavItem` composition, `selectedValue`, `onNavItemSelect` | Same export name, **zero** API overlap |
| `Text` | `variant="xLarge"` | `size={100..1000}` | `variant` silently ignored |
| `Tooltip` | `Tooltip` **and** `TooltipHost` are two different things | one `Tooltip`, `relationship` **required** | Wrong component, missing required prop |
| `Persona` | `text`, `size={PersonaSize.size48}`, `presence={PersonaPresence.online}` | `name`, `size={48}`, `presence={{status:'available'}}` | Empty persona |
| `Checkbox`/`Slider`/`Toggle`/`SpinButton`/`Link`/`Label`/`Image`/`Spinner` | `onChange(ev, checked?/value?)` — 2nd arg **is the value** | `onChange(ev, data)` — 2nd arg is a **data object** | Uniform, silent signature break |
| `styles` prop | on virtually every component | **does not exist** | Styling silently disappears |

## The traps

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
4. **v8/v9 name collisions that compile but misbehave.** See the table above.
5. **`Layer` stops event propagation by default.** ~30 React synthetic events are `stopPropagation()`'d at the boundary, so an ancestor's `onKeyDown` (a global Escape handler, say) never fires for content inside a `Callout`/`Panel`/`Modal`. Set `eventBubblingEnabled` when you need it.
6. **`ThemeProvider` emits no CSS variables.** Anything expecting `--fui-*` or `var(--…)` from a v8 theme is wrong — v8 bakes literal values into generated classes.
7. **A component outside any provider doesn't error.** `useTheme()` falls back to a fresh default theme, so it renders in default Fluent blue and looks "almost right".
8. **`SpinButton.value` / `defaultValue` are `string`s in v8** (they become `number` in v9) — a silent type/logic break when code moves between versions.

## Related

Import-path traps that break the *build* rather than the behaviour live in `styling.md`. Accessibility defaults that are wrong-by-omission live in `accessibility.md`.
