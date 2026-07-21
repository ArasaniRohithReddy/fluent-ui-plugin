---
name: fluent-design-tokens
description: Use Microsoft Fluent 2 design tokens correctly — color (brand ramp + semantic neutrals), typography, spacing, corner radius, stroke width, elevation/shadow, and motion. Use whenever choosing colors, sizes, spacing, radius, or shadows so you never hardcode values.
---

# Fluent 2 design tokens

Design tokens are the single source of truth for Fluent 2 styling. **Never hardcode a value a token already defines.** Every token `X` is exposed by `FluentProvider` as the CSS variable `--X` and as `tokens.X` in Griffel (`tokens.X === "var(--X)"`). Look up exact values with the `fluent_list_tokens` / `fluent_get_token` MCP tools.

## Color
- **Brand ramp** — 16 slots `10..160`; the default web brand is `brand.80 = #0f6cbd`. Custom brand themes are built from a 16-slot `BrandVariants` (see `fluent-theming`).
- **Semantic neutrals** (light): `colorNeutralForeground1 = #242424`, `colorNeutralForeground2 = #424242`, `colorNeutralForeground3 = #616161`, `colorNeutralBackground1 = #ffffff`, `colorNeutralStroke1 = #d1d1d1`. Dark + high-contrast have their own resolved values (`fluent_list_tokens category=color theme=dark|highContrast`).
- **Brand tokens:** `colorBrandBackground`, `colorBrandBackgroundHover`, `colorBrandForeground1`, `colorCompoundBrandForeground1`, etc. — use these, not raw brand hex.
- Prefer **semantic/alias** tokens (`colorNeutralForeground1`) over global ramp values so light/dark/HC adapt automatically.

## Typography
- Font: `fontFamilyBase = 'Segoe UI', ...`. Sizes `fontSizeBase100..600` + hero sizes; body default `fontSizeBase300 = 14px`. Weights `fontWeightRegular 400 / Medium 500 / Semibold 600 / Bold 700`. Named ramp styles: `caption1/2`, `body1/2`, `subtitle2/1`, `title3/2/1`, `largeTitle`, `display`. Use the `Text`/`Title`/`Caption1` components or `typographyStyles`.

## Spacing (`spacingHorizontal*` / `spacingVertical*`)
`None 0 · XXS 2 · XS 4 · SNudge 6 · S 8 · MNudge 10 · M 12 · L 16 · XL 20 · XXL 24 · XXXL 32` (px).

## Corner radius (`borderRadius*`)
`None 0 · Small 2 · Medium 4 · Large 6 · XLarge 8 · 2XLarge 12 · 3XLarge 16 · … · Circular` (px). Controls typically use `Medium` (4px); cards ~`XLarge` (8px).

## Stroke width (`strokeWidth*`)
`Thin 1 · Thick 2 · Thicker 3 · Thickest 4` (px).

## Elevation / shadow (`shadow2..shadow64` + `*Brand`)
`shadow2/4/8/16/28/64` map to increasing elevation (flyouts ~`shadow16`, dialogs ~`shadow28/64`). Brand variants tint the ambient shadow.

## Motion (`duration*` / `curve*`)
Durations `ultraFast 50 · faster 100 · fast 150 · normal 200 · gentle 250 · slow 300 · slower 400 · ultraSlow 500` (ms). Curves: `curveEasyEase`, `curveAccelerate*`, `curveDecelerate*`, `curveLinear`.

## Use it
```ts
import { makeStyles, tokens } from '@fluentui/react-components';
const useStyles = makeStyles({
  card: {
    padding: tokens.spacingHorizontalL,          // 16px
    borderRadius: tokens.borderRadiusXLarge,      // 8px
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    boxShadow: tokens.shadow8,
  },
});
```

## Learn more
| Topic | How to find |
|---|---|
| Exact token values | MCP `fluent_list_tokens` / `fluent_get_token` |
| Design tokens guidance | `https://fluent2.microsoft.design/design-tokens` · `https://fluent2.microsoft.design/color-tokens` |
| Token package | `microsoft_docs_search(query="Fluent UI react tokens design tokens v9")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
