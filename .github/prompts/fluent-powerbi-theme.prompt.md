---
mode: agent
description: 'Generate a Fluent 2-aligned Power BI theme and optionally scaffold a PBIP/PBIR report.'
---
Create a Fluent 2 Power BI theme for brand color ${input:brand:#0F6CBD}.

- Use the `fluent_generate_powerbi_theme` MCP tool; ensure the theme JSON is schema-valid (dataColors, textClasses, `visualStyles` visual defaults).
- If the user wants a project, scaffold a PBIP/PBIR report with `fluent_scaffold_pbip` (pass the same brand color).
- Load the `fluent-powerbi-theme` + `fluent-pbip-report` skills.
- Explain how to apply the theme in Power BI Desktop (View ▸ Themes ▸ Browse) and which visual defaults were set.
