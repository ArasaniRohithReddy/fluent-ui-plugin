---
name: fluent-theming
description: Theme Fluent 2 web apps — FluentProvider, the built-in light/dark/high-contrast themes, and brand themes built from a single color with createLightTheme/createDarkTheme. Use to set up theming, add dark mode, or brand a Fluent app.
---

# Fluent 2 theming (web)

All Fluent 2 styling flows from a theme applied by **`FluentProvider`**. A theme resolves every design token (`--X`) so components and your `makeStyles` + `tokens.*` styles adapt to light, dark, high-contrast, and brand.

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
Also available: `teamsLightTheme`, `teamsDarkTheme`, `teamsHighContrastTheme`. Wrap the **whole app once**; you can nest a second `FluentProvider` to theme a subtree (e.g. an inverted panel).

## Brand themes (from one color)
Fluent builds a theme from a **`BrandVariants`** ramp of 16 slots (`10..160`). Generate it from a brand hex with the `fluent_generate_theme` MCP tool, then feed it to the official builders:
```tsx
import { BrandVariants, createLightTheme, createDarkTheme, Theme } from '@fluentui/react-components';

const brand: BrandVariants = { 10: '#061724', /* … */ 80: '#0f6cbd', /* … */ 160: '#ebf3fc' };
export const lightTheme: Theme = createLightTheme(brand);
export const darkTheme: Theme = createDarkTheme(brand);
// <FluentProvider theme={lightTheme}> … </FluentProvider>
```
`createLightTheme`/`createDarkTheme` produce the full, official Fluent 2 theme (neutral + semantic tokens) from the ramp — you only supply the brand ramp.

## High contrast & RTL
- Use `teamsHighContrastTheme` (or the OS forced-colors path) for High Contrast; don't hardcode colors that override it.
- Set direction on the provider for RTL: `<FluentProvider dir="rtl">`.

## SSR / multiple windows
- For SSR, render inside `<FluentProvider>` and use `renderToStyleElements` / `RendererProvider` (`@griffel/react`) to extract styles.
- For popouts/iframes, provide a `FluentProvider` per document with the right `targetDocument`.

## Web Components v3
```js
import { setTheme } from '@fluentui/web-components';
import { webLightTheme } from '@fluentui/tokens';
setTheme(webLightTheme); // applies tokens to <fluent-*> elements
```

## Learn more
| Topic | How to find |
|---|---|
| Generate a brand theme | MCP `fluent_generate_theme` (brandColor → ramp + createLightTheme/createDarkTheme) |
| Theme Designer | `microsoft_docs_search(query="Fluent UI React theme designer brand ramp")` |
| FluentProvider / theming | `https://react.fluentui.dev/?path=/docs/theme-theme--docs` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
