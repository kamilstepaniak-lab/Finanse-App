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
