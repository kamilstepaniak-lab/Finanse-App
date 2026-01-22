import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { Plus, Trash2 } from 'lucide-react';

export default function Camps() {
    const camps = useLiveQuery(() => db.camps.toArray());
    const [newCampName, setNewCampName] = useState('');

    const handleAddCamp = async () => {
        const name = newCampName.trim();
        if (!name) return;

        // Check if exists (case insensitive)
        const existing = await db.camps.where('name').equalsIgnoreCase(name).first();
        if (existing) {
            alert('Taki obóz już istnieje!');
            return;
        }

        try {
            await db.camps.add({ name: name });
            setNewCampName('');
        } catch (e) {
            console.error(e);
            alert('Wystąpił błąd podczas dodawania obozu: ' + e.message);
        }
    };

    const handleDeleteCamp = (id) => {
        if (window.confirm('Czy na pewno chcesz usunąć ten obóz? (Nie usunie to przypisań w transakcjach)')) {
            db.camps.delete(id);
        }
    };

    return (
        <div className="card">
            <div className="card-header">
                <h3>Zarządzanie Obozami</h3>
            </div>
            <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        placeholder="Wpisz nazwę obozu..."
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
                    {camps?.map(camp => (
                        <li key={camp.id} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px',
                            borderBottom: '1px solid #eee'
                        }}>
                            <span style={{ fontSize: '16px', fontWeight: 500 }}>{camp.name}</span>
                            <button
                                onClick={() => handleDeleteCamp(camp.id)}
                                style={{ background: 'none', color: '#EE5D50', cursor: 'pointer' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </li>
                    ))}
                    {(!camps || camps.length === 0) && (
                        <p style={{ color: '#aaa', textAlign: 'center' }}>Brak obozów. Dodaj pierwszy!</p>
                    )}
                </ul>
            </div>
        </div>
    );
}
