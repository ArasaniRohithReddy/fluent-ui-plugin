import { z } from 'zod';
import { loadJson, textResult, loadLocalOverlay, withLocalOverlay } from '../util.js';
export function registerDesignGuidance(server) {
    server.registerTool('fluent_design_guidance', {
        title: 'Fluent 2 design-language guidance',
        description: 'Return grounded, source-cited Fluent 2 (Fluent UI 2.0) design-language guidance from https://fluent2.microsoft.design. Covers 36 topics: the design foundations (design-principles, color, typography, layout, elevation, iconography, motion, shapes, material), UX frameworks (accessibility, content-design, design-tokens, handoffs, onboarding, wait-ux), AI/Copilot guidance (responsible-ai, ai-harm, entry-points, personality-principles, copilot-errors, data-usage-sharing), and the full content-engineering practice: system prompt engineering and the evaluating-output-quality track, under content-engineering-* keys. Pass "all" to list every topic. Use this for the reasoning layer (why/when to apply a style); use fluent_list_tokens / fluent_get_token for exact token values.',
        inputSchema: {
            topic: z
                .enum([
                'design-principles',
                'color',
                'typography',
                'layout',
                'elevation',
                'iconography',
                'motion',
                'shapes',
                'material',
                'accessibility',
                'content-design',
                'design-tokens',
                'handoffs',
                'onboarding',
                'wait-ux',
                'responsible-ai',
                'ai-harm',
                'content-engineering',
                'content-engineering-evals',
                'content-engineering-system-prompt-engineering',
                'content-engineering-define-system-level-behavior',
                'content-engineering-define-task-behavior-patterns',
                'content-engineering-define-prompts-for-complex-tasks',
                'content-engineering-design-interaction-behavior',
                'content-engineering-define-tone-and-context-behavior',
                'content-engineering-define-good-output-quality',
                'content-engineering-decide-what-to-evaluate-first',
                'content-engineering-define-output-requirements-by-experience-type',
                'content-engineering-build-a-prompt-set-and-assertions-for-an-eval',
                'content-engineering-understand-eval-results',
                'content-engineering-turn-eval-results-into-the-right-fixes',
                'content-engineering-track-quality-over-time',
                'entry-points',
                'personality-principles',
                'copilot-errors',
                'data-usage-sharing',
                'all',
            ])
                .default('all')
                .describe('Which Fluent 2 design-language topic to return guidance for.'),
        },
    }, async ({ topic }) => {
        const data = loadJson('design-guidance.json');
        if (!data) {
            return textResult('Design-language guidance not found at mcp/data/design-guidance.json.');
        }
        const topics = data.topics || {};
        if (topic === 'all') {
            return textResult(JSON.stringify({ $meta: data.$meta, topics }, null, 2));
        }
        const section = topics[topic];
        if (!section)
            return textResult(`No guidance for topic "${topic}".`);
        // Restore gated guidance when the reader has it locally (see NOTICE).
        return textResult(JSON.stringify(withLocalOverlay(section, loadLocalOverlay('design-guidance.json'), section?.title), null, 2));
    });
}
