import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '../util.js';

const CHECKLIST = `# Fluent 2 accessibility checklist (WCAG 2.1 AA)

Contrast
- Text contrast >= 4.5:1 (large/bold >= 3:1); non-text/UI (icons, borders, focus, state) >= 3:1.
- Never convey meaning by color alone — pair with text/icon/shape.

Focus & keyboard
- Every interactive control shows the Fluent focus indicator (don't remove :focus-visible).
- Logical focus order; manage + restore focus for Dialog/Menu/Popover and Copilot messages.
- Fully keyboard operable (Tab/Shift+Tab, Enter/Space, arrow keys in Menu/TabList/RadioGroup); no unintended traps.

Names, roles, structure
- Label every control (Label/Field, aria-label/aria-labelledby); icon-only buttons need an accessible name.
- Prefer real Fluent components so roles/semantics come for free; use headings/landmarks for structure.

Targets, zoom, motion
- Interactive targets >= 24x24px (prefer 32-40px for touch).
- Support 200% zoom / reflow; don't disable text resize.
- Honor prefers-reduced-motion; use Fluent duration/easing tokens.

Theming
- Wrap web apps in FluentProvider; support light, dark, and Windows High Contrast (forced-colors) — don't hardcode colors that break HC.
- Set dir for RTL.

Per surface
- Web: Griffel makeStyles + tokens; Field wires label + error + aria-describedby.
- Power BI: keep dataColors accessible vs background; readable textClasses.
- Power Apps: modern controls + App.Theme; test WCAG 2.1 AA on desktop + mobile.
- PCF: FluentProvider with context.fluentDesignLanguage.tokenTheme; re-wrap portaled surfaces.
- Power Pages: Fluent token CSS variables; sufficient contrast on Bootstrap components.

Test
- Automated: axe / Accessibility Insights for Web (FastPass).
- Manual: keyboard-only; screen reader (Narrator/NVDA/VoiceOver); 200% zoom; High Contrast; color-blind check.`;

export function registerAccessibility(server: McpServer): void {
  server.registerTool(
    'fluent_accessibility_checklist',
    {
      title: 'Fluent 2 accessibility checklist',
      description:
        'Return the Fluent 2 accessibility checklist (contrast, focus, keyboard, target size, names/roles, high contrast, reduced motion, per-surface notes) to self-review a UI against WCAG 2.1 AA.',
      inputSchema: {
        surface: z
          .enum(['web', 'powerbi', 'powerapps', 'powerpages', 'pcf', 'all'])
          .optional()
          .describe('Optional surface filter (informational; full checklist is returned).'),
      },
    },
    async () => textResult(CHECKLIST)
  );
}
