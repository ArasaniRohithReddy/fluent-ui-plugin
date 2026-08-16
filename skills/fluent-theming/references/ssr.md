# Server-side rendering with Fluent UI React v9

Fluent UI React v9 supports SSR, but **only if you mount three providers**. Every recipe below is transcribed from the five upstream `Concepts/Developer/Server-Side Rendering/*` pages on <https://storybooks.fluentui.dev/react/>; each section links its source.

## The rule: `RendererProvider` + `SSRProvider` + `FluentProvider`

> "For any setup using SSR, you need to provide a `RendererProvider`, `SSRProvider` and `FluentProvider` in the root of your app. If these providers are not added, there will be issues when hydrating."
> — [Basic setup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-basic-setup--docs)

Each one does a distinct job, which is why dropping any of them breaks something different:

| Provider | Job | Symptom if missing |
|---|---|---|
| `RendererProvider renderer={createDOMRenderer()}` | Gives Griffel a per-request renderer so server CSS can be collected and the client can rehydrate the same class names | Styles missing on first paint; duplicated/conflicting style rules after hydration |
| `SSRProvider` | Makes `useId` deterministic across server and client, and makes `useIsSSR()` return `true` during the server pass | `aria-*` id mismatches, React hydration warnings |
| `FluentProvider theme={…}` | Emits the theme's CSS variables | Unthemed (unstyled-looking) markup |

**Import all of them from `@fluentui/react-components`.** They are re-exported there — do *not* import `createDOMRenderer` / `RendererProvider` / `renderToStyleElements` from `@griffel/react` in app code, or you can end up with two Griffel instances.

`renderToStyleElements(renderer)` turns the collected rules into `<style>` elements you inject into `<head>`.

### Baseline (Express)

```tsx
import express from 'express';
import ReactDOMServer from 'react-dom/server';
import {
  createDOMRenderer,
  RendererProvider,
  renderToStyleElements,
  SSRProvider,
  FluentProvider,
  webLightTheme,
} from '@fluentui/react-components';

const server = express();

server.get('/', (req, res) => {
  const renderer = createDOMRenderer(); // 👈 one renderer per request

  const html = ReactDOMServer.renderToString(
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <FluentProvider theme={webLightTheme}>
          <App />
        </FluentProvider>
      </SSRProvider>
    </RendererProvider>,
  );

  const style = ReactDOMServer.renderToStaticMarkup(<>{renderToStyleElements(renderer)}</>);

  res.write(`<!DOCTYPE html><html><head>${style}</head><body><div id="root">${html}</div></body></html>`);
  res.end();
});

server.listen(3000, 'localhost');
```
Source: [Basic setup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-basic-setup--docs)

## Next.js — pages router

Two files. `_document.tsx` creates the renderer and flushes the styles; `_app.tsx` receives that renderer and mounts the three providers.

**`pages/_document.tsx`**
```tsx
import { createDOMRenderer, renderToStyleElements } from '@fluentui/react-components';
import Document, { Html, Head, Main, NextScript, DocumentContext } from 'next/document';

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const renderer = createDOMRenderer(); // 👈 renderer used for SSR
    const originalRenderPage = ctx.renderPage;

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: App =>
          function EnhancedApp(props) {
            return <App {...props} renderer={renderer} />; // 👈 hand the renderer to _app
          },
      });

    const initialProps = await Document.getInitialProps(ctx);
    const styles = renderToStyleElements(renderer);

    return { ...initialProps, styles: (<>{initialProps.styles}{styles}</>) };
  }

  render() {
    return (
      <Html>
        <Head />
        <body><Main /><NextScript /></body>
      </Html>
    );
  }
}

export default MyDocument;
```

**`pages/_app.tsx`**
```tsx
import {
  createDOMRenderer, FluentProvider, GriffelRenderer, SSRProvider, RendererProvider, webLightTheme,
} from '@fluentui/react-components';
import type { AppProps } from 'next/app';

type EnhancedAppProps = AppProps & { renderer?: GriffelRenderer };

function MyApp({ Component, pageProps, renderer }: EnhancedAppProps) {
  return (
    // 👇 accepts the renderer from <Document />, or creates one — this also triggers client rehydration
    <RendererProvider renderer={renderer || createDOMRenderer()}>
      <SSRProvider>
        <FluentProvider theme={webLightTheme}>
          <Component {...pageProps} />
        </FluentProvider>
      </SSRProvider>
    </RendererProvider>
  );
}

export default MyApp;
```
Source: [Next.js pages setup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-next-js-pages-setup--docs)

## Next.js ≥13 — appDir router

appDir needs one extra piece: an SWC plugin that stamps `'use client'` onto the library, because Fluent v9 and Griffel are client-side.

```shell
npm install @fluentui/react-components fluentui-next-appdir-directive
```

**`app/providers.tsx`**
```tsx
'use client';

import * as React from 'react';
import {
  FluentProvider, teamsDarkTheme, SSRProvider, RendererProvider, createDOMRenderer, renderToStyleElements,
} from '@fluentui/react-components';
import { useServerInsertedHTML } from 'next/navigation';

export function Providers({ children }: { children: React.ReactNode }) {
  const [renderer] = React.useState(() => createDOMRenderer());
  const didRenderRef = React.useRef(false);

  useServerInsertedHTML(() => {
    if (didRenderRef.current) return;   // 👈 flush the stylesheet exactly once
    didRenderRef.current = true;
    return <>{renderToStyleElements(renderer)}</>;
  });

  return (
    <RendererProvider renderer={renderer}>
      <SSRProvider>
        <FluentProvider theme={teamsDarkTheme}>{children}</FluentProvider>
      </SSRProvider>
    </RendererProvider>
  );
}
```

**`app/layout.tsx`** — wrap `children` in `<Providers>`.

**`next.config.js`** — register the plugin with **both** paths:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    swcPlugins: [['fluentui-next-appdir-directive', { paths: ['@griffel', '@fluentui'] }]],
  },
};

module.exports = nextConfig;
```
`paths: ['@griffel', '@fluentui']` is not optional — omitting `@griffel` leaves Griffel's hooks running as server components and the build fails. Plugin repo: <https://github.com/sopranopillow/fluentui-nextjs-appdir-plugin>.

Source: [Next.js appDir setup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-next-js-appdir-setup--docs)

### Strict mode
> "To avoid strict mode hydration issues, you can disable strict mode in your Next.js app by adding the following configuration to your `next.config.js` file: `module.exports = { reactStrictMode: false }`"
> — [Quick start](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-quick-start--docs)

The known strict-mode bugs are React-18-only and *"will not stop the rest of your app from running"* — turning strict mode off is a workaround, not a requirement.

## Remix / React Router 7

Vite-based, so the wiring is plugins + an insertion point rather than a `_document`.

**`vite.config.ts`**
```ts
import { cjsInterop } from 'vite-plugin-cjs-interop';
import griffel from '@griffel/vite-plugin';

export default defineConfig(({ command }) => ({
  plugins: [
    reactRouter(), // or remix()
    tsconfigPaths(),
    cjsInterop({ dependencies: ['@fluentui/react-components'] }), // until FUI is ESM
    command === 'build' && griffel(),                              // build-time style optimisation
  ],
  ssr: { noExternal: ['@fluentui/react-icons'] },                  // required for icons under SSR
}));
```
Dev deps: `npm i vite-plugin-cjs-interop @griffel/vite-plugin -D`.

**`app/root.tsx`** — add the insertion point in `<head>` and wrap the tree:
```tsx
<meta name="fluentui-insertion-point" content="fluentui-insertion-point" />
…
<FluentProvider theme={webLightTheme}>{children}</FluentProvider>
```

**`app/entry.client.tsx`** — reveal the entries first (`npx react-router reveal` / `npx remix reveal`):
```tsx
import { createDOMRenderer, RendererProvider, SSRProvider } from '@fluentui/react-components';

hydrateRoot(
  document,
  <StrictMode>
    <RendererProvider renderer={createDOMRenderer()}>
      <SSRProvider>
        <HydratedRouter />
      </SSRProvider>
    </RendererProvider>
  </StrictMode>,
);
```

**`app/entry.server.tsx`** — same two providers around `ServerRouter`/`RemixServer`, plus a `PassThrough` transform that replaces the insertion-point `<meta>` with `renderToStyleElements(renderer)` output on the first chunk that contains it.

Troubleshooting straight from the page:

| Error | Fix |
|---|---|
| `Text content does not match server-rendered HTML` | Style injection in `entry.server.tsx` is wrong |
| `No "exports" main defined in node_modules/@fluentui/react-icons/package.json` | `ssr: { noExternal: ['@fluentui/react-icons'] }` |
| `Cannot use import statement outside a module` | `cjsInterop({ dependencies: ['@fluentui/react-components'] })` |
| `@fluentui/react-provider: There are conflicting ids in your DOM.` (<https://aka.ms/fluentui-conflicting-ids>) | Dev-only, caused by StrictMode double rendering — *"can be safely ignored as it doesn't affect production builds"* |

Source: [React Router 7 and Remix setup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-react-router-7-and-remix-setup--docs). For production, add [`@griffel/vite-plugin`](https://griffel.js.org/react/build-optimization/with-vite) (the upstream page links a stale `ahead-of-time-compilation/with-vite` URL that now 404s).

## Portals: `defaultOpen` is a hydration error

> "React does not support hydration for portals ([facebook/react#13097](https://github.com/facebook/react/issues/13097))… Components like `Menu` or `Popover` have a `defaultOpen` prop that open the positioned surface on mount. These components are rendered with React portals. In SSR using the `defaultOpen` on server render will cause a hydration error."
> — [Limitations with Portals](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-server-side-rendering-limitations-with-portals--docs)

Fix: control `open` yourself and only open **after** hydration, using `useIsSSR()`.

```tsx
import { Menu, MenuTrigger, MenuList, MenuItem, MenuPopover, useIsSSR, Button } from '@fluentui/react-components';

const DefaultOpenMenu = () => {
  const [open, setOpen] = React.useState(false);
  const isSSR = useIsSSR();               // 👈 true during the server pass

  React.useEffect(() => {
    if (!isSSR) setOpen(true);            // 👈 open only on the client
  }, [isSSR]);

  return (
    <Menu open={open} onOpenChange={(e, data) => setOpen(data.open)}>
      <MenuTrigger><Button>SSR Default open</Button></MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem>New</MenuItem>
          <MenuItem>Open Folder</MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
};
```
The same pattern applies to any portalled surface you want visible immediately: `Popover`, `Dialog`, `Drawer`, `Tooltip`. `useIsSSR()` needs `SSRProvider` above it — another reason all three providers are mandatory.

## Checklist

- [ ] `createDOMRenderer()` called **once per request** on the server (never module-scope on a shared server)
- [ ] `RendererProvider` → `SSRProvider` → `FluentProvider` nested in that order at the root, on **both** server and client entries
- [ ] All four SSR symbols imported from `@fluentui/react-components`
- [ ] `renderToStyleElements(renderer)` output lands in `<head>` before the app markup
- [ ] No `defaultOpen` on portalled components; use `useIsSSR()` + effect instead
- [ ] Next.js appDir: SWC plugin registered with `paths: ['@griffel', '@fluentui']`
- [ ] Vite: `ssr.noExternal` includes `@fluentui/react-icons`; `@griffel/vite-plugin` enabled for builds
