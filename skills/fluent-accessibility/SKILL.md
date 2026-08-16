---
name: fluent-accessibility
description: Make Fluent 2 UIs accessible (WCAG 2.1 AA) — contrast, focus, keyboard, target size, names/roles, high contrast, and reduced motion. Use when building or reviewing any Fluent 2 surface (web, Power BI, Power Apps/Pages, PCF) for accessibility.
---

# Fluent 2 accessibility

Fluent 2 components are accessible **by default**, but only if you use them correctly and don't override their semantics. Target **WCAG 2.1 AA**.

> "Using components themselves does not guarantee that an application or a page will be accessible." — [Components Overview](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-overview--docs)

## The essentials
- **Contrast:** text ≥ **4.5:1** (large/bold text ≥ 3:1); non-text/UI (icons, borders, states) ≥ **3:1**. Never convey meaning by color alone — pair with text/icon/shape. Verify colors with `fluent_get_token` and a contrast check.
- **Focus:** every interactive control must show Fluent's focus indicator. Don't remove `:focus-visible`. Preserve a logical **focus order** and manage focus for dialogs/menus/Copilot messages (trap + restore) — **with the v9 focus API, not by hand**: see `references/focus-management.md`.
- **Keyboard:** everything operable with keyboard alone (Tab/Shift+Tab, Enter/Space, arrow keys within composites like `Menu`, `TabList`, `RadioGroup`). No keyboard traps (except intended modal focus).
- **Names & roles:** label every control — use `Label`/`Field` (web), `aria-label`/`aria-labelledby` where needed, and icon-only buttons need an accessible name. Prefer real Fluent components over custom markup so roles come for free.
- **Target size:** interactive targets ≥ **24×24 px** (prefer 32–40 px touch).
- **High contrast:** support Windows High Contrast / forced-colors — Fluent tokens adapt; don't hardcode colors that break it. **Do not ship a hardcoded HC theme:** *"All Fluent UI components support Windows High Contrast mode automatically regardless of the active theme… Hardcoded High Contrast themes are considered legacy"* ([Theming](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs)). Details in the `fluent-theming` skill.
- **Motion:** honor `prefers-reduced-motion`; keep motion functional, use Fluent duration/easing tokens.
- **Text:** support zoom/reflow — Fluent components are *"tested against visual inconsistencies/bugs on a zoom up to 400%"*; don't disable text resizing.
- **Announcements:** state changes that aren't focus changes need a live region — `AriaLiveAnnouncer` + `useAnnounce()` / `useTypingAnnounce()`, not a bare `aria-live` div.

## Don't hand-roll focus — v9 ships the API
Focus is handled by [tabster](https://github.com/microsoft/tabster) + [keyborg](https://github.com/microsoft/keyborg), surfaced as hooks on `@fluentui/react-components`:

| Need | Use |
|---|---|
| Arrow-key navigation in a composite | `useArrowNavigationGroup({ axis, circular, memorizeCurrent })` |
| Focusable container holding focusables | `useFocusableGroup({ tabBehavior })` |
| Find first/last/next/prev/all focusables | `useFocusFinders()` |
| Focus trap + `aria-hidden` for a custom modal | `useModalAttributes({ trapFocus, legacyTrapFocus })` — prefer `Dialog`/`Popover` |
| Focus an element by name, even before it mounts | `useObservedElement()` + `useFocusObserved()` |
| Restore focus when the focused node is removed | `useRestoreFocusTarget()` + `useRestoreFocusSource()` |
| Fence off a foreign focus framework (v8 `FocusZone`) | `useUncontrolledFocus()` |
| Keyboard-only styling hook (`data-keyboard-nav`) | `useKeyboardNavAttribute()` |
| Focus indicator styles | `createFocusOutlineStyle()` / `createCustomFocusIndicatorStyle()` |
| Screen-reader announcements | `AriaLiveAnnouncer` + `useAnnounce()` / `useTypingAnnounce()` |

> "⚠️ A bad focus indicator can have serious accessibility consequences and can render your experience unusable by certain user." — [Focus indicator](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-focus-indicator--docs)

Full API, options tables, copy-pasteable snippets and a review checklist: **`references/focus-management.md`**.

## Do it with Fluent
- Wrap web apps in `FluentProvider` (drives themed, accessible tokens incl. high contrast) and set `dir` for RTL.
- Use `Field` to wire label + validation message + `aria-describedby` automatically.
- Use the `fluent_accessibility_checklist` MCP tool to self-review before shipping.

## Test
- Automated: axe / **Accessibility Insights for Web** (FastPass). Upstream uses [axe-core](https://github.com/dequelabs/axe-core) *"to validate individual components during development and build time."*
- Manual: keyboard-only pass; screen reader (Narrator/NVDA/VoiceOver); 400% reflow + 200% text zoom; Windows High Contrast; color-blind check.

## Learn more
| Topic | How to find |
|---|---|
| Focus hooks, focus indicators, aria-live utilities | `references/focus-management.md` |
| Fluent 2 accessibility guidance | `https://fluent2.microsoft.design/accessibility` |
| Component accessibility scope (upstream) | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-overview--docs` |
| Designing an accessible experience (checklist) | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-experiences--docs` |
| Labelling components | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-component-labelling--docs` |
| Notifications & live regions (+ debugging) | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-notification-best-practices--docs` · `concepts-developer-accessibility-debugging-notifications--docs` |
| Truncation | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-truncation--docs` |
| Per-component a11y scenarios to test against | `https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-scenarios--docs` |
| WCAG 2.1 AA | `microsoft_docs_search(query="accessibility WCAG 2.1 AA requirements")` · `https://www.w3.org/TR/WCAG21/` |
| Accessibility Insights | `microsoft_docs_search(query="Accessibility Insights for Web FastPass")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
