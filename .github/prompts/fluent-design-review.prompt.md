---
mode: agent
description: 'Audit the current file/selection against Fluent 2 and accessibility, with concrete fixes.'
---
Review the selected code against Fluent 2 using the `fluent-design-review` skill and the `fluent-ui` MCP tools.

Check for:
- Hardcoded values that duplicate tokens → give the correct `tokens.*` (verify with `fluent_get_token`).
- Missing `FluentProvider` / theming; light + dark + high-contrast support.
- Misused or custom-reimplemented components (cross-check with `fluent_get_component`).
- Accessibility issues (run `fluent_accessibility_checklist`).

Report findings grouped **Blocker / Should-fix / Polish**, each with the exact fix. Offer to implement via the relevant builder agent.
