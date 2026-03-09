import React, { useState, useEffect } from 'react';
import { getAllCamps, addCamp, getCampByName, deleteCamp, updateCamp, subscribeToCamps, unsubscribe } from '../db';
import { Trash2, Edit2, Check, X } from 'lucide-react';

export default function Camps() {
    const [camps, setCamps] = useState([]);
    const [newCampName, setNewCampName] = useState('');
    const [loading, setLoading] = useState(true);
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'none'

    // Editing state
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');

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
            await addCamp({ name: name });
            setNewCampName('');
        } catch (e) {
            console.error(e);
            alert('Wystąpił błąd podczas dodawania wyjazdu: ' + e.message);
        }
    };

    const handleDeleteCamp = (id) => {
        if (window.confirm('Czy na pewno chcesz usunąć ten wyjazd? (Nie usunie to przypisań w transakcjach)')) {
            deleteCamp(id);
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
            await updateCamp(id, { name: name });
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
                            return 0; // Default creation order (or whatever DB returned)
                        })
                        .map(camp => (
                            <li key={camp.id} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px',
                                borderBottom: '1px solid #eee'
                            }}>
                                {editingId === camp.id ? (
                                    <div style={{ display: 'flex', flex: 1, gap: '10px', marginRight: '15px' }}>
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
                                    </div>
                                ) : (
                                    <span style={{ fontSize: '16px', fontWeight: 500 }}>{camp.name}</span>
                                )}

                                <div style={{ display: 'flex', gap: '8px' }}>
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
                                            <button onClick={() => startEditing(camp)} style={{ background: 'none', color: '#4318FF', cursor: 'pointer', border: 'none' }}>
                                                <Edit2 size={18} />
                                            </button>
                                            <button onClick={() => handleDeleteCamp(camp.id)} style={{ background: 'none', color: '#EE5D50', cursor: 'pointer', border: 'none' }}>
                                                <Trash2 size={18} />
                                            </button>
                                        </>
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
