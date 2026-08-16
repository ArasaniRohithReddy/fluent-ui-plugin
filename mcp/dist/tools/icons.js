import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
const load = () => loadJson('fluent-icons.json');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s) => String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
/** Split a PascalCase export base into words: "AddCircle" -> ["add","circle"]. */
const baseWords = (base) => base.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').toLowerCase().split(/\s+/).filter(Boolean);
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length || !b.length)
        return Math.max(a.length, b.length);
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}
// A handful of English words describe an action the icon set names after an
// object. This is the "Shield, not security" gap: the metaphor lists cover most
// of it, but not all, and a miss here is a failed search for a common word.
const INTENT_SYNONYMS = {
    trash: ['delete', 'bin'],
    bin: ['delete'],
    remove: ['delete', 'subtract', 'dismiss'],
    close: ['dismiss'],
    cancel: ['dismiss'],
    security: ['shield', 'lock'],
    secure: ['shield', 'lock'],
    logout: ['sign out', 'arrow exit'],
    login: ['sign in', 'person'],
    user: ['person'],
    users: ['people'],
    account: ['person'],
    profile: ['person'],
    avatar: ['person'],
    email: ['mail'],
    'e-mail': ['mail'],
    message: ['chat', 'mail'],
    attachment: ['attach'],
    upload: ['arrow upload'],
    download: ['arrow download'],
    refresh: ['arrow sync', 'arrow clockwise'],
    reload: ['arrow sync'],
    undo: ['arrow undo'],
    settings: ['settings', 'options'],
    config: ['settings'],
    search: ['search'],
    find: ['search'],
    favourite: ['star'],
    favorite: ['star'],
    bookmark: ['bookmark'],
    home: ['home'],
    warning: ['warning'],
    error: ['error circle', 'dismiss circle'],
    success: ['checkmark'],
    done: ['checkmark'],
    ok: ['checkmark'],
    confirm: ['checkmark'],
    notification: ['alert'],
    notifications: ['alert'],
    help: ['question'],
    info: ['info'],
    copy: ['copy'],
    paste: ['clipboard paste'],
    cut: ['cut'],
    print: ['print'],
    share: ['share'],
    filter: ['filter'],
    sort: ['arrow sort'],
    expand: ['chevron', 'expand'],
    collapse: ['chevron', 'collapse'],
    menu: ['navigation', 'more'],
    hamburger: ['navigation'],
    kebab: ['more vertical'],
    ellipsis: ['more horizontal'],
    loading: ['spinner', 'arrow clockwise'],
    save: ['save'],
    edit: ['edit', 'pen'],
    pencil: ['pen'],
    write: ['pen', 'edit'],
    password: ['lock', 'key'],
    logoff: ['sign out'],
    send: ['send'],
    call: ['call'],
    phone: ['phone', 'call'],
    video: ['video'],
    camera: ['camera'],
    mic: ['mic'],
    microphone: ['mic'],
    volume: ['speaker'],
    sound: ['speaker'],
    mute: ['speaker off', 'mic off'],
    play: ['play'],
    pause: ['pause'],
    stop: ['stop'],
    folder: ['folder'],
    file: ['document'],
    document: ['document'],
    chart: ['chart', 'data'],
    graph: ['chart', 'data'],
    dashboard: ['board', 'data'],
    calendar: ['calendar'],
    date: ['calendar'],
    time: ['clock'],
    clock: ['clock'],
    location: ['location', 'pin'],
    map: ['map'],
    link: ['link'],
    url: ['link'],
    tag: ['tag'],
    label: ['tag'],
    lock: ['lock'],
    unlock: ['lock open'],
    key: ['key'],
    add: ['add'],
    new: ['add'],
    create: ['add'],
    plus: ['add'],
    minus: ['subtract'],
    back: ['arrow left'],
    forward: ['arrow right'],
    next: ['arrow right', 'chevron right'],
    previous: ['arrow left', 'chevron left'],
    dark: ['weather moon'],
    light: ['weather sunny'],
    theme: ['weather moon', 'color'],
    ai: ['sparkle'],
    copilot: ['sparkle'],
    magic: ['sparkle', 'wand'],
};
const DEFAULT_SIZE_ORDER = [24, 20, 16, 28, 32, 48, 12];
/** Best (size, style) to recommend for a family, honouring an explicit request. */
function pickVariant(f, wantSize, wantStyle) {
    const styleOrder = wantStyle
        ? [wantStyle]
        : ['Regular', 'Filled', 'Light', 'Color'];
    for (const style of styleOrder) {
        const sizes = f.variants?.[style];
        if (wantSize) {
            if (sizes?.includes(wantSize))
                return { style, size: wantSize };
            continue;
        }
        if (sizes?.length) {
            for (const s of DEFAULT_SIZE_ORDER)
                if (sizes.includes(s))
                    return { style, size: s };
            return { style, size: sizes[0] };
        }
        if (f.resizable?.includes(style))
            return { style, size: null };
    }
    // Requested combination is unavailable — fall back so the caller still gets a
    // real name rather than nothing.
    if (wantSize || wantStyle)
        return pickVariant(f, undefined, undefined);
    return null;
}
const exportName = (base, size, style) => `${base}${size ?? ''}${style}`;
function sizeSummary(f) {
    const parts = [];
    for (const [style, sizes] of Object.entries(f.variants || {})) {
        parts.push(`${style} ${sizes.join('/')}`);
    }
    if (f.resizable?.length)
        parts.push(`resizable (no size in the name): ${f.resizable.join(', ')}`);
    return parts.join(' · ') || 'none';
}
function score(f, tokens, qNorm, wantSize, wantStyle) {
    const nameW = words(f.name);
    const bW = baseWords(f.base);
    const nameSet = new Set([...nameW, ...bW]);
    const metaphors = f.metaphor || [];
    const metaphorWords = new Set(metaphors.flatMap((m) => words(m)));
    const descW = new Set(words(f.description || ''));
    const nameNorm = norm(f.name);
    const baseNorm = norm(f.base);
    let total = 0;
    const why = [];
    let covered = 0;
    if (qNorm && (qNorm === nameNorm || qNorm === baseNorm)) {
        total += 1000;
        why.push('exact name');
        covered = tokens.length;
    }
    else if (qNorm && (nameNorm.startsWith(qNorm) || baseNorm.startsWith(qNorm))) {
        total += 480 - Math.min(200, nameNorm.length - qNorm.length);
        why.push('name prefix');
        covered = tokens.length;
    }
    if (covered === 0) {
        for (const t of tokens) {
            let best = 0;
            let reason = '';
            if (nameSet.has(t)) {
                best = 300;
                reason = 'name word';
            }
            else if ([...nameSet].some((w) => w.startsWith(t))) {
                best = 200;
                reason = 'name prefix';
            }
            if (metaphors.includes(t) && 260 > best) {
                best = 260;
                reason = 'metaphor';
            }
            else if (metaphorWords.has(t) && 230 > best) {
                best = 230;
                reason = 'metaphor word';
            }
            else if (best < 150 && metaphors.some((m) => m.includes(t))) {
                best = 150;
                reason = 'metaphor';
            }
            if (best < 90 && descW.has(t)) {
                best = 90;
                reason = 'description';
            }
            if (best === 0) {
                // Near-miss spelling. Only for words long enough that a distance of 1-2
                // means a typo rather than a different word.
                const pool = [...nameSet, ...metaphorWords];
                if (t.length >= 5 && pool.some((w) => w.length >= 4 && levenshtein(t, w) <= (t.length >= 8 ? 2 : 1))) {
                    best = 70;
                    reason = 'fuzzy';
                }
            }
            if (best > 0) {
                covered++;
                total += best;
                if (!why.includes(reason))
                    why.push(reason);
            }
        }
    }
    if (total === 0)
        return null;
    // Every word matching is worth far more than one word matching well.
    const coverage = tokens.length ? covered / tokens.length : 1;
    total = total * (0.35 + 0.65 * coverage);
    const styles = Object.keys(f.variants || {});
    const allStyles = new Set([...styles, ...(f.resizable || [])]);
    if (wantSize) {
        const has = Object.values(f.variants || {}).some((sizes) => sizes.includes(wantSize));
        total += has ? 80 : -400;
        if (!has)
            why.push(`no ${wantSize}px`);
    }
    if (wantStyle) {
        const has = allStyles.has(wantStyle);
        total += has ? 60 : -300;
        if (!has)
            why.push(`no ${wantStyle}`);
    }
    if (allStyles.has('Regular') && allStyles.has('Filled'))
        total += 15;
    // Colour-only families are a trap: the package README warns against Color.
    if (allStyles.size && !allStyles.has('Regular') && !allStyles.has('Filled'))
        total -= 150;
    // An icon with no upstream design record is real but undocumented, so prefer
    // a documented one when both match.
    if (f.noDesignRecord)
        total -= 40;
    // Shorter, more general names win ties: "Save" over "SaveArrowRight".
    total -= Math.min(60, norm(f.name).length * 0.6);
    return { family: f, score: total, why };
}
function renderHit(data, f, i, wantSize, wantStyle) {
    const pick = pickVariant(f, wantSize, wantStyle);
    const lines = [];
    const chosen = pick ? exportName(f.base, pick.size, pick.style) : f.base;
    lines.push(`${i}. ${f.name} — ${chosen}`);
    if (f.description)
        lines.push(`   ${f.description}`);
    lines.push(`   Available: ${sizeSummary(f)}`);
    if (wantSize && !Object.values(f.variants || {}).some((sizes) => sizes.includes(wantSize))) {
        lines.push(`   No ${wantSize}px variant in this family — the closest real export is ${chosen}.`);
    }
    if (wantStyle && !new Set([...Object.keys(f.variants || {}), ...(f.resizable || [])]).has(wantStyle)) {
        lines.push(`   No ${wantStyle} variant in this family — the closest real export is ${chosen}.`);
    }
    lines.push(`   import { ${chosen} } from '@fluentui/react-icons';`);
    const allStyles = new Set([...Object.keys(f.variants || {}), ...(f.resizable || [])]);
    if (allStyles.has('Regular') && allStyles.has('Filled')) {
        const size = pick?.size ?? null;
        const filled = f.variants?.Filled?.includes(size) || (size === null && f.resizable?.includes('Filled'))
            ? exportName(f.base, size, 'Filled')
            : null;
        const regular = f.variants?.Regular?.includes(size) || (size === null && f.resizable?.includes('Regular'))
            ? exportName(f.base, size, 'Regular')
            : null;
        if (filled && regular) {
            lines.push(`   bundleIcon: const ${f.base} = bundleIcon(${filled}, ${regular}); // Filled first, Regular second`);
        }
    }
    if (f.metaphor?.length)
        lines.push(`   Metaphors: ${f.metaphor.join(', ')}`);
    if (f.rtlBase) {
        // The right-to-left twin is a separate family and does NOT always ship the
        // same sizes, so resolve a real variant on the twin instead of pasting the
        // left-to-right size onto its name.
        const twin = findFamilyByBase(data, f.rtlBase);
        const twinPick = twin ? pickVariant(twin, pick?.size ?? undefined, pick?.style ?? undefined) : null;
        lines.push(twin && twinPick
            ? `   RTL: ships as a left-to-right/right-to-left pair — use ${exportName(twin.base, twinPick.size, twinPick.style)} in right-to-left locales (${sizeSummary(twin)}).`
            : `   RTL: ships as a left-to-right/right-to-left pair — the right-to-left twin is the ${f.rtlBase} family.`);
    }
    else if (f.rtl) {
        lines.push(`   RTL: directionType "${f.rtl}" — ${f.rtl === 'mirror' ? 'this icon flips in right-to-left locales' : 'a separate right-to-left asset exists for this icon'}.`);
    }
    if (!Object.keys(f.variants || {}).length && f.resizable?.length) {
        lines.push('   Resizable only: no size in the name; it scales with fontSize / height / width.');
    }
    if (f.noDesignRecord) {
        lines.push('   (No upstream design record for this icon — name derived from the verified export base; no description or metaphors exist.)');
    }
    return lines.join('\n');
}
function guidanceFooter(g, opts = {}) {
    const lines = ['', '---', `Naming: ${g.naming}`, `Sizes: ${g.sizes}`];
    if (opts.size === 12)
        lines.push('12px warning: 12px icons are informational only — never put one in an interactive control.');
    lines.push(`Regular vs Filled: ${g.styles.Regular} ${g.styles.Filled}`);
    if (opts.hasColorOnly)
        lines.push(`Color: ${g.styles.Color}`);
    lines.push(`Accessibility: ${g.accessibility}`);
    return lines.join('\n');
}
/** Does this query look like someone asking whether an export name is real? */
const EXPORT_SHAPED = /^[A-Za-z][A-Za-z0-9]*(Filled|Regular|Light|Color)$/;
/** Tolerate the shapes a name arrives in from real code: <Save24Regular />, {Save24Regular}. */
const cleanCandidate = (q) => q.trim().replace(/^[<{[('"`\s]+/, '').replace(/[>}\])'"`;,.\s/]+$/, '');
const looksLikeExport = (q) => EXPORT_SHAPED.test(cleanCandidate(q));
function findFamilyByBase(data, base) {
    const n = norm(base);
    return data.families.find((f) => norm(f.base) === n) || null;
}
/**
 * Validate a candidate export name and, when it is wrong, say exactly why and
 * hand back real names. Failing helpfully matters as much as succeeding: an
 * agent that gets a bad name back ships a build error.
 */
function validateName(data, raw, wantSize, wantStyle) {
    const q = cleanCandidate(raw);
    const m = q.match(/^([A-Za-z][A-Za-z0-9]*?)(\d{1,3})?(Filled|Regular|Light|Color)$/);
    if (!m)
        return null;
    const [, rawBase, sizeStr, style] = m;
    const size = sizeStr ? Number(sizeStr) : null;
    // Greedy match can eat a trailing digit that belongs to the name (Rotate90,
    // NumberCircle1), so try the whole prefix as a base first.
    let base = rawBase;
    let entry = findFamilyByBase(data, base);
    if (!entry && sizeStr) {
        const joined = findFamilyByBase(data, rawBase + sizeStr);
        if (joined) {
            base = rawBase + sizeStr;
            return validateResolved(data, q, joined, base, null, style);
        }
    }
    if (!entry) {
        const suggestions = nearestBases(data, base, 6);
        return {
            ok: false,
            text: [
                `\`${q}\` is NOT a real @fluentui/react-icons export — there is no icon family called "${base}".`,
                '',
                suggestions.length
                    ? `Closest real families: ${suggestions.map((s) => s.base).join(', ')}`
                    : 'No close family name matched.',
                '',
                'There is no upstream rename/deprecation manifest for Fluent icons (the migrations.json at the repo root is an Nx workspace file, not an icon map), so a renamed or removed icon has to be repaired by name. Search for the object the icon depicts — Fluent icons are named for the object, not the function — e.g. fluent_icon_search { query: "trash" } returns Delete.',
            ].join('\n'),
        };
    }
    return validateResolved(data, q, entry, base, size, style);
}
function validateResolved(data, q, entry, base, size, style) {
    const validSizes = data.meta.validSizes;
    const variants = entry.variants || {};
    const resizable = entry.resizable || [];
    const styleSizes = variants[style] || [];
    const real = entry.base;
    const summary = `${entry.name} ships: ${sizeSummary(entry)}`;
    // The happy path: the name is real. Say so unambiguously.
    if ((size === null && resizable.includes(style)) || (size !== null && styleSizes.includes(size))) {
        const lines = [
            `\`${real}${size ?? ''}${style}\` is a real @fluentui/react-icons export.`,
            '',
            `import { ${real}${size ?? ''}${style} } from '@fluentui/react-icons';`,
            `${summary}`,
        ];
        if (size === null)
            lines.push('This is the resizable export: no size in the name, it scales with fontSize / height / width.');
        if (size === 12)
            lines.push('12px icons are informational only — never put one in an interactive control.');
        if (style === 'Color')
            lines.push('Color variants are discouraged: non-compliant with Windows High Contrast Mode, gradient-id collisions, and dark-theme contrast failures. Prefer Regular or Filled.');
        if (entry.rtlBase) {
            const twin = findFamilyByBase(data, entry.rtlBase);
            const twinPick = twin ? pickVariant(twin, size ?? undefined, style) : null;
            lines.push(twin && twinPick
                ? `RTL: this design ships a right-to-left twin — use ${exportName(twin.base, twinPick.size, twinPick.style)} in right-to-left locales.`
                : `RTL: this design ships a right-to-left twin — the ${entry.rtlBase} family.`);
        }
        else if (entry.rtl)
            lines.push(`RTL: directionType "${entry.rtl}".`);
        return { ok: true, text: lines.join('\n') };
    }
    const reasons = [];
    if (size !== null && !validSizes.includes(size)) {
        reasons.push(`${size} is not a Fluent icon size. The only sizes are ${validSizes.join(', ')}.`);
    }
    else if (size !== null && !styleSizes.includes(size)) {
        reasons.push(styleSizes.length
            ? `${real} does not ship ${style} at ${size}px. It ships ${style} at ${styleSizes.join(', ')}.`
            : `${real} has no ${style} variant at all.`);
    }
    else if (size === null) {
        reasons.push(resizable.length
            ? `${real} has no resizable ${style} export. Resizable exports exist for: ${resizable.join(', ')}.`
            : `${real} has no resizable export — every ${real} export carries a size.`);
    }
    if (!variants[style] && !resizable.includes(style)) {
        reasons.push(`There is no ${style} variant of ${real}.`);
    }
    const alternatives = [];
    const preferredStyle = variants[style] || resizable.includes(style) ? style : variants.Regular ? 'Regular' : Object.keys(variants)[0] || resizable[0];
    const pool = variants[preferredStyle] || [];
    if (size !== null && pool.length) {
        const closest = [...pool].sort((a, b) => Math.abs(a - size) - Math.abs(b - size)).slice(0, 3);
        for (const s of closest)
            alternatives.push(`${real}${s}${preferredStyle}`);
    }
    else if (pool.length) {
        for (const s of pool.slice(0, 3))
            alternatives.push(`${real}${s}${preferredStyle}`);
    }
    if (resizable.includes(preferredStyle))
        alternatives.push(`${real}${preferredStyle}`);
    return {
        ok: false,
        text: [
            `\`${q}\` is NOT a real @fluentui/react-icons export.`,
            '',
            ...reasons.map((r) => `- ${r}`),
            '',
            summary,
            alternatives.length ? `\nUse instead: ${[...new Set(alternatives)].join(', ')}\n\nimport { ${[...new Set(alternatives)][0]} } from '@fluentui/react-icons';` : '',
        ]
            .filter((l) => l !== '')
            .join('\n'),
    };
}
function nearestBases(data, base, limit) {
    const target = norm(base);
    const targetWords = new Set(baseWords(base));
    const scored = [];
    for (const f of data.families) {
        const n = norm(f.base);
        let d = levenshtein(target, n);
        // A shared word is a stronger signal than raw edit distance: SaveDisk and
        // Save share "save" but are 4 edits apart.
        if (baseWords(f.base).some((w) => targetWords.has(w)))
            d -= 4;
        if (n.startsWith(target) || target.startsWith(n))
            d -= 3;
        scored.push({ base: f.base, d });
    }
    scored.sort((a, b) => a.d - b.d);
    return scored.filter((s) => s.d <= 6).slice(0, limit);
}
export function registerIcons(server) {
    server.registerTool('fluent_icon_search', {
        title: 'Search & validate Fluent 2 icons (@fluentui/react-icons)',
        description: 'Find the right Fluent 2 system icon and get an export name that actually compiles. Search by what the icon should DEPICT ("trash", "send email", "user") — Fluent icons are literal metaphors named for the object, not the function ("Shield, not security"), so guessing an export name from a feature name fails. Every name returned was verified against the upstream @fluentui/react-icons export manifest, and each hit comes with a copy-paste import line, the sizes and styles that really exist, a bundleIcon snippet when both Regular and Filled ship, plus the accessibility and RTL notes. Pass an export name instead of a phrase (e.g. "AddCircle26Regular") to validate it: the tool says whether it is real and, if not, why and what to use instead.',
        inputSchema: {
            query: z
                .string()
                .describe('What the icon should depict ("trash", "send email", "user", "chevron down"), a Fluent icon family name ("Add Circle"), or an export name to validate ("AddCircle24Regular").'),
            size: z
                .number()
                .int()
                .optional()
                .describe('Only offer icons that ship this pixel size. Fluent icons exist at 12, 16, 20, 24, 28, 32 and 48 only.'),
            style: z
                .enum(['Regular', 'Filled', 'Light', 'Color'])
                .optional()
                .describe('Prefer this style. Regular is the default for wayfinding; Filled for selected states. Color is discouraged.'),
            limit: z.number().int().min(1).max(50).default(8).describe('Maximum number of icon families to return.'),
        },
    }, async ({ query, size, style, limit }) => {
        const data = load();
        if (!data || !Array.isArray(data.families)) {
            return textResult('Icon data not found at mcp/data/fluent-icons.json. Rebuild it with: node scripts/build-icons.mjs');
        }
        const validSizes = data.meta.validSizes;
        // A wrong size is the single most common icon mistake, so answer it with
        // the real list rather than a schema error the agent cannot read.
        if (size !== undefined && !validSizes.includes(size)) {
            return textResult(`size=${size} is not a Fluent icon size. Fluent 2 system icons are drawn at ${validSizes.join(', ')} px only — there is no ${size}px icon, and no export name contains ${size}.\n\n` +
                `${data.guidance.sizes}\n\nRe-run with one of: ${validSizes.join(', ')}, or omit "size" to see everything a family ships.`);
        }
        const q = query.trim();
        if (!q)
            return textResult('Provide a query — what the icon should depict, or an export name to validate.');
        // Validation path.
        if (looksLikeExport(q)) {
            const verdict = validateName(data, q, size, style);
            if (verdict) {
                // A wrong name is only half an answer — hand back real icons for the
                // same words so the caller can fix the code in one step. A correct
                // name needs no alternatives.
                const bare = cleanCandidate(q).replace(/(Filled|Regular|Light|Color)$/, '').replace(/\d+$/, '');
                const fallback = verdict.ok ? [] : searchFamilies(data, baseWords(bare).join(' '), size, style, Math.min(limit, 5));
                return textResult(verdict.text +
                    (fallback.length
                        ? `\n\nIcons that do exist for "${baseWords(bare).join(' ')}":\n\n${fallback.map((c, i) => renderHit(data, c.family, i + 1, size, style)).join('\n\n')}`
                        : '') +
                    guidanceFooter(data.guidance, { size }));
            }
        }
        const hits = searchFamilies(data, q, size, style, limit);
        if (!hits.length) {
            const near = nearestBases(data, q.replace(/\s+/g, ''), 6);
            return textResult(`No Fluent icon matched "${q}".\n\n` +
                (near.length ? `Closest family names: ${near.map((n) => n.base).join(', ')}\n\n` : '') +
                `${data.guidance.naming}\n\nTry the object rather than the action — "trash" finds Delete, "shield" finds the security icon, "sparkle" finds the AI/Copilot icon.`);
        }
        const anyColorOnly = hits.some((h) => !h.family.variants?.Regular && !h.family.variants?.Filled && !(h.family.resizable || []).some((s) => s === 'Regular' || s === 'Filled'));
        const filters = [size ? `size=${size}` : '', style ? `style=${style}` : ''].filter(Boolean).join(', ');
        const header = `${hits.length} Fluent 2 icon famil${hits.length === 1 ? 'y' : 'ies'} for "${q}"${filters ? ` (${filters})` : ''} — every name below exists in @fluentui/react-icons${data.meta.package?.version ? ` ${data.meta.package.version}` : ''}:`;
        return textResult(`${header}\n\n${hits.map((c, i) => renderHit(data, c.family, i + 1, size, style)).join('\n\n')}` +
            guidanceFooter(data.guidance, { size, hasColorOnly: anyColorOnly }));
    });
}
function searchFamilies(data, query, size, style, limit) {
    const tokens = words(query);
    if (!tokens.length)
        return [];
    // "user" has to find Person, and "trash" has to find Delete. Rather than
    // bolting a bonus onto the literal score, run the whole ranking again for each
    // synonym-substituted query and keep the best result, discounted so a literal
    // hit always wins a tie.
    const variants = [{ tokens, weight: 1 }];
    tokens.forEach((t, i) => {
        for (const syn of INTENT_SYNONYMS[t] || []) {
            const swapped = [...tokens.slice(0, i), ...words(syn), ...tokens.slice(i + 1)];
            if (swapped.join(' ') !== tokens.join(' '))
                variants.push({ tokens: swapped, weight: 0.86 });
        }
    });
    const best = new Map();
    for (const v of variants.slice(0, 16)) {
        const qNorm = v.tokens.join('');
        for (const f of data.families) {
            const c = score(f, v.tokens, qNorm, size, style);
            if (!c || c.score <= 0)
                continue;
            c.score *= v.weight;
            const prev = best.get(f.base);
            if (!prev || c.score > prev.score)
                best.set(f.base, c);
        }
    }
    const scored = [...best.values()];
    scored.sort((a, b) => b.score - a.score || a.family.name.length - b.family.name.length);
    return scored.slice(0, limit);
}
