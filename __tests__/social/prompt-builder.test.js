import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from '../../src/lib/social/prompt-builder.js';

describe('buildGenerationPrompt', () => {
    const baseInput = {
        channel: 'BS',
        postType: 'relacyjny',
        contextNote: 'Zdjęcie z obozu w Stubaital, dzieci na stoku',
        partners: [{ handle: '@fundacja_xyz', name: 'Fundacja XYZ' }],
        learningExamples: [],
    };

    it('includes channel tone of voice', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('BiegunSport');
    });

    it('includes context note', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('Stubaital');
    });

    it('includes partner handle', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('@fundacja_xyz');
    });

    it('includes few-shot examples when provided', () => {
        const withExamples = {
            ...baseInput,
            learningExamples: [{
                ai_version_fb: 'AI wrote this',
                human_version_fb: 'Human fixed this',
                ai_version_ig: 'AI IG',
                human_version_ig: 'Human IG',
            }],
        };
        const prompt = buildGenerationPrompt(withExamples);
        expect(prompt).toContain('AI wrote this');
        expect(prompt).toContain('Human fixed this');
    });

    it('requests both FB and IG versions', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('Facebook');
        expect(prompt).toContain('Instagram');
    });
});
