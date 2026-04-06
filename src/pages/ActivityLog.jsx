import React, { useState, useEffect, useCallback } from 'react';
import { getActivityLog, clearActivityLog } from '../db';
import './Dashboard.css';

const ACTION_META = {
    create:           { label: 'Utworzone',     bg: '#DCFCE7', fg: '#166534' },
    update:           { label: 'Zmienione',     bg: '#DBEAFE', fg: '#1E40AF' },
    delete:           { label: 'Usunięte',      bg: '#FEE2E2', fg: '#991B1B' },
    split_add:        { label: 'Dodany podział', bg: '#EDE9FE', fg: '#6D28D9' },
    split_delete:     { label: 'Usunięty podział', bg: '#FCE7F3', fg: '#9D174D' },
    csv_import:       { label: 'Import CSV',    bg: '#FEF3C7', fg: '#92400E' },
    category_confirm: { label: 'Potwierdzenie', bg: '#CCFBF1', fg: '#0F766E' },
    note_update:      { label: 'Notatka',       bg: '#F3F4F6', fg: '#374151' },
};

const PAGE_SIZE = 50;

const formatDate = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pl-PL', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
};

const FIELD_LABELS = {
    category: 'Kategoria',
    camp: 'Wyjazd',
    note: 'Notatka',
    amount: 'Kwota',
    title: 'Tytuł',
    sender: 'Nadawca',
    date: 'Data',
    needs_review: 'Do przejrzenia',
};

const formatValue = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'tak' : 'nie';
    return String(v);
};

function ChangesDiff({ changes }) {
    if (!changes || typeof changes !== 'object') return null;
    const entries = Object.entries(changes).filter(([k]) => k !== 'needs_review');
    if (entries.length === 0) return <span style={{ color: '#A3AED0', fontSize: '12px' }}>—</span>;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            {entries.map(([field, diff]) => (
                <div key={field} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <strong style={{ color: '#2B3674', minWidth: '80px' }}>{FIELD_LABELS[field] || field}:</strong>
                    <span style={{ textDecoration: 'line-through', color: '#EE5D50' }}>{formatValue(diff?.from)}</span>
                    <span style={{ color: '#A3AED0' }}>→</span>
                    <span style={{ color: '#05CD99', fontWeight: 600 }}>{formatValue(diff?.to)}</span>
                </div>
            ))}
        </div>
    );
}

function SnapshotSummary({ snap }) {
    if (!snap) return <span style={{ color: '#A3AED0', fontSize: '12px' }}>—</span>;
    return (
        <div style={{ fontSize: '12px', color: '#4A5568', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div><strong>{snap.title || '(bez tytułu)'}</strong> · {snap.date}</div>
            <div>{snap.sender || '—'} · {snap.amount} {snap.currency || 'PLN'}</div>
            <div>Kategoria: {snap.category || '—'}{snap.camp ? ` · Wyjazd: ${snap.camp}` : ''}</div>
            {snap.note && <div style={{ fontStyle: 'italic' }}>„{snap.note}"</div>}
        </div>
    );
}

export default function ActivityLog() {
    const [rows, setRows] = useState([]);
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [filterAction, setFilterAction] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        const result = await getActivityLog({
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            action: filterAction || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            search: search || null,
        });
        setRows(result.rows);
        setCount(result.count);
        setLoading(false);
    }, [page, filterAction, dateFrom, dateTo, search]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => { setPage(0); }, [filterAction, dateFrom, dateTo, search]);

    const handleClear = async () => {
        if (!window.confirm('Czy na pewno chcesz wyczyścić CAŁĄ historię zmian z bazy danych? Operacja nieodwracalna.')) return;
        try {
            await clearActivityLog();
            await load();
        } catch (e) {
            alert('Błąd: ' + e.message);
        }
    };

    const totalPages = Math.ceil(count / PAGE_SIZE) || 1;

    return (
        <div className="card table-card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h3 style={{ margin: 0 }}>Historia zmian</h3>
                    <span style={{ fontSize: '13px', color: '#A3AED0' }}>
                        {count.toLocaleString('pl-PL')} wpisów · strona {page + 1}/{totalPages}
                    </span>
                </div>
                <button
                    className="btn-secondary"
                    onClick={handleClear}
                    style={{ fontSize: '13px', padding: '6px 14px' }}
                >
                    Wyczyść historię
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', padding: '12px 20px', borderBottom: '1px solid #E2E8F0', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#A3AED0', fontWeight: 600 }}>Typ akcji</label>
                    <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="filter-select">
                        <option value="">Wszystkie</option>
                        {Object.entries(ACTION_META).map(([key, meta]) => (
                            <option key={key} value={key}>{meta.label}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#A3AED0', fontWeight: 600 }}>Od</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="filter-select" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: '#A3AED0', fontWeight: 600 }}>Do</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="filter-select" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '200px' }}>
                    <label style={{ fontSize: '11px', color: '#A3AED0', fontWeight: 600 }}>Szukaj w opisie</label>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="np. nazwa transakcji"
                        className="filter-select"
                    />
                </div>
                <button
                    className="btn-filter-clear"
                    onClick={() => { setFilterAction(''); setDateFrom(''); setDateTo(''); setSearch(''); }}
                >
                    Wyczyść
                </button>
            </div>

            {loading ? (
                <div className="empty-state"><p>Ładowanie...</p></div>
            ) : rows.length === 0 ? (
                <div className="empty-state">
                    <p>Brak wpisów w historii.</p>
                </div>
            ) : (
                <>
                <table className="transactions-table">
                    <thead>
                        <tr>
                            <th style={{ width: '170px' }}>Data i godzina</th>
                            <th style={{ width: '140px' }}>Typ</th>
                            <th>Opis</th>
                            <th>Szczegóły</th>
                            <th style={{ width: '80px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((entry) => {
                            const meta = ACTION_META[entry.action] || { label: entry.action, bg: '#F3F4F6', fg: '#374151' };
                            const isExpanded = expandedId === entry.id;
                            const hasDetails = entry.transaction_snapshot || entry.changes || entry.details;
                            return (
                                <React.Fragment key={entry.id}>
                                    <tr>
                                        <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{formatDate(entry.created_at)}</td>
                                        <td>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '3px 10px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                background: meta.bg,
                                                color: meta.fg,
                                            }}>
                                                {meta.label}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '13px' }}>{entry.message || '—'}</td>
                                        <td>
                                            {entry.action === 'update' || entry.action === 'note_update' ? (
                                                <ChangesDiff changes={entry.changes} />
                                            ) : entry.action === 'delete' || entry.action === 'split_delete' ? (
                                                <SnapshotSummary snap={entry.transaction_snapshot} />
                                            ) : entry.action === 'csv_import' ? (
                                                <span style={{ fontSize: '12px', color: '#6B7280' }}>
                                                    {entry.details?.imported_count ?? 0} nowych
                                                    {entry.details?.skipped_duplicates > 0 && ` · ${entry.details.skipped_duplicates} duplikatów pominięto`}
                                                </span>
                                            ) : (
                                                <SnapshotSummary snap={entry.transaction_snapshot} />
                                            )}
                                        </td>
                                        <td>
                                            {hasDetails && (
                                                <button
                                                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                                                    style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', color: '#4318FF' }}
                                                >
                                                    {isExpanded ? 'Zwiń' : 'JSON'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={5} style={{ background: '#F9FAFB', padding: '12px 20px' }}>
                                                <pre style={{ margin: 0, fontSize: '11px', color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{JSON.stringify({
    id: entry.id,
    transaction_id: entry.transaction_id,
    changes: entry.changes,
    snapshot: entry.transaction_snapshot,
    details: entry.details,
}, null, 2)}
                                                </pre>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>

                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px' }}>
                        <button
                            onClick={() => setPage(0)}
                            disabled={page === 0}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: page === 0 ? '#F4F7FE' : '#fff', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                        >«</button>
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: page === 0 ? '#F4F7FE' : '#fff', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                        >‹</button>
                        <span style={{ fontSize: '13px', color: '#2B3674', fontWeight: 600, padding: '0 12px' }}>
                            {page + 1} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: page >= totalPages - 1 ? '#F4F7FE' : '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                        >›</button>
                        <button
                            onClick={() => setPage(totalPages - 1)}
                            disabled={page >= totalPages - 1}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: page >= totalPages - 1 ? '#F4F7FE' : '#fff', cursor: page >= totalPages - 1 ? 'default' : 'pointer', color: page >= totalPages - 1 ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                        >»</button>
                    </div>
                )}
                </>
            )}
        </div>
    );
}
