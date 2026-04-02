import React, { useState, useEffect } from 'react';
import { getAllCamps, addCamp, getCampByName, deleteCamp, updateCamp, subscribeToCamps, unsubscribe } from '../db';
import { Trash2, Edit2, Check, X, RefreshCw } from 'lucide-react';

const STOP_WORDS = new Set([
    'oboz', 'obóz', 'wyjazd', 'wycieczka', 'camp', 'kolonia', 'turnus', 'rejs',
    'lato', 'zima', 'leni', 'zimow', 'ferie', 'wakacje',
    'letni', 'letnia', 'letnie', 'zimowy', 'zimowa', 'zimowe',
    'sportowy', 'sportowa', 'sportowe', 'sport',
    'sekcja', 'family', 'hero', 'prokids', 'semipro', 'beeski',
    'karnet', 'karnety', 'rata', 'doplata',
    'dla', 'oraz', 'przelew', 'oplata', 'wplata', 'zaliczka'
]);

const CHAR_MAP = { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
                   'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z' };
const norm = (s) => s.toLowerCase().split('').map(c => CHAR_MAP[c] || c).join('');

const extractTagsFromName = (name) => {
    const normalized = norm(name)
        .replace(/\b\d{4}\b/g, ' ')           // usuń lata (2025, 2026...)
        .replace(/\b\d{1,2}[.\-\/]\d{1,2}([.\-\/]\d{2,4})?\b/g, ' '); // usuń daty
    return normalized
        .split(/[\s,;\-:()\[\]\/\\]+/)
        .map(t => t.replace(/[^a-z]/g, ''))
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
};

export default function Camps() {
    const [camps, setCamps] = useState([]);
    const [newCampName, setNewCampName] = useState('');
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'none'

    // Editing state
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [addingTagFor, setAddingTagFor] = useState(null);
    const [newTagInput, setNewTagInput] = useState('');

    // Load initial data
    useEffect(() => {
        loadCamps();
    }, []);

    // Setup realtime subscriptions
    useEffect(() => {
        const channel = subscribeToCamps((payload) => {
            console.log('Camp change:', payload);
            loadCamps();
        });

        return () => {
            unsubscribe(channel);
        };
    }, []);

    const loadCamps = async () => {
        setLoading(true);
        const data = await getAllCamps();
        setCamps(data);
        setLoading(false);
    };

    const handleAddCamp = async () => {
        const name = newCampName.trim();
        if (!name) return;

        // Check if exists (case insensitive)
        const existing = await getCampByName(name);
        if (existing) {
            alert('Taki wyjazd już istnieje!');
            return;
        }

        try {
            const autoTags = extractTagsFromName(name);
            await addCamp({ name: name, tags: autoTags });
            setNewCampName('');
        } catch (e) {
            console.error(e);
            alert('Wystąpił błąd podczas dodawania wyjazdu: ' + e.message);
        }
    };

    const handleDeleteCamp = async (id) => {
        if (window.confirm('Czy na pewno chcesz usunąć ten wyjazd? (Nie usunie to przypisań w transakcjach)')) {
            await deleteCamp(id);
            await loadCamps();
        }
    };

    const startEditing = (camp) => {
        setEditingId(camp.id);
        setEditName(camp.name);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
    };

    const handleAddTag = async (camp) => {
        const tag = newTagInput.trim().toLowerCase();
        if (!tag) return;
        const existingTags = camp.tags || [];
        if (!existingTags.includes(tag)) {
            setNewTagInput('');
            await updateCamp(camp.id, { tags: [...existingTags, tag] });
            await loadCamps();
        } else {
            setNewTagInput('');
        }
    };

    const handleRemoveTag = async (camp, tag) => {
        const updatedTags = (camp.tags || []).filter(t => t !== tag);
        await updateCamp(camp.id, { tags: updatedTags });
        await loadCamps();
    };

    const handleRegenerateTags = async (camp) => {
        const autoTags = extractTagsFromName(camp.name);
        const merged = [...new Set([...autoTags, ...(camp.tags || [])])];
        await updateCamp(camp.id, { tags: merged });
        await loadCamps();
    };

    const handleSaveEdit = async (id, originalName) => {
        const name = editName.trim();
        if (!name || name === originalName) {
            cancelEditing();
            return;
        }

        const existing = await getCampByName(name);
        if (existing && existing.id !== id) {
            alert('Taki wyjazd już istnieje!');
            return;
        }

        try {
            const camp = camps.find(c => c.id === id);
            const oldAutoTags = extractTagsFromName(originalName);
            const newAutoTags = extractTagsFromName(name);
            const manualTags = (camp?.tags || []).filter(t => !oldAutoTags.includes(t));
            const mergedTags = [...new Set([...newAutoTags, ...manualTags])];
            await updateCamp(id, { name: name, tags: mergedTags });
            cancelEditing();
        } catch (e) {
            console.error(e);
            alert('Wystąpił błąd podczas edycji wyjazdu: ' + e.message);
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Ładowanie danych...</div>;
    }

    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Zarządzanie Wyjazdami</h3>
                <button
                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'none' : 'asc')}
                    style={{
                        padding: '6px 12px',
                        background: sortOrder === 'asc' ? '#e0e5f2' : 'transparent',
                        border: '1px solid #e0e5f2',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: '#2b3674',
                        fontWeight: 600
                    }}
                >
                    {sortOrder === 'asc' ? 'Zresetuj sortowanie' : 'Sortuj po nazwie (A-Z)'}
                </button>
            </div>
            <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        placeholder="Wpisz nazwę wyjazdu..."
                        value={newCampName}
                        onChange={e => setNewCampName(e.target.value)}
                        style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            flex: 1,
                            fontSize: '15px'
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCamp()}
                    />
                    <button className="btn-primary" onClick={handleAddCamp} style={{ padding: '0 24px' }}>
                        Dodaj
                    </button>
                </div>

                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {[...(camps || [])]
                        .sort((a, b) => {
                            if (sortOrder === 'asc') return a.name.localeCompare(b.name);
                            return 0;
                        })
                        .map(camp => (
                            <li key={camp.id} style={{
                                padding: '14px 12px',
                                borderBottom: '1px solid #eee',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                {/* Top row: name + actions */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    {editingId === camp.id ? (
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cdd4e0', fontSize: '15px', marginRight: '12px' }}
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleSaveEdit(camp.id, camp.name);
                                                if (e.key === 'Escape') cancelEditing();
                                            }}
                                        />
                                    ) : (
                                        <span style={{ fontSize: '15px', fontWeight: 600, color: '#0D1B3E' }}>{camp.name}</span>
                                    )}
                                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                        {editingId === camp.id ? (
                                            <>
                                                <button onClick={() => handleSaveEdit(camp.id, camp.name)} style={{ background: 'none', color: '#05CD99', cursor: 'pointer', border: 'none' }}>
                                                    <Check size={18} />
                                                </button>
                                                <button onClick={cancelEditing} style={{ background: 'none', color: '#A3AED0', cursor: 'pointer', border: 'none' }}>
                                                    <X size={18} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => startEditing(camp)} style={{ background: 'none', color: '#4318FF', cursor: 'pointer', border: 'none' }} title="Edytuj nazwę">
                                                    <Edit2 size={18} />
                                                </button>
                                                <button onClick={() => handleRegenerateTags(camp)} style={{ background: 'none', color: '#05CD99', cursor: 'pointer', border: 'none' }} title="Wygeneruj tagi ze słów nazwy">
                                                    <RefreshCw size={18} />
                                                </button>
                                                <button onClick={() => handleDeleteCamp(camp.id)} style={{ background: 'none', color: '#EE5D50', cursor: 'pointer', border: 'none' }} title="Usuń wyjazd">
                                                    <Trash2 size={18} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Tags row */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '2px' }}>Tagi:</span>
                                    {(camp.tags || []).map(tag => (
                                        <span key={tag} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                            background: '#EFF6FF', border: '1px solid #BFDBFE',
                                            color: '#1570EF', borderRadius: '6px',
                                            padding: '2px 8px', fontSize: '12px', fontWeight: 600
                                        }}>
                                            {tag}
                                            <button
                                                onClick={() => handleRemoveTag(camp, tag)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93C5FD', padding: '0', lineHeight: 1, fontSize: '13px' }}
                                            >×</button>
                                        </span>
                                    ))}
                                    {addingTagFor === camp.id ? (
                                        <input
                                            autoFocus
                                            type="text"
                                            value={newTagInput}
                                            onChange={e => setNewTagInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') { e.preventDefault(); handleAddTag(camp); }
                                                if (e.key === 'Escape') { setAddingTagFor(null); setNewTagInput(''); }
                                            }}
                                            onBlur={() => { setAddingTagFor(null); setNewTagInput(''); }}
                                            placeholder="np. gniewino"
                                            style={{
                                                border: '1px solid #1570EF', borderRadius: '6px',
                                                padding: '2px 8px', fontSize: '12px', outline: 'none',
                                                width: '120px', color: '#0D1B3E'
                                            }}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => { setAddingTagFor(camp.id); setNewTagInput(''); }}
                                            style={{
                                                background: 'none', border: '1px dashed #CBD5E1',
                                                borderRadius: '6px', padding: '2px 8px',
                                                fontSize: '12px', color: '#94A3B8', cursor: 'pointer'
                                            }}
                                        >+ dodaj tag</button>
                                    )}
                                </div>
                            </li>
                        ))}
                    {(!camps || camps.length === 0) && (
                        <p style={{ color: '#aaa', textAlign: 'center' }}>Brak wyjazdów. Dodaj pierwszy!</p>
                    )}
                </ul>
            </div>
        </div>
    );
}
