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

const targets = [
  // GitHub Copilot CLI
  { name: 'GitHub Copilot CLI', file: join(home, '.copilot', 'mcp-config.json'), key: 'mcpServers', dialect: 'copilot' },
  // VS Code family (user-level mcp.json)
  { name: 'VS Code', file: join(appData, 'Code', 'User', 'mcp.json'), key: 'servers', dialect: 'vscode' },
  { name: 'VS Code Insiders', file: join(appData, 'Code - Insiders', 'User', 'mcp.json'), key: 'servers', dialect: 'vscode' },
  { name: 'VSCodium', file: join(appData, 'VSCodium', 'User', 'mcp.json'), key: 'servers', dialect: 'vscode' },
  // Cursor
  { name: 'Cursor', file: join(home, '.cursor', 'mcp.json'), key: 'mcpServers', dialect: 'mcp' },
  // Windsurf
  { name: 'Windsurf', file: join(home, '.codeium', 'windsurf', 'mcp_config.json'), key: 'mcpServers', dialect: 'mcp' },
  // Claude Desktop (Windows + macOS)
  { name: 'Claude Desktop', file: join(appData, 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', dialect: 'mcp' },
  { name: 'Claude Desktop (macOS)', file: join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'), key: 'mcpServers', dialect: 'mcp' },
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
  // Already registered if it points at this server via node.
  if (existing && existing.command === 'node' && Array.isArray(existing.args) && existing.args.includes(serverPath)) {
    console.log('OK    ' + t.name + '  (already registered)'); skipped++; continue;
  }

  // Merge so any host-added metadata (e.g. source/sourcePath) is preserved.
  const merged = { ...(existing || {}), ...entry };
  if (dryRun) { console.log('WOULD ' + (existing ? 'update' : 'add   ') + ' ' + t.name + '  -> ' + t.file); changed++; continue; }

  mkdirSync(dirname(t.file), { recursive: true });
  if (existsSync(t.file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    copyFileSync(t.file, t.file + '.bak-fluentui-' + stamp);
  }
  obj[t.key]['fluent-ui'] = merged;
  // Match VS Code's tab-indented style; 2 spaces elsewhere.
  const indent = t.dialect === 'vscode' ? '\t' : 2;
  writeFileSync(t.file, JSON.stringify(obj, null, indent) + '\n');
  console.log((existing ? 'UPDATE' : 'ADDED ') + ' ' + t.name + '  -> ' + t.file);
  changed++;
}

console.log('\nDone. ' + changed + ' changed, ' + skipped + ' already-registered, ' + absent + ' host(s) not installed.');
if (changed > 0 && !dryRun) console.log('Restart each host (or reload its MCP servers) to load the fluent-ui tools.');
