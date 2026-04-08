import { describe, it, expect } from 'vitest';
import { getChannelConfig } from '../../src/lib/social/channel-config.js';

describe('getChannelConfig', () => {
    it('returns config for BS', () => {
        const config = getChannelConfig('BS');
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('toneOfVoice');
        expect(config).toHaveProperty('hashtagRules');
    });

    it('returns config for AP', () => {
        const config = getChannelConfig('AP');
        expect(config.name).toContain('Akademia');
    });

    it('throws for unknown channel', () => {
        expect(() => getChannelConfig('XX')).toThrow();
    });
});
