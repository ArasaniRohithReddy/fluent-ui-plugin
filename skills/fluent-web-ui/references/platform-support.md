# Supported platforms & browser support matrix

Short, factual, and the answer to "can we ship this?". Sources: [Supported platforms](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-supported-platforms--docs) and [Browser support matrix](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-browser-support-matrix--docs).

---

## The one-paragraph answer

> "Fluent UI supports the **latest, stable releases** of all major browsers and platforms."
> "Fluent UI fully supports **React versions 17, 18 and 19**."
> "Fluent UI supports the **three latest *major* versions of TypeScript**. Older TypeScript versions might still work, but they are outside the supported range." — the contract is [`docs/react-v9/contributing/rfcs/shared/types-contract.md`](https://github.com/microsoft/fluentui/blob/master/docs/react-v9/contributing/rfcs/shared/types-contract.md).

Per-React-version *package* floors (9.66.0 for React 18, 9.72.2 for React 19) are in `references/package-maturity.md` — "supported" and "supported from which release" are different questions.

---

## Two matrices, not one

**Full support** — everything works, best bundle size and performance:

| | Edge | Firefox | Chrome | Safari | Opera | Internet Explorer |
|---|---|---|---|---|---|---|
| Desktop | ≥ 84 | ≥ 75 | ≥ 84 | ≥ 14.1 | ≥ 73 | **Not Supported** |

| | Safari on iOS | Chrome for Android | Samsung |
|---|---|---|---|
| Mobile | ≥ 14.5 | ≥ 84 | ≥ 16 |

**Partial support** — works *only if you transpile and polyfill*:

| | Edge | Firefox | Chrome | Safari | Opera | Internet Explorer |
|---|---|---|---|---|---|---|
| Desktop | ≥ 79 | ≥ 69 | ≥ 79 | ≥ 13.1 | ≥ 64 | **Not Supported** |

| | Safari on iOS | Chrome for Android | Samsung |
|---|---|---|---|
| Mobile | ≥ 13.4 | ≥ 79 | ≥ 14 |

**IE11 is not supported at any level.** If that is a requirement, Fluent 2 / v9 is not the answer.

---

## What actually breaks between the two matrices

Two categories, and they fail very differently:

**Unsupported CSS — degrades, does not crash.**
> "The absence of these features will not crash consumer applications, it will simply **degrade the user interface**."

1. [Flex gap](https://caniuse.com/flexbox-gap)
2. [CSS `min`, `max`, `clamp`](https://caniuse.com/css-math-functions)
3. [CSS `revert` value](https://caniuse.com/css-revert-value)

**Unsupported ECMAScript — crashes.**
> "the use of these ES2020 features **results in the application crashing** on the listed browsers below."

1. Nullish coalescing (`??`)
2. Optional chaining (`?.`)

> "Fluent UI will be targeting **ES2020** and thus will be shipping an ES2020 compliant code which will be fully compatible with the full browser support matrix."

So: **if you support anything below the full matrix, you must transpile `@fluentui/*` yourself.** Many bundler configs exclude `node_modules` from transpilation by default — that default is the bug.

## Polyfills are your job, on purpose

> "By default Fluent UI will not be providing polyfills for features we expect our full browser support matrix to already support. The only instance that a polyfill may be provided is when Fluent UI's use of a feature causes an application to crash on the partial support browser matrix."

The stated reasons: no unnecessary overhead for modern-browser users, no duplicated polyfills across library and app, and the freedom to ship a legacy bundle plus a lighter modern one.

## Stability of the matrix itself

> "Fluent UI will follow a **yearly audit process** to evaluate and update the current browser support matrix." Contributors *"develop against the partial browser support matrix"* and *"reserve the right to use features that fall in between the partial and full browser support matrices (like flex gap) as long as they don't result in applications crashing."*

Practical read: features between the two matrices **will** keep appearing. Pin your own floor to the full matrix if you can.

---

## Context: what v9 is

[Introduction](https://storybooks.fluentui.dev/react/?path=/docs/concepts-introduction--docs): Fluent UI React Components is *"a set of UI components and utilities resulting from an effort to converge the set of React based component libraries in production today: `@fluentui/react` and `@fluentui/react-northstar`"* — i.e. v8 (Fabric) and v0 (Northstar) converge into v9. Its four stated standards are **customizable** (theme/brand on top of Fluent defaults), **performance**, **bundle size**, and **accessibility** — *"WCAG 2.1 compliant and tested by trusted testers"* — plus *"Design to Code: Stay up to date with Fluent Design Language changes via Design Tokens."*

Migration from either predecessor: the `fluent-migration` and `fluent-v8` skills.

## Environments that need extra configuration

Not a browser question, but the same "will it work here?" family — [Advanced configuration](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-advanced-configuration--docs):

| Environment | What to do |
|---|---|
| **iframe / child window** | Components need the *right* `window`/`document`. Configure a Griffel renderer with [`createDOMRenderer`](https://griffel.js.org/react/api/create-dom-renderer) and pass `targetDocument` to both `RendererProvider` and `FluentProvider`. |
| **Content Security Policy** | Pass the `nonce` via `styleElementAttributes` on the renderer. |
| **Media-query ordering** | Griffel sorts styles deterministically; Fluent ships **no** opinionated media-query order. Supply `compareMediaQueries` (same signature as `Array.prototype.sort`) — e.g. [`sort-css-media-queries`](https://github.com/dutchenkoOleg/sort-css-media-queries) for mobile-first. |
| **Two apps with `FluentProvider` on one page** | ID collisions and lost styling ([microsoft/fluentui#26496](https://github.com/microsoft/fluentui/pull/26496)). React 18+: set `identifierPrefix` on [`createRoot`](https://react.dev/reference/react-dom/client/createRoot#parameters). React 16/17: wrap `FluentProvider` in `IdPrefixProvider`. |
| **Server-side rendering** | `fluent-theming` → `references/ssr.md`. |
| **Shadow DOM** | `references/web-components-interop.md`. |
