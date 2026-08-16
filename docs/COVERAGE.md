# Fluent 2 coverage report (sitemap-verified)

**Method:** every route in the official **https://fluent2.microsoft.design** site was enumerated from the site's own **`sitemap-0.xml`** and cross-checked against this plugin's data (`mcp/data/*.json`), skills, and MCP tools. Every page's **images** were inventoried and, where the page shipped diagrams with empty `alt` text, read with **vision OCR**. This is a verification of *actual* coverage, not an estimate.

**Re-audited at content level on 2026-08-08.** Route counts alone are not enough: a page can gain content without the sitemap changing. This pass diffed the *body* of all 132 routes, not just their URLs. No route was added, removed or renamed since the first pass, and no upstream prose or table had drifted — but the re-audit found four defects **in our own extraction** (mis-sorted responsible-AI do/don't pairs, silently dropped markdown tables, garbled `card.accessibility` prose, and 13 missing content-engineering pages). All are fixed. Note that the earlier figure of 114 routes undercounted the sitemap; the true total is **132**.

**Access note:** 25-26 routes now sit behind Microsoft's employee sign-in, including all 14 AI component pages. Topics captured before they were gated are flagged `accessStatus: employee-gated` with a `capturedAt` date, so stale content is visible rather than silently trusted.

## Site total: 132 routes

| Route group | On the site | Status | How it's covered |
|---|---|:---:|---|
| **Web components** (React v9) | 62 routes (47 core + 14 AI + 1 index) | **✅ 61/61 components** | `fluent-components-usage.json` (deep usage: when-to-use, anatomy, types, states, behavior, accessibility, do/don't, sections, images) **+** `fluent-components.json` (real props/imports) → `fluent_get_component`, `fluent_search_components`, `fluent_generate_code` |
| **Design language** topics | 9 | **✅ 9/9** | `design-guidance.json` + `fluent_design_guidance` + `fluent-design-language` skill |
| **UX frameworks & guidelines** | 6 | **✅ 6/6** | accessibility · content design · **design tokens** · handoffs · onboarding · wait UX |
| **Working with AI** | 8 | **✅ 8/8** | content engineering · **evaluating output quality** · responsible AI · AI harms · **entry points** · **personality principles** · **copilot errors** · **data usage & sharing** |
| **Content engineering** | 13 | **✅ 13/13** | added by the 2026-08-08 content-level re-audit → `design-guidance.json` + `fluent_design_guidance` |
| **Web tokens reference** | 2 (`color-tokens`, `color-tokens2`) | **✅** | `fluent-tokens.json` (366 color tokens × light/dark/HC + type/spacing/radius/stroke/shadow/motion) → `fluent_list_tokens`, `fluent_get_token` |
| **Get started → develop** | 1 | **✅** | install `@fluentui/react-components`, `FluentProvider`, Web Components — `fluent-web-ui` skill + README/`hosts/` |
| **Get started → design / whatisnew / contribute / gethelp** | 4 | ◐ partly | design-system meta (not code-generation). The **Figma** half *is* covered: `figma.json` → `fluent_figma_guidance` + the `fluent-figma` skill (Fluent UI-kit tiers, Figma MCP server, variable→token mapping, per-seat rate limits). |
| **Component roadmap** | 1 | ⚪ out of scope | lifecycle/roadmap meta |
| **Native components** — iOS (12), Android (5), Windows/RN (index) | 21 | **✅ covered, and extended past the site** | The site publishes only 17 native component pages, so the native index is built from the SDKs themselves: **155 components** (iOS 30 · Android 48 · Windows 77) with real type names, imports/namespaces and framework kinds → `fluent_native_component`, `fluent_native_guidance` + the `fluent-native` skill and `fluent-native-engineer` agent. |

> The rows above enumerate the site's **content** groups and do not attempt to list every navigational index/landing route in the sitemap, so they are not expected to sum to 132.

**Totals covered on-mission:** 61 web components · 36 design/UX/AI/content-engineering topics · full web token system · dev setup — **every on-mission route resolves through a tool.** What is left is design-system meta (what's-new, contribution guide, component roadmap), which a code-generation plugin has nothing to generate from.

## Beyond the site — what the plugin covers that fluent2.microsoft.design does not

The Fluent 2 site is the design source of truth, but it is not the whole job. Three areas are grounded in the shipping libraries instead, and are measured against the data files, not the sitemap:

| Area | Grounded in | Size | Served by |
|---|---|---|:--|
| **Native platforms** | `fluentui-apple`, `fluentui-android`, `microsoft-ui-xaml` + the in-box WPF Fluent theme | **155 components** — iOS 30 · Android 48 · Windows 77, each with its real type name, import/namespace and framework kind (`swiftui`/`uikit`, `compose`/`view`, `winui3`/`winui2`/`wpf`) | `fluent_native_component`, `fluent_native_guidance` · `fluent-native` skill · `fluent-native-engineer` agent |
| **Fluent 1 (v8)** | `@fluentui/react@8.125.7` against the `@fluentui/react-components@9.74.5` baseline | **106 components**, **26 collisions** where v8 and v9 export the *same name* for different things (so a wrong import compiles and then misbehaves), plus 22 traps and a 180-entry export index | `fluent_v8_lookup`, `fluent_v8_guidance` · `fluent-v8` skill |
| **Figma → code** | Figma's own MCP server docs + the Fluent Figma UI kits | 2 server modes (remote/desktop), 14 per-host config shapes, entitlement + rate-limit matrix, Figma-variable → Fluent-token mapping | `fluent_figma_guidance` · `fluent-figma` skill |

Why this matters: the site publishes 17 native component pages, and nothing at all about the v8/v9 name collisions. Both are exactly where an assistant that guesses produces code that compiles and is wrong.

## Deep content + image coverage (this pass)

Every component and topic page was re-parsed to full depth (subsection headings, body text, ordered sections) and **every image was captured** — then indexed with its real URL so agents can hand users direct links:

- **753 documented media items**, **every one carrying a non-empty `alt` and a direct URL** — **736 images** (458 on component pages + 278 on topic pages) + **17 Motion demo videos** (`.mp4`). 92 of them are do/don't pairs.
- Served by the **`fluent_get_images`** MCP tool (`fluent-images.json`): ask for a component/topic + kind (anatomy, do/don't, state, type, layout, video…) and it returns the real CDN URLs + markdown embeds + source doc pages — so an agent can *show* a diagram, not just describe it.
- Many of the site's diagrams (anatomy diagrams, do/don't pairs, flow diagrams) ship with **empty `alt`** and are dropped entirely by HTML parsing alone. Those were read with **vision OCR** (Opus-4.8 sub-agents) and given a written description; **65 items** additionally carry `ocrText` — the literal on-screen copy inside the image, which on the Responsible AI and content-design pages *is* the guidance.
- **Oversized diagrams** (2048×2048 hero illustrations, several MB) exceed the vision request size limit and were **downscaled and re-read one-at-a-time** so none were silently dropped. Anatomy call-outs recovered this way include **Card** (header/preview/footer), **Message bar** (title/body/dismiss/hyperlink/action), **Progress bar** (label/description), and **Entity cards** (title/metadata/reason-marker/actions).

**Tokens verified (7/7 categories):** color (brand ramp + semantic light/dark/high-contrast) · typography (type ramp) · spacing · borderRadius · strokeWidth · shadow · motion (durations + curves).

## Core web components — 47/47 ✅
Accordion · Avatar · Avatar group · Badge · Breadcrumb · Button · Card · Carousel · Checkbox · Combobox · Dialog · Divider · Drawer · Dropdown · Field · Fluent provider · Icon · Image · Info label · Input · Label · Link · List · Menu · Message bar · Nav · Persona · Popover · Progress bar · Radio group · Rating · Searchbox · Select · Skeleton · Slider · Spin button · Spinner · Switch · Tablist · Tag · Tag picker · Text · Textarea · Toast · Toolbar · Tooltip · Tree

## AI / Copilot components — 14/14 ✅
Chat input (+ Attachment, + Suggestions) · Chat output (+ Citations and references, + Copilot message, + Sensitivity, + Timestamp, + User message) · Copilot FRE · Entity cards · Ghost text · Prompt starters · System message

*(Guidance captured from the gated design pages; APIs linked to the public `@fluentui-copilot/*` packages — noted as internal-preview.)*

## Design language, UX & AI topics — 36/36 ✅
**Design language (9):** Design principles · Color · Elevation · Iconography · Layout · Material · Motion · Shapes · Typography
**UX frameworks & guidelines (6):** Accessibility · Content design · Design tokens · Handoffs · Onboarding · Wait UX
**Working with AI (8):** Content engineering · Evaluating output quality · Responsible AI · Types of AI harm · Entry points · Personality principles · Copilot errors · Data usage & sharing
**Content engineering (13):** the dedicated content-engineering set added by the 2026-08-08 content-level re-audit, which the original route-count pass had missed entirely.

## Scope note — native platforms & meta pages
The site offers a platform switcher for **Web / iOS / Android / Windows**. **Web** (Fluent UI React v9 + Web Components) with **Power BI** and **Power Platform** is the primary surface — but the **native platforms are no longer out of scope**. The plugin ships a `fluent-native-engineer` agent, a `fluent-native` skill and two MCP tools over a **155-component** native index (iOS 30 · Android 48 · Windows 77) built from the SDK sources themselves — `fluentui-apple`, `fluentui-android`, `microsoft-ui-xaml` and the in-box WPF Fluent theme — because the site itself publishes only 17 native component pages. That index also records which generation is current versus frozen (WinUI 3 vs maintenance-only WinUI 2; Android's Fluent 1 Views and Fluent 2 Compose shipping inside the *same* Maven artifacts, split only by Kotlin package), which is the part that cannot be inferred from the web API. The cross-platform **design language** (color, type, motion, tokens, principles, responsible-AI) is covered and applies to every platform. Design-system meta pages (what's-new, contribution guide, component roadmap) remain out of scope for a code-generation plugin; the Figma UI-kit half of "Get started → design" is covered by `fluent_figma_guidance`.

## How to reproduce this verification
1. Fetch `https://fluent2.microsoft.design/sitemap-index.xml`, then `sitemap-0.xml` → 132 routes. Plain `/sitemap.xml` 404s. Around 25 routes, including every `/components/web/react/ai/*` page, now require an employee sign-in.
2. Compare the live component/topic/token inventory to `mcp/data/fluent-components-usage.json`, `mcp/data/fluent-components.json`, `mcp/data/design-guidance.json`, and `mcp/data/fluent-tokens.json`.
3. Confirm every on-mission route resolves via `fluent_get_component` / `fluent_design_guidance` / `fluent_get_token`.
4. Confirm every documented image carries descriptive `alt` (no empty `alt` remains in the data).
5. Diff page **bodies**, not just URLs. Counting routes cannot detect content added to an existing page, which is how the 13 content-engineering pages were missed the first time.
