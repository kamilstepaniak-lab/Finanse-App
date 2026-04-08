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
