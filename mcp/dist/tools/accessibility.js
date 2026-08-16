import { z } from 'zod';
import { textResult } from '../util.js';
const CHECKLIST = `# Fluent 2 accessibility checklist (WCAG 2.1 AA, with current WCAG 2.2 AA additions)

Fluent 2 components meet or surpass WCAG 2.1 AA. The items below also fold in the WCAG 2.2 AA criteria (2023-10-05) that apply to modern web and Copilot surfaces.

Contrast
- Text contrast >= 4.5:1; large text (>18.66px bold or >24px regular) >= 3:1; non-text/UI (icons, borders, focus, state) >= 3:1.
- Never convey meaning by color alone; pair with text/icon/shape.

Focus & keyboard
- Every interactive control shows the Fluent focus indicator (don't remove :focus-visible). Aim for a focus indicator with >= 2px perimeter and >= 3:1 contrast against adjacent colors (WCAG 2.2 2.4.13 Focus Appearance).
- Upstream warning: "A bad focus indicator can have serious accessibility consequences and can render your experience unusable by certain user." (concepts-developer-accessibility-focus-indicator--docs)
- Logical focus order; manage + restore focus for Dialog/Menu/Popover and Copilot messages (focus must not be lost after a temporary surface closes).
- A focused control must not be entirely hidden by author content such as a sticky header/footer or a sticky Copilot input bar (WCAG 2.2 2.4.11 Focus Not Obscured).
- Fully keyboard operable (Tab/Shift+Tab, Enter/Space, arrow keys in Menu/TabList/RadioGroup); no unintended traps.

Don't hand-roll focus - use the v9 focus API (tabster/keyborg), all exported from @fluentui/react-components
- useArrowNavigationGroup({ axis: 'vertical' | 'horizontal' | 'grid' | 'grid-linear' | 'both', circular, memorizeCurrent, tabbable }) - arrow-key navigation inside a composite; spread the returned attributes on the container. Elements with tabindex="-1" are skipped.
- useFocusableGroup({ tabBehavior: 'unlimited' | 'limited' | 'limited-trap-focus' }) - a focusable container that itself contains focusable children (Enter goes in, Escape comes out).
- useFocusFinders() -> findAllFocusable / findFirstFocusable / findLastFocusable / findNextFocusable / findPrevFocusable. Never query focusables with your own querySelectorAll.
- useModalAttributes({ trapFocus, legacyTrapFocus, alwaysFocusable }) -> { modalAttributes, triggerAttributes }. Prefer Dialog/Popover; only reach for this in a custom modal. Pass legacyTrapFocus: true when the modal must not leak focus out of an iframe.
- useRestoreFocusTarget() (the trigger you want focus to come back to) + useRestoreFocusSource() (the element that may be removed). The target must have been focused at least once.
- useObservedElement(name) + useFocusObserved(name, { timeout }) - focus an element by name even if it has not mounted yet.
- useUncontrolledFocus() - fence off a region driven by another focus framework (for example v8 FocusZone/FocusTrapZone).
- Focus indicator styling: createFocusOutlineStyle({ selector: 'focus' | 'focus-within', style }) renders via ::after, so the element needs position: relative; it already includes a forced-colors branch. createCustomFocusIndicatorStyle(style) does NOT remove the default outline - add ':focus-visible': { outlineStyle: 'none' } yourself.
- useKeyboardNavAttribute<E>() returns a REF (not attributes) and sets data-keyboard-nav on the element only while the user is navigating with the keyboard - use it to style keyboard-only affordances without re-rendering.

Announcements (screen readers)
- Mount <AriaLiveAnnouncer> once at the app root, then useAnnounce() -> announce(message, { polite, priority, batchId }) for state changes that don't move focus (save/undo/validation/streamed Copilot output).
- useTypingAnnounce() -> { typingAnnounce, inputRef } waits ~0.5s after typing stops so a screen reader isn't interrupted mid-keystroke; reuse a batchId so only the last message in a burst is read.
- Don't hand-roll an aria-live div; the announcer owns the timing and dedupe.

Names, roles, structure
- Label every control (Label/Field, aria-label/aria-labelledby); icon-only buttons need an accessible name.
- Prefer real Fluent components so roles/semantics come for free; use logical heading order and landmarks for structure; follow the WAI-ARIA authoring practices.

Targets, pointer, zoom, motion
- Interactive targets >= 24x24 CSS px (prefer 32-40px for touch) (WCAG 2.2 2.5.8 Target Size Minimum).
- Any drag operation (for example reordering attachments or list items) needs a single-pointer, non-dragging alternative such as a click or keyboard action (WCAG 2.2 2.5.7 Dragging Movements).
- Support reflow to 400% zoom without horizontal scrolling (design down to a 320px breakpoint) AND text zoom to 200% without clipping; don't disable text resize.
- Honor prefers-reduced-motion, offer a no-motion setting, and use ARIA live regions for information otherwise conveyed by motion; use Fluent duration/easing tokens; avoid content that flashes more than three times per second.

Rich media & content
- Provide descriptive alt text for meaningful images; make captions customizable (or ensure sufficient caption contrast).
- Use plain, concise language.

Flows & auth (WCAG 2.2)
- Don't force users to memorize or re-enter information they already provided; support paste and password managers in auth (2.5.8 targets, 3.3.7 Redundant Entry, 3.3.8 Accessible Authentication). Keep help affordances in a consistent place (3.2.6 Consistent Help).

Theming
- Wrap web apps in FluentProvider; support light, dark, and Windows High Contrast (forced-colors); don't hardcode colors that break HC.
- Set dir for RTL.

Per surface
- Web: Griffel makeStyles + tokens; Field wires label + error + aria-describedby.
- Power BI: keep dataColors accessible vs background; readable textClasses.
- Power Apps: modern controls + App.Theme; test WCAG 2.1 AA on desktop + mobile.
- PCF: FluentProvider with context.fluentDesignLanguage.tokenTheme; re-wrap portaled surfaces.
- Power Pages: Fluent token CSS variables; sufficient contrast on Bootstrap components.
- Copilot/AI: LatencyLoader must announce a busy/live state; ResponseCount status must not rely on color alone; FeedbackButtons need per-button accessible names.

Test
- Automated: axe / Accessibility Insights for Web (FastPass). Upstream validates components with axe-core at development and build time.
- Manual: keyboard-only; screen reader (Narrator/NVDA/VoiceOver); 400% reflow + 200% text zoom; High Contrast; color-blind check.

Sources
- https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-overview--docs
- https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-focus-indicator--docs
- https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-notification-best-practices--docs
- https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-theming--docs (do NOT ship a hardcoded High Contrast theme)
- Full focus-management API, option tables and snippets: skills/fluent-accessibility/references/focus-management.md`;
export function registerAccessibility(server) {
    server.registerTool('fluent_accessibility_checklist', {
        title: 'Fluent 2 accessibility checklist',
        description: 'Return the Fluent 2 accessibility checklist (contrast, focus, keyboard, the v9 focus-management API (tabster hooks, focus indicators, AriaLiveAnnouncer), target size, names/roles, high contrast, reduced motion, per-surface notes) to self-review a UI against WCAG 2.1 AA.',
        inputSchema: {
            surface: z
                .enum(['web', 'powerbi', 'powerapps', 'powerpages', 'pcf', 'all'])
                .optional()
                .describe('Optional surface filter (informational; full checklist is returned).'),
        },
    }, async () => textResult(CHECKLIST));
}
