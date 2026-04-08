// api/social/zernio-webhook.js
// POST /api/social/zernio-webhook
// Called by Zernio when a post is published or fails.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    // Verify shared secret
    const secret = req.headers['x-zernio-secret'];
    if (secret !== process.env.ZERNIO_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid secret' });
    }

    const { post_id, status, published_at } = req.body;

    if (!post_id || !status) {
        return res.status(400).json({ error: 'post_id and status required' });
    }

    const updates = { status };
    if (published_at) updates.published_at = published_at; // store actual publish time (separate from scheduled_at)

    const { error } = await supabase
        .from('social_posts')
        .update(updates)
        .eq('zernio_post_id', post_id); // Zernio sends its own post ID

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ ok: true });
}
