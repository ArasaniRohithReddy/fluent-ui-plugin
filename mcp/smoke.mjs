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
const EXPECTED_TOOL_COUNT = 29;
const REQUIRED_TOOLS = [
  'fluent_search_components', 'fluent_get_component', 'fluent_list_tokens', 'fluent_get_token',
  'fluent_generate_theme', 'fluent_generate_powerbi_theme', 'fluent_scaffold_pbip', 'fluent_powerbi_visuals',
  'fluent_powerplatform_guidance', 'fluent_generate_code', 'fluent_accessibility_checklist',
  'fluent_design_guidance', 'fluent_migration_guidance', 'fluent_get_images',
  'fluent_get_config', 'fluent_init_config', 'fluent_set_config', 'fluent_remember', 'fluent_recall',
  'fluent_v8_lookup', 'fluent_v8_guidance', 'fluent_figma_guidance',
  'fluent_native_component', 'fluent_native_guidance', 'fluent_icon_search',
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

// The datasets record what the research could NOT confirm, but that honesty was
// unreachable: a lookup returned confident API detail while 203 caveats sat in a
// side channel only a caller who asked for section='unverified' would ever see.
// These assert the caveats now travel with the answer.
{
  const nat = await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'ios', name: 'Avatar' } });
  const v8p = await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'Stack' } });
  const figp = await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'kits' } });
  const hasProv = (r) => r.content[0].text.includes('Provenance:');
  const hasCaveat = (r) => r.content[0].text.includes('NOT independently verified');
  const all = [nat, v8p, figp];
  console.log('unverified caveats surface at point of use: ok=' + (all.every(hasProv) && all.every(hasCaveat)));
  // The pointer has to name a parameter that actually exists, or it sends the
  // caller into an error - `section`, not `topic`.
  const badParam = all.some((r) => /\{\s*topic:/.test(r.content[0].text));
  console.log('provenance pointer uses a real parameter: ok=' + !badParam);
}

// Guidance from sign-in-gated Microsoft pages must not be redistributed (NOTICE).
// The published datasets keep factual scaffolding plus a `gatedNotice`; the prose
// lives in gitignored mcp/data/local/ and is merged back at runtime.
{
  const root = new URL('../', import.meta.url);
  let gOk = false, gNote = '';
  try {
    const usage = JSON.parse(readFileSync(new URL('mcp/data/fluent-components-usage.json', root), 'utf8'));
    const gated = Object.values(usage).filter((u) => u && u.contentSource === 'gated-capture');
    const leaked = gated.filter((u) => (u.description && u.description.length) || (u.behavior && u.behavior.length) || u.capture);
    const noticed = gated.filter((u) => u.gatedNotice);
    const notice = readFileSync(new URL('NOTICE', root), 'utf8');
    // NOTICE previously claimed no gated content was redistributed while 141KB was.
    const honest = !/No\s+Microsoft-internal or sign-in-gated content is redistributed/i.test(notice);
    gOk = gated.length > 0 && leaked.length === 0 && noticed.length === gated.length && honest;
    gNote = gOk
      ? `${gated.length} gated entries carry a pointer, no prose redistributed`
      : [leaked.length ? `${leaked.length} entries still carry gated prose` : '',
         noticed.length !== gated.length ? `${gated.length - noticed.length} missing gatedNotice` : '',
         honest ? '' : 'NOTICE makes a claim the data contradicts'].filter(Boolean).join('; ');
  } catch (e) { gNote = String(e && e.message ? e.message : e); }
  console.log('no sign-in-gated prose in tracked data (' + gNote + '): ok=' + gOk);
}

// The plugin manifest exists in four places because each host looks somewhere
// different, and hand-maintained copies drift: the root file reached 41
// keywords while the three copies sat frozen at 27, so the manifests Claude,
// Codex and GitHub actually read described an older, smaller product than the
// one shipping. Root is the source of truth; this fails the build on drift.
{
  const root = new URL('../', import.meta.url);
  let mfOk = false, mfNote = '';
  try {
    const rootMf = JSON.parse(readFileSync(new URL('plugin.json', root), 'utf8'));
    const copies = ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.github/plugin/plugin.json'];
    const stable = (o) => JSON.stringify(o, Object.keys(o).sort());
    const drift = copies.filter((c) => stable(JSON.parse(readFileSync(new URL(c, root), 'utf8'))) !== stable(rootMf));
    // Every version string a user can see must agree, including the one the
    // server reports over MCP (read from package.json, not hardcoded).
    const versions = {
      plugin: rootMf.version,
      mcp: JSON.parse(readFileSync(new URL('mcp/package.json', root), 'utf8')).version,
      site: JSON.parse(readFileSync(new URL('site/package.json', root), 'utf8')).version,
    };
    const mismatched = Object.entries(versions).filter(([, v]) => v !== rootMf.version).map(([k]) => k);
    // The manifest must describe everything the plugin ships, or hosts undersell it.
    const blob = JSON.stringify(rootMf).toLowerCase();
    const surfaces = ['ios', 'android', 'windows', 'figma', 'power bi', 'v8'];
    const unlisted = surfaces.filter((s) => !blob.includes(s));
    mfOk = drift.length === 0 && mismatched.length === 0 && unlisted.length === 0;
    mfNote = mfOk
      ? `3 copies in sync, all versions ${rootMf.version}, all surfaces listed`
      : [drift.length ? 'drifted: ' + drift.join(', ') : '',
         mismatched.length ? 'version mismatch: ' + mismatched.join(', ') : '',
         unlisted.length ? 'surfaces missing from manifest: ' + unlisted.join(', ') : ''].filter(Boolean).join('; ');
  } catch (e) { mfNote = String(e && e.message ? e.message : e); }
  console.log('plugin manifests in sync (' + mfNote + '): ok=' + mfOk);
}

// register-mcp.mjs --figma writes each host's Figma entry from figma.json.
// These key names are host-specific and fail SILENTLY when wrong (Windsurf
// ignores `url`, Gemini ignores anything but `httpUrl`), and Claude Desktop's
// mcpServers is stdio-only so it must stay unregistered rather than get a
// broken remote entry. Lock all three in.
{
  const root = new URL('../', import.meta.url);
  let figOk = false, figNote = '';
  try {
    const fig = JSON.parse(readFileSync(new URL('mcp/data/figma.json', root), 'utf8'));
    const byId = Object.fromEntries((fig.hosts || []).map((h) => [h.id, h]));
    const urlKeyOf = (id) => {
      const h = byId[id];
      const inner = h && h.snippet && h.configKey ? h.snippet[h.configKey]?.figma : null;
      return inner ? Object.keys(inner).find((k) => /url$/i.test(k)) : null;
    };
    const expect = { windsurf: 'serverUrl', 'gemini-cli': 'httpUrl', vscode: 'url', 'claude-code': 'url' };
    const wrong = Object.entries(expect).filter(([id, key]) => urlKeyOf(id) !== key);
    const claudeDesktopSafe = !byId['claude-desktop']?.snippet;
    const claudeCodeTyped = !!byId['claude-code']?.snippet?.mcpServers?.figma?.type;
    const installerReads = /figma\.json/.test(readFileSync(new URL('hosts/register-mcp.mjs', root), 'utf8'));
    figOk = wrong.length === 0 && claudeDesktopSafe && claudeCodeTyped && installerReads;
    figNote = figOk
      ? 'per-host url keys correct, Claude Desktop excluded, Claude Code typed'
      : [wrong.length ? 'wrong url key: ' + wrong.map(([i, k]) => `${i} wants ${k}`).join(', ') : '',
         claudeDesktopSafe ? '' : 'Claude Desktop must not get a remote entry',
         claudeCodeTyped ? '' : 'Claude Code entry needs type',
         installerReads ? '' : 'installer does not read figma.json'].filter(Boolean).join('; ');
  } catch (e) { figNote = String(e && e.message ? e.message : e); }
  console.log('figma host dialects intact (' + figNote + '): ok=' + figOk);
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
// Slot 80 used to be asserted as the input hex itself ("80: '#D13438'"). That was only true of
// the old HSL ramp, which pinned slot 80 to the key colour. The real Theme Designer algorithm
// treats the key colour as the point where the two Bezier curves MEET and samples the 16 slots
// at fixed, hue-specific lightness stops, so slot 80 is a near neighbour instead: #b53031.
// Verified byte-for-byte against Microsoft's live Theme Designer, so the new value is the
// correct one - see the ramp-parity checks at the end of this file.
console.log('generate_theme: ok=' + (th.content[0].text.includes('BrandVariants') && th.content[0].text.includes('createDarkTheme') && th.content[0].text.includes("80: '#b53031'")));
const cd = await client.callTool({ name: 'fluent_generate_code', arguments: { kind: 'form', framework: 'react', componentName: 'ContactForm' } });
console.log('generate_code(form): ok=' + cd.content[0].text.includes('FluentProvider'));

const dg = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'motion' } });
const dgText = dg.content[0].text;
console.log('design_guidance(motion): ok=' + (dgText.length > 0 && dgText.includes('durationNormal') && dgText.includes('curveEasyEase')));
const dgAll = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'all' } });
const dgAllText = dgAll.content[0].text;
let dgTopics = 0; try { const j = JSON.parse(dgAllText); dgTopics = Object.keys(j.topics || {}).length; } catch {}
// 42 since the two get-started routes (/get-started/design, /get-started/develop)
// were added — they were the last uncovered public routes with real content.
console.log('design_guidance(all): topics=' + dgTopics + ' ok=' + (dgTopics === 42 && dgAllText.includes('design-principles') && dgAllText.includes('design-tokens')));
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

// "Is X stable, preview or still planned?" was unanswerable before the roadmap
// topic landed. Assert the lifecycle stages AND a real table row, so a topic
// that degrades to prose without its status table fails here.
const dgRoad = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'component-roadmap', maxChars: 120000 } });
const dgRoadText = dgRoad.content[0].text;
let roadRows = 0;
try { roadRows = JSON.parse(dgRoadText).roadmap.rows.length; } catch {}
console.log('design_guidance(component-roadmap): rows=' + roadRows + ' ok=' + (roadRows === 63
  && /Unstable \(Preview\)/.test(dgRoadText) && /Stable \(Released\)/.test(dgRoadText)
  && dgRoadText.includes('unstable deep import')));

const dgNew = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'whats-new' } });
const dgNewText = dgNew.content[0].text;
console.log('design_guidance(whats-new): ok=' + (dgNewText.includes('Standardized corners') && dgNewText.includes('Accessibility notation')
  && hasLinkTo(dgNewText, 'fluent2.microsoft.design', '/get-started/whatisnew/')));

// The component manifest is an index, not a component reference: it must carry
// routes and library availability and must NOT start duplicating the records in
// fluent-components.json.
const dgIdx = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'web-component-index', maxChars: 120000 } });
let idxReact = 0, idxWc = 0;
try { const j = JSON.parse(dgIdx.content[0].text); idxReact = j.react.length; idxWc = j.webComponents.length; } catch {}
console.log('design_guidance(web-component-index): react=' + idxReact + ' webComponents=' + idxWc
  + ' ok=' + (idxReact === 47 && idxWc === 26 && dgIdx.content[0].text.includes('/components/web/react/core/accordion/usage')));

// The site answers HTTP 200 for unknown paths, so a plugin that trusts status
// codes will happily ingest the 404 page. And a gated page must be reported as
// employee-only, never as missing.
const dgRoutes = await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'site-routes', maxChars: 120000 } });
const dgRoutesText = dgRoutes.content[0].text;
let gatedCount = 0, gatedWithContent = 0;
try {
  const g = JSON.parse(dgRoutesText).gatedRoutes || [];
  gatedCount = g.length;
  gatedWithContent = g.filter((r) => r.sections || r.keyPoints || r.summary || r.text).length;
} catch {}
console.log('design_guidance(site-routes): gated=' + gatedCount + ' ok=' + (gatedCount === 6 && gatedWithContent === 0
  && dgRoutesText.includes('/.auth/login/aad') && /200/.test(dgRoutesText) && dgRoutesText.includes('/color-tokens2/')));

// Alias colour tokens carry provenance the hex cannot: which global slot they
// resolve to per theme. Values still come from the npm package - if these two
// ever disagree the package wins, so assert both together.
const tkColor = (await client.callTool({ name: 'fluent_list_tokens', arguments: { category: 'color' } })).content[0].text;
console.log('list_tokens(color) exposes global slot map: ok=' + (tkColor.includes('aliasGlobalTokens')
  && /"colorBrandBackground":\s*"brand\[80\] \(light\) \/ brand\[70\] \(dark\)"/.test(tkColor)));
const gtAlias = (await client.callTool({ name: 'fluent_get_token', arguments: { name: 'colorNeutralBackground1Hover' } })).content[0].text;
console.log('get_token(colorNeutralBackground1Hover) global slots + state: ok=' + (gtAlias.includes('"globalLight": "grey[96]"')
  && gtAlias.includes('"globalDark": "grey[24]"') && gtAlias.includes('"state": "Hover"') && gtAlias.includes('#f5f5f5')));
// Supplemented from /color-tokens2/ (the duplicate route) because the canonical
// page omits the compound-brand aliases entirely.
const gtCompound = (await client.callTool({ name: 'fluent_get_token', arguments: { name: 'colorCompoundBrandBackground' } })).content[0].text;
console.log('get_token(colorCompoundBrandBackground): ok=' + (gtCompound.includes('"globalLight": "brand[80]"') && gtCompound.includes('#0f6cbd')));

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

// ocrText is the copy rendered INSIDE an image. It is the only way an agent can
// quote Microsoft's actual recommended wording (consent strings, type ramps)
// instead of paraphrasing a description, so both the search path and the
// rendered output must keep working.
const imgOcr = await client.callTool({ name: 'fluent_get_images', arguments: { query: 'send optional data' } });
const imgOcrText = imgOcr.content[0].text;
console.log('get_images(searches on-screen text): ok=' + (imgOcrText.includes('On-screen text:') && /optional data/i.test(imgOcrText)));
{
  const media = JSON.parse(readFileSync(new URL('data/fluent-images.json', import.meta.url), 'utf8'));
  const withOcr = media.media.filter((m) => m.ocrText && m.ocrText.trim()).length;
  const declared = media.$meta?.counts?.withOcrText;
  console.log('images dataset ocrText count matches $meta (' + withOcr + ' vs ' + declared + '): ok=' + (withOcr > 0 && withOcr === declared));
}

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

// This topic is published behind a Microsoft employee sign-in, so its guidance
// text is deliberately NOT redistributed (see NOTICE). Assert against the
// TRACKED file rather than the tool output: a machine that has the gitignored
// mcp/data/local/ overlay gets the full text merged back at runtime, which is
// correct behaviour but tells you nothing about what a public clone receives.
{
  let aiOk = false, aiNote = '';
  try {
    const dg = JSON.parse(readFileSync(new URL('data/design-guidance.json', import.meta.url), 'utf8'));
    const t = dg.topics?.['personality-principles'];
    const gated = typeof t?.accessStatus === 'string' && t.accessStatus.startsWith('employee-gated');
    const pointsToSource = typeof t?.docUrl === 'string' && t.docUrl.includes('fluent2.microsoft.design');
    const explains = typeof t?.gatedNotice === 'string' && t.gatedNotice.length > 40;
    const noProse = !t?.summary && !(t?.sections?.length) && !(t?.doDont?.do?.length);
    aiOk = gated && pointsToSource && explains && noProse;
    aiNote = aiOk ? 'resolves, links the official page, prose withheld' : `gated=${gated} docUrl=${pointsToSource} notice=${explains} withheld=${noProse}`;
  } catch (e) { aiNote = String(e && e.message ? e.message : e); }
  console.log('gated AI topic resolves without redistributing prose (' + aiNote + '): ok=' + aiOk);
}

// The overlay must actually restore the withheld text for a reader who has it,
// otherwise withholding it would be a straight capability loss.
{
  const overlay = new URL('data/local/design-guidance.json', import.meta.url);
  let ovNote = 'no local overlay present — public-clone behaviour', ovOk = true;
  if (existsSync(overlay)) {
    const restored = JSON.parse((await client.callTool({ name: 'fluent_design_guidance', arguments: { topic: 'personality-principles' } })).content[0].text);
    ovOk = !!restored.summary && (restored.sections?.length ?? 0) > 0 && !restored.gatedNotice;
    ovNote = ovOk ? 'local overlay restores full guidance' : 'local overlay present but did NOT restore';
  }
  console.log('gated overlay round-trips (' + ovNote + '): ok=' + ovOk);
}

// Figma. The rate-limit table on Figma's page renders with the Dev/Full row
// shifted: the value under "Starter" actually belongs to Professional. Figma's
// own prose disambiguates it - "If you're on a Starter plan (20 tool calls per
// month), upgrade to a Pro, Organization, or Enterprise plan." A naive
// re-transcription of the table would claim Starter Dev/Full gets 200/day and
// send users into a workflow that dies inside a month. Pin the corrected read.
// CORRECTED 2026-08: Starter is 20/month, not 6. The 6/month figure belongs to
// View/Collab on the three PAID plans - asserting 6 for Starter overstated the
// paywall and is the error this check previously locked in.
const fig = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'access' } })).content[0].text;
let figOk = false, starterOk = false;
try {
  const j = JSON.parse(fig);
  const rows = j.rateLimits ?? [];
  const starterDev = rows.find((r) => /Dev/.test(r.seat) && r.plan === 'Starter');
  const starterView = rows.find((r) => /View/.test(r.seat) && r.plan === 'Starter');
  const paidView = rows.find((r) => /View/.test(r.seat) && r.plan === 'Enterprise');
  const entDev = rows.find((r) => /Dev/.test(r.seat) && r.plan === 'Enterprise');
  starterOk = starterDev?.perMonth === 20 && starterDev?.perDay === null && starterView?.perMonth === 20 && paidView?.perMonth === 6;
  figOk = starterOk && entDev?.perDay === 600 && (j.exemptFromRateLimits ?? []).includes('whoami');
} catch {}
console.log('figma access: starter-capped-at-20 + paid-view-6=' + starterOk + ' ok=' + figOk);

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
const winuiOk = /maintenance/i.test(nWinG) && /2\.8/.test(nWinG) && /2\.4\.0/.test(nWinG);
console.log('native winui2 maintenance + wasdk current: ok=' + winuiOk);

// WPF-UI (lepoco) is a community project. Presenting it as Microsoft would send
// users to ship an unofficial dependency believing it is first-party.
console.log('native wpf community disclaimer surfaced: ok=' + /not Microsoft|community/i.test(nWinG));

// --- Native dataset regressions -------------------------------------------
// Windows App SDK 2.3.1 was stale: 2.4.0 shipped 2026-08-13 (microsoft/WindowsAppSDK
// release v2.4.0, prerelease=false). A stale pin here makes developers ship an
// outdated package, so assert the old number is gone from BOTH the data and the skill.
const nativeRaw = readFileSync(new URL('data/fluent-native.json', import.meta.url), 'utf8');
const nativeSkill = readFileSync(new URL('../skills/fluent-native/SKILL.md', import.meta.url), 'utf8');
const nativeData = JSON.parse(nativeRaw);
console.log(
  'native wasdk 2.3.1 purged from dataset + skill: ok=' +
    (!/2\.3\.1/.test(nativeRaw) && !/2\.3\.1/.test(nativeSkill) && /2\.4\.0/.test(nativeRaw) && /2\.4\.0/.test(nativeSkill)),
);

// The 14 Android Fluent 2 composables that were found by directory listing and then
// never added. Each must resolve to a tokenized.* import (Fluent 2 Compose), not to
// a Fluent 1 View package.
const ANDROID_ADDED = [
  'ActionBar', 'AnnouncementCard', 'FileCard', 'SideRail', 'ViewPager', 'PeoplePicker',
  'AvatarCarousel', 'AvatarPie', 'PersonaChip', 'PersonaList', 'ProgressText',
  'PillBar', 'PillSwitch', 'PillTabs',
];
let androidAddedOk = 0;
for (const nm of ANDROID_ADDED) {
  const t = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'android', name: nm } })).content[0].text;
  if (/com\.microsoft\.fluentui\.tokenized\./.test(t) && /"generation": "Fluent 2"/.test(t)) androidAddedOk++;
}
console.log('native android 14 new composables resolve (' + androidAddedOk + '/' + ANDROID_ADDED.length + '): ok=' + (androidAddedOk === ANDROID_ADDED.length));

// PillBar lives in Pill.kt and PeoplePicker exists on BOTH generations — the exact
// traps this dataset is for. Assert the artifact/import, not just presence.
const nPillBar = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'android', name: 'PillBar' } })).content[0].text;
console.log(
  'native android PillBar keeps file-name-vs-composable trap: ok=' +
    (/tokenized\.segmentedcontrols\.PillBar/.test(nPillBar) && /Pill\.kt/.test(nPillBar)),
);

// iOS Shimmer is documented on the Fluent 2 site (/components/ios/core/shimmer/usage/
// returns 200) and was missing entirely. It must resolve by the SITE name too.
const nShimmer = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'ios', name: 'Shimmer' } })).content[0].text;
console.log(
  'native ios Shimmer resolves by site name to ShimmerView: ok=' +
    (/ShimmerView/.test(nShimmer) && /MSFShimmerStyle/.test(nShimmer) && /import FluentUI/.test(nShimmer)),
);

// Every Windows entry must be classified. `kind` is the FRAMEWORK (winui3/winui2/wpf);
// `apiKind` says whether it is a control at all — without it the "77 components" count
// silently included a layout panel, a WPF property, an assembly and a resource key.
const winComponents = Object.entries(nativeData.platforms.windows.components);
const winMissingKind = winComponents.filter(([, c]) => !c.kind || !c.apiKind).map(([n]) => n);
const declaredApiKinds = new Set((nativeData.platforms.windows.apiKinds ?? []).map((k) => k.apiKind));
const winBadApiKind = winComponents.filter(([, c]) => !declaredApiKinds.has(c.apiKind)).map(([n]) => n);
console.log(
  'native windows every entry has kind + declared apiKind: ok=' +
    (winMissingKind.length === 0 && winBadApiKind.length === 0 && declaredApiKinds.size > 1),
);

// `a11y` has to mean accessibility or it is worth nothing. Version-introduction
// facts and Mica styling tips belong in `notes`.
const a11yPolluted = winComponents
  .filter(([, c]) => typeof c.a11y === 'string' && /Introduced in WinUI|WinUI 3 only|Mica|corner radius|ThemeShadow/i.test(c.a11y))
  .map(([n]) => n);
console.log('native windows a11y field free of non-a11y notes: ok=' + (a11yPolluted.length === 0));

// meta.counts must track the real lengths, or the dataset lies about its own size.
const c = nativeData.meta.counts;
const countsOk =
  c.components.ios === Object.keys(nativeData.platforms.ios.components).length &&
  c.components.android === Object.keys(nativeData.platforms.android.components).length &&
  c.components.windows === winComponents.length &&
  c.components.total === c.components.ios + c.components.android + c.components.windows &&
  c.windowsControlsOnly === winComponents.filter(([, x]) => x.apiKind === 'control').length &&
  c.siteRoutes === nativeData.siteRoutes.length &&
  c.unverified === nativeData.unverified.length;
console.log('native meta.counts match actual lengths (unverified=' + c.unverified + '): ok=' + countsOk);

// Retired caveats must actually disappear. gh api now succeeds against microsoft/*,
// so the three "403 SAML" notes and the unread-PillBar-signature note are false and
// must not resurface. Scope this to the caveat list itself — meta.unverifiedPolicy
// deliberately names what was retired, and that prose is the audit trail, not a caveat.
const unvText = JSON.stringify(nativeData.unverified);
const retiredGone = !/403 SAML|GitHub contents API was blocked|PillBar composable name was confirmed|branch-tip \(master/i.test(unvText);
console.log('native retired SAML/PillBar caveats gone from caveat list: ok=' + retiredGone);
const nUnvAndroid = (await client.callTool({ name: 'fluent_native_guidance', arguments: { platform: 'android', section: 'unverified' } })).content[0].text;
let unvAndroidOk = false;
try {
  const parsed = JSON.parse(nUnvAndroid);
  unvAndroidOk =
    Array.isArray(parsed.notes) &&
    parsed.count === parsed.notes.length &&
    !parsed.notes.some((n) => /403 SAML|branch-tip \(master/i.test(n)) &&
    parsed.notes.some((n) => /read from source at tag v0\.3\.14/i.test(n));
} catch {}
console.log('native unverified section drops retired caveats: ok=' + unvAndroidOk);

// The provenance footer is the honesty mechanism — it must still fire.
console.log('native provenance footer still emitted: ok=' + (/Provenance: \d+ caveat/.test(nShimmer) && /Provenance: \d+ caveat/.test(nPillBar)));

// React Native must be ANSWERED, not schema-rejected. A hard Zod error reads as a
// broken tool; the dataset knows the repo, the packages and why it is out of scope.
const nRn = (await client.callTool({ name: 'fluent_native_component', arguments: { platform: 'react-native', name: 'Avatar' } })).content[0].text;
console.log(
  'native react-native answered gracefully, not rejected: ok=' +
    (/out of scope/i.test(nRn) && /fluentui-react-native/.test(nRn) && !/Invalid enum|invalid_enum_value/i.test(nRn)),
);
console.log('native skill agrees react-native is out of scope: ok=' + /React Native is out of scope/i.test(nativeSkill));

// ---------------------------------------------------------------------------
// Component catalog integrity.
//
// The catalog is regenerated by scripts/generate-components.mjs from the Fluent
// UI Storybook LLM pages plus the API-Extractor report. Before that rewrite it
// shipped API facts that would not compile: `Nav` was imported alone next to a
// sample built from NavDrawer/NavDrawerBody/NavItem, `Tree.selectionMode` was
// the API-Extractor internal `SelectionMode_2`, `Toast.appearance` was an
// internal context type, slots were missing everywhere, and 10 records were
// keyed by an English sentence. These guard each of those regressions.
// ---------------------------------------------------------------------------
{
  const catalog = JSON.parse(readFileSync(new URL('data/fluent-components.json', import.meta.url), 'utf8'));
  const comps = catalog.components || [];
  const byName = (n) => comps.filter((c) => c.name === n);
  const propOf = (c, p) => (c.keyProps || []).find((x) => x.name === p);

  console.log('component catalog size (' + comps.length + ' records): ok=' + (comps.length > 200));

  // A record keyed by prose ("Chat input") hands an MCP consumer a sentence
  // where it expects a component name.
  const spaced = comps.filter((c) => /\s/.test(c.name));
  console.log('no component name contains a space (' + spaced.map((c) => c.name).join(', ') + '): ok=' + (spaced.length === 0));

  // Maturity is what tells a caller whether an import even resolves from the
  // suite (preview/compat packages are not re-exported).
  const noMaturity = comps.filter((c) => !c.maturity);
  const badMaturity = comps.filter(
    (c) => c.maturity && !['stable', 'preview', 'compat', 'migration', 'utility', 'deprecated'].includes(c.maturity)
  );
  console.log(
    'every component has a valid maturity (' +
      Object.entries(comps.reduce((a, c) => ((a[c.maturity] = (a[c.maturity] || 0) + 1), a), {}))
        .map(([k, v]) => `${k}:${v}`)
        .join(' ') +
      '): ok=' + (noMaturity.length === 0 && badMaturity.length === 0)
  );

  // `SelectionMode_2` is an API-Extractor disambiguation suffix, not a TypeScript
  // type. Anything ending _<digits> came from the wrong side of the toolchain.
  const mangled = comps.flatMap((c) => (c.keyProps || []).filter((p) => /_\d+$/.test(p.type || '')).map((p) => `${c.name}.${p.name}:${p.type}`));
  console.log('no mangled API-Extractor prop types (' + (mangled.slice(0, 3).join(', ') || 'none') + '): ok=' + (mangled.length === 0));

  // `required` did not exist in the old schema, so Tab.value read as optional.
  const missingRequired = comps.flatMap((c) => (c.keyProps || []).filter((p) => typeof p.required !== 'boolean'));
  console.log('every prop declares required (' + missingRequired.length + ' missing): ok=' + (missingRequired.length === 0));

  // Every sample tag must be importable from the record's own import block, or
  // be declared inside the sample itself (bundleIcon consts, local helpers). Nav
  // is the case that failed before: the sample rendered NavDrawer while the
  // import said Nav. The boundary in the pattern keeps TypeScript type arguments
  // (`<DataGridBody<Item>>`) out of the tag list.
  const JSX_TAG = /(^|[^\w>])<([A-Z][\w$]*)(?=[\s/>])/g;
  const tagsIn = (s) => [...new Set([...String(s).matchAll(JSX_TAG)].map((m) => m[2]))];
  const unresolvedTags = [];
  for (const c of comps) {
    if (!c.sample || !c.reactImport) continue;
    const declared = new Set([...c.sample.matchAll(/^\s*(?:const|let|function)\s+([A-Z][\w$]*)/gm)].map((m) => m[1]));
    for (const t of tagsIn(c.sample)) {
      if (declared.has(t)) continue;
      if (new RegExp('\\b' + t + '\\b').test(c.reactImport)) continue;
      unresolvedTags.push(`${c.name}:<${t}>`);
    }
  }
  console.log('every sample tag is imported or locally declared (' + (unresolvedTags.slice(0, 4).join(', ') || 'none') + '): ok=' + (unresolvedTags.length === 0));

  const navFile = byName('Nav')[0];
  const navSampleTags = navFile ? tagsIn(navFile.sample || '') : [];
  const navDeclared = new Set([...(navFile?.sample || '').matchAll(/^\s*const\s+([A-Z][\w$]*)/gm)].map((m) => m[1]));
  const navOk =
    !!navFile &&
    navSampleTags.length > 0 &&
    navSampleTags.every((t) => navDeclared.has(t) || new RegExp('\\b' + t + '\\b').test(navFile.reactImport)) &&
    /NavDrawer\b/.test(navFile.reactImport) &&
    !!propOf(navFile, 'density') &&
    propOf(navFile, 'selectedValue')?.type === 'string';
  console.log('Nav sample identifiers all appear in its import: ok=' + navOk);

  const dg = byName('DataGrid')[0];
  const dgOk =
    !!dg &&
    propOf(dg, 'items')?.required === true &&
    propOf(dg, 'columns')?.required === true &&
    !!propOf(dg, 'getRowId') &&
    propOf(dg, 'selectionMode')?.type === '"multiselect" | "single"';
  console.log('DataGrid exposes items/columns/getRowId and a real selectionMode: ok=' + dgOk);

  const toastOk = propOf(byName('Toast')[0] || {}, 'appearance')?.type === '"brand" | "inverted"';
  console.log('Toast.appearance is the literal union, not a context type: ok=' + toastOk);

  const avatarColor = propOf(byName('Avatar')[0] || {}, 'color')?.type || '';
  const avatarOk = avatarColor.includes('"anchor"') && (byName('Avatar')[0]?.slots || []).includes('image');
  console.log('Avatar.color includes "anchor" and slots are populated: ok=' + avatarOk);

  // Components/List and Migration Shims/V0/List both export `List`. Before this
  // rewrite the two were conflated into one record with the shim's props.
  const lists = byName('List');
  const listOk =
    lists.length === 2 &&
    lists.some((l) => l.maturity === 'stable' && !propOf(l, 'layout')) &&
    lists.some((l) => l.maturity === 'migration' && propOf(l, 'layout') && propOf(l, 'truncateHeader'));
  console.log('List v9 and the V0 shim are separate records: ok=' + listOk);

  // Slots were missing from every component sampled. Spot-check the shapes that
  // are impossible to compose without them.
  const slotExpect = {
    Input: ['root', 'input', 'contentBefore', 'contentAfter'],
    Field: ['label', 'hint', 'validationMessage', 'validationMessageIcon'],
    Popover: ['surfaceMotion', 'mountNode'],
  };
  const slotMisses = Object.entries(slotExpect).filter(([n, want]) => {
    const got = byName(n)[0]?.slots || [];
    return !want.every((s) => got.includes(s));
  });
  console.log('slots present on Input/Field/Popover: ok=' + (slotMisses.length === 0));

  // Records we cannot confirm against any public source must say so rather than
  // sitting alongside grounded ones looking identical.
  const unver = comps.filter((c) => c.verified === false);
  const unverOk =
    unver.every((c) => c.sourceUrl === null && typeof c.verificationNote === 'string') &&
    comps.filter((c) => c.verified === true).every((c) => typeof c.sourceUrl === 'string');
  console.log('unverified records flagged, verified records carry a sourceUrl (' + unver.length + ' unverified): ok=' + unverOk);

  // -------------------------------------------------------------------------
  // Web components. Tags come from the shipped custom elements manifest. We used
  // to ship <fluent-textarea>, which has never existed in v2 or v3 - the real tag
  // is fluent-text-area - so generated markup rendered an unknown element and
  // displayed nothing. A hand-typed tag must not be possible again.
  // -------------------------------------------------------------------------
  {
    const tagged = comps.filter((c) => c.webComponent);
    const badShape = tagged.filter((c) => !/^<fluent-[a-z0-9-]+>$/.test(c.webComponent));
    const phantom = comps.filter((c) => c.webComponent === '<fluent-textarea>');
    console.log('no phantom <fluent-textarea>; every tag well-formed (' + tagged.length + ' tagged): ok=' +
      (phantom.length === 0 && badShape.length === 0));

    const textarea = comps.find((c) => c.id === 'components-textarea');
    const taOk = textarea && textarea.webComponent === '<fluent-text-area>' &&
      /web-components\/textarea\/define\.js/.test(textarea.webComponentDefine || '');
    console.log('Textarea maps to <fluent-text-area> with a real define path: ok=' + !!taOk);

    // Mandatory children were missing entirely, which made the Dialog/Drawer/
    // Accordion/Tree/Dropdown web-component entries unusable.
    const need = ['<fluent-accordion-item>', '<fluent-drawer-body>', '<fluent-dropdown-option>',
      '<fluent-listbox>', '<fluent-rating-display>', '<fluent-text-area>', '<fluent-tree-item>'];
    const have = new Set(comps.map((c) => c.webComponent));
    const missingTags = need.filter((t) => !have.has(t));
    console.log('child/element tags present (' + (missingTags.join(', ') || 'none missing') + '): ok=' + (missingTags.length === 0));

    // WC attributes are kebab-case; storing the React camelCase names here would
    // produce markup the element never reads.
    const camel = comps.flatMap((c) => (c.webComponentAttributes || [])
      .filter((a) => /[A-Z]/.test(a.name)).map((a) => c.name + '.' + a.name));
    console.log('web-component attributes are kebab-case (' + (camel.slice(0, 3).join(', ') || 'none camelCase') + '): ok=' + (camel.length === 0));

    const wcMeta = catalog.meta.webComponents || {};
    const wcMetaOk = wcMeta.version === catalog.meta.webComponentsPackageVersion &&
      wcMeta.tagsDeclared === 42 && Array.isArray(wcMeta.unmappedTags);
    console.log('web-components meta pinned to the manifest (v' + wcMeta.version + ', ' + wcMeta.tagsDeclared + ' tags): ok=' + wcMetaOk);
  }

  // -------------------------------------------------------------------------
  // AI (Copilot) suite. ai.fluentui.dev is Entra-gated, but the npm tarball is
  // public, so these records are grounded like everything else.
  // -------------------------------------------------------------------------
  {
    const ai = comps.filter((c) => c.category === 'AI / Copilot');
    const aiOk = ai.length > 100 &&
      ai.every((c) => c.verified === true && /^https:\/\/unpkg\.com\//.test(c.sourceUrl || '')) &&
      ai.every((c) => typeof c.subPackage === 'string' && /^import \{/.test(c.reactImportTreeShakable || ''));
    console.log('AI suite grounded in npm tarballs (' + ai.length + ' components): ok=' + aiOk);

    // umbrellaExport:false means `from '@fluentui-copilot/react-copilot'` does
    // NOT resolve - the import has to name the sub-package.
    const subOnly = ai.filter((c) => c.umbrellaExport === false);
    const subOnlyOk = subOnly.length > 0 &&
      subOnly.every((c) => c.reactImport.includes("from '" + c.subPackage + "'")) &&
      ai.filter((c) => c.umbrellaExport === true)
        .every((c) => c.reactImport.includes("from '@fluentui-copilot/react-copilot'"));
    console.log('sub-package-only AI components import from the sub-package (' + subOnly.length + '): ok=' + subOnlyOk);

    const ll = comps.find((c) => c.name === 'LatencyLoader');
    const llOk = !!ll && ll.umbrellaExport === false &&
      ll.reactImport === "import { LatencyLoader } from '@fluentui-copilot/react-latency';";
    console.log('LatencyLoader imports from react-latency, not the umbrella: ok=' + llOk);

    // Deprecation direction is not guessable: CopilotMessageV2 is deprecated in
    // favour of CopilotMessage, but PromptStarter is deprecated in favour of
    // PromptStarterV2. Both come from the shipped @deprecated tags.
    const dep = Object.fromEntries(((catalog.meta.aiSuite || {}).deprecated || []).map((d) => [d.name, d.useInstead]));
    const cmv2 = comps.find((c) => c.name === 'CopilotMessageV2');
    const depOk = /use CopilotMessage/.test(dep.CopilotMessageV2 || '') &&
      /PromptStarterV2/.test(dep.PromptStarter || '') && !!cmv2 && cmv2.maturity === 'deprecated';
    console.log('AI deprecations recorded with their real direction: ok=' + depOk);

    // Names that are site pattern labels, not exports.
    const retiredNames = new Set(((catalog.meta.aiSuite || {}).retired || []).map((r) => r.was));
    const sug = comps.find((c) => c.name === 'Suggestion');
    const retiredOk = retiredNames.size > 0 &&
      comps.filter((c) => retiredNames.has(c.name)).length === 0 &&
      !!(sug && sug.retiredNames && sug.retiredNames.length);
    console.log('non-exported pattern names retired into the real export (' + [...retiredNames].join(', ') + '): ok=' + retiredOk);

    const icon = comps.find((c) => c.name === 'Icon');
    console.log('Icon verified against @fluentui/react-icons: ok=' +
      !!(icon && icon.verified === true && /react-icons/.test(icon.sourceUrl || '')));
  }
}

// A search hit must survive a round-trip into fluent_get_component - that is the
// exact path an agent takes, and a name the search advertises but the getter
// cannot resolve is a dead end.
{
  const names = ['Button', 'DataGrid', 'Nav', 'Toast', 'Avatar', 'ColorPicker', 'DrawerBody', 'Calendar', 'Collapse', 'TeachingPopoverBody', 'CopilotMessage', 'ChatInput', 'LatencyLoader'];
  const failures = [];
  for (const n of names) {
    const s = await client.callTool({ name: 'fluent_search_components', arguments: { query: n } });
    if (!s.content[0].text.includes(`"name": "${n}"`)) { failures.push(`${n}:search`); continue; }
    const g = await client.callTool({ name: 'fluent_get_component', arguments: { name: n } });
    let api = null;
    try { api = JSON.parse(g.content[0].text).api; } catch {}
    if (!api || api.name !== n || !api.reactImport || !api.maturity) failures.push(`${n}:get`);
  }
  console.log('search -> get round-trip for ' + names.length + ' components (' + (failures.join(', ') || 'none failed') + '): ok=' + (failures.length === 0));

  // Colliding names must be reachable by id, not silently shadowed.
  const shim = await client.callTool({ name: 'fluent_get_component', arguments: { name: 'migration-shims-v0-list' } });
  let shimOk = false, ambiguousOk = false;
  try {
    const j = JSON.parse(shim.content[0].text);
    shimOk = j.api?.id === 'migration-shims-v0-list' && j.api?.maturity === 'migration';
    const both = JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name: 'List' } })).content[0].text);
    ambiguousOk = typeof both.nameIsAmbiguous === 'string' && Array.isArray(both.alsoNamed) && both.alsoNamed.length === 1;
  } catch {}
  console.log('colliding component names resolvable by id and flagged as ambiguous: ok=' + (shimOk && ambiguousOk));

  // An empty argument used to act as a wildcard: `''.includes('')` is true, so
  // get_component returned the first record in the file as the answer (5k chars)
  // and search_components dumped the catalog (37k). An agent passing an
  // unresolved variable must be told, not answered.
  const blanks = [];
  for (const [tool, args] of [
    ['fluent_get_component', { name: '' }],
    ['fluent_get_component', { name: '   ' }],
    ['fluent_search_components', { query: '' }],
    ['fluent_search_components', { query: '\t\n ' }],
  ]) {
    const text = (await client.callTool({ name: tool, arguments: args })).content[0].text;
    const refused = /is required and was empty/.test(text) && text.length < 800 && !/"api"/.test(text);
    if (!refused) blanks.push(`${tool}(${JSON.stringify(args)}) -> ${text.length} chars`);
  }
  console.log('empty/whitespace input is refused, not treated as a wildcard (' + (blanks.join('; ') || 'all 4 refused') + '): ok=' + (blanks.length === 0));

  // A v9 miss on a v8 name was a dead end even though fluent_v8_lookup has the
  // full record. Mirror what fluent_native_component already does for platforms.
  {
    const v8only = JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name: 'PrimaryButton' } })).content[0].text);
    const pointsAtV8 = v8only.fluent1v8?.name === 'PrimaryButton' &&
      /fluent_v8_lookup/.test(v8only.fluent1v8?.nextStep || '') && v8only.fluent1v8?.alsoInFluent2 === false;
    // Same-name collisions are the higher-stakes case: the wrong import compiles.
    const collide = JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name: 'Persona' } })).content[0].text);
    const warnsCollision = collide.api?.name === 'Persona' && collide.fluent1v8?.alsoInFluent2 === true &&
      /compiles cleanly/.test(collide.fluent1v8?.note || '');
    // A name in neither generation must still say what to do next.
    const neither = (await client.callTool({ name: 'fluent_get_component', arguments: { name: 'ZzNotAComponent' } })).content[0].text;
    const graceful = /fluent_search_components/.test(neither) && !/fluent1v8/.test(neither);
    console.log('v9 miss on a v8 name points at fluent_v8_lookup: ok=' + (pointsAtV8 && warnsCollision && graceful));
  }

  // The design site names patterns in prose ("Chat input"); the code exports
  // identifiers (ChatInput). Both used to return half the picture and neither
  // mentioned the other.
  {
    const prose = JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name: 'Chat input' } })).content[0].text);
    const code = JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name: 'ChatInput' } })).content[0].text);
    const both = (j) => j.api?.name === 'ChatInput' && j.usage?.name === 'Chat input' &&
      Array.isArray(j.api?.keyProps) && typeof j.api?.reactImport === 'string';
    const sameRecord = both(prose) && both(code) && prose.api.id === code.api.id;
    // And a spaced/kebab spelling of a real export should resolve, not dead-end.
    const spaced = JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name: '  Data Grid  ' } })).content[0].text);
    console.log('design-site name and export name return one merged record: ok=' + (sameRecord && spaced.api?.name === 'DataGrid'));

    // Searching the prose name must find the code record rather than nothing.
    const s = (await client.callTool({ name: 'fluent_search_components', arguments: { query: 'Chat input' } })).content[0].text;
    console.log('search finds a component by its design-site name: ok=' + /"name": "ChatInput"/.test(s));
  }

  // A 5,000-character argument echoed back verbatim is pure context burn.
  {
    const huge = (await client.callTool({ name: 'fluent_get_component', arguments: { name: 'x'.repeat(5000) } })).content[0].text;
    console.log('oversized input is truncated in the reply (' + huge.length + ' chars): ok=' + (huge.length < 400));
  }

  // mcp/data/local/ is gitignored, so this checkout and a fresh clone answer the
  // same call differently. Correct behaviour, but it has to be visible: without
  // a marker, a demo from an enriched checkout shows an audience prose no user
  // of the published plugin can obtain. Same $provenance shape as
  // fluent_design_guidance. Overlay-aware: passes in both states.
  {
    const overlayPresent = existsSync(new URL('data/local/fluent-components-usage.json', import.meta.url));
    const jsonOfComp = async (name) => {
      try { return JSON.parse((await client.callTool({ name: 'fluent_get_component', arguments: { name } })).content[0].text); }
      catch { return null; }
    };
    // ChatInput's usage record is one of the 14 gated AI entries; DataGrid has
    // no gated usage at all, so it is `published` in every checkout.
    const gated = await jsonOfComp('ChatInput');
    const plain = await jsonOfComp('DataGrid');
    const firstKeyOk = Object.keys(gated ?? {})[0] === '$provenance' && Object.keys(plain ?? {})[0] === '$provenance';
    const plainOk = plain?.$provenance?.source === 'published' && !plain.$provenance.overlayFile;
    const gatedOk = overlayPresent
      ? gated?.$provenance?.source === 'local-overlay' &&
        /mcp\/data\/local\/fluent-components-usage\.json/.test(gated.$provenance.overlayFile ?? '') &&
        gated.$provenance.restoredChars > gated.$provenance.publishedChars &&
        /NOTICE/.test(gated.$provenance.note ?? '')
      : gated?.$provenance?.source === 'published';
    console.log(
      'usage guidance labelled published vs local-overlay (' +
        (overlayPresent ? 'overlay present: ' + gated?.$provenance?.publishedChars + ' -> ' + gated?.$provenance?.restoredChars + ' chars' : 'no overlay: published shape') +
        '): ok=' + (firstKeyOk && plainOk && gatedOk)
    );

    // Never claim a restore that did not happen, in either direction.
    const names = ['Button', 'Chat input', 'Timestamp', 'Attachment', 'Nav', 'CopilotMessage'];
    const bad = [];
    for (const n of names) {
      const j = await jsonOfComp(n);
      const src = j?.$provenance?.source;
      if (src !== 'published' && src !== 'local-overlay') { bad.push(`${n}:${src}`); continue; }
      if (src === 'local-overlay' && !overlayPresent) bad.push(`${n}: claims overlay with none present`);
      if (src === 'local-overlay' && !(j.$provenance.restoredChars > j.$provenance.publishedChars)) bad.push(`${n}: overlay claimed but nothing restored`);
    }
    console.log('every response declares a real provenance source (' + (bad.join('; ') || names.length + ' checked') + '): ok=' + (bad.length === 0));
  }
}

// Icons. The whole point of this tool is that the name it returns compiles, so
// every assertion here ends at the same place: does this export actually exist
// upstream. Reconstruct the verified export set from the dataset and check
// every name the server hands back against it.
const iconRaw = readFileSync(new URL('data/fluent-icons.json', import.meta.url), 'utf8');
const iconData = JSON.parse(iconRaw);
const iconExports = new Set();
for (const f of iconData.families ?? []) {
  for (const [style, sizes] of Object.entries(f.variants ?? {})) for (const s of sizes) iconExports.add(`${f.base}${s}${style}`);
  for (const style of f.resizable ?? []) iconExports.add(`${f.base}${style}`);
  // NOTE: rtlBase is deliberately NOT expanded here. The right-to-left twin is
  // its own family with its own sizes (TaskListSquareLtr ships 48, the Rtl twin
  // does not), so pasting the LTR sizes onto the RTL base invents names.
}
const iconSearch = async (args) => (await client.callTool({ name: 'fluent_icon_search', arguments: args })).content[0].text;
// Pull every export-shaped token out of a response: Base + optional real size + style.
const iconNamesIn = (text) =>
  [...String(text).matchAll(/\b([A-Z][A-Za-z0-9]*?(?:12|16|20|24|28|32|48)?(?:Filled|Regular|Light|Color))\b/g)].map((m) => m[1]);

// A single hallucinated name defeats the tool, so run the real queries an agent
// would run and verify EVERY name in every response.
{
  const queries = [
    ['save', /\bSave\d*(Regular|Filled)\b/],
    ['trash', /\bDelete\d*(Regular|Filled)\b/],
    ['user', /\bPerson\d*(Regular|Filled)\b/],
    ['send email', /\bSend\d*(Regular|Filled)\b/],
    ['shield', /\bShield\d*(Regular|Filled)\b/],
    ['calendar', /\bCalendar[A-Za-z]*\d*(Regular|Filled)\b/],
  ];
  let allReal = true, checked = 0, bad = [], missedIntent = [];
  for (const [q, expect] of queries) {
    const text = await iconSearch({ query: q, limit: 5 });
    const names = iconNamesIn(text);
    checked += names.length;
    for (const n of names) if (!iconExports.has(n)) { allReal = false; bad.push(q + ':' + n); }
    if (!expect.test(text)) missedIntent.push(q);
    if (!/import \{ [A-Za-z0-9]+ \} from '@fluentui\/react-icons';/.test(text)) missedIntent.push(q + ' (no import line)');
  }
  if (bad.length) console.log('  hallucinated icon names:', bad.slice(0, 10).join(', '));
  if (missedIntent.length) console.log('  queries that missed the expected icon:', missedIntent.join(', '));
  console.log('icon search returns only verified export names (' + checked + ' names across ' + queries.length + ' queries): ok=' + (allReal && checked > 20));
  console.log('icon search finds the icon behind the word (save/trash/user/send email/shield/calendar): ok=' + (missedIntent.length === 0));
}

// A wrong size is the commonest icon mistake. It has to be answered with the
// real list, not a schema error and never with an invented 26px name.
{
  const t = await iconSearch({ query: 'settings', size: 26 });
  const ok = /not a Fluent icon size/i.test(t) && /12, 16, 20, 24, 28, 32, 48/.test(t) && !/[A-Za-z]26(Regular|Filled|Light|Color)/.test(t);
  console.log('icon search rejects size=26 with the real size list: ok=' + ok);
}

// Same question asked as a name: "is AddCircle26Regular real?" must be a clear
// no, with a real replacement attached.
{
  const t = await iconSearch({ query: 'AddCircle26Regular' });
  const names = iconNamesIn(t).filter((n) => n !== 'AddCircle26Regular');
  const ok = /is NOT a real/.test(t) && /26 is not a Fluent icon size/.test(t) && /AddCircle24Regular/.test(t) && names.every((n) => iconExports.has(n));
  console.log('icon validate AddCircle26Regular: rejected + real replacement offered: ok=' + ok);
}

// And the inverse: a real name must be confirmed, not hedged.
{
  const t = await iconSearch({ query: 'AddCircle24Regular' });
  console.log('icon validate AddCircle24Regular: confirmed real: ok=' + (/is a real @fluentui\/react-icons export/.test(t) && !/is NOT a real/.test(t)));
}

// An icon that never existed (a rename, a hallucination, a half-remembered
// name) must fail with real alternatives rather than a shrug.
{
  const t = await iconSearch({ query: 'SaveDisk24Regular' });
  const names = iconNamesIn(t).filter((n) => n !== 'SaveDisk24Regular');
  const ok = /is NOT a real/.test(t) && names.length > 0 && names.every((n) => iconExports.has(n));
  console.log('icon validate unknown family SaveDisk24Regular: rejected + real suggestions: ok=' + ok);
}

// The guidance that stops the generated code being wrong in a different way.
{
  const save = await iconSearch({ query: 'save', limit: 1 });
  const bundle = save.match(/bundleIcon\(([A-Za-z0-9]+), ([A-Za-z0-9]+)\)/);
  const bundleOk = !!bundle && /Filled$/.test(bundle[1]) && /Regular$/.test(bundle[2]) && iconExports.has(bundle[1]) && iconExports.has(bundle[2]);
  console.log('icon bundleIcon snippet is Filled-then-Regular with real names: ok=' + bundleOk);
  console.log('icon a11y note surfaced (aria-hidden vs aria-label + role=img): ok=' + (/aria-hidden="true"/.test(save) && /aria-label/.test(save) && /role="img"/.test(save)));

  const color = await iconSearch({ query: 'AddCircle24Color' });
  console.log('icon Color variant carries the HCM/contrast warning: ok=' + (/High Contrast Mode/i.test(color) && /Prefer Regular/i.test(color)));

  const twelve = await iconSearch({ query: 'AddCircle12Regular' });
  console.log('icon 12px flagged informational, not interactive: ok=' + /informational/i.test(twelve));

  const rtl = await iconSearch({ query: 'send', limit: 1 });
  console.log('icon RTL direction surfaced for a mirrored icon: ok=' + (/right-to-left/i.test(rtl) && /mirror/i.test(rtl)));

  // The right-to-left twin of a design is a SEPARATE family with its own sizes:
  // TaskListSquareLtr ships 48, TaskListSquareRtl does not. Reusing the LTR size
  // on the RTL name invents an export, which is exactly the failure this tool
  // exists to prevent.
  const pair = await iconSearch({ query: 'task list square', size: 48, limit: 1 });
  const pairNames = iconNamesIn(pair);
  const pairOk = /Rtl/.test(pair) && pairNames.length > 0 && pairNames.every((n) => iconExports.has(n));
  if (!pairOk) console.log('  invented names:', pairNames.filter((n) => !iconExports.has(n)).join(', '));
  console.log('icon LTR/RTL twin resolved to a real export, not a pasted size: ok=' + pairOk);
}

// meta must describe the file it is in. A stale count is how a dataset starts
// lying about itself.
{
  const c = iconData.meta?.counts ?? {};
  const v = iconData.meta?.validation ?? {};
  const countsOk =
    c.families === (iconData.families?.length ?? -1) &&
    c.verifiedExportNames === iconExports.size &&
    c.familiesWithMetaphor === (iconData.families ?? []).filter((f) => f.metaphor?.length).length &&
    c.familiesWithDescription === (iconData.families ?? []).filter((f) => f.description).length &&
    v.reconstructedNamesNotInManifest === 0;
  console.log('icon dataset meta counts match the arrays (' + c.families + ' families, ' + iconExports.size + ' verified names): ok=' + countsOk);

  // Licence boundary: names and words only. Artwork would change what this
  // repository redistributes, and NOTICE has to name the source either way.
  const noArtwork = !/<svg|<path\b|viewBox=|"d":\s*"M/i.test(iconRaw);
  const notice = readFileSync(new URL('../NOTICE', import.meta.url), 'utf8');
  const noticeOk =
    /fluentui-system-icons/.test(notice) && /MIT License/.test(notice) &&
    /Copyright \(c\) 2020 Microsoft Corporation/.test(notice) && /no SVG artwork/i.test(notice);
  console.log('icon dataset embeds no artwork: ok=' + noArtwork);
  console.log('NOTICE attributes microsoft/fluentui-system-icons (MIT, names-only): ok=' + noticeOk);
  console.log('icon dataset pins its upstream commit + licence: ok=' + (/^[0-9a-f]{40}$/.test(iconData.meta?.source?.commit ?? '') && iconData.meta?.license?.spdx === 'MIT'));
}

// ---------------------------------------------------------------------------
// Fluent 1 (v8) name classes. The v8/v9 collision list is a headline feature,
// and it shipped for months without `Button` in it — the single most-used
// export in both libraries. Membership is now computed from the two upstream
// API-Extractor reports, so pin the exports that computation MUST contain.
// ---------------------------------------------------------------------------
{
  const v8Data = JSON.parse(readFileSync(new URL('./data/fluent-v8.json', import.meta.url), 'utf8'));
  const collisionNames = (v8Data.collisions ?? []).map((c) => c.name);

  const MUST_COLLIDE = ['Button', 'Checkbox', 'Dropdown', 'Link', 'Label'];
  const missingCollisions = MUST_COLLIDE.filter((n) => !collisionNames.includes(n));
  if (missingCollisions.length) console.log('  missing collisions:', missingCollisions.join(', '));
  console.log('v8 collisions include Button/Checkbox/Dropdown/Link/Label: ok=' + (missingCollisions.length === 0));

  // Every collision must hand back BOTH import paths, or the caller cannot act
  // on the warning.
  const withoutImports = (v8Data.collisions ?? []).filter((c) => !c.v8Import || !c.v9Import);
  console.log('v8 every collision carries both import paths: ok=' + (withoutImports.length === 0));

  // ComboBox (v8) vs Combobox (v9) is a casing difference, not a collision.
  // Filing it as a collision would say the two names are the same; they are not.
  const casing = (v8Data.casingTraps ?? []).find((c) => c.v8Name === 'ComboBox' && c.v9Name === 'Combobox');
  console.log(
    'v8 ComboBox/Combobox is a casing trap, not a collision: ok=' +
      Boolean(casing && !collisionNames.includes('ComboBox') && !collisionNames.includes('Combobox'))
  );

  // Renames and behaviour traps are separate classes with their own fix.
  const renameNames = (v8Data.renames ?? []).map((r) => `${r.v8Name}->${r.v9Name}`);
  const renamesOk =
    renameNames.includes('Toggle->Switch') &&
    renameNames.includes('Pivot->TabList') &&
    (v8Data.behaviorTraps ?? []).length > 0;
  console.log('v8 renames + behaviorTraps are separate classes: ok=' + renamesOk);

  // datasetCounts is published as a census of THIS file. If it drifts it is a
  // lie shipped as provenance.
  const dc = v8Data.meta?.datasetCounts ?? {};
  const countsOk =
    dc.collisions === (v8Data.collisions ?? []).length &&
    dc.renames === (v8Data.renames ?? []).length &&
    dc.casingTraps === (v8Data.casingTraps ?? []).length &&
    dc.behaviorTraps === (v8Data.behaviorTraps ?? []).length &&
    dc.traps === (v8Data.traps ?? []).length &&
    dc.unverified === (v8Data.unverified ?? []).length &&
    dc.components === Object.keys(v8Data.components ?? {}).length;
  if (!countsOk) console.log('  datasetCounts:', JSON.stringify(dc));
  console.log('v8 meta.datasetCounts matches actual lengths: ok=' + countsOk);

  // Versions are derived from upstream package.json, not pinned by hand.
  const upstreamMeta = v8Data.meta?.upstreamApiReports ?? {};
  const provenanceOk =
    Boolean(upstreamMeta.fetchedOn) &&
    Boolean(upstreamMeta.reports?.v8?.sha256) &&
    Boolean(upstreamMeta.reports?.v9?.sha256) &&
    upstreamMeta.computed?.collisions?.length === (v8Data.collisions ?? []).length;
  console.log('v8 collision provenance records both API reports + fetch date: ok=' + provenanceOk);
}

// ---------------------------------------------------------------------------
// Migration must be executable, not advisory: real packages, real commands.
// ---------------------------------------------------------------------------
{
  const migData = JSON.parse(readFileSync(new URL('./data/migration.json', import.meta.url), 'utf8'));
  const tooling = migData.scenarios?.tooling ?? {};

  // A private package can never be installed. Recommending one sends a user to
  // a command that cannot succeed.
  const recommended = [
    ...(tooling.compatPackages ?? []),
    tooling.codemods,
    tooling.shims,
    tooling.v0Shims,
  ].filter(Boolean);
  const privateRecommended = recommended.filter((p) => p.private === true).map((p) => p.package);
  if (privateRecommended.length) console.log('  private packages recommended:', privateRecommended.join(', '));
  console.log('migration recommends no private package: ok=' + (privateRecommended.length === 0));

  // ...and the private ones are named explicitly so an agent knows to refuse.
  const neverNames = (tooling.neverRecommend ?? []).map((n) => n.package);
  console.log(
    'migration names @fluentui/react-colorpicker-compat as never-recommend: ok=' +
      neverNames.includes('@fluentui/react-colorpicker-compat')
  );

  const codemodOk =
    tooling.codemods?.command === 'npx @fluentui/codemods' &&
    (tooling.codemods?.rules ?? []).length >= 5 &&
    (tooling.codemods?.rules ?? []).some((r) => r.name === 'RepathOfficeImportsToFluent' && r.enabled === true) &&
    /NOT a v8 -> v9 converter/i.test(tooling.codemods?.criticalCaveat ?? '');
  console.log('migration codemods are runnable + honestly scoped: ok=' + codemodOk);

  const bridge = (tooling.shims?.themeBridge ?? []).map((t) => t.name);
  const shimOk =
    ['createV8Theme', 'createV9Theme', 'createBrandVariants'].every((n) => bridge.includes(n)) &&
    (tooling.shims?.components ?? []).includes('CheckboxShim');
  console.log('migration shims expose all three theme-bridge helpers: ok=' + shimOk);

  const versionsOk =
    migData.$meta?.packageVersionsSeen?.['@fluentui/react-nav'] === '9.4.4' &&
    Boolean(migData.$meta?.packageVersionSource?.fetchedOn);
  console.log('migration versions are derived from upstream package.json: ok=' + versionsOk);
}

// Round-trip through the server: an agent asking about Button must be warned.
{
  const btn = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'Button' } })).content[0].text;
  const btnOk =
    /collisionWarning/.test(btn) &&
    /@fluentui\/react'/.test(btn) &&
    /@fluentui\/react-components'/.test(btn) &&
    /V8Button/.test(btn);
  console.log('fluent_v8_lookup(Button) warns + gives both import paths: ok=' + btnOk);

  const cb = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'ComboBox' } })).content[0].text;
  console.log('fluent_v8_lookup(ComboBox) surfaces the casing trap: ok=' + (/casingTrap/i.test(cb) && /Combobox/.test(cb)));

  const tg = (await client.callTool({ name: 'fluent_v8_lookup', arguments: { name: 'Toggle' } })).content[0].text;
  console.log('fluent_v8_lookup(Toggle) reports the rename to Switch: ok=' + (/renames/.test(tg) && /Switch/.test(tg)));

  const mt = (await client.callTool({ name: 'fluent_migration_guidance', arguments: { scenario: 'tooling' } })).content[0].text;
  const mtOk =
    /npx @fluentui\/codemods/.test(mt) &&
    /@fluentui\/react-migration-v8-v9/.test(mt) &&
    /createV8Theme/.test(mt) &&
    /react-datepicker-compat/.test(mt);
  console.log('fluent_migration_guidance(tooling) returns runnable steps: ok=' + mtOk);
}

// --- Figma community plugins + DTCG token export -----------------------------
// Added 2026-08. Three things are being defended here: the corrected Starter
// rate limit, the provenance labelling on plugins Microsoft merely LINKS, and
// the fact that we can generate a plugin's input file but can never run it.

// The 6/month Starter claim was wrong and was repeated in half a dozen places in
// this dataset. Assert on the raw JSON, not the tool output, so a caveat that
// quotes the old number cannot hide a live claim (or vice versa).
{
  const raw = readFileSync(new URL('data/figma.json', import.meta.url), 'utf8');
  const data = JSON.parse(raw);
  const offenders = [];
  const scan = (node, path) => {
    if (typeof node === 'string') {
      // Only a Starter-scoped 6/month claim is wrong; 6/month is CORRECT for a
      // View/Collab seat on Professional, Organization, and Enterprise. A string
      // that names BOTH numbers is doing the corrected comparison, so the
      // heuristic is: mentions Starter + a 6/month figure + never says 20.
      const claim = /\b6\s*(?:tool\s*)?calls?\s*(?:per|\/)\s*month|\b6\s*\/\s*month|\b6\s*per\s*month/i;
      if (claim.test(node) && /starter/i.test(node) && !/\b20\b/.test(node)) {
        offenders.push(path + ': ' + node.slice(0, 120));
      }
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) scan(v, path + '.' + k);
    }
  };
  scan(data, '$');
  const starterRows = (data.rateLimits ?? []).filter((r) => r.plan === 'Starter');
  const numbersOk = starterRows.length === 2 && starterRows.every((r) => r.perMonth === 20);
  if (offenders.length) for (const o of offenders.slice(0, 5)) console.log('  stale Starter claim: ' + o);
  console.log(
    'figma.json carries no Starter 6-per-month claim (' + starterRows.length + ' Starter rows, all 20/month=' + numbersOk + '): ok=' +
      (offenders.length === 0 && numbersOk),
  );
}

// Provenance. This repo has already shipped one provenance incident, so the
// shape of the honesty is asserted, not just its presence: every plugin needs an
// explicit boolean (not undefined, not "unknown"), and anything not proven
// first-party needs a publisherNote saying so in words.
const figPlugins = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'plugins' } })).content[0].text;
{
  let ok = false, note = 'plugins section did not parse';
  try {
    const j = JSON.parse(figPlugins.split('\n---\n')[0]);
    const list = j.plugins ?? [];
    const missingBool = list.filter((p) => typeof p.official !== 'boolean').map((p) => p.name);
    const missingNote = list.filter((p) => p.official === false && !(typeof p.publisherNote === 'string' && p.publisherNote.length > 40)).map((p) => p.name);
    const nullPublisher = list.filter((p) => p.official === false && p.publisher !== null).map((p) => p.name);
    const proven = list.filter((p) => p.official === true).map((p) => p.name);
    ok =
      list.length >= 6 &&
      missingBool.length === 0 &&
      missingNote.length === 0 &&
      nullPublisher.length === 0 &&
      proven.length === 1 &&
      proven[0] === 'Variables Import';
    note = ok
      ? `${list.length} plugins, only Variables Import claims first-party`
      : `no explicit official: [${missingBool}] missing publisherNote: [${missingNote}] publisher not null: [${nullPublisher}] claimed first-party: [${proven}]`;
  } catch {}
  console.log('figma plugins provenance labelled (' + note + '): ok=' + ok);
}

// The single most dangerous misread of a plugin list is "the agent can run
// these". The refusal has to be IN the payload, not in a doc somewhere.
{
  const saysCannot = /cannot run,? invoke,? automate,? or trigger a Figma community plugin/i.test(figPlugins);
  const explainsWhy = /only inside the Figma editor|Figma editor's sandbox/i.test(figPlugins);
  const disambiguatesUseFigma = /use_figma/.test(figPlugins) && /not a community plugin/i.test(figPlugins);
  console.log(
    'figma plugins state we cannot run them (why=' + explainsWhy + ', use_figma disambiguated=' + disambiguatesUseFigma + '): ok=' +
      (saysCannot && explainsWhy && disambiguatesUseFigma),
  );
}

// Real community URLs, and the one plugin we DO claim is Microsoft's must carry
// the evidence that makes the claim checkable.
{
  let ok = false, note = 'plugins section did not parse';
  try {
    const j = JSON.parse(figPlugins.split('\n---\n')[0]);
    const list = j.plugins ?? [];
    const urlsOk = list.every((p) => hasLinkTo(p.url ?? '', 'www.figma.com', '/community/plugin/'));
    const vi = list.find((p) => p.name === 'Variables Import');
    const proofOk = /1253424530216967528/.test(vi?.provenance ?? '') && /figma-variables-import/.test(vi?.sourceRepo ?? '');
    const renamed = list.find((p) => p.name === 'Accessibility Assistant');
    const renameOk = /A11y/i.test(renamed?.renamed?.was ?? '');
    ok = urlsOk && proofOk && renameOk;
    note = `urls=${urlsOk} variables-import-proof=${proofOk} focus-order-rename=${renameOk}`;
  } catch {}
  console.log('figma plugin URLs + Microsoft proof (' + note + '): ok=' + ok);
}

// The DTCG export is the code -> Figma direction. Assert the SHAPE, because a
// document that parses but uses a type the plugin rejects is worse than none.
{
  const summary = (
    await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'tokens-export' } })
  ).content[0].text;
  let ok = false, note = 'tokens-export did not parse';
  try {
    const j = JSON.parse(summary);
    const modes = Object.keys(j.manifest?.collections?.['Fluent Theme']?.modes ?? {});
    // Only these six are BOTH DTCG types and mapped by the plugin's
    // tokenTypeToFigmaType. "fontSize" in particular must never appear: the
    // plugin runs it through rem->px, turning "14px" into 224.
    const allowed = ['color', 'dimension', 'duration', 'number', 'fontFamily', 'fontWeight'];
    const typesOk = Array.isArray(j.dtcgTypesUsed) && j.dtcgTypesUsed.every((t) => allowed.includes(t));
    const gapsOk = (j.notExpressible ?? []).some((g) => /shadow/i.test(g.category)) &&
      (j.notExpressible ?? []).some((g) => /curve/i.test(g.category));
    const cannotRun = /cannot run/i.test(j.weCannotRunPlugins ?? '');
    ok = modes.includes('Light') && modes.includes('Dark') && typesOk && gapsOk && cannotRun && j.totalTokens > 500;
    note = `modes=[${modes}] types=[${j.dtcgTypesUsed}] tokens=${j.totalTokens} gapsDeclared=${gapsOk}`;
  } catch {}
  console.log('figma tokens-export summary (' + note + '): ok=' + ok);
}

// And the generated document itself: valid DTCG token objects, plugin-parsable
// colours, and the code-syntax extension that makes get_variable_defs answer
// with a real Fluent token name instead of a guess.
{
  const doc = (
    await client.callTool({
      name: 'fluent_figma_guidance',
      arguments: { section: 'tokens-export', dtcgFile: 'light', maxChars: 200000 },
    })
  ).content[0].text;
  let ok = false, note = 'DTCG document did not parse';
  try {
    const j = JSON.parse(doc);
    const entries = Object.entries(j.Color ?? {});
    const everyToken = entries.every(([, t]) => typeof t.$type === 'string' && t.$value !== undefined);
    // The plugin's jsonColorToFigmaColor accepts ONLY #RRGGBB / #RRGGBBAA.
    const badColors = entries.filter(([, t]) => t.$type === 'color' && !/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(String(t.$value)));
    const brand = j.Color?.colorBrandBackground;
    const codeSyntaxOk = brand?.$extensions?.codeSyntax === 'tokens.colorBrandBackground' && brand?.$extensions?.codeSyntaxPlatform === 'WEB';
    const alphaOk = j.Color?.colorSubtleBackground?.$value === '#00000000';
    ok = entries.length > 300 && everyToken && badColors.length === 0 && codeSyntaxOk && alphaOk;
    note = `${entries.length} colour tokens, unparsable=${badColors.length}, codeSyntax=${codeSyntaxOk}, transparent->hex=${alphaOk}`;
  } catch {}
  console.log('figma DTCG document parses + plugin-safe (' + note + '): ok=' + ok);
}

// The kits section appends a provenance footer of the caveats relevant to kits.
// Two edits to `unverified` could silently break it: renaming the caveats out of
// term range, or deleting them. Assert the footer still fires AND still carries
// the Android alias correction, which is the one a user acts on.
{
  const kits = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'kits' } })).content[0].text;
  const footerFires = /Provenance: \d+ caveat\(s\) recorded/.test(kits) && /Directly relevant to this query/.test(kits);
  const androidWarned = /aka\.ms\/Fluent2Toolkits\/Android\/Figma/.test(kits) && /bing\.com/.test(kits);
  const sharepointFixed = /websharepointfigma_1910\.zip/.test(kits) && /NOT a Figma Community file/i.test(kits);
  console.log(
    'figma kits provenance footer still fires (android-alias-warned=' + androidWarned + ', sharepoint-corrected=' + sharepointFixed + '): ok=' +
      (footerFires && androidWarned && sharepointFixed),
  );
}

// Tool availability. Figma's tools page tags exactly ten tools "(remote only)".
// The three Code Connect authoring tools are NOT among them, and claiming they
// are would tell a desktop-server user a working tool does not exist.
{
  const servers = (await client.callTool({ name: 'fluent_figma_guidance', arguments: { section: 'servers', maxChars: 200000 } })).content[0].text;
  let ok = false, note = 'servers section did not parse';
  try {
    const j = JSON.parse(servers);
    const remote = (j.servers ?? []).find((s) => s.id === 'figma-remote');
    const byName = Object.fromEntries((remote?.tools ?? []).map((t) => [t.name, t.availability]));
    const bothNow = ['add_code_connect_map', 'get_code_connect_suggestions', 'send_code_connect_mappings'];
    const stillRemote = ['download_assets', 'search_design_system', 'get_libraries', 'whoami', 'get_context_for_code_connect'];
    const fixed = bothNow.every((n) => byName[n] === 'both');
    const intact = stillRemote.every((n) => byName[n] === 'remote');
    ok = fixed && intact;
    note = `codeConnectAuthoring=both:${fixed} genuineRemoteOnly:${intact}`;
  } catch {}
  console.log('figma tool availability corrected (' + note + '): ok=' + ok);
}

// ===========================================================================
// Adversarial-audit regression checks (P1-P6).
// Every defect below was reproduced with real output before it was fixed; these
// checks exist so it cannot come back silently.
// ===========================================================================
{
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const AUD = './.audit-smoke';
  const text = async (name, args = {}) => {
    // A schema rejection comes back as isError with the message in content on
    // this SDK version, so both shapes have to be normalized to a string.
    try {
      const r = await client.callTool({ name, arguments: args });
      return r.content[0].text;
    } catch (e) {
      return String(e && e.message ? e.message : e);
    }
  };
  const jsonOf = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const hashDir = (dir) => {
    const h = createHash('sha256');
    for (const f of readdirSync(dir, { recursive: true }).sort()) {
      const p = dir + '/' + String(f).split('\\').join('/');
      try { h.update(String(f)); h.update(readFileSync(p)); } catch { /* directory entry */ }
    }
    return h.digest('hex');
  };
  rmSync(AUD, { recursive: true, force: true });
  mkdirSync(AUD, { recursive: true });

  // ---- P1: the plugin's own scaffold must pass the plugin's own verifier.
  // It used to fail V3 (reportVersionAtImport hardcoded 2.1.0 while the template
  // declared 2.4.0/2.0.0/3.0.0) and V5 (the scaffolded visual carried inline
  // background/border/title overrides, so the theme it ships was inert on 3 of
  // 4 keys from birth).
  const scafDir = AUD + '/scaffold';
  await text('fluent_scaffold_pbip', { name: 'AuditDemo', outputDir: scafDir, brandColor: '#0F6CBD' });
  const auditReportDir = scafDir + '/AuditDemo.Report';
  const vText = await text('fluent_pbir_verify', { reportDir: auditReportDir });
  const vJson = jsonOf(await text('fluent_pbir_verify', { reportDir: auditReportDir, format: 'json' }));
  const vPassed = vJson ? Object.values(vJson.checks ?? {}).filter((c) => c && c.pass).length : 0;
  const vFailed = vJson ? Object.values(vJson.checks ?? {}).filter((c) => c && !c.pass).length : -1;
  console.log('scaffold_pbip output passes pbir_verify (' + vPassed + ' passed, ' + vFailed + ' failed): ok='
    + (vFailed === 0 && vPassed === 9 && /VERIFY PASSED/.test(vText)));
  {
    const rep = jsonOf(readFileSync(auditReportDir + '/definition/report.json', 'utf8')) ?? {};
    const rv = rep.themeCollection?.customTheme?.reportVersionAtImport ?? {};
    console.log('scaffold computes reportVersionAtImport (' + JSON.stringify(rv) + '): ok='
      + (rv.visual === '2.4.0' && rv.page === '2.0.0' && rv.report === '3.0.0'));
    const vis = jsonOf(readFileSync(auditReportDir + '/definition/pages/fluentpage01/visuals/fluentcard01/visual.json', 'utf8')) ?? {};
    const vco = vis.visual?.visualContainerObjects ?? {};
    console.log('scaffolded visual ships no theme-defeating inline overrides (keys=' + Object.keys(vco).length + '): ok='
      + (!vco.background && !vco.border && !vco.title));
  }

  // ---- P1 regression guards: dryRun defaults to true, normalize is idempotent,
  // and the three policies stay distinct.
  {
    const before = hashDir(auditReportDir);
    await text('fluent_pbir_normalize_inline', { reportDir: auditReportDir });
    await text('fluent_pbir_apply_theme', { reportDir: auditReportDir, themeJson: JSON.stringify({ name: 'Probe', $schema: 'https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.114.json' }) });
    console.log('dryRun defaults to true and mutates nothing: ok=' + (hashDir(auditReportDir) === before));

    const first = jsonOf(await text('fluent_pbir_normalize_inline', { reportDir: auditReportDir, dryRun: false, format: 'json' }));
    const second = jsonOf(await text('fluent_pbir_normalize_inline', { reportDir: auditReportDir, dryRun: false, format: 'json' }));
    const afterFirst = hashDir(auditReportDir);
    console.log('normalize_inline is idempotent (' + (first?.ledger?.length ?? -1) + ' then ' + (second?.ledger?.length ?? -1) + ' changes): ok='
      + ((second?.ledger?.length ?? -1) === 0 && hashDir(auditReportDir) === afterFirst));

    const policies = {};
    for (const policy of ['theme-wins', 'report', 'remap-colors']) {
      policies[policy] = await text('fluent_pbir_normalize_inline', { reportDir: auditReportDir, policy });
    }
    const distinct = new Set(Object.values(policies)).size;
    console.log('all 3 normalize policies behave distinctly (' + distinct + ' distinct outputs): ok=' + (distinct === 3));
    const errText = await text('fluent_pbir_verify', { reportDir: AUD + '/not-a-report' });
    console.log('PBIR error messages stay explanatory: ok='
      + (/PBIR error/.test(errText) && /enhanced report format|definition\/pages/.test(errText)));
  }

  // ---- P2: `all` must be an index, not the whole corpus (506,264 chars before).
  {
    const dgAll = await text('fluent_design_guidance', { topic: 'all' });
    const j = jsonOf(dgAll);
    // Target was <5,000. 42 topics x mandatory per-topic provenance
    // (accessStatus + capturedAt, asserted above) plus the doDont convention
    // warning put the floor at ~8.2k; that is still a 98.4% reduction.
    // Raised from 8,000 when the two get-started topics landed: the cap tracks
    // the corpus, and 40 -> 42 rows cannot be absorbed by trimming a row.
    console.log('design_guidance(all) is an index, not the corpus (' + dgAll.length + ' chars): ok='
      + (dgAll.length < 9000 && j?.index === true && Object.keys(j?.topics ?? {}).length > 30));
    const figAll = await text('fluent_figma_guidance', { section: 'all' });
    console.log('figma_guidance(all) is an index (' + figAll.length + ' chars): ok='
      + (figAll.length < 8000 && jsonOf(figAll)?.index === true));
    const ppAll = await text('fluent_powerplatform_guidance', { surface: 'all' });
    console.log('powerplatform_guidance(all) is an index (' + ppAll.length + ' chars): ok='
      + (ppAll.length < 8000 && jsonOf(ppAll)?.index === true));
    // The two outlier topics are capped into a parseable outline — but only
    // when their prose is actually present. Both are sign-in-gated pages whose
    // text lives in the gitignored mcp/data/local/ overlay, so on a fresh clone
    // (and in CI) they are small stubs that never reach the cap. Assert the
    // behaviour that applies to the state we're in, or this check fails for
    // everyone who doesn't happen to have the overlay.
    for (const topic of ['data-usage-sharing', 'responsible-ai']) {
      const t = await text('fluent_design_guidance', { topic });
      const o = jsonOf(t);
      const restored = o?.$provenance?.source === 'local-overlay';
      const ok = restored
        ? t.length < 32000 && o?.truncated === true && typeof o?.agentInstruction === 'string'
        : t.length < 32000 && typeof o?.docUrl === 'string';
      console.log('design_guidance(' + topic + ') is bounded (' + t.length + ' chars, '
        + (restored ? 'overlay: capped outline' : 'published stub') + '): ok=' + ok);
    }
    // A named section is an explicit bounded request and comes back in full.
    const sec = jsonOf(await text('fluent_design_guidance', { topic: 'color', section: 'accessibility' }));
    console.log('design_guidance section retrieval works (matched ' + (sec?.matched ?? -1) + '): ok='
      + ((sec?.matched ?? 0) > 0 && Array.isArray(sec?.sections) && typeof sec.sections[0]?.text === 'string'));
  }

  // ---- P3: an empty query used to act as a wildcard and dump 32,251 chars.
  {
    let rejected = false;
    const empty = await text('fluent_get_token', { name: '' });
    rejected = /Empty token name|name must not be empty/.test(empty);
    console.log('get_token rejects an empty name instead of dumping every token (' + empty.length + ' chars): ok='
      + (rejected && empty.length < 1200));
    const ws = await text('fluent_get_token', { name: '   ' });
    console.log('get_token rejects a whitespace-only name (' + ws.length + ' chars): ok='
      + (/Empty token name/.test(ws) && ws.length < 1000));
    const broad = await text('fluent_get_token', { name: 'color' });
    console.log('get_token caps a broad fragment (' + broad.length + ' chars): ok='
      + (broad.length < 6000 && /showing|matched/.test(broad)));
    let famOk = true;
    for (const n of ['fontFamilyBase', 'fontFamilyMonospace', 'fontFamilyNumeric']) {
      const r = await text('fluent_get_token', { name: n });
      if (/^No token matching/.test(r) || !r.includes(n)) famOk = false;
    }
    console.log('the 3 fontFamily tokens resolve under their shipped names: ok=' + famOk);
    // This check used to assert that `theme` was a no-op for shadows, which
    // encoded a data gap as if it were correct behaviour. Shadows ARE
    // theme-dependent and the dataset now carries all three sets, so assert the
    // real contract: dark differs from light, and the Brand caveat is stated.
    const shadowDark = await text('fluent_list_tokens', { category: 'shadow', theme: 'dark' });
    const shadowLight = await text('fluent_list_tokens', { category: 'shadow', theme: 'light' });
    console.log('list_tokens honours theme for shadow and explains the Brand exception: ok='
      + (shadowDark !== shadowLight
        && /shadow\*Brand variants are theme-invariant/.test(shadowDark)
        && !/theme does NOT affect this category/.test(shadowDark)));
  }

  // ---- P4: config tools used to accept anything and destroy malformed files.
  {
    const bad = AUD + '/badcfg';
    mkdirSync(bad, { recursive: true });
    const badPath = bad + '/fluent.config.json';
    const badRaw = '{ this is not json ';
    writeFileSync(badPath, badRaw, 'utf8');
    const g = jsonOf(await text('fluent_get_config', { projectDir: bad })) ?? {};
    console.log('malformed config reported as present with a parseError: ok='
      + (g.configExists === true && g.configParsed === false && typeof g.parseError === 'string'));
    const setOnBad = jsonOf(await text('fluent_set_config', { projectDir: bad, key: 'brand.name', value: 'acme' })) ?? {};
    console.log('set_config refuses to overwrite a malformed config: ok='
      + (setOnBad.written === false && typeof setOnBad.parseError === 'string'
        && readFileSync(badPath, 'utf8') === badRaw));

    const badMem = AUD + '/badmem';
    mkdirSync(badMem + '/.fluent', { recursive: true });
    const memPath = badMem + '/.fluent/memory.json';
    const memRaw = '{ nope ';
    writeFileSync(memPath, memRaw, 'utf8');
    const rem = jsonOf(await text('fluent_remember', { projectDir: badMem, question: 'q', answer: 'a' })) ?? {};
    console.log('remember refuses to overwrite a malformed memory file: ok='
      + (rem.written === false && typeof rem.memoryParseError === 'string'
        && readFileSync(memPath, 'utf8') === memRaw));

    const ok1 = AUD + '/cfg';
    mkdirSync(ok1, { recursive: true });
    const unknown = jsonOf(await text('fluent_set_config', { projectDir: ok1, key: 'nope.nothere', value: 'x' })) ?? {};
    console.log('set_config rejects an unknown key: ok='
      + (unknown.written === false && /not a known Fluent 2 preset/.test(unknown.error ?? '')));
    const badColor = jsonOf(await text('fluent_set_config', { projectDir: ok1, key: 'brand.color', value: 'not-a-color' })) ?? {};
    console.log('set_config rejects a value the theme tools would refuse: ok='
      + (badColor.written === false && /6-digit hex/.test(badColor.error ?? '')));
    const badEnum = jsonOf(await text('fluent_set_config', { projectDir: ok1, key: 'accessibility.targetLevel', value: 'AAAA' })) ?? {};
    console.log('set_config rejects an out-of-enum value: ok=' + (badEnum.written === false));
    const good = jsonOf(await text('fluent_set_config', { projectDir: ok1, key: 'brand.color', value: '#D13438' })) ?? {};
    console.log('set_config still writes a valid value: ok=' + (good.written === true && good.value === '#D13438'));

    const deep = AUD + '/nope/nothere/zzz';
    const init = jsonOf(await text('fluent_init_config', { projectDir: deep })) ?? {};
    console.log('init_config refuses to materialize a deep missing tree: ok='
      + (init.written === false && !existsSync(AUD + '/nope')));
    const clobber = jsonOf(await text('fluent_init_config', { projectDir: ok1 })) ?? {};
    const clobber2 = jsonOf(await text('fluent_init_config', { projectDir: ok1, brandColor: '#742774' })) ?? {};
    console.log('init_config still refuses to clobber without force: ok='
      + (clobber.written === false || clobber2.written === false));

    const memDir = AUD + '/mem';
    mkdirSync(memDir, { recursive: true });
    await text('fluent_remember', { projectDir: memDir, question: 'What brand color?', answer: 'blue' });
    const up = jsonOf(await text('fluent_remember', { projectDir: memDir, question: 'What brand color?', answer: 'green' })) ?? {};
    const decisions = up.decisions ?? [];
    console.log('remember upserts instead of duplicating an id (' + decisions.length + ' decision(s), action=' + up.action + '): ok='
      + (decisions.length === 1 && decisions[0].answer === 'green' && decisions[0].supersededAnswer === 'blue'));
    const miss = jsonOf(await text('fluent_recall', { projectDir: memDir, filter: 'zzzz' })) ?? {};
    const hit = jsonOf(await text('fluent_recall', { projectDir: memDir, filter: 'brand' })) ?? {};
    console.log('recall echoes the filter and a match count: ok='
      + (miss.filter === 'zzzz' && miss.matched === 0 && miss.total >= 1 && hit.matched === 1));
  }

  // ---- P5: webcomponents used to return the same 592-char snippet for all four
  // kinds, and once emitted a <fluent-card> element that does not exist in v3.
  {
    const tagData = jsonOf(readFileSync(new URL('data/web-component-tags.json', import.meta.url), 'utf8')) ?? {};
    const realTags = new Set(tagData.tags ?? []);
    const outputs = {};
    for (const kind of ['app', 'form', 'card', 'copilot-chat']) {
      outputs[kind] = await text('fluent_generate_code', { kind, framework: 'webcomponents' });
    }
    console.log('every webcomponents kind returns a different snippet (' + new Set(Object.values(outputs)).size + '/4 distinct): ok='
      + (new Set(Object.values(outputs)).size === 4));
    const bogus = [];
    for (const [kind, out] of Object.entries(outputs)) {
      for (const m of out.match(/<(fluent-[a-z0-9-]+)/g) ?? []) {
        const tag = m.slice(1);
        if (!realTags.has(tag)) bogus.push(kind + ':' + tag);
      }
    }
    console.log('every emitted <fluent-*> tag exists in v3 (' + (bogus.join(', ') || 'none bogus') + '): ok='
      + (realTags.size > 0 && bogus.length === 0));
    console.log('webcomponents form actually contains a form: ok='
      + (/<form/.test(outputs.form) && /fluent-text-input/.test(outputs.form) && /fluent-field/.test(outputs.form)));
    console.log('webcomponents copilot-chat is a chat and names the React-only limit: ok='
      + (/REACT ONLY/i.test(outputs['copilot-chat']) && /fluent-text-area/.test(outputs['copilot-chat'])));
    console.log('webcomponents snippets carry the mandatory side-effect imports: ok='
      + Object.values(outputs).every((o) => /@fluentui\/web-components\/[a-z-]+\.js/.test(o)));
  }

  // ---- P6: smaller correctness fixes.
  {
    const themeErr = await text('fluent_generate_theme', { brandColor: 'red' });
    console.log('generate_theme colour error self-describes: ok=' + /6-digit hex/.test(themeErr));
    const initSchema = (await client.listTools()).tools.find((t) => t.name === 'fluent_init_config');
    const targetsEnum = initSchema?.inputSchema?.properties?.targets?.items?.enum ?? [];
    console.log('init_config targets enum is published in the schema (' + targetsEnum.length + ' values): ok='
      + (targetsEnum.includes('web-react') && targetsEnum.includes('powerbi')));
    // Gated topics return four empty arrays; without a machine-readable refusal
    // that shape invites invention. With the local overlay present the topic is
    // restored instead, which is the correct behaviour but proves nothing here.
    const overlayPresent = existsSync(new URL('data/local/design-guidance.json', import.meta.url));
    const gated = jsonOf(await text('fluent_design_guidance', { topic: 'personality-principles' })) ?? {};
    const gatedOk = overlayPresent
      ? !gated.gatedNotice
      : typeof gated.agentInstruction === 'string' && /Do not infer or generate guidance/.test(gated.agentInstruction);
    console.log('gated topic carries a machine-readable refusal (' + (overlayPresent ? 'overlay present: restored instead' : 'public-clone shape') + '): ok=' + gatedOk);

    // ---- Presentation integrity: mcp/data/local/ is gitignored, so a checkout
    // that has it answers differently from a fresh clone. The difference has to
    // be visible in the output, not silent.
    const pubTopic = jsonOf(await text('fluent_design_guidance', { topic: 'color' })) ?? {};
    console.log('published topic is labelled source:"published": ok='
      + (pubTopic.$provenance?.source === 'published'));
    const gatedTopic = jsonOf(await text('fluent_design_guidance', { topic: 'entry-points' })) ?? {};
    const provOk = overlayPresent
      ? gatedTopic.$provenance?.source === 'local-overlay'
        && /mcp\/data\/local\//.test(gatedTopic.$provenance?.overlayFile ?? '')
        && gatedTopic.$provenance?.restoredChars > gatedTopic.$provenance?.publishedChars
      : gatedTopic.$provenance?.source === 'published';
    console.log('overlay-restored content is labelled source:"local-overlay" (' + (overlayPresent ? 'overlay present' : 'no overlay: published shape') + '): ok=' + provOk);
    const idx = jsonOf(await text('fluent_design_guidance', { topic: 'all' })) ?? {};
    const marked = Object.values(idx.topics ?? {}).filter((t) => t && t.source === 'local-overlay').length;
    console.log('index reports overlay coverage (present=' + idx.localOverlay?.present + ', marked rows=' + marked + '): ok='
      + (typeof idx.localOverlay?.present === 'boolean' && idx.localOverlay.present === overlayPresent
        && (overlayPresent ? marked === idx.localOverlay.enrichedTopics && marked > 0 : marked === 0)));
    const cfgOverlay = (jsonOf(await text('fluent_get_config', { projectDir: AUD })) ?? {}).localOverlay ?? {};
    console.log('get_config answers "what would a clone see?" in one call (present=' + cfgOverlay.present
      + ', records=' + cfgOverlay.totalRecords + '): ok='
      + (cfgOverlay.present === overlayPresent && Array.isArray(cfgOverlay.files)
        && (overlayPresent ? cfgOverlay.totalRecords > 0 : cfgOverlay.totalRecords === 0)));
  }

  rmSync(AUD, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// fluent_generate_theme: brand-ramp parity with Microsoft's Fluent 2 Theme Designer.
//
// The ramp used to be interpolated in HSL with hand-tuned lightness factors, which meant a
// user's generated theme never matched the theme the official tool would have given them.
// It is now a port of microsoft/fluentui
// packages/react-components/theme-designer/src/{utils/getBrandTokensFromPalette,colors/*}.ts
// (LCH key colour, two quadratic Bezier curves through D50 CIE LAB toward black and white,
// hue-specific lightness stops, sRGB gamut snapping).
//
// GROUND TRUTH below was scraped on 2026-08-16 from Microsoft's live Theme Designer at
// https://storybooks.fluentui.dev/react/iframe.html?viewMode=docs&id=theme-theme-designer--docs
// by driving its own inputs and reading the rendered swatches. Its Form.tsx defaults both
// sliders to 0 and passes { hueTorsion: torsion/100, darkCp: vibrancy/100, lightCp: vibrancy/100 },
// which is what this tool defaults to.
{
  const themeText = async (args) =>
    (await client.callTool({ name: 'fluent_generate_theme', arguments: args })).content[0].text;
  const rampOf = (t) => {
    const out = {};
    for (const m of t.matchAll(/^ {2}(\d+): '(#[0-9a-fA-F]{6})',$/gm)) out[m[1]] = m[2];
    return out;
  };
  const EXPECTED_KEYS = Array.from({ length: 16 }, (_, i) => String((i + 1) * 10));
  // WCAG relative luminance - a strictly monotonic function of L*, so it is a fair proxy
  // for "the ramp gets lighter at every step".
  const luminance = (hex) => {
    const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };

  const DESIGNER = [
    ['Fluent brand #0F6CBD', { brandColor: '#0F6CBD' }, '#020305 #111723 #16263d #193253 #1b3f6a #1b4c82 #18599b #1267b4 #3174c2 #4f82c8 #6790cf #7d9ed5 #92acdc #a6bae2 #bac9e9 #cdd8ef'],
    ['saturated red #D13438', { brandColor: '#D13438' }, '#060201 #25110d #3f1916 #551e1b #6c2320 #842826 #9c2c2c #b53031 #cf3337 #d94d49 #e1645c #e87a70 #ee8f84 #f4a399 #f8b7af #fbcbc5'],
    ['green #107C10', { brandColor: '#107C10' }, '#020401 #101c0a #142f10 #163d11 #174c12 #175a12 #156a12 #117910 #308728 #4b9440 #62a156 #79ae6d #8ebb84 #a4c89a #bad5b2 #cfe2c9'],
    ['very light #FAF0E6', { brandColor: '#FAF0E6' }, '#030303 #181717 #272625 #333230 #403e3c #4d4a48 #5a5754 #686460 #76726d #847f7a #938d88 #a29c95 #b1aaa3 #c1b9b1 #d0c8c0 #e0d7ce'],
    ['very dark #0B0F14', { brandColor: '#0B0F14' }, '#020304 #14171b #232529 #2e3134 #3b3d40 #47494d #545659 #616366 #6f7174 #7d7f81 #8b8d8f #9a9b9d #a9aaab #b8b9ba #c7c8c9 #d6d7d8'],
    ['highly saturated cyan #00E5FF', { brandColor: '#00E5FF' }, '#020404 #101a1c #162c30 #1a393e #1d474e #1f555d #21636d #22727e #23818f #2391a0 #21a1b2 #1fb1c4 #1ac1d7 #13d2e9 #03e2fc #7dedff'],
    ['near-grey #7A7B7C', { brandColor: '#7A7B7C' }, '#030303 #171717 #252525 #303131 #3c3d3d #49494a #565657 #636464 #707172 #7e7f80 #8c8d8e #9b9b9c #a9aaab #b8b9b9 #c7c8c8 #d7d7d7'],
    ['pure grey #808080', { brandColor: '#808080' }, '#030303 #171717 #252525 #313131 #3d3d3d #494949 #565656 #636363 #717171 #7f7f7f #8d8d8d #9b9b9b #aaaaaa #b9b9b9 #c8c8c8 #d7d7d7'],
    ['pure black #000000', { brandColor: '#000000' }, '#030303 #171717 #252525 #313131 #3d3d3d #494949 #565656 #636363 #717171 #7f7f7f #8d8d8d #9b9b9b #aaaaaa #b9b9b9 #c8c8c8 #d7d7d7'],
    ['pure white #FFFFFF', { brandColor: '#FFFFFF' }, '#030303 #171717 #252525 #313131 #3d3d3d #494949 #565656 #636363 #717171 #7f7f7f #8d8d8d #9b9b9b #aaaaaa #b9b9b9 #c8c8c8 #d7d7d7'],
    ['#0F6CBD at vibrancy 50', { brandColor: '#0F6CBD', vibrancy: 50 }, '#010307 #07182d #00274b #00335f #003f74 #004c8a #005aa0 #0067b7 #2575c7 #3e82d4 #5590e0 #6b9fea #81adf3 #98bbfa #aecafe #c5d9ff'],
    ['#0F6CBD at hueTorsion 30', { brandColor: '#0F6CBD', hueTorsion: 30 }, '#010305 #0e1823 #10273d #103453 #0f406a #0d4d82 #0c5a9b #0d67b4 #3574c2 #5581c8 #6e8ecf #859cd5 #9aaadc #aeb8e2 #c1c7e9 #d3d6ef'],
    ['#D13438 at hueTorsion -25, vibrancy -40', { brandColor: '#D13438', hueTorsion: -25, vibrancy: -40 }, '#050201 #21140e #381e17 #4c261d #602d24 #76352b #8d3c33 #a5423a #bf4742 #c95c56 #d1706a #d9837e #e09692 #e7a9a6 #edbbba #f3cecd'],
  ];

  const ramps = new Map();
  const mismatched = [];
  for (const [label, args, expected] of DESIGNER) {
    const ramp = rampOf(await themeText(args));
    ramps.set(label, ramp);
    const got = EXPECTED_KEYS.map((k) => ramp[k]).join(' ');
    if (got !== expected) mismatched.push(`${label}\n      got  ${got}\n      want ${expected}`);
  }
  console.log('generate_theme reproduces the live Fluent 2 Theme Designer ramp for all '
    + DESIGNER.length + ' cases (16 stops each, exact hex): ok=' + (mismatched.length === 0));
  if (mismatched.length) for (const m of mismatched) console.log('    - ' + m);

  const fluent = ramps.get('Fluent brand #0F6CBD');
  console.log("generate_theme(#0F6CBD) slot 80 = " + fluent['80'] + " and slot 160 = " + fluent['160']
    + " (Theme Designer values, NOT the hand-curated brandWeb literal): ok="
    + (fluent['80'] === '#1267b4' && fluent['160'] === '#cdd8ef'));

  const nonMonotonic = [];
  for (const [label, ramp] of ramps) {
    const ls = EXPECTED_KEYS.map((k) => luminance(ramp[k]));
    for (let i = 1; i < ls.length; i++) if (!(ls[i] > ls[i - 1])) nonMonotonic.push(`${label}@${EXPECTED_KEYS[i]}`);
  }
  console.log('every generated ramp is strictly monotonic in lightness across all 16 stops ('
    + ramps.size + ' ramps checked): ok=' + (nonMonotonic.length === 0)
    + (nonMonotonic.length ? ' broken=' + nonMonotonic.join(',') : ''));

  const keyProblems = [];
  const stopProblems = [];
  for (const [label, ramp] of ramps) {
    if (Object.keys(ramp).join(',') !== EXPECTED_KEYS.join(',')) keyProblems.push(label + ' -> ' + Object.keys(ramp).join(','));
    for (const k of EXPECTED_KEYS) {
      const v = ramp[k];
      if (!/^#[0-9a-f]{6}$/.test(String(v))) stopProblems.push(`${label}@${k}=${v}`);
    }
  }
  console.log('stop keys are exactly 10..160 in order, 16 of them, for every ramp: ok=' + (keyProblems.length === 0)
    + (keyProblems.length ? ' bad=' + keyProblems.join(' | ') : ''));

  // The old HSL ramp clamped lightness, so degenerate inputs could repeat a stop or emit NaN
  // once a channel went out of range. Black, white and grey are the inputs that used to hurt.
  const degenerate = ['pure black #000000', 'pure white #FFFFFF', 'pure grey #808080', 'near-grey #7A7B7C'];
  const dupes = [];
  for (const label of degenerate) {
    const vals = EXPECTED_KEYS.map((k) => ramps.get(label)[k]);
    if (new Set(vals).size !== 16) dupes.push(label + ' -> ' + (16 - new Set(vals).size) + ' duplicate stop(s)');
  }
  const black = await themeText({ brandColor: '#000000' });
  const white = await themeText({ brandColor: '#FFFFFF' });
  const grey = await themeText({ brandColor: '#808080' });
  const nan = /NaN|undefined|#NaN/.test(black + white + grey);
  console.log('black / white / grey inputs produce 16 distinct, NaN-free stops: ok='
    + (dupes.length === 0 && !nan && stopProblems.length === 0)
    + (dupes.length ? ' dupes=' + dupes.join(' | ') : '') + (nan ? ' NaN in output' : '')
    + (stopProblems.length ? ' malformed=' + stopProblems.join(',') : ''));

  // Output shape must not have moved: TS module, both theme factories, and 16 CSS variables.
  const shape = await themeText({ brandColor: '#0F6CBD', name: 'contoso' });
  const cssVars = EXPECTED_KEYS.every((k) => shape.includes(`--colorBrand${k}: ${fluent[k]};`));
  console.log('output shape stable (BrandVariants + createLightTheme + createDarkTheme + 16 --colorBrand* vars): ok='
    + (shape.includes('export const contoso: BrandVariants')
      && shape.includes('createLightTheme(contoso)') && shape.includes('createDarkTheme(contoso)')
      && shape.includes(':root {') && cssVars));

  // The notes must describe the algorithm that actually runs; the old text advertised HSL.
  console.log('generate_theme notes describe the real LAB/Bezier algorithm and no longer claim HSL: ok='
    + (/Bezier/.test(shape) && /LAB/.test(shape) && !/HSL/i.test(shape)));

  // Quoted round-trip evidence for two brand colours, straight off the MCP stdio transport.
  console.log('ROUND-TRIP fluent_generate_theme(#0F6CBD) -> 80: ' + fluent['80']
    + ' | ' + EXPECTED_KEYS.map((k) => fluent[k]).join(' '));
  const red = ramps.get('saturated red #D13438');
  console.log('ROUND-TRIP fluent_generate_theme(#D13438) -> 80: ' + red['80']
    + ' | ' + EXPECTED_KEYS.map((k) => red[k]).join(' '));
}

// ===========================================================================
// Design-name -> code-token bridge (ADDED).
//
// The defect: mcp/data/design-guidance.json carried Microsoft's design-site
// names and mcp/data/fluent-tokens.json carried the code names, and the two
// radius scales are OFFSET BY ONE STEP. An agent told "Large = 8 pixels" wrote
// tokens.borderRadiusLarge and silently got 6px. Every check below is about
// keeping that bridge true: names that exist, values that agree, and the offset
// stated out loud. All of them are overlay-independent — the affected topics
// are public, so these pass identically in a fresh clone and in a checkout that
// has mcp/data/local/.
// ===========================================================================
{
  const text = async (name, args = {}) => {
    try {
      const r = await client.callTool({ name, arguments: args });
      return r.content[0].text;
    } catch (e) {
      return String(e && e.message ? e.message : e);
    }
  };
  const jsonOf = (s) => { try { return JSON.parse(s); } catch { return null; } };

  const tokenData = JSON.parse(readFileSync(new URL('data/fluent-tokens.json', import.meta.url), 'utf8'));
  const guidanceData = JSON.parse(readFileSync(new URL('data/design-guidance.json', import.meta.url), 'utf8'));
  const bridge = tokenData.designNameBridge ?? {};
  const bridgeEntries = bridge.entries ?? [];

  // Every token name the bridge hands out has to exist, or the bridge is just a
  // second way to write code that does not compile.
  const tokenNames = new Set();
  (function collect(node) {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      tokenNames.add(k);
      if (v && typeof v === 'object' && !Array.isArray(v)) collect(v);
    }
  })({
    typography: tokenData.typography,
    spacing: tokenData.spacing,
    borderRadius: tokenData.borderRadius,
    strokeWidth: tokenData.strokeWidth,
    shadow: tokenData.shadow,
    motion: tokenData.motion,
  });
  for (const k of Object.keys(tokenData.color?.semanticLight ?? {})) tokenNames.add(k);

  {
    const ghosts = [];
    for (const e of bridgeEntries) {
      if (e.codeToken && !tokenNames.has(e.codeToken)) ghosts.push(`${e.id}:${e.codeToken}`);
      const members = Array.isArray(e.codeTokens) ? e.codeTokens : Object.values(e.codeTokens ?? {});
      for (const m of members) if (m && !tokenNames.has(m)) ghosts.push(`${e.id}:${m}`);
    }
    console.log('every bridge codeToken exists in fluent-tokens.json (' + bridgeEntries.length + ' entries, '
      + (ghosts.join(', ') || 'no ghosts') + '): ok=' + (bridgeEntries.length >= 40 && ghosts.length === 0));
  }

  // The whole point is matching by VALUE. An "exact" row whose token carries a
  // different number would reintroduce the original defect wearing a new label.
  {
    const px = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return NaN;
      if (v.trim() === '0') return 0;
      const m = /^(-?\d+(?:\.\d+)?)\s*(?:px|pixel|pixels)$/i.exec(v.trim());
      return m ? Number(m[1]) : NaN;
    };
    const bad = [];
    let compared = 0;
    for (const e of bridgeEntries) {
      if (e.valueMatch !== 'exact') continue;
      if (e.kind === 'typeRamp') {
        compared++;
        const size = tokenData.typography.fontSizes[e.codeTokens.fontSize];
        const lh = tokenData.typography.lineHeights[e.codeTokens.lineHeight];
        const wt = tokenData.typography.fontWeights[e.codeTokens.fontWeight];
        const ramp = tokenData.typography.ramp[e.codeToken];
        if (px(size) !== px(ramp?.fontSize) || px(lh) !== px(ramp?.lineHeight) || wt !== ramp?.fontWeight) {
          bad.push(`${e.id}: tokens do not compose the ramp step`);
        }
        if (!String(e.designValue).startsWith(String(ramp?.fontSize))) bad.push(`${e.id}: ${e.designValue} vs ${ramp?.fontSize}`);
        continue;
      }
      compared++;
      if (px(e.designValue) !== px(e.codeValue)) bad.push(`${e.id}: ${e.designValue} != ${e.codeValue}`);
    }
    console.log('every exact-match codeToken carries the design row\'s stated value (' + compared + ' compared, '
      + (bad.join('; ') || 'all agree') + '): ok=' + (compared >= 30 && bad.length === 0));
  }

  // Rows that could NOT be mapped must say so instead of silently borrowing the
  // nearest token — that substitution is the failure mode this replaces.
  {
    const unmapped = bridgeEntries.filter((e) => !e.codeToken && !e.codeSymbol);
    const silent = unmapped.filter((e) => !e.reason || e.valueMatch !== 'none');
    console.log('unmapped design names admit it with a reason (' + unmapped.length + ' unmapped, '
      + (silent.length ? silent.map((e) => e.id).join(', ') : 'all explained') + '): ok='
      + (unmapped.length > 0 && silent.length === 0));
  }

  // The offset itself. Assert the real numbers, not just that a warning exists.
  {
    const radius = guidanceData.topics.shapes.values.cornerRadius;
    const byName = Object.fromEntries(radius.map((r) => [r.token, r]));
    const large = byName['Large'];
    const xl = byName['X-Large'];
    const medium = byName['Medium'];
    const offsetOk =
      large?.codeToken === 'borderRadiusXLarge' && large?.codeValue === '8px' &&
      xl?.codeToken === 'borderRadius2XLarge' && xl?.codeValue === '12px' &&
      tokenData.borderRadius.borderRadiusLarge === '6px' &&
      /NAME COLLISION/.test(large?.nameCollisionWarning ?? '') && /borderRadiusLarge/.test(large?.nameCollisionWarning ?? '') &&
      /NAME COLLISION/.test(xl?.nameCollisionWarning ?? '') &&
      medium?.codeToken === 'borderRadiusMedium' && !medium?.nameCollisionWarning;
    console.log('radius offset rows carry the collision warning (Large->' + large?.codeToken + ', X-Large->' + xl?.codeToken
      + ', Medium unflagged): ok=' + offsetOk);

    // Both stored copies of the table must agree; the dataset keeps each table
    // twice and enriching only one would leave half the readers on stale data.
    const copyOk = JSON.stringify(guidanceData.topics.shapes.cornerRadius.scale) === JSON.stringify(radius)
      && JSON.stringify(guidanceData.topics.layout.spacingRamp.values) === JSON.stringify(guidanceData.topics.layout.values.spacingRamp)
      && JSON.stringify(guidanceData.topics.typography.typeRamp) === JSON.stringify(guidanceData.topics.typography.values.typeRamp.web);
    console.log('both stored copies of every enriched table agree: ok=' + copyOk);
  }

  // sizeNNN does not exist in code at all — a different failure from the radius
  // offset (this one does not compile) and it has to be labelled differently.
  {
    const ramp = guidanceData.topics.layout.values.spacingRamp;
    const s120 = ramp.find((r) => r.token === 'size120');
    const s280 = ramp.find((r) => r.token === 'size280');
    const ok = s120?.codeToken === 'spacingHorizontalM' && s120?.codeTokens?.vertical === 'spacingVerticalM'
      && s120?.codeValue === '12px' && /does not exist/.test(s120?.nameCollisionWarning ?? '')
      && s280?.codeToken === null && /no spacing token/i.test(s280?.codeTokenNote ?? '')
      && ramp.every((r) => 'codeToken' in r);
    console.log('spacing ramp maps sizeNNN by value and nulls the steps code lacks (size120->' + s120?.codeToken
      + ', size280->' + s280?.codeToken + '): ok=' + ok);
  }

  // The type ramp connects rather than duplicates: the three token names plus
  // the composed style, and an honest "partial" where the site and the package
  // disagree (Subtitle 1 is 26px on the site, 28px in the package).
  {
    const web = guidanceData.topics.typography.values.typeRamp.web;
    const body1 = web.find((r) => r.name === 'Body 1');
    const sub1 = web.find((r) => r.name === 'Subtitle 1');
    const ok = body1?.codeToken === 'body1' && body1?.codeTokens?.fontSize === 'fontSizeBase300'
      && body1?.codeTokens?.lineHeight === 'lineHeightBase300' && body1?.codeTokens?.fontWeight === 'fontWeightRegular'
      && body1?.valueMatch === 'exact'
      && sub1?.valueMatch === 'partial' && /lineHeight/.test(sub1?.codeTokenNote ?? '');
    console.log('type ramp links to fontSize/lineHeight/fontWeight tokens and flags the one disagreement: ok=' + ok);
  }

  // Colour and accessibility were the two topics that named nothing usable.
  {
    const colorRows = guidanceData.topics.color.codeTokenBridge?.palettes ?? [];
    const light = tokenData.color.semanticLight;
    const colorOk = colorRows.length >= 4
      && colorRows.every((r) => r.codeToken in light && (r.codeTokens ?? []).every((t) => t in light));
    console.log('color topic names real alias tokens (' + colorRows.length + ' palettes, '
      + Object.keys(light).length + ' aliases): ok=' + colorOk);

    const themes = guidanceData.topics.accessibility.values.themeObjects ?? [];
    const bySymbol = Object.fromEntries(themes.map((t) => [t.designName, t.codeSymbol]));
    const themeOk = themes.length === 4 && bySymbol.light === 'webLightTheme' && bySymbol.dark === 'webDarkTheme'
      && bySymbol['high-contrast'] === 'teamsHighContrastTheme'
      && /createLightTheme/.test(bySymbol.branded ?? '')
      && Array.isArray(guidanceData.topics.accessibility.values.themes);
    console.log('accessibility topic names real theme objects and keeps the published themes list: ok=' + themeOk);
  }

  // The tools, not just the data. A design-side name has to resolve through
  // fluent_get_token, and the answer has to be the RIGHT token.
  {
    const cases = [
      ['size120', 'spacingHorizontalM', /12px/],
      ['Large corner radius', 'borderRadiusXLarge', /borderRadiusLarge exists and is 6px/],
      ['Body 1', 'body1', /fontSizeBase300/],
      ['dark theme', 'webDarkTheme', /FluentProvider/],
    ];
    const bad = [];
    for (const [query, expect, alsoMatch] of cases) {
      const r = await text('fluent_get_token', { name: query });
      const j = jsonOf(r.slice(r.indexOf('{')));
      const resolved = j?.$designNameBridge?.resolved ?? [];
      const hit = resolved.some((e) => e.codeToken === expect || e.codeSymbol === expect);
      if (!hit || !alsoMatch.test(r)) bad.push(query);
    }
    console.log('get_token resolves design-side names to the right code token (' + cases.length + ' cases, '
      + (bad.join(', ') || 'all correct') + '): ok=' + (bad.length === 0));

    // The trap is symmetric: asking for the wrong-but-real token must warn too.
    const rev = await text('fluent_get_token', { name: 'borderRadiusLarge' });
    const revJson = jsonOf(rev.slice(rev.indexOf('{')));
    const warn = revJson?.$nameCollisionWarning?.tokens?.borderRadiusLarge;
    console.log('get_token warns when a lookup lands on the wrong half of the offset: ok='
      + (revJson?.['borderRadius.borderRadiusLarge'] === '6px'
        && warn?.correctTokenForDesignName === 'borderRadiusXLarge'));

    // An unrelated fragment must not start dragging bridge rows into the answer.
    const broad = await text('fluent_get_token', { name: 'color' });
    console.log('bridge does not fire on an unrelated fragment (' + broad.length + ' chars): ok='
      + (!/\$designNameBridge/.test(broad) && broad.length < 6000));
  }

  // fluent_design_guidance has to carry the mapping too — including on the
  // outline path, where row text is withheld and a design name with no code
  // token beside it is exactly how the original defect reached a model.
  {
    const bad = [];
    for (const topic of ['shapes', 'layout', 'typography', 'color', 'accessibility']) {
      const j = jsonOf(await text('fluent_design_guidance', { topic, maxChars: 120000 }));
      const b = j?.$codeTokenBridge;
      if (!b || !(b.designNamesMapped > 0) || !/codeToken/.test(b.note ?? '')) bad.push(topic);
    }
    console.log('design_guidance returns the code token alongside the design name ('
      + (bad.join(', ') || '5/5 topics') + '): ok=' + (bad.length === 0));

    // maxChars 6000: above the outline's own size (5,184) but far below the
    // topic's 48k, so this exercises the outline path and still returns JSON.
    const outline = jsonOf(await text('fluent_design_guidance', { topic: 'layout', maxChars: 6000 }));
    console.log('the bridge survives the truncated-outline path: ok='
      + (outline?.truncated === true && (outline?.$codeTokenBridge?.designNamesMapped ?? 0) > 0));

    const idx = jsonOf(await text('fluent_design_guidance', { topic: 'all' }));
    const rows = Object.values(idx?.topics ?? {}).filter((t) => t && t.codeTokenRows > 0).length;
    console.log('the all-index reports which topics carry code tokens (' + rows + ' topics): ok=' + (rows === 5));

    // The example the tool prints must be a key that really resolves.
    const shapes = jsonOf(await text('fluent_design_guidance', { topic: 'shapes', maxChars: 120000 }));
    const example = /name:\s*"([^"]+)"/.exec(shapes?.$codeTokenBridge?.resolveWith ?? '')?.[1];
    const echoed = example ? await text('fluent_get_token', { name: example }) : '';
    console.log('the resolveWith example the bridge prints actually resolves ("' + example + '"): ok='
      + (!!example && /\$designNameBridge/.test(echoed)));
  }

  // fluent_list_tokens must teach the same mapping at browse time.
  {
    const br = jsonOf(await text('fluent_list_tokens', { category: 'borderRadius' }));
    const names = br?.designNames ?? [];
    const large = names.find((r) => r.designName === 'Large');
    console.log('list_tokens(borderRadius) publishes the design-name map (' + names.length + ' rows): ok='
      + (names.length === 6 && large?.codeToken === 'borderRadiusXLarge' && /offset/i.test(br?.designNamesNote ?? '')));
    const sp = jsonOf(await text('fluent_list_tokens', { category: 'spacing' }));
    console.log('list_tokens(spacing) publishes the sizeNNN map (' + (sp?.designNames?.length ?? 0) + ' rows): ok='
      + ((sp?.designNames?.length ?? 0) === 17 && sp?.spacing?.horizontal?.spacingHorizontalM === '12px'));
  }

  // The two get-started routes. Facts + docUrl, no redistributed prose: the
  // repo has had one incident, so the shape is asserted, not assumed.
  {
    const design = jsonOf(await text('fluent_design_guidance', { topic: 'get-started-design', maxChars: 120000 }));
    const develop = jsonOf(await text('fluent_design_guidance', { topic: 'get-started-develop', maxChars: 120000 }));
    const designOk = design?.docUrl === 'https://fluent2.microsoft.design/get-started/design'
      && (design?.uiKits ?? []).length === 3 && (design?.kitTiers ?? []).length === 4
      && (design?.figmaVariables?.groups ?? []).length === 5
      && design.figmaVariables.groups.some((g2) => g2.group === 'corner radius' && /borderRadiusXLarge/.test(g2.caution ?? ''))
      && typeof design?.licensing === 'string' && design?.accessStatus === 'public';
    console.log('get-started-design covers the UI kits, tiers and Figma variable groups: ok=' + designOk);

    const byId = Object.fromEntries((develop?.platforms ?? []).map((p) => [p.id, p]));
    const developOk = develop?.docUrl === 'https://fluent2.microsoft.design/get-started/develop'
      && Object.keys(byId).length === 5
      && byId.react?.package === '@fluentui/react-components' && /npm install/.test(byId.react?.install?.npm ?? '')
      && byId['web-components']?.package === '@fluentui/web-components'
      && byId['web-components']?.setup?.themeFunction === 'setTheme'
      && byId.ios?.packages?.cocoaPods?.includes('MicrosoftFluentUI')
      && byId.android?.groupId === 'com.microsoft.fluentui'
      && hasLinkTo(JSON.stringify(byId.windows), 'learn.microsoft.com', '/en-us/windows/apps/winui/winui3/')
      && typeof develop?.licensing === 'string' && develop?.accessStatus === 'public';
    console.log('get-started-develop covers all 5 platforms with real packages and install commands: ok=' + developOk);

    // Both are public routes: they must read identically in a fresh clone.
    console.log('both get-started topics are published, not overlay-dependent: ok='
      + (design?.$provenance?.source === 'published' && develop?.$provenance?.source === 'published'));
  }

  // The generator is the single source of truth for both files. If someone edits
  // one by hand the two drift, and the drift is invisible until an agent is
  // already writing the wrong token.
  {
    const drift = [];
    const rowsFor = { shapes: guidanceData.topics.shapes.values.cornerRadius, layout: guidanceData.topics.layout.values.spacingRamp };
    for (const e of bridgeEntries.filter((x) => x.kind === 'cornerRadius')) {
      const row = rowsFor.shapes.find((r) => r.token === e.designName);
      if (row?.codeToken !== e.codeToken) drift.push(e.id);
    }
    for (const e of bridgeEntries.filter((x) => x.kind === 'spacing')) {
      const row = rowsFor.layout.find((r) => r.token === e.designName);
      if (row?.codeToken !== e.codeToken) drift.push(e.id);
    }
    console.log('design-guidance rows and the token-side bridge index agree ('
      + (drift.join(', ') || 'no drift') + '): ok=' + (drift.length === 0));
  }
}

// ===========================================================================
// Fluent charting coverage (mcp/data/fluent-charts.json).
// The plugin shipped Power BI tooling with zero data-visualisation story:
// `@fluentui/react-charts` and `DataVizPalette` appeared 0 times across
// mcp/data/*.json, so "which Fluent chart do I use for X, and how do I theme
// it?" had no grounded answer. These checks hold the new dataset to the same
// standard as the rest, and pin the Power BI palette to Fluent's own.
// ===========================================================================
{
  const chartsData = JSON.parse(readFileSync(new URL('data/fluent-charts.json', import.meta.url), 'utf8'));
  const say = async (name, args = {}) => {
    const r = await client.callTool({ name, arguments: args });
    return r.content[0].text;
  };
  const asJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

  // ---- The dataset describes itself honestly.
  const charts = chartsData.charts ?? [];
  console.log('charts dataset count matches its own meta (' + charts.length + ' vs meta.chartsCatalogued='
    + chartsData.meta.chartsCatalogued + '): ok=' + (charts.length > 0 && charts.length === chartsData.meta.chartsCatalogued));

  const TIERS = new Set(['stable', 'preview', 'legacy']);
  const untiered = charts.filter((c) => !TIERS.has(c.maturity) || !c.maturityReason);
  console.log('every chart carries a maturity tier + reason (' + (untiered.map((c) => c.name).join(', ') || 'all ' + charts.length + ' tiered') + '): ok='
    + (charts.length > 0 && untiered.length === 0));

  // The three sibling packages export the SAME component names at three
  // different maturities, so calling the 0.0.x one "stable" or the v8 one
  // "current" would be a real defect, not a wording nit.
  const pkgs = Object.fromEntries((chartsData.meta.packages ?? []).map((p) => [p.name, p]));
  const tiersOk =
    pkgs['@fluentui/react-charts']?.maturity === 'stable' &&
    pkgs['@fluentui/react-charting']?.maturity === 'legacy' &&
    pkgs['@fluentui/chart-web-components']?.maturity === 'preview' &&
    /^0\./.test(pkgs['@fluentui/chart-web-components']?.version ?? '') &&
    /^5\./.test(pkgs['@fluentui/react-charting']?.version ?? '') &&
    /^9\./.test(pkgs['@fluentui/react-charts']?.version ?? '') &&
    /same name/i.test(pkgs['@fluentui/react-charting']?.collisionWarning ?? '');
  console.log('chart packages tiered stable/legacy/preview with the name-collision warning ('
    + Object.values(pkgs).map((p) => p.name.replace('@fluentui/', '') + '@' + p.version + '=' + p.maturity).join(', ') + '): ok=' + tiersOk);

  // Curated mappings must point at visuals this plugin actually catalogs.
  {
    const pv = JSON.parse(readFileSync(new URL('data/powerbi-visuals.json', import.meta.url), 'utf8'));
    const known = new Set();
    for (const cat of pv.categories ?? []) for (const v of cat.visuals ?? []) known.add(v.name);
    for (const f of pv.featurePages ?? []) known.add(f.name);
    const dangling = charts.filter((c) => c.powerbiEquivalent && !known.has(c.powerbiEquivalent));
    console.log('every curated powerbiEquivalent names a real Power BI visual ('
      + (dangling.map((c) => c.name + '->' + c.powerbiEquivalent).join(', ') || charts.filter((c) => c.powerbiEquivalent).length + ' mapped, 0 dangling') + '): ok='
      + (dangling.length === 0));
  }

  // ---- The palette is the real one, not a plausible-looking one.
  const qual = chartsData.dataVizPalette?.qualitative ?? [];
  const sem = chartsData.dataVizPalette?.semantic ?? [];
  const hexOk = [...qual, ...sem].every((c) => /^#[0-9a-f]{6}$/i.test(c.light) && /^#[0-9a-f]{6}$/i.test(c.dark));
  const slotsOk = qual.every((c, i) => c.slot === i + 1 && c.token === 'DataVizPalette.color' + (i + 1));
  console.log('DataVizPalette is complete and well-formed (' + qual.length + ' qualitative + ' + sem.length + ' semantic, slots in order): ok='
    + (qual.length === 40 && sem.length === 7 && hexOk && slotsOk));

  // ---- The Power BI theme now paints with that palette.
  // BEFORE: dataColors was a hand-picked 12-colour list led by #0F6CBD, which
  // is NOT what @fluentui/react-charts paints with - the same series rendered
  // in two different colours on the two surfaces.
  const expectLight = qual.map((c) => '#' + c.light.replace('#', '').toUpperCase());
  const themeText = await say('fluent_generate_powerbi_theme', { brandColor: '#0F6CBD', name: 'Fluent Charts Smoke' });
  const theme = asJson(themeText);
  const dcMatch = !!theme && JSON.stringify(theme.dataColors) === JSON.stringify(expectLight);
  console.log('powerbi theme dataColors ARE the DataVizPalette qualitative slots (' + (theme?.dataColors?.length ?? 0) + '/' + expectLight.length
    + ' in slot order, first=' + (theme?.dataColors?.[0] ?? '-') + '): ok=' + dcMatch);

  const semGet = (k) => sem.find((s) => s.key === k);
  console.log('powerbi theme good/bad ARE the DataVizPalette semantic colours (good=' + theme?.good + ' bad=' + theme?.bad + '): ok='
    + (theme?.good?.toUpperCase() === semGet('success').light.toUpperCase() && theme?.bad?.toUpperCase() === semGet('error').light.toUpperCase()));

  const darkTheme = asJson(await say('fluent_generate_powerbi_theme', { paletteTheme: 'dark', dataColorCount: 12 }));
  const expectDark = qual.slice(0, 12).map((c) => '#' + c.dark.replace('#', '').toUpperCase());
  console.log('paletteTheme="dark" emits the dark variants (slot 11 light=' + expectLight[10] + ' dark=' + (darkTheme?.dataColors?.[10] ?? '-') + '): ok='
    + (JSON.stringify(darkTheme?.dataColors) === JSON.stringify(expectDark) && expectDark[10] !== expectLight[10]));

  // brandColor deliberately no longer overwrites series 1: replacing a slot
  // chosen for qualitative separation with an arbitrary brand hex breaks the
  // match with the React chart. The old behaviour is still reachable.
  const branded = asJson(await say('fluent_generate_powerbi_theme', { brandColor: '#D13438' }));
  const brandFirst = asJson(await say('fluent_generate_powerbi_theme', { brandColor: '#D13438', brandFirstDataColor: true }));
  console.log('brandColor recolors the brand accents but not series 1 (dataColors[0]=' + branded?.dataColors?.[0]
    + ', tableAccent=' + branded?.tableAccent + ', opt-in override=' + brandFirst?.dataColors?.[0] + '): ok='
    + (branded?.dataColors?.[0] === expectLight[0] && branded?.tableAccent === '#D13438' && branded?.maximum === '#D13438'
      && brandFirst?.dataColors?.[0] === '#D13438' && brandFirst?.dataColors?.[1] === expectLight[1]));

  // ---- The theme is still a legal Power BI theme.
  // reportThemeSchema-2.156 is additionalProperties:false at the top level and
  // types every colour as ^#[0-9a-fA-F]{8}$|^#(?:[0-9a-fA-F]{3}){1,2}$, so a
  // stray key or a malformed hex would be rejected on import.
  {
    const SCHEMA_TOP_LEVEL = new Set(['$schema', 'name', 'baseTheme', 'visualStyles', 'dataColors', 'icons', 'textClasses',
      'foreground', 'firstLevelElements', 'secondLevelElements', 'thirdLevelElements', 'fourthLevelElements', 'background',
      'secondaryBackground', 'good', 'neutral', 'bad', 'maximum', 'center', 'minimum', 'null', 'accent', 'tableAccent',
      'foregroundLight', 'foregroundDark', 'foregroundNeutralLight', 'foregroundNeutralDark', 'foregroundNeutralSecondary',
      'foregroundNeutralSecondaryAlt', 'foregroundNeutralSecondaryAlt2', 'foregroundNeutralTertiary', 'foregroundNeutralTertiaryAlt',
      'foregroundSelected', 'foregroundButton', 'backgroundLight', 'backgroundNeutral', 'backgroundDark', 'hyperlink',
      'visitedHyperlink', 'shapeStroke', 'disabledText', 'mapPushpin']);
    const COLOR = /^#[0-9a-fA-F]{8}$|^#(?:[0-9a-fA-F]{3}){1,2}$/;
    const strayKeys = Object.keys(theme ?? {}).filter((k) => !SCHEMA_TOP_LEVEL.has(k));
    const badColors = [
      ...(theme?.dataColors ?? []),
      ...['good', 'neutral', 'bad', 'maximum', 'center', 'minimum', 'null', 'tableAccent', 'background', 'secondaryBackground',
        'firstLevelElements', 'secondLevelElements', 'thirdLevelElements', 'fourthLevelElements'].map((k) => theme?.[k]).filter(Boolean),
    ].filter((c) => !COLOR.test(c));
    console.log('generated theme stays schema-shaped (' + (strayKeys.join(', ') || 'no keys outside reportThemeSchema-2.156')
      + '; ' + (badColors.join(', ') || 'all colours match the schema pattern') + '): ok='
      + (!!theme && strayKeys.length === 0 && badColors.length === 0
        && String(theme.$schema).includes('reportThemeSchema-2.156') && Array.isArray(theme.dataColors)));
  }

  // ---- ...and it still survives the whole PBIR pipeline.
  {
    const OUT = './.charts-smoke';
    const REPORT = OUT + '/PaletteReport.Report';
    rmSync(OUT, { recursive: true, force: true });
    await say('fluent_scaffold_pbip', { name: 'PaletteReport', outputDir: OUT });
    const applied = asJson(await say('fluent_pbir_apply_theme', { reportDir: REPORT, themeJson: themeText, themeName: 'FluentCharts', dryRun: false, format: 'json' }));
    const onDisk = existsSync(REPORT + '/StaticResources/RegisteredResources/FluentCharts.json')
      ? JSON.parse(readFileSync(REPORT + '/StaticResources/RegisteredResources/FluentCharts.json', 'utf8'))
      : null;
    console.log('DataVizPalette theme still applies via fluent_pbir_apply_theme (registered=' + (onDisk ? 'yes' : 'no')
      + ', dataColors survive=' + (onDisk ? onDisk.dataColors.length : 0) + '/' + expectLight.length + '): ok='
      + (!!applied && !!onDisk && JSON.stringify(onDisk.dataColors) === JSON.stringify(expectLight)));
    const verified = asJson(await say('fluent_pbir_verify', { reportDir: REPORT, format: 'json' }));
    const failedChecks = (verified?.checks ?? []).filter((c) => !c.pass).map((c) => c.id);
    console.log('report themed with the DataVizPalette theme passes pbir_verify (' + (failedChecks.join(', ') || (verified?.checks?.length ?? 0) + ' checks passed') + '): ok='
      + (!!verified && verified.checks.length === 9 && failedChecks.length === 0));
    rmSync(OUT, { recursive: true, force: true });
  }

  // ---- The question an agent actually asks, answered end to end.
  {
    const answer = await say('fluent_powerbi_visuals', { query: 'trend over time', surface: 'fluent-charts' });
    const ok = /\bLineChart\b/.test(answer)
      && answer.includes("import { LineChart } from '@fluentui/react-charts'")
      && /DataVizPalette/.test(answer)
      && /FluentProvider/.test(answer)
      && /Accessibility:/.test(answer)
      && /Power BI equivalent: Line chart/.test(answer)
      && hasLinkTo(answer, 'storybooks.fluentui.dev');
    console.log('"which Fluent chart for a trend over time" answers with component + import + theming + a11y + Power BI mapping: ok=' + ok);

    // The default surface has to keep answering the Power BI question it always
    // answered, or an existing caller silently loses their Learn docs.
    const both = await say('fluent_powerbi_visuals', { query: 'trend over time' });
    console.log('surface="both" still returns the Power BI visuals alongside the Fluent charts: ok='
      + (hasLinkTo(both, 'learn.microsoft.com') && /\bLineChart\b/.test(both) && /Line chart/.test(both)));
    const pbiOnly = await say('fluent_powerbi_visuals', { query: 'trend over time', surface: 'powerbi' });
    console.log('surface="powerbi" excludes the React catalog: ok='
      + (hasLinkTo(pbiOnly, 'learn.microsoft.com') && !pbiOnly.includes('@fluentui/react-charts')));

    const overview = asJson(await say('fluent_powerbi_visuals', {}));
    console.log('no-argument overview advertises both catalogs (' + (overview?.fluentCharts?.summary ?? 'missing') + '): ok='
      + (!!overview?.powerbi?.counts && !!overview?.fluentCharts?.byCategory && overview.fluentCharts.dataVizPalette.qualitative === 40));
  }

  // ---- Props are read from the API-Extractor report, not invented.
  {
    const line = charts.find((c) => c.name === 'LineChart');
    const cartesian = chartsData.sharedPropsInterfaces?.CartesianChartProps?.props ?? [];
    // `mode` exists only as a field of the inline `reflowProps?: { mode: ... }`
    // object and is declared without `?`. A naive parser hoisted it to a
    // top-level REQUIRED prop on ten charts - i.e. told every caller to pass a
    // prop that does not exist.
    const leaked = cartesian.some((p) => p.name === 'mode') || line?.requiredProps?.includes('mode');
    console.log('chart props come from the API report, with no nested fields hoisted (LineChart requires ['
      + (line?.requiredProps ?? []).join(', ') + '], CartesianChartProps=' + cartesian.length + ' props): ok='
      + (JSON.stringify(line?.requiredProps) === JSON.stringify(['data']) && cartesian.length > 40 && !leaked
        && line?.keyProps?.some((p) => p.name === 'allowMultipleShapesForPoints')));

    const a11yRules = chartsData.accessibility?.rules ?? [];
    console.log('charts dataset carries the accessibility angle (' + a11yRules.length + ' rules, each with evidence): ok='
      + (a11yRules.length >= 5 && a11yRules.every((r) => r.rule && r.how && r.verifiedFrom)
        && a11yRules.some((r) => /colour alone|color alone/i.test(r.rule))
        && a11yRules.some((r) => /contrast/i.test(r.rule))));
  }
}

// Shadows are theme-dependent: the geometry matches across themes but the
// colours do not (light rgba(0,0,0,0.12)/0.14 vs dark 0.24/0.28, so a dark
// shadow is about twice as opaque). The dataset used to carry a single set and
// hand back the light values for every theme.
{
  const pick = (payloadText) => (payloadText.match(/"shadow16"\s*:\s*"([^"]+)"/) || [])[1];
  const lightPayload = (await client.callTool({ name: 'fluent_list_tokens', arguments: { category: 'shadow', theme: 'light' } })).content[0].text;
  const darkPayload = (await client.callTool({ name: 'fluent_list_tokens', arguments: { category: 'shadow', theme: 'dark' } })).content[0].text;
  const l = pick(lightPayload);
  const d = pick(darkPayload);
  console.log('shadow theme is honoured (light !== dark): ok=' + (!!l && !!d && l !== d && d.includes('0.24')));

  const tok = JSON.parse(readFileSync(new URL('data/fluent-tokens.json', import.meta.url), 'utf8'));
  const byTheme = tok.shadowByTheme || {};
  // Derived with upstream's own createShadowTokens formula, so assert the exact
  // string rather than "looks different" - an approximation would still pass that.
  const amb = tok.color?.semanticDark?.colorNeutralShadowAmbient;
  const key = tok.color?.semanticDark?.colorNeutralShadowKey;
  const expected = '0 0 2px ' + amb + ', 0 8px 16px ' + key;
  console.log('derived shadows match upstream createShadowTokens formula: ok=' + (byTheme.dark?.shadow16 === expected));
  console.log('shadowByTheme covers 3 themes x 12 tokens: ok='
    + (Object.keys(byTheme).length === 3 && Object.keys(byTheme.light || {}).length === 12));
}

// --- Second-pass Storybook Concepts mining ---------------------------------
// Positioning, slots, custom controls, advanced styling, web-components interop
// and platform support. Every one of these pages documents a constraint that
// fails SILENTLY - a popup that leaves the viewport, an `align` that collapses
// to `center`, a nested style-hook provider that overwrites instead of merging,
// a shadow root that blinds tabster. Guidance like that is only useful if it is
// present, reachable from the SKILL.md, and carries the URL it came from, so
// assert all three rather than trusting that a file exists.
{
  const root = new URL('../', import.meta.url);
  const read = (p) => readFileSync(new URL(p, root), 'utf8');

  // 1. The new reference files exist AND are linked from their own SKILL.md.
  //    An orphaned reference is invisible to an agent that only loads SKILL.md.
  {
    const WEB_REFS = ['positioning.md', 'slots.md', 'custom-components.md', 'web-components-interop.md', 'platform-support.md'];
    let webSkill = '';
    const missing = [], unlinked = [], unsourced = [];
    try {
      webSkill = read('skills/fluent-web-ui/SKILL.md');
      for (const f of WEB_REFS) {
        let body = '';
        try { body = read('skills/fluent-web-ui/references/' + f); } catch { missing.push(f); continue; }
        if (!webSkill.includes('references/' + f)) unlinked.push(f);
        // Unsourced assertions are how the earlier defects got in - every
        // reference has to point back at the Storybook page it was mined from.
        if (!hasLinkTo(body, 'storybooks.fluentui.dev', '/react/')) unsourced.push(f);
      }
    } catch (e) {
      missing.push('skills/fluent-web-ui/SKILL.md: ' + (e && e.message ? e.message : e));
    }
    const problems = [
      missing.length ? 'missing: ' + missing.join(', ') : '',
      unlinked.length ? 'not linked from SKILL.md: ' + unlinked.join(', ') : '',
      unsourced.length ? 'no storybooks.fluentui.dev source: ' + unsourced.join(', ') : '',
    ].filter(Boolean);
    const note = problems.join(' | ') || WEB_REFS.length + ' references';
    console.log('fluent-web-ui concept references shipped, linked and sourced (' + note + '): ok=' + (problems.length === 0));
  }

  // 2. Frontmatter is still parseable for every skill and `name` matches its
  //    folder. A skill whose name drifts from its directory silently stops
  //    resolving when an agent asks for it by folder name.
  {
    let count = 0;
    const bad = [];
    try {
      const dirs = readdirSync(new URL('skills/', root), { withFileTypes: true })
        .filter((e) => e.isDirectory()).map((e) => e.name).sort();
      count = dirs.length;
      for (const d of dirs) {
        let text = '';
        try { text = read('skills/' + d + '/SKILL.md'); } catch { bad.push(d + ': no SKILL.md'); continue; }
        const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fm) { bad.push(d + ': no frontmatter'); continue; }
        const name = (fm[1].match(/^name:[ \t]*(\S+)[ \t]*$/m) || [])[1];
        const desc = (fm[1].match(/^description:[ \t]*(\S)/m) || [])[1];
        if (name !== d) bad.push(d + ': name=' + (name ?? 'absent'));
        if (!desc) bad.push(d + ': empty description');
      }
    } catch (e) {
      bad.push(String(e && e.message ? e.message : e));
    }
    console.log('all skills carry valid frontmatter with name matching folder (' + count + ' skills'
      + (bad.length ? '; ' + bad.join('; ') : '') + '): ok=' + (count === 18 && bad.length === 0));
  }

  // 3. The positioning rules. `pinned` and a lone `align` are exactly how a
  //    menu ends up off-screen, and flipBoundary/overflowBoundary bound two
  //    DIFFERENT behaviours - setting one and assuming the other is the bug.
  {
    let skill = '', ref = '';
    try { skill = read('skills/fluent-web-ui/SKILL.md'); ref = read('skills/fluent-web-ui/references/positioning.md'); } catch { /* reported below */ }
    const both = skill + '\n' + ref;
    const rules = {
      'flip + overflow boundary are distinct': /flipBoundary/.test(skill) && /overflowBoundary/.test(skill),
      'position outranks align': /position[^\n]*outranks[^\n]*align/i.test(skill),
      'pinned disables repositioning': /pinned/.test(both) && /repositioning/i.test(both),
      'matchTargetSize needs border-box': /matchTargetSize/.test(both) && /border-box/.test(both),
      'obsolete autoSize aliases flagged': /autoSize/.test(ref) && /obsolete/i.test(ref),
      'arrow offset must be merged': /mergeArrowOffset/.test(ref),
      '12 shorthand placements': /above-start/.test(ref) && /after-bottom/.test(ref),
    };
    const absent = Object.keys(rules).filter((k) => !rules[k]);
    console.log('positioning rules present (' + (absent.length ? 'absent: ' + absent.join(', ') : Object.keys(rules).length + ' rules') + '): ok=' + (absent.length === 0));
  }

  // 4. The slots rules, including the two "don't" cases - reaching for a slot
  //    when a theme or a className is the right tool is the most common misuse.
  {
    let skill = '', ref = '';
    try { skill = read('skills/fluent-web-ui/SKILL.md'); ref = read('skills/fluent-web-ui/references/slots.md'); } catch { /* reported below */ }
    const both = skill + '\n' + ref;
    const rules = {
      'render function is an escape hatch': /escape hatch/i.test(both),
      'className/style land on root slot': /root/.test(skill) && /className/.test(skill),
      'Slot<Type, AlternateAs> documented': /AlternateAs/.test(ref),
      'slot.always vs slot.optional': /slot\.always/.test(ref) && /slot\.optional/.test(ref),
      'assertSlots + jsx pragma': /assertSlots/.test(ref) && /react-jsx-runtime/.test(ref),
      'as prop restricted to supported types': /\bas\b/.test(ref) && /intrinsic element types/i.test(ref),
    };
    const absent = Object.keys(rules).filter((k) => !rules[k]);
    console.log('slots rules present (' + (absent.length ? 'absent: ' + absent.join(', ') : Object.keys(rules).length + ' rules') + '): ok=' + (absent.length === 0));
  }

  // 5. `_unstable` is easy to over-warn about. Upstream's own framing has to
  //    survive in the text, or agents start steering users away from APIs that
  //    are perfectly fine to ship.
  {
    let ok = false, note = 'not found';
    try {
      const texts = ['skills/fluent-web-ui/references/slots.md', 'skills/fluent-web-ui/references/package-maturity.md'].map(read);
      const framed = texts.filter((t) => /not[^\n]*mean the code is unstable or unfit for production/i.test(t));
      ok = framed.length === texts.length;
      note = framed.length + '/' + texts.length + ' carry the upstream framing';
    } catch (e) { note = String(e && e.message ? e.message : e); }
    console.log('_unstable framed as "API may change", not "unfit for production" (' + note + '): ok=' + ok);
  }

  // 6. The two silent accessibility opt-outs. Shadow DOM blinds tabster and
  //    base state hooks hand visual accessibility back to the caller; neither
  //    throws, so the skill is the only place a user finds out.
  {
    let skill = '', ref = '';
    try {
      skill = read('skills/fluent-accessibility/SKILL.md');
      ref = read('skills/fluent-accessibility/references/focus-management.md');
    } catch { /* reported below */ }
    const both = skill + '\n' + ref;
    const rules = {
      'shadow DOM hides the DOM from tabster': /shadow DOM/i.test(both) && /tabster/i.test(both),
      'useShadowDOMSupport before rendering': /useShadowDOMSupport/.test(both) && /before/i.test(both),
      'base hooks do not enforce visual a11y': /do not enforce visual accessibility/i.test(both),
      'ref goes to the base hook': /never attach it yourself/i.test(both),
      'slot render function needs re-verification': /verify accessibility/i.test(both),
      'sourced to storybooks.fluentui.dev': hasLinkTo(ref, 'storybooks.fluentui.dev', '/react/'),
    };
    const absent = Object.keys(rules).filter((k) => !rules[k]);
    console.log('accessibility skill covers the silent opt-outs (' + (absent.length ? 'absent: ' + absent.join(', ') : Object.keys(rules).length + ' rules') + '): ok=' + (absent.length === 0));
  }

  // 7. Platform facts are load-bearing ("can we ship this?") and cheap to get
  //    wrong from memory, so pin the numbers that came off the matrix page.
  {
    let ref = '';
    try { ref = read('skills/fluent-web-ui/references/platform-support.md'); } catch { /* reported below */ }
    const facts = {
      'full matrix Chrome/Edge 84': /84/.test(ref),
      'partial matrix Chrome/Edge 79': /79/.test(ref),
      'IE not supported': /Not Supported|not supported at any level/i.test(ref),
      'ES2020 target': /ES2020/.test(ref),
      'React 17/18/19': /17,?\s*18 and 19|17, 18 and 19/.test(ref),
      'three latest major TypeScript': /three latest \*?\*?major/i.test(ref),
    };
    const absent = Object.keys(facts).filter((k) => !facts[k]);
    console.log('platform support facts recorded (' + (absent.length ? 'absent: ' + absent.join(', ') : Object.keys(facts).length + ' facts') + '): ok=' + (absent.length === 0));
  }

  // 8. Web-components interop: the packages are in fluentui-contrib, NOT in
  //    @fluentui/react-components. Telling someone to import them from the core
  //    package sends them to a build error.
  {
    let ref = '';
    try { ref = read('skills/fluent-web-ui/references/web-components-interop.md'); } catch { /* reported below */ }
    const rules = {
      'contrib packages named': /@fluentui-contrib\/react-shadow/.test(ref) && /@fluentui-contrib\/pierce-dom/.test(ref),
      'FluentProvider must be light DOM': /light DOM/i.test(ref),
      'ThemelessFluentProvider inserts no styles': /ThemelessFluentProvider/.test(ref) && /does not insert styles/i.test(ref),
      'insertion point for non-Griffel CSS': /insertionPoint/.test(ref),
      'lives in fluentui-contrib': hasLinkTo(ref, 'github.com', '/microsoft/fluentui-contrib'),
    };
    const absent = Object.keys(rules).filter((k) => !rules[k]);
    console.log('web components interop rules present (' + (absent.length ? 'absent: ' + absent.join(', ') : Object.keys(rules).length + ' rules') + '): ok=' + (absent.length === 0));
  }
}

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
