import { z } from 'zod';
import { textResult } from '../util.js';
function reactApp(name) {
    return `import * as React from 'react';
import {
  FluentProvider, webLightTheme, webDarkTheme,
  makeStyles, tokens, Card, CardHeader, Text, Button,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex', flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingHorizontalXXL,
  },
  card: { maxWidth: '420px', rowGap: tokens.spacingVerticalM },
});

function ${name}() {
  const s = useStyles();
  return (
    <div className={s.root}>
      <Card className={s.card}>
        <CardHeader header={<Text weight="semibold">Hello Fluent 2</Text>} />
        <Text>Built with Fluent UI React v9 and design tokens.</Text>
        <Button appearance="primary">Get started</Button>
      </Card>
    </div>
  );
}

export default function App() {
  // Swap webLightTheme -> webDarkTheme for dark mode, or a brand theme from fluent_generate_theme.
  return (
    <FluentProvider theme={webLightTheme}>
      <${name} />
    </FluentProvider>
  );
}`;
}
function reactForm(name) {
    return `import * as React from 'react';
import {
  FluentProvider, webLightTheme, makeStyles, tokens,
  Field, Input, Textarea, Button,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, maxWidth: '360px' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, marginTop: tokens.spacingVerticalS },
});

function ${name}() {
  const s = useStyles();
  return (
    <form className={s.form} onSubmit={(e) => e.preventDefault()}>
      <Field label="Name" required>
        <Input name="name" />
      </Field>
      <Field label="Message" hint="Tell us more">
        <Textarea name="message" />
      </Field>
      <div className={s.actions}>
        <Button appearance="primary" type="submit">Submit</Button>
        <Button appearance="secondary" type="reset">Reset</Button>
      </div>
    </form>
  );
}

export default function App() {
  return <FluentProvider theme={webLightTheme}><${name} /></FluentProvider>;
}`;
}
function reactCard(name) {
    return `import * as React from 'react';
import {
  FluentProvider, webLightTheme, makeStyles, tokens,
  Card, CardHeader, CardPreview, CardFooter, Text, Caption1, Button,
} from '@fluentui/react-components';

const useStyles = makeStyles({
  card: { maxWidth: '320px', rowGap: tokens.spacingVerticalM },
});

export function ${name}() {
  const s = useStyles();
  return (
    <Card className={s.card}>
      <CardHeader
        header={<Text weight="semibold">Fluent 2 card</Text>}
        description={<Caption1>Composed from Fluent slots</Caption1>}
      />
      <CardPreview>
        <img
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='160'%3E%3Crect width='320' height='160' fill='%23e0e0e0'/%3E%3C/svg%3E"
          alt=""
        />
      </CardPreview>
      <CardFooter>
        <Button appearance="primary">Open</Button>
        <Button appearance="subtle">Dismiss</Button>
      </CardFooter>
    </Card>
  );
}

export default function App() {
  return <FluentProvider theme={webLightTheme}><${name} /></FluentProvider>;
}`;
}
function copilotChat() {
    return `// npm i @fluentui-copilot/react-copilot @fluentui/react-components
// Exact component names live in the Storybook (https://ai.fluentui.dev);
// verify with the fluent_get_component MCP tool (category: AI / Copilot).
import * as React from 'react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CopilotProvider, CopilotChat } from '@fluentui-copilot/react-copilot';

export default function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <CopilotProvider>
        <CopilotChat>
          {/* Compose UserMessage + CopilotMessage + Suggestions + PromptStarters here.
              Always show the AI-generated disclaimer and, when grounded, citations. */}
        </CopilotChat>
      </CopilotProvider>
    </FluentProvider>
  );
}`;
}
function webComponents() {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <!-- npm i @fluentui/web-components  (Fluent Web Components v3) -->
  <script type="module">
    import { setTheme } from '@fluentui/web-components';
    import { webLightTheme } from '@fluentui/tokens';
    setTheme(webLightTheme); // swap for webDarkTheme for dark mode
  </script>
</head>
<body>
  <fluent-card>
    <fluent-text weight="semibold">Hello Fluent 2</fluent-text>
    <fluent-button appearance="primary">Get started</fluent-button>
  </fluent-card>
</body>
</html>`;
}
export function registerCode(server) {
    server.registerTool('fluent_generate_code', {
        title: 'Generate Fluent 2 web code',
        description: 'Scaffold Fluent 2 web code (React v9 or Web Components): an app shell with FluentProvider, a themed form, a card, or a Copilot chat starter. Uses makeStyles + tokens — no hardcoded values.',
        inputSchema: {
            kind: z.enum(['app', 'form', 'card', 'copilot-chat']).default('app'),
            framework: z.enum(['react', 'webcomponents']).default('react'),
            componentName: z
                .string()
                .regex(/^[A-Za-z][A-Za-z0-9]*$/)
                .default('MyComponent')
                .describe('PascalCase component name (React kinds).'),
        },
    }, async ({ kind, framework, componentName }) => {
        if (framework === 'webcomponents') {
            return textResult('<!-- Fluent 2 Web Components v3 starter -->\n' + webComponents());
        }
        let code;
        switch (kind) {
            case 'form':
                code = reactForm(componentName);
                break;
            case 'card':
                code = reactCard(componentName);
                break;
            case 'copilot-chat':
                code = copilotChat();
                break;
            default:
                code = reactApp(componentName);
        }
        return textResult('// Fluent 2 (React v9) starter\n' + code);
    });
}
