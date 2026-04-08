import { describe, it, expect } from 'vitest';
import { getMonthPlan } from '../../src/lib/social/seasonal-rules.js';

describe('getMonthPlan', () => {
    it('returns correct shape for BS in April', () => {
        const plan = getMonthPlan('BS', 4);
        expect(plan).toHaveProperty('season');
        expect(plan).toHaveProperty('themes');
        expect(plan).toHaveProperty('totalPosts');
        expect(plan.totalPosts).toBe(12); // 3/week × 4 weeks
    });

    it('AP gets fewer posts per week than BS', () => {
        const bs = getMonthPlan('BS', 4);
        const ap = getMonthPlan('AP', 4);
        expect(ap.totalPosts).toBeLessThan(bs.totalPosts);
    });

    it('throws for invalid month', () => {
        expect(() => getMonthPlan('BS', 13)).toThrow();
        expect(() => getMonthPlan('BS', 0)).toThrow();
    });
});
