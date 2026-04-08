// api/social/check-status.js
// GET /api/social/check-status
// Called by Vercel cron every 30 minutes.
// Polls Zernio for posts that are still 'approved' 2+ hours after scheduled_at.

import { createClient } from '@supabase/supabase-js';
import { getZernioPostStatus } from '../../src/lib/social/zernio-client.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: posts, error } = await supabase
        .from('social_posts')
        .select('id, channel, zernio_post_id')
        .eq('status', 'approved')
        .lt('scheduled_at', twoHoursAgo)
        .not('zernio_post_id', 'is', null);

    if (error) return res.status(500).json({ error: error.message });
    if (!posts || posts.length === 0) return res.status(200).json({ checked: 0 });

    let updated = 0;
    for (const post of posts) {
        const apiKey = post.channel === 'BS'
            ? process.env.ZERNIO_API_KEY_BS
            : process.env.ZERNIO_API_KEY_AP;

        try {
            const status = await getZernioPostStatus(post.zernio_post_id, apiKey);
            if (status === 'published' || status === 'failed') {
                await supabase
                    .from('social_posts')
                    .update({ status })
                    .eq('id', post.id);
                updated++;
            }
        } catch (e) {
            console.error(`check-status: failed for post ${post.id}:`, e.message);
        }
    }

    return res.status(200).json({ checked: posts.length, updated });
}
