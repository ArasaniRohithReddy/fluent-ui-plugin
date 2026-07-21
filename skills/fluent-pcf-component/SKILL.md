---
name: fluent-pcf-component
description: Build Power Apps Component Framework (PCF) code components with Fluent UI React v9, sharing the host React/Fluent via platform libraries and consuming the app's Fluent 2 theme via context.fluentDesignLanguage. Use for creating Fluent-themed PCF controls for canvas/model-driven apps.
---

# Fluent 2 PCF code components

Build a **React (virtual) PCF control** that shares the host's React and Fluent v9 instances via **platform libraries**. This shrinks the bundle and makes the control automatically pick up the host app's Fluent 2 theme (canvas modern themes or the model-driven refreshed look) through `context.fluentDesignLanguage`.

## Scaffold
```
pac pcf init -n HelloFluent -ns SampleNamespace -t field -fw react -npm
npm install @fluentui/react-components
```
(`-fw react` creates a *virtual* React control; requires Power Platform CLI ≥ 1.37.)

## Manifest essentials — `ControlManifest.Input.xml`
Set `control-type="virtual"` and declare React + Fluent as platform libraries:
```xml
<resources>
  <code path="index.ts" order="1" />
  <platform-library name="React"  version="16.14.0" />
  <platform-library name="Fluent" version="9.46.2" />
</resources>
```
Fluent 8 and Fluent 9 can't both be declared. Declared versions may differ from what the platform loads at runtime.

## Consume the host theme
`context.fluentDesignLanguage` exposes `tokenTheme` (Fluent v9 Theme), `typographyTokens`, `brand` (BrandVariants), and `isDarkTheme`. With Fluent v9 + platform libraries the modern theme often flows in automatically via shared React context. To force a theme or fix portaled surfaces (menus/dialogs/tooltips), wrap the tree in `FluentProvider`:
```ts
// index.ts — updateView returns a React element (virtual control renders no DOM itself)
public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
  const theme = context.fluentDesignLanguage?.tokenTheme ?? webLightTheme;
  return React.createElement(
    FluentProvider,
    { theme },
    React.createElement(HelloFluent, {
      label: context.parameters.label.raw ?? "Hello, Fluent 2!",
      onClick: () => this.notifyOutputChanged(),
    })
  );
}
```
A runnable sample lives in `assets/samples/pcf/` (ControlManifest.Input.xml, index.ts, HelloFluent.tsx).

## Steps
1. `pac pcf init … -fw react`. 2. `npm install @fluentui/react-components`. 3. Manifest: `control-type="virtual"` + React/Fluent platform libraries + input/output props. 4. `index.ts`: implement `init`/`updateView`/`getOutputs`/`destroy`; return a Fluent tree from `updateView`, wrapped in `FluentProvider` with `context.fluentDesignLanguage.tokenTheme` when present. 5. `npm start` in the harness; package into a solution (canvas/model-driven — **not** Power Pages).

## Gotchas
- Property naming is inconsistent in docs: prefer `tokenTheme` for `FluentProvider` and use optional chaining.
- Portaled Fluent v9 components (menus/dialogs/tooltips) can lose theme tokens — re-wrap them in a `FluentProvider`.
- You can't convert a standard control to virtual React in place — scaffold fresh with `-fw react`.
- React controls & platform libraries aren't supported in Power Pages.

## Learn more
| Topic | How to find |
|---|---|
| React controls + platform libraries | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries")` |
| Fluent modern theming (PCF) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming")` |
| Theming reference | `microsoft_docs_search(query="PCF context fluentDesignLanguage theming reference")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
