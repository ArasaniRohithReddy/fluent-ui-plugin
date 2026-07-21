# Fluent 2 coverage report (sitemap-verified)

**Method:** every route in the official **https://fluent2.microsoft.design** site was enumerated from the site's own **`sitemap-0.xml` (114 routes)** and cross-checked against this plugin's data (`mcp/data/*.json`), skills, and MCP tools. Gated pages (AI components + the "Working with AI" guidance) were captured via an **authenticated** employee sign-in pass. Every page's **images** were inventoried and, where the page shipped diagrams with empty `alt` text, read with **vision OCR**. This is a verification of *actual* coverage, not an estimate. Last run: **2026-07-21**.

## Site total: 114 routes = 83 component + 31 content

| Route group | On the site | Status | How it's covered |
|---|---|:---:|---|
| **Web components** (React v9) | 62 (47 core + 14 AI + 1 index) | **✅ 61/61 buildable** | `fluent-components-usage.json` (deep usage: when-to-use, anatomy, types, states, behavior, accessibility, do/don't, sections, images) **+** `fluent-components.json` (real props/imports) → `fluent_get_component`, `fluent_search_components`, `fluent_generate_code` |
| **Design language** topics | 9 | **✅ 9/9** | `design-guidance.json` + `fluent_design_guidance` + `fluent-design-language` skill |
| **UX frameworks & guidelines** | 6 | **✅ 6/6** | accessibility · content design · **design tokens** · handoffs · onboarding · wait UX |
| **Working with AI** | 7 | **✅ 7/7** | content engineering · responsible AI · AI harms · **entry points** · **personality principles** · **copilot errors** · **data usage & sharing** |
| **Web tokens reference** | 2 (`color-tokens`, `color-tokens2`) | **✅** | `fluent-tokens.json` (366 color tokens × light/dark/HC + type/spacing/radius/stroke/shadow/motion) → `fluent_list_tokens`, `fluent_get_token` |
| **Get started → develop** | 1 | **✅** | install `@fluentui/react-components`, `FluentProvider`, Web Components — `fluent-web-ui` skill + README/`hosts/` |
| **Get started → design / whatisnew / contribute / gethelp** | 4 | ⚪ out of scope | Figma UI-kit + design-system meta (not code-generation) |
| **Component roadmap** | 1 | ⚪ out of scope | lifecycle/roadmap meta |
| **Native components** — iOS (12), Android (5), Windows/RN (index) | 21 | ⚪ out of scope | separate native SDKs (Fluent Apple / Fluent Android / WinUI). Cross-platform **design language IS covered**; native code-gen is a future extension. |

**Totals covered on-mission:** 61 web components · 22 design/UX/AI topics · full web token system · dev setup — **100% of the plugin's Web + Power BI + Power Platform mission surface.**

## Deep content + image coverage (this pass)

Every component and topic page was re-parsed to full depth (subsection headings, body text, ordered sections) and **every image was captured** — then indexed with its real URL so agents can hand users direct links:

- **705 documented media items**, **100% with descriptive `alt` and a direct URL** — **688 images** (410 on component pages + 278 on topic pages) + **17 Motion demo videos** (`.mp4`).
- Served by the **`fluent_get_images`** MCP tool (`fluent-images.json`): ask for a component/topic + kind (anatomy, do/don't, state, type, layout, video…) and it returns the real CDN URLs + markdown embeds + source doc pages — so an agent can *show* a diagram, not just describe it.
- **233 of the images were empty-`alt` diagrams** on the site (anatomy diagrams, do/don't pairs, flow diagrams) that HTML parsing alone drops entirely. These were recovered with **vision OCR** (Opus-4.8 sub-agents): 110 core-component + 22 AI-component + 101 topic-page diagrams.
- **29 oversized diagrams** (e.g. 2048×2048 hero illustrations, 2.6–5.6 MB) that exceed the vision request size limit were **downscaled and re-read one-at-a-time** so none were silently dropped. Anatomy call-outs recovered this way include **Card** (header/preview/footer), **Message bar** (title/body/dismiss/hyperlink/action), **Progress bar** (label/description), and **Entity cards** (title/metadata/reason-marker/actions).

**Tokens verified (7/7 categories):** color (brand ramp + semantic light/dark/high-contrast) · typography (type ramp) · spacing · borderRadius · strokeWidth · shadow · motion (durations + curves).

## Core web components — 47/47 ✅
Accordion · Avatar · Avatar group · Badge · Breadcrumb · Button · Card · Carousel · Checkbox · Combobox · Dialog · Divider · Drawer · Dropdown · Field · Fluent provider · Icon · Image · Info label · Input · Label · Link · List · Menu · Message bar · Nav · Persona · Popover · Progress bar · Radio group · Rating · Searchbox · Select · Skeleton · Slider · Spin button · Spinner · Switch · Tablist · Tag · Tag picker · Text · Textarea · Toast · Toolbar · Tooltip · Tree

## AI / Copilot components — 14/14 ✅
Chat input (+ Attachment, + Suggestions) · Chat output (+ Citations and references, + Copilot message, + Sensitivity, + Timestamp, + User message) · Copilot FRE · Entity cards · Ghost text · Prompt starters · System message

*(Guidance captured from the gated design pages; APIs linked to the public `@fluentui-copilot/*` packages — noted as internal-preview.)*

## Design language, UX & AI topics — 22/22 ✅
**Design language (9):** Design principles · Color · Elevation · Iconography · Layout · Material · Motion · Shapes · Typography
**UX frameworks & guidelines (6):** Accessibility · Content design · Design tokens · Handoffs · Onboarding · Wait UX
**Working with AI (7):** Content engineering · Responsible AI · Types of AI harm · Entry points · Personality principles · Copilot errors · Data usage & sharing

## Scope note — native platforms & meta pages
The site offers a platform switcher for **Web / iOS / Android / Windows**. This plugin targets **Web** (Fluent UI React v9 + Web Components) with **Power BI** and **Power Platform** — where Fluent 2 web/product development happens. The **iOS / Android / Windows** catalogs are separate *native* SDKs (Fluent UI Apple, Fluent UI Android, WinUI) and are intentionally out of scope; the cross-platform **design language** (color, type, motion, tokens, principles, responsible-AI) **is** covered and applies to them. Design-system meta pages (Figma UI-kit onboarding, what's-new, contribution guide, component roadmap) are likewise out of scope for a code-generation plugin.

## How to reproduce this verification
1. Fetch `https://fluent2.microsoft.design/sitemap-0.xml` → 114 routes (authenticate for `/components/web/react/ai/*` and the "Working with AI" guidance pages).
2. Compare the live component/topic/token inventory to `mcp/data/fluent-components-usage.json`, `mcp/data/fluent-components.json`, `mcp/data/design-guidance.json`, and `mcp/data/fluent-tokens.json`.
3. Confirm every on-mission route resolves via `fluent_get_component` / `fluent_design_guidance` / `fluent_get_token`.
4. Confirm every documented image carries descriptive `alt` (no empty `alt` remains in the data).
