// src/lib/social/zernio-client.js

const ZERNIO_BASE = 'https://api.zernio.com'; // verify this base URL in docs

/**
 * Builds the Zernio API payload from a social_posts row.
 * When both FB and IG are selected, FB text is used (primary platform).
 */
export function buildZernioPayload(post) {
    const platforms = [];
    if (post.publish_fb) platforms.push('facebook');
    if (post.publish_ig) platforms.push('instagram');

    // Use FB content as primary; fall back to IG if only IG selected
    const text = post.publish_fb ? post.final_content_fb : post.final_content_ig;

    return {
        text,
        platforms,
        media_url: post.media_public_url || null,
        media_type: post.media_type || null,
        scheduled_at: post.scheduled_at,
    };
}

/**
 * Publishes a post to Zernio.
 * Returns { zernio_post_id } on success.
 * Throws on API error.
 */
export async function publishToZernio(post, apiKey) {
    const payload = buildZernioPayload(post);

    const res = await fetch(`${ZERNIO_BASE}/v1/posts`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Zernio error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return { zernio_post_id: data.id ?? data.post_id }; // adjust field name per docs
}

/**
 * Gets post status from Zernio.
 */
export async function getZernioPostStatus(zernioPostId, apiKey) {
    const res = await fetch(`${ZERNIO_BASE}/v1/posts/${zernioPostId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Zernio status check failed: ${res.status}`);
    const data = await res.json();
    return data.status; // 'published' | 'failed' | 'scheduled' — verify field names in docs
}
