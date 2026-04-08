// src/pages/social/PostEditPanel.jsx
import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Save, CheckSquare, Trash2 } from 'lucide-react';
import { toZonedTime, fromZonedTime, format } from 'date-fns-tz';
import PartnerPicker from './PartnerPicker.jsx';
import DriveFilePicker from './DriveFilePicker.jsx';
import { updatePost, deletePost, getPartners, createPartner, setPostPartners } from '../../lib/social/db.js';

const POST_TYPES = ['relacyjny', 'sprzedażowy', 'treningowy', 'edukacyjny'];

function toLocalInput(iso) {
    if (!iso) return '';
    const zoned = toZonedTime(new Date(iso), 'Europe/Warsaw');
    return format(zoned, "yyyy-MM-dd'T'HH:mm", { timeZone: 'Europe/Warsaw' });
}

function fromLocalInput(localStr) {
    if (!localStr) return null;
    return fromZonedTime(localStr, 'Europe/Warsaw').toISOString();
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
                <div className="edit-panel-header">
                    <span>Edytuj post</span>
                    <button onClick={onClose} className="close-btn"><X size={16} /></button>
                </div>

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

                {!isReadOnly && (
                    <div className="edit-field">
                        <label>Typ posta:</label>
                        <select value={postType} onChange={e => setPostType(e.target.value)} className="edit-select">
                            {POST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}

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

                {!isReadOnly && (
                    <PartnerPicker
                        partners={partners}
                        selectedIds={selectedPartnerIds}
                        onToggle={handleTogglePartner}
                        onAddPartner={handleAddPartner}
                    />
                )}

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
