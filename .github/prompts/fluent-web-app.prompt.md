---
mode: agent
description: 'Scaffold a Fluent 2 (React v9) web UI with FluentProvider, design tokens, and accessible components.'
---
Build a Fluent 2 web UI for: ${input:requirement:What should the UI do?}

Requirements:
- Use `@fluentui/react-components` (v9); wrap the app in `FluentProvider` (`webLightTheme`, with a dark-mode toggle).
- Style with Griffel `makeStyles` + `tokens.*` — no hardcoded colors/sizes.
- Use the `fluent-ui` MCP tools (`fluent_get_component`, `fluent_get_token`, `fluent_generate_code`) and load the `fluent-web-ui` + `fluent-theming` skills.
- Verify accessibility with `fluent_accessibility_checklist`.

Deliver the component code plus a short note on which components and tokens you used.
