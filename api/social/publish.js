// api/social/publish.js
// POST /api/social/publish
// Body: { post_id }
// Reads post from Supabase, publishes to Zernio, updates status.

import { createClient } from '@supabase/supabase-js';
import { publishToZernio } from '../../src/lib/social/zernio-client.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { post_id } = req.body;
    if (!post_id) return res.status(400).json({ error: 'post_id required' });

    // Fetch post
    const { data: post, error: fetchError } = await supabase
        .from('social_posts')
        .select('*')
        .eq('id', post_id)
        .single();

    if (fetchError || !post) {
        return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'approved') {
        return res.status(400).json({ error: 'Post must be approved before publishing' });
    }

    // Choose API key based on channel
    const apiKey = post.channel === 'BS'
        ? process.env.ZERNIO_API_KEY_BS
        : process.env.ZERNIO_API_KEY_AP;

    if (!apiKey) {
        return res.status(500).json({ error: `Missing Zernio API key for channel ${post.channel}` });
    }

    try {
        const { zernio_post_id } = await publishToZernio(post, apiKey);

        // Only store the Zernio ID — do NOT overwrite status here.
        // Status stays 'approved' until webhook/cron confirms 'published'.
        await supabase
            .from('social_posts')
            .update({ zernio_post_id })
            .eq('id', post_id);

        // Save learning example if user edited the AI-generated text
        const userEditedFb = post.final_content_fb && post.final_content_fb !== post.ai_content_fb;
        const userEditedIg = post.final_content_ig && post.final_content_ig !== post.ai_content_ig;

        if ((userEditedFb || userEditedIg) && post.ai_content_fb && post.post_type) {
            try {
                await supabase.from('social_learning_examples').insert([{
                    channel: post.channel,
                    post_type: post.post_type,
                    ai_version_fb: post.ai_content_fb,
                    ai_version_ig: post.ai_content_ig,
                    human_version_fb: post.final_content_fb,
                    human_version_ig: post.final_content_ig,
                }]);

                // Trim to 50 per (channel, post_type)
                const { data: rows } = await supabase
                    .from('social_learning_examples')
                    .select('id, created_at')
                    .eq('channel', post.channel)
                    .eq('post_type', post.post_type)
                    .order('created_at', { ascending: false });

                if (rows && rows.length > 50) {
                    const toDelete = rows.slice(50).map(r => r.id);
                    await supabase.from('social_learning_examples').delete().in('id', toDelete);
                }
            } catch (e) {
                console.error('saveLearningExample failed (non-fatal):', e.message);
            }
        }

        return res.status(200).json({ ok: true, zernio_post_id });
    } catch (err) {
        await supabase
            .from('social_posts')
            .update({ status: 'failed' })
            .eq('id', post_id);

        return res.status(502).json({ error: err.message });
    }
}
