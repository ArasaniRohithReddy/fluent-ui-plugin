#!/usr/bin/env node
/**
 * Register (or update) the fluent-ui MCP server in every AI IDE / host installed
 * on this machine, using an absolute path to the built server so it works from
 * any workspace.
 *
 * Usage:
 *   node hosts/register-mcp.mjs            # detect installed hosts and register
 *   node hosts/register-mcp.mjs --dry-run  # show what would change, write nothing
 *   node hosts/register-mcp.mjs --path "C:\\abs\\path\\to\\mcp\\dist\\index.js"
 *   node hosts/register-mcp.mjs --figma    # ALSO register Figma's remote MCP server
 *
 * --figma adds Figma's hosted design-to-code server next to fluent-ui, so the
 * agent can read a real frame and this plugin can turn it into Fluent code.
 * No token is ever requested, stored or forwarded: Figma's server authenticates
 * with the host's own OAuth flow, which the host runs on first connect.
 *
 * It is idempotent (safe to re-run), backs up every file it edits, and only
 * touches hosts whose config directory already exists. After it runs, restart
 * the host so it picks up the new server.
 *
 * Prerequisite: build the server first ->  cd mcp && npm install && npm run build
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const withFigma = args.includes('--figma');
const pathArg = args.includes('--path') ? args[args.indexOf('--path') + 1] : null;

// Absolute path to the built MCP server (hosts/ -> ../mcp/dist/index.js).
const serverPath = pathArg ? resolve(pathArg) : resolve(here, '..', 'mcp', 'dist', 'index.js');
if (!existsSync(serverPath)) {
  console.error('ERROR: MCP server not found at:\n  ' + serverPath +
    '\nBuild it first:  cd mcp && npm install && npm run build');
  process.exit(1);
}

const home = process.env.USERPROFILE || process.env.HOME || '';
const appData = process.env.APPDATA || join(home, '.config'); // Windows APPDATA, else ~/.config-ish
const xdg = process.env.XDG_CONFIG_HOME || join(home, '.config');

// dialect: how a given host expects the server declared.
//  - vscode  : { servers: { "fluent-ui": { type:"stdio", command, args } } }
//  - mcp     : { mcpServers: { "fluent-ui": { type:"stdio", command, args } } }  (Cursor/Windsurf/Claude)
//  - copilot : { mcpServers: { "fluent-ui": { type:"local", command, args, tools:["*"] } } }
function entryFor(dialect) {
  if (dialect === 'copilot') return { tools: ['*'], type: 'local', command: 'node', args: [serverPath] };
  if (dialect === 'vscode') return { type: 'stdio', command: 'node', args: [serverPath] };
  return { type: 'stdio', command: 'node', args: [serverPath] }; // mcp (Claude-style)
}

// Figma's remote server is NOT stdio and every host spells it differently:
// Windsurf wants serverUrl (url fails silently), Gemini wants httpUrl plus an
// oauth block, Claude Code hard-fails unless type is present, Cline wants
// streamableHttp. Rather than re-derive those shapes here, read the verified
// snippet recorded per host in mcp/data/figma.json and use it verbatim - one
// source of truth, so a corrected snippet fixes the installer too.
let FIGMA_HOSTS = null;
function figmaEntryFor(hostId) {
  if (!hostId) return { entry: null, why: 'no Figma host mapping' };
  if (!FIGMA_HOSTS) {
    try {
      const raw = JSON.parse(readFileSync(resolve(here, '..', 'mcp', 'data', 'figma.json'), 'utf8'));
      FIGMA_HOSTS = Object.fromEntries((raw.hosts || []).map((h) => [h.id, h]));
    } catch { FIGMA_HOSTS = {}; }
  }
  const h = FIGMA_HOSTS[hostId];
  if (!h) return { entry: null, why: 'host not in figma.json' };
  // A null snippet is a deliberate "we could not verify this shape" marker -
  // e.g. Claude Desktop's mcpServers is stdio-only, so writing a url entry
  // there produces a config that silently never connects. Never guess.
  if (!h.snippet || !h.configKey) return { entry: null, why: h.note ? h.note.split('.')[0] : 'no verified config shape' };
  const inner = h.snippet[h.configKey] && h.snippet[h.configKey].figma;
  return inner ? { entry: inner, key: h.configKey } : { entry: null, why: 'snippet missing figma entry' };
}

const targets = [
  // GitHub Copilot CLI
  { name: 'GitHub Copilot CLI', file: join(home, '.copilot', 'mcp-config.json'), key: 'mcpServers', dialect: 'copilot', figmaHost: 'copilot-cli' },
  // VS Code family (user-level mcp.json)
  { name: 'VS Code', file: join(appData, 'Code', 'User', 'mcp.json'), key: 'servers', dialect: 'vscode', figmaHost: 'vscode' },
  { name: 'VS Code Insiders', file: join(appData, 'Code - Insiders', 'User', 'mcp.json'), key: 'servers', dialect: 'vscode', figmaHost: 'vscode-insiders' },
  { name: 'VSCodium', file: join(appData, 'VSCodium', 'User', 'mcp.json'), key: 'servers', dialect: 'vscode', figmaHost: 'vscodium' },
  // Cursor
  { name: 'Cursor', file: join(home, '.cursor', 'mcp.json'), key: 'mcpServers', dialect: 'mcp', figmaHost: 'cursor' },
  // Windsurf
  { name: 'Windsurf', file: join(home, '.codeium', 'windsurf', 'mcp_config.json'), key: 'mcpServers', dialect: 'mcp', figmaHost: 'windsurf' },
  // Claude Desktop (Windows + macOS). No figmaHost snippet on purpose: its
  // mcpServers block is stdio-only, so a remote url entry would never connect.
  { name: 'Claude Desktop', file: join(appData, 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', dialect: 'mcp', figmaHost: 'claude-desktop' },
  { name: 'Claude Desktop (macOS)', file: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', dialect: 'mcp', figmaHost: 'claude-desktop' },
  // Claude Code + Gemini CLI + Cline: remote-capable, verified Figma dialects.
  { name: 'Claude Code', file: join(home, '.claude.json'), key: 'mcpServers', dialect: 'mcp', figmaHost: 'claude-code' },
  { name: 'Gemini CLI', file: join(home, '.gemini', 'settings.json'), key: 'mcpServers', dialect: 'mcp', figmaHost: 'gemini-cli' },
];

function installed(t) {
  // Installed if the config file exists, or the app's own config dir exists.
  // (Do NOT check the grandparent - that is home/APPDATA and always exists.)
  return existsSync(t.file) || existsSync(dirname(t.file));
}

let changed = 0, skipped = 0, absent = 0;
console.log('fluent-ui MCP registration');
console.log('server: ' + serverPath + (dryRun ? '   (DRY RUN)\n' : '\n'));

for (const t of targets) {
  if (!installed(t)) { absent++; continue; }
  let obj = {};
  if (existsSync(t.file)) {
    try { obj = JSON.parse(readFileSync(t.file, 'utf8')); }
    catch (e) { console.log('SKIP  ' + t.name + '  (existing config is not valid JSON: ' + e.message + ')'); continue; }
  }
  obj[t.key] = obj[t.key] || {};
  const entry = entryFor(t.dialect);
  const existing = obj[t.key]['fluent-ui'];

  // Figma is optional and independent: a host can already have fluent-ui but
  // still be missing figma, so decide on it before the early-continue below.
  let figmaAction = null;
  if (withFigma) {
    const { entry: fe, why } = figmaEntryFor(t.figmaHost);
    if (!fe) {
      figmaAction = { skip: true, why: why || 'unverified' };
    } else {
      const cur = obj[t.key].figma;
      const same = cur && JSON.stringify({ ...cur, ...fe }) === JSON.stringify(cur);
      figmaAction = same ? { noop: true } : { write: { ...(cur || {}), ...fe } };
    }
  }

  const fluentUpToDate = existing && existing.command === 'node' &&
    Array.isArray(existing.args) && existing.args.includes(serverPath);

  if (fluentUpToDate && (!figmaAction || figmaAction.noop || figmaAction.skip)) {
    console.log('OK    ' + t.name + '  (already registered)' +
      (figmaAction && figmaAction.skip ? '  [figma skipped: ' + figmaAction.why + ']' : '') +
      (figmaAction && figmaAction.noop ? '  [figma already registered]' : ''));
    skipped++; continue;
  }

  // Merge so any host-added metadata (e.g. source/sourcePath) is preserved.
  const merged = { ...(existing || {}), ...entry };
  const figNote = figmaAction && figmaAction.write ? '  +figma'
    : figmaAction && figmaAction.skip ? '  [figma skipped: ' + figmaAction.why + ']' : '';
  if (dryRun) { console.log('WOULD ' + (existing ? 'update' : 'add   ') + ' ' + t.name + figNote + '  -> ' + t.file); changed++; continue; }

  mkdirSync(dirname(t.file), { recursive: true });
  if (existsSync(t.file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    copyFileSync(t.file, t.file + '.bak-fluentui-' + stamp);
  }
  obj[t.key]['fluent-ui'] = merged;
  if (figmaAction && figmaAction.write) obj[t.key].figma = figmaAction.write;
  // Match VS Code's tab-indented style; 2 spaces elsewhere.
  const indent = t.dialect === 'vscode' ? '\t' : 2;
  writeFileSync(t.file, JSON.stringify(obj, null, indent) + '\n');
  console.log((existing ? 'UPDATE' : 'ADDED ') + ' ' + t.name + figNote + '  -> ' + t.file);
  changed++;
}

console.log('\nDone. ' + changed + ' changed, ' + skipped + ' already-registered, ' + absent + ' host(s) not installed.');
if (changed > 0 && !dryRun) console.log('Restart each host (or reload its MCP servers) to load the fluent-ui tools.');
if (withFigma && !dryRun) {
  console.log('\nFigma: sign in from inside the host the first time it connects (Allow Access in the browser).');
  console.log('       This installer never asks for or stores a Figma token - the host owns the OAuth flow.');
  console.log('       The remote server needs a node-specific link (?node-id=...); a file-only URL fails.');
}
