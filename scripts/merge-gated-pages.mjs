/**
 * merge-gated-pages.mjs
 *
 * Merge the authenticated capture of the 18 sign-in-gated Fluent 2 pages
 * (14 AI component usage pages + 4 "Working with AI" topic pages) into the
 * grounded data this MCP server ships.
 *
 * Why this exists
 * ---------------
 * Those 18 pages 302 to login.microsoftonline.com for anyone outside Microsoft,
 * so every public crawl produced a placeholder. The 4 topics were pinned as
 * `accessStatus: "employee-gated"` with a stale `capturedAt`, and 11 of the 14
 * AI components shipped with zero images. A capture taken while signed in now
 * exists, so this script folds the real prose, section structure, and CDN image
 * URLs back into:
 *
 *   mcp/data/design-guidance.json          (the 4 AI topics, edited in place)
 *   mcp/data/fluent-components-usage.json  (the 14 AI components, edited in place)
 *   mcp/data/fluent-images.json            (newly discovered images appended)
 *
 * Design rules (these are correctness requirements, not preferences)
 * -----------------------------------------------------------------
 * 1. ENRICH, NEVER REPLACE. Nothing already in the data files is deleted. A
 *    captured line only ever (a) is appended, or (b) replaces an existing line
 *    that it fully contains — so the existing wording survives verbatim inside
 *    the richer one.
 * 2. DO/DON'T POLARITY IS SACRED. An earlier extraction mis-sorted do/don't
 *    guidance and the MCP tool handed users inverted advice. Here a sentence is
 *    only classified when its FIRST sentence opens with an unambiguous polarity
 *    marker and no later sentence opens with the opposite one. Everything else
 *    stays in prose and is never guessed at.
 * 3. NOTHING IS INVENTED. Every URL, alt text, heading and sentence written by
 *    this script is copied out of the capture. Empty alt text is recorded as
 *    empty (and counted in the report) rather than filled in.
 * 4. DETERMINISTIC + IDEMPOTENT. Re-running produces byte-identical files: all
 *    matching is order-consuming and normalization-based, new sections are
 *    emitted in source-document order, and derived counts are recomputed from
 *    the data itself.
 *
 * Usage:
 *   node scripts/merge-gated-pages.mjs [--capture <path>] [--dry-run] [--verbose]
 *
 * The capture is resolved from --capture, then $FLUENT_GATED_CAPTURE, then
 * research/gated-pages.json, then CAPTURE_FALLBACK below.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DATA = join(REPO, 'mcp', 'data');

/** Where the signed-in capture was written. Overridable; see resolveCapturePath. */
const CAPTURE_FALLBACK = join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.copilot',
  'session-state',
  'bd2cc0b0-5cec-4497-a23c-fe37998d821b',
  'files',
  'v8-research',
  'gated-pages.json'
);

/** Stamp written onto everything this merge touches. */
const CAPTURED_AT = '2026-08';
const ACCESS_STATUS = 'employee-gated-captured';
const CAPTURE_METHOD = 'authenticated browser capture (Microsoft employee sign-in)';
const IMAGE_SOURCE = 'gated-capture';
const ACCESS_NOTE =
  'This page requires Microsoft employee sign-in (302 to login.microsoftonline.com), so it cannot be re-validated from a public crawl. The content below is a pinned snapshot taken while signed in (' +
  CAPTURED_AT +
  '), not a live read.';

/** Design-guidance topic keys that come from the gated "Working with AI" pages. */
const TOPIC_KEYS = ['entry-points', 'personality-principles', 'copilot-errors', 'data-usage-sharing'];

/** Page-chrome assets (platform badges etc.) that are not documentation visuals. */
const CHROME_ASSETS = /^(react|reactnative|web|webcomponents|windows|ios|android|mac|macos|figma|logo)$/i;

/** Headings that are navigation, not guidance. */
const SKIP_HEADINGS = /^resources$/i;

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/** True when the module at `importMetaUrl` is the entry point Node was started with. */
function isMain(importMetaUrl) {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(resolve(process.argv[1])).href === importMetaUrl;
  } catch {
    return false;
  }
}

/**
 * Fold the typographic characters the site uses into ASCII.
 *
 * Comparison only. Stored text always keeps the source's own curly quotes and
 * dashes — the rest of these data files do, and "verbatim" has to mean verbatim.
 */
function foldText(s) {
  return String(s == null ? '' : s)
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ');
}

/** Aggressive normalization used for "is this the same sentence?" containment tests. */
function softKey(s) {
  return foldText(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Heading key: soft-normalized, with a trailing "(qualifier)" removed. */
function headingKey(s) {
  const stripped = foldText(s).replace(/\s*\([^()]*\)\s*$/, '');
  return softKey(stripped);
}

/** Line-level normalization used to locate a heading inside the flat page text. */
function lineKey(s) {
  return foldText(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Detect the on-disk JSON formatting so a rewrite keeps the file byte-identical. */
function detectStyle(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const normalized = text.replace(/\r\n/g, '\n');
  const m = /^[{[]\n([ \t]+)/.exec(normalized);
  let indent = 2;
  if (m) indent = m[1][0] === '\t' ? '\t' : m[1].length;
  return { eol, indent, trailingNewline: /\n$/.test(normalized) };
}

/** Serialize `value` in the detected style. */
function stringifyJson(value, style) {
  let s = JSON.stringify(value, null, style.indent);
  if (style.eol === '\r\n') s = s.replace(/\n/g, '\r\n');
  if (style.trailingNewline) s += style.eol;
  return s;
}

/** Read a JSON file and remember how it was formatted. */
function readJsonFile(path) {
  const text = readFileSync(path, 'utf8');
  return { json: JSON.parse(text), style: detectStyle(text), text };
}

/** Write `json` back only when the serialized bytes actually changed. */
function writeJsonFile(path, json, style, original, dryRun) {
  const next = stringifyJson(json, style);
  if (next === original) return { changed: false, bytes: next.length };
  if (!dryRun) writeFileSync(path, next, 'utf8');
  return { changed: true, bytes: next.length };
}

function parseArgs(argv) {
  const out = { dryRun: false, verbose: false, capture: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    else if (a === '--verbose' || a === '-v') out.verbose = true;
    else if (a === '--capture') out.capture = argv[++i];
    else if (a.startsWith('--capture=')) out.capture = a.slice('--capture='.length);
  }
  return out;
}

function resolveCapturePath(explicit) {
  const candidates = [
    explicit,
    process.env.FLUENT_GATED_CAPTURE,
    join(REPO, 'research', 'gated-pages.json'),
    CAPTURE_FALLBACK,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

// ---------------------------------------------------------------------------
// Capture parsing: flat page text + heading list -> ordered sections
// ---------------------------------------------------------------------------

/**
 * Slice a captured page's flat `text` into one block per heading.
 *
 * The capture stores prose as a single string with headings inlined, so each
 * heading is located by scanning FORWARD from the previous heading only. That
 * ordering constraint is what stops a body line that happens to repeat a
 * heading ("In chat", "Avoid") from stealing the match.
 *
 * @returns {{intro: string, sections: Array<{level:number, heading:string, text:string, parent:string|null}>, unmatched: string[]}}
 */
function splitPageSections(page) {
  const lines = String(page.text == null ? '' : page.text).replace(/\r\n/g, '\n').split('\n');
  const headings = Array.isArray(page.headings) ? page.headings : [];
  const marks = [];
  let cursor = 0;
  const unmatched = [];

  for (const h of headings) {
    const want = lineKey(h.text);
    let found = -1;
    for (let i = cursor; i < lines.length; i++) {
      if (lineKey(lines[i]) === want) {
        found = i;
        break;
      }
    }
    if (found === -1) {
      unmatched.push(h.text);
      continue;
    }
    marks.push({ index: found, level: h.level, text: h.text });
    cursor = found + 1;
  }

  const body = (from, to) =>
    lines
      .slice(from, to)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  let intro = '';
  const sections = [];
  const stack = [];

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const end = i + 1 < marks.length ? marks[i + 1].index : lines.length;
    const text = body(m.index + 1, end);
    if (m.level <= 1) {
      intro = text;
      continue;
    }
    while (stack.length && stack[stack.length - 1].level >= m.level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].text : null;
    stack.push({ level: m.level, text: m.text });
    sections.push({ level: m.level, heading: m.text, text, parent });
  }

  if (!marks.length) intro = body(0, lines.length);
  else if (marks[0].level > 1) intro = body(0, marks[0].index);

  return { intro, sections, unmatched };
}

/** Individual prose lines of a block, blank lines dropped. */
function proseLines(text) {
  return String(text == null ? '' : text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * The line to lead a key point with: the first line that is an actual statement.
 *
 * These pages are full of one-word structural labels ("Do", "Avoid",
 * "Preferred", "4. Metadata"). Promoting one of those to a key point produces
 * advice-shaped noise, so a section with nothing substantial contributes no key
 * point at all. Nothing is lost — the full block is kept verbatim either way.
 */
const LEAD_MIN_KEY_LEN = 40;
const LEAD_MAX_CHARS = 320;

function leadStatement(text) {
  for (const line of proseLines(text)) {
    if (softKey(line).length < LEAD_MIN_KEY_LEN) continue;
    if (line.length <= LEAD_MAX_CHARS) return line;
    const first = sentences(line)[0];
    return first && softKey(first).length >= LEAD_MIN_KEY_LEN ? first : line;
  }
  return null;
}

/** Split a line into sentences for polarity classification. */
function sentences(line) {
  return String(line == null ? '' : line)
    .split(/(?<=[.!?])\s+(?=[A-Z"'“(\d])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Do / don't polarity (deliberately strict — see rule 2 in the header)
// ---------------------------------------------------------------------------

const DONT_OPENER = /^(don'?t|do not|never|avoid|steer clear of)\b/i;
const DO_OPENER = /^(always)\b/i;

/** A classified line must be a real statement, not a bare label like "Avoid" or "Do". */
const POLARITY_MIN_KEY_LEN = 25;
const POLARITY_MIN_WORDS = 5;

/**
 * Classify a line as 'do' | 'dont' | null.
 *
 * Only an unambiguous opener counts, and a line that opens one way but later
 * opens the other way is left unclassified. Anything returning null stays in
 * prose, which is always safe; a mis-sort is not.
 */
function polarity(line) {
  const text = String(line == null ? '' : line).trim();
  if (softKey(text).length < POLARITY_MIN_KEY_LEN) return null;
  if (text.split(/\s+/).filter(Boolean).length < POLARITY_MIN_WORDS) return null;
  const parts = sentences(text).map(foldText);
  if (!parts.length) return null;
  const first = parts[0];
  const rest = parts.slice(1);
  if (DONT_OPENER.test(first)) return rest.some((s) => DO_OPENER.test(s)) ? null : 'dont';
  if (DO_OPENER.test(first)) return rest.some((s) => DONT_OPENER.test(s)) ? null : 'do';
  return null;
}

// ---------------------------------------------------------------------------
// Prose merging
// ---------------------------------------------------------------------------

/** Shortest existing entry we are willing to upgrade in place. */
const UPGRADE_MIN_KEY_LEN = 25;

/**
 * Append `candidate` to `list` unless the text is already there.
 *
 * - already contained in an existing entry -> skip (no duplicate wording)
 * - fully contains an existing entry -> replace it in place (the old wording is
 *   preserved verbatim inside the new, longer line, so nothing is lost)
 * - otherwise -> append
 */
function mergeLine(list, candidate, stats) {
  const cand = String(candidate == null ? '' : candidate).trim();
  const key = softKey(cand);
  if (key.length < 3) return;
  for (const existing of list) {
    if (softKey(existing).includes(key)) {
      if (stats) stats.skipped++;
      return;
    }
  }
  for (let i = 0; i < list.length; i++) {
    const ek = softKey(list[i]);
    if (ek.length >= UPGRADE_MIN_KEY_LEN && key.includes(ek)) {
      list[i] = cand;
      if (stats) stats.upgraded++;
      return;
    }
  }
  list.push(cand);
  if (stats) stats.added++;
}

/** True when `text` is already covered by `existing`. */
function coveredBy(existing, text) {
  const k = softKey(text);
  return k.length > 0 && softKey(existing).includes(k);
}

/**
 * Drop entries that another entry in the same list already states in full.
 *
 * Merging a verbatim source sentence next to an earlier paraphrase of it leaves
 * a quick-reference list saying the same thing twice. Removing the subsumed
 * entry is not a deletion: its exact wording survives inside the entry that is
 * kept, which is the same invariant `mergeLine` upgrades under. Short entries
 * are left alone so a generic line can never swallow a specific one.
 */
function collapseSubsumed(list, minKeyLen = UPGRADE_MIN_KEY_LEN) {
  if (!Array.isArray(list)) return 0;
  const keys = list.map(softKey);
  const drop = new Set();
  for (let i = 0; i < list.length; i++) {
    if (keys[i].length < minKeyLen) continue;
    for (let j = 0; j < list.length; j++) {
      if (i === j || drop.has(j)) continue;
      if (keys[j].length > keys[i].length && keys[j].includes(keys[i])) {
        drop.add(i);
        break;
      }
    }
  }
  if (!drop.size) return 0;
  const kept = list.filter((_, i) => !drop.has(i));
  list.length = 0;
  list.push(...kept);
  return drop.size;
}

/** Collapse the quick-reference lists a merge appends to. */
function collapseGuidanceLists(container) {
  let n = 0;
  if (container && typeof container === 'object' && !Array.isArray(container)) {
    n += collapseSubsumed(container.do);
    n += collapseSubsumed(container.dont);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Heading matching (order-consuming, duplicate-safe)
// ---------------------------------------------------------------------------

/**
 * Build a matcher over existing headings.
 *
 * Each existing heading is indexed under its own key AND under its key with a
 * trailing "(qualifier)" stripped, so the hand-disambiguated
 * "Chat entry points (visual pattern)" still matches the source page's second
 * plain "Chat entry points". Every index is consumed at most once, in order.
 */
function headingMatcher(existingHeadings) {
  const buckets = new Map();
  const push = (k, i) => {
    if (!k) return;
    if (!buckets.has(k)) buckets.set(k, []);
    const arr = buckets.get(k);
    if (!arr.includes(i)) arr.push(i);
  };
  existingHeadings.forEach((h, i) => {
    push(softKey(h), i);
    push(headingKey(h), i);
  });
  const used = new Set();
  return {
    take(keys) {
      for (const k of keys) {
        const arr = buckets.get(k);
        if (!arr) continue;
        for (const i of arr) {
          if (used.has(i)) continue;
          used.add(i);
          return i;
        }
      }
      return -1;
    },
    leftovers() {
      return existingHeadings.map((_, i) => i).filter((i) => !used.has(i));
    },
  };
}

/**
 * Title to use for a captured section. Pages repeat headings ("Aim for",
 * "Avoid", "Quick actions"), so a repeated heading is qualified with its parent
 * — and the qualified form normalizes back to parent+heading, which is exactly
 * the key a re-run looks it up under.
 */
function sectionTitle(section, duplicateKeys) {
  if (!duplicateKeys.has(softKey(section.heading))) return section.heading;
  if (!section.parent) return section.heading;
  return section.parent + ' \u2014 ' + section.heading;
}

/** Keys of headings that appear more than once on the same page. */
function duplicateHeadingKeys(sections) {
  const seen = new Map();
  for (const s of sections) {
    const k = softKey(s.heading);
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}

/** Candidate lookup keys for a captured section, most specific first. */
function sectionKeys(section, title) {
  const keys = [];
  if (section.parent) keys.push(softKey(section.parent + ' ' + section.heading));
  keys.push(softKey(title));
  keys.push(softKey(section.heading));
  keys.push(headingKey(section.heading));
  return [...new Set(keys.filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/**
 * The real CDN URL behind a captured `src`.
 *
 * Topic pages route images through Astro's `/_image?href=<encoded>&w=..&h=..`
 * endpoint, so the shipped, canonical URL lives in the `href` parameter. The
 * parameter is form-encoded (a literal `+` is a space), and re-parsing through
 * URL re-encodes that space as %20 — which is exactly how the existing index
 * stores it, so dedupe by URL works.
 */
function canonicalImageUrl(src) {
  try {
    const u = new URL(String(src));
    if (u.pathname === '/_image' && u.searchParams.get('href')) {
      return new URL(u.searchParams.get('href')).href;
    }
    u.hash = '';
    return u.href;
  } catch {
    return String(src);
  }
}

/** Asset slug: file name without the extension and without the build hash. */
function assetSlug(url) {
  let name;
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  } catch {
    name = String(url).split('/').pop() || '';
  }
  const parts = name.split('.');
  if (parts.length >= 3) parts.pop(), parts.pop();
  else if (parts.length === 2) parts.pop();
  return parts.join('.');
}

/** True for page chrome (platform badges, logos) rather than documentation visuals. */
function isChromeAsset(url) {
  const slug = assetSlug(url);
  return /\.svg$/i.test(url) && CHROME_ASSETS.test(slug);
}

/**
 * Do/don't verdict for an image, from its alt text, else its asset slug.
 * Returns undefined when the polarity is not stated — never a guess.
 */
function imageVerdict(alt, slug) {
  const a = foldText(alt).toLowerCase();
  if (/\bincorrect\b|\bdon't\b|\bdo not\b|\bavoid\b|\bwrong\b|not recommended/.test(a)) return 'dont';
  if (/\bcorrect\b|\brecommended\b|\bright way\b/.test(a)) return 'do';
  const s = String(slug || '');
  if (/(^|[-_ ])(dont|no|n)$/i.test(s)) return 'dont';
  if (/(^|[-_ ])(do|yes|y)$/i.test(s)) return 'do';
  return undefined;
}

/** Visual kind implied by the section a visual sits in. */
function kindForSection(section) {
  const keys = [softKey(section.heading), softKey(section.rootHeading || '')];
  for (const k of keys) {
    if (k === 'anatomy') return 'anatomy';
    if (k === 'types') return 'type';
    if (k === 'states') return 'state';
    if (k === 'layout') return 'layout';
    if (k === 'behavior') return 'behavior';
    if (k === 'content') return 'content';
    if (k === 'accessibility') return 'accessibility';
  }
  return null;
}

/**
 * Locate the section a visual belongs to using its own alt text.
 *
 * These pages caption a visual with the exact heading it illustrates
 * ("Loading", "Reference overflow", "Secondary actions"), so an exact heading
 * match is evidence from the page itself. Partial matches are deliberately
 * rejected: "References" is a substring of "Naming references" but the visual
 * actually belongs to "Types", and a plausible-looking wrong attribution is
 * worse than none.
 */
function sectionForAlt(alt, sections) {
  const key = softKey(alt);
  if (key.length < 3) return null;
  const exact = sections.filter((s) => softKey(s.heading) === key || headingKey(s.heading) === key);
  return exact.length === 1 ? exact[0] : null;
}

/** Visual kind implied by the authored asset name (Behavior-*, Layout-*, *-anat). */
function slugKind(slug) {
  const s = String(slug || '');
  if (/anat/i.test(s)) return 'anatomy';
  if (/behavior/i.test(s)) return 'behavior';
  if (/layout/i.test(s)) return 'layout';
  if (/state/i.test(s)) return 'state';
  if (/content/i.test(s)) return 'content';
  if (/types?[-_ ]/i.test(s)) return 'type';
  return null;
}

/** Visual kind implied by alt text alone. */
function altKind(alt) {
  const a = foldText(alt).toLowerCase();
  if (/anatomy/.test(a)) return 'anatomy';
  if (/\bstates?\b/.test(a)) return 'state';
  if (/\btypes?\b/.test(a)) return 'type';
  if (/\blayout\b/.test(a)) return 'layout';
  if (/\bbehavior\b/.test(a)) return 'behavior';
  if (/\bcontent\b/.test(a)) return 'content';
  if (/\bexample\b/.test(a)) return 'example';
  return null;
}

/**
 * Captured images: canonical URL, de-chromed, page order, de-duplicated.
 *
 * The authored asset name outranks the alt text, because the site reuses a
 * stale alt on some visuals — chatinput ships "Full chat anatomy" as the alt of
 * Behavior-submit-button.png. When the two disagree the caption-derived section
 * is dropped rather than recorded against the wrong heading.
 */
function captureImages(page, sections) {
  const out = [];
  const seen = new Set();
  const chrome = [];
  const known = (sections || []).filter((s) => !SKIP_HEADINGS.test(s.heading));
  for (const img of page.images || []) {
    const url = canonicalImageUrl(img.src);
    if (isChromeAsset(url)) {
      chrome.push(url);
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const slug = assetSlug(url);
    const alt = String(img.alt == null ? '' : img.alt).trim();
    const verdict = imageVerdict(alt, slug);
    const owning = sectionForAlt(alt, known);
    const fromSlug = slugKind(slug);
    const fromSection = owning ? kindForSection(owning) : null;
    const disagree = fromSlug && fromSection && fromSlug !== fromSection;
    const kind = verdict ? 'dodont' : fromSlug || fromSection || altKind(alt) || 'other';
    out.push({
      url,
      slug,
      alt,
      verdict,
      kind,
      section: owning && !disagree ? owning.heading : '',
    });
  }
  return { images: out, chrome };
}

// ---------------------------------------------------------------------------
// Merge: design-guidance.json (the 4 "Working with AI" topics)
// ---------------------------------------------------------------------------

function mergeTopic(topic, page, report) {
  const { intro, sections: captured, unmatched } = parsePage(page);
  const dupKeys = duplicateHeadingKeys(captured);
  const existing = Array.isArray(topic.sections) ? topic.sections : (topic.sections = []);
  const matcher = headingMatcher(existing.map((s) => String(s.heading || '')));

  const stats = {
    sectionsMatched: 0,
    sectionsAdded: 0,
    sourceTextAdded: 0,
    keyPointsAdded: 0,
    imagesAdded: 0,
    doAdded: 0,
    dontAdded: 0,
    unmatchedHeadings: unmatched,
    added: { sections: [], keyPoints: [], do: [], dont: [], images: [] },
  };

  const ordered = [];
  for (const sec of captured) {
    if (SKIP_HEADINGS.test(sec.heading)) continue;
    const title = sectionTitle(sec, dupKeys);
    const idx = matcher.take(sectionKeys(sec, title));
    if (idx >= 0) {
      const target = existing[idx];
      if (!String(target.text || '').trim() && sec.text) target.text = sec.text;
      target.level = sec.level;
      if (sec.text && !coveredBy(target.text, sec.text)) {
        if (target.sourceText !== sec.text) stats.sourceTextAdded++;
        target.sourceText = sec.text;
      }
      ordered.push(target);
      stats.sectionsMatched++;
    } else {
      const created = { heading: title, text: sec.text, level: sec.level };
      ordered.push(created);
      stats.sectionsAdded++;
      stats.added.sections.push('h' + sec.level + ' ' + title);
      // A section the earlier placeholder never saw is exactly the guidance a
      // reader is missing, so lead its verbatim opening statement into keyPoints.
      const lead = leadStatement(sec.text);
      if (lead) {
        const point = title + ': ' + lead;
        if (!Array.isArray(topic.keyPoints)) topic.keyPoints = [];
        const before = topic.keyPoints.length;
        mergeLine(topic.keyPoints, point, null);
        if (topic.keyPoints.length > before) {
          stats.keyPointsAdded++;
          stats.added.keyPoints.push(point);
        }
      }
    }
  }
  for (const i of matcher.leftovers()) ordered.push(existing[i]);
  topic.sections = ordered;

  if (intro && !coveredBy(topic.summary || '', intro)) {
    if (!String(topic.summary || '').trim()) topic.summary = intro;
    else topic.sourceIntro = intro;
  }

  // Do/don't guidance, classified only where the source states polarity outright.
  if (topic.doDont && typeof topic.doDont === 'object' && !Array.isArray(topic.doDont)) {
    if (!Array.isArray(topic.doDont.do)) topic.doDont.do = [];
    if (!Array.isArray(topic.doDont.dont)) topic.doDont.dont = [];
    for (const sec of captured) {
      if (SKIP_HEADINGS.test(sec.heading)) continue;
      for (const line of proseLines(sec.text)) {
        const p = polarity(line);
        if (!p) continue;
        const list = topic.doDont[p];
        const before = list.length;
        mergeLine(list, line, null);
        if (list.length > before) {
          stats[p === 'do' ? 'doAdded' : 'dontAdded']++;
          stats.added[p].push(line);
        }
      }
    }
  }
  stats.collapsed = collapseGuidanceLists(topic.doDont) + collapseSubsumed(topic.keyPoints);

  // Images: append only URLs the topic does not already carry.
  if (!Array.isArray(topic.images)) topic.images = [];
  const known = new Set(topic.images.map((i) => String(i.url || '')));
  const { images, chrome } = captureImages(page, captured);
  for (const img of images) {
    if (known.has(img.url)) continue;
    known.add(img.url);
    const entry = {
      alt: img.alt,
      section: img.section,
      asset: img.slug,
      url: img.url,
      kind: img.kind,
      source: IMAGE_SOURCE,
    };
    if (img.verdict) entry.verdict = img.verdict;
    if (!img.alt) entry.altNote = 'The source page ships this image with empty alt text.';
    topic.images.push(entry);
    stats.imagesAdded++;
    stats.added.images.push(entry.kind + (entry.verdict ? '/' + entry.verdict : '') + ' ' + img.slug + ' — ' + (img.alt || '(no alt)'));
  }
  report.chromeSkipped += chrome.length;

  topic.accessStatus = ACCESS_STATUS;
  topic.capturedAt = CAPTURED_AT;
  topic.accessNote = ACCESS_NOTE;
  topic.sourceCapture = {
    url: page.url,
    finalUrl: page.finalUrl,
    title: page.title,
    h1: page.h1,
    capturedAt: CAPTURED_AT,
    method: CAPTURE_METHOD,
  };

  return stats;
}

// ---------------------------------------------------------------------------
// Merge: fluent-components-usage.json (the 14 AI component usage pages)
// ---------------------------------------------------------------------------

/**
 * Which usage array a captured section's prose belongs in.
 *
 * The section's own heading wins over its parent, because pages nest a plain
 * "Anatomy" under "Layout" and its numbered parts belong in `anatomy`, not
 * `behavior`. Layout and Subcomponents prose goes to `behavior`, matching how
 * every other entry in this file is already shaped.
 */
function targetFields(section) {
  const pick = (k) => {
    if (k === 'anatomy') return ['anatomy'];
    if (k === 'types') return ['types'];
    if (k === 'states') return ['states'];
    if (k === 'accessibility') return ['accessibility'];
    if (k === 'content') return ['content'];
    if (k === 'behavior' || k === 'layout' || k === 'subcomponents') return ['behavior'];
    return null;
  };
  return pick(softKey(section.heading)) || pick(softKey(section.rootHeading || '')) || ['behavior'];
}

/**
 * Shortest prose line worth appending to a flat usage array.
 *
 * Pages carry bare list labels ("Attachment", "2. Body:", "4. Metadata") that
 * only mean something in position. They are preserved verbatim in the entry's
 * `capture.sections` block, so leaving them out of the flat arrays loses
 * nothing and keeps the arrays readable. Anatomy is exempt: part names there
 * are supposed to be two words.
 */
const PROSE_MIN_KEY_LEN = 25;

function proseLongEnough(field, line) {
  const min = field === 'anatomy' ? 3 : PROSE_MIN_KEY_LEN;
  return softKey(line).length >= min;
}

/** Attach each captured section's top-level (h2) heading. */
function withRootHeadings(sections) {
  let root = null;
  return sections.map((s) => {
    if (s.level <= 2) root = s.heading;
    return { ...s, rootHeading: root || s.heading };
  });
}

/** Parse a captured page into an intro plus root-annotated sections. */
function parsePage(page) {
  const parsed = splitPageSections(page);
  return { ...parsed, sections: withRootHeadings(parsed.sections) };
}

/**
 * Drop an ordered-list marker ("1. ", "2) ").
 *
 * The numbering is meaningful in place and is kept verbatim in the entry's
 * `capture.sections` block; in a flat array it is just noise in front of the
 * sentence, and the surrounding entries in this file are stored unnumbered.
 */
function stripListMarker(line) {
  return line.replace(/^\d+[.)]\s*/, '').trim();
}

function mergeComponent(entry, page, report) {
  const parsed = parsePage(page);
  const captured = parsed.sections;
  const dupKeys = duplicateHeadingKeys(captured);

  const stats = {
    sectionsMatched: 0,
    sectionsAdded: 0,
    proseAdded: 0,
    proseUpgraded: 0,
    imagesAdded: 0,
    doAdded: 0,
    dontAdded: 0,
    unmatchedHeadings: parsed.unmatched,
    added: { sections: [], prose: [], upgraded: [], do: [], dont: [], images: [] },
  };

  // --- section list (strings, existing order preserved where it matches) ---
  if (!Array.isArray(entry.sections)) entry.sections = [];
  const matcher = headingMatcher(entry.sections.map(String));
  const orderedSections = [];
  const captureBlocks = [];
  for (const sec of captured) {
    if (SKIP_HEADINGS.test(sec.heading)) continue;
    const title = sectionTitle(sec, dupKeys);
    const idx = matcher.take(sectionKeys(sec, title));
    if (idx >= 0) {
      orderedSections.push(entry.sections[idx]);
      stats.sectionsMatched++;
    } else {
      orderedSections.push(title);
      stats.sectionsAdded++;
      stats.added.sections.push('h' + sec.level + ' ' + title);
    }
    captureBlocks.push({ level: sec.level, heading: title, text: sec.text });
  }
  for (const i of matcher.leftovers()) orderedSections.push(entry.sections[i]);
  entry.sections = orderedSections;

  // --- prose into the arrays this file already uses ---
  for (const sec of captured) {
    if (SKIP_HEADINGS.test(sec.heading)) continue;
    const fields = targetFields(sec);
    for (const raw of proseLines(sec.text)) {
      const line = stripListMarker(raw);
      for (const field of fields) {
        if (!proseLongEnough(field, line)) continue;
        if (!Array.isArray(entry[field])) entry[field] = [];
        const s = { added: 0, upgraded: 0, skipped: 0 };
        mergeLine(entry[field], line, s);
        stats.proseAdded += s.added;
        stats.proseUpgraded += s.upgraded;
        if (s.added) stats.added.prose.push(field + ' <- ' + line);
        if (s.upgraded) stats.added.upgraded.push(field + ' <- ' + line);
      }
      const p = polarity(line);
      if (p) {
        if (!entry.bestPractices || typeof entry.bestPractices !== 'object') {
          entry.bestPractices = { do: [], dont: [] };
        }
        if (!Array.isArray(entry.bestPractices.do)) entry.bestPractices.do = [];
        if (!Array.isArray(entry.bestPractices.dont)) entry.bestPractices.dont = [];
        const list = entry.bestPractices[p];
        const before = list.length;
        mergeLine(list, line, null);
        if (list.length > before) {
          stats[p === 'do' ? 'doAdded' : 'dontAdded']++;
          stats.added[p].push(line);
        }
      }
    }
  }

  // --- images ---
  stats.collapsed = collapseGuidanceLists(entry.bestPractices);
  if (!Array.isArray(entry.images)) entry.images = [];
  const known = new Set(entry.images.map((i) => String(i.url || '')));
  const { images, chrome } = captureImages(page, captured);
  for (const img of images) {
    if (known.has(img.url)) continue;
    known.add(img.url);
    const rec = {
      file: img.slug,
      url: img.url,
      alt: img.alt,
      kind: img.kind,
      section: img.section,
      source: IMAGE_SOURCE,
    };
    if (img.verdict) rec.verdict = img.verdict;
    if (!img.alt) rec.altNote = 'The source page ships this image with empty alt text.';
    entry.images.push(rec);
    stats.imagesAdded++;
    stats.added.images.push(rec.kind + (rec.verdict ? '/' + rec.verdict : '') + ' ' + img.slug + ' — ' + (img.alt || '(no alt)'));
  }
  report.chromeSkipped += chrome.length;

  // --- resource links + provenance ---
  const offPage = (page.links || []).filter((l) => {
    const href = String(l.href || '');
    if (!href) return false;
    return !href.startsWith(String(page.url || '') + '#') && !href.startsWith(String(page.finalUrl || '') + '#');
  });
  if (!String(entry.storybookUrl || '').trim()) {
    const book = offPage.find((l) => /(^|\.)(ai|react)\.fluentui\.dev$/i.test(safeHost(l.href)));
    if (book) entry.storybookUrl = book.href;
  }
  entry.contentSource = 'gated-capture';
  entry.contentSourceNote =
    'This usage page requires Microsoft employee sign-in, so it cannot be re-validated from a public crawl. The guidance, section list and images here come from a signed-in capture taken ' +
    CAPTURED_AT +
    '.';
  entry.capture = {
    accessStatus: ACCESS_STATUS,
    capturedAt: CAPTURED_AT,
    method: CAPTURE_METHOD,
    sourceUrl: page.url,
    finalUrl: page.finalUrl,
    title: page.title,
    intro: parsed.intro,
    sections: captureBlocks,
    links: offPage.map((l) => ({ text: String(l.text == null ? '' : l.text).trim(), href: l.href })),
  };

  return stats;
}

function safeHost(href) {
  try {
    return new URL(String(href)).hostname;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Merge: fluent-images.json (media index)
// ---------------------------------------------------------------------------

function mergeMedia(index, items) {
  const media = Array.isArray(index.media) ? index.media : (index.media = []);
  const known = new Set(media.map((m) => String(m.url || '')));
  const ids = new Set(media.map((m) => String(m.id || '')));
  let added = 0;
  let emptyAlt = 0;

  for (const item of items) {
    if (known.has(item.url)) continue;
    known.add(item.url);
    let id = item.idBase;
    let n = 2;
    while (ids.has(id)) id = item.idBase + '-' + n++;
    ids.add(id);
    const rec = {
      id,
      source: item.source,
      owner: item.owner,
      slug: item.slug,
      category: item.category,
      platform: item.platform,
      docUrl: item.docUrl,
      type: 'image',
      kind: item.kind,
      section: item.section || '',
      alt: item.alt,
      url: item.url,
    };
    if (item.verdict) rec.verdict = item.verdict;
    if (!item.alt) {
      rec.altNote = 'The source page ships this image with empty alt text.';
      emptyAlt++;
    }
    media.push(rec);
    added++;
  }

  // Derived counts, always recomputed so they cannot drift from the data.
  const byKind = {};
  let images = 0;
  let videos = 0;
  for (const m of media) {
    byKind[m.kind] = (byKind[m.kind] || 0) + 1;
    if (m.type === 'video') videos++;
    else images++;
  }
  index.$meta = index.$meta || {};
  index.$meta.counts = { total: media.length, images, videos, byKind };
  index.$meta.gatedCapture = {
    capturedAt: CAPTURED_AT,
    method: CAPTURE_METHOD,
    note:
      'Visuals on the 14 AI component usage pages and the 4 "Working with AI" topic pages come from a signed-in capture; those pages 302 to login.microsoftonline.com for anyone outside Microsoft. Images whose source alt text is empty carry an "altNote" and keep the empty alt rather than an invented description.',
  };
  return { added, emptyAlt };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export function run(opts = {}) {
  const dryRun = !!opts.dryRun;
  const capturePath = resolveCapturePath(opts.capture);
  if (!capturePath) {
    return { ok: false, error: 'Capture not found. Pass --capture <path> or set FLUENT_GATED_CAPTURE.' };
  }

  const capture = JSON.parse(readFileSync(capturePath, 'utf8'));
  const pages = capture.pages || {};

  const guidancePath = join(DATA, 'design-guidance.json');
  const usagePath = join(DATA, 'fluent-components-usage.json');
  const imagesPath = join(DATA, 'fluent-images.json');

  const guidance = readJsonFile(guidancePath);
  const usage = readJsonFile(usagePath);
  const imageIndex = readJsonFile(imagesPath);

  const report = {
    capturePath,
    dryRun,
    chromeSkipped: 0,
    topics: {},
    components: {},
    media: { added: 0, emptyAlt: 0 },
    files: {},
    warnings: [],
  };

  const mediaQueue = [];

  // --- topics ---
  for (const key of TOPIC_KEYS) {
    const page = pages[key];
    const topic = guidance.json.topics ? guidance.json.topics[key] : null;
    if (!page) {
      report.warnings.push(`capture has no page for topic "${key}"`);
      continue;
    }
    if (!topic) {
      report.warnings.push(`design-guidance.json has no topic "${key}"`);
      continue;
    }
    report.topics[key] = mergeTopic(topic, page, report);
    const { images } = captureImages(page, parsePage(page).sections);
    for (const img of images) {
      mediaQueue.push({
        idBase: 'topic/' + key + '/' + img.slug,
        source: 'topic',
        owner: topic.title || key,
        slug: key,
        category: 'working-with-ai',
        platform: 'web',
        docUrl: topic.docUrl || page.url,
        kind: img.kind,
        section: img.section,
        alt: img.alt,
        url: img.url,
        verdict: img.verdict,
      });
    }
  }

  // --- components (matched by the /ai/<slug>/usage path in docUrl) ---
  const bySlug = new Map();
  for (const e of usage.json) {
    const doc = String(e.docUrl || '');
    const m = /\/ai\/(.+?)\/usage\/?$/.exec(doc);
    if (m) bySlug.set(m[1].replace(/\/+/g, '-'), e);
  }
  for (const [key, page] of Object.entries(pages)) {
    if (page.kind !== 'ai-component') continue;
    const entry = bySlug.get(key);
    if (!entry) {
      report.warnings.push(`fluent-components-usage.json has no entry whose docUrl contains /ai/${key.replace(/-/g, '/')}/usage`);
      continue;
    }
    report.components[key] = mergeComponent(entry, page, report);
    const { images } = captureImages(page, parsePage(page).sections);
    for (const img of images) {
      mediaQueue.push({
        idBase: 'component/' + (entry.slug || key) + '/' + img.slug,
        source: 'component',
        owner: entry.name || key,
        slug: entry.slug || key,
        category: entry.category || 'ai',
        platform: entry.platform || 'web/react',
        docUrl: entry.docUrl,
        kind: img.kind,
        section: img.section,
        alt: img.alt,
        url: img.url,
        verdict: img.verdict,
      });
    }
  }

  report.media = mergeMedia(imageIndex.json, mediaQueue);

  // --- file-level provenance for the guidance topics ---
  if (guidance.json.$meta) {
    guidance.json.$meta.gatedCapture = {
      capturedAt: CAPTURED_AT,
      method: CAPTURE_METHOD,
      topics: TOPIC_KEYS.slice(),
      note:
        'These four "Working with AI" topics live behind a Microsoft employee sign-in. Their prose, section structure and images come from a signed-in capture and are marked accessStatus "' +
        ACCESS_STATUS +
        '": still gated for other readers, but no longer a placeholder. Verbatim page prose is carried in each section\'s "sourceText".',
    };
  }

  report.files['mcp/data/design-guidance.json'] = writeJsonFile(
    guidancePath, guidance.json, guidance.style, guidance.text, dryRun);
  report.files['mcp/data/fluent-components-usage.json'] = writeJsonFile(
    usagePath, usage.json, usage.style, usage.text, dryRun);
  report.files['mcp/data/fluent-images.json'] = writeJsonFile(
    imagesPath, imageIndex.json, imageIndex.style, imageIndex.text, dryRun);

  report.ok = true;
  return report;
}

function printReport(report, verbose) {
  if (!report.ok) {
    console.error(report.error);
    return 1;
  }
  const sum = (obj, field) => Object.values(obj).reduce((n, s) => n + (s[field] || 0), 0);
  console.log('merge-gated-pages' + (report.dryRun ? ' (DRY RUN — nothing written)' : ''));
  console.log('capture: ' + report.capturePath);
  console.log('');
  console.log('topics enriched:     ' + Object.keys(report.topics).length);
  console.log('  sections matched:  ' + sum(report.topics, 'sectionsMatched'));
  console.log('  sections added:    ' + sum(report.topics, 'sectionsAdded'));
  console.log('  sourceText added:  ' + sum(report.topics, 'sourceTextAdded'));
  console.log('  keyPoints added:   ' + sum(report.topics, 'keyPointsAdded'));
  console.log('  images added:      ' + sum(report.topics, 'imagesAdded'));
  console.log("  do/don't added:    " + sum(report.topics, 'doAdded') + ' / ' + sum(report.topics, 'dontAdded'));
  console.log('  subsumed collapsed:' + sum(report.topics, 'collapsed'));
  console.log('components enriched: ' + Object.keys(report.components).length);
  console.log('  sections matched:  ' + sum(report.components, 'sectionsMatched'));
  console.log('  sections added:    ' + sum(report.components, 'sectionsAdded'));
  console.log('  prose added:       ' + sum(report.components, 'proseAdded'));
  console.log('  prose upgraded:    ' + sum(report.components, 'proseUpgraded'));
  console.log('  images added:      ' + sum(report.components, 'imagesAdded'));
  console.log("  do/don't added:    " + sum(report.components, 'doAdded') + ' / ' + sum(report.components, 'dontAdded'));
  console.log('  subsumed collapsed:' + sum(report.components, 'collapsed'));
  console.log('media index added:   ' + report.media.added + ' (' + report.media.emptyAlt + ' with empty source alt)');
  console.log('page chrome skipped: ' + report.chromeSkipped);
  console.log('');
  for (const [file, res] of Object.entries(report.files)) {
    console.log((res.changed ? 'changed  ' : 'unchanged') + '  ' + file + '  (' + res.bytes + ' bytes)');
  }
  if (verbose) {
    const dump = (label, group) => {
      for (const [key, s] of Object.entries(group)) {
        const a = s.added || {};
        const rows = [];
        for (const [what, list] of Object.entries(a)) {
          for (const line of list) rows.push('    [' + what + '] ' + line);
        }
        if (!rows.length && !(s.unmatchedHeadings || []).length) continue;
        console.log('');
        console.log('  ' + label + ' ' + key);
        for (const h of s.unmatchedHeadings || []) console.log('    [heading NOT FOUND in page text] ' + h);
        for (const r of rows) console.log(r);
      }
    };
    dump('topic', report.topics);
    dump('component', report.components);
  }
  for (const w of report.warnings) console.warn('warning: ' + w);
  return 0;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const report = run(args);
  process.exit(printReport(report, args.verbose));
}
