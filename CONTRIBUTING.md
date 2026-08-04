# Contributing to fluent-ui

Thanks for your interest in improving fluent-ui, the open-source plugin that helps developers, designers, and UI engineers build and adopt Microsoft Fluent 2 (Fluent UI 2.0). Contributions of every size are welcome: bug reports, feature ideas, documentation fixes, new grounded data, and code.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug:** open a [bug report](https://github.com/Rohithreddy7123/fluent-ui-plugin/issues/new?template=bug_report.yml).
- **Request a feature:** open a [feature request](https://github.com/Rohithreddy7123/fluent-ui-plugin/issues/new?template=feature_request.yml).
- **Ask a question or share an idea:** start a thread in [Discussions](https://github.com/Rohithreddy7123/fluent-ui-plugin/discussions).
- **Report a vulnerability:** please follow the [Security Policy](SECURITY.md). Do not open a public issue for a security problem.
- **Send a pull request:** fix a bug, add a tool or skill, expand the grounded data, or improve the docs.

## Project layout

| Path | What it holds |
|------|---------------|
| `mcp/` | The MCP server: 19 tools in `src/`, grounded data in `data/`, build output in `dist/`. |
| `agents/` | The 6 agent definitions (`*.agent.md`). |
| `skills/` | The 15 skills (`SKILL.md`). |
| `templates/pbip/` | The Power BI PBIP/PBIR project template. |
| `hosts/` | Per-IDE MCP config templates and the install matrix. |
| `site/` | The GitHub Pages site (Fluent UI React v9). Build output goes to `docs/`. |
| `docs/` | The published Pages output plus architecture and presentation docs. |

## Develop the MCP server

Prerequisites: Node.js 18 or newer.

```bash
cd mcp
npm ci
npm run build     # compiles TypeScript to dist/
npm test          # runs the smoke test (asserts tool and topic counts)
```

Please keep both green before you open a pull request.

### Grounding rules (important)

This plugin is trusted because it is grounded in official sources, not guesses. When you change data or tools:

- Base component, token, and visual facts on the official `fluent2.microsoft.design` site and the installed `@fluentui` package source. Cite the source in your pull request.
- Never hardcode model IDs or a vision-capability flag. Capabilities are discovered at runtime.
- Keep the core logic UI-agnostic. Provider-specific concerns stay in their own modules.
- Prefer exact token values over approximations.

## Develop the site

```bash
cd site
npm ci
npm run build     # outputs the static site to ../docs
```

The site is a real Fluent UI React v9 app, so use `@fluentui/react-components` and `@fluentui/react-icons`, real design tokens, and verified icon names. Do not introduce emoji as UI icons.

## Style

- Write in clear, plain language. Do not use em-dashes or Unicode arrows in prose. Use commas, colons, or the words "to" and "produces".
- Match the existing formatting and naming in the file you are editing.
- Keep changes focused. One logical change per pull request.

## Pull request process

1. Fork the repository and create a branch from `main`.
2. Make your change and update any affected docs.
3. Run `npm test` in `mcp/`, and `npm run build` in `site/` if you touched the site.
4. Open a pull request using the template. Link the related issue and describe how you tested.
5. A maintainer will review. Please be responsive to feedback.

Thank you for helping make Fluent 2 easier for everyone.
