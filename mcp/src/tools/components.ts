import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadJson, textResult } from '../util.js';

export function registerComponents(server: McpServer): void {
  server.registerTool(
    'fluent_search_components',
    {
      title: 'Search Fluent 2 components',
      description:
        'Search the Fluent 2 (React v9 / Web Components) catalog by name, category, or keyword. Returns matching components with category, description, React import, and web-component tag. Includes AI/Copilot components.',
      inputSchema: {
        query: z
          .string()
          .describe('Name, category, or keyword — e.g. "button", "input", "chat", "Actions", "overlay".'),
      },
    },
    async ({ query }) => {
      const data = loadJson<any>('fluent-components.json');
      const usage = loadJson<any[]>('fluent-components-usage.json') || [];
      if (!data) return textResult('Component data not found at mcp/data/fluent-components.json.');
      const q = query.toLowerCase();
      const comps: any[] = data.components || [];
      const matches = comps.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.category || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      );
      const norm = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const known = new Set(comps.map((c) => norm(c.name)));
      const aiMatches = usage.filter(
        (u) =>
          u.category === 'ai' &&
          !known.has(norm(u.name)) &&
          (u.name.toLowerCase().includes(q) || (u.description || '').toLowerCase().includes(q) || 'ai copilot chat'.includes(q))
      );
      const list = [
        ...matches.map((c) => ({
          name: c.name,
          category: c.category,
          description: c.description,
          import: c.reactImport,
          webComponent: c.webComponent,
        })),
        ...aiMatches.map((u) => ({
          name: u.name,
          category: 'AI / Copilot',
          description: u.description,
          storybook: u.storybookUrl,
        })),
      ];
      if (!list.length) return textResult(`No components matching "${query}". Try a broader keyword.`);
      return textResult(`${list.length} match(es):\n\n` + JSON.stringify(list, null, 2));
    }
  );

  server.registerTool(
    'fluent_get_component',
    {
      title: 'Get a Fluent 2 component',
      description:
        "Get full details for a Fluent 2 component: real props (types/defaults), React import, web-component tag, accessibility notes, a code sample, plus usage guidance (when to use, anatomy, states, behavior, do/don't) and Storybook link.",
      inputSchema: {
        name: z.string().describe('Component name, e.g. Button, Combobox, CopilotMessage.'),
      },
    },
    async ({ name }) => {
      const data = loadJson<any>('fluent-components.json');
      const usage = loadJson<any[]>('fluent-components-usage.json') || [];
      const q = name.toLowerCase();
      const comps: any[] = data?.components || [];
      const api = comps.find((c) => c.name.toLowerCase() === q) || comps.find((c) => c.name.toLowerCase().includes(q));
      const use = usage.find((u) => u.name.toLowerCase() === q) || usage.find((u) => u.name.toLowerCase().includes(q));
      if (!api && !use) return textResult(`No component "${name}". Use fluent_search_components to find one.`);
      return textResult(JSON.stringify({ api: api || null, usage: use || null }, null, 2));
    }
  );
}
