---
name: fluent-ai-copilot-ui
description: Build Copilot / AI chat surfaces with the Fluent 2 AI components — chat input, Copilot & user messages, suggestions, prompt starters, attachments, citations & references, sensitivity, and the Copilot FRE. Use for any Copilot/AI conversational UX styled with Fluent 2.
---

# Fluent 2 AI / Copilot UI

Fluent 2 ships a dedicated **AI/Copilot component set** for building Copilot chat experiences. Components live under the **`@fluentui-copilot`** npm scope and are documented in the **Copilot Storybook at https://ai.fluentui.dev** (the design guidance pages at `fluent2.microsoft.design/components/web/react/ai/*` require Microsoft employee sign-in). They build on Fluent 2 — wrap in `FluentProvider` and use the same tokens.

## Install
```bash
npm install @fluentui-copilot/react-copilot @fluentui/react-components
```
`@fluentui-copilot/react-copilot` is the umbrella; focused packages include `@fluentui-copilot/react-copilot-chat` (CopilotChat, User/Copilot/SystemMessage, Timestamp, AiGeneratedDisclaimer), `@fluentui-copilot/react-chat-input` (ChatInput), `@fluentui-copilot/react-provider` (CopilotProvider), `@fluentui-copilot/react-prompt-starter`, and `@fluentui-copilot/react-suggestions`. Use the `fluent_search_components`/`fluent_get_component` MCP tools (category **AI / Copilot**) for exact exports and props.

> **Stability:** these `@fluentui-copilot/*` packages are public and installable but currently **internal-preview** (`0.x`) — their READMEs state external use isn't formally supported yet. They peer-depend on `@fluentui/react-components >=9.69` and render inside `CopilotProvider` (a superset of `FluentProvider`). `ChatInput` requires a `charactersRemainingMessage` prop.

## The component set
| Component | Purpose |
|---|---|
| **Chat input** | Conversational prompt area (textarea + submit + suggestions + attachment list + plugins + voice). Submit is hidden until the user types. |
| **Attachment** | An entity used to ground a response; interactive tag in the input footer. Dismissible; overflow menu past 180px. |
| **Suggestions** | AI-generated shortcuts that **autofill** the input (still editable). Keep short, one line, never truncate. |
| **Prompt starters** | Teach prompt-building at the start of a session. |
| **Chat output** | The back-and-forth region between header and input. |
| **User message** | The person's turn. |
| **Copilot message** (v2) | Copilot's response on the main surface (avatar, name, AI disclaimer), with latency/loading, footnotes, and actions. |
| **Citations & references** | Trust signals shown when output is grounded on a graph entity; preview on hover, app handoff on select. |
| **Sensitivity** | Marks output derived from sensitive data (inherits the most restrictive label). |
| **Timestamp** | Divides messages by day (relative until > 1 week). |
| **Copilot FRE** | First-run experience. |
| **Entity cards / Ghost text / System message** | Entity previews, inline autocomplete affordance, and system notices. |

## Anatomy of a Copilot chat
- **Input:** prompt textarea → submit → suggestion list (optional) → prompt guide (optional) → attachment list → attachments → plugins (optional) → voice (optional).
- **Output:** timestamp → user message → Copilot/GPT branding → AI notice → citations/references (output-dependent) → contextual actions.

## Key behaviors (follow these)
- **Latency pattern:** immediate-response statements + Copilot Loader → streaming phase (title + AI disclaimer appear) → "below the fold" down button when content overflows; submit turns into a **stop** button while generating.
- **Focus:** press **Enter** on a Copilot message to trap/cycle focus inside it; **Esc** to return to the chat container.
- **Suggestions:** selecting one inserts editable prompt text; use progressive disclosure (summarize long prompts in the suggestion, autofill the full prompt).
- **Attachments/references:** name them to match file names exactly, exclude the file type; use the icon slot for file type, avatars for people.

## Rules
- Wrap the chat in `FluentProvider` (+ the Copilot provider from `@fluentui-copilot/react-provider`) and use Fluent tokens — no raw colors.
- Always show the **AI-generated disclaimer** and, when grounded, citations/references.
- Accessibility: manage focus per the pattern above, label controls, keep 4.5:1 contrast. Validate with the `fluent-accessibility` skill + `fluent_accessibility_checklist`.

## Learn more
| Topic | How to find |
|---|---|
| Copilot component API/props | Storybook `https://ai.fluentui.dev` · MCP `fluent_get_component` (category ai) |
| Design guidance (gated) | `https://fluent2.microsoft.design/components/web/react/ai/chatinput/usage` (employee sign-in) |
| Responsible AI UX | `microsoft_docs_search(query="Microsoft HAX responsible AI guidelines")` |

### CLI alternative (if the Learn MCP server is unavailable)
| MCP tool | CLI command |
|---|---|
| `microsoft_docs_search(query: "...")` | `mslearn search "..."` |
| `microsoft_docs_fetch(url: "...")` | `mslearn fetch "..."` |

Run directly with `npx @microsoft/learn-cli <command>` or install globally with `npm install -g @microsoft/learn-cli`.
