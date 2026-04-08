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
