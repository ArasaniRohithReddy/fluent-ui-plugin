---
name: fluent-design-language
description: Apply the Microsoft Fluent 2 design language end to end — design principles, color, typography, layout/grid, elevation, shapes, iconography, motion, material, accessibility, content design, plus the guideline guides (handoffs, onboarding, wait UX, Responsible AI, and types of AI harm). Use whenever making design-language decisions beyond raw token values, so the UI stays faithful to https://fluent2.microsoft.design.
---

# Fluent 2 design language

Fluent 2 is Microsoft's cross-platform design system. Its **foundations** (below) are the reasoning layer above the raw values — they tell you *why* and *when* to apply a color, size, shadow, or motion. Get exact numbers from the **`fluent-design-tokens`** skill and the `fluent_list_tokens` / `fluent_get_token` MCP tools; get grounded, structured guidance for any foundation from the **`fluent_design_guidance`** MCP tool (`topic` = any heading below, or `all`).

## Design principles
Four principles, each functional **and** emotional: **Natural on every platform** (adapt to device; reuse native patterns ~80% of the time), **Built for focus** (inspire action, stay out of the way), **One for all, all for one** (include diverse abilities early), **Unmistakably Microsoft** (signature experiences build recognition).

## Color
Three palettes with distinct roles: **Neutral** (grounds surfaces/text/hierarchy), **Shared** (accent/recognition — use sparingly; includes semantic status: red = danger, yellow = caution, green = positive), **Brand** (product recognition — don't overuse or apply to large surfaces). Interaction states get **darker** on hover -> pressed (Windows reverses this); **focus** keeps the control color and thickens the container stroke. Never rely on color alone. Prefer alias tokens so light/dark/high-contrast adapt automatically.

## Typography
**Segoe UI** is the signature web typeface; native fonts are the per-platform default (Segoe UI Variable, San Francisco Pro, Roboto). The web type ramp runs **Caption 2 (10px)** to **Display (68px)** in Regular/Semibold/Bold; body default is **Body 1 = 14px/20px**. Use sentence case (no all caps), baseline alignment, and left-align LTR. Contrast: standard text **≥ 4.5:1**, large text (>18.5px Bold or >24px Regular) **≥ 3:1**.

## Layout & grid
Space (not lines) creates relationships and hierarchy. Base unit is **4px**; the ramp is `sizeNone 0 … size560 56` (2/6/10 sit off-grid to align Fluent icons). Touch targets: **iOS & Web 44×44, Android 48×48**. Grids = columns + gutters + margins (+ regions); **12-column** is the common web framework. Six size classes from **small (320)** to **xxx-large (1920+)**. Choose **responsive** (one fluid layout) or **adaptive** (fixed layouts per breakpoint); techniques: reposition, resize, reflow, show/hide, re-architect.

## Elevation
Elevation is depth conveyed by **shadow + light**; blur encodes distance (`shadow2` = 2px blur … `shadow64` = 64px). Each shadow combines a sharp **key** shadow (edges) and a soft **ambient** shadow (distance); Windows uses strokes instead of key shadows. Ramp: `shadow2/4/8/16` (low) through `shadow28/64` (high) — flyouts ~`shadow16`, dialogs/panels ~`shadow64`. On colored surfaces use **brand shadow tokens** and adjust opacity by luminosity — never the neutral ramp.

## Shapes
Four forms: **rectangle, circle, pill, beak** — distinguished by fill or border. Default corner radius **4px**; shapes <32px drop to **2px**; large/x-large use **8px/12px**; personas 50%. Skip rounded corners at screen edges. Stroke thickness Thin/Thick/Thicker/Thickest — match to element size, round the stroke caps.

## Iconography
Three collections: **system icons** (MIT-licensed, Regular + Filled themes), **product launch icons**, **file type icons**. System icons are named literally (shape/object, not function); modifiers are always **Filled**, bottom-right. `12px` is informational only. Use at most **one** color on system icons; **never recolor product launch icons** or use them in place of the Microsoft logo.

## Motion
Four principles: functional, natural, consistent, appealing. Give larger elements more time. Duration tokens: `durationUltraFast 50` · `durationFaster 100` · `durationFast 150` · `durationNormal 200` · `durationGentle 250` · `durationSlow 300` · `durationSlower 400` · `durationUltraSlow 500` (ms). Curves: `curveEasyEase`, `curveLinear`, and `curveAccelerate*` / `curveDecelerate*` (Min/Mid/Max). Four transitions: enter/exit, elevation, top-level (quick fade), container transform. Prefer short **staggered** offsets; always honor a **"no motion"** setting and avoid flashes.

## Material
Surface texture — four materials: **Solid** (opaque, mode-aware, most common), **Acrylic** (frosted glass, mode-aware; transient light-dismiss surfaces like popovers/menus), **Mica** (opaque, tints with the desktop on active windows — Windows focus cue), **Smoke** (dims the UI beneath a modal; always translucent black, not mode-aware).

## Accessibility
Fluent components meet or surpass **WCAG 2.1 AA**. Contrast: text ≥ 4.5:1, large text ≥ 3:1, interactive/non-textual (icons) ≥ 3:1. Reflow without horizontal scroll at up to **400% zoom** (design down to **320px**) and support **200% text zoom**. Manage focus in a **Z pattern**; never lose focus after a temporary UI closes; write semantic code following WAI-ARIA.

## Content design
Design around audience, goal, and feeling. Keep it simple, get to the point, talk like a person. Use **present tense**, **active voice**, **second person**; sentence-case on Windows/Android/web (title-case on iOS/macOS). Periods only after full sentences (not headers/buttons/labels/lists). **Do:** descriptive link text, alt text, headings/tables/lists. **Don't:** all caps, exclamation points, or directional terms ("above"/"below").

## Guideline guides (AI & flow)
- **Handoffs** — moving between workflow steps/apps. Principles: guide seamlessly, maintain context, unify experiences. Common CTAs: *Create…*, *Open in…*, *Continue in…*, *Try in…*. System messages are third-person and end with a period.
- **Onboarding** — teach at the point of need. Principles: relevant, non-distracting, optional, benefit-focused, coherent. Goals: welcome, orient, notify, explain, take action. Write for action and set clear time/step expectations.
- **Wait UX** — communicate clearly, optimize perceived performance, maintain context. Thresholds: **<1s** no indicator, **1–3s** spinner, **>3s** progress bar/content string. Use `-ing` verbs + a nonbreaking space before the ellipsis; announce state with `role="status"`.
- **Responsible AI** — build *appropriate trust* without overpromising. Principles: be transparent, set appropriate expectations, prevent overreliance, keep users in control, collect feedback. Always show the approved **AI disclaimer** and differentiate AI vs. non-AI content. The RAI rubric scores 0–3; a 0/1 on overreliance or agent expectations is an automatic fail.
- **Types of AI harm** — inaccurate, incomplete, biased, inappropriate/unsafe, non-transparent, overreliance. Match mitigations to harm (disclaimers + sources for inaccurate; escalation for unsafe); collect feedback with **specific** harm categories.

## Learn more
| Topic | How to find |
|---|---|
| Grounded guidance per foundation | MCP `fluent_design_guidance` (`topic` = a heading above, or `all`) |
| Exact token values | `fluent-design-tokens` skill · MCP `fluent_list_tokens` / `fluent_get_token` |
| Design-language pages | `https://fluent2.microsoft.design/design-principles` · `/color` · `/typography` · `/layout` · `/elevation` · `/shapes` · `/iconography` · `/motion` · `/material` · `/accessibility` · `/content-design` |
| Guideline guides | `https://fluent2.microsoft.design/handoffs` · `/onboarding` · `/wait-ux` · `/responsible-AI` · `/ai-harm` |
| Official docs | `microsoft_docs_search(query="Fluent 2 design language color typography")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
