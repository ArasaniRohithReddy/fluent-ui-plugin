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
`@fluentui-copilot/react-copilot` (latest **0.30.5**) is the umbrella over **33 focused packages**; the source repo is `github.com/microsoft/fluentai` (private). Focused packages include `@fluentui-copilot/react-copilot-chat` (CopilotChat, User/Copilot/SystemMessage, Timestamp, AiGeneratedDisclaimer), `@fluentui-copilot/react-chat-input` (ChatInput), `@fluentui-copilot/react-provider` (CopilotProvider), `@fluentui-copilot/react-prompt-starter`, `@fluentui-copilot/react-suggestions`, `@fluentui-copilot/react-feedback-buttons`, `@fluentui-copilot/react-reference`, `@fluentui-copilot/react-output-card`, and more (see the full set below). Use the `fluent_search_components`/`fluent_get_component` MCP tools (category **AI / Copilot**) for exact exports and props.

> **Stability:** these `@fluentui-copilot/*` packages are public and installable but currently **internal-preview** (`0.x`) — their READMEs state external use isn't formally supported yet. They peer-depend on `@fluentui/react-components >=9.69` and render inside `CopilotProvider` (a superset of `FluentProvider`). `ChatInput` requires a `charactersRemainingMessage` prop.

## The component set
| Component | Package | Purpose |
|---|---|---|
| **Chat input** | react-chat-input | Conversational prompt area (textarea + submit + suggestions + attachment list + plugins + voice). Submit is hidden until the user types. |
| **Send button** | react-send-button | Send / stop / dictation states inside the chat input. |
| **Attachment** | react-attachments | An entity used to ground a response; interactive tag in the input footer. Dismissible; overflow menu past 180px. |
| **Suggestions** | react-suggestions | AI-generated shortcuts that **autofill** the input (still editable). Keep short, one line, never truncate. |
| **Prompt starters** | react-prompt-starter | Teach prompt-building at the start of a session (PromptStarter / PromptStarterList). |
| **Prompt input / listbox** | react-prompt-input, react-prompt-listbox | Rich prompt editor building blocks the chat input is composed from. |
| **Capability picker** | react-capability-picker | Menu to pick a Copilot capability or mode. |
| **Grounding menu** | react-grounding-menu | Grounding / @-mention source picker (GroundingCommandBar). |
| **Chat output** | react-copilot-chat | The back-and-forth region between header and input (CopilotChat). |
| **User message** | react-copilot-chat | The person's turn (UserMessage / UserMessageV2). |
| **Copilot message** | react-copilot-chat | Copilot's response (avatar, name, AI disclaimer), with latency/loading, footnotes, and actions (CopilotMessage / V2). |
| **System message** | react-copilot-chat | Out-of-conversation system notice. |
| **AI-generated disclaimer** | react-copilot-chat | Standardized "AI-generated content may be incorrect" line. |
| **Citations & references** | react-reference | Trust signals shown when output is grounded; preview on hover, app handoff on select (Reference / ReferenceList / Citation). |
| **Preview** | react-preview | Popover hover preview for a reference or citation. |
| **Sensitivity** | react-sensitivity-label | Marks output derived from sensitive data (inherits the most restrictive label). |
| **Output card** | react-output-card | Frames rich Copilot output (canvas/sidecar) with an `isLoading` state. |
| **Snippet** | react-snippet | Output card for code or content (header / controls / content / footer slots). |
| **Entity cards** | react-entity-cards | Entity previews (EntityCard / EntityCardList / EntityTitle). |
| **Feedback buttons** | react-feedback-buttons | Thumbs up/down rating loop (a responsible-AI must-have). |
| **Latency loader** | react-latency | "Copilot is working" indicator; LatencyCancel stops generation. |
| **Response count** | react-response-count | Quota/usage indicator with success/warning/danger status (not color alone). |
| **Timestamp** | react-copilot-chat | Divides messages by day (relative until > 1 week). |
| **Copilot FRE** | react-first-run-experience | First-run experience (FirstRunExperience / Content / Footer). |
| **Copilot nav** | react-copilot-nav | Copilot-styled navigation drawer (header/body/footer, categories, sub-items). |
| **Flair** | react-flair | Animated Copilot shimmer/sparkle (Houdini PaintWorklet hooks). |
| **Ghost text** | chat-input-plugins | Inline autocomplete affordance (GhostText / GhostTextPlugin). |
| **Provider / theme / tokens** | react-provider, react-copilot-theme, tokens | CopilotProvider plus the Copilot token and theme layer. |

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
