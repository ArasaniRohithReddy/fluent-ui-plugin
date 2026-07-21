import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { rmSync, existsSync, readdirSync } from 'node:fs';

const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
console.log('TOOLS(' + tools.tools.length + '):', tools.tools.map((t) => t.name).join(', '));

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

await client.close();
process.exit(0);
