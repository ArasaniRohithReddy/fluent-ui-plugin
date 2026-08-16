---
name: fluent-theming
description: Theme Fluent 2 web apps — FluentProvider, the built-in light/dark/high-contrast themes, and brand themes built from a single color with createLightTheme/createDarkTheme. Use to set up theming, add dark mode, or brand a Fluent app.
---

# Fluent 2 theming (web)

All Fluent 2 styling flows from a theme applied by **`FluentProvider`**. A theme is a flat `{ [token name]: CSS value }` object; the provider renders a `div`, resolves every token to a CSS variable on that element, and re-resolves them when the theme changes. *"No matter what theme is used, the component styles are always the same… When the theme is switched, only the variables are changed, all styles remain the same."* — [Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)

The provider **also propagates CSS variables to React portals** created with the [`Portal`](https://storybooks.fluentui.dev/react/?path=/docs/components-portal-portal--docs) component, so `Menu`/`Popover`/`Dialog` surfaces stay themed without a second provider. ([Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs))

## Built-in themes
```tsx
import { FluentProvider, webLightTheme, webDarkTheme } from '@fluentui/react-components';

export default function App() {
  const [dark, setDark] = React.useState(false);
  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme}>
      {/* app */}
    </FluentProvider>
  );
}
```
Upstream exports exactly five themes: `webLightTheme`, `webDarkTheme`, `teamsLightTheme`, `teamsDarkTheme`, `teamsHighContrastTheme`. Wrap the **whole app once**; nest a second `FluentProvider` to theme a subtree (e.g. an inverted panel).

## ⚠ High contrast — do **not** ship a High Contrast theme

> "**⚠ Do not use High Contrast themes!** All Fluent UI components support Windows High Contrast mode automatically regardless of the active theme. Windows high contrast mode is the recommended high contrast platform for all customers using Fluent UI. Hardcoded High Contrast themes are considered legacy, to be used only in applications which explicitly support those."
> — [Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)

So `teamsHighContrastTheme` is **legacy** — reach for it only when a host (e.g. a Teams app that mirrors the Teams HC setting) explicitly requires it. For everything else, ship `webLightTheme`/`webDarkTheme` and let the OS drive HC:

```tsx
// ✅ HC works under ANY theme. Just don't fight forced-colors in your own CSS.
const useStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    // in HC the system repaints backgrounds/borders; make sure the border survives
    '@media (forced-colors: active)': { borderColor: 'CanvasText' },
  },
  // opt OUT only where the colour IS the content (a swatch, a chart series, a brand logo)
  swatch: { '@media (forced-colors: active)': { forcedColorAdjust: 'none' } },
});
```
Rules: never hardcode a hex that survives forced-colors; never convey state by `background-color` alone (HC flattens it); test with Windows Settings ▸ Accessibility ▸ Contrast themes. Fluent's own focus outline already ships a `@media (forced-colors: active)` branch that repaints to `Highlight` — see `fluent-accessibility` → `references/focus-management.md`. Background: [Styling for Windows high contrast with forced-colors](https://blogs.windows.com/msedgedev/2020/09/17/styling-for-windows-high-contrast-with-new-standards-for-forced-colors/).

## ⚠ Never use the theme CSS variables directly

> "**⚠ Never use theme CSS variables directly!** The CSS variables implementation of the theme is internal to the library. We might eventually decide to change the variable names, hash them or even use direct values instead of some variables. Always use the `tokens` to access the theme."
> — [Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)

```tsx
// ❌ internal, unstable
const bad  = makeStyles({ root: { color: 'var(--colorNeutralForeground1)' } });
// ✅
const good = makeStyles({ root: { color: tokens.colorNeutralForeground1 } });
```

## Brand themes — the four factory functions
A theme is derived from a **`BrandVariants`** ramp of 16 slots (`10..160`), dark → light. Generate the ramp from a brand hex with the `fluent_generate_theme` MCP tool, then feed it to an official factory. Upstream ships **four** ([Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)):

| Factory | Produces |
|---|---|
| `createLightTheme(brand)` | Web light theme from your ramp |
| `createDarkTheme(brand)` | Web dark theme from your ramp |
| `createTeamsDarkTheme(brand)` | Teams-flavoured dark theme (Teams' darker neutrals) |
| `createHighContrastTheme(brand)` | HC theme — **legacy**, only for apps that explicitly ship a hardcoded HC theme (see above) |

```tsx
import { BrandVariants, createLightTheme, createDarkTheme, Theme } from '@fluentui/react-components';

const brand: BrandVariants = { 10: '#061724', /* … */ 80: '#0f6cbd', /* … */ 160: '#ebf3fc' };
export const lightTheme: Theme = createLightTheme(brand);
export const darkTheme: Theme = createDarkTheme(brand);
// <FluentProvider theme={lightTheme}> … </FluentProvider>
```
You only supply the brand ramp; the factory fills in the full official neutral + semantic token set.

## Overriding and extending tokens

> "⚠️ If the existing tokens do not fulfill your needs, you should talk to your designer instead of overriding tokens." — [Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)

**Override** — spread and replace, because a theme is a flat object:
```tsx
import { webLightTheme, Theme } from '@fluentui/react-components';

export const customLightTheme: Theme = { ...webLightTheme, colorNeutralForeground1: '#555' };
```

**Extend with new tokens** — add them to the theme, then build a matching tokens object:
```tsx
import { makeStyles, themeToTokensObject, tokens, webLightTheme, Theme } from '@fluentui/react-components';

type CustomTheme = Theme & { tokenA: string; tokenB: string };
const customTheme: CustomTheme = { ...webLightTheme, tokenA: 'red', tokenB: 'blue' };

// Option 1 — hand-written (tree-shakes cleanly)
const customTokens: Record<keyof CustomTheme, string> = { ...tokens, tokenA: 'var(--tokenA)', tokenB: 'var(--tokenB)' };
// Option 2 — generated
const alternativeCustomTokens = themeToTokensObject(customTheme);

const useStyles = makeStyles({ base: { color: customTokens.tokenA, backgroundColor: customTokens.tokenB } });
```
Two upstream warnings, both worth respecting ([Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)):
- *"adding more tokens adds more CSS variables which can effect run time performance as each DOM Node carries all the tokens"* — every extra token is paid for on **every** node under the provider.
- *"If you do it via the `themeToTokensObject` you might see a negative effect on tree-shaking since bundles won't know the shape of the output."* — prefer the hand-written `customTokens` object in shipping apps.

## RTL and multiple windows
- RTL: `<FluentProvider dir="rtl">`.
- Popouts/iframes/child windows: render a `FluentProvider` per document and pass the right `targetDocument`, so tokens and Griffel's renderer target that document.

## SSR — three providers, not one
Any SSR setup needs **`RendererProvider` + `SSRProvider` + `FluentProvider`** at the root. *"If these providers are not added, there will be issues when hydrating."* — [SSR basic setup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-basic-setup--docs)

```tsx
import { createDOMRenderer, RendererProvider, SSRProvider, FluentProvider, webLightTheme } from '@fluentui/react-components';

const renderer = createDOMRenderer();
<RendererProvider renderer={renderer}>
  <SSRProvider>
    <FluentProvider theme={webLightTheme}>{app}</FluentProvider>
  </SSRProvider>
</RendererProvider>
```
Import from **`@fluentui/react-components`**, not `@griffel/react` — the docs re-export all of these. Full recipes (Express, Next.js pages, Next.js appDir, Remix / React Router 7) and the portal hydration caveat: **`references/ssr.md`**.

## Web Components v3
There is **no provider element** — `FluentProvider` is React-only and `fluent-design-system-provider` was removed after v2. Theme by writing the token CSS variables onto a node with `setTheme`, and remember that **importing the class does not register the element** (use the side-effect module):

```js
import '@fluentui/web-components/button.js';          // side effect: registers <fluent-button>
import { setTheme } from '@fluentui/web-components';
import { webLightTheme, webDarkTheme } from '@fluentui/tokens';

setTheme(webLightTheme);                                       // whole document
setTheme(webDarkTheme, document.querySelector('#panel'));      // scoped subtree
```
`setTheme(theme: Theme | null, node?: Document | HTMLElement)`. `setThemeFor(element, theme)` is **deprecated** — pass the node to `setTheme` instead. Both are tagged `@internal` in [`docs/api-report.md`](https://github.com/microsoft/fluentui/blob/master/packages/web-components/docs/api-report.md) even though the [README](https://github.com/microsoft/fluentui/blob/master/packages/web-components/README.md) documents `setTheme` publicly. Setup, peer deps and CDN: see `fluent-web-ui`.

## Learn more
| Topic | How to find |
|---|---|
| SSR: 3-provider stack, Next.js pages/appDir, Remix, portal hydration | `references/ssr.md` |
| Generate a brand theme | MCP `fluent_generate_theme` (brandColor → ramp + createLightTheme/createDarkTheme) |
| Theming concepts (source of the rules above) | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs` |
| Token reference (colors, typography, spacing, radii, shadows, stroke widths) | `https://storybooks.fluentui.dev/react/?path=/docs/theme-colors--docs` · `theme-typography--docs` · `theme-spacing--docs` · `theme-border-radii--docs` · `theme-shadows--docs` · `theme-stroke-widths--docs` |
| Theme Designer | `https://storybooks.fluentui.dev/react/?path=/docs/theme-theme-designer--docs` |
| FluentProvider API | `https://storybooks.fluentui.dev/react/?path=/docs/components-fluentprovider--docs` |

> Storybook moved: `react.fluentui.dev` now 301-redirects to **`storybooks.fluentui.dev/react/`**. Use the new host, and check a doc id against `https://storybooks.fluentui.dev/react/index.json` before citing it — ids like `theme-theme--docs` do not exist.

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
