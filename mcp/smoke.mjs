import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';

const _realLog = console.log.bind(console);
const _lines = [];
console.log = (...a) => { const s = a.map(String).join(' '); _lines.push(s); _realLog(s); };

/**
 * True when the text contains a link whose hostname EXACTLY matches `hostname`
 * (and whose path starts with `pathPrefix`). Parsing each URL avoids the
 * substring checks that make host assertions unreliable.
 */
function hasLinkTo(text, hostname, pathPrefix = '') {
  const urls = String(text).match(/https?:\/\/[^\s"'<>)\]]+/g) || [];
  return urls.some((u) => {
    try {
      const parsed = new URL(u);
      return parsed.hostname === hostname && parsed.pathname.startsWith(pathPrefix);
    } catch {
      return false;
    }
  });
}

const transport = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
const client = new Client({ name: 'smoke', version: '1.0.0' });
await client.connect(transport);

const tools = await client.listTools();
const toolNames = tools.tools.map((t) => t.name);
console.log('TOOLS(' + tools.tools.length + '):', toolNames.join(', '));

// A bare count tells you something moved but not what, so also assert the tools
// we depend on are actually present - a rename would otherwise keep the count
// correct while silently breaking every caller.
const EXPECTED_TOOL_COUNT = 25;
const REQUIRED_TOOLS = [
  'fluent_search_components', 'fluent_get_component', 'fluent_list_tokens', 'fluent_get_token',
  'fluent_generate_theme', 'fluent_generate_powerbi_theme', 'fluent_scaffold_pbip', 'fluent_powerbi_visuals',
  'fluent_powerplatform_guidance', 'fluent_generate_code', 'fluent_accessibility_checklist',
  'fluent_design_guidance', 'fluent_migration_guidance', 'fluent_get_images',
  'fluent_get_config', 'fluent_init_config', 'fluent_set_config', 'fluent_remember', 'fluent_recall',
  'fluent_v8_lookup', 'fluent_v8_guidance',
];
const missingTools = REQUIRED_TOOLS.filter((t) => !toolNames.includes(t));
if (missingTools.length) console.log('  missing tools:', missingTools.join(', '));
if (tools.tools.length !== EXPECTED_TOOL_COUNT) {
  console.log('  count changed: expected ' + EXPECTED_TOOL_COUNT + ', got ' + tools.tools.length + ' — update EXPECTED_TOOL_COUNT if intentional');
}
console.log('tool_count: ok=' + (tools.tools.length === EXPECTED_TOOL_COUNT && missingTools.length === 0));

const pbi = await client.callTool({ name: 'fluent_generate_powerbi_theme', arguments: { brandColor: '#D13438', name: 'Fluent Red' } });
const pbiText = pbi.content[0].text;
let pbiValid = false, hasVS = false;
try { const j = JSON.parse(pbiText); pbiValid = true; hasVS = !!(j.visualStyles && j.visualStyles['*'] && j.visualStyles['*']['*']); } catch {}
console.log('powerbi_theme: recolored=' + pbiText.includes('#D13438') + ' named=' + pbiText.includes('Fluent Red') + ' validJSON=' + pbiValid + ' visualStyles=' + hasVS + ' bytes=' + pbiText.length + ' ok=' + (pbiText.includes('#D13438') && pbiText.includes('Fluent Red') && pbiValid && hasVS));

const pp = await client.callTool({ name: 'fluent_powerplatform_guidance', arguments: { surface: 'pcf' } });
console.log('powerplatform(pcf): ok=' + pp.content[0].text.includes('fluentDesignLanguage'));

const pbv = await client.callTool({ name: 'fluent_powerbi_visuals', arguments: { category: 'AI-powered' } });
const pbvText = pbv.content[0].text;
console.log('powerbi_visuals(AI-powered): ok=' + (hasLinkTo(pbvText, 'learn.microsoft.com') && (pbvText.toLowerCase().includes('decomposition') || pbvText.toLowerCase().includes('key influencers'))));
const pbvQ = await client.callTool({ name: 'fluent_powerbi_visuals', arguments: { query: 'trend over time' } });
console.log('powerbi_visuals(query trend): ok=' + (pbvQ.content[0].text.toLowerCase().includes('line') && hasLinkTo(pbvQ.content[0].text, 'learn.microsoft.com')));

const a11y = await client.callTool({ name: 'fluent_accessibility_checklist', arguments: {} });
console.log('accessibility: ok=' + a11y.content[0].text.includes('4.5:1'));

if (existsSync('./.smoke-out')) rmSync('./.smoke-out', { recursive: true, force: true });
const scaf = await client.callTool({ name: 'fluent_scaffold_pbip', arguments: { name: 'SmokeReport', outputDir: './.smoke-out' } });
console.log('scaffold_pbip:', scaf.content[0].text.split('\n')[0]);
const hasPbip = existsSync('./.smoke-out/SmokeReport.pbip');
const fileCount = existsSync('./.smoke-out') ? readdirSync('./.smoke-out', { recursive: true }).length : 0;
console.log('scaffold: SmokeReport.pbip=' + hasPbip + ' entries=' + fileCount + ' ok=' + (hasPbip && fileCount > 0));

// PBIR tooling: scaffold a report, audit it, register a theme (dry run then
// real), clear the inline overrides, and verify the effectiveness ratio moves.
const PBIR_REPORT = './.smoke-out/SmokeReport.Report';
const aud = await client.callTool({ name: 'fluent_pbir_audit', arguments: { reportDir: PBIR_REPORT, format: 'json' } });
let audJ = null;
try { audJ = JSON.parse(aud.content[0].text); } catch {}
console.log('pbir_audit: pages=' + (audJ && audJ.counts.pages) + ' visuals=' + (audJ && audJ.counts.visualFiles) + ' ok=' + (!!audJ && audJ.counts.pages > 0 && !!audJ.computedReportVersionAtImport.visual));

const themeJson = (await client.callTool({ name: 'fluent_generate_powerbi_theme', arguments: { brandColor: '#0F6CBD', name: 'Fluent Smoke' } })).content[0].text;
const applyDry = await client.callTool({ name: 'fluent_pbir_apply_theme', arguments: { reportDir: PBIR_REPORT, themeJson, themeName: 'FluentSmoke' } });
console.log('pbir_apply_theme(dry run default): ok=' + (applyDry.content[0].text.startsWith('DRY RUN') && !existsSync(PBIR_REPORT + '/StaticResources/RegisteredResources/FluentSmoke.json')));

const applyReal = await client.callTool({ name: 'fluent_pbir_apply_theme', arguments: { reportDir: PBIR_REPORT, themeJson, themeName: 'FluentSmoke', dryRun: false, format: 'json' } });
let applyJ = null;
try { applyJ = JSON.parse(applyReal.content[0].text); } catch {}
const themeOnDisk = existsSync(PBIR_REPORT + '/StaticResources/RegisteredResources/FluentSmoke.json');
const rvi = applyJ && applyJ.reportVersionAtImport;
console.log('pbir_apply_theme(applied): file=' + themeOnDisk + ' rvi=' + JSON.stringify(rvi) + ' ok=' + (themeOnDisk && !!rvi && !!rvi.visual && !!rvi.page && !!rvi.report));

const norm = await client.callTool({ name: 'fluent_pbir_normalize_inline', arguments: { reportDir: PBIR_REPORT, policy: 'theme-wins', format: 'json' } });
let normJ = null;
try { normJ = JSON.parse(norm.content[0].text); } catch {}
console.log('pbir_normalize_inline(dry run default): dryRun=' + (normJ && normJ.dryRun) + ' identityUnchanged=' + (normJ && normJ.identity.unchanged) + ' ok=' + (!!normJ && normJ.dryRun === true && normJ.identity.unchanged === true));

const ver = await client.callTool({ name: 'fluent_pbir_verify', arguments: { reportDir: PBIR_REPORT, format: 'json' } });
let verJ = null;
try { verJ = JSON.parse(ver.content[0].text); } catch {}
const ids = verJ ? verJ.checks.map((c) => c.id).join(',') : '';
console.log('pbir_verify: checks=' + ids + ' ok=' + (ids === 'V1,V2,V3,V4,V5,V6,V7,V8,V9' && verJ.checks.find((c) => c.id === 'V1').pass && verJ.checks.find((c) => c.id === 'V3').pass));

const guard = await client.callTool({ name: 'fluent_pbir_audit', arguments: { reportDir: './.smoke-out', format: 'text' } });
console.log('pbir_audit(PBIP root resolves to the .Report folder): ok=' + guard.content[0].text.startsWith('PBIR audit:'));
const bad = await client.callTool({ name: 'fluent_pbir_audit', arguments: { reportDir: './.smoke-out/SmokeReport.SemanticModel' } });
console.log('pbir_audit(non-PBIR rejected): ok=' + bad.content[0].text.includes('not a PBIR report directory'));

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
console.log('design_guidance(all): topics=' + dgTopics + ' ok=' + (dgTopics === 36 && dgAllText.includes('design-principles') && dgAllText.includes('design-tokens')));
// Every topic must declare where it came from and when. Without this a topic
// captured before Microsoft put the page behind a sign-in is indistinguishable
// from one verified today, and callers silently trust stale guidance.
let dgProvenance = { total: 0, stamped: 0, gated: 0 };
try {
  const topics = Object.values(JSON.parse(dgAllText).topics || {});
  dgProvenance = {
    total: topics.length,
    stamped: topics.filter((t) => t.accessStatus && t.capturedAt).length,
    gated: topics.filter((t) => t.accessStatus === 'employee-gated').length,
  };
} catch {}
console.log('design_guidance provenance: ' + dgProvenance.stamped + '/' + dgProvenance.total
  + ' stamped, ' + dgProvenance.gated + ' gated ok='
  + (dgProvenance.total > 0 && dgProvenance.stamped === dgProvenance.total));
const dgEvals = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'content-engineering-evals' } });
const dgEvalsText = dgEvals.content[0].text;
console.log('design_guidance(content-engineering-evals): ok=' + (dgEvalsText.includes('golden set') && dgEvalsText.includes('prompt set') && dgEvalsText.includes('rubric')));
const dgCE = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'content-engineering' } });
const dgCEText = dgCE.content[0].text;
console.log('design_guidance(content-engineering): ok=' + (dgCEText.length > 0 && dgCEText.includes('system prompt') && dgCEText.includes('content-engineering')));
const dgErr = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'copilot-errors' } });
const dgErrText = dgErr.content[0].text;
console.log('design_guidance(copilot-errors): ok=' + (dgErrText.length > 0 && dgErrText.includes('input-level') && dgErrText.includes('copilot-errors')));
const dgDT = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'design-tokens' } });
const dgDTText = dgDT.content[0].text;
console.log('design_guidance(design-tokens): ok=' + (dgDTText.length > 0 && dgDTText.includes('Alias tokens') && dgDTText.includes('design-tokens')));

const imgAnat = await client.callTool({ name: 'fluent_get_images', arguments: { owner: 'Card', kind: 'anatomy' } });
const imgAnatText = imgAnat.content[0].text;
console.log('get_images(Card anatomy): ok=' + (hasLinkTo(imgAnatText, 'fluent2websitecdn.azureedge.net', '/cdn/card1') && imgAnatText.toLowerCase().includes('card header')));
const imgVid = await client.callTool({ name: 'fluent_get_images', arguments: { owner: 'motion', type: 'video' } });
const imgVidText = imgVid.content[0].text;
console.log('get_images(motion videos): ok=' + (imgVidText.includes('/assets/video/motion/') && imgVidText.includes('.mp4')));
const imgDont = await client.callTool({ name: 'fluent_get_images', arguments: { owner: 'responsible-ai', verdict: 'dont', limit: 5 } });
const imgDontText = imgDont.content[0].text;
console.log('get_images(responsible-ai dont): ok=' + (imgDontText.includes('DONT') || imgDontText.toLowerCase().includes("don't") || imgDontText.includes('assets/img/responsible-ai')));
const imgBtn = await client.callTool({ name: 'fluent_get_images', arguments: { owner: 'button', kind: 'dodont', verdict: 'dont' } });
const imgBtnText = imgBtn.content[0].text;
console.log('get_images(button dodont dont): ok=' + (imgBtnText.includes('fluent2websitecdn') && (imgBtnText.includes('DONT') || imgBtnText.toLowerCase().includes("don't"))));

const mig = await client.callTool({ name: 'fluent_migration_guidance', arguments: { scenario: 'v8-to-v9' } });
const migText = mig.content[0].text;
console.log('migration(v8-to-v9): ok=' + (migText.length > 0 && migText.includes('FluentProvider') && migText.includes('react-migration-v8-v9')));
const migPbi = await client.callTool({ name: 'fluent_migration_guidance', arguments: { scenario: 'powerbi-report' } });
const migPbiText = migPbi.content[0].text;
console.log('migration(powerbi-report): ok=' + (migPbiText.includes('effectMap') && migPbiText.includes('neverRename') && migPbiText.toLowerCase().includes('bookmark')));

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
const c2 = await client.callTool({
  name: 'fluent_init_config',
  arguments: {
    projectDir: CFG_DIR,
    brandColor: '#742774',
    targets: ['web-react'],
    guidelines: ['Data grids are compact, everything else is comfortable.'],
    constraints: ['Never use red except for destructive actions.'],
    references: ['https://internal.example/design'],
  },
});
const c2j = JSON.parse(c2.content[0].text);
const cfgFile = existsSync(CFG_DIR + '/fluent.config.json');
const memFile = existsSync(CFG_DIR + '/.fluent/memory.json');
console.log(
  'init_config: written=' + c2j.written + ' cfgFile=' + cfgFile + ' memFile=' + memFile +
    ' ok=' + (c2j.written === true && cfgFile && memFile &&
      typeof c2j.config['$schema'] === 'string' && c2j.config['$schema'].includes('fluent.config.schema.json') &&
      c2j.config.brand.color === '#742774')
);

// The team's own house rules must survive intake verbatim. Paraphrasing them
// into a preset is what makes the plugin build generic Fluent 2 instead of
// this team's Fluent 2, so assert the exact strings round-trip.
const g2 = c2j.config.guidelines || {};
console.log(
  'init_config(guidelines): rules=' + (g2.rules || []).length +
    ' constraints=' + (g2.constraints || []).length +
    ' refs=' + (g2.references || []).length +
    ' ok=' + (
      (g2.rules || [])[0] === 'Data grids are compact, everything else is comfortable.' &&
      (g2.constraints || [])[0] === 'Never use red except for destructive actions.' &&
      (g2.references || [])[0] === 'https://internal.example/design'
    )
);

// The config we generate must satisfy the schema we ship, or every user gets
// red squiggles in their editor on a file we wrote ourselves. The schema sets
// additionalProperties:false, so a new top-level block is invalid until the
// schema learns about it.
let schemaTopLevelOk = false;
let schemaUnknown = [];
try {
  const schema = JSON.parse(readFileSync(new URL('../assets/schema/fluent.config.schema.json', import.meta.url), 'utf8'));
  const allowed = new Set(Object.keys(schema.properties || {}));
  schemaUnknown = Object.keys(c2j.config || {}).filter((k) => !allowed.has(k));
  schemaTopLevelOk = schema.additionalProperties === false && schemaUnknown.length === 0;
} catch {}
console.log(
  'init_config vs shipped schema: unknownKeys=[' + schemaUnknown.join(',') + '] ok=' + schemaTopLevelOk
);

// 3) get_config again -> config now present, brand resolved from config
const c3 = await client.callTool({ name: 'fluent_get_config', arguments: { projectDir: CFG_DIR } });
const c3j = JSON.parse(c3.content[0].text);
console.log(
  'get_config(after init): configExists=' + c3j.configExists + ' brand=' + c3j.config.brand.color +
    ' brandSource=' + c3j.sources['brand.color'] +
    ' ok=' + (c3j.configExists === true && c3j.config.brand.color === '#742774' && c3j.sources['brand.color'] === 'config')
);

// Guidelines are only useful if a later task reads them back, so the resolver
// must return them and attribute them to the config rather than a default.
console.log(
  'get_config(guidelines): constraints=' + ((c3j.config.guidelines || {}).constraints || []).length +
    ' ok=' + (
      ((c3j.config.guidelines || {}).constraints || [])[0] === 'Never use red except for destructive actions.' &&
      ((c3j.config.guidelines || {}).rules || []).length === 1
    )
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
console.log('set_config(__proto__): rejected=' + c7.content[0].text.includes('not allowed') + ' noPollution=' + (({}).polluted === undefined) + ' ok=' + (c7.content[0].text.includes('not allowed') && (({}).polluted === undefined)));

// 8) coercion: a numeric preset is stored as a number (keeps the config schema-valid)
const c8 = await client.callTool({ name: 'fluent_set_config', arguments: { projectDir: CFG_DIR, key: 'accessibility.minTargetSize', value: '44' } });
const c8j = JSON.parse(c8.content[0].text);
console.log('set_config(coerce number): ok=' + (c8j.config.accessibility.minTargetSize === 44));

// 9) theme.mode default is light (zero-config webLightTheme intent)
console.log('theme.mode default=light: ok=' + (c1j.config.theme.mode === 'light'));

rmSync(CFG_DIR, { recursive: true, force: true });

// --- Fluent 1 (v8) -----------------------------------------------------------
// These assert behaviour that silently misleads users if it regresses: v8-only
// components must say WHY they block, colliding names must warn that the swap
// compiles before it misbehaves, and an unknown name must be admitted rather
// than answered confidently.
const v8dl = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'DetailsList' } })).content[0].text;
console.log('v8_lookup(DetailsList): v8Only=' + v8dl.includes('v8Only') + ' explains=' + /whyBlocking/.test(v8dl) + ' ok=' + (v8dl.includes('v8Only') && /whyBlocking/.test(v8dl)));

const v8nav = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'Nav' } })).content[0].text;
console.log('v8_lookup(Nav): collision=' + v8nav.includes('collisions') + ' warns=' + /compiles|misbehav|hazard/i.test(v8nav) + ' ok=' + (v8nav.includes('collisions') && /compiles|misbehav|hazard/i.test(v8nav)));

const v8ci = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'detailslist' } })).content[0].text;
console.log('v8_lookup case-insensitive: ok=' + v8ci.includes('DetailsList'));

const v8miss = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'NotARealV8Component' } })).content[0].text;
console.log('v8_lookup(unknown): admits=' + /not found/i.test(v8miss) + ' noFalseCertainty=' + /does not prove/i.test(v8miss) + ' ok=' + (/not found/i.test(v8miss) && /does not prove/i.test(v8miss)));

const v8all = (await client.callTool({ name: 'fluent_v8_guidance', arguments: { section: 'all' } })).content[0].text;
console.log('v8_guidance(all) refuses to dump: ok=' + /too large/i.test(v8all));

// Every v8-only entry must explain itself; a bare name is not actionable.
const v8data = JSON.parse(readFileSync(new URL('./data/fluent-v8.json', import.meta.url), 'utf8'));
const t1 = v8data.v8Only?.tier1 ?? [];
const noWhy = t1.filter((e) => !e.whyBlocking).length;
console.log('v8 tier1 all explained: entries=' + t1.length + ' missing=' + noWhy + ' ok=' + (t1.length > 50 && noWhy === 0));

await client.close();

const failures = _lines.filter((l) => /ok\s*=\s*false/i.test(l));
if (failures.length) {
  _realLog('\nSMOKE FAILED: ' + failures.length + ' check(s) did not pass:');
  for (const f of failures) _realLog('  - ' + f);
  process.exit(1);
}
_realLog('\nSMOKE PASSED: ' + _lines.filter((l) => /ok\s*=\s*true/i.test(l)).length + ' checks ok');
process.exit(0);
