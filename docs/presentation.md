# fluent-ui — leadership presentation outline

A slide-by-slide script for presenting the plugin to managers, leaders, and experts. Pair with the screenshots in `assets/screenshots/` and a live demo.

## 1. The opportunity
- Fluent 2 is Microsoft's design system for the web, Power BI, and Power Platform.
- Implementing it *correctly* (right component, right token, right theme, accessible) is slow and easy to get wrong.
- **Goal:** let anyone — dev, designer, UI engineer — build flawless Fluent 2 UIs *without doing it by hand*.

## 2. What we built
- A portable **plugin**: **Agents + Skills + an MCP server** — usable from **every major AI IDE** (Copilot CLI, VS Code, VS Code Insiders, Visual Studio, Copilot desktop app, Cursor, Claude, Gemini, Antigravity, Windsurf, Cline).
- Covers **Web** (Fluent React v9 + Web Components), **Power BI** (themes + PBIP/PBIR), and **Power Platform** (Power Apps, Power Pages, PCF) — one design language everywhere.

## 3. Live demo (5 minutes)
1. *"Build a Fluent 2 contact form with dark mode"* → real components + tokens + `FluentProvider`.
2. *"What's `borderRadiusMedium`?"* → `fluent_get_token` → `4px` (+ light/dark/HC).
3. *"Generate a Power BI theme from `#742774` and scaffold a PBIP report"* → valid theme JSON + `.pbip` project.
4. *"Make my Power Apps app match Fluent 2"* → modern controls + `App.Theme` guidance.
5. *"Review this component"* → prioritized Fluent + accessibility findings.

## 4. Why it's trustworthy (grounding)
- Crawled the **official Fluent 2 site** — 69 public pages **+ 14 gated AI/Copilot pages** (authenticated).
- Token & component values **extracted from the real `@fluentui` packages** (`react-theme`, `tokens`, `react-components`) — not guessed. 366 color tokens ×3 themes; 82 components with real props.
- Power BI theme **schema-validated**; PBIP/PBIR validated against Fabric schemas.
- Everything cites Microsoft Learn; uncertainties are flagged, not hidden.

## 5. Coverage at a glance
| Surface | What the plugin delivers |
|---|---|
| Web | Components, tokens, theming, code scaffolds, **AI/Copilot chat UI** |
| Power BI | Fluent theme JSON, visual defaults, PBIP/PBIR scaffolding |
| Power Platform | Power Apps modern themes, Power Pages token-CSS, PCF Fluent controls |
| Cross-cutting | Accessibility (WCAG 2.1 AA), design review |

## 6. Reach & adoption
- One **standard MCP server** runs everywhere; instructions fan out via `AGENTS.md` / `CLAUDE.md` / `.github`.
- Install = build once, drop one config file per IDE (`hosts/`).

## 7. Impact
- Faster, consistent, accessible Fluent 2 adoption; fewer design bugs; less manual token/theme lookup.
- A reusable pattern for turning any design system into grounded, executable assistance.

## 8. Roadmap / asks
- Track Fluent/AI package GA (the `@fluentui-copilot/*` set is internal-preview today).
- Optional `npx` distribution; richer `fluent_generate_code` templates; publish to a plugin marketplace.
- Feedback from design + engineering leaders on priority surfaces.
