import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

function reactApp(name: string): string {
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

function reactForm(name: string): string {
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

function reactCard(name: string): string {
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

function copilotChat(): string {
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

/**
 * Every `<fluent-*>` tag emitted below is checked against
 * mcp/data/web-component-tags.json — the tag list snapshotted from
 * @fluentui/web-components@3.1.0's own custom-elements.json. A plausible-looking
 * phantom tag (this generator used to emit `<fluent-card>`, which does not exist
 * in v3) renders as an inert unknown element with no error, so the invariant is
 * enforced here rather than trusted.
 */
interface WebComponentTags {
  meta?: { version?: string; source?: string };
  tags?: string[];
}

let tagCache: Set<string> | null = null;
function knownTags(): Set<string> {
  if (!tagCache) {
    const data = loadJson<WebComponentTags>('web-component-tags.json');
    tagCache = new Set(data?.tags ?? []);
  }
  return tagCache;
}

/**
 * Tag -> side-effect module. The module name is the package DIRECTORY, which is
 * usually the tag minus the `fluent-` prefix but not always: `<fluent-text-area>`
 * registers from `textarea.js` and `<fluent-dropdown-option>` from `option.js`
 * (verified against the published package — `dist/esm/text-area/define.js` does
 * not exist). Getting this wrong yields a module-not-found at runtime.
 */
const MODULE_BY_TAG: Record<string, string> = {
  'fluent-text-area': 'textarea',
  'fluent-dropdown-option': 'option',
};

function tagsIn(html: string): string[] {
  return [...new Set((html.match(/<(fluent-[a-z0-9-]+)/g) ?? []).map((m) => m.slice(1)))].sort();
}

/** Tags used in a snippet that are NOT defined by @fluentui/web-components v3. */
function unknownTagsIn(html: string): string[] {
  const known = knownTags();
  if (!known.size) return []; // dataset absent: do not invent a failure
  return tagsIn(html).filter((t) => !known.has(t));
}

/** The side-effect imports that actually call define() for the tags in a snippet. */
function registrationImports(html: string): string {
  return tagsIn(html)
    .map((tag) => `    import '@fluentui/web-components/${MODULE_BY_TAG[tag] ?? tag.slice('fluent-'.length)}.js';`)
    .join('\n');
}

/**
 * Wrap a body in the v3 document shell: the per-component side-effect imports
 * (importing from the package root only re-exports classes — it does NOT call
 * define(), so the elements would stay unknown) plus setTheme().
 */
function wcDocument(title: string, body: string, notes: string[] = []): string {
  const imports = registrationImports(body);
  const footer = notes.length
    ? '\n\n<!--\n' + notes.map((n) => '  * ' + n).join('\n') + '\n-->'
    : '';
  return (
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <!-- npm i @fluentui/web-components @fluentui/tokens
       Peer deps: @microsoft/fast-element @microsoft/focusgroup-polyfill -->
  <script type="module">
    // Importing from the package root only re-exports classes - it does NOT
    // register the elements, so <fluent-button> would stay an unknown element.
    // The per-component side-effect modules are what call define().
${imports}
    // ...or register everything at once:
    // import '@fluentui/web-components/web-components.js';

    import { setTheme } from '@fluentui/web-components';
    import { webLightTheme } from '@fluentui/tokens';
    setTheme(webLightTheme); // swap for webDarkTheme for dark mode
  </script>
  <style>
    /* Web Components v3 has no provider element: theming is setTheme() plus the
       CSS custom properties it writes. Never hardcode a token value. */
    body { font-family: var(--fontFamilyBase); color: var(--colorNeutralForeground1);
           background: var(--colorNeutralBackground1); padding: var(--spacingVerticalXXL); }
  </style>
</head>
<body>
${body}
</body>
</html>` + footer
  );
}

function webComponentsApp(): string {
  return `  <fluent-text weight="semibold" size="600">Hello Fluent 2</fluent-text>
  <fluent-divider></fluent-divider>
  <fluent-text>Built with Fluent 2 Web Components v3 and design tokens.</fluent-text>
  <fluent-button appearance="primary">Get started</fluent-button>`;
}

function webComponentsForm(): string {
  return `  <!-- fluent-field renders ONLY named slots (label / input / message), so every
       child needs an explicit slot=. A control without slot="input" is dropped. -->
  <form id="contact" style="display:flex; flex-direction:column; gap:var(--spacingVerticalM); max-width:360px;">
    <fluent-field label-position="above">
      <label slot="label" for="name">Name</label>
      <fluent-text-input slot="input" id="name" name="name" required></fluent-text-input>
    </fluent-field>

    <fluent-field label-position="above">
      <label slot="label" for="message">Message</label>
      <fluent-text-area slot="input" id="message" name="message" resize="vertical"></fluent-text-area>
      <fluent-text slot="message" size="200">Tell us more</fluent-text>
    </fluent-field>

    <fluent-field label-position="after">
      <label slot="label" for="subscribe">Email me updates</label>
      <fluent-checkbox slot="input" id="subscribe" name="subscribe"></fluent-checkbox>
    </fluent-field>

    <div style="display:flex; gap:var(--spacingHorizontalS);">
      <fluent-button type="submit" appearance="primary">Submit</fluent-button>
      <fluent-button type="reset">Reset</fluent-button>
    </div>
  </form>`;
}

function webComponentsCard(): string {
  return `    <!-- v3 defines NO card element at all (verified against the package's own
       custom-elements.json). A card is a plain element styled with the Fluent
       tokens setTheme() writes; the interactive parts are real Fluent elements.
       If you want the real Card component, use React v9: <Card> from
       @fluentui/react-components. -->
  <div role="group" aria-labelledby="card-title" style="
      max-width:320px; display:flex; flex-direction:column;
      gap:var(--spacingVerticalM); padding:var(--spacingHorizontalL);
      background:var(--colorNeutralBackground1);
      border:var(--strokeWidthThin) solid var(--colorNeutralStroke1);
      border-radius:var(--borderRadiusLarge);
      box-shadow:var(--shadow4);">
    <fluent-text id="card-title" weight="semibold" size="400">Fluent 2 card</fluent-text>
    <fluent-text size="200">Composed from real v3 elements and design tokens.</fluent-text>
    <fluent-divider></fluent-divider>
    <div style="display:flex; gap:var(--spacingHorizontalS);">
      <fluent-button appearance="primary">Open</fluent-button>
      <fluent-button appearance="subtle">Dismiss</fluent-button>
    </div>
  </div>`;
}

function webComponentsCopilotChat(): string {
  return `  <!-- IMPORTANT: @fluentui-copilot/react-copilot (ChatInput, CopilotMessage,
       Suggestions, prompt starters, citations) is REACT ONLY. There is no Web
       Components build of it, so this is a hand-composed chat shell using real
       v3 elements. For the actual Copilot components, use React v9 and
       fluent_generate_code { kind: "copilot-chat", framework: "react" }. -->
  <main style="display:flex; flex-direction:column; gap:var(--spacingVerticalM); max-width:640px;">
    <div role="log" aria-live="polite" aria-label="Conversation"
         style="display:flex; flex-direction:column; gap:var(--spacingVerticalM);">
      <div style="display:flex; gap:var(--spacingHorizontalS); align-items:flex-start;">
        <fluent-avatar name="You" size="24"></fluent-avatar>
        <fluent-text>Summarise this report.</fluent-text>
      </div>
      <div style="display:flex; gap:var(--spacingHorizontalS); align-items:flex-start;">
        <fluent-avatar name="Copilot" size="24" color="brand"></fluent-avatar>
        <div style="display:flex; flex-direction:column; gap:var(--spacingVerticalXS);">
          <fluent-text>Here is the summary...</fluent-text>
          <!-- Citations keep a grounded answer auditable. -->
          <fluent-link href="#source-1">1. Q3 report.pdf</fluent-link>
        </div>
      </div>
      <fluent-progress-bar aria-label="Copilot is responding"></fluent-progress-bar>
    </div>

    <fluent-field label-position="above">
      <label slot="label" for="prompt">Ask Copilot</label>
      <fluent-text-area slot="input" id="prompt" placeholder="Ask a question"></fluent-text-area>
    </fluent-field>
    <div style="display:flex; gap:var(--spacingHorizontalS); align-items:center;">
      <fluent-button appearance="primary">Send</fluent-button>
      <!-- Non-negotiable: the AI-generated disclaimer must be visible. -->
      <fluent-text size="200">AI-generated content may be incorrect. Check important info.</fluent-text>
    </div>
  </main>`;
}

const WC_KINDS: Record<string, { title: string; body: () => string; notes: string[] }> = {
  app: {
    title: 'Fluent 2 Web Components v3 — app shell',
    body: webComponentsApp,
    notes: ['There is no provider element in v3: setTheme() writes the token CSS custom properties on the document.'],
  },
  form: {
    title: 'Fluent 2 Web Components v3 — form',
    body: webComponentsForm,
    notes: [
      'fluent-field owns the label/message slots; the input is projected into it, so the label stays associated for screen readers.',
    ],
  },
  card: {
    title: 'Fluent 2 Web Components v3 — card composition',
    body: webComponentsCard,
    notes: [
      'v3 ships no card element (there is no fluent-card tag). This composes the card surface from tokens and uses real v3 elements for the interactive parts.',
    ],
  },
  'copilot-chat': {
    title: 'Fluent 2 Web Components v3 — Copilot chat shell',
    body: webComponentsCopilotChat,
    notes: [
      '@fluentui-copilot/react-copilot has no Web Components equivalent — for real Copilot UI use framework:"react".',
    ],
  },
};

function webComponents(kind: string): string {
  const spec = WC_KINDS[kind] ?? WC_KINDS.app;
  const body = spec.body();
  const doc = wcDocument(spec.title, body, spec.notes);
  const unknown = unknownTagsIn(doc);
  if (unknown.length) {
    // Fail loudly instead of shipping an element that silently does nothing.
    return (
      `<!-- GENERATOR BUG: these tags are not defined by @fluentui/web-components v3: ${unknown.join(', ')}.\n` +
      `     Do not use this snippet; report it. Verified against mcp/data/web-component-tags.json. -->\n` +
      doc
    );
  }
  return doc;
}

export function registerCode(server: McpServer): void {
  server.registerTool(
    'fluent_generate_code',
    {
      title: 'Generate Fluent 2 web code',
      description:
        'Scaffold Fluent 2 web code (React v9 or Web Components): an app shell with FluentProvider, a themed form, a card, or a Copilot chat starter. Both frameworks honour "kind". Uses makeStyles + tokens (React) or the token CSS custom properties setTheme() writes (Web Components) — no hardcoded values. Every <fluent-*> tag emitted is validated against the tag list @fluentui/web-components v3 actually defines.',
      inputSchema: {
        kind: z
          .enum(['app', 'form', 'card', 'copilot-chat'])
          .default('app')
          .describe('What to scaffold. Honoured for both react and webcomponents.'),
        framework: z.enum(['react', 'webcomponents']).default('react'),
        componentName: z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9]*$/)
          .default('MyComponent')
          .describe('PascalCase component name (React kinds).'),
      },
    },
    async ({ kind, framework, componentName }) => {
      if (framework === 'webcomponents') {
        return textResult(`<!-- Fluent 2 Web Components v3 starter — kind: ${kind} -->\n` + webComponents(kind));
      }
      let code: string;
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
    }
  );
}
