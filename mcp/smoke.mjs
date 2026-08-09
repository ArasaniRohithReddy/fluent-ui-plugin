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
const EXPECTED_TOOL_COUNT = 28;
const REQUIRED_TOOLS = [
  'fluent_search_components', 'fluent_get_component', 'fluent_list_tokens', 'fluent_get_token',
  'fluent_generate_theme', 'fluent_generate_powerbi_theme', 'fluent_scaffold_pbip', 'fluent_powerbi_visuals',
  'fluent_powerplatform_guidance', 'fluent_generate_code', 'fluent_accessibility_checklist',
  'fluent_design_guidance', 'fluent_migration_guidance', 'fluent_get_images',
  'fluent_get_config', 'fluent_init_config', 'fluent_set_config', 'fluent_remember', 'fluent_recall',
  'fluent_v8_lookup', 'fluent_v8_guidance', 'fluent_figma_guidance',
  'fluent_native_component', 'fluent_native_guidance',
];
const missingTools = REQUIRED_TOOLS.filter((t) => !toolNames.includes(t));
if (missingTools.length) console.log('  missing tools:', missingTools.join(', '));
if (tools.tools.length !== EXPECTED_TOOL_COUNT) {
  console.log('  count changed: expected ' + EXPECTED_TOOL_COUNT + ', got ' + tools.tools.length + ' — update EXPECTED_TOOL_COUNT if intentional');
}
console.log('tool_count: ok=' + (tools.tools.length === EXPECTED_TOOL_COUNT && missingTools.length === 0));

// The public site advertises the tool list. It is a separate hand-maintained
// array, so it drifts silently and the drift is user-facing - the site claimed
// 23 tools while the server shipped 28. Compare the two directly.
{
  const sitePath = new URL('../site/src/App.tsx', import.meta.url);
  let siteOk = false, siteNote = 'site/src/App.tsx not readable';
  try {
    const src = readFileSync(sitePath, 'utf8');
    const block = src.match(/const TOOLS[^=]*=\s*\[([\s\S]*?)\n\];/);
    if (block) {
      const listed = [...block[1].matchAll(/\[\s*'(fluent_[a-z0-9_]+)'/g)].map((m) => m[1]);
      const missingOnSite = toolNames.filter((t) => !listed.includes(t));
      const staleOnSite = listed.filter((t) => !toolNames.includes(t));
      siteOk = listed.length > 0 && missingOnSite.length === 0 && staleOnSite.length === 0;
      siteNote = siteOk
        ? `${listed.length} tools listed, matches server`
        : `missing on site: [${missingOnSite.join(', ')}] stale on site: [${staleOnSite.join(', ')}]`;
    } else siteNote = 'could not parse the TOOLS array';
  } catch {}
  console.log('site tool list matches server (' + siteNote + '): ok=' + siteOk);
}

// Skills are advertised in several docs by name. A listed-but-missing skill is
// a broken promise the user only discovers mid-task, and a shipped-but-unlisted
// skill is dead weight nobody loads. Check both directions against the folder.
{
  const root = new URL('../', import.meta.url);
  let skillsOk = false, skillsNote = 'skills/ not readable';
  try {
    const onDisk = readdirSync(new URL('skills/', root), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    const problems = [];
    for (const doc of ['AGENTS.md', 'README.md']) {
      const text = readFileSync(new URL(doc, root), 'utf8');
      // Parse only the skills list itself - the first non-empty line after a
      // "Skills" heading. Scanning the whole document instead picks up agent
      // names, which are backticked the same way and are not skills.
      const sec = text.match(/^#{2,3}[^\n]*Skills[^\n]*\n+([^\n]+)/m);
      if (!sec) { problems.push(`${doc} has no parsable Skills list`); continue; }
      const uniq = [...new Set([...sec[1].matchAll(/`(fluent-[a-z0-9-]+)`/g)].map((m) => m[1]))];
      const ghosts = uniq.filter((n) => !onDisk.includes(n));
      const unlisted = onDisk.filter((n) => !uniq.includes(n));
      if (ghosts.length) problems.push(`${doc} lists missing skill(s): ${ghosts.join(', ')}`);
      if (unlisted.length) problems.push(`${doc} omits shipped skill(s): ${unlisted.join(', ')}`);
    }
    skillsOk = problems.length === 0;
    skillsNote = skillsOk ? `${onDisk.length} skills, listed everywhere` : problems.join(' | ');
  } catch (e) {
    skillsNote = String(e && e.message ? e.message : e);
  }
  console.log('skills advertised match skills shipped (' + skillsNote + '): ok=' + skillsOk);
}

// Every skill named in an agent's frontmatter must exist on disk. A typo here
// fails silently at load time - the agent just runs without the guidance it was
// told to use, and nothing reports it.
{
  const root = new URL('../', import.meta.url);
  let agentsOk = false, agentsNote = 'agents/ not readable';
  try {
    const onDisk = readdirSync(new URL('skills/', root), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
    const files = readdirSync(new URL('agents/', root)).filter((f) => f.endsWith('.agent.md'));
    const bad = [];
    for (const f of files) {
      const text = readFileSync(new URL('agents/' + f, root), 'utf8');
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) { bad.push(`${f}: no frontmatter`); continue; }
      const block = fm[1].match(/skills:\r?\n((?:[ \t]*-[ \t]*[^\r\n]+\r?\n?)+)/);
      if (!block) continue;
      for (const name of [...block[1].matchAll(/-\s*([a-z0-9-]+)/g)].map((m) => m[1])) {
        if (!onDisk.includes(name)) bad.push(`${f} -> ${name}`);
      }
    }
    agentsOk = files.length > 0 && bad.length === 0;
    agentsNote = agentsOk ? `${files.length} agents, all skill refs resolve` : `unresolved: ${bad.join(', ')}`;
  } catch (e) {
    agentsNote = String(e && e.message ? e.message : e);
  }
  console.log('agent skill references resolve (' + agentsNote + '): ok=' + agentsOk);
}

// Every agent on disk must be listed in the docs that enumerate the roster, and
// those docs must not name an agent that doesn't exist. Same drift the tool list
// and skills list already had - three hand-maintained lists, no link to disk.
{
  const root = new URL('../', import.meta.url);
  let rosterOk = false, rosterNote = 'roster not readable';
  try {
    const onDisk = readdirSync(new URL('agents/', root))
      .filter((f) => f.endsWith('.agent.md')).map((f) => f.replace(/\.agent\.md$/, '')).sort();
    const docs = { 'AGENTS.md': /##[^\n]*Agents[^\n]*\r?\n+([^\n]+)/g, 'GUIDE.md': /\*\*Agents\*\*[^\n]*/g, 'README.md': /\|\s*`(fluent-[a-z0-9-]+)`\s*\|[^\n]*\|/g };
    const problems = [];
    for (const [file, re] of Object.entries(docs)) {
      const text = readFileSync(new URL(file, root), 'utf8');
      // A doc may mention "Agents" more than once (prose vs the actual roster);
      // keep only matches that actually name agents, else we lint the wrong line.
      const hits = [...text.matchAll(re)].map((m) => m[0]).filter((s) => /`fluent-[a-z0-9-]+`/.test(s));
      const scope = hits.join('\n');
      const named = [...new Set([...scope.matchAll(/`(fluent-[a-z0-9-]+)`/g)].map((m) => m[1]))];
      const listed = named.filter((n) => onDisk.includes(n));
      const missing = onDisk.filter((n) => !named.includes(n));
      const ghosts = named.filter((n) => n.endsWith('-engineer') || n.endsWith('-designer') || n.endsWith('-builder') || n.endsWith('-reviewer')).filter((n) => !onDisk.includes(n));
      if (missing.length) problems.push(`${file} omits ${missing.join('/')}`);
      if (ghosts.length) problems.push(`${file} names unknown ${ghosts.join('/')}`);
      if (!listed.length) problems.push(`${file} lists no agents`);
    }
    rosterOk = problems.length === 0;
    rosterNote = rosterOk ? `${onDisk.length} agents, listed everywhere` : problems.join('; ');
  } catch (e) {
    rosterNote = String(e && e.message ? e.message : e);
  }
  console.log('agent roster consistent across docs (' + rosterNote + '): ok=' + rosterOk);
}

// The site had NO media queries at all and overflowed every phone viewport.
// These classes are the ones that caused it, so require each to keep a
// responsive rule rather than trusting a future edit not to drop them.
{
  const root = new URL('../', import.meta.url);
  let respOk = false, respNote = 'App.tsx not readable';
  try {
    const src = readFileSync(new URL('site/src/App.tsx', root), 'utf8');
    const need = ['wrap', 'nav', 'navlinks', 'grid3', 'grid2', 'bandGrid', 'section', 'band', 'card'];
    const missing = need.filter((cls) => {
      // Take the class body up to the next top-level class declaration.
      const m = src.match(new RegExp('\\n  ' + cls + ': \\{([\\s\\S]*?)\\n  \\},'));
      return !m || !/@media/.test(m[1]);
    });
    const viewport = /name="viewport"[^>]*width=device-width/.test(readFileSync(new URL('site/index.html', root), 'utf8'));
    respOk = missing.length === 0 && viewport;
    respNote = respOk
      ? `${need.length} layout classes responsive, viewport meta present`
      : [missing.length ? 'no @media in: ' + missing.join(', ') : '', viewport ? '' : 'viewport meta missing'].filter(Boolean).join('; ');
  } catch (e) {
    respNote = String(e && e.message ? e.message : e);
  }
  console.log('site layout classes are responsive (' + respNote + '): ok=' + respOk);
}

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

// A project migrating FROM Fluent 1 is, mid-migration, still ON Fluent 1. If we
// defaulted it to v9 we would answer v8 code with v9 imports, so the version is
// inferred from migrationFrom unless stated outright.
const V8DIR = CFG_DIR + '-v8';
rmSync(V8DIR, { recursive: true, force: true });
const iv8 = await client.callTool({
  name: 'fluent_init_config',
  arguments: { projectDir: V8DIR, migrationFrom: 'fluent-v8' },
});
const iv8j = JSON.parse(iv8.content[0].text);
console.log('init_config(migrationFrom=fluent-v8) infers v8: got=' + iv8j.config?.fluentVersion + ' ok=' + (iv8j.config?.fluentVersion === 'v8'));

const V9DIR = CFG_DIR + '-v9';
rmSync(V9DIR, { recursive: true, force: true });
const iv9 = await client.callTool({ name: 'fluent_init_config', arguments: { projectDir: V9DIR } });
const iv9j = JSON.parse(iv9.content[0].text);
console.log('init_config default fluentVersion=v9: got=' + iv9j.config?.fluentVersion + ' ok=' + (iv9j.config?.fluentVersion === 'v9'));

// An explicit choice must win over the inference above.
const VXDIR = CFG_DIR + '-vx';
rmSync(VXDIR, { recursive: true, force: true });
const ivx = await client.callTool({
  name: 'fluent_init_config',
  arguments: { projectDir: VXDIR, migrationFrom: 'fluent-v8', fluentVersion: 'v9' },
});
const ivxj = JSON.parse(ivx.content[0].text);
console.log('explicit fluentVersion beats inference: got=' + ivxj.config?.fluentVersion + ' ok=' + (ivxj.config?.fluentVersion === 'v9'));

for (const d of [V8DIR, V9DIR, VXDIR]) rmSync(d, { recursive: true, force: true });

// A Power Pages user must be told Bootstrap is the stack and that Microsoft
// warns against swapping it; recommending a Fluent CSS library there breaks
// scenarios that depend on Bootstrap 3.3.x.
const ppMyths = (await client.callTool({ name: 'fluent_powerplatform_guidance', arguments: { surface: 'myths' } })).content[0].text;
let mythCount = 0, mythsSourced = 0;
try { const j = JSON.parse(ppMyths); mythCount = j.items?.length ?? 0; mythsSourced = (j.items ?? []).filter((m) => m.source).length; } catch {}
console.log('powerplatform myths: count=' + mythCount + ' sourced=' + mythsSourced + ' ok=' + (mythCount >= 10 && mythsSourced === mythCount));

const ppApplies = (await client.callTool({ name: 'fluent_powerplatform_guidance', arguments: { surface: 'applies' } })).content[0].text;
console.log('powerplatform applies matrix: ok=' + (ppApplies.length > 200 && !/not found|No per-surface/i.test(ppApplies)));

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

// "What is the Fluent 2 equivalent of Fabric Core?" has no good answer - there
// is no CSS-only Fluent 2 library - and the tempting failure is to name the
// nearest plausible package. The dataset records the absence explicitly so the
// tool can say so.
const v8nr = (await client.callTool({ name: 'fluent_v8_guidance', arguments: { section: 'non-react' } })).content[0].text;
let nrOk = false;
try {
  const j = JSON.parse(v8nr);
  nrOk = j.noCssOnlyFluent2?.exists === false && (j.lineage?.length ?? 0) >= 5 && !!j.officeUiFabricCore?.status;
} catch {}
console.log('v8 non-react lineage: ok=' + nrOk);

// 39 of 70 don't entries are bare imperatives like "Use emoji to replace
// meaningful text" - they mean the opposite of what they say unless the "dont"
// key travels with them. The convention must stay documented or a future
// flattening silently inverts the advice.
const dgConv = (await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'all' } })).content[0].text;
let dgOk = false;
try {
  const j = JSON.parse(dgConv);
  const c = j.$meta?.doDontConvention;
  dgOk = !!c && /negation lives in the "dont" key/i.test(c.warning ?? '');
} catch {}
console.log('doDont convention documented: ok=' + dgOk);

const aiTopic = (await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'personality-principles' } })).content[0].text;
let aiOk = false;
try {
  const j = JSON.parse(aiTopic);
  aiOk = j.accessStatus === 'employee-gated-captured' && (j.doDont?.dont?.length ?? 0) > 0 && (j.doDont?.do?.length ?? 0) > 0;
} catch {}
console.log('gated AI topic enriched: ok=' + aiOk);

// Figma. The rate-limit table on Figma's page renders with the Dev/Full row
// shifted: the value under "Starter" actually belongs to Professional. Figma's
// own prose disambiguates it - "If you're on a Starter plan (6 tool calls per
// month), upgrade to a Pro, Organization, or Enterprise plan." A naive
// re-transcription of the table would claim Starter Dev/Full gets 200/day and
// send users into a workflow that dies after 6 calls. Pin the corrected read.
const fig = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'access' } })).content[0].text;
let figOk = false, starterOk = false;
try {
  const j = JSON.parse(fig);
  const rows = j.rateLimits ?? [];
  const starterDev = rows.find((r) => /Dev/.test(r.seat) && r.plan === 'Starter');
  const entDev = rows.find((r) => /Dev/.test(r.seat) && r.plan === 'Enterprise');
  starterOk = starterDev?.perMonth === 6 && starterDev?.perDay === null;
  figOk = starterOk && entDev?.perDay === 600 && (j.exemptFromRateLimits ?? []).includes('whoami');
} catch {}
console.log('figma access: starter-dev-capped=' + starterOk + ' ok=' + figOk);

// Unconfirmed hosts must stay null, never false. `false` would assert Figma
// documents them as unsupported; we only know we could not read the catalog.
const figHosts = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'hosts' } })).content[0].text;
let hostsOk = false;
try {
  const j = JSON.parse(figHosts);
  const hs = j.hosts ?? [];
  const anyFalse = hs.some((h) => h.catalogConfirmed === false);
  const confirmed = hs.filter((h) => h.catalogConfirmed === true).map((h) => h.id);
  hostsOk = !anyFalse && confirmed.includes('vscode') && confirmed.includes('claude-code') &&
    hs.every((h) => typeof h.catalogStatus === 'string' && h.catalogStatus.length > 0);
} catch {}
console.log('figma hosts no false claims: ok=' + hostsOk);

// Code Connect has no Microsoft-published Fluent mappings. If this ever flips
// to a claim of support without a source, that is a fabrication.
const figCC = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'code-connect' } })).content[0].text;
let ccOk = false;
try {
  const j = JSON.parse(figCC);
  ccOk = j.fluentSupport === 'none' && /Organization or Enterprise/i.test(j.requiresPlan ?? '');
} catch {}
console.log('figma code-connect: fluentSupport=none ok=' + ccOk);

// Native platforms. The single highest-value fact here is that a component name
// does NOT resolve the same way across platforms, so pin real lookups rather
// than a bare "tool responds" check.
const nIos = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'ios', name: 'Avatar' } })).content[0].text;
const nAnd = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'android', name: 'Button' } })).content[0].text;
const nWin = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'windows', name: 'Button' } })).content[0].text;
const iosOk = /FluentUI/.test(nIos) && /MSFAvatar/.test(nIos);
const andOk = /com\.microsoft\.fluentui\.tokenized/.test(nAnd);
const winOk = /Microsoft\.UI\.Xaml\.Controls/.test(nWin);
console.log('native lookup ios: ok=' + iosOk);
console.log('native lookup android (tokenized = Fluent 2 Compose): ok=' + andOk);
console.log('native lookup windows: ok=' + winOk);

// An unknown name must be reported as unknown, never answered from the web API.
const nMiss = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'ios', name: 'ZzNotAControl' } })).content[0].text;
console.log('native unknown name reported not invented: ok=' + (/not/i.test(nMiss) && !/import FluentUI\n/.test(nMiss)));

// WinUI 2 is maintenance-only - last FEATURE release 2.8 (July 2022); 2.8.7 is a
// servicing patch. If this ever reads as "2.8.7 is the current release" we would
// be pointing new Windows work at a frozen framework. Verified against Learn.
const nWinG = (await client.callTool({ name: 'fluent_native_guidance', arguments: { platform: 'windows' } })).content[0].text;
const winuiOk = /maintenance/i.test(nWinG) && /2\.8/.test(nWinG) && /2\.3\.1/.test(nWinG);
console.log('native winui2 maintenance + wasdk current: ok=' + winuiOk);

// WPF-UI (lepoco) is a community project. Presenting it as Microsoft would send
// users to ship an unofficial dependency believing it is first-party.
console.log('native wpf community disclaimer surfaced: ok=' + /not Microsoft|community/i.test(nWinG));

await client.close();

const failures = _lines.filter((l) => /ok\s*=\s*false/i.test(l));

// A check only counts if its label ends in "ok=". Twice now a real failure has
// been printed under a different label (e.g. "disclaimer: false") and sailed
// through as a pass. Any line that reports a false-y result without the ok=
// marker is a malformed check, not a passing one - fail loudly on it.
const malformed = _lines.filter(
  (l) => /[:=]\s*false\b/i.test(l) && !/ok\s*=\s*false/i.test(l) && !/ok\s*=\s*true/i.test(l),
);
if (malformed.length) {
  _realLog('\nSMOKE FAILED: ' + malformed.length + ' malformed check(s) - a false result was printed without an "ok=" marker, so it would not have been counted:');
  for (const m of malformed) _realLog('  - ' + m);
  process.exit(1);
}

// Guard against the whole suite silently shrinking (renamed labels, an early
// return, a swallowed throw). A vacuous pass is worse than a failure.
const MIN_CHECKS = 60;
const passed = _lines.filter((l) => /ok\s*=\s*true/i.test(l)).length;
if (failures.length) {
  _realLog('\nSMOKE FAILED: ' + failures.length + ' check(s) did not pass:');
  for (const f of failures) _realLog('  - ' + f);
  process.exit(1);
}
if (passed < MIN_CHECKS) {
  _realLog('\nSMOKE FAILED: only ' + passed + ' checks ran, expected at least ' + MIN_CHECKS + ' — checks were dropped, not fixed.');
  process.exit(1);
}
_realLog('\nSMOKE PASSED: ' + passed + ' checks ok');
process.exit(0);
