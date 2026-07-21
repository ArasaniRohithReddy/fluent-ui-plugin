---
name: fluent-powerpages
description: Give Power Pages sites a Fluent 2 look using the Styling workspace plus custom CSS that maps the site's Bootstrap onto Fluent 2 design tokens (CSS variables). Use for theming Power Pages to match Fluent 2.
---

# Fluent 2 in Power Pages

Power Pages has **no first-party Fluent 2 theme**. Sites are built on **Bootstrap** with a **Styling workspace** (design studio). Achieve a Fluent 2 look by combining the Styling brand kit with **custom CSS that expresses Fluent 2 design tokens as CSS variables** and maps Bootstrap onto them.

## Approach
1. **Styling workspace** — set the brand palette (seed `#0f6cbd`) and pick **Segoe UI** for headings/body; this covers the 9 mapped colors + fonts.
2. **Custom CSS** — declare Fluent 2 tokens as `:root` variables and map Bootstrap selectors/variables onto them. Upload via **Styling ▸ … ▸ Manage CSS** (≤ 1 MB; files lower in the list win).

```css
:root {
  --colorBrandBackground: #0f6cbd;        /* brand primary */
  --colorBrandBackgroundHover: #115ea3;
  --colorNeutralForeground1: #242424;     /* body text */
  --colorNeutralBackground1: #ffffff;     /* surface */
  --fontFamilyBase: 'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif;
  --fontSizeBase300: 14px;
  --borderRadiusMedium: 4px;
}
body { font-family: var(--fontFamilyBase); color: var(--colorNeutralForeground1); }
.btn-primary {
  background-color: var(--colorBrandBackground);
  border-color: var(--colorBrandBackground);
  border-radius: var(--borderRadiusMedium);
}
.btn-primary:hover { background-color: var(--colorBrandBackgroundHover); }
/* Bootstrap 5 variables can point at Fluent tokens */
:root { --bs-primary: var(--colorBrandBackground); --bs-body-font-family: var(--fontFamilyBase); }
```

Pull authoritative token values from the `fluent_get_token` / `fluent_list_tokens` MCP tools (or `@fluentui/tokens` `webLightTheme`) rather than hardcoding. Default brand `#0f6cbd`, default font Segoe UI.

## Steps
1. Styling workspace → brand palette (seed) + Segoe UI. 2. Author a custom CSS file declaring Fluent tokens as `:root` variables. 3. Map Bootstrap selectors/`--bs-*` onto the tokens. 4. Upload via **Manage CSS**, ordered below defaults so it wins. 5. Preview across web/tablet/mobile.

## Gotchas
- **Bootstrap version is ambiguous** in the docs (overview says v5 opt-in; Manage CSS + tutorials say v3.3.x). Confirm the actual version before writing version-specific CSS.
- **PCF React controls & platform libraries are NOT supported in Power Pages** — the PCF Fluent path (`fluent-pcf-component`) does not apply here. For real Fluent components on a page you can optionally load `@fluentui/web-components` via CDN (mind CSP), but prefer token-CSS for site-wide theming.
- Manage CSS precedence is bottom-wins; the per-component paintbrush overrides custom CSS unless you use `!important`.

## Learn more
| Topic | How to find |
|---|---|
| Style a site | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-pages/getting-started/style-site")` |
| Manage CSS | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-pages/configure/manage-css")` |
| Bootstrap in Power Pages | `microsoft_docs_search(query="Power Pages Bootstrap version 5")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
