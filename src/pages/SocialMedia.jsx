// src/pages/SocialMedia.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CalendarRange, RefreshCw } from 'lucide-react';
import PostTable from './social/PostTable.jsx';
import PostEditPanel from './social/PostEditPanel.jsx';
import PlanMonthModal from './social/PlanMonthModal.jsx';
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
    const [showPlanMonth, setShowPlanMonth] = useState(false);
    const [refreshingAgent, setRefreshingAgent] = useState(false);

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

    const handleRefreshAgent = async () => {
        setRefreshingAgent(true);
        try {
            const res = await fetch('/api/social/refresh-agent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel }),
            });
            if (!res.ok) throw new Error();
            showToast('Agent odświeżony pomyślnie.', 'success');
        } catch (e) {
            showToast('Błąd odświeżania agenta.');
        } finally {
            setRefreshingAgent(false);
        }
    };

    const handleNewPost = async () => {
        try {
            const post = await createPost({
                channel,
                status: 'draft',
                publish_fb: true,
                publish_ig: true,
            });
            await loadPosts();
            setEditingPost(post);
        } catch (e) {
            showToast('Błąd tworzenia posta.');
        }
    };

    const handleToggleApprove = async (post) => {
        if (post.status === 'published') return;
        const newStatus = post.status === 'approved' ? 'draft' : 'approved';

        if (newStatus === 'approved' && !post.publish_fb && !post.publish_ig) {
            showToast('Post musi być zaplanowany na przynajmniej jeden kanał.');
            return;
        }

        try {
            await updatePost(post.id, { status: newStatus });
            await loadPosts();
        } catch (e) {
            showToast('Błąd aktualizacji statusu.');
        }
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
                    <button className="btn-secondary" onClick={() => setShowPlanMonth(true)}>
                        <CalendarRange size={15} />
                        Zaplanuj miesiąc
                    </button>
                    <button className="btn-secondary" onClick={handleRefreshAgent} disabled={refreshingAgent}>
                        <RefreshCw size={15} className={refreshingAgent ? 'spin' : ''} />
                        {refreshingAgent ? 'Odświeżam...' : 'Odśwież agenta'}
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
                        onToggleApprove={() => {}}
                    />
                )}
            </div>

            {/* Edit panel */}
            {editingPost && (
                <PostEditPanel
                    post={editingPost}
                    channel={channel}
                    onClose={() => { setEditingPost(null); loadPosts(); }}
                    onToast={(msg, type) => showToast(msg, type)}
                />
            )}

            {/* Plan month modal */}
            {showPlanMonth && (
                <PlanMonthModal
                    channel={channel}
                    onClose={() => setShowPlanMonth(false)}
                    onComplete={loadPosts}
                />
            )}

            {/* Toast */}
            {toast && (
                <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
            )}
        </div>
    );
}
