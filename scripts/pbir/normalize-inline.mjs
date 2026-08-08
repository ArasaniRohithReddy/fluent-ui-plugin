/**
 * fluent_pbir_normalize_inline / normalize-inline.mjs
 *
 * The core fix. A Power BI theme only styles properties a visual has NOT
 * overridden inline, so for every theme-owned key present inline this DELETES
 * the inline override and lets the theme default apply.
 *
 * Re-tinting an override with a Fluent hex value is an anti-pattern: the
 * override stays in place and the theme stays inert. That behavior is only
 * available behind the explicit 'remap-colors' policy, and it warns.
 *
 * Safety rules:
 *  - only `visual.visualContainerObjects` container cards are touched;
 *    data-role formatting under `visual.objects` is never modified
 *  - only properties the theme actually owns are removed
 *  - content and semantics (title.text, general.*, visualLink.*) are protected
 *  - visuals whose formatting a bookmark captured are skipped unless
 *    includeBookmarked is set, because the bookmark snaps the old style back
 *  - names, ids, GUIDs, parentGroupName, $schema and positions are never touched
 *
 * Usage:
 *   node scripts/pbir/normalize-inline.mjs <reportDir>
 *        [--policy theme-wins|report|remap-colors]
 *        [--keys background,border,visualHeader,title]
 *        [--visual-types card,slicer] [--include-bookmarked]
 *        [--include-data-object-typography]
 *        [--apply] [--json] [--ledger <path>]
 *   (dry run by default; pass --apply to write)
 */

import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import {
  isMain,
  loadReport,
  dataVisuals,
  readJsonFile,
  writeJsonFile,
  themeOwnedProperties,
  registeredTheme,
  bookmarkFormattingIndex,
  bookmarkCapture,
  iterContainerProperties,
  iterObjectProperties,
  censusInlineOverrides,
  effectivenessMatrix,
  formatEffectiveness,
  describeInline,
  decodeInline,
  encodeInlineColor,
  identityHash,
  parseArgs,
  toList,
  fail,
  DEFAULT_KEYS,
  PROTECTED_CARDS,
  PROTECTED_PROPERTY_PATHS,
} from './lib.mjs';

const POLICIES = new Set(['theme-wins', 'report', 'remap-colors']);

/** Nearest theme color for the remap-colors policy (simple RGB distance). */
function nearestThemeColor(hex, palette) {
  const parse = (h) => {
    const s = String(h).replace('#', '');
    const full = s.length === 3 ? s.split('').map((c) => c + c).join('') : s.slice(0, 6);
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const [r, g, b] = parse(hex);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  let best = null;
  let bestD = Infinity;
  for (const c of palette) {
    const [cr, cg, cb] = parse(c);
    if ([cr, cg, cb].some((n) => Number.isNaN(n))) continue;
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function themePalette(themeJson) {
  const out = [];
  if (!themeJson) return out;
  for (const key of [
    'background',
    'secondaryBackground',
    'foreground',
    'firstLevelElements',
    'secondLevelElements',
    'thirdLevelElements',
    'fourthLevelElements',
    'tableAccent',
    'good',
    'neutral',
    'bad',
  ]) {
    if (typeof themeJson[key] === 'string' && themeJson[key].startsWith('#')) out.push(themeJson[key]);
  }
  if (Array.isArray(themeJson.dataColors)) {
    for (const c of themeJson.dataColors) if (typeof c === 'string' && c.startsWith('#')) out.push(c);
  }
  return [...new Set(out.map((c) => c.toUpperCase()))];
}

/** Drop empty property bags, empty card instances and empty card arrays. */
function pruneEmptyContainers(visualJson) {
  const vco = visualJson?.visual?.visualContainerObjects;
  if (!vco || typeof vco !== 'object') return;
  for (const card of Object.keys(vco)) {
    const arr = vco[card];
    if (!Array.isArray(arr)) continue;
    const kept = arr.filter((inst) => {
      if (!inst || typeof inst !== 'object') return true;
      if (inst.properties && Object.keys(inst.properties).length === 0) delete inst.properties;
      return Object.keys(inst).length > 0;
    });
    if (kept.length === 0) delete vco[card];
    else vco[card] = kept;
  }
  if (Object.keys(vco).length === 0) delete visualJson.visual.visualContainerObjects;
}

/**
 * @param {string} reportDir
 * @param {{policy?: string, keys?: string[], visualTypes?: string[], dryRun?: boolean,
 *          includeBookmarked?: boolean, includeDataObjectTypography?: boolean,
 *          themePath?: string, maxLedger?: number}} opts
 */
export function normalizeInline(reportDir, opts = {}) {
  const policy = opts.policy || 'theme-wins';
  if (!POLICIES.has(policy)) {
    throw new Error(`unknown policy "${policy}" (expected: ${[...POLICIES].join(', ')})`);
  }
  // 'report' is a census: it never writes, whatever dryRun says.
  const dryRun = policy === 'report' ? true : opts.dryRun !== false;

  const model = loadReport(reportDir);
  const themeInfo = registeredTheme(model);
  let themeJson = themeInfo && themeInfo.json ? themeInfo.json : null;
  if (opts.themePath) {
    const f = readJsonFile(opts.themePath);
    if (f && f.json) themeJson = f.json;
  }
  const owned = themeOwnedProperties(themeJson);
  const ownedCards = owned.cards();
  const keys = (opts.keys && opts.keys.length ? opts.keys : DEFAULT_KEYS).filter((k) => {
    if (PROTECTED_CARDS.has(k)) return false;
    return ownedCards.has(k);
  });
  const requestedKeys = opts.keys && opts.keys.length ? opts.keys : DEFAULT_KEYS;
  const rejectedKeys = requestedKeys.filter((k) => !keys.includes(k));

  const typeFilter = new Set((opts.visualTypes || []).filter(Boolean));
  const bookmarkIndex = bookmarkFormattingIndex(model);
  const palette = themePalette(themeJson);

  const identityBefore = identityHash(model);
  const censusBefore = censusInlineOverrides(model, owned);

  const ledger = [];
  const maxLedger = opts.maxLedger ?? Infinity;
  let ledgerTruncated = 0;
  const push = (entry) => {
    if (ledger.length < maxLedger) ledger.push(entry);
    else ledgerTruncated++;
  };

  const summary = {
    deleted: 0,
    remapped: 0,
    keptNotOwned: 0,
    keptProtected: 0,
    skippedBookmarked: 0,
    skippedVisualType: 0,
    filesChanged: 0,
    visualsChanged: 0,
  };
  const bookmarkedVisuals = [];
  const filesToWrite = [];

  for (const v of dataVisuals(model)) {
    if (typeFilter.size && !typeFilter.has(v.visualType)) {
      let hasTargetCard = false;
      for (const it of iterContainerProperties(v)) {
        if (keys.includes(it.card)) {
          hasTargetCard = true;
          break;
        }
      }
      if (hasTargetCard) summary.skippedVisualType++;
      continue;
    }

    const capture = bookmarkCapture(bookmarkIndex, v, null);
    const bookmarkBlocked = !!capture && !opts.includeBookmarked;
    if (capture) {
      bookmarkedVisuals.push({
        file: v.relPath,
        page: v.pageName,
        visual: v.name,
        visualType: v.visualType,
        bookmarks: [...capture.bookmarks],
        cards: [...capture.cards],
      });
    }

    // Collect first: deleting while iterating the same object bag is unsafe.
    const pending = [];
    for (const it of iterContainerProperties(v)) {
      if (!keys.includes(it.card)) continue;
      const path = `${it.card}.${it.prop}`;
      const before = describeInline(it.node);
      if (PROTECTED_CARDS.has(it.card) || PROTECTED_PROPERTY_PATHS.has(path)) {
        summary.keptProtected++;
        push({
          file: v.relPath,
          page: v.pageName,
          visual: v.name,
          visualType: v.visualType,
          key: it.card,
          property: it.prop,
          before,
          after: before,
          decision: 'keep',
          reason: 'content or authored semantics, never theme-owned',
        });
        continue;
      }
      if (!owned.owns(v.visualType, it.card, it.prop)) {
        summary.keptNotOwned++;
        push({
          file: v.relPath,
          page: v.pageName,
          visual: v.name,
          visualType: v.visualType,
          key: it.card,
          property: it.prop,
          before,
          after: before,
          decision: 'keep',
          reason: 'the theme does not declare this property, so removing it would not hand control to the theme',
        });
        continue;
      }
      if (bookmarkBlocked) {
        summary.skippedBookmarked++;
        push({
          file: v.relPath,
          page: v.pageName,
          visual: v.name,
          visualType: v.visualType,
          key: it.card,
          property: it.prop,
          before,
          after: before,
          decision: 'skip-bookmarked',
          reason: `a bookmark captured this visual's formatting (${[...capture.bookmarks].join(', ')}); clearing the override would be snapped back. Re-run with includeBookmarked to override, then re-capture the bookmark in Power BI Desktop.`,
        });
        continue;
      }
      pending.push({ it, path, before });
    }

    if (!pending.length) continue;

    let changed = false;
    for (const { it, before } of pending) {
      if (policy === 'report') {
        push({
          file: v.relPath,
          page: v.pageName,
          visual: v.name,
          visualType: v.visualType,
          key: it.card,
          property: it.prop,
          before,
          after: before,
          decision: 'census',
          reason: 'policy=report is a dry-run census; nothing is modified',
        });
        continue;
      }
      if (policy === 'remap-colors') {
        const d = decodeInline(it.node);
        if (d.kind !== 'color' || typeof d.value !== 'string' || !d.value.startsWith('#')) {
          summary.keptNotOwned++;
          push({
            file: v.relPath,
            page: v.pageName,
            visual: v.name,
            visualType: v.visualType,
            key: it.card,
            property: it.prop,
            before,
            after: before,
            decision: 'keep',
            reason: 'policy=remap-colors only rewrites literal hex colors',
          });
          continue;
        }
        const target = nearestThemeColor(d.value, palette);
        if (!target || target.toUpperCase() === d.value.toUpperCase()) {
          push({
            file: v.relPath,
            page: v.pageName,
            visual: v.name,
            visualType: v.visualType,
            key: it.card,
            property: it.prop,
            before,
            after: before,
            decision: 'keep',
            reason: 'already the nearest theme color',
          });
          continue;
        }
        it.bag[it.prop] = encodeInlineColor(target);
        summary.remapped++;
        changed = true;
        push({
          file: v.relPath,
          page: v.pageName,
          visual: v.name,
          visualType: v.visualType,
          key: it.card,
          property: it.prop,
          before,
          after: target,
          decision: 'remap',
          reason: 'ANTI-PATTERN: the inline override survives, so the theme still does not control this property. Prefer policy=theme-wins.',
        });
        continue;
      }
      // theme-wins: delete so the theme default applies.
      delete it.bag[it.prop];
      summary.deleted++;
      changed = true;
      push({
        file: v.relPath,
        page: v.pageName,
        visual: v.name,
        visualType: v.visualType,
        key: it.card,
        property: it.prop,
        before,
        after: null,
        decision: 'delete',
        reason: 'theme-owned inline override removed so the registered theme default applies',
      });
    }

    // Optional: clear pure typography inside data-role objects so the theme's
    // textClasses apply. Off by default, because `objects` is data formatting.
    if (opts.includeDataObjectTypography && policy === 'theme-wins' && !bookmarkBlocked) {
      const fontPending = [];
      for (const it of iterObjectProperties(v)) {
        if (it.prop !== 'fontFamily' && it.prop !== 'fontSize') continue;
        fontPending.push(it);
      }
      for (const it of fontPending) {
        const before = describeInline(it.node);
        delete it.bag[it.prop];
        summary.deleted++;
        changed = true;
        push({
          file: v.relPath,
          page: v.pageName,
          visual: v.name,
          visualType: v.visualType,
          key: `objects.${it.card}`,
          property: it.prop,
          before,
          after: null,
          decision: 'delete',
          reason: 'inline font on a data-role card defeats the theme textClasses (opt-in: includeDataObjectTypography)',
        });
      }
      const objects = v.json?.visual?.objects;
      if (objects) {
        for (const card of Object.keys(objects)) {
          const arr = objects[card];
          if (!Array.isArray(arr)) continue;
          const kept = arr.filter((inst) => {
            if (!inst || typeof inst !== 'object') return true;
            if (inst.properties && Object.keys(inst.properties).length === 0) delete inst.properties;
            return Object.keys(inst).length > 0;
          });
          if (kept.length === 0) delete objects[card];
          else objects[card] = kept;
        }
        if (Object.keys(objects).length === 0) delete v.json.visual.objects;
      }
    }

    if (changed) {
      pruneEmptyContainers(v.json);
      summary.visualsChanged++;
      filesToWrite.push(v);
    }
  }

  if (!dryRun) {
    for (const v of filesToWrite) {
      writeJsonFile(model.dir, v.path, v.json, v.style);
      summary.filesChanged++;
    }
  } else {
    summary.filesChanged = filesToWrite.length;
  }

  // Project the post-change census from the in-memory model (already mutated).
  const censusAfter = censusInlineOverrides(model, owned);
  const identityAfter = identityHash(model);

  return {
    reportDir: model.dir,
    policy,
    dryRun,
    keys,
    rejectedKeys,
    visualTypes: [...typeFilter],
    includeBookmarked: !!opts.includeBookmarked,
    includeDataObjectTypography: !!opts.includeDataObjectTypography,
    themeUsedForOwnership: themeInfo && themeInfo.exists ? themeInfo.relPath : (opts.themePath ?? null),
    themeOwnedKeys: owned.toJSON(),
    summary,
    identity: {
      before: identityBefore,
      after: identityAfter,
      unchanged: identityBefore === identityAfter,
    },
    effectivenessBefore: effectivenessMatrix(censusBefore, owned, keys.length ? keys : DEFAULT_KEYS),
    effectivenessAfter: effectivenessMatrix(censusAfter, owned, keys.length ? keys : DEFAULT_KEYS),
    typographyBefore: censusBefore.typography,
    typographyAfter: censusAfter.typography,
    bookmarkedVisuals,
    ledgerTruncated,
    ledger,
    files: filesToWrite.map((v) => v.relPath),
  };
}

export function formatNormalize(r, { ledgerLimit = 25 } = {}) {
  const L = [];
  L.push(
    `${r.dryRun ? 'DRY RUN' : 'APPLIED'}  normalize-inline policy=${r.policy}  keys=${r.keys.join(',') || '(none)'}`
  );
  L.push(`  report: ${r.reportDir}`);
  if (r.rejectedKeys.length) {
    L.push(
      `  ignored keys (not theme-owned container cards): ${r.rejectedKeys.join(', ')}`
    );
  }
  L.push(`  theme used for ownership: ${r.themeUsedForOwnership ?? '(built-in Fluent 2 defaults)'}`);
  L.push('');
  L.push('SUMMARY');
  for (const [k, v] of Object.entries(r.summary)) L.push(`  ${k.padEnd(20)} ${v}`);
  L.push(`  identifiers unchanged: ${r.identity.unchanged}`);
  L.push('');
  L.push('THEME-EFFECTIVENESS BEFORE');
  L.push(formatEffectiveness(r.effectivenessBefore));
  L.push('');
  L.push(`THEME-EFFECTIVENESS AFTER${r.dryRun ? ' (projected)' : ''}`);
  L.push(formatEffectiveness(r.effectivenessAfter));
  if (r.bookmarkedVisuals.length) {
    L.push('');
    L.push(
      `BOOKMARK-CAPTURED VISUALS (${r.bookmarkedVisuals.length})${r.includeBookmarked ? ' - normalized anyway' : ' - skipped'}`
    );
    for (const b of r.bookmarkedVisuals.slice(0, 20)) {
      L.push(`  ${b.file}  ${b.visual} (${b.visualType})  bookmarks: ${b.bookmarks.join(', ')}`);
    }
    L.push(
      '  A bookmark that captured the old formatting snaps it back. Re-capture those bookmarks in Power BI Desktop after normalizing.'
    );
  }
  L.push('');
  L.push(`LEDGER (${r.ledger.length}${r.ledgerTruncated ? ` shown, ${r.ledgerTruncated} more` : ''})`);
  for (const e of r.ledger.slice(0, ledgerLimit)) {
    L.push(
      `  ${e.decision.padEnd(16)} ${`${e.key}.${e.property}`.padEnd(28)} ${String(e.before).slice(0, 28).padEnd(28)} -> ${e.after === null ? '(theme default)' : String(e.after).slice(0, 24)}   ${e.visual} [${e.visualType}]`
    );
  }
  if (r.ledger.length > ledgerLimit) {
    L.push(`  ... ${r.ledger.length - ledgerLimit} more (use --json or --ledger <path> for the full ledger)`);
  }
  return L.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args._[0];
  if (!dir) {
    process.stderr.write(
      'usage: node scripts/pbir/normalize-inline.mjs <reportDir> [--policy theme-wins|report|remap-colors] [--keys a,b] [--visual-types card,slicer] [--include-bookmarked] [--include-data-object-typography] [--apply] [--json] [--ledger <path>]\n'
    );
    process.exit(2);
  }
  let r;
  try {
    r = normalizeInline(dir, {
      policy: typeof args.policy === 'string' ? args.policy : undefined,
      keys: toList(args.keys),
      visualTypes: toList(args['visual-types']),
      includeBookmarked: !!args['include-bookmarked'],
      includeDataObjectTypography: !!args['include-data-object-typography'],
      themePath: typeof args.theme === 'string' ? args.theme : undefined,
      dryRun: !args.apply,
    });
  } catch (err) {
    fail(String(err && err.message ? err.message : err));
    return;
  }
  if (typeof args.ledger === 'string') {
    const out = resolve(args.ledger);
    writeFileSync(out, JSON.stringify(r.ledger, null, 2) + '\n', 'utf8');
    process.stderr.write(`ledger written to ${out}\n`);
  }
  process.stdout.write(args.json ? JSON.stringify(r, null, 2) + '\n' : formatNormalize(r) + '\n');
}

if (isMain(import.meta.url)) main();
