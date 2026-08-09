---
name: fluent-native
description: Build Fluent 2 UIs on native platforms — iOS (fluentui-apple, UIKit + SwiftUI), Android (fluentui-android, Views + Jetpack Compose) and Windows (WinUI 3, WinUI 2, WPF Fluent theme). Use for any Swift, Kotlin or XAML Fluent work, or to choose the right package and version for a native app.
---

# Fluent 2 on native platforms (iOS, Android, Windows)

Fluent 2 is one design language expressed by three different native libraries. The tokens rhyme; the type names, packages and framework kinds do not. **Look everything up — never guess a Swift type, a Maven coordinate or a XAML resource key.**

| Tool | Use it for |
|---|---|
| `fluent_native_component` | `{ platform, name }` → type, framework kind, import, key API, sample, a11y |
| `fluent_native_guidance` | `{ platform, section }` → generations, install, tokens, theming, typography, accessibility, cross-platform, routes, unverified |

## Step 1 — pick the framework kind before writing a line
Getting this wrong produces code that cannot compile.

| Platform | Kinds | How to tell |
|---|---|---|
| iOS | `swiftui` · `uikit` | `MSF`-prefixed types are UIKit hosts around SwiftUI controls. There is **no SwiftUI Fluent `Button`** — style a native `SwiftUI.Button` with `FluentButtonStyle`. |
| Android | `compose` (Fluent 2) · `view` (Fluent 1) | The **Kotlin package**, not the artifact, decides: `com.microsoft.fluentui.tokenized.*` = Compose; `com.microsoft.fluentui.<area>.*` = View/XML. |
| Windows | `winui3` · `winui2` · `wpf` | WinUI 3 = Windows App SDK (Win32 desktop). WinUI 2 = UWP. WPF = the in-box Fluent theme. |

## Step 2 — know the generation story (all three differ)
- **iOS — one evolving line.** Same pod (`MicrosoftFluentUI`) and same SPM product (`FluentUI`) throughout; Fluent 2 is a *version cutover at 0.13.0*, which deleted `Colors.swift`. There is **no v8/v9-style split**. Fluent-1-era controls still ship in the same package.
- **Android — two generations, one set of artifacts.** Fluent 1 (Views/XML) and Fluent 2 (Compose) live inside the *same* Maven modules; the umbrella artifact pulls in both.
- **Windows — three live stacks.** WinUI 3 (Windows App SDK) is current and is what Learn tells AI assistants to default to. **WinUI 2 (`Microsoft.UI.Xaml` 2.8.7) is maintenance-only — its last feature release was 2.8 in July 2022.** Never start a new app on it; it exists for UWP (Xbox, HoloLens, IoT), which the Windows App SDK does not support. WPF has an official Fluent theme from .NET 9 (`PresentationFramework.Fluent`) that restyles built-in controls — it adds no new control set.

Version tables, and on Windows the documented framework-choice exceptions: `fluent_native_guidance({ platform, section: 'generations' })`.

## Install
```swift
// iOS — Swift Package Manager (or pod 'MicrosoftFluentUI')
.package(url: "https://github.com/microsoft/fluentui-apple.git", from: "0.37.0")
// target dep: .product(name: "FluentUI", package: "fluentui-apple")
```
```kotlin
// Android — Gradle; umbrella pulls in Fluent 1 Views + Fluent 2 Compose
implementation("com.microsoft.fluentui:FluentUIAndroid:0.3.14")
```
```xml
<!-- Windows — WinUI 3 (current). WinUI 2 is Microsoft.UI.Xaml 2.8.7, maintenance only. -->
<PackageReference Include="Microsoft.WindowsAppSDK" Version="2.3.1" />
```
Minimums, SDK levels, Compose config and per-module versions: `section: 'install'`.

## Tokens — three tiers everywhere, three vocabularies
Every platform layers **global primitives → semantic alias tokens → per-control token sets**. Consume the alias layer; override at the tier that matches your blast radius.

```swift
// iOS: whole theme → per control type → per instance
let theme = FluentTheme(colorOverrides: [.brandBackground1: Color(hex: 0x742774)])
button.tokenSet[.backgroundColor] = .uiColor { .systemPurple }
```
```kotlin
// Android: per instance → subtree → app-wide
FluentTheme(aliasTokens = ContosoAliasTokens(), themeMode = ThemeMode.Auto) { App() }
```
```xml
<!-- Windows: XAML theme resources. Only two corner-radius tokens exist. -->
<TextBlock Foreground="{ThemeResource TextFillColorSecondaryBrush}"/>
<CornerRadius x:Key="ControlCornerRadius">4</CornerRadius>
```
- **Windows only:** `{ThemeResource}` re-evaluates on theme change — use it in styles, setters and templates. `{StaticResource}` evaluates once — use it *inside* `ThemeDictionaries`. Getting this backwards is the #1 Windows theming bug.
- **Windows has no spacing token set**, and derives brand from the user's `SystemAccentColor` rather than a fixed `#0F6CBD` ramp.

Exact names and values: `section: 'tokens'`.

## Theming, dark mode, high contrast
- **iOS** — brand via a `ColorProviding` conformance (18 required properties) applied with `FluentTheme.setSharedThemeColorProvider(...)`, or `.fluentTheme(FluentTheme(colorOverrides:))` in SwiftUI. Dark mode is automatic: every alias color is a `DynamicColor` with light/dark/darkElevated slots.
- **Android** — subclass `AliasTokens`, override the 16-step `brandColor` ramp, pass it to `FluentTheme(...)`. `ThemeMode.Auto` follows the system. **High contrast is not supported at all.**
- **Windows** — omit `RequestedTheme` so the app follows the OS. Ship explicit `Light`, `Dark` **and** `HighContrast` dictionaries, mapping the HC dictionary to the `SystemColor*` keys. Detect with `Microsoft.UI.System.ThemeSettings.HighContrast`. Materials (Mica, Mica Alt, Acrylic, Smoke) and their layering rules live in the same section.

`section: 'theming'`.

## Typography
Slot names rhyme across iOS/Android/web (`display`, `title1-3`, `body1/2(+Strong)`, `caption1/2`); the **numbers do not** — iOS `body1` is 17pt, Android `Body1` is 16sp. Windows has its own ramp (`BodyTextBlockStyle` 14, `TitleTextBlockStyle` 28, `DisplayTextBlockStyle` 68 epx) in **Segoe UI Variable**: sentence case, no italic, and Semibold — never Bold — for emphasis. Android sets no `fontFamily` at all (platform Roboto).

## Accessibility
Fluent gives you a lot for free, but the gaps are platform-specific and load-bearing:

| Platform | Free | You must do |
|---|---|---|
| iOS | Localized VoiceOver labels (~40 locales), Dynamic Type on `Label`, progress traits and values | Touch targets — there is no global minimum-target API |
| Android | Compose roles, merged `contentDescription`, drawer/sheet announcements, sp-based scaling | **48dp touch targets** (not enforced) and any high-contrast story |
| Windows | UI Automation peers, keyboard nav, names promoted from text, HC theme resolution | `AutomationProperties.Name` on images, `LabeledBy` for inputs, peers for custom controls and DirectX interop |

Then run `fluent_accessibility_checklist`. Detail: `section: 'accessibility'`.

## Cross-platform work
`fluent_native_guidance({ section: 'cross-platform' })` returns shared concepts, a web↔iOS↔Android↔Windows naming table, and an honest token-parity statement. Summary: the brand ramp and neutral greys are *identical* across web/iOS/Android, the alias layer shares names but not spelling, and Windows is the outlier on almost everything.

## Honesty rules
1. Absence from this dataset does **not** prove an API does not exist — the tools say so, and so should you.
2. `section: 'unverified'` lists exactly what the research could not confirm, per platform. Check it before asserting a version, an enum case list, or a Fluent 1 import package (several Android View imports are deliberately `null`).
3. The Fluent 2 site has **no Windows component pages** — Windows facts come from Microsoft Learn and the WinUI repo. `section: 'routes'` has all 21 native routes (React Native is employee-gated) plus the site's broken `/core/`-less in-page links.

## Always
Pick the framework kind first · look types up with `fluent_native_component` · never hardcode a value a token already names · support light, dark and (on Windows) high contrast · verify with `fluent_accessibility_checklist`.

## Learn more
| Topic | How to find |
|---|---|
| Component API + sample | MCP `fluent_native_component` |
| Versions, tokens, a11y, caveats | MCP `fluent_native_guidance` |
| WinUI 3 / WPF docs | `microsoft_docs_search(query="WinUI 3 Windows App SDK controls")` · `https://aka.ms/windev` |
| Libraries | `github.com/microsoft/` + `fluentui-apple` · `fluentui-android` · `microsoft-ui-xaml` |
| Fluent 2 design | `https://fluent2.microsoft.design` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
