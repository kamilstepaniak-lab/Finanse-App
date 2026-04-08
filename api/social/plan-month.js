// api/social/plan-month.js
// POST /api/social/plan-month
// Body: { channel }
// Generates draft posts for the next 30 days using Claude + seasonal rules.
// Dates are NOT set — user picks them manually when approving each post.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { getMonthPlan } from '../../src/lib/social/seasonal-rules.js';
import { getChannelConfig } from '../../src/lib/social/channel-config.js';
import { buildGenerationPrompt } from '../../src/lib/social/prompt-builder.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: 'channel required' });

    const now = new Date();
    const month = now.getMonth() + 1;
    const plan = getMonthPlan(channel, month);
    const config = getChannelConfig(channel);

    const prompt = `
Jesteś planistą contentu dla ${config.name}.

Zaproponuj ${plan.totalPosts} pomysłów na posty na najbliższe 30 dni.

Sezon: ${plan.season}
Główne tematy: ${plan.themes.join(', ')}
Nacisk: ${plan.emphasis}

Reguły kanału:
${config.toneOfVoice}

Odpowiedz TYLKO w formacie JSON (tablica):
[
  {
    "post_type": "relacyjny|sprzedażowy|treningowy|edukacyjny",
    "topic": "krótki opis tematu posta (1 zdanie)"
  }
]

Zadbaj o różnorodność typów postów. Nie podawaj dat — użytkownik sam wyznaczy terminy.
`.trim();

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2048,
            messages: [{ role: 'user', content: prompt }],
        });

        const raw = message.content[0].text.trim();
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('Claude did not return valid JSON array');
        const postPlan = JSON.parse(jsonMatch[0]);

        // Create draft posts — no scheduled_at, user sets dates manually before approving
        const drafts = postPlan.map(item => ({
            channel,
            status: 'draft',
            post_type: item.post_type,
            context_note: item.topic,
            publish_fb: true,
            publish_ig: true,
        }));

        const { data, error } = await supabase
            .from('social_posts')
            .insert(drafts)
            .select();

        if (error) throw error;

        // Generate text for each draft — import buildGenerationPrompt directly (no HTTP self-call)
        const generatedPosts = [];
        for (const draft of data) {
            try {
                const { data: examples } = await supabase
                    .from('social_learning_examples')
                    .select('*')
                    .eq('channel', channel)
                    .eq('post_type', draft.post_type)
                    .order('created_at', { ascending: false })
                    .limit(5);

                const genPrompt = buildGenerationPrompt({
                    channel,
                    postType: draft.post_type,
                    contextNote: draft.context_note || '',
                    partners: [],
                    learningExamples: examples || [],
                });

                const msg = await anthropic.messages.create({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: genPrompt }],
                });
                const rawText = msg.content[0].text.trim();
                const jsonMatchPost = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatchPost) {
                    const gen = JSON.parse(jsonMatchPost[0]);
                    await supabase.from('social_posts').update({
                        ai_content_fb: gen.fb,
                        ai_content_ig: gen.ig,
                    }).eq('id', draft.id);
                    generatedPosts.push({ ...draft, ai_content_fb: gen.fb, ai_content_ig: gen.ig });
                } else {
                    generatedPosts.push(draft);
                }
            } catch {
                generatedPosts.push(draft); // non-fatal: draft created, text generation failed
            }
        }

        return res.status(200).json({ posts: generatedPosts, count: generatedPosts.length });
    } catch (err) {
        console.error('plan-month error:', err);
        return res.status(500).json({ error: 'Nie udało się zaplanować miesiąca. Spróbuj ponownie.' });
    }
}
