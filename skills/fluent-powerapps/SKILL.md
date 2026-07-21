---
name: fluent-powerapps
description: Apply Fluent 2 in Power Apps canvas apps with modern controls and modern themes. Use when building or restyling canvas apps to match Fluent 2 — enabling modern controls, mapping classic→modern controls, and setting App.Theme from a brand/seed color.
---

# Fluent 2 in Power Apps (canvas)

Power Apps canvas apps ship **modern controls** and **modern themes** built on the **Fluent 2** design system. Turning them on swaps the studio palette to Fluent-styled controls and unlocks a **Themes** pane that drives color, typography, borders, and shadows from `App.Theme`.

## Enable it
App → **Settings ▸ Updates ▸ New** → toggle **Modern controls and themes** to **On**. Classic controls move to the *Classic* / *Classic icons* categories.

## Classic → modern (Fluent 2) control mapping
| Modern control | Fluent 2 (React v9) | Watch out |
|---|---|---|
| Button | `Button` | `Appearance` = Primary/Secondary/Outline/Subtle/Transparent |
| Text input | `Input` | **OnChange fires on blur**, not per keystroke — read `.Text` directly for live search |
| Number input | `SpinButton` | OnChange on blur + step clicks |
| Toggle | `Switch` | Fluent renamed Toggle→Switch (`Checked`, `OnCheck`/`OnUncheck`) |
| Dropdown / Combo box | `Dropdown` / `Combobox` | Combobox `SelectMultiple` defaults true |
| Date picker | `DatePicker` | honors format + `DateTimeZone` |
| Radio | `RadioGroup`/`Radio` | View mode is read-only, not disabled |
| Slider | `Slider` | `Value`→`Default`, `Layout`→`LayoutDirection` |
| Tab list | `TabList`/`Tab` | new `Appearance` |
| Info button / Icon | `InfoLabel` / Fluent System Icons | `Style`→`IconStyle` (Outline/Filled) |
| Table (preview) | `Table`/`DataGrid` | preview |

Mappings are conceptual (same Fluent 2 language/behavior). The set grows ~monthly — verify against the modern-controls reference.

## Theming (modern themes)
Themes expose a **16-slot brand ramp**, a **Font**, and a **Name**, all reachable in Power Fx via `App.Theme` (e.g. `Button.Fill = App.Theme.Colors.Primary`). Create with **Add a theme ▸ Create custom theme** (seed color, font, torsion, vibrancy, per-slot overrides) or **Paste theme** (YAML).

```yaml
Themes:
  Corporate Brand:
    Font: "'Segoe UI', 'Open Sans', sans-serif"
    BasePaletteColor: '#0f6cbd'   # Fluent 2 communication blue seed
    HueTorsion: 0                 # -100..100 (cool..warm)
    Vibrancy: 10                  # -100..100 (muted..vivid)
    ColorOverrides:               # optional; override only what you must
      Base: '#0f6cbd'
      Darker10: '#115ea3'
```
Leave **Lock primary color (preview)** off so the ramp stays WCAG-optimized. Use the `fluent_generate_theme` MCP tool to derive an accessible ramp from a brand hex.

## Steps
1. Enable modern controls & themes. 2. Rebuild UI from modern controls. 3. Open **Themes**, pick or create/paste a theme (seed = brand). 4. Confirm `App.Theme` is set; reference `App.Theme.Colors.*` in Power Fx. 5. Test WCAG 2.1 AA on desktop + mobile.

## Gotchas
- OnChange on text/number inputs fires on blur — live logic must read the output property.
- Applying a modern theme to *classic* controls only wires Power Fx variables; they won't look Fluent.
- Built-in themes can't be edited/deleted — copy their YAML first.
- Preview surface: controls/props change monthly.

## Learn more
| Topic | How to find |
|---|---|
| Modern controls overview | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-apps/maker/canvas-apps/controls/modern-controls/overview-modern-controls")` |
| Modern theming | `microsoft_docs_fetch(url="https://learn.microsoft.com/power-apps/maker/canvas-apps/controls/modern-controls/modern-theming")` |
| Control reference / updates | `microsoft_docs_search(query="Power Apps modern controls reference")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
