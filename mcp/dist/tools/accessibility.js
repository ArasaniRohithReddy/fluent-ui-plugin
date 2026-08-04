import { z } from 'zod';
import { textResult } from '../util.js';
const CHECKLIST = `# Fluent 2 accessibility checklist (WCAG 2.1 AA, with current WCAG 2.2 AA additions)

Fluent 2 components meet or surpass WCAG 2.1 AA. The items below also fold in the WCAG 2.2 AA criteria (2023-10-05) that apply to modern web and Copilot surfaces.

Contrast
- Text contrast >= 4.5:1; large text (>18.66px bold or >24px regular) >= 3:1; non-text/UI (icons, borders, focus, state) >= 3:1.
- Never convey meaning by color alone; pair with text/icon/shape.

Focus & keyboard
- Every interactive control shows the Fluent focus indicator (don't remove :focus-visible). Aim for a focus indicator with >= 2px perimeter and >= 3:1 contrast against adjacent colors (WCAG 2.2 2.4.13 Focus Appearance).
- Logical focus order; manage + restore focus for Dialog/Menu/Popover and Copilot messages (focus must not be lost after a temporary surface closes).
- A focused control must not be entirely hidden by author content such as a sticky header/footer or a sticky Copilot input bar (WCAG 2.2 2.4.11 Focus Not Obscured).
- Fully keyboard operable (Tab/Shift+Tab, Enter/Space, arrow keys in Menu/TabList/RadioGroup); no unintended traps.

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
- Automated: axe / Accessibility Insights for Web (FastPass).
- Manual: keyboard-only; screen reader (Narrator/NVDA/VoiceOver); 400% reflow + 200% text zoom; High Contrast; color-blind check.`;
export function registerAccessibility(server) {
    server.registerTool('fluent_accessibility_checklist', {
        title: 'Fluent 2 accessibility checklist',
        description: 'Return the Fluent 2 accessibility checklist (contrast, focus, keyboard, target size, names/roles, high contrast, reduced motion, per-surface notes) to self-review a UI against WCAG 2.1 AA.',
        inputSchema: {
            surface: z
                .enum(['web', 'powerbi', 'powerapps', 'powerpages', 'pcf', 'all'])
                .optional()
                .describe('Optional surface filter (informational; full checklist is returned).'),
        },
    }, async () => textResult(CHECKLIST));
}
