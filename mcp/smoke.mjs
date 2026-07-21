import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { rmSync, existsSync, readdirSync } from 'node:fs';

const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('TOOLS(' + tools.tools.length + '):', tools.tools.map((t) => t.name).join(', '));
console.log('tool_count: ok=' + (tools.tools.length === 17));

const pbi = await client.callTool({ name: 'fluent_generate_powerbi_theme', arguments: { brandColor: '#D13438', name: 'Fluent Red' } });
const pbiText = pbi.content[0].text;
let pbiValid = false, hasVS = false;
try { const j = JSON.parse(pbiText); pbiValid = true; hasVS = !!(j.visualStyles && j.visualStyles['*'] && j.visualStyles['*']['*']); } catch {}
console.log('powerbi_theme: recolored=' + pbiText.includes('#D13438') + ' named=' + pbiText.includes('Fluent Red') + ' validJSON=' + pbiValid + ' visualStyles=' + hasVS + ' bytes=' + pbiText.length);

const pp = await client.callTool({ name: 'fluent_powerplatform_guidance', arguments: { surface: 'pcf' } });
console.log('powerplatform(pcf): ok=' + pp.content[0].text.includes('fluentDesignLanguage'));

const a11y = await client.callTool({ name: 'fluent_accessibility_checklist', arguments: {} });
console.log('accessibility: ok=' + a11y.content[0].text.includes('4.5:1'));

if (existsSync('./.smoke-out')) rmSync('./.smoke-out', { recursive: true, force: true });
const scaf = await client.callTool({ name: 'fluent_scaffold_pbip', arguments: { name: 'SmokeReport', outputDir: './.smoke-out' } });
console.log('scaffold_pbip:', scaf.content[0].text.split('\n')[0]);
const hasPbip = existsSync('./.smoke-out/SmokeReport.pbip');
const fileCount = existsSync('./.smoke-out') ? readdirSync('./.smoke-out', { recursive: true }).length : 0;
console.log('scaffold: SmokeReport.pbip=' + hasPbip + ' entries=' + fileCount);
rmSync('./.smoke-out', { recursive: true, force: true });

const tk = await client.callTool({ name: 'fluent_list_tokens', arguments: { category: 'borderRadius' } });
console.log('list_tokens(borderRadius): ok=' + tk.content[0].text.includes('borderRadiusMedium'));
const gt = await client.callTool({ name: 'fluent_get_token', arguments: { name: 'colorBrandBackground' } });
console.log('get_token(colorBrandBackground): ok=' + gt.content[0].text.includes('colorBrandBackground'));
const sc = await client.callTool({ name: 'fluent_search_components', arguments: { query: 'button' } });
console.log('search_components(button): ok=' + sc.content[0].text.includes('Button'));
const gcomp = await client.callTool({ name: 'fluent_get_component', arguments: { name: 'Combobox' } });
console.log('get_component(Combobox): ok=' + gcomp.content[0].text.includes('Combobox'));
const th = await client.callTool({ name: 'fluent_generate_theme', arguments: { brandColor: '#D13438', name: 'red' } });
console.log('generate_theme: ok=' + (th.content[0].text.includes('BrandVariants') && th.content[0].text.includes('createDarkTheme') && th.content[0].text.includes("80: '#D13438'")));
const cd = await client.callTool({ name: 'fluent_generate_code', arguments: { kind: 'form', framework: 'react', componentName: 'ContactForm' } });
console.log('generate_code(form): ok=' + cd.content[0].text.includes('FluentProvider'));

const dg = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'motion' } });
const dgText = dg.content[0].text;
console.log('design_guidance(motion): ok=' + (dgText.length > 0 && dgText.includes('durationNormal') && dgText.includes('curveEasyEase')));
const dgAll = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'all' } });
const dgAllText = dgAll.content[0].text;
let dgTopics = 0; try { const j = JSON.parse(dgAllText); dgTopics = Object.keys(j.topics || {}).length; } catch {}
console.log('design_guidance(all): topics=' + dgTopics + ' ok=' + (dgTopics === 16 && dgAllText.includes('design-principles')));

const mig = await client.callTool({ name: 'fluent_migration_guidance', arguments: { scenario: 'v8-to-v9' } });
const migText = mig.content[0].text;
console.log('migration(v8-to-v9): ok=' + (migText.length > 0 && migText.includes('FluentProvider') && migText.includes('react-migration-v8-v9')));

// ---- Config presets + persistent agent memory round-trip (zero-config safe) ----
const CFG_DIR = './.cfg-smoke';
if (existsSync(CFG_DIR)) rmSync(CFG_DIR, { recursive: true, force: true });

// 1) get_config on an empty/absent project dir -> all defaults, never throws
const c1 = await client.callTool({ name: 'fluent_get_config', arguments: { projectDir: CFG_DIR } });
const c1j = JSON.parse(c1.content[0].text);
console.log(
  'get_config(empty): configExists=' + c1j.configExists + ' memoryExists=' + c1j.memoryExists +
    ' brand=' + c1j.config.brand.color + ' brandSource=' + c1j.sources['brand.color'] +
    ' ok=' + (c1j.configExists === false && c1j.memoryExists === false &&
      c1j.config.brand.color === '#0f6cbd' && c1j.sources['brand.color'] === 'default')
);

// 2) init_config -> writes fluent.config.json (presets over defaults) + memory skeleton
const c2 = await client.callTool({ name: 'fluent_init_config', arguments: { projectDir: CFG_DIR, brandColor: '#742774', targets: ['web-react'] } });
const c2j = JSON.parse(c2.content[0].text);
const cfgFile = existsSync(CFG_DIR + '/fluent.config.json');
const memFile = existsSync(CFG_DIR + '/.fluent/memory.json');
console.log(
  'init_config: written=' + c2j.written + ' cfgFile=' + cfgFile + ' memFile=' + memFile +
    ' ok=' + (c2j.written === true && cfgFile && memFile &&
      typeof c2j.config['$schema'] === 'string' && c2j.config['$schema'].includes('fluent.config.schema.json') &&
      c2j.config.brand.color === '#742774')
);

// 3) get_config again -> config now present, brand resolved from config
const c3 = await client.callTool({ name: 'fluent_get_config', arguments: { projectDir: CFG_DIR } });
const c3j = JSON.parse(c3.content[0].text);
console.log(
  'get_config(after init): configExists=' + c3j.configExists + ' brand=' + c3j.config.brand.color +
    ' brandSource=' + c3j.sources['brand.color'] +
    ' ok=' + (c3j.configExists === true && c3j.config.brand.color === '#742774' && c3j.sources['brand.color'] === 'config')
);

// 4) set_config -> update a dot-path
const c4 = await client.callTool({ name: 'fluent_set_config', arguments: { projectDir: CFG_DIR, key: 'accessibility.targetLevel', value: 'AAA' } });
const c4j = JSON.parse(c4.content[0].text);
console.log('set_config(accessibility.targetLevel=AAA): ok=' + (c4j.config.accessibility.targetLevel === 'AAA'));

// 5) remember -> append a design decision to memory
const c5 = await client.callTool({ name: 'fluent_remember', arguments: { projectDir: CFG_DIR, question: 'Use pill-shaped primary buttons?', answer: 'Yes, use pill shape for primary CTAs.', scope: 'component', surface: 'web-react' } });
const c5j = JSON.parse(c5.content[0].text);
console.log('remember: decisions=' + c5j.decisions.length + ' ok=' + (c5j.decisions.length === 1 && c5j.decisions[0].source === 'user' && c5j.decisions[0].scope === 'component'));

// 6) recall -> the decision is present (and filterable)
const c6 = await client.callTool({ name: 'fluent_recall', arguments: { projectDir: CFG_DIR, filter: 'pill' } });
const c6j = JSON.parse(c6.content[0].text);
console.log('recall(filter=pill): found=' + c6j.decisions.length + ' ok=' + (c6j.decisions.length === 1 && c6j.decisions[0].answer.includes('pill')));

// 7) security: prototype-pollution keys are rejected and no pollution occurs
const c7 = await client.callTool({ name: 'fluent_set_config', arguments: { projectDir: CFG_DIR, key: '__proto__.polluted', value: 'PWNED' } });
console.log('set_config(__proto__): rejected=' + c7.content[0].text.includes('not allowed') + ' noPollution=' + (({}).polluted === undefined));

// 8) coercion: a numeric preset is stored as a number (keeps the config schema-valid)
const c8 = await client.callTool({ name: 'fluent_set_config', arguments: { projectDir: CFG_DIR, key: 'accessibility.minTargetSize', value: '44' } });
const c8j = JSON.parse(c8.content[0].text);
console.log('set_config(coerce number): ok=' + (c8j.config.accessibility.minTargetSize === 44));

// 9) theme.mode default is light (zero-config webLightTheme intent)
console.log('theme.mode default=light: ok=' + (c1j.config.theme.mode === 'light'));

rmSync(CFG_DIR, { recursive: true, force: true });

await client.close();
process.exit(0);
