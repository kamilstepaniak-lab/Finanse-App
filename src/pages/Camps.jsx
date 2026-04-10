import React, { useState, useEffect } from 'react';
import { getAllCamps, addCamp, getCampByName, deleteCamp, updateCamp, renameCampInTransactions, getAllTransactions, subscribeToCamps, unsubscribe } from '../db';
import { Trash2, Edit2, Check, X, RefreshCw, Info } from 'lucide-react';

// Synced with csvParser.js — program identifiers (hero, prokids, family, sekcja, etc.)
// are NOT stop-words because they distinguish camps at the same location.
const STOP_WORDS = new Set([
    'oboz', 'wyjazd', 'wycieczka', 'kolonia', 'turnus',
    'lato', 'zima', 'leni', 'zimow', 'ferie', 'wakacje',
    'letni', 'letnia', 'letnie', 'zimowy', 'zimowa', 'zimowe',
    'sportowy', 'sportowa', 'sportowe',
    'morski', 'morska', 'gorski', 'gorska',
    'narciarski', 'narciarska',
    'mlodziezowy', 'mlodziezowa', 'mlodziezowe',
    'jezdziecki', 'taneczny', 'muzyczny', 'artystyczny',
    'karnet', 'karnety',
    'rata', 'doplata', 'dla', 'oraz', 'przelew', 'oplata', 'wplata',
    'zaliczka', 'udzial', 'uczestnictwo', 'czesc',
    'wlochy', 'austria', 'polska'
]);

const CHAR_MAP = { 'ą':'a','ć':'c','ę':'e','ł':'l','ń':'n','ó':'o','ś':'s','ź':'z','ż':'z',
                   'Ą':'A','Ć':'C','Ę':'E','Ł':'L','Ń':'N','Ó':'O','Ś':'S','Ź':'Z','Ż':'Z' };
const norm = (s) => s.toLowerCase().split('').map(c => CHAR_MAP[c] || c).join('');

const extractTagsFromName = (name) => {
    const normalized = norm(name)
        .replace(/\d{1,2}[-\/]\d{1,2}[.]\d{1,2}(?:[.\-\/]\d{2,4})?/g, ' ')
        .replace(/\b\d{1,2}[.]\d{1,2}(?:[.]\d{2,4})?\b/g, ' ')
        .replace(/\b\d{4}\b/g, ' ');
    return normalized
        .split(/[\s,;\-:()\[\]\/\\]+/)
        .flatMap(t => t.split(/(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/))
        .map(t => t.replace(/[^a-z]/g, ''))
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
};

// Returns 'lato' for April–August, 'zima' otherwise
const defaultSeasonForMonth = () => {
    const m = new Date().getMonth() + 1; // 1-12
    return (m >= 4 && m <= 8) ? 'lato' : 'zima';
};

const currentYear = new Date().getFullYear();

export default function Camps() {
    const [camps, setCamps] = useState([]);
    const [newCampName, setNewCampName] = useState('');
    const [newCampSeason, setNewCampSeason] = useState(defaultSeasonForMonth);
    const [newCampYear, setNewCampYear] = useState(String(currentYear));
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('asc');
    const [filterSeason, setFilterSeason] = useState('');
    const [filterYear, setFilterYear] = useState('');

    // Orphaned camp repair
    const [orphanedCamps, setOrphanedCamps] = useState([]);
    const [showOrphanPanel, setShowOrphanPanel] = useState(false);

    // Editing state
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editSeason, setEditSeason] = useState('');
    const [editYear, setEditYear] = useState('');

    // Tags / aliases
    const [addingTagFor, setAddingTagFor] = useState(null);
    const [newTagInput, setNewTagInput] = useState('');

    useEffect(() => {
        loadCamps(true);
    }, []);

    useEffect(() => {
        const channel = subscribeToCamps((payload) => {
            console.log('Camp change:', payload);
            loadCamps();
        });
        return () => { unsubscribe(channel); };
    }, []);

    const loadCamps = async (showLoading = false) => {
        if (showLoading) setLoading(true);
        const data = await getAllCamps();
        setCamps(data);
        if (showLoading) setLoading(false);
        checkOrphanedCamps(data);
    };

    const checkOrphanedCamps = async (campsList) => {
        const txs = await getAllTransactions();
        const campNames = new Set((campsList || []).map(c => c.name));
        const orphanMap = {};
        txs.forEach(t => {
            if (t.camp && !campNames.has(t.camp)) {
                orphanMap[t.camp] = (orphanMap[t.camp] || 0) + 1;
            }
        });
        const orphans = Object.entries(orphanMap).map(([oldName, count]) => ({ oldName, count, reassignTo: '' }));
        setOrphanedCamps(orphans);
        if (orphans.length > 0) setShowOrphanPanel(true);
    };

    const handleOrphanReassign = async (orphan, newCampName) => {
        setOrphanedCamps(prev => prev.map(o => o.oldName === orphan.oldName ? { ...o, reassignTo: newCampName } : o));
    };

    const handleFixOrphans = async () => {
        for (const orphan of orphanedCamps) {
            if (orphan.reassignTo === '__clear__') {
                await renameCampInTransactions(orphan.oldName, '');
            } else if (orphan.reassignTo) {
                await renameCampInTransactions(orphan.oldName, orphan.reassignTo);
            }
        }
        setOrphanedCamps([]);
        setShowOrphanPanel(false);
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
            const year = newCampYear ? parseInt(newCampYear) : null;
            await addCamp({ name, tags: autoTags, season: newCampSeason, year });
            setNewCampName('');
            setNewCampSeason(defaultSeasonForMonth());
            setNewCampYear(String(currentYear));
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
        setEditYear(camp.year ? String(camp.year) : '');
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
        setEditSeason('');
        setEditYear('');
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

    const handleRegenerateTags = async (camp) => {
        const autoTags = extractTagsFromName(camp.name);
        // Keep only manual tags (those not generated from any camp name — i.e. short aliases added by user)
        // Heuristic: manual tags are those that are NOT individual normalized words from this name
        const manualTags = (camp.tags || []).filter(t => !autoTags.includes(t) && !t.match(/^[a-z]{10,}$/));
        const merged = [...new Set([...autoTags, ...manualTags])];
        setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, tags: merged } : c));
        await updateCamp(camp.id, { tags: merged });
    };

    const handleRegenerateAllTags = async () => {
        if (!window.confirm('Przelicz tagi dla wszystkich obozów? Stare tagi (concatenated) zostaną zastąpione indywidualnymi słowami.')) return;
        let updated = 0;
        for (const camp of (camps || [])) {
            const autoTags = extractTagsFromName(camp.name);
            // Keep manual tags: short aliases (not matching auto-generated words)
            const manualTags = (camp.tags || []).filter(t => !autoTags.includes(t) && !t.match(/^[a-z]{10,}$/));
            const merged = [...new Set([...autoTags, ...manualTags])];
            // Skip if already correct
            if (JSON.stringify(merged.sort()) === JSON.stringify((camp.tags || []).slice().sort())) continue;
            setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, tags: merged } : c));
            await updateCamp(camp.id, { tags: merged });
            updated++;
        }
        alert(`Zaktualizowano tagi dla ${updated} obozów.`);
    };

    const handleAutoFillYears = async () => {
        const allCamps = camps || [];
        if (allCamps.length === 0) {
            alert('Brak obozów do zaktualizowania.');
            return;
        }
        let updated = 0;
        for (const camp of allCamps) {
            // Try to extract year from name first, otherwise default to 2026
            const yearMatch = camp.name.match(/\b(20\d{2})\b/);
            const year = yearMatch ? parseInt(yearMatch[1]) : 2026;
            if (camp.year === year) continue;
            setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, year } : c));
            await updateCamp(camp.id, { year });
            updated++;
        }
        alert(`Zaktualizowano rok dla ${updated} obozów.`);
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

        const year = editYear ? parseInt(editYear) : null;

        if (name === originalName) {
            const camp = camps.find(c => c.id === id);
            const seasonChanged = editSeason !== (camp?.season || '');
            const yearChanged = year !== (camp?.year ?? null);
            if (seasonChanged || yearChanged) {
                setCamps(prev => prev.map(c => c.id === id ? { ...c, season: editSeason, year } : c));
                await updateCamp(id, { season: editSeason, year });
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
            setCamps(prev => prev.map(c => c.id === id ? { ...c, name, tags: mergedTags, season: editSeason, year } : c));
            cancelEditing();
            await updateCamp(id, { name, tags: mergedTags, season: editSeason, year });
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

    const filteredCamps = [...(camps || [])]
        .filter(c => !filterSeason || c.season === filterSeason)
        .filter(c => !filterYear || String(c.year) === filterYear)
        .sort((a, b) => {
            if (sortOrder === 'asc') return a.name.localeCompare(b.name);
            return 0;
        });

    const availableYears = [...new Set((camps || []).map(c => c.year).filter(Boolean))].sort();

    return (
        <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <h3>Zarządzanie Wyjazdami</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleRegenerateAllTags}
                        title="Przelicz tagi dla wszystkich obozów — zastąp stare concatenated tagi indywidualnymi słowami"
                        style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #e0e5f2', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#2b3674', fontWeight: 600 }}
                    >
                        Przelicz tagi
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

                {/* Orphaned camps repair panel */}
                {showOrphanPanel && orphanedCamps.length > 0 && (
                    <div style={{ background: '#FFF5F5', border: '1.5px solid #FECACA', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div>
                                <span style={{ fontWeight: 700, color: '#DC2626', fontSize: '14px' }}>⚠️ Transakcje z nieistniejącymi wyjazdami</span>
                                <span style={{ fontSize: '12px', color: '#94A3B8', marginLeft: '8px' }}>Przypisz do właściwego wyjazdu lub wyczyść</span>
                            </div>
                            <button onClick={() => setShowOrphanPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '18px', lineHeight: 1 }}>×</button>
                        </div>
                        {orphanedCamps.map(orphan => (
                            <div key={orphan.oldName} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#DC2626', minWidth: '200px' }}>
                                    "{orphan.oldName}"
                                    <span style={{ fontSize: '11px', fontWeight: 400, color: '#94A3B8', marginLeft: '6px' }}>({orphan.count} transakcji)</span>
                                </span>
                                <span style={{ color: '#94A3B8', fontSize: '13px' }}>→</span>
                                <select
                                    value={orphan.reassignTo}
                                    onChange={e => handleOrphanReassign(orphan, e.target.value)}
                                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1.5px solid #E2EAFF', fontSize: '13px', color: '#0D1B3E', minWidth: '220px' }}
                                >
                                    <option value="">-- wybierz wyjazd --</option>
                                    {[...camps].sort((a,b) => a.name.localeCompare(b.name)).map(c => (
                                        <option key={c.id} value={c.name}>{c.name}</option>
                                    ))}
                                    <option value="__clear__">🗑 Wyczyść przypisanie</option>
                                </select>
                            </div>
                        ))}
                        <button
                            onClick={handleFixOrphans}
                            disabled={orphanedCamps.every(o => !o.reassignTo)}
                            style={{
                                marginTop: '10px', padding: '8px 20px', borderRadius: '8px',
                                background: orphanedCamps.every(o => !o.reassignTo) ? '#E2E8F0' : '#DC2626',
                                color: orphanedCamps.every(o => !o.reassignTo) ? '#94A3B8' : '#fff',
                                border: 'none', fontWeight: 700, fontSize: '13px', cursor: orphanedCamps.every(o => !o.reassignTo) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            Napraw przypisania
                        </button>
                    </div>
                )}

                {/* Add form */}
                <div style={{ background: '#F8FAFF', border: '1px solid #E2EAFF', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Nowy wyjazd</div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Nazwa wyjazdu (np. Hero Gniewino)..."
                            value={newCampName}
                            onChange={e => setNewCampName(e.target.value)}
                            style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', flex: 2, minWidth: '200px', fontSize: '14px' }}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddCamp()}
                        />
                        <input
                            type="number"
                            placeholder="Rok"
                            value={newCampYear}
                            onChange={e => setNewCampYear(e.target.value)}
                            min="2000"
                            max="2099"
                            style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', width: '90px', fontSize: '14px' }}
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
                        <button className="btn-primary" onClick={handleAddCamp} style={{ padding: '0 24px', height: '40px' }}>
                            Dodaj
                        </button>
                    </div>
                </div>

                {/* Season + Year filter */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                    <div style={{ width: '1px', height: '24px', background: '#e0e5f2', margin: '0 4px' }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Rok:</span>
                    {[['','Wszystkie'],  ...availableYears.map(y => [String(y), String(y)])].map(([val, label]) => (
                        <button
                            key={val}
                            onClick={() => setFilterYear(val)}
                            style={{
                                padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                border: `1px solid ${filterYear === val ? '#4318FF' : '#e0e5f2'}`,
                                background: filterYear === val ? '#4318FF' : '#fff',
                                color: filterYear === val ? '#fff' : '#64748B'
                            }}
                        >{label}</button>
                    ))}
                </div>

                {/* Table */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #E2EAFF' }}>
                            <th style={thStyle}>Tytuł wyjazdu</th>
                            <th style={{ ...thStyle, width: '70px', textAlign: 'center' }}>Rok</th>
                            <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Sezon</th>
                            <th style={thStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Aliasy dopasowania
                                    <span title="Słowa, które algorytm szuka w tytułach przelewów. Dodaj tu frazy które pojawiają się w twoich przelewach, np. nazwę miejscowości lub organizatora." style={{ cursor: 'help', color: '#94A3B8' }}>
                                        <Info size={13} />
                                    </span>
                                </div>
                            </th>
                            <th style={{ ...thStyle, width: '110px', textAlign: 'center' }}>Akcje</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCamps.map(camp => {
                            const autoTags = extractTagsFromName(camp.name);
                            const manualTags = (camp.tags || []).filter(t => !autoTags.includes(t));
                            const isEditing = editingId === camp.id;

                            return (
                                <tr key={camp.id} style={{ borderBottom: '1px solid #F0F4FF' }}>
                                    {/* Title */}
                                    <td style={tdStyle}>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={e => setEditName(e.target.value)}
                                                autoFocus
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveEdit(camp.id, camp.name);
                                                    if (e.key === 'Escape') cancelEditing();
                                                }}
                                                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cdd4e0', fontSize: '14px' }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#0D1B3E' }}>{camp.name}</span>
                                        )}
                                    </td>

                                    {/* Year */}
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={editYear}
                                                onChange={e => setEditYear(e.target.value)}
                                                min="2000"
                                                max="2099"
                                                style={{ width: '72px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #cdd4e0', fontSize: '14px', textAlign: 'center' }}
                                            />
                                        ) : (
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: camp.year ? '#0D1B3E' : '#CBD5E1' }}>
                                                {camp.year || '—'}
                                            </span>
                                        )}
                                    </td>

                                    {/* Season */}
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                {[['lato','☀️','#B45309','#FEF3C7'],['zima','❄️','#1570EF','#EFF6FF']].map(([val, icon, color, bg]) => (
                                                    <button key={val} onClick={() => setEditSeason(s => s === val ? '' : val)}
                                                        style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', border: `2px solid ${editSeason === val ? color : '#ddd'}`, background: editSeason === val ? bg : '#fff', color: editSeason === val ? color : '#94A3B8' }}
                                                    >{icon}</button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                <button
                                                    onClick={() => handleSeasonChange(camp, 'lato')}
                                                    title="Oznacz jako letni"
                                                    style={{ fontSize: '11px', fontWeight: 700, borderRadius: '6px', padding: '3px 7px', cursor: 'pointer', border: `1px solid ${camp.season === 'lato' ? '#FCD34D' : '#E2E8F0'}`, background: camp.season === 'lato' ? '#FEF3C7' : '#fff', color: camp.season === 'lato' ? '#B45309' : '#CBD5E1' }}
                                                >☀️</button>
                                                <button
                                                    onClick={() => handleSeasonChange(camp, 'zima')}
                                                    title="Oznacz jako zimowy"
                                                    style={{ fontSize: '11px', fontWeight: 700, borderRadius: '6px', padding: '3px 7px', cursor: 'pointer', border: `1px solid ${camp.season === 'zima' ? '#93C5FD' : '#E2E8F0'}`, background: camp.season === 'zima' ? '#EFF6FF' : '#fff', color: camp.season === 'zima' ? '#1570EF' : '#CBD5E1' }}
                                                >❄️</button>
                                            </div>
                                        )}
                                    </td>

                                    {/* Tags / aliases */}
                                    <td style={tdStyle}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                                            {/* Auto-tags from name */}
                                            {autoTags.map(tag => (
                                                <span key={tag} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                    background: '#F1F5F9', border: '1px solid #E2E8F0',
                                                    color: '#64748B', borderRadius: '6px',
                                                    padding: '2px 7px', fontSize: '11px', fontWeight: 500,
                                                    title: 'Auto-tag z nazwy'
                                                }}>
                                                    {tag}
                                                </span>
                                            ))}
                                            {/* Manual aliases */}
                                            {manualTags.map(tag => (
                                                <span key={tag} style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                    background: '#EFF6FF', border: '1px solid #BFDBFE',
                                                    color: '#1570EF', borderRadius: '6px',
                                                    padding: '2px 7px', fontSize: '11px', fontWeight: 600
                                                }}>
                                                    {tag}
                                                    <button
                                                        onClick={() => handleRemoveTag(camp, tag)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93C5FD', padding: '0', lineHeight: 1, fontSize: '12px' }}
                                                    >×</button>
                                                </span>
                                            ))}
                                            {/* Add alias */}
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
                                                        padding: '2px 8px', fontSize: '11px', outline: 'none',
                                                        width: '110px', color: '#0D1B3E'
                                                    }}
                                                />
                                            ) : (
                                                <button
                                                    onClick={() => { setAddingTagFor(camp.id); setNewTagInput(''); }}
                                                    style={{
                                                        background: 'none', border: '1px dashed #CBD5E1',
                                                        borderRadius: '6px', padding: '2px 7px',
                                                        fontSize: '11px', color: '#94A3B8', cursor: 'pointer'
                                                    }}
                                                >+ alias</button>
                                            )}
                                        </div>
                                    </td>

                                    {/* Actions */}
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                            {isEditing ? (
                                                <>
                                                    <button onClick={() => handleSaveEdit(camp.id, camp.name)} style={{ background: 'none', color: '#05CD99', cursor: 'pointer', border: 'none' }}>
                                                        <Check size={17} />
                                                    </button>
                                                    <button onClick={cancelEditing} style={{ background: 'none', color: '#A3AED0', cursor: 'pointer', border: 'none' }}>
                                                        <X size={17} />
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button onClick={() => startEditing(camp)} style={{ background: 'none', color: '#4318FF', cursor: 'pointer', border: 'none' }} title="Edytuj">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button onClick={() => handleRegenerateTags(camp)} style={{ background: 'none', color: '#05CD99', cursor: 'pointer', border: 'none' }} title="Wygeneruj aliasy ze słów nazwy">
                                                        <RefreshCw size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteCamp(camp.id)} style={{ background: 'none', color: '#EE5D50', cursor: 'pointer', border: 'none' }} title="Usuń wyjazd">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredCamps.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ textAlign: 'center', color: '#aaa', padding: '32px' }}>
                                    Brak wyjazdów. Dodaj pierwszy!
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Legend */}
                <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: '#94A3B8' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ display: 'inline-block', width: '28px', height: '16px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '4px' }} />
                        Auto-alias z nazwy
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ display: 'inline-block', width: '28px', height: '16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '4px' }} />
                        Ręczny alias — fraza z tytułu przelewu (wyższy priorytet w dopasowaniu)
                    </span>
                </div>
            </div>
        </div>
    );
}

const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 700,
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
};

const tdStyle = {
    padding: '12px 12px',
    verticalAlign: 'middle',
};
