---
name: fluent-web-ui
description: Build web UIs with Fluent UI React v9 (@fluentui/react-components) and Fluent Web Components v3 (@fluentui/web-components) — project setup, FluentProvider, Griffel makeStyles + tokens, component composition, and icons. Use for any Fluent 2 web app, page, or component.
---

# Fluent 2 web UI (React v9 + Web Components v3)

Fluent UI React v9 (`@fluentui/react-components`) is the code implementation of Fluent 2. Build with real components + design tokens; the framework brings accessibility and theming.

## Setup
```bash
npm install @fluentui/react-components @fluentui/react-icons
```
Wrap the app once in `FluentProvider` (see `fluent-theming`). Look up components with the `fluent_search_components` / `fluent_get_component` MCP tools and tokens with `fluent_list_tokens` / `fluent_get_token`. Scaffold with `fluent_generate_code`.

**React version floors** ([React version support](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-react-version-support--docs)): React 17 → v9.0.0 · **React 18 → ≥ 9.66.0** · **React 19 → ≥ 9.72.2**. Both bumps are *type-level only* — no runtime or API changes.

**Next.js:** *"There is a known issue with React strict mode and Fluent UI React. To avoid this issue, disable strict mode"* — set `reactStrictMode: false` in `next.config.js` ([Quick start](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-quick-start--docs)). Server-rendering needs the mandatory `RendererProvider` + `SSRProvider` + `FluentProvider` stack — see `fluent-theming` → `references/ssr.md`.

## Styling — Griffel `makeStyles` + `tokens`
```tsx
import { makeStyles, mergeClasses, tokens, Button, Card, Text } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL },
  compact: { padding: tokens.spacingHorizontalS },
});

export function Panel(props: { compact?: boolean; className?: string }) {
  const s = useStyles();
  return (
    <Card className={mergeClasses(s.root, props.compact && s.compact, props.className)}>
      <Text weight="semibold">Fluent 2</Text>
      <Button appearance="primary">Save</Button>
    </Card>
  );
}
```

### Hard rules (breaking these fails silently — no error, wrong pixels)
Source: [Styling components](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-styling-components--docs) unless noted.

| Rule | Why |
|---|---|
| **Call `makeStyles` in module scope**, never inside a component | *"you need to call `makeStyles` in a module scope to create a React hook"*. Styles cannot be built from props at runtime. |
| **Never concatenate class strings** — `mergeClasses()` only | *"⚠ It is not possible to simply concatenate `useStyles` classes"* / *"Never concatenate class strings, always use `mergeClasses()`"*. Griffel emits one atomic class per declaration; without dedupe the winner is a specificity coin-flip. |
| **Consumer `className` goes LAST** in `mergeClasses` | *"the latter argument overwrites the previous ones (similar to `Object.assign()`)"*. `mergeClasses(classes.root, props.className)` ✅ — the reverse is labelled *"Incorrect order of classes"* upstream. |
| **Only `tokens.*`** — no raw hex/px that duplicates a token | *"Do not use colors directly as those are not theme-able. Always use colors from a theme"* |
| **Never touch the theme CSS variables** (`var(--colorNeutralForeground1)`) | *"⚠ Never use theme CSS variables directly! … Always use the `tokens`"* — [Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs). They are internal and may be hashed or removed. |
| **Write native CSS shorthands**; `shorthands.*` is legacy | Griffel now expands `padding`/`gap`/`border`/`margin`/… natively — 20 of the 23 `shorthands` helpers are `@deprecated` ([griffel `gap.ts`](https://github.com/microsoft/griffel/blob/main/packages/core/src/shorthands/gap.ts)). **Exception:** `shorthands.borderColor` / `borderStyle` / `borderWidth` are **not** deprecated and are still required — writing them natively is a TS error ([Griffel `shorthands`](https://griffel.js.org/react/api/shorthands)). The Storybook page still teaches the old helpers; it lags. |
| **Override via `className` + slots**, never via CSS selectors on generated class names | *"you call `makeStyles`/`useStyles` in your code and pass the resulting classes through `props`"* |

Depth (options, anti-pattern snippets, the full 20-deprecated/3-live shorthands table, devtools): **`references/griffel.md`**.

- Use **slots** (e.g. `Button icon=`, `CardHeader header=`, `Field label=`) instead of custom markup.
- Layout with flex/grid + spacing tokens; radius via `tokens.borderRadius*`; elevation via `tokens.shadow*`.

## Components (highlights)
Actions: `Button`, `MenuButton`, `SplitButton`, `ToggleButton`, `CompoundButton`, `Link`. Forms: `Field`, `Input`, `Textarea`, `Combobox`, `Dropdown`, `Select`, `SpinButton`, `Slider`, `Checkbox`, `Radio/RadioGroup`, `Switch`. Data/display: `Text`, `Persona`, `Avatar`, `Badge`, `Card`, `Table`, `DataGrid`, `Tree`, `Tag`. Navigation: `TabList`, `Breadcrumb`, `Menu`, `Nav`/`NavDrawer`, `Toolbar`. Overlays/status: `Dialog`, `Drawer`, `Popover`, `Tooltip`, `Toast`/`Toaster`, `MessageBar`, `ProgressBar`, `Spinner`, `Skeleton`. Use `fluent_get_component` for exact props + samples.

### Package maturity — check before you import
Only **stable** components live in `@fluentui/react-components`. Preview and compat packages are **separate `0.x` dependencies and are NOT re-exported**:

| Level | Package | Import from |
|---|---|---|
| Stable | `@fluentui/react-<name>` (`9.x`) | `@fluentui/react-components` |
| **Preview** | `@fluentui/react-<name>-preview` (`0.x`) | the package itself — e.g. `@fluentui/react-motion-components-preview` |
| **Compat** (v8 component wrapped for v9) | `@fluentui/react-<name>-compat` (`0.x`) | the package itself — e.g. `@fluentui/react-datepicker-compat` |

- `@fluentui/react-components/unstable` is **deprecated** — *"use/consume `*-preview` packages directly"* ([`src/unstable/index.ts`](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-components/src/unstable/index.ts)).
- An **`_unstable` suffix on a prop/API name** means the API may have a breaking change later. It does **not** mean the code is unstable or unfit for production — don't avoid it.
- `Nav` **graduated** to stable (`@fluentui/react-nav`) and is re-exported from `@fluentui/react-components`; `@fluentui/react-nav-preview` no longer exists.

Full inventory + install matrix: **`references/package-maturity.md`**.

## Icons
```tsx
import { AddRegular, SaveFilled } from '@fluentui/react-icons';
<Button icon={<AddRegular />}>Add</Button>
```

## Copilot / AI surfaces
Use the `fluent-ai-copilot-ui` skill + `@fluentui-copilot/react-copilot` for chat input, Copilot messages, suggestions, prompt starters, and citations.

> The Copilot Storybook at `https://ai.fluentui.dev` is **not public** — it 301s to an Entra-gated app and returns **401** without Microsoft sign-in. The public source of truth is the published tarball, e.g. `https://unpkg.com/@fluentui-copilot/react-copilot@0.30.5/dist/index.d.ts` (113 KB, ~986 exports) — the umbrella package re-exports from `@fluentui-copilot/react-chat-input`, `…/react-chat-input-plugins`, etc., so read those `.d.ts` files for real props.
> Example of why that matters: `ChatInput`'s `charactersRemainingMessage` is **optional** — `charactersRemainingMessage?: (charactersRemaining: number) => string` — and only becomes required through the `HasMaxLengthProps` half of the `NoMaxLengthProps | HasMaxLengthProps` union, i.e. when you set `maxLength`.

## Web Components v3 (framework-agnostic)
Current GA release: **`@fluentui/web-components@3.1.0`**. It has **two peer dependencies** you must install yourself:
```bash
npm install @fluentui/web-components @microsoft/fast-element @microsoft/focusgroup-polyfill
```

### ⚠ Importing the class does not register the element
The root entry (`dist/esm/index.js`) is **pure re-exports — zero `define()` calls**. Registration only happens through a **side-effect import**:

> "Each component can be directly imported. **The side effect only module will call `define`** and cause it to be set up." — [README](https://github.com/microsoft/fluentui/blob/master/packages/web-components/README.md)

```js
// ❌ <fluent-button> stays an unknown element — nothing is registered
import { Button, setTheme } from '@fluentui/web-components';

// ✅ per component (tree-shakeable) — resolves to dist/esm/button/define.js -> Button.define(definition)
import '@fluentui/web-components/button.js';

// ✅ everything at once (pre-bundled)
import '@fluentui/web-components/web-components.js';

// ✅ declarative f-template variant
import '@fluentui/web-components/button/define-async.js';
```
Or skip the bundler entirely with the pre-bundled CDN script:
```html
<script type="module" src="https://unpkg.com/@fluentui/web-components"></script>
```
> Pin a version for production — the bare URL always serves `latest`.

### Theming — there is **no provider element**
`FluentProvider` is React-only. v3 has no provider custom element (`fluent-design-system-provider` was a v2 API and is gone; the v3 API report contains **zero** provider exports). Theme by writing CSS custom properties onto a node:

```html
<script type="module">
  import '@fluentui/web-components/button.js';
  import { setTheme } from '@fluentui/web-components';
  import { webLightTheme, webDarkTheme } from '@fluentui/tokens';

  setTheme(webLightTheme);                       // document-wide
  setTheme(webDarkTheme, document.querySelector('#panel')); // scoped to a subtree
</script>
<fluent-button appearance="primary">Save</fluent-button>
```
`setTheme(theme: Theme | null, node?: Document | HTMLElement)` — the second argument scopes the tokens. `setThemeFor(element, theme)` is **deprecated**; use `setTheme(theme, element)`.

**Two caveats worth knowing before you commit:**
- `setTheme` / `setThemeFor` are documented in the public README but tagged `@internal` in [`docs/api-report.md`](https://github.com/microsoft/fluentui/blob/master/packages/web-components/docs/api-report.md) — they are the only documented theming path, but the API is not contractually public.
- GA `@fluentui/web-components@3.1.0` depends on `@fluentui/tokens@^1.0.0-alpha.24` — an **alpha** dependency under a GA package.

> Framework integrations (Angular/Vue/Blazor wrappers) are **not** documented upstream for v3. Treat any such guidance as unverified — use the standard custom-element interop of your framework.

## Always
**React:** wrap in `FluentProvider` · style with `tokens.*` (no magic values) · `mergeClasses` with consumer `className` last · pick real components (composition/slots) · verify the package level before importing.
**Web Components:** side-effect import to register each element · `setTheme()` to theme (no provider element) · install both peer deps.
**Both:** verify accessibility with `fluent_accessibility_checklist` and the `fluent-accessibility` skill.

## Learn more
| Topic | How to find |
|---|---|
| Griffel rules, shorthands table, debugging | `references/griffel.md` |
| Preview/compat/unstable, React floors, install matrix | `references/package-maturity.md` |
| Component API + samples | MCP `fluent_get_component` · `https://storybooks.fluentui.dev/react/` |
| Web Components v3 setup, define modules, CDN | `https://github.com/microsoft/fluentui/blob/master/packages/web-components/README.md` |
| Styling concepts (upstream) | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-styling-components--docs` |
| Quick start / React version support | `?path=/docs/concepts-developer-quick-start--docs` · `?path=/docs/concepts-developer-react-version-support--docs` |
| Server-side rendering | `fluent-theming` → `references/ssr.md` |
| Fluent 2 design | `https://fluent2.microsoft.design` |

> Note: `react.fluentui.dev` now 301-redirects to `storybooks.fluentui.dev/react/`. Use the canonical host.

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
