// src/pages/social/PartnerPicker.jsx
import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function PartnerPicker({ partners, selectedIds, onToggle, onAddPartner }) {
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState('');
    const [newHandle, setNewHandle] = useState('');

    const handleAdd = () => {
        if (!newName.trim() || !newHandle.trim()) return;
        onAddPartner({ name: newName.trim(), handle: newHandle.trim() });
        setNewName('');
        setNewHandle('');
        setShowAdd(false);
    };

    return (
        <div className="partner-picker">
            <p className="partner-picker-title">Partnerzy:</p>
            {partners.map(p => (
                <label key={p.id} className="partner-item">
                    <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => onToggle(p.id)}
                    />
                    <span>{p.name}</span>
                    <span className="partner-handle">{p.handle}</span>
                </label>
            ))}
            {showAdd ? (
                <div className="partner-add-form">
                    <input
                        placeholder="Nazwa (np. Fundacja XYZ)"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                    />
                    <input
                        placeholder="@handle"
                        value={newHandle}
                        onChange={e => setNewHandle(e.target.value)}
                    />
                    <button onClick={handleAdd} className="btn-small-primary">Dodaj</button>
                    <button onClick={() => setShowAdd(false)} className="btn-small-ghost"><X size={14} /></button>
                </div>
            ) : (
                <button onClick={() => setShowAdd(true)} className="partner-add-btn">
                    <Plus size={13} /> Dodaj nowe konto
                </button>
            )}
        </div>
    );
}
