# Package maturity, `/unstable`, and React version floors

Picking the wrong package name is the single most common v9 build error. There are **four** maturity levels, and only one of them ships inside `@fluentui/react-components`.

---

## The four levels

| Level | Package pattern | Version line | Re-exported from `@fluentui/react-components`? |
|---|---|---|---|
| **Stable** | `@fluentui/react-<name>` | `9.x` | **Yes** — import from `@fluentui/react-components` |
| **Preview** | `@fluentui/react-<name>-preview` | `0.x` | **No** — install and import directly |
| **Compat** | `@fluentui/react-<name>-compat` | `0.x` | **No** — install and import directly |
| **`/unstable` subpath** | `@fluentui/react-components/unstable` | — | Deprecated; see below |

```tsx
// ✅ stable
import { Button, Nav, NavDrawer } from '@fluentui/react-components';

// ✅ preview — separate dependency, separate import
import { Fade } from '@fluentui/react-motion-components-preview';

// ✅ compat — separate dependency, separate import
import { DatePicker } from '@fluentui/react-datepicker-compat';

// ❌ these do not exist and will fail to build
import { Fade } from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-components';
```

Because preview and compat are **`0.x`**, they are *not* semver-locked to your `9.x` core version — pin them and bump deliberately.

### Preview packages (current inventory)

| Package | Exports |
|---|---|
| `@fluentui/react-motion-components-preview` | `Fade`, `Scale`, `Slide`, `Collapse`, `Blur`, `Rotate`, `Stagger` (+ `*Snappy` / `*Relaxed` variants and the underlying `*Atom`s) |
| `@fluentui/react-menu-grid-preview` | `MenuGrid`, `MenuGridCell`, `MenuGridItem` |
| `@fluentui/react-headless-components-preview` | (headless primitives; index currently empty) |
| `@fluentui/component-selector-preview` | (tooling; index currently empty) |

### Compat packages (a v8 component re-skinned for v9)

`compat` means "the v8 implementation, wrapped so it works inside a v9 app", for components v9 hasn't rebuilt yet.

| Package | Exports | Storybook |
|---|---|---|
| `@fluentui/react-datepicker-compat` | `DatePicker` | `?path=/docs/compat-components-datepicker--docs` |
| `@fluentui/react-calendar-compat` | `Calendar` | `?path=/docs/compat-components-calendar--docs` |
| `@fluentui/react-timepicker-compat` | `TimePicker` | `?path=/docs/compat-components-timepicker--docs` |
| `@fluentui/react-colorpicker-compat` | reserved — `src/index.ts` is still `export {}` | — |
| `@fluentui/react-portal-compat` | `PortalCompatProvider` (lets v8 portals inherit v9 theming) | — |
| `@fluentui/react-icons-compat` | v8 icon shim | — |

---

## `@fluentui/react-components/unstable` is deprecated

Verbatim header of [`src/unstable/index.ts`](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-components/src/unstable/index.ts):

> "⚠️ **IMPORTANT:**
> - `/unstable` api is **DEPRECATED**
> - adding new API exports to this file is **FORBIDDEN** (except `react-virtualizer`)
> - modifying any existing exports in this file is **FORBIDDEN**
> - use/consume `*-preview` packages directly for preview/unstable Fluent UI core controls early access"

It still re-exports a handful of legacy entries (`react-alert`, `react-drawer`, `react-infobutton`, `react-tree`, `react-virtualizer`). If a snippet you found imports from `/unstable`, check whether the component has since gone stable (most have — `Drawer`, `Tree` and `Alert` all ship from `@fluentui/react-components` now) and move the import.

---

## `_unstable` prop/API suffix ≠ unfit for production

Different thing entirely. When a **prop or API name** carries an `_unstable` suffix:

> the API **may have a breaking change in the future**. It does **not** mean the code is unstable or unfit for production.

So `size_unstable`-style props are safe to ship; just expect to rename them on a future minor. Don't warn users away from them.

---

## `Nav` is stable — don't downgrade it

`Nav` used to be preview-only (`@fluentui/react-nav-preview`). It has **graduated**: `@fluentui/react-nav` is a direct dependency of `@fluentui/react-components` and `Nav`, `NavDrawer`, `NavDrawerBody`, `NavDrawerHeader`, `NavItem`, `NavCategory`, `NavCategoryItem`, `NavSubItem`, `NavSectionHeader`, `NavDivider`, `AppItem`, `SplitNavItem`, `Hamburger` are all re-exported from the main entry point.

```tsx
import { NavDrawer, NavDrawerBody, NavItem } from '@fluentui/react-components'; // ✅
```
Storybook: [`?path=/docs/components-nav--docs`](https://storybooks.fluentui.dev/react/?path=/docs/components-nav--docs). If a doc still tells you to install `@fluentui/react-nav-preview`, it is stale — that package no longer exists in the monorepo.

---

## React version floors

Source: [React version support](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-react-version-support--docs).

| React | Fully supported from | Runtime/API changes |
|---|---|---|
| 17 | `@fluentui/react-components` **9.0.0** | — |
| 18 | **9.66.0** | **None** — types only |
| 19 | **9.72.2** | **None** — types only |

Both bumps are **type-level only**; upstream states there are *no* runtime or API changes. What actually breaks is TypeScript:

**React 18** — `Slot` children-as-function got loosened to `any`, so under `strict` you must assert the render function:
```tsx
import { Button, type SlotRenderFunction, type ButtonProps } from '@fluentui/react-components';

<Button
  icon={{
    children: ((Component, props) => <Component {...props} />) satisfies SlotRenderFunction<ButtonProps['icon']>,
  }}
/>
```

**React 19** — the global `JSX` namespace was removed. Use the types re-exported by Fluent instead of `JSX.Element` / `JSX.IntrinsicElements`:
```tsx
import type { JSXElement, JSXIntrinsicElement, JSXIntrinsicElementKeys } from '@fluentui/react-components';

const el: JSXElement = <div />;                 // was JSX.Element
type Div = JSXIntrinsicElement<'div'>;          // was JSX.IntrinsicElements['div']
type AnyTag = JSXIntrinsicElementKeys;          // was keyof JSX.IntrinsicElements
```

---

## Next.js: turn off strict mode (for now)

> "There is a known issue with React strict mode and Fluent UI React. To avoid this issue, disable strict mode in your Next.js configuration."
> — [Quick start](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-quick-start--docs)

```js
// next.config.js
module.exports = { reactStrictMode: false };
```
SSR needs more than this — the mandatory `RendererProvider` + `SSRProvider` + `FluentProvider` stack, `_document.tsx`/`providers.tsx` and the appDir SWC plugin are covered in the `fluent-theming` skill's `references/ssr.md`.

---

## Install matrix

```bash
npm i @fluentui/react-components @fluentui/react-icons          # stable core
npm i @fluentui/react-motion-components-preview                  # preview, 0.x
npm i @fluentui/react-datepicker-compat                          # compat, 0.x
npm i @fluentui/react-charts                                     # charts (separate stable package)
npm i @fluentui-copilot/react-copilot                            # AI/Copilot surfaces
# Web Components v3 — BOTH peer deps are required
npm i @fluentui/web-components @microsoft/fast-element @microsoft/focusgroup-polyfill
```

### `@fluentui/web-components` (v3) dependency facts
Verified from the published tarball (`https://unpkg.com/@fluentui/web-components@3.1.0/package.json`):

| Field | Value |
|---|---|
| `latest` | **3.1.0** (GA line started at 3.0.0) |
| `dependencies` | `@fluentui/tokens: ^1.0.0-alpha.24`, `tslib: ^2.1.0` — note the **alpha** token dependency under a GA package |
| `peerDependencies` | `@microsoft/fast-element: ^3.0.0`, `@microsoft/focusgroup-polyfill: ^1.5.0` |
| `sideEffects` | `["define.*", "define-async.*", …, "./dist/esm/**/define.js", "./dist/web-components.js", …]` |
| `exports["./*.js"]` | `./dist/esm/*/define.js` — so `@fluentui/web-components/button.js` **is** the define module |

Because the root entry has **no** `define()` calls, `import { Button } from '@fluentui/web-components'` registers nothing. See `../SKILL.md` → *Web Components v3*.

> **Registry note:** `registry.npmjs.org` may be blocked in some environments, but **`unpkg.com`** and **`data.jsdelivr.com`** serve published tarball contents and version metadata — use them to verify any package claim (`https://unpkg.com/<pkg>@<ver>/package.json`, `https://unpkg.com/<pkg>@<ver>/dist/index.d.ts`, `https://data.jsdelivr.com/v1/packages/npm/<pkg>`).
