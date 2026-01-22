import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { parseCSV, normalizeTransaction } from '../utils/csvParser';
import { Upload, Search, Filter } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
    const transactions = useLiveQuery(() => db.transactions.reverse().toArray()); // Newest first
    const categories = useLiveQuery(() => db.categories.toArray());

    const camps = useLiveQuery(() => db.camps.toArray());
    const [selectedIds, setSelectedIds] = useState(new Set());

    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('income'); // Request #7: Default 'Wpływy'
    const [isImporting, setIsImporting] = useState(false);

    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [sortOrder, setSortOrder] = useState('desc'); // 'desc' (newest), 'asc' (oldest)

    // Toggle Selection
    const toggleSelection = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredTransactions?.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredTransactions.map(t => t.id)));
        }
    };

    // Bulk Actions
    const handleBulkDelete = async () => {
        if (!selectedIds.size) return;
        if (window.confirm(`Usunąć ${selectedIds.size} transakcji?`)) {
            await db.transactions.bulkDelete(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    };

    const handleBulkCategory = async (cat) => {
        if (!selectedIds.size || !cat) return;
        await Promise.all(Array.from(selectedIds).map(id => db.transactions.update(id, { category: cat })));
        setSelectedIds(new Set());
    };

    const handleBulkCamp = async (camp) => {
        if (!selectedIds.size || !camp) return;
        await Promise.all(Array.from(selectedIds).map(id => db.transactions.update(id, { camp: camp })));
        setSelectedIds(new Set());
    };

    // File Handler
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const data = await parseCSV(file);
            console.log("Parsed Data:", data);

            // parseCSV already returns normalized data, no need to call normalizeTransaction again
            await db.transactions.bulkAdd(data);
            alert(`Zaimportowano ${data.length} transakcji!`);
        } catch (err) {
            console.error(err);
            alert('Błąd importu: ' + err.message);
        } finally {
            setIsImporting(false);
            e.target.value = null; // reset input
        }
    };

    const handleCategoryChange = (id, newCategory) => {
        db.transactions.update(id, { category: newCategory });
    };


    const handleCampChange = (id, newCamp) => {
        db.transactions.update(id, { camp: newCamp });
    };

    const getCategoryStyle = (cat) => {
        if (cat === 'usługa turystyczna') return { color: '#05CD99', fontWeight: 600 }; // Green
        if (cat === 'nauka pływania') return { color: '#4318FF', fontWeight: 600 }; // Blue
        if (cat === 'Szkolenie') return { color: '#FFB547', fontWeight: 600 }; // Orange
        return {};
    };

    const filteredTransactions = transactions?.filter(t => {
        const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.sender.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (filterType === 'income') { if (t.amount <= 0) return false; }
        if (filterType === 'expense') { if (t.amount >= 0) return false; }

        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;

        return true;
    }).sort((a, b) => {
        if (sortOrder === 'asc') return a.date.localeCompare(b.date);
        return b.date.localeCompare(a.date);
    });

    return (
        <div className="dashboard-container">
            {/* Search & Actions Bar */}
            <div className="action-bar" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <div className="left-controls" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div className="search-box">
                        <Search size={18} className="search-icon" />
                        <input
                            type="text"
                            placeholder="Szukaj transakcji..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    {/* Date Filters */}
                    <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="date-input" />
                        <span>-</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="date-input" />
                    </div>

                    {/* Sort Toggle */}
                    <button
                        className="filter-btn"
                        onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                        title="Sortowanie daty"
                    >
                        {sortOrder === 'desc' ? 'Najnowsze ▼' : 'Najstarsze ▲'}
                    </button>

                    <div className="filter-group">
                        <button
                            className={`filter-btn ${filterType === 'all' ? 'active' : ''}`}
                            onClick={() => setFilterType('all')}
                        >
                            Wszystkie
                        </button>
                        <button
                            className={`filter-btn ${filterType === 'income' ? 'active' : ''}`}
                            onClick={() => setFilterType('income')}
                        >
                            Wpływy
                        </button>
                        <button
                            className={`filter-btn ${filterType === 'expense' ? 'active' : ''}`}
                            onClick={() => setFilterType('expense')}
                        >
                            Koszty
                        </button>
                    </div>
                </div>

                <div className="action-buttons">
                    {selectedIds.size > 0 && (
                        <div style={{ marginRight: '15px', color: '#666', fontSize: '14px' }}>
                            Zaznaczono: {selectedIds.size}
                            <button onClick={handleBulkDelete} style={{ marginLeft: '10px', color: 'red', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Usuń</button>
                        </div>
                    )}

                    <button
                        className="filter-btn"
                        onClick={() => {
                            if (window.confirm("Czy na pewno chcesz usunąć wszystkie transakcje?")) {
                                db.transactions.clear();
                                window.location.reload();
                            }
                        }}
                        style={{ marginRight: '10px', color: 'red' }}
                    >
                        Usuń wszystko
                    </button>
                    <label className="btn-primary">
                        <Upload size={18} />
                        <span>{isImporting ? 'Importowanie...' : 'Wgraj CSV'}</span>
                        <input type="file" accept=".csv" onChange={handleFileUpload} hidden />
                    </label>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="card table-card">
                <div className="card-header">
                    <h3>Ostatnie transakcje</h3>
                </div>

                {!transactions || transactions.length === 0 ? (
                    <div className="empty-state">
                        <p>Brak transakcji. Wgraj plik CSV aby rozpocząć.</p>
                    </div>
                ) : (
                    <table className="transactions-table">
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>
                                    <input type="checkbox" onChange={toggleAll} checked={selectedIds.size > 0 && selectedIds.size === filteredTransactions?.length} />
                                </th>
                                <th>Data</th>
                                <th>Nadawca / Odbiorca</th>
                                <th>Tytuł</th>
                                <th>Kwota</th>
                                <th>Kategoria</th>
                                <th>Obóz</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTransactions?.map(t => (
                                <tr key={t.id} style={selectedIds.has(t.id) ? { background: '#f8f9fa' } : {}}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(t.id)}
                                            onChange={() => toggleSelection(t.id)}
                                        />
                                    </td>
                                    <td>{t.date}</td>
                                    <td>{t.sender}</td>
                                    <td>{t.title}</td>
                                    <td className={t.amount > 0 ? 'amount-pos' : 'amount-neg'}>
                                        {t.currency === 'EUR' ? (
                                            <>
                                                <div style={{ fontWeight: 700 }}>{t.originalAmount?.toFixed(2)} EUR</div>
                                                <div style={{ fontSize: '0.85em', fontWeight: 400, opacity: 0.8 }}>{t.amount.toFixed(2)} PLN</div>
                                            </>
                                        ) : (
                                            <>{t.amount.toFixed(2)} PLN</>
                                        )}
                                    </td>
                                    <td>
                                        <select
                                            value={t.category || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                // Bulk Update logic if this row is selected
                                                if (selectedIds.has(t.id)) {
                                                    if (window.confirm(`Zmienić kategorię na "${val}" dla ${selectedIds.size} zaznaczonych elementów?`)) {
                                                        handleBulkCategory(val);
                                                    } else {
                                                        handleCategoryChange(t.id, val);
                                                    }
                                                } else {
                                                    handleCategoryChange(t.id, val);
                                                }
                                            }}
                                            className="category-select"
                                            style={{
                                                ...getCategoryStyle(t.category),
                                                ...((!t.category || t.category === '') ? { color: '#EE5D50', fontWeight: 600 } : {})
                                            }}
                                        >
                                            <option value="" style={{ color: '#EE5D50' }}>-- Wybierz --</option>
                                            {categories?.map(c => (
                                                <option key={c.id} value={c.name}>{c.name}</option>
                                            ))}
                                            <option value="Koszt">Koszt</option>
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            value={t.camp || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (selectedIds.has(t.id)) {
                                                    if (window.confirm(`Zmienić obóz na "${val}" dla ${selectedIds.size} zaznaczonych elementów?`)) {
                                                        handleBulkCamp(val);
                                                    } else {
                                                        handleCampChange(t.id, val);
                                                    }
                                                } else {
                                                    handleCampChange(t.id, val);
                                                }
                                            }}
                                            className="category-select"
                                            style={{ width: '120px' }}
                                        >
                                            <option value="">-</option>
                                            {camps?.map(c => (
                                                <option key={c.id} value={c.name}>{c.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
