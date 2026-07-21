import { z } from 'zod';
import { loadJson, textResult } from '../util.js';
export function registerDesignGuidance(server) {
    server.registerTool('fluent_design_guidance', {
        title: 'Fluent 2 design-language guidance',
        description: 'Return grounded, source-cited Fluent 2 (Fluent UI 2.0) design-language guidance for a foundation or guideline guide from https://fluent2.microsoft.design: design-principles, color, typography, layout, elevation, iconography, motion, shapes, material, accessibility, content-design, design-tokens, handoffs, onboarding, wait-ux, responsible-ai, ai-harm, content-engineering, entry-points, personality-principles, copilot-errors, or data-usage-sharing (or "all"). Use this for the reasoning layer (why/when to apply a style); use fluent_list_tokens / fluent_get_token for exact token values.',
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
        return textResult(JSON.stringify(section, null, 2));
    });
}
