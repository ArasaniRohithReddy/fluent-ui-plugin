---
name: fluent-web-ui
description: Build web UIs with Fluent UI React v9 (@fluentui/react-components) and Fluent Web Components v3 (@fluentui/web-components) — project setup, FluentProvider, Griffel makeStyles + tokens, component composition, and icons. Use for any Fluent 2 web app, page, or component.
---

# Fluent 2 web UI (React v9 + Web Components v3)

Fluent UI React v9 (`@fluentui/react-components`) is the code implementation of Fluent 2. Build with real components + design tokens; the framework brings accessibility and theming.

## Setup
```bash
npm install @fluentui/react-components @fluentui/react-icons
```
Wrap the app once in `FluentProvider` (see `fluent-theming`). Look up components with the `fluent_search_components` / `fluent_get_component` MCP tools and tokens with `fluent_list_tokens` / `fluent_get_token`. Scaffold with `fluent_generate_code`.

## Styling — Griffel `makeStyles` + `tokens`
```tsx
import { makeStyles, tokens, Button, Card, Text } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL },
});

export function Panel() {
  const s = useStyles();
  return (
    <Card className={s.root}>
      <Text weight="semibold">Fluent 2</Text>
      <Button appearance="primary">Save</Button>
    </Card>
  );
}
```
- **No inline hardcoded colors/sizes** — use `tokens.*`. Compose with `mergeClasses` for conditional styles.
- Use **slots** (e.g. `Button icon=`, `CardHeader header=`, `Field label=`) instead of custom markup.
- Layout with fl/grid + spacing tokens; radius via `tokens.borderRadius*`; elevation via `tokens.shadow*`.

## Components (highlights)
Actions: `Button`, `MenuButton`, `SplitButton`, `ToggleButton`, `CompoundButton`, `Link`. Forms: `Field`, `Input`, `Textarea`, `Combobox`, `Dropdown`, `Select`, `SpinButton`, `Slider`, `Checkbox`, `Radio/RadioGroup`, `Switch`. Data/display: `Text`, `Persona`, `Avatar`, `Badge`, `Card`, `Table`, `DataGrid`, `Tree`, `Tag`. Navigation: `TabList`, `Breadcrumb`, `Menu`, `Nav`, `Toolbar`. Overlays/status: `Dialog`, `Drawer`, `Popover`, `Tooltip`, `Toast`/`Toaster`, `MessageBar`, `ProgressBar`, `Spinner`, `Skeleton`. Use `fluent_get_component` for exact props + samples.

## Icons
```tsx
import { AddRegular, SaveFilled } from '@fluentui/react-icons';
<Button icon={<AddRegular />}>Add</Button>
```

## Copilot / AI surfaces
Use the `fluent-ai-copilot-ui` skill + `@fluentui-copilot/react-copilot` for chat input, Copilot messages, suggestions, prompt starters, and citations.

## Web Components v3 (framework-agnostic)
```html
<script type="module">
  import { setTheme } from '@fluentui/web-components';
  import { webLightTheme } from '@fluentui/tokens';
  setTheme(webLightTheme);
</script>
<fluent-button appearance="primary">Save</fluent-button>
```

## Always
Wrap in `FluentProvider` · style with `tokens.*` (no magic values) · pick real components (composition/slots) · verify accessibility with `fluent_accessibility_checklist` and the `fluent-accessibility` skill.

## Learn more
| Topic | How to find |
|---|---|
| Component API + samples | MCP `fluent_get_component` · `https://react.fluentui.dev` |
| Griffel (makeStyles) | `microsoft_docs_search(query="Griffel makeStyles Fluent UI v9")` |
| Fluent 2 design | `https://fluent2.microsoft.design` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
