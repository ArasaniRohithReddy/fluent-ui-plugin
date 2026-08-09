# Host platforms — SPFx, PCF/Dynamics, Office, Teams

`fluent_v8_guidance section=platforms` returns the full matrix (24 rows) plus per-host detail for SPFx, PCF, Dynamics 365, Office Add-ins and Teams, including three commonly repeated myths it corrects.

**React peer ranges by line:** v8 `>=16.8.0 <20.0.0` · v9 `>=16.14.0 <20.0.0` · v7 React 16 · Northstar `0.6x` → 16/17 and `0.70+` → React 18 only. Hosts pin React themselves, and a mismatch fails *silently at runtime*.

## SPFx

- **SPFx 1.18 → 1.23.2** scaffold `@fluentui/react` **v8**; **1.17 and earlier** use `office-ui-fabric-react` v7. Both package names are supported. Use the version the Yeoman generator installed — Microsoft states this is *"the only approach that is officially supported"* in SPFx.
- Sass: `@import '~@fluentui/react/dist/sass/_References.scss';` (legacy: `~office-ui-fabric-react/dist/sass/_References.scss`).
- **React is pinned per SPFx release** and a mismatch fails *silently at runtime*: 1.16 → 1.23.2 all pin **17.0.1**; 1.12.1–1.15.x pin 16.13.1. Install with `--save-exact`.
- **There is no Microsoft statement supporting v9 on SPFx** — the Fluent-integration doc (Mar 2026) and the compatibility matrix (Jul 2026) name only v8/OUFR. Treat v8 as the only supported option on SPFx.
- `@microsoft/sp-office-ui-fabric-core` is **not a component library** — it's SPFx's scoped subset of Fabric Core Sass (typography, layout, colors, themes, localization; **no animations, no icons**). Microsoft recommends uninstalling it if you use Fluent UI React (bundle size).
- `setLayerHostSelector` is the standard fix for portalled content landing in the wrong place (see `accessibility.md`).

## PCF / Dynamics 365

Virtual controls declare a platform library in the manifest:

```xml
<resources>
  <code path="index.ts" order="1" />
  <platform-library name="React" version="16.14.0" />
  <platform-library name="Fluent" version="8.121.1" />
</resources>
```

`name` may only be `React` or `Fluent`. The supported **Fluent 8** rungs are `8.29.0` and `8.121.1`. **Fluent 8 and Fluent 9 cannot both be declared in one manifest.** React is always `16.14.0` in the manifest even though model-driven runtime loads 17.0.2 — don't write `17.x` there. (React controls and platform libraries aren't supported in Power Pages.)

For a Fluent 2 / v9 PCF control, use the `fluent-pcf-component` skill instead.

## Office Add-ins and Teams

Office Add-ins are the **exception**: Microsoft scaffolds and recommends **v9** there. Teams' own line was Northstar (`@fluentui/react-northstar`), which reached **EOL July 2025**; today's recommendation is v9 with `teamsLightTheme`. Call `fluent_v8_guidance section=platforms` for the per-host evidence, theming snippets and version pins.

## Primary sources

| Topic | How to find |
|---|---|
| SPFx + Fluent UI (which version, imports, Sass) | `microsoft_docs_fetch(url="https://learn.microsoft.com/sharepoint/dev/spfx/fluent-ui-integration")` |
| SPFx React / Node / TypeScript compatibility pins | `microsoft_docs_fetch(url="https://learn.microsoft.com/sharepoint/dev/spfx/compatibility")` |
| PCF platform libraries (Fluent 8 vs 9) | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-apps/developer/component-framework/react-controls-platform-libraries")` |
