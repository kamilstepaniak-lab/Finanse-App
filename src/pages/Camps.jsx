import React, { useState, useEffect } from 'react';
import { getAllCamps, addCamp, getCampByName, deleteCamp, updateCamp, renameCampInTransactions, subscribeToCamps, unsubscribe } from '../db';
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
    const [newCampSeason, setNewCampSeason] = useState(''); // '' | 'lato' | 'zima'
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('asc');
    const [filterSeason, setFilterSeason] = useState(''); // '' | 'lato' | 'zima'

    // Editing state
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editSeason, setEditSeason] = useState('');
    const [addingTagFor, setAddingTagFor] = useState(null);
    const [newTagInput, setNewTagInput] = useState('');

    // Load initial data
    useEffect(() => {
        loadCamps(true);
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

    const loadCamps = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        const data = await getAllCamps();
        setCamps(data);
        if (showLoading) setLoading(false);
    };

    const detectSeasonFromName = (name) => {
        const months = [];
        const rng = /(\d{1,2})[-\/](\d{1,2})[.](\d{1,2})/g;
        const sng = /(\d{1,2})[.](\d{1,2})(?:[.]\d{2,4})?/g;
        let m;
        while ((m = rng.exec(name)) !== null) months.push(parseInt(m[3]));
        while ((m = sng.exec(name)) !== null) months.push(parseInt(m[2]));
        if (months.length === 0) return '';
        const avg = months.reduce((a, b) => a + b, 0) / months.length;
        return (avg >= 5 && avg <= 8) ? 'lato' : 'zima';
    };

    const handleAddCamp = async () => {
        const name = newCampName.trim();
        if (!name) return;

        const existing = await getCampByName(name);
        if (existing) {
            alert('Taki wyjazd już istnieje!');
            return;
        }

        try {
            const autoTags = extractTagsFromName(name);
            const season = newCampSeason || detectSeasonFromName(name);
            await addCamp({ name, tags: autoTags, season });
            setNewCampName('');
            setNewCampSeason('');
        } catch (e) {
            console.error(e);
            alert('Wystąpił błąd podczas dodawania wyjazdu: ' + e.message);
        }
    };

    const handleDeleteCamp = async (id) => {
        if (window.confirm('Czy na pewno chcesz usunąć ten wyjazd? (Nie usunie to przypisań w transakcjach)')) {
            setCamps(prev => prev.filter(c => c.id !== id));
            await deleteCamp(id);
        }
    };

    const startEditing = (camp) => {
        setEditingId(camp.id);
        setEditName(camp.name);
        setEditSeason(camp.season || '');
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
        setEditSeason('');
    };

    const handleAddTag = async (camp) => {
        const tag = newTagInput.trim().toLowerCase();
        if (!tag) return;
        const existingTags = camp.tags || [];
        setNewTagInput('');
        if (!existingTags.includes(tag)) {
            const newTags = [...existingTags, tag];
            setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, tags: newTags } : c));
            await updateCamp(camp.id, { tags: newTags });
        }
    };

    const handleRemoveTag = async (camp, tag) => {
        const updatedTags = (camp.tags || []).filter(t => t !== tag);
        setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, tags: updatedTags } : c));
        await updateCamp(camp.id, { tags: updatedTags });
    };

    const handleAutoAssignSeasons = async () => {
        let updated = 0;
        const updatedCamps = [...camps];
        for (let i = 0; i < updatedCamps.length; i++) {
            const camp = updatedCamps[i];
            // Dates in name → auto-detect; no dates → default lato
            const detected = detectSeasonFromName(camp.name) || 'lato';
            if (camp.season !== detected) {
                await updateCamp(camp.id, { season: detected });
                updatedCamps[i] = { ...camp, season: detected };
                updated++;
            }
        }
        // Optimistic update — no loading flicker
        setCamps(updatedCamps);
        alert(`Przypisano sezony do ${updated} obozów.`);
    };

    const handleRegenerateTags = async (camp) => {
        const autoTags = extractTagsFromName(camp.name);
        const merged = [...new Set([...autoTags, ...(camp.tags || [])])];
        setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, tags: merged } : c));
        await updateCamp(camp.id, { tags: merged });
    };

    const handleSeasonChange = async (camp, newSeason) => {
        const season = camp.season === newSeason ? '' : newSeason;
        setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, season } : c));
        await updateCamp(camp.id, { season });
    };

    const handleSaveEdit = async (id, originalName) => {
        const name = editName.trim();
        if (!name) {
            cancelEditing();
            return;
        }

        // Only season changed — no name validation needed
        if (name === originalName) {
            const camp = camps.find(c => c.id === id);
            if (editSeason !== (camp?.season || '')) {
                setCamps(prev => prev.map(c => c.id === id ? { ...c, season: editSeason } : c));
                await updateCamp(id, { season: editSeason });
            }
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
            setCamps(prev => prev.map(c => c.id === id ? { ...c, name, tags: mergedTags, season: editSeason } : c));
            cancelEditing();
            await updateCamp(id, { name, tags: mergedTags, season: editSeason });
            // Rename all transactions that referenced the old camp name
            if (name !== originalName) {
                await renameCampInTransactions(originalName, name);
            }
            await loadCamps();
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
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h3>Zarządzanie Wyjazdami</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleAutoAssignSeasons}
                        style={{ padding: '6px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#1570EF', fontWeight: 600 }}
                        title="Przypisz sezony automatycznie na podstawie dat w nazwie obozu"
                    >
                        ☀️❄️ Auto-sezony
                    </button>
                    <button
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'none' : 'asc')}
                        style={{ padding: '6px 12px', background: sortOrder === 'asc' ? '#e0e5f2' : 'transparent', border: '1px solid #e0e5f2', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#2b3674', fontWeight: 600 }}
                    >
                        {sortOrder === 'asc' ? 'Zresetuj sortowanie' : 'Sortuj A-Z'}
                    </button>
                </div>
            </div>
            <div style={{ padding: '24px' }}>
                {/* Add form */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="Wpisz nazwę wyjazdu..."
                        value={newCampName}
                        onChange={e => setNewCampName(e.target.value)}
                        style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', flex: 1, minWidth: '200px', fontSize: '15px' }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCamp()}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {[['lato','☀️ Lato','#FEF3C7','#B45309'],['zima','❄️ Zima','#EFF6FF','#1570EF']].map(([val, label, bg, color]) => (
                            <button
                                key={val}
                                onClick={() => setNewCampSeason(s => s === val ? '' : val)}
                                style={{
                                    padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                    border: `2px solid ${newCampSeason === val ? color : '#ddd'}`,
                                    background: newCampSeason === val ? bg : '#fff',
                                    color: newCampSeason === val ? color : '#94A3B8'
                                }}
                            >{label}</button>
                        ))}
                    </div>
                    <button className="btn-primary" onClick={handleAddCamp} style={{ padding: '0 24px' }}>
                        Dodaj
                    </button>
                </div>

                {/* Season filter */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    {[['','Wszystkie','#4318FF'],['lato','☀️ Letnie','#B45309'],['zima','❄️ Zimowe','#1570EF']].map(([val, label, color]) => (
                        <button
                            key={val}
                            onClick={() => setFilterSeason(val)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                border: `1px solid ${filterSeason === val ? color : '#e0e5f2'}`,
                                background: filterSeason === val ? color : '#fff',
                                color: filterSeason === val ? '#fff' : '#64748B'
                            }}
                        >{label}</button>
                    ))}
                </div>

                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {[...(camps || [])]
                        .filter(c => !filterSeason || c.season === filterSeason)
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, marginRight: '12px' }}>
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #cdd4e0', fontSize: '15px' }}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveEdit(camp.id, camp.name);
                                                    if (e.key === 'Escape') cancelEditing();
                                                }}
                                            />
                                            {[['lato','☀️','#B45309','#FEF3C7'],['zima','❄️','#1570EF','#EFF6FF']].map(([val, icon, color, bg]) => (
                                                <button key={val} onClick={() => setEditSeason(s => s === val ? '' : val)}
                                                    style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: `2px solid ${editSeason === val ? color : '#ddd'}`, background: editSeason === val ? bg : '#fff', color: editSeason === val ? color : '#94A3B8' }}
                                                >{icon}</button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '15px', fontWeight: 600, color: '#0D1B3E' }}>{camp.name}</span>
                                            <button
                                                onClick={() => handleSeasonChange(camp, 'lato')}
                                                title="Oznacz jako letni"
                                                style={{ fontSize: '11px', fontWeight: 700, borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', border: `1px solid ${camp.season === 'lato' ? '#FCD34D' : '#E2E8F0'}`, background: camp.season === 'lato' ? '#FEF3C7' : '#fff', color: camp.season === 'lato' ? '#B45309' : '#CBD5E1' }}
                                            >☀️ Lato</button>
                                            <button
                                                onClick={() => handleSeasonChange(camp, 'zima')}
                                                title="Oznacz jako zimowy"
                                                style={{ fontSize: '11px', fontWeight: 700, borderRadius: '6px', padding: '2px 8px', cursor: 'pointer', border: `1px solid ${camp.season === 'zima' ? '#93C5FD' : '#E2E8F0'}`, background: camp.season === 'zima' ? '#EFF6FF' : '#fff', color: camp.season === 'zima' ? '#1570EF' : '#CBD5E1' }}
                                            >❄️ Zima</button>
                                        </div>
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
