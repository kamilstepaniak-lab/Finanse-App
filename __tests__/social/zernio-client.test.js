// __tests__/social/zernio-client.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We test the client logic without hitting real API
describe('buildZernioPayload', () => {
    it('includes fb platform when publish_fb is true', async () => {
        const { buildZernioPayload } = await import('../../src/lib/social/zernio-client.js');
        const post = {
            final_content_fb: 'Hello FB',
            final_content_ig: 'Hello IG',
            media_public_url: 'https://example.com/img.jpg',
            media_type: 'image',
            scheduled_at: '2026-04-10T08:00:00Z',
            publish_fb: true,
            publish_ig: false,
        };
        const payload = buildZernioPayload(post);
        expect(payload.platforms).toContain('facebook');
        expect(payload.platforms).not.toContain('instagram');
    });

    it('uses ig content when only instagram selected', async () => {
        const { buildZernioPayload } = await import('../../src/lib/social/zernio-client.js');
        const post = {
            final_content_fb: 'FB text',
            final_content_ig: 'IG text',
            media_public_url: 'https://example.com/img.jpg',
            media_type: 'image',
            scheduled_at: '2026-04-10T08:00:00Z',
            publish_fb: false,
            publish_ig: true,
        };
        const payload = buildZernioPayload(post);
        expect(payload.text).toBe('IG text');
    });
});
