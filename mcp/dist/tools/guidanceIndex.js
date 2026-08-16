/**
 * Response-size guards for the guidance tools.
 *
 * A single `all` call used to return 506,264 characters (~127k tokens) — enough
 * to blow most context windows on its own. The pattern that already works in
 * this codebase (fluent_v8_guidance) is to answer `all` with a small INDEX that
 * says what exists and how big it is, and let the caller request one entry.
 * These helpers make that pattern reusable and add a per-response character cap
 * so an individual entry can never silently dominate a context window either.
 */
/**
 * Cap for a single design-language topic. Chosen from the real distribution
 * rather than a round number: two topics are outliers (data-usage-sharing
 * 67,302 and responsible-ai 56,327 characters) and every other topic is at or
 * below 27,228, so this catches exactly the runaways and returns everything
 * else whole. Truncating ordinary topics would trade one defect for another.
 */
export const TOPIC_MAX_CHARS = 32000;
/**
 * Cap for tools whose single sections are already bounded and have no
 * structured outline to fall back to. The largest real section is the Figma
 * server matrix at 18,189 pretty-printed characters, so the guard sits just
 * above it: truncating a legitimate one-section request would trade one defect
 * for another, while a genuine runaway is still caught.
 */
export const SECTION_MAX_CHARS = 20000;
/** One-line description of an arbitrary value, for index rows. */
export function describeValue(value) {
    if (Array.isArray(value))
        return `${value.length} entries`;
    if (value && typeof value === 'object')
        return `${Object.keys(value).length} keys`;
    if (value === undefined)
        return 'not present';
    return typeof value;
}
/** Serialized size of a value, in characters. */
export function sizeOf(value) {
    try {
        return JSON.stringify(value)?.length ?? 0;
    }
    catch {
        return 0;
    }
}
/**
 * Build the index response returned for `all`. Reports the total size that was
 * avoided, then one row per entry so the caller can pick precisely.
 */
export function buildIndex(entries, opts) {
    const totalChars = Object.values(entries).reduce((n, e) => n + (typeof e.chars === 'number' ? e.chars : 0), 0);
    return JSON.stringify({
        index: true,
        what: opts.what,
        entryCount: Object.keys(entries).length,
        fullPayloadChars: totalChars,
        reason: `Returning everything would be about ${totalChars.toLocaleString('en-US')} characters, ` +
            'large enough to displace the rest of the conversation. This is the index instead.',
        requestOne: opts.requestOne,
        agentInstruction: 'This is an INDEX, not content. Do not answer from it and do not infer any entry\'s content from its ' +
            'name or size — call the tool again for the one entry you need.',
        ...(opts.extra ?? {}),
        [opts.entriesKey ?? 'entries']: entries,
    }, null, 2);
}
/**
 * Cap a response. Over the cap the payload is cut and clearly labelled, so a
 * model can never mistake a truncated fragment for the whole answer.
 */
export function capped(body, maxChars, hint) {
    if (!Number.isFinite(maxChars) || maxChars <= 0 || body.length <= maxChars)
        return body;
    return (`TRUNCATED: this response is ${body.length.toLocaleString('en-US')} characters, above the ${maxChars.toLocaleString('en-US')}-character cap.\n` +
        `${hint}\n` +
        'Raise maxChars if the whole payload really is needed.\n' +
        `--- first ${maxChars.toLocaleString('en-US')} characters (deliberately cut; this fragment will NOT parse as JSON) ---\n` +
        body.slice(0, maxChars) +
        '\n--- end of truncated output ---');
}
