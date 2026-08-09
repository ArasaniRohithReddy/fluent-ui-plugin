// Exercise the two new Fluent 1 tools through the real MCP server over stdio.
//
// A green `tsc` only proves the code compiles; it says nothing about whether the
// tools return correct answers. These cases were chosen because each one is a
// documented way v8 silently misleads people, so a wrong answer here would be
// worse than no answer at all.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
const client = new Client({ name: 'v8-check', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return r.content?.map((c) => c.text).join('\n') ?? '';
};

let pass = 0;
let fail = 0;
const check = (label, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const tools = (await client.listTools()).tools.map((t) => t.name);
check('fluent_v8_lookup is registered', tools.includes('fluent_v8_lookup'));
check('fluent_v8_guidance is registered', tools.includes('fluent_v8_guidance'));
console.log(`  ..   server exposes ${tools.length} tools`);

// DetailsList is the single most common blocker: people assume v9 DataGrid is a
// drop-in replacement, and it is not.
const dl = await call('fluent_v8_lookup', { name: 'DetailsList' });
check('DetailsList resolves', dl.includes('DetailsList'));
check('DetailsList is flagged v8-only', dl.includes('v8Only'));
check('DetailsList explains why it blocks', /whyBlocking/.test(dl));

// Case-insensitivity: agents rarely reproduce casing exactly.
const ci = await call('fluent_v8_lookup', { name: 'detailslist' });
check('lookup is case-insensitive', ci.includes('DetailsList'));

// Nav is a true collision: same export name in v8 and v9, no API overlap.
const nav = await call('fluent_v8_lookup', { name: 'Nav' });
check('Nav reports a collision', nav.includes('collisions'));
check('Nav warns the swap compiles but misbehaves', /compiles|misbehav|hazard/i.test(nav));

// Dialog's `hidden` defaults to true — inverted relative to Panel.isOpen.
const dlg = await call('fluent_v8_lookup', { name: 'Dialog' });
check('Dialog surfaces its trap', dlg.includes('traps'));
check('Dialog trap mentions the inverted prop', /hidden/i.test(dlg));

// An unknown name must fail honestly rather than inventing an answer.
const miss = await call('fluent_v8_lookup', { name: 'TotallyNotAComponent' });
check('unknown name is reported, not invented', /not found/i.test(miss));
check('unknown name avoids false certainty', /does not prove/i.test(miss));

// Sections.
const vd = await call('fluent_v8_guidance', { section: 'version-decision' });
check('version-decision returns content', vd.length > 200);
const errata = await call('fluent_v8_guidance', { section: 'docs-errata' });
check('docs-errata returns content', errata.length > 200);
const all = await call('fluent_v8_guidance', { section: 'all' });
check('"all" refuses to dump and lists sections instead', /too large/i.test(all) && /entries|keys/.test(all));

await client.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
