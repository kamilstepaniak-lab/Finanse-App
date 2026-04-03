import React, { useState, useEffect } from 'react';
import './Dashboard.css';

export default function ActivityLog() {
    const [entries, setEntries] = useState([]);

    const loadEntries = () => {
        const raw = localStorage.getItem('activity_log');
        const parsed = raw ? JSON.parse(raw) : [];
        setEntries(parsed);
    };

    useEffect(() => {
        loadEntries();
    }, []);

    const handleClear = () => {
        if (!window.confirm('Czy na pewno chcesz wyczyścić historię?')) return;
        localStorage.removeItem('activity_log');
        setEntries([]);
    };

    const formatDate = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="card table-card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Historia zmian</h3>
                <button
                    className="btn-secondary"
                    onClick={handleClear}
                    style={{ fontSize: '13px', padding: '6px 14px' }}
                >
                    Wyczyść historię
                </button>
            </div>

            {entries.length === 0 ? (
                <div className="empty-state">
                    <p>Brak wpisów w historii.</p>
                </div>
            ) : (
                <table className="transactions-table">
                    <thead>
                        <tr>
                            <th>Data i godzina</th>
                            <th>Typ</th>
                            <th>Opis</th>
                            <th>Szczegóły</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, idx) => (
                            <tr key={idx}>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(entry.timestamp)}</td>
                                <td>
                                    <span style={{
                                        display: 'inline-block',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        background: entry.type === 'csv_import' ? '#EDE9FE' : '#F0FDF4',
                                        color: entry.type === 'csv_import' ? '#7C3AED' : '#16A34A'
                                    }}>
                                        {entry.type === 'csv_import' ? 'Import CSV' : 'Ręczny'}
                                    </span>
                                </td>
                                <td>{entry.message}</td>
                                <td style={{ color: '#6B7280' }}>{entry.details || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
