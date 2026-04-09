// api/social/generate.js
// POST /api/social/generate
// Body: { post_id, channel, post_type, context_note }
// Returns: { fb: string, ig: string }

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { buildGenerationPrompt } from '../../src/lib/social/prompt-builder.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { post_id, channel, post_type, context_note } = req.body;

    if (!channel || !post_type) {
        return res.status(400).json({ error: 'channel and post_type required' });
    }

    try {
        // Fetch partners for channel
        const { data: partners } = await supabase
            .from('social_partners')
            .select('id, name, handle')
            .eq('channel', channel);

        // Fetch post partners if post_id given (skip query entirely if no post_id)
        let postPartners = [];
        if (post_id) {
            const { data: pp } = await supabase
                .from('social_post_partners')
                .select('partner_id')
                .eq('post_id', post_id);
            const postPartnerIds = (pp || []).map(r => r.partner_id);
            postPartners = (partners || []).filter(p => postPartnerIds.includes(p.id));
        }

        // Fetch learning examples
        const { data: learningExamples } = await supabase
            .from('social_learning_examples')
            .select('*')
            .eq('channel', channel)
            .eq('post_type', post_type)
            .order('created_at', { ascending: false })
            .limit(5);

        const prompt = buildGenerationPrompt({
            channel,
            postType: post_type,
            contextNote: context_note || '',
            partners: postPartners,
            learningExamples: learningExamples || [],
        });

        const message = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });

        const raw = message.content[0].text.trim();
        // Parse JSON response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Claude did not return valid JSON');
        const generated = JSON.parse(jsonMatch[0]);

        if (!generated.fb || !generated.ig) {
            throw new Error('Claude response missing fb or ig fields');
        }

        // If regenerating (post_id provided), save prev version before updating
        if (post_id) {
            const { data: post } = await supabase
                .from('social_posts')
                .select('ai_content_fb, ai_content_ig')
                .eq('id', post_id)
                .single();

            if (post && (post.ai_content_fb || post.ai_content_ig)) {
                await supabase.from('social_posts').update({
                    prev_ai_content_fb: post.ai_content_fb,
                    prev_ai_content_ig: post.ai_content_ig,
                    ai_content_fb: generated.fb,
                    ai_content_ig: generated.ig,
                }).eq('id', post_id);
            } else {
                await supabase.from('social_posts').update({
                    ai_content_fb: generated.fb,
                    ai_content_ig: generated.ig,
                }).eq('id', post_id);
            }
        }

        return res.status(200).json({ fb: generated.fb, ig: generated.ig });
    } catch (err) {
        console.error('generate error:', err);
        return res.status(500).json({ error: 'Nie udało się wygenerować tekstu. Spróbuj ponownie.' });
    }
}
