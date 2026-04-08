# Social Media Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Social Media module to finanse-firma app enabling AI-generated post scheduling and publishing to Facebook/Instagram via Zernio for BiegunSport and Akademia Pływania channels.

**Architecture:** Vite + React frontend with Vercel Serverless Functions in `/api/social/` for backend logic (Claude, Zernio, Google Drive). Supabase stores posts, partners, and learning examples. Media files are downloaded from Google Drive and re-uploaded to Vercel Blob for stable public URLs passed to Zernio.

**Tech Stack:** React, React Router v7, Supabase JS v2, Vercel Serverless Functions (ESM), Anthropic SDK, Zernio REST API, Google Drive API, Vercel Blob, vitest

---

## Prerequisites (manual setup required before starting)

The developer must:

1. Add to `.env.local` and Vercel project env vars:
   ```
   ZERNIO_API_KEY_BS=<get from Zernio BS account — already set up>
   ZERNIO_API_KEY_AP=<get from Zernio AP account>
   ZERNIO_WEBHOOK_SECRET=<generate: openssl rand -hex 32>
   ANTHROPIC_API_KEY=<from console.anthropic.com>
   # Option A — Service account (recommended, simpler for server-side):
   GOOGLE_SERVICE_ACCOUNT_JSON=<paste full service account JSON key as single line>
   # Option B — OAuth refresh token (see Task 13 for setup):
   GOOGLE_DRIVE_CLIENT_ID=<from Google Cloud Console>
   GOOGLE_DRIVE_CLIENT_SECRET=<from Google Cloud Console>
   GOOGLE_DRIVE_REFRESH_TOKEN=<from OAuth flow — see Task 13>
   BLOB_READ_WRITE_TOKEN=<from Vercel Dashboard → Storage → Blob>
   SUPABASE_SERVICE_ROLE_KEY=<from Supabase → Settings → API>
   VITE_SUPABASE_URL=<already exists>
   VITE_SUPABASE_ANON_KEY=<already exists>
   ```

2. Verify Zernio API endpoint: check `https://zernio.com/docs` for current `POST /v1/posts` payload schema before implementing Chunk 2.

3. Run the DB migration (Chunk 1) in Supabase SQL Editor before starting Chunk 2.

---

## File Structure

**New files:**
```
/api/social/
  generate.js          ← Claude text generation endpoint
  publish.js           ← Zernio publish endpoint
  drive-browse.js      ← Google Drive folder listing
  drive-download.js    ← Download from Drive + upload to Vercel Blob
  zernio-webhook.js    ← Webhook from Zernio (status updates)
  check-status.js      ← Cron polling for missed webhooks
  plan-month.js        ← Month planning agent

/src/lib/social/
  channel-config.js    ← Tone of voice, hashtag rules (constants, no runtime file reads)
  seasonal-rules.js    ← Month/season content rules for planning
  prompt-builder.js    ← Builds Claude prompts with context + few-shot examples
  db.js                ← Supabase CRUD for social tables

/src/pages/
  SocialMedia.jsx      ← Main page (channel tabs, table, modals)
  SocialMedia.css      ← Page styles

/src/pages/social/
  PostTable.jsx         ← Chronological post table
  PostEditPanel.jsx     ← Edit modal (text, media, date, platform, partners)
  PartnerPicker.jsx     ← Partner tagging dropdown
  DriveFilePicker.jsx   ← Google Drive file browser modal
  PlanMonthModal.jsx    ← Month planning progress/result modal

/migrations/
  add_social_media.sql  ← Creates 4 new tables

/__tests__/
  social/
    prompt-builder.test.js
    zernio-client.test.js
    channel-config.test.js
```

**Modified files:**
```
vercel.json           ← Fix rewrite to not intercept /api/ routes
package.json          ← Add: @anthropic-ai/sdk, @vercel/blob, vitest, vite-plugin-node
src/App.jsx           ← Add /social route
src/components/Layout.jsx  ← Add Social Media nav item
```

---

## Chunk 1: Foundation

### Task 1: Update vercel.json to exclude /api/ from SPA rewrite

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Update rewrite rule**

Replace the catch-all rewrite with one that excludes `/api/` paths:

```json
{
  "name": "finanse-firma",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "crons": [
    {
      "path": "/api/social/check-status",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: exclude /api/ from SPA rewrite, add cron for status polling"
```

---

### Task 2: Set up vitest

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `__tests__/social/.gitkeep`

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Add vitest config to vite.config.js**

Read current `vite.config.js` first, then add the `test` block:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 4: Create test directory**

```bash
mkdir -p __tests__/social && touch __tests__/social/.gitkeep
```

- [ ] **Step 5: Verify vitest runs (no tests yet)**

```bash
npm test
```
Expected: "No test files found" or similar — no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json vite.config.js package-lock.json __tests__/
git commit -m "chore: add vitest for unit testing"
```

---

### Task 3: DB Migration — 4 social media tables

**Files:**
- Create: `migrations/add_social_media.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Migration: Social Media module tables
-- Run ONCE in Supabase SQL Editor

-- Posts table
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel TEXT NOT NULL CHECK (channel IN ('BS', 'AP')),
    scheduled_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'failed')),
    media_drive_id TEXT,
    media_public_url TEXT,
    media_type TEXT CHECK (media_type IN ('image', 'video')),
    context_note TEXT,
    ai_content_fb TEXT,
    ai_content_ig TEXT,
    prev_ai_content_fb TEXT,
    prev_ai_content_ig TEXT,
    final_content_fb TEXT,
    final_content_ig TEXT,
    publish_fb BOOLEAN NOT NULL DEFAULT true,
    publish_ig BOOLEAN NOT NULL DEFAULT true,
    zernio_post_id TEXT,
    post_type TEXT CHECK (post_type IN ('relacyjny', 'sprzedażowy', 'treningowy', 'edukacyjny')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partners per channel
CREATE TABLE IF NOT EXISTS social_partners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel TEXT NOT NULL CHECK (channel IN ('BS', 'AP')),
    name TEXT NOT NULL,
    handle TEXT NOT NULL
);

-- Learning examples (few-shot for Claude)
CREATE TABLE IF NOT EXISTS social_learning_examples (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel TEXT NOT NULL CHECK (channel IN ('BS', 'AP')),
    post_type TEXT NOT NULL CHECK (post_type IN ('relacyjny', 'sprzedażowy', 'treningowy', 'edukacyjny')),
    ai_version_fb TEXT,
    ai_version_ig TEXT,
    human_version_fb TEXT,
    human_version_ig TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post ↔ Partner relation
CREATE TABLE IF NOT EXISTS social_post_partners (
    post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
    partner_id UUID NOT NULL REFERENCES social_partners(id) ON DELETE CASCADE,
    UNIQUE(post_id, partner_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_posts_channel ON social_posts(channel);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled_at ON social_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_social_learning_channel_type ON social_learning_examples(channel, post_type, created_at DESC);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Open Supabase → SQL Editor → paste and run the migration above.
Expected: all 4 tables visible in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add migrations/add_social_media.sql
git commit -m "feat: add social media DB migration (4 tables)"
```

---

### Task 4: Add Social Media route and nav item

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`
- Create: `src/pages/SocialMedia.jsx` (placeholder)
- Create: `src/pages/SocialMedia.css` (empty)

- [ ] **Step 1: Create placeholder SocialMedia page**

```jsx
// src/pages/SocialMedia.jsx
import React from 'react';
import './SocialMedia.css';

export default function SocialMedia() {
    return (
        <div className="social-media-page">
            <p>Social Media — coming soon</p>
        </div>
    );
}
```

Create empty `src/pages/SocialMedia.css`.

- [ ] **Step 2: Add route to App.jsx**

```jsx
import SocialMedia from './pages/SocialMedia';
// Inside <Route path="/" element={<Layout />}>:
<Route path="social" element={<SocialMedia />} />
```

- [ ] **Step 3: Add nav item to Layout.jsx**

Add import: `import { ..., Share2 } from 'lucide-react';`

Add after Historia:
```jsx
<SidebarItem to="/social" icon={Share2} label="Social Media" />
```

Add to `getPageTitle()`:
```js
case '/social': return 'Social Media';
```

- [ ] **Step 4: Test in browser**

Run `vercel dev` (or `npm run dev`) and navigate to `/social`.
Expected: "Social Media — coming soon" text visible, nav item highlighted.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx src/pages/SocialMedia.jsx src/pages/SocialMedia.css
git commit -m "feat: add Social Media route and nav item (placeholder page)"
```

---

## Chunk 2: DB Layer + Zernio Client

### Task 5: Social DB layer (Supabase CRUD)

**Files:**
- Create: `src/lib/social/db.js`

- [ ] **Step 1: Create `src/lib/social/` directory**

```bash
mkdir -p src/lib/social
```

- [ ] **Step 2: Write db.js**

```js
// src/lib/social/db.js
import { supabase } from '../../supabaseClient.js';

// ─── POSTS ───────────────────────────────────────────────

export const getPosts = async (channel) => {
    const { data, error } = await supabase
        .from('social_posts')
        .select(`
            *,
            social_post_partners (
                partner_id,
                social_partners ( id, name, handle )
            )
        `)
        .eq('channel', channel)
        .neq('status', 'published')
        .order('scheduled_at', { ascending: true });
    if (error) throw error;
    return data || [];
};

export const getPublishedPosts = async (channel) => {
    const { data, error } = await supabase
        .from('social_posts')
        .select('*')
        .eq('channel', channel)
        .eq('status', 'published')
        .order('scheduled_at', { ascending: false })
        .limit(20);
    if (error) throw error;
    return data || [];
};

export const createPost = async (post) => {
    const { data, error } = await supabase
        .from('social_posts')
        .insert([post])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const updatePost = async (id, updates) => {
    const { data, error } = await supabase
        .from('social_posts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const deletePost = async (id) => {
    const { error } = await supabase
        .from('social_posts')
        .delete()
        .eq('id', id)
        .eq('status', 'draft'); // safety: only drafts
    if (error) throw error;
};

// ─── PARTNERS ────────────────────────────────────────────

export const getPartners = async (channel) => {
    const { data, error } = await supabase
        .from('social_partners')
        .select('*')
        .eq('channel', channel)
        .order('name');
    if (error) throw error;
    return data || [];
};

export const createPartner = async (partner) => {
    const { data, error } = await supabase
        .from('social_partners')
        .insert([partner])
        .select()
        .single();
    if (error) throw error;
    return data;
};

export const deletePartner = async (id) => {
    const { error } = await supabase
        .from('social_partners')
        .delete()
        .eq('id', id);
    if (error) throw error;
};

// ─── POST ↔ PARTNER ──────────────────────────────────────

export const setPostPartners = async (postId, partnerIds) => {
    // Delete existing, insert new (upsert-style)
    const { error: deleteError } = await supabase
        .from('social_post_partners')
        .delete()
        .eq('post_id', postId);
    if (deleteError) throw deleteError;
    if (partnerIds.length === 0) return;
    const { error } = await supabase
        .from('social_post_partners')
        .insert(partnerIds.map(pid => ({ post_id: postId, partner_id: pid })));
    if (error) throw error;
};

// ─── LEARNING EXAMPLES ───────────────────────────────────

export const saveLearningExample = async (example) => {
    // Insert new example
    const { error: insertError } = await supabase
        .from('social_learning_examples')
        .insert([example]);
    if (insertError) throw insertError;

    // Trim to 50 per (channel, post_type) — delete oldest over limit
    const { data: rows } = await supabase
        .from('social_learning_examples')
        .select('id, created_at')
        .eq('channel', example.channel)
        .eq('post_type', example.post_type)
        .order('created_at', { ascending: false });

    if (rows && rows.length > 50) {
        const toDelete = rows.slice(50).map(r => r.id);
        await supabase.from('social_learning_examples').delete().in('id', toDelete);
    }
};

export const getLearningExamples = async (channel, postType, limit = 5) => {
    const { data, error } = await supabase
        .from('social_learning_examples')
        .select('*')
        .eq('channel', channel)
        .eq('post_type', postType)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/db.js
git commit -m "feat: add social media Supabase DB layer"
```

---

### Task 6: Zernio API client

**Files:**
- Create: `src/lib/social/zernio-client.js`
- Create: `__tests__/social/zernio-client.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/social/zernio-client.test.js
```
Expected: FAIL — `buildZernioPayload` not found.

- [ ] **Step 3: Write zernio-client.js**

> ⚠️ Verify actual Zernio API payload schema at https://zernio.com/docs before deploying.

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- __tests__/social/zernio-client.test.js
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/zernio-client.js __tests__/social/zernio-client.test.js
git commit -m "feat: add Zernio API client with tests"
```

---

### Task 7: Publish API endpoint (Vercel Serverless Function)

**Files:**
- Create: `api/social/publish.js`

- [ ] **Step 1: Create api/social directory**

```bash
mkdir -p api/social
```

- [ ] **Step 2: Write publish.js**

```js
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

        return res.status(200).json({ ok: true, zernio_post_id });
    } catch (err) {
        await supabase
            .from('social_posts')
            .update({ status: 'failed' })
            .eq('id', post_id);

        return res.status(502).json({ error: err.message });
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add api/social/publish.js
git commit -m "feat: add /api/social/publish serverless function"
```

---

### Task 8: Zernio webhook + status polling

**Files:**
- Create: `api/social/zernio-webhook.js`
- Create: `api/social/check-status.js`

- [ ] **Step 1: Write zernio-webhook.js**

```js
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

    const { post_id, status, published_at, error: zernioError } = req.body;

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
```

- [ ] **Step 2: Write check-status.js (cron fallback)**

```js
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
```

- [ ] **Step 3: Commit**

```bash
git add api/social/zernio-webhook.js api/social/check-status.js
git commit -m "feat: add Zernio webhook handler and cron status polling"
```

---

## Chunk 3: Claude Text Generation

### Task 9: Channel config constants

**Files:**
- Create: `src/lib/social/channel-config.js`
- Create: `__tests__/social/channel-config.test.js`

- [ ] **Step 1: Write the failing test**

```js
// __tests__/social/channel-config.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/social/channel-config.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write channel-config.js**

```js
// src/lib/social/channel-config.js
// All channel rules stored as constants — not read from files at runtime.

const CONFIGS = {
    BS: {
        name: 'BiegunSport',
        toneOfVoice: `
Jesteś BiegunSport — organizatorem wyjazdów narciarskich i treningów dla dzieci i dorosłych.
Ton: energetyczny, ciepły, inspirujący. Piszesz jak pasjonat gór, nie jak korporacja.
Używasz "my" i "was" — jesteście razem na stoku.
Unikasz nadmiernego formalizmu. Dopuszczalne emoji (umiarkowanie) w postach relacyjnych.
W postach sprzedażowych: konkretne info (termin, miejsce, cena, link do zapisu).
        `.trim(),
        hashtagRules: {
            fb: 'Hashtagi w treści posta (nie na końcu). Maksymalnie 5.',
            ig: 'Hashtagi osobno, w pierwszym komentarzu. 15–25 hashtagów.',
        },
        postTypeLengths: {
            fb: { min: 150, max: 400 },
            ig: { min: 80, max: 200 },
        },
    },
    AP: {
        name: 'Akademia Pływania',
        toneOfVoice: `
Jesteś Akademią Pływania — szkołą nauki pływania dla dzieci i dorosłych.
Ton: profesjonalny ale przyjazny, bezpieczny, zachęcający do aktywności.
Zwracasz się do rodziców i dorosłych uczniów. Podkreślasz bezpieczeństwo i postępy.
Unikasz sportowego żargonu. Emoji oszczędnie, tylko w relacyjnych.
W postach sprzedażowych: termin, poziom zajęć, wiek, link do zapisu.
        `.trim(),
        hashtagRules: {
            fb: 'Hashtagi w treści posta. Maksymalnie 4.',
            ig: 'Hashtagi osobno, w pierwszym komentarzu. 10–20 hashtagów.',
        },
        postTypeLengths: {
            fb: { min: 100, max: 300 },
            ig: { min: 60, max: 150 },
        },
    },
};

export function getChannelConfig(channel) {
    if (!CONFIGS[channel]) throw new Error(`Unknown channel: ${channel}`);
    return CONFIGS[channel];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- __tests__/social/channel-config.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/channel-config.js __tests__/social/channel-config.test.js
git commit -m "feat: add channel config constants for Claude prompts"
```

---

### Task 10: Seasonal rules for "Zaplanuj miesiąc"

**Files:**
- Create: `src/lib/social/seasonal-rules.js`
- Create: `__tests__/social/seasonal-rules.test.js`

- [ ] **Step 1: Write failing test**

```js
// __tests__/social/seasonal-rules.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/social/seasonal-rules.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write seasonal-rules.js**

```js
// src/lib/social/seasonal-rules.js
// Content calendar rules — month/season themes for post planning.
// Based on BS content-calendar.md rules, compiled as constants.

export const SEASONAL_RULES = {
    // month: 1–12
    1:  { season: 'zima', themes: ['ferie zimowe', 'wyjazdy narciarskie', 'zapisy na obozy'], emphasis: 'sprzedażowy' },
    2:  { season: 'zima', themes: ['ferie zimowe', 'ostatnie miejsca', 'stoki narciarskie'], emphasis: 'sprzedażowy' },
    3:  { season: 'wiosna', themes: ['koniec sezonu narciarskiego', 'podsumowania', 'zapisy letnie'], emphasis: 'relacyjny' },
    4:  { season: 'wiosna', themes: ['obozy letnie — wczesne zapisy', 'treningi wiosenne', 'motywacja'], emphasis: 'sprzedażowy' },
    5:  { season: 'wiosna', themes: ['obozy letnie', 'zawody', 'treningi'], emphasis: 'sprzedażowy' },
    6:  { season: 'lato', themes: ['obozy letnie start', 'relacje z wyjazdów', 'pływanie'], emphasis: 'relacyjny' },
    7:  { season: 'lato', themes: ['relacje z obozów', 'zdjęcia uczestników', 'aktywne wakacje'], emphasis: 'relacyjny' },
    8:  { season: 'lato', themes: ['podsumowanie obozów', 'zapisy jesień', 'powrót do treningów'], emphasis: 'sprzedażowy' },
    9:  { season: 'jesień', themes: ['start sezonu', 'nowe zapisy', 'treningi jesienne'], emphasis: 'sprzedażowy' },
    10: { season: 'jesień', themes: ['treningi', 'przygotowanie do zimy', 'zima preview'], emphasis: 'edukacyjny' },
    11: { season: 'jesień', themes: ['wyjazdy zimowe — zapisy', 'early bird', 'black friday'], emphasis: 'sprzedażowy' },
    12: { season: 'zima', themes: ['święta', 'sylwester', 'ferie — ostatnie miejsca'], emphasis: 'relacyjny' },
};

/**
 * Returns posting frequency guidance for the month.
 * BS: 3–4 posts/week. AP: 2–3 posts/week.
 */
export function getMonthPlan(channel, month) {
    const rule = SEASONAL_RULES[month];
    if (!rule) throw new Error(`Invalid month: ${month}. Must be 1–12.`);
    const postsPerWeek = channel === 'BS' ? 3 : 2;
    const weeksInMonth = 4;
    const totalPosts = postsPerWeek * weeksInMonth;

    return {
        ...rule,
        totalPosts,
        postsPerWeek,
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- __tests__/social/seasonal-rules.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/seasonal-rules.js __tests__/social/seasonal-rules.test.js
git commit -m "feat: add seasonal rules for month planning with tests"
```

---

### Task 11: Claude prompt builder

**Files:**
- Create: `src/lib/social/prompt-builder.js`
- Create: `__tests__/social/prompt-builder.test.js`

- [ ] **Step 1: Write the failing test**

```js
// __tests__/social/prompt-builder.test.js
import { describe, it, expect } from 'vitest';
import { buildGenerationPrompt } from '../../src/lib/social/prompt-builder.js';

describe('buildGenerationPrompt', () => {
    const baseInput = {
        channel: 'BS',
        postType: 'relacyjny',
        contextNote: 'Zdjęcie z obozu w Stubaital, dzieci na stoku',
        partners: [{ handle: '@fundacja_xyz', name: 'Fundacja XYZ' }],
        learningExamples: [],
    };

    it('includes channel tone of voice', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('BiegunSport');
    });

    it('includes context note', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('Stubaital');
    });

    it('includes partner handle', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('@fundacja_xyz');
    });

    it('includes few-shot examples when provided', () => {
        const withExamples = {
            ...baseInput,
            learningExamples: [{
                ai_version_fb: 'AI wrote this',
                human_version_fb: 'Human fixed this',
                ai_version_ig: 'AI IG',
                human_version_ig: 'Human IG',
            }],
        };
        const prompt = buildGenerationPrompt(withExamples);
        expect(prompt).toContain('AI wrote this');
        expect(prompt).toContain('Human fixed this');
    });

    it('requests both FB and IG versions', () => {
        const prompt = buildGenerationPrompt(baseInput);
        expect(prompt).toContain('Facebook');
        expect(prompt).toContain('Instagram');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- __tests__/social/prompt-builder.test.js
```
Expected: FAIL.

- [ ] **Step 3: Write prompt-builder.js**

```js
// src/lib/social/prompt-builder.js
import { getChannelConfig } from './channel-config.js';

/**
 * Builds the full Claude prompt for text generation.
 * @param {object} input
 * @param {string} input.channel - 'BS' | 'AP'
 * @param {string} input.postType - 'relacyjny' | 'sprzedażowy' | 'treningowy' | 'edukacyjny'
 * @param {string} input.contextNote - user description of media/context
 * @param {Array} input.partners - [{ handle, name }]
 * @param {Array} input.learningExamples - last 3-5 learning pairs
 */
export function buildGenerationPrompt({ channel, postType, contextNote, partners, learningExamples }) {
    const config = getChannelConfig(channel);

    const partnerList = partners.length > 0
        ? partners.map(p => `${p.name} (${p.handle})`).join(', ')
        : 'brak partnerów dla tego posta';

    const examplesSection = learningExamples.length > 0
        ? `
## Przykłady uczenia (ostatnie zatwierdzenia użytkownika)

Użyj tych przykładów jako wzorzec stylu i tonu. To ważna wskazówka.

${learningExamples.map((ex, i) => `
### Przykład ${i + 1}
**AI napisało (FB):** ${ex.ai_version_fb}
**Użytkownik zatwierdził (FB):** ${ex.human_version_fb}

**AI napisało (IG):** ${ex.ai_version_ig}
**Użytkownik zatwierdził (IG):** ${ex.human_version_ig}
`).join('\n')}
`.trim()
        : '';

    return `
Jesteś copywriterem dla ${config.name}.

## Reguły kanału

${config.toneOfVoice}

## Reguły hashtagów

Facebook: ${config.hashtagRules.fb}
Instagram: ${config.hashtagRules.ig}

## Długości

Facebook: ${config.postTypeLengths.fb.min}–${config.postTypeLengths.fb.max} słów
Instagram: ${config.postTypeLengths.ig.min}–${config.postTypeLengths.ig.max} słów

## Partnerzy dostępni do oznaczenia

${partnerList}

Oznacz partnera (@handle) w treści TYLKO jeśli pasuje do kontekstu posta.

${examplesSection}

## Zadanie

Napisz post typu: **${postType}**

Kontekst / co jest na zdjęciu/filmie:
${contextNote || 'brak opisu — oprzyj się na typowym contencie kanału dla tego miesiąca'}

## Format odpowiedzi

Odpowiedz TYLKO w formacie JSON, bez żadnego dodatkowego tekstu:

{
  "fb": "<tekst posta na Facebook>",
  "ig": "<tekst posta na Instagram>"
}
`.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- __tests__/social/prompt-builder.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/prompt-builder.js __tests__/social/prompt-builder.test.js
git commit -m "feat: add Claude prompt builder with tests"
```

---

### Task 12: Claude generate API endpoint

**Files:**
- Create: `api/social/generate.js`

- [ ] **Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Write generate.js**

```js
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

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
        });

        const raw = message.content[0].text.trim();
        // Parse JSON response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Claude did not return valid JSON');
        const generated = JSON.parse(jsonMatch[0]);

        // If regenerating, save prev version before updating
        if (post_id) {
            const { data: post } = await supabase
                .from('social_posts')
                .select('ai_content_fb, ai_content_ig')
                .eq('id', post_id)
                .single();

            if (post?.ai_content_fb) {
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
```

- [ ] **Step 3: Commit**

```bash
git add api/social/generate.js package.json package-lock.json
git commit -m "feat: add /api/social/generate Claude endpoint"
```

---

## Chunk 4: Google Drive + Vercel Blob

### Task 13: Google Drive API credentials setup

> This task requires the user to manually set up Google Cloud credentials. Skip if deferring Google Drive to v2.

- [ ] **Step 1: Set up Google Cloud project (Service Account — recommended)**

  **Option A — Service Account (simpler for server-side, no expiry issues):**
  1. Go to console.cloud.google.com
  2. Create project or select existing → Enable: Google Drive API
  3. IAM & Admin → Service Accounts → Create service account
  4. Keys tab → Add Key → JSON → download the JSON file
  5. Share the Drive folder(s) with the service account email (e.g. `svc@project.iam.gserviceaccount.com`)
  6. Store the entire JSON as a single-line string in `GOOGLE_SERVICE_ACCOUNT_JSON` env var
  7. Update `getDriveClient()` in `drive-browse.js` and `drive-download.js`:
  ```js
  function getDriveClient() {
      const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      });
      return google.drive({ version: 'v3', auth });
  }
  ```

  **Option B — OAuth Refresh Token (if service account not feasible):**
  > ⚠️ Google deprecated the OOB (`urn:ietf:wg:oauth:2.0:oob`) redirect. Use a local redirect server instead.
  1. Create OAuth 2.0 credentials with redirect `http://localhost:9999/callback`
  2. Run the script below which starts a local server to capture the code:

```js
// scripts/get-drive-token.js (run once locally, then delete)
import { google } from 'googleapis';
import http from 'http';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    'http://localhost:9999/callback'
);

const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
});

console.log('Open this URL:', url);

const server = http.createServer(async (req, res) => {
    const code = new URL(req.url, 'http://localhost:9999').searchParams.get('code');
    if (code) {
        const { tokens } = await oauth2Client.getToken(code);
        console.log('REFRESH TOKEN:', tokens.refresh_token);
        res.end('Done — close this tab.');
        server.close();
    }
});
server.listen(9999);
```

- [ ] **Step 3: Install googleapis and Vercel Blob**

```bash
npm install googleapis @vercel/blob
```

- [ ] **Step 4: Add env vars**

Add to `.env.local`:
```
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...
BLOB_READ_WRITE_TOKEN=...
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add googleapis and @vercel/blob dependencies"
```

---

### Task 14: Drive browse + download API endpoints

**Files:**
- Create: `api/social/drive-browse.js`
- Create: `api/social/drive-download.js`

- [ ] **Step 1: Write drive-browse.js**

```js
// api/social/drive-browse.js
// GET /api/social/drive-browse?folderId=<id>
// Lists files/folders in a Google Drive folder.

import { google } from 'googleapis';

function getDriveClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth });
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const folderId = req.query.folderId || 'root';

    try {
        const drive = getDriveClient();
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, thumbnailLink, size)',
            orderBy: 'modifiedTime desc',
            pageSize: 50,
        });

        const files = (response.data.files || []).map(f => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            thumbnail: f.thumbnailLink,
            isFolder: f.mimeType === 'application/vnd.google-apps.folder',
            size: f.size,
        }));

        return res.status(200).json({ files });
    } catch (err) {
        console.error('drive-browse error:', err);
        return res.status(500).json({ error: 'Nie można pobrać pliku. Sprawdź uprawnienia w Drive.' });
    }
}
```

- [ ] **Step 2: Write drive-download.js**

```js
// api/social/drive-download.js
// POST /api/social/drive-download
// Body: { drive_file_id, post_id }
// Downloads file from Google Drive, uploads to Vercel Blob, updates post.

import { google } from 'googleapis';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getDriveClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_DRIVE_CLIENT_ID,
        process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
    return google.drive({ version: 'v3', auth });
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_MIMES = ['video/mp4', 'video/mov', 'video/quicktime'];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { drive_file_id, post_id } = req.body;
    if (!drive_file_id || !post_id) {
        return res.status(400).json({ error: 'drive_file_id and post_id required' });
    }

    try {
        const drive = getDriveClient();

        // Get file metadata
        const meta = await drive.files.get({
            fileId: drive_file_id,
            fields: 'id, name, mimeType, size',
        });
        const { name, mimeType, size } = meta.data;

        // Guard against oversized files (200 MB limit)
        const MAX_BYTES = 200 * 1024 * 1024;
        if (size && parseInt(size, 10) > MAX_BYTES) {
            return res.status(400).json({ error: 'Plik jest za duży (maks. 200 MB).' });
        }

        // Determine media type
        let mediaType;
        if (IMAGE_MIMES.includes(mimeType)) mediaType = 'image';
        else if (VIDEO_MIMES.includes(mimeType)) mediaType = 'video';
        else return res.status(400).json({ error: `Unsupported file type: ${mimeType}` });

        // Download file stream
        const fileStream = await drive.files.get(
            { fileId: drive_file_id, alt: 'media' },
            { responseType: 'stream' }
        );

        // Upload to Vercel Blob
        const blob = await put(`social-media/${post_id}/${name}`, fileStream.data, {
            access: 'public',
            contentType: mimeType,
        });

        // Update post record
        await supabase.from('social_posts').update({
            media_drive_id: drive_file_id,
            media_public_url: blob.url,
            media_type: mediaType,
        }).eq('id', post_id);

        return res.status(200).json({ url: blob.url, media_type: mediaType });
    } catch (err) {
        console.error('drive-download error:', err);
        return res.status(500).json({ error: 'Nie można pobrać pliku. Sprawdź uprawnienia w Drive.' });
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add api/social/drive-browse.js api/social/drive-download.js
git commit -m "feat: add Google Drive browse and download-to-blob API endpoints"
```

---

## Chunk 5: Social Media UI

### Task 15: SocialMedia page shell + PostTable

**Files:**
- Modify: `src/pages/SocialMedia.jsx`
- Modify: `src/pages/SocialMedia.css`
- Create: `src/pages/social/PostTable.jsx`

- [ ] **Step 1: Write PostTable.jsx**

```jsx
// src/pages/social/PostTable.jsx
import React from 'react';
import { CheckSquare, Square } from 'lucide-react';

const STATUS_COLORS = {
    draft: '#6b7280',
    approved: '#2563eb',
    published: '#16a34a',
    failed: '#dc2626',
};

const STATUS_LABELS = {
    draft: 'Draft',
    approved: 'Zatwierdzony',
    published: 'Opublikowany',
    failed: 'Błąd',
};

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Warsaw',
    });
}

export default function PostTable({ posts, onRowClick, onToggleApprove }) {
    if (!posts || posts.length === 0) {
        return <p className="post-table-empty">Brak zaplanowanych postów.</p>;
    }

    return (
        <table className="post-table">
            <thead>
                <tr>
                    <th>Media</th>
                    <th>Tekst</th>
                    <th>Termin</th>
                    <th>Gdzie</th>
                    <th>Status</th>
                    <th>Zatwierdź</th>
                </tr>
            </thead>
            <tbody>
                {posts.map(post => (
                    <tr
                        key={post.id}
                        className={`post-row ${post.status}`}
                        onClick={() => onRowClick(post)}
                        style={{ cursor: 'pointer' }}
                    >
                        <td className="post-media-cell">
                            {post.media_public_url
                                ? post.media_type === 'video'
                                    ? <span className="media-icon">🎬</span>
                                    : <img src={post.media_public_url} alt="" className="post-thumbnail" />
                                : <span className="no-media">— brak mediów</span>
                            }
                        </td>
                        <td className="post-text-cell">
                            {(post.final_content_fb || post.ai_content_fb || '—').substring(0, 80)}...
                        </td>
                        <td>{formatDateTime(post.scheduled_at)}</td>
                        <td>
                            {[post.publish_fb && 'FB', post.publish_ig && 'IG'].filter(Boolean).join(' + ')}
                        </td>
                        <td>
                            <span
                                className="status-badge"
                                style={{ backgroundColor: STATUS_COLORS[post.status] }}
                            >
                                {STATUS_LABELS[post.status]}
                            </span>
                        </td>
                        <td onClick={e => { e.stopPropagation(); onToggleApprove(post); }}>
                            {post.status === 'approved' || post.status === 'published'
                                ? <CheckSquare size={18} color="#16a34a" />
                                : <Square size={18} color="#9ca3af" />
                            }
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
```

- [ ] **Step 2: Write SocialMedia.jsx (main page)**

```jsx
// src/pages/SocialMedia.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CalendarRange } from 'lucide-react';
import PostTable from './social/PostTable.jsx';
import PostEditPanel from './social/PostEditPanel.jsx';
import { getPosts, getPublishedPosts, createPost, updatePost } from '../lib/social/db.js';
import './SocialMedia.css';

const CHANNELS = [
    { id: 'BS', label: 'BiegunSport' },
    { id: 'AP', label: 'Akademia Pływania' },
];

export default function SocialMedia() {
    const [channel, setChannel] = useState('BS');
    const [posts, setPosts] = useState([]);
    const [publishedPosts, setPublishedPosts] = useState([]);
    const [publishedOpen, setPublishedOpen] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'error') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    const loadPosts = useCallback(async () => {
        setLoading(true);
        try {
            const [active, published] = await Promise.all([
                getPosts(channel),
                getPublishedPosts(channel),
            ]);
            setPosts(active);
            setPublishedPosts(published);
        } catch (e) {
            showToast('Błąd ładowania postów.');
        } finally {
            setLoading(false);
        }
    }, [channel]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    const handleNewPost = async () => {
        const post = await createPost({
            channel,
            status: 'draft',
            publish_fb: true,
            publish_ig: true,
        });
        await loadPosts();
        setEditingPost(post);
    };

    const handleToggleApprove = async (post) => {
        if (post.status === 'published') return; // can't unapprove published
        const newStatus = post.status === 'approved' ? 'draft' : 'approved';

        // Validate: must have at least one platform
        if (newStatus === 'approved' && !post.publish_fb && !post.publish_ig) {
            showToast('Post musi być zaplanowany na przynajmniej jeden kanał.');
            return;
        }

        await updatePost(post.id, { status: newStatus });
        await loadPosts();
    };

    return (
        <div className="social-media-page">
            {/* Channel tabs */}
            <div className="social-toolbar">
                <div className="channel-tabs">
                    {CHANNELS.map(ch => (
                        <button
                            key={ch.id}
                            className={`channel-tab ${channel === ch.id ? 'active' : ''}`}
                            onClick={() => setChannel(ch.id)}
                        >
                            {ch.label}
                        </button>
                    ))}
                </div>
                <div className="social-actions">
                    <button className="btn-secondary" onClick={() => {}}>
                        <CalendarRange size={15} />
                        Zaplanuj miesiąc
                    </button>
                    <button className="btn-primary" onClick={handleNewPost}>
                        <Plus size={15} />
                        Nowy post
                    </button>
                </div>
            </div>

            {/* Post table */}
            {loading
                ? <p className="loading-text">Ładowanie...</p>
                : <PostTable
                    posts={posts}
                    onRowClick={setEditingPost}
                    onToggleApprove={handleToggleApprove}
                />
            }

            {/* Published section (collapsible) */}
            <div className="published-section">
                <button
                    className="published-toggle"
                    onClick={() => setPublishedOpen(o => !o)}
                >
                    {publishedOpen ? '▲' : '▼'} Opublikowane ({publishedPosts.length})
                </button>
                {publishedOpen && (
                    <PostTable
                        posts={publishedPosts}
                        onRowClick={setEditingPost}
                        onToggleApprove={() => {}} // read-only
                    />
                )}
            </div>

            {/* Edit panel */}
            {editingPost && (
                <PostEditPanel
                    post={editingPost}
                    channel={channel}
                    onClose={() => { setEditingPost(null); loadPosts(); }}
                    onToast={showToast}
                />
            )}

            {/* Toast */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Write SocialMedia.css**

```css
/* src/pages/SocialMedia.css */
.social-media-page {
    padding: 0;
    position: relative;
}

.social-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    gap: 12px;
}

.channel-tabs {
    display: flex;
    gap: 4px;
    background: #f3f4f6;
    padding: 4px;
    border-radius: 8px;
}

.channel-tab {
    padding: 6px 16px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    color: #6b7280;
    transition: all 0.15s;
}

.channel-tab.active {
    background: #fff;
    color: #111827;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.social-actions {
    display: flex;
    gap: 8px;
}

.btn-primary, .btn-secondary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    border: none;
    font-weight: 500;
}

.btn-primary {
    background: #2563eb;
    color: #fff;
}

.btn-primary:hover { background: #1d4ed8; }

.btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
}

.btn-secondary:hover { background: #e5e7eb; }

/* Post table */
.post-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.post-table th {
    text-align: left;
    padding: 8px 12px;
    color: #6b7280;
    font-weight: 500;
    border-bottom: 1px solid #e5e7eb;
}

.post-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f3f4f6;
    vertical-align: middle;
}

.post-row:hover td { background: #f9fafb; }

.post-thumbnail {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 4px;
}

.no-media {
    color: #9ca3af;
    font-style: italic;
}

.media-icon {
    font-size: 20px;
}

.post-text-cell {
    max-width: 280px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #374151;
}

.status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    color: #fff;
    font-size: 11px;
    font-weight: 500;
}

.post-table-empty, .loading-text {
    color: #9ca3af;
    padding: 32px 0;
    text-align: center;
}

/* Published section */
.published-section {
    margin-top: 32px;
    border-top: 1px solid #e5e7eb;
    padding-top: 16px;
}

.published-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
    padding: 0;
}

.published-toggle:hover { color: #374151; }

/* Toast */
.toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.toast-error { background: #dc2626; color: #fff; }
.toast-success { background: #16a34a; color: #fff; }
```

- [ ] **Step 4: Test in browser**

Run `vercel dev`, navigate to `/social`.
Expected: Channel tabs, empty table, "+ Nowy post" button visible.
Click "+ Nowy post" → edit panel should open (placeholder if PostEditPanel not yet done).
Note: "Zaplanuj miesiąc" button is intentionally non-functional until Task 18.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SocialMedia.jsx src/pages/SocialMedia.css src/pages/social/PostTable.jsx
git commit -m "feat: add Social Media page with channel tabs and post table"
```

---

### Task 16: PostEditPanel (modal)

**Files:**
- Create: `src/pages/social/PostEditPanel.jsx`
- Create: `src/pages/social/PartnerPicker.jsx`
- Create: `src/pages/social/DriveFilePicker.jsx`

- [ ] **Step 1: Install date-fns-tz for correct timezone handling**

```bash
npm install date-fns-tz
```

Update `fromLocalInput` in `PostEditPanel.jsx` to use `date-fns-tz`:

```js
import { fromZonedTime } from 'date-fns-tz';

function fromLocalInput(localStr) {
    if (!localStr) return null;
    return fromZonedTime(localStr, 'Europe/Warsaw').toISOString();
}
```

And `toLocalInput`:
```js
import { toZonedTime, format } from 'date-fns-tz';

function toLocalInput(iso) {
    if (!iso) return '';
    const zoned = toZonedTime(new Date(iso), 'Europe/Warsaw');
    return format(zoned, "yyyy-MM-dd'T'HH:mm", { timeZone: 'Europe/Warsaw' });
}
```

- [ ] **Step 2: Write PartnerPicker.jsx**

```jsx
// src/pages/social/PartnerPicker.jsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function PartnerPicker({ partners, selectedIds, onToggle, onAddPartner }) {
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newHandle, setNewHandle] = useState('');

    const handleAdd = () => {
        if (!newName.trim() || !newHandle.trim()) return;
        onAddPartner({ name: newName.trim(), handle: newHandle.trim() });
        setNewName('');
        setNewHandle('');
        setShowAdd(false);
    };

    return (
        <div className="partner-picker">
            <p className="partner-picker-title">Partnerzy:</p>
            {partners.map(p => (
                <label key={p.id} className="partner-item">
                    <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => onToggle(p.id)}
                    />
                    <span>{p.name}</span>
                    <span className="partner-handle">{p.handle}</span>
                </label>
            ))}
            {showAdd ? (
                <div className="partner-add-form">
                    <input
                        placeholder="Nazwa (np. Fundacja XYZ)"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <input
                        placeholder="@handle"
                        value={newHandle}
                        onChange={e => setNewHandle(e.target.value)}
                    />
                    <button onClick={handleAdd} className="btn-small-primary">Dodaj</button>
                    <button onClick={() => setShowAdd(false)} className="btn-small-ghost"><X size={14} /></button>
                </div>
            ) : (
                <button onClick={() => setShowAdd(true)} className="partner-add-btn">
                    <Plus size={13} /> Dodaj nowe konto
                </button>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Write DriveFilePicker.jsx**

```jsx
// src/pages/social/DriveFilePicker.jsx
import React, { useState, useEffect } from 'react';
import { FolderOpen, Image, Film, ArrowLeft } from 'lucide-react';

export default function DriveFilePicker({ postId, onSelect, onClose }) {
    const [folderId, setFolderId] = useState('root');
    const [folderStack, setFolderStack] = useState([]);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        loadFolder(folderId);
    }, [folderId]);

    const loadFolder = async (id) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/social/drive-browse?folderId=${id}`);
            const data = await res.json();
            setFiles(data.files || []);
        } catch (e) {
            // handled silently — empty state shown
        } finally {
            setLoading(false);
        }
    };

    const handleFileClick = async (file) => {
        if (file.isFolder) {
            setFolderStack(s => [...s, folderId]);
            setFolderId(file.id);
            return;
        }

        setUploading(true);
        try {
            const res = await fetch('/api/social/drive-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drive_file_id: file.id, post_id: postId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            onSelect({ url: data.url, media_type: data.media_type });
        } catch (e) {
            alert('Nie można pobrać pliku. Sprawdź uprawnienia w Drive.');
        } finally {
            setUploading(false);
        }
    };

    const handleBack = () => {
        const prev = folderStack[folderStack.length - 1];
        setFolderStack(s => s.slice(0, -1));
        setFolderId(prev || 'root');
    };

    return (
        <div className="drive-picker-overlay" onClick={onClose}>
            <div className="drive-picker" onClick={e => e.stopPropagation()}>
                <div className="drive-picker-header">
                    {folderStack.length > 0 && (
                        <button onClick={handleBack} className="back-btn"><ArrowLeft size={15} /> Wróć</button>
                    )}
                    <span>Google Drive</span>
                    <button onClick={onClose} className="close-btn">✕</button>
                </div>
                {uploading && <div className="drive-uploading">Pobieranie pliku...</div>}
                {loading ? (
                    <p className="drive-loading">Ładowanie...</p>
                ) : (
                    <div className="drive-file-list">
                        {files.map(f => (
                            <button key={f.id} className="drive-file-item" onClick={() => handleFileClick(f)}>
                                {f.isFolder
                                    ? <FolderOpen size={18} />
                                    : f.mimeType?.startsWith('video/') ? <Film size={18} /> : <Image size={18} />
                                }
                                <span>{f.name}</span>
                                {f.thumbnail && <img src={f.thumbnail} alt="" className="drive-thumb" />}
                            </button>
                        ))}
                        {files.length === 0 && <p className="drive-empty">Brak plików.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Write PostEditPanel.jsx**

```jsx
// src/pages/social/PostEditPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Save, CheckSquare, Trash2 } from 'lucide-react';
import PartnerPicker from './PartnerPicker.jsx';
import DriveFilePicker from './DriveFilePicker.jsx';
import { updatePost, deletePost, getPartners, createPartner, setPostPartners } from '../../lib/social/db.js';

const POST_TYPES = ['relacyjny', 'sprzedażowy', 'treningowy', 'edukacyjny'];

function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    // Convert UTC → Europe/Warsaw for display
    const warsaw = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
    const pad = n => String(n).padStart(2, '0');
    return `${warsaw.getFullYear()}-${pad(warsaw.getMonth()+1)}-${pad(warsaw.getDate())}T${pad(warsaw.getHours())}:${pad(warsaw.getMinutes())}`;
}

function fromLocalInput(localStr) {
    if (!localStr) return null;
    // Treat input as Europe/Warsaw → convert to UTC ISO string
    const date = new Date(localStr + ':00');
    return date.toISOString(); // JS Date parses as local TZ — for production, use date-fns-tz
}

export default function PostEditPanel({ post, channel, onClose, onToast }) {
    const [contentFb, setContentFb] = useState(post.final_content_fb || post.ai_content_fb || '');
    const [contentIg, setContentIg] = useState(post.final_content_ig || post.ai_content_ig || '');
    const [prevFb, setPrevFb] = useState(post.prev_ai_content_fb || '');
    const [prevIg, setPrevIg] = useState(post.prev_ai_content_ig || '');
    const [scheduledAt, setScheduledAt] = useState(toLocalInput(post.scheduled_at));
    const [publishFb, setPublishFb] = useState(post.publish_fb ?? true);
    const [publishIg, setPublishIg] = useState(post.publish_ig ?? true);
    const [postType, setPostType] = useState(post.post_type || 'relacyjny');
    const [contextNote, setContextNote] = useState(post.context_note || '');
    const [partners, setPartners] = useState([]);
    const [selectedPartnerIds, setSelectedPartnerIds] = useState([]);
    const [showDrive, setShowDrive] = useState(false);
    const [mediaUrl, setMediaUrl] = useState(post.media_public_url || null);
    const [mediaType, setMediaType] = useState(post.media_type || null);
    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadPartners();
        // Load selected partner IDs from post
        const ids = (post.social_post_partners || []).map(pp => pp.partner_id);
        setSelectedPartnerIds(ids);
    }, [post.id]);

    const loadPartners = async () => {
        const list = await getPartners(channel);
        setPartners(list);
    };

    const handleTogglePartner = (id) => {
        setSelectedPartnerIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleAddPartner = async (partnerData) => {
        const newP = await createPartner({ ...partnerData, channel });
        await loadPartners();
        setSelectedPartnerIds(prev => [...prev, newP.id]);
    };

    const handleRegenerate = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/api/social/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    post_id: post.id,
                    channel,
                    post_type: postType,
                    context_note: contextNote,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPrevFb(contentFb);
            setPrevIg(contentIg);
            setContentFb(data.fb);
            setContentIg(data.ig);
        } catch (e) {
            onToast('Nie udało się wygenerować tekstu. Spróbuj ponownie.');
        } finally {
            setGenerating(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updatePost(post.id, {
                final_content_fb: contentFb,
                final_content_ig: contentIg,
                scheduled_at: fromLocalInput(scheduledAt),
                publish_fb: publishFb,
                publish_ig: publishIg,
                post_type: postType,
                context_note: contextNote,
                status: 'draft',
            });
            await setPostPartners(post.id, selectedPartnerIds);
            onToast('Zapisano.', 'success');
        } catch (e) {
            onToast('Błąd zapisu.');
        } finally {
            setSaving(false);
        }
    };

    const handleApprove = async () => {
        if (!publishFb && !publishIg) {
            onToast('Wybierz przynajmniej jeden kanał (FB lub IG).');
            return;
        }
        setSaving(true);
        try {
            await updatePost(post.id, {
                final_content_fb: contentFb,
                final_content_ig: contentIg,
                scheduled_at: fromLocalInput(scheduledAt),
                publish_fb: publishFb,
                publish_ig: publishIg,
                post_type: postType,
                context_note: contextNote,
                status: 'approved',
            });
            await setPostPartners(post.id, selectedPartnerIds);

            // Send to Zernio
            const res = await fetch('/api/social/publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post_id: post.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            onToast('Post wysłany do Zernio.', 'success');
            onClose();
        } catch (e) {
            onToast('Błąd wysyłki do Zernio. Post zapisany jako draft.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('Usunąć ten draft?')) return;
        try {
            await deletePost(post.id);
            onClose();
        } catch (e) {
            onToast('Nie można usunąć posta.');
        }
    };

    const isReadOnly = post.status === 'published';

    return (
        <div className="edit-panel-overlay" onClick={onClose}>
            <div className="edit-panel" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="edit-panel-header">
                    <span>Edytuj post</span>
                    <button onClick={onClose} className="close-btn"><X size={16} /></button>
                </div>

                {/* Media */}
                <div className="edit-media">
                    {mediaUrl
                        ? mediaType === 'video'
                            ? <video src={mediaUrl} controls className="edit-media-preview" />
                            : <img src={mediaUrl} alt="" className="edit-media-preview" />
                        : <div className="edit-media-placeholder">Brak mediów</div>
                    }
                    {!isReadOnly && (
                        <button className="btn-secondary mt-8" onClick={() => setShowDrive(true)}>
                            Zmień media z Google Drive
                        </button>
                    )}
                </div>

                {/* Context note */}
                {!isReadOnly && (
                    <div className="edit-field">
                        <label>Opis mediów (dla Claude):</label>
                        <input
                            value={contextNote}
                            onChange={e => setContextNote(e.target.value)}
                            placeholder="Co jest na zdjęciu/filmie?"
                            className="edit-input"
                        />
                    </div>
                )}

                {/* Post type */}
                {!isReadOnly && (
                    <div className="edit-field">
                        <label>Typ posta:</label>
                        <select value={postType} onChange={e => setPostType(e.target.value)} className="edit-select">
                            {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}

                {/* FB text */}
                <div className="edit-field">
                    <label>Facebook:</label>
                    {prevFb && (
                        <details className="prev-version">
                            <summary>Poprzednia wersja AI</summary>
                            <p>{prevFb}</p>
                        </details>
                    )}
                    <textarea
                        value={contentFb}
                        onChange={e => setContentFb(e.target.value)}
                        rows={6}
                        disabled={isReadOnly}
                        className="edit-textarea"
                    />
                </div>

                {/* IG text */}
                <div className="edit-field">
                    <label>Instagram:</label>
                    {prevIg && (
                        <details className="prev-version">
                            <summary>Poprzednia wersja AI</summary>
                            <p>{prevIg}</p>
                        </details>
                    )}
                    <textarea
                        value={contentIg}
                        onChange={e => setContentIg(e.target.value)}
                        rows={4}
                        disabled={isReadOnly}
                        className="edit-textarea"
                    />
                </div>

                {/* Partners */}
                {!isReadOnly && (
                    <PartnerPicker
                        partners={partners}
                        selectedIds={selectedPartnerIds}
                        onToggle={handleTogglePartner}
                        onAddPartner={handleAddPartner}
                    />
                )}

                {/* Schedule + platforms */}
                <div className="edit-row">
                    <div className="edit-field">
                        <label>Termin:</label>
                        <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={e => setScheduledAt(e.target.value)}
                            disabled={isReadOnly}
                            className="edit-input"
                        />
                    </div>
                    <div className="edit-field">
                        <label>Gdzie:</label>
                        <div className="platform-checks">
                            <label>
                                <input type="checkbox" checked={publishFb} onChange={e => setPublishFb(e.target.checked)} disabled={isReadOnly} />
                                FB
                            </label>
                            <label>
                                <input type="checkbox" checked={publishIg} onChange={e => setPublishIg(e.target.checked)} disabled={isReadOnly} />
                                IG
                            </label>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                {!isReadOnly && (
                    <div className="edit-actions">
                        <button onClick={handleDelete} className="btn-danger-ghost">
                            <Trash2 size={14} /> Usuń draft
                        </button>
                        <div className="edit-actions-right">
                            <button onClick={handleRegenerate} disabled={generating} className="btn-secondary">
                                <RefreshCw size={14} className={generating ? 'spin' : ''} />
                                {generating ? 'Generowanie...' : 'Regeneruj tekst'}
                            </button>
                            <button onClick={handleSave} disabled={saving} className="btn-secondary">
                                <Save size={14} /> Zapisz
                            </button>
                            <button onClick={handleApprove} disabled={saving} className="btn-primary">
                                <CheckSquare size={14} /> Zatwierdź
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {showDrive && (
                <DriveFilePicker
                    postId={post.id}
                    onSelect={({ url, media_type }) => {
                        setMediaUrl(url);
                        setMediaType(media_type);
                        setShowDrive(false);
                    }}
                    onClose={() => setShowDrive(false)}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 4: Add edit panel CSS to SocialMedia.css**

Append to `src/pages/SocialMedia.css`:

```css
/* Edit panel */
.edit-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 100;
    display: flex;
    justify-content: flex-end;
}

.edit-panel {
    background: #fff;
    width: 480px;
    max-width: 100vw;
    height: 100vh;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: -4px 0 24px rgba(0,0,0,0.12);
}

.edit-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 15px;
}

.close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    display: flex;
    align-items: center;
}

.edit-media-preview {
    width: 100%;
    max-height: 200px;
    object-fit: cover;
    border-radius: 8px;
}

.edit-media-placeholder {
    width: 100%;
    height: 100px;
    background: #f3f4f6;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    font-size: 13px;
}

.edit-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.edit-field label {
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
}

.edit-input, .edit-select {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 7px 10px;
    font-size: 13px;
    color: #111827;
}

.edit-textarea {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 13px;
    resize: vertical;
    font-family: inherit;
    color: #111827;
}

.edit-row {
    display: flex;
    gap: 12px;
}

.platform-checks {
    display: flex;
    gap: 12px;
    align-items: center;
    padding-top: 4px;
}

.platform-checks label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: #374151;
}

.edit-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid #f3f4f6;
    margin-top: 4px;
}

.edit-actions-right {
    display: flex;
    gap: 8px;
}

.btn-danger-ghost {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
}

.btn-small-primary {
    padding: 4px 10px;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
}

.btn-small-ghost {
    padding: 4px 6px;
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
}

.mt-8 { margin-top: 8px; }

.spin {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.prev-version {
    font-size: 11px;
    color: #9ca3af;
    margin-bottom: 4px;
}

.prev-version summary { cursor: pointer; }
.prev-version p { margin: 4px 0; padding: 6px; background: #f9fafb; border-radius: 4px; }

/* Partner picker */
.partner-picker {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 10px;
}

.partner-picker-title {
    font-size: 12px;
    color: #6b7280;
    font-weight: 500;
    margin: 0 0 6px;
}

.partner-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 13px;
    cursor: pointer;
}

.partner-handle { color: #6b7280; font-size: 12px; }

.partner-add-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    color: #2563eb;
    font-size: 12px;
    cursor: pointer;
    margin-top: 6px;
    padding: 0;
}

.partner-add-form {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    flex-wrap: wrap;
}

.partner-add-form input {
    flex: 1;
    min-width: 100px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
}

/* Drive picker */
.drive-picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
}

.drive-picker {
    background: #fff;
    border-radius: 12px;
    width: 500px;
    max-width: 90vw;
    max-height: 70vh;
    overflow-y: auto;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}

.drive-picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    font-weight: 500;
    font-size: 14px;
}

.back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    color: #2563eb;
    font-size: 13px;
}

.drive-file-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.drive-file-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 6px;
    text-align: left;
    font-size: 13px;
    color: #374151;
    width: 100%;
}

.drive-file-item:hover { background: #f3f4f6; }

.drive-thumb {
    width: 32px;
    height: 32px;
    object-fit: cover;
    border-radius: 4px;
    margin-left: auto;
}

.drive-loading, .drive-empty, .drive-uploading {
    text-align: center;
    padding: 20px;
    color: #9ca3af;
    font-size: 13px;
}

.drive-uploading { color: #2563eb; }
```

- [ ] **Step 5: Test edit panel in browser**

Click any row → panel should slide in from right.
Test: text areas editable, datetime picker works, platform checkboxes work.
Test: "Regeneruj tekst" calls `/api/social/generate` (check Network tab).

- [ ] **Step 6: Commit**

```bash
git add src/pages/social/ src/pages/SocialMedia.css
git commit -m "feat: add PostEditPanel, PartnerPicker, DriveFilePicker"
```

---

## Chunk 6: Learning System + "Zaplanuj miesiąc"

### Task 17: Save learning example on approve

**Files:**
- Modify: `api/social/publish.js`

- [ ] **Step 1: Update publish.js to save learning example when user edited text**

> ⚠️ **Do NOT import from `src/lib/social/db.js`** — it uses `import.meta.env` which fails in Node.js serverless context. Use the `supabase` instance already in `publish.js` (see Notes section).

After the Zernio publish succeeds, add:

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add api/social/publish.js
git commit -m "feat: save learning examples on post approval for few-shot improvement"
```

---

### Task 18: "Zaplanuj miesiąc" agent

**Files:**
- Create: `api/social/plan-month.js`
- Create: `src/pages/social/PlanMonthModal.jsx`

- [ ] **Step 1: Write plan-month.js**

```js
// api/social/plan-month.js
// POST /api/social/plan-month
// Body: { channel }
// Generates a month's worth of draft posts using Claude + seasonal rules.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { fromZonedTime } from 'date-fns-tz';
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
    const year = now.getFullYear();
    const plan = getMonthPlan(channel, month);
    const config = getChannelConfig(channel);

    const prompt = `
Jesteś planistą contentu dla ${config.name}.

Zaplanuj ${plan.totalPosts} postów na ${month}/${year}.

Sezon: ${plan.season}
Główne tematy: ${plan.themes.join(', ')}
Nacisk: ${plan.emphasis}

Reguły kanału:
${config.toneOfVoice}

Odpowiedz TYLKO w formacie JSON (tablica):
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "post_type": "relacyjny|sprzedażowy|treningowy|edukacyjny",
    "topic": "krótki opis tematu posta (1 zdanie)"
  }
]

Rozłóż posty równomiernie po tygodniu. Nie planuj w weekendy.
Zacznij od najbliższego dnia roboczego.
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

        // Create draft posts — use date-fns-tz to handle CET/CEST correctly
        const drafts = postPlan.map(item => ({
            channel,
            status: 'draft',
            scheduled_at: fromZonedTime(`${item.date}T${item.time}:00`, 'Europe/Warsaw').toISOString(),
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

                const prompt = buildGenerationPrompt({
                    channel,
                    postType: draft.post_type,
                    contextNote: draft.context_note || '',
                    partners: [],
                    learningExamples: examples || [],
                });

                const msg = await anthropic.messages.create({
                    model: 'claude-sonnet-4-6',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }],
                });
                const raw = msg.content[0].text.trim();
                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const gen = JSON.parse(jsonMatch[0]);
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
```

- [ ] **Step 2: Write PlanMonthModal.jsx**

```jsx
// src/pages/social/PlanMonthModal.jsx
import React, { useState } from 'react';
import { X, CalendarRange } from 'lucide-react';

export default function PlanMonthModal({ channel, onClose, onComplete }) {
    const [status, setStatus] = useState('idle'); // idle | loading | done | error
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleStart = async () => {
        setStatus('loading');
        try {
            const res = await fetch('/api/social/plan-month', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResult(data);
            setStatus('done');
        } catch (e) {
            setError(e.message);
            setStatus('error');
        }
    };

    return (
        <div className="edit-panel-overlay" onClick={onClose}>
            <div className="plan-month-modal" onClick={e => e.stopPropagation()}>
                <div className="edit-panel-header">
                    <span>Zaplanuj miesiąc</span>
                    <button onClick={onClose} className="close-btn"><X size={16} /></button>
                </div>

                {status === 'idle' && (
                    <>
                        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                            Claude wygeneruje plan postów na bieżący miesiąc dla kanału <strong>{channel === 'BS' ? 'BiegunSport' : 'Akademia Pływania'}</strong>.
                            Posty trafią do tabeli jako drafty — uzupełnisz media i zatwierdzisz każdy z osobna.
                        </p>
                        <button className="btn-primary" onClick={handleStart} style={{ marginTop: 8 }}>
                            <CalendarRange size={15} /> Generuj plan
                        </button>
                    </>
                )}

                {status === 'loading' && (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
                        <div className="spin" style={{ display: 'inline-block', fontSize: 24 }}>⟳</div>
                        <p>Generowanie planu... (może potrwać 30–60 sekund)</p>
                    </div>
                )}

                {status === 'done' && (
                    <>
                        <p style={{ color: '#16a34a', fontWeight: 500 }}>
                            Gotowe! Utworzono {result.count} postów-draftów.
                        </p>
                        <ul style={{ fontSize: 13, color: '#374151', paddingLeft: 16 }}>
                            {result.posts.slice(0, 5).map((p, i) => (
                                <li key={i}>
                                    {new Date(p.scheduled_at).toLocaleDateString('pl-PL')} — {p.post_type} — {p.context_note}
                                </li>
                            ))}
                            {result.posts.length > 5 && <li>...i {result.posts.length - 5} więcej</li>}
                        </ul>
                        <button className="btn-primary" onClick={() => { onComplete(); onClose(); }}>
                            Zamknij i odśwież
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <p style={{ color: '#dc2626' }}>{error}</p>
                        <button className="btn-secondary" onClick={() => setStatus('idle')}>Spróbuj ponownie</button>
                    </>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Add plan-month-modal CSS to SocialMedia.css**

Append to `src/pages/SocialMedia.css`:
```css
.plan-month-modal {
    background: #fff;
    border-radius: 12px;
    width: 480px;
    max-width: 90vw;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    margin: auto;
}
```

- [ ] **Step 4: Wire up "Zaplanuj miesiąc" button in SocialMedia.jsx**

Add state: `const [showPlanMonth, setShowPlanMonth] = useState(false);`

Update button `onClick`:
```jsx
onClick={() => setShowPlanMonth(true)}
```

Add below PostTable render:
```jsx
{showPlanMonth && (
    <PlanMonthModal
        channel={channel}
        onClose={() => setShowPlanMonth(false)}
        onComplete={loadPosts}
    />
)}
```

Add import at top:
```jsx
import PlanMonthModal from './social/PlanMonthModal.jsx';
```

- [ ] **Step 5: Commit**

```bash
git add api/social/plan-month.js src/pages/social/PlanMonthModal.jsx src/pages/SocialMedia.jsx src/pages/SocialMedia.css
git commit -m "feat: add month planning agent with PlanMonthModal"
```

---

## Chunk 7: Final Integration + Deploy

### Task 19: Run all tests

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: all tests pass (channel-config, prompt-builder, zernio-client).

- [ ] **Step 2: Fix any failing tests before proceeding**

---

### Task 20: Verify Zernio API endpoint

- [ ] **Step 1: Check Zernio docs**

Open https://zernio.com/docs and verify:
- Base URL (update `ZERNIO_BASE` in `src/lib/social/zernio-client.js` if different)
- `POST /v1/posts` payload field names (text, media_url, platforms, scheduled_at)
- Status poll response field name (`status` field)
- Response `id` or `post_id` field after create

- [ ] **Step 2: Update zernio-client.js field names if needed**

Adjust `buildZernioPayload` and `getZernioPostStatus` field names to match actual API.

- [ ] **Step 3: Commit any fixes (skip if no changes were required)**

```bash
git add src/lib/social/zernio-client.js __tests__/social/zernio-client.test.js
git commit -m "fix: update Zernio API field names to match actual API docs"
```

---

### Task 21: Deploy to Vercel

- [ ] **Step 1: Add all env vars to Vercel project**

In Vercel Dashboard → Project → Settings → Environment Variables, add all vars from Prerequisites section.

- [ ] **Step 2: Configure Zernio webhook**

In Zernio dashboard, set webhook URL to:
`https://finanse-firma.vercel.app/api/social/zernio-webhook`
Set the shared secret to match `ZERNIO_WEBHOOK_SECRET`.

- [ ] **Step 3: Deploy**

```bash
git push origin main
```

- [ ] **Step 4: Verify deployment**

- Navigate to production URL `/social`
- Check Vercel build logs for errors
- Create a test post, approve, verify it appears in Zernio queue

- [ ] **Step 5: Test "Zaplanuj miesiąc"**

Click "Zaplanuj miesiąc" for BS channel — verify drafts appear in table.

---

### Task 22: End-to-end smoke test checklist

- [ ] Nav item "Social Media" visible and links to `/social`
- [ ] Channel tabs switch between BS and AP
- [ ] "+ Nowy post" creates a draft row in table
- [ ] Clicking row opens edit panel
- [ ] "Regeneruj tekst" calls Claude and fills FB/IG fields
- [ ] Saving stores to Supabase
- [ ] Approving sends to Zernio (check Zernio dashboard)
- [ ] Webhook or cron updates status to `published`
- [ ] Google Drive picker browses files
- [ ] Selecting a file downloads and shows thumbnail
- [ ] "Zaplanuj miesiąc" creates multiple drafts
- [ ] Published posts visible in collapsible section

---

## Notes for Implementation

**Timezone handling:** All UTC conversions use `date-fns-tz` (installed in Task 16). `fromZonedTime` handles CET/CEST DST transitions correctly for Europe/Warsaw.

**Zernio API field names:** Must be verified against actual docs before Task 20 — field names in `zernio-client.js` are best guesses from the spec. Update `buildZernioPayload` and `getZernioPostStatus` field names as needed.

**Google Drive auth:** Service account (Task 13 Option A) is recommended over OAuth refresh tokens — no expiry, no OOB redirect issues.

**`db.js` in API functions:** `src/lib/social/db.js` uses `import.meta.env.VITE_*` for Supabase credentials. API functions use `process.env.*`. The db.js file imports from `supabaseClient.js` which uses `import.meta.env` — this will fail in Node.js API context. Solution: in `api/social/publish.js` (and any API function that needs Supabase), create the Supabase client directly with `process.env`, as already done in those files. Only use `db.js` helpers from the React frontend. For `saveLearningExample`, the implementation in `publish.js` already creates its own supabase client — the import of `saveLearningExample` from `db.js` in Task 17 will fail in Node.js. Instead, inline the insert + trim logic in `publish.js` using the existing `supabase` instance already defined there.

**vercel dev:** Use `vercel dev` instead of `npm run dev` for local development to test API functions.
