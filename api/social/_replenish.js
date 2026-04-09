// api/social/_replenish.js
// Creates one new undated draft post for a channel when a post is published.
// Called from zernio-webhook.js and check-status.js.

import Anthropic from '@anthropic-ai/sdk';
import { getMonthPlan } from '../../src/lib/social/seasonal-rules.js';
import { buildGenerationPrompt } from '../../src/lib/social/prompt-builder.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const POST_TYPES = ['relacyjny', 'sprzedażowy', 'treningowy', 'edukacyjny'];

export async function replenishPost(channel, supabase) {
    const month = new Date().getMonth() + 1;
    const plan = getMonthPlan(channel, month);

    // Pick a post_type proportional to the season's emphasis, cycling through options
    const { data: recentDrafts } = await supabase
        .from('social_posts')
        .select('post_type')
        .eq('channel', channel)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(4);

    // Choose a type that's least represented in recent drafts
    const recentTypes = (recentDrafts || []).map(d => d.post_type);
    const postType = POST_TYPES.find(t => !recentTypes.includes(t))
        || plan.themes[0] && 'relacyjny'  // fallback
        || 'relacyjny';

    // Pick a topic from seasonal themes
    const theme = plan.themes[Math.floor(Math.random() * plan.themes.length)];
    const contextNote = `${theme} (${plan.season})`;

    // Generate AI text
    const { data: examples } = await supabase
        .from('social_learning_examples')
        .select('*')
        .eq('channel', channel)
        .eq('post_type', postType)
        .order('created_at', { ascending: false })
        .limit(5);

    const prompt = buildGenerationPrompt({
        channel,
        postType,
        contextNote,
        partners: [],
        learningExamples: examples || [],
    });

    let aiFb = null;
    let aiIg = null;

    try {
        const msg = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });
        const raw = msg.content[0].text.trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const gen = JSON.parse(jsonMatch[0]);
            aiFb = gen.fb || null;
            aiIg = gen.ig || null;
        }
    } catch (e) {
        console.error('replenish: AI generation failed (non-fatal):', e.message);
    }

    await supabase.from('social_posts').insert([{
        channel,
        status: 'draft',
        post_type: postType,
        context_note: contextNote,
        ai_content_fb: aiFb,
        ai_content_ig: aiIg,
        publish_fb: true,
        publish_ig: true,
    }]);
}
