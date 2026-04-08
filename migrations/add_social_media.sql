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
