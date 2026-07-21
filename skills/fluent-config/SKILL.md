---
name: fluent-config
description: Honor optional user design presets (fluent.config.json) and persistent agent memory (.fluent/memory.json) when building or adopting Fluent 2 — brand, theme, typography, shape, size/density, accessibility, icons, targets, migration, and content map to concrete Fluent 2 tokens/props. Precedence is config > memory decision > built-in default; fully zero-config (works with no file). Use at the START of any task to load presets, make the one-time first-run offer, and record design decisions.
---

# Fluent 2 preset config + agent memory

Two **optional** files let users *declare* design preferences and let agents *remember* design context — without ever being required:

| File | Author | Content |
|---|---|---|
| `fluent.config.json` (project root) | **User** (hand-edited / scaffolded once) | Declarative *intent* — the presets below. Validated by [`assets/schema/fluent.config.schema.json`](../../assets/schema/fluent.config.schema.json). |
| `.fluent/memory.json` (project root) | **Agent** (read + append) | The *resolved effective* presets **+** an append-only log of clarified design decisions, so answers are never re-asked. |

**Zero-config always works.** With no config and no memory, every field resolves to a real Fluent 2 default (the stock `webLightTheme` look). Presets only *refine* defaults — they never gate a build. Resolvers **never throw** on missing/empty/partial files: absent simply means "use the next source down".

**Precedence (first match wins):** explicit `fluent.config.json` value → recorded `.fluent/memory.json` decision → built-in Fluent 2 default. A runtime MCP tool argument (e.g. `brandColor` on `fluent_generate_theme`) overrides all three for that one call.

## `fluent.config.json` fields → Fluent 2 mapping

Every field is optional; an empty `{}` is valid. `preferences` is the only object that allows extra keys.

### `brand` — the theme seed
| Field | Default | Drives (Fluent 2) |
|---|---|---|
| `brand.color` (hex) | `#0f6cbd` | Becomes **`BrandVariants` slot 80**; seeds the 16-slot ramp via `fluent_generate_theme` → `createLightTheme`/`createDarkTheme`. Resolves `colorBrandBackground`, `colorBrandForeground1`, `colorCompoundBrandForeground1`, `colorBrandStroke1`, … Omit → Fluent default brand (`webLightTheme`). |
| `brand.name` (JS id) | `brand` | Exported theme variable name (matches `fluent_generate_theme` `name`), e.g. `contosoLightTheme`. |
| `brand.ramp` (10…160 → hex) | — | Explicit **`BrandVariants`** override; all 16 slots replace the generated ramp, a partial set patches individual `--colorBrandNN` slots. |

### `theme` — color scheme
| Field | Values | Default | Drives |
|---|---|---|---|
| `theme.mode` | `light` · `dark` · `system` | `light` | `light`→`createLightTheme`/`webLightTheme`; `dark`→`createDarkTheme`/`webDarkTheme`; `system`→`prefers-color-scheme`. |
| `theme.base` | `web` · `teams` | `web` | `web`→`webLightTheme`/`webDarkTheme`; `teams`→`teamsLightTheme`/`teamsDarkTheme`/`teamsHighContrastTheme`. |
| `theme.highContrast` | boolean | `false` | Wire up `teamsHighContrastTheme` (the `semanticHighContrast` values) + `@media (forced-colors: active)`. |

### `typography`
| Field | Default | Drives |
|---|---|---|
| `typography.fontFamily` | Segoe UI stack | Overrides **`fontFamilyBase`** (whole type ramp). |
| `typography.monospaceFontFamily` | Consolas stack | Overrides `fontFamilyMonospace`. |
| `typography.baseSize` (10–20) | `14` | Body size → **`fontSizeBase300` (14px)**; anchors the `fontSizeBase*` ramp. |
| `typography.scale` (0.75–1.5) | `1` | **Advisory** multiplier — Fluent's ramp is fixed/discrete, so apply app-side via `makeStyles`, not a native token. |

### `shape` — corner radius (preset → token)
`sharp`=`borderRadiusNone` (0) · `small`=`borderRadiusSmall` (2px) · `medium`=`borderRadiusMedium` (**4px, control default**) · `large`=`borderRadiusLarge` (6px) · `xlarge`=`borderRadiusXLarge` (**8px, card default**) · `pill`=`borderRadiusCircular` (9999px).

| Field | Default | Drives |
|---|---|---|
| `shape.cornerRadius` | `medium` | Global roundness; used for controls when `control` is omitted. |
| `shape.control` | `medium` (4px) | Interactive controls. Maps to the Fluent v9 `Button` **`shape` prop**: `sharp`→`square`, `pill`→`circular`, else `rounded` + the mapped `borderRadius*`. |
| `shape.card` | `xlarge` (8px) | Cards / large surfaces / popovers. |

### `density` — size + spacing
| Field | Values | Default | Drives |
|---|---|---|---|
| `density.controlSize` | `small` · `medium` · `large` | `medium` | Component **`size` prop** (Button, Input, Dropdown…). Heights ≈ small 24 / medium 32 / large 40px. |
| `density.spacing` | `compact` · `comfortable` · `spacious` | `comfortable` | Layout gaps from spacing tokens: `compact`≈`spacingVerticalS`(8)/`spacingHorizontalSNudge`(6); `comfortable`≈`spacing*M`(12); `spacious`≈`spacingVerticalL`(16)/`spacingHorizontalXL`(20). No single Fluent density prop — realize it via `size` + spacing tokens. |

### `accessibility`
| Field | Values | Default | Standard / drives |
|---|---|---|---|
| `accessibility.targetLevel` | `AA` · `AAA` | `AA` | WCAG 2.2 target. Fluent meets/exceeds AA by default. |
| `accessibility.minTargetSize` | `24` · `44` | `24` | 24 = WCAG 2.5.8 (AA); 44 = WCAG 2.5.5 (AAA). Drives control `size` / min hit-area. |
| `accessibility.minContrast` | 1–21 | `4.5` | Text — WCAG 1.4.3 (AA 4.5:1) / 1.4.6 (AAA 7:1). Checked on `colorNeutralForeground*` / `colorBrandBackground`. |
| `accessibility.minContrastLargeText` | 1–21 | `3` | Large text — WCAG AA 3:1. |
| `accessibility.minContrastNonText` | 1–21 | `3` | Icons / borders / focus — WCAG 1.4.11 (3:1). |
| `accessibility.reducedMotion` | `respect` · `reduce` · `allow` | `respect` | Honor `prefers-reduced-motion`; maps to `duration*`/`curve*` (reduced → near-zero / none). |
| `accessibility.forcedColors` | `respect` · `off` | `respect` | Support `@media (forced-colors: active)` + `semanticHighContrast`. |

### `iconStyle`, `targets`, `migration`, `content`
| Field | Values | Default | Drives / routes to |
|---|---|---|---|
| `iconStyle` | `regular` · `filled` | `regular` | `@fluentui/react-icons` name suffix — `Home24Regular` vs `Home24Filled`. Regular = wayfinding; Filled = selected/emphasis. |
| `targets` | array of `web-react` · `web-components` · `powerbi` · `powerapps` · `powerpages` · `pcf` | `["web-react"]` | `web-react`/`web-components`→`fluent_generate_code`; `powerbi`→`fluent_generate_powerbi_theme`/`fluent_scaffold_pbip`; `powerapps`/`powerpages`/`pcf`→`fluent_powerplatform_guidance`. |
| `migration.from` | `fluent-v8` · `mui` · `bootstrap` · `antd` · `chakra` · `css` · `none` | `none` | `fluent_migration_guidance` scenario: `fluent-v8`→`v8-to-v9`; `mui`/`bootstrap`/`antd`/`chakra`→`from-design-system`; `css`→`hardcoded-to-tokens`; `none`→greenfield. |
| `migration.strategy` | `incremental` · `side-by-side` · `greenfield` | `incremental` | `incremental`/`side-by-side` = `FluentProvider` at a subtree boundary, migrate screen-by-screen; `greenfield` = fresh build. |
| `content.capitalization` | `sentence` · `title` | `sentence` | Label/heading/button casing — sentence-case for Windows/Android/web; title-case for iOS/macOS. |
| `content.voice` | freeform | — | Tone notes for generated copy (e.g. "friendly, concise, second person, active voice"). |

`preferences` (open object) = escape hatch for team presets the schema doesn't cover; `notes` = freeform prose.

## `.fluent/memory.json` — persistent decisions

```jsonc
{
  "version": "1.0",
  "updatedAt": "2026-07-21T06:42:00.000Z",
  "preferences": { /* resolved effective presets — same shape as fluent.config.json */ },
  "decisions": [
    { "id": "brand-ramp-source",          // stable slug = dedupe key
      "question": "Confirm the brand color and ramp source…",
      "answer": "Use #5B2E91 as slot 80 and generate the 16-slot ramp…",
      "scope": "global",                    // global | surface | component | session
      "surface": "all",                     // web-react | … | powerbi | all
      "source": "user",                     // user | agent
      "timestamp": "2026-07-21T06:31:12.000Z" }
  ]
}
```

- `preferences` — the resolved merge (config → memory → default), the snapshot agents build against.
- `decisions[]` — **append-only**. Record every clarification: a user answer (`source:"user"`) or an agent-picked non-critical default (`source:"agent"`, for transparency/stability). On a changed answer append a new decision and mark the old one `status:"superseded"` — never rewrite history. Bump `updatedAt`.
- Before asking anything, check `decisions[]` for an `active` entry whose `id` (or `question` + `scope`/`surface`) already answers it — if found, **use it and do not re-ask**.

## Onboarding & clarification protocol (ask at most once, never block)

At the **start** of a task, call `fluent_get_config` to load presets. It returns every field with a per-field `source` (`config`/`memory`/`default`) plus `configExists` / `memoryExists` — a complete, buildable object even on a zero-config project.

1. **First-run offer (once).** When `configExists:false` **and** memory has **no `presets-optout` decision**, offer *before* building: *"Set up design presets (brand, accessibility, shapes, sizes, typography, targets) now, or use Fluent 2 defaults?"*
   - **Yes** → run `fluent_init_config` to gather answers + write `fluent.config.json`; it records the answers to memory. Continue with the resolved presets.
   - **No / silent** → proceed on §defaults **and** `fluent_remember` a `presets-optout` decision so you never re-ask:
     ```jsonc
     { "id": "presets-optout", "question": "Set up design presets now?",
       "answer": "use-defaults", "scope": "global", "surface": "all", "source": "user" }
     ```
   An existing `fluent.config.json` **or** a recorded opt-out suppresses the offer permanently.
2. **proactiveAsk — only after opt-in / when a config exists.** For the few CRITICAL presets that materially change the build — `brand.color`, `targets`, `accessibility.targetLevel`, `theme.mode`, and `migration.from` (only when adopting) — confirm each **at most once** if still unset. If declined or silent, use the default and `fluent_remember` an `agent`-sourced decision. Skip proactiveAsk entirely if the user opted out.
3. **Non-critical presets** (`shape`, `density`, `iconStyle`, `typography.scale`, `content.*`, `theme.base`) — proceed on the documented default, recording it as an `agent`-sourced decision so the choice is visible.

**Never assume silently — ask once, remember the answer either way, and never block the build.**

## Which tool to use
| Tool | Use it to |
|---|---|
| `fluent_get_config` | Read the **resolved** effective presets (per-field `source` + `configExists`/`memoryExists`). Call first on every task. Default-safe — never throws. |
| `fluent_init_config` | Scaffold `fluent.config.json` (with `$schema`) from the first-run offer; records answers to memory. |
| `fluent_set_config` | Update one or more preset values in `fluent.config.json`. |
| `fluent_remember` | Append a design decision (clarification, opt-out, applied default) to `.fluent/memory.json`. |
| `fluent_recall` | Read the resolved settings **+** the decision log (filter by `id`/`scope`/`surface`) — recall *why* a value holds and what was already asked. |

## Use it
```text
User: "Build me a Fluent 2 sign-in card."
Agent:
  1. fluent_get_config → every field source:"default" (configExists:false, memoryExists:false)
  2. Build now with webLightTheme, medium controls (~32px), 4px control / 8px card corners,
     regular icons, sentence-case copy, AA / 4.5:1 contrast, 24px min targets.
  3. First-run offer once: "Set up design presets now, or keep Fluent 2 defaults?" —
     build is already delivered, not blocked. On opt-out: fluent_remember presets-optout.
```

## Learn more
| Topic | How to find |
|---|---|
| Config schema (all fields + defaults) | [`assets/schema/fluent.config.schema.json`](../../assets/schema/fluent.config.schema.json) · samples in `assets/samples/config/` |
| Field → token mapping + rationale | `research/config-design.md` |
| Exact token values a preset resolves to | `fluent-design-tokens` skill · MCP `fluent_list_tokens` / `fluent_get_token` |
| Brand ramp from `brand.color` | MCP `fluent_generate_theme` |
| Design-token config conventions | `microsoft_docs_search(query="design tokens theme configuration Fluent UI react v9")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
