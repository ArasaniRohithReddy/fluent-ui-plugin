# HelloFluent — illustrative PCF code component (Fluent UI React v9)

A **minimal, teaching-oriented** Power Apps Component Framework (PCF) *virtual* (React)
control that renders a Fluent 2 card + button and follows the host app's Fluent theme.
It is an **illustration, not a full build** — the standard scaffolding files
(`package.json`, `tsconfig.json`, `*.pcfproj`, `generated/ManifestTypes.d.ts`) are
produced by the Power Platform CLI and are intentionally omitted here.

## Files

| File | Role |
| --- | --- |
| `ControlManifest.Input.xml` | `control-type="virtual"` + `platform-library` for React & Fluent; declares `label` (bound text) and `clickCount` (bound number). |
| `index.ts` | `ReactControl`: `init` → `updateView` (returns a React element wrapped in `FluentProvider` using the host theme) → `getOutputs` → `destroy`. |
| `HelloFluent.tsx` | Tiny Fluent v9 component: `Card` + `Text` + primary `Button`, styled with Fluent 2 design `tokens`. |

## Scaffold a real project

```powershell
# Power Platform CLI >= 1.37; -fw react creates a virtual React control
pac pcf init -n HelloFluent -ns SampleNamespace -t field -fw react -npm
npm install @fluentui/react-components   # shared with the platform at runtime via platform-library
npm start                                 # test in the harness
```

Then drop these three files into the generated project (replacing the defaults) and
build. Package into a solution for **canvas** or **model-driven** apps.
> Not supported in **Power Pages** (React controls & platform libraries are canvas/
> model-driven only).

## How the Fluent 2 theming works

- The `platform-library` entries make the control reuse the host's **React + Fluent v9**,
  so it shares the same React context that carries the modern theme tokens.
- `index.ts` reads `context.fluentDesignLanguage?.tokenTheme` (falling back to
  `webLightTheme`/`webDarkTheme`) and passes it to `FluentProvider`, so the card matches
  the app's Fluent 2 theme automatically.
- `HelloFluent.tsx` styles itself with `tokens.*` (colors, spacing, radius, typography)
  instead of hardcoded values, so it re-themes for free.

Docs:
- React controls & platform libraries — <https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries>
- Style components with modern theming — <https://learn.microsoft.com/power-apps/developer/component-framework/fluent-modern-theming>
- Theming API (`context.fluentDesignLanguage`) — <https://learn.microsoft.com/power-apps/developer/component-framework/reference/theming>
