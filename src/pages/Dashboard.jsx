import React, { useState, useEffect } from 'react';
import {
    getAllTransactions,
    getAllCategories,
    getAllCamps,
    addTransaction,
    addTransactions,
    updateTransaction,
    deleteTransactions,
    clearAllTransactions,
    subscribeToTransactions,
    subscribeToCategories,
    subscribeToCamps,
    unsubscribe
} from '../db';
import { parseCSV, normalizeTransaction } from '../utils/csvParser';
import { Upload, Search, StickyNote, Wand2, TrendingUp, TrendingDown, Wallet, Receipt } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [camps, setCamps] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('income');
    const [isImporting, setIsImporting] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterCamp, setFilterCamp] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [loading, setLoading] = useState(true);
    const [filterReview, setFilterReview] = useState(false);
    const [filterMonth, setFilterMonth] = useState('');
    const [lastDays, setLastDays] = useState('');
    const [pageSize, setPageSize] = useState(50);
    const [lastClickedIndex, setLastClickedIndex] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [addingSubFor, setAddingSubFor] = useState(null);
    const [newSub, setNewSub] = useState({ amount: '', category: '', camp: '', note: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [subFormKey, setSubFormKey] = useState(0);

    // Cash transaction modal
    const [showCashModal, setShowCashModal] = useState(false);
    const todayStr = new Date().toISOString().slice(0, 10);
    const [cashForm, setCashForm] = useState({
        type: 'income',
        date: todayStr,
        amount: '',
        currency: 'PLN',
        exchangeRate: '',
        title: '',
        sender: '',
        category: '',
        camp: '',
    });
    const cashAmountPLN = cashForm.currency === 'EUR' && cashForm.amount && cashForm.exchangeRate
        ? (parseFloat(cashForm.amount) * parseFloat(cashForm.exchangeRate)).toFixed(2)
        : null;

    // Load initial data
    useEffect(() => {
        loadData();
    }, []);

    // Reset to page 1 whenever any filter or sort changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType, filterCategory, filterCamp, dateFrom, dateTo, filterReview, sortConfig, pageSize]);

    // Setup realtime subscriptions
    useEffect(() => {
        const transactionsChannel = subscribeToTransactions((payload) => {
            console.log('Transaction change:', payload);
            loadTransactions(); // Reload in background without toggling `loading` state
        });

        const categoriesChannel = subscribeToCategories((payload) => {
            console.log('Category change:', payload);
            loadCategories();
        });

        const campsChannel = subscribeToCamps((payload) => {
            console.log('Camp change:', payload);
            loadCamps();
        });

        return () => {
            unsubscribe(transactionsChannel);
            unsubscribe(categoriesChannel);
            unsubscribe(campsChannel);
        };
    }, []);

    const loadData = async () => {
        setLoading(true);
        await Promise.all([
            loadTransactions(),
            loadCategories(),
            loadCamps()
        ]);
        setLoading(false);
    };

    const loadTransactions = async () => {
        const data = await getAllTransactions();
        setTransactions(data);
    };

    const loadCategories = async () => {
        const data = await getAllCategories();
        setCategories(data);
    };

    const loadCamps = async () => {
        const data = await getAllCamps();
        setCamps(data);
    };

    // Toggle Selection
    const toggleSelection = (id, index, shiftKey) => {
        const newSet = new Set(selectedIds);
        if (shiftKey && lastClickedIndex !== null && displayedTransactions) {
            const from = Math.min(lastClickedIndex, index);
            const to = Math.max(lastClickedIndex, index);
            const rangeIds = displayedTransactions.slice(from, to + 1).map(t => t.id);
            const allSelected = rangeIds.every(rid => newSet.has(rid));
            rangeIds.forEach(rid => allSelected ? newSet.delete(rid) : newSet.add(rid));
        } else {
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
        }
        setLastClickedIndex(index);
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
            await deleteTransactions(Array.from(selectedIds));
            setSelectedIds(new Set());
        }
    };

    const handleBulkCategory = async (cat) => {
        if (!selectedIds.size || !cat) return;
        await Promise.all(
            Array.from(selectedIds).map(id => updateTransaction(id, { category: cat }))
        );
        setSelectedIds(new Set());
    };

    const handleBulkCamp = async (camp) => {
        if (!selectedIds.size || !camp) return;
        await Promise.all(
            Array.from(selectedIds).map(id => updateTransaction(id, { camp: camp }))
        );
        // NOTE: selection is intentionally preserved so the user can
        // immediately click ✓ on any selected row to confirm all of them.
    };

    const autoAssignCampsToExisting = async () => {
        if (!window.confirm("Ta operacja spróbuje automatycznie dobrać wyjazd do każdej transakcji, która jeszcze go nie ma. Kontynuować?")) return;

        setLoading(true);
        try {
            let updatedCount = 0;
            const requiresCamp = (category) => category && category.toLowerCase().includes('usługa turystyczna');

            const unassigned = transactions.filter(t => !t.camp || t.camp.trim() === '');

            for (const t of unassigned) {
                const mockedRow = [t.date, t.amount, t.currency || 'PLN', t.sender, t.title];
                const normalizedResult = await normalizeTransaction(mockedRow, camps);

                // Always apply re-categorization — fixes old transactions imported with wrong category
                const updates = { needs_review: false };
                if (normalizedResult.category && normalizedResult.category !== t.category) {
                    updates.category = normalizedResult.category;
                }

                // Only assign camp if category requires it
                if (!requiresCamp(normalizedResult.category || t.category)) {
                    await updateTransaction(t.id, updates);
                    continue;
                }

                if (normalizedResult.camp) {
                    updates.camp = normalizedResult.camp;
                    updates.needs_review = normalizedResult.needsReview;
                    updatedCount++;
                } else {
                    updates.needs_review = true;
                }

                await updateTransaction(t.id, updates);
            }
            alert(`Udało się dopasować wyjazd do ${updatedCount} transakcji!`);
        } catch (e) {
            console.error(e);
            alert("Błąd automatycznego dopasowania: " + e.message);
        } finally {
            setLoading(false);
            loadData();
        }
    };

    // Admin confirms the camp assignment — clears the needs_review flag
    // If the clicked transaction is part of a multi-selection, confirm ALL selected
    const handleCampConfirm = (id) => {
        if (selectedIds.has(id) && selectedIds.size > 1) {
            Promise.all(Array.from(selectedIds).map(sid => updateTransaction(sid, { needs_review: false })));
            setSelectedIds(new Set());
        } else {
            updateTransaction(id, { needs_review: false });
        }
    };

    // Sub-transactions
    const toggleExpand = (id) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const handleAddSub = async (parentId) => {
        const parent = transactions.find(t => t.id === parentId);
        const amount = parseFloat(String(newSub.amount).replace(',', '.'));
        if (!amount || isNaN(amount)) return alert('Podaj kwotę');
        try {
            await addTransaction({
                parent_id: parentId,
                date: parent.date,
                amount,
                original_amount: null,
                currency: parent.currency || 'PLN',
                sender: parent.sender,
                title: parent.title,
                category: newSub.category || parent.category || '',
                camp: newSub.camp || '',
                note: newSub.note || '',
                needs_review: false,
                source_file: 'manual',
            });
        } catch (err) {
            alert('Błąd zapisu podziału: ' + err.message + '\n\nSprawdź czy uruchomiłeś migrację add_parent_id.sql w Supabase SQL Editor.');
            return;
        }
        // Keep form open for next sub-transaction, only clear amount and note
        setNewSub(s => ({ ...s, amount: '', note: '' }));
        setSubFormKey(k => k + 1); // force re-mount so autoFocus fires again
        const newSet = new Set(expandedIds);
        newSet.add(parentId);
        setExpandedIds(newSet);
    };

    const handleDeleteSub = async (id) => {
        if (window.confirm('Usunąć tę podtransakcję?')) {
            await deleteTransactions([id]);
        }
    };

    const handleSaveCashTransaction = async () => {
        const rawAmount = parseFloat(String(cashForm.amount).replace(',', '.'));
        if (!rawAmount || isNaN(rawAmount) || rawAmount <= 0) return alert('Podaj prawidłową kwotę');
        if (!cashForm.date) return alert('Podaj datę');
        if (!cashForm.title.trim()) return alert('Podaj tytuł');

        let amountPLN;
        let originalAmount = null;
        if (cashForm.currency === 'EUR') {
            const rate = parseFloat(String(cashForm.exchangeRate).replace(',', '.'));
            if (!rate || isNaN(rate) || rate <= 0) return alert('Podaj kurs EUR→PLN');
            amountPLN = rawAmount * rate;
            originalAmount = rawAmount;
        } else {
            amountPLN = rawAmount;
        }
        const signedAmount = cashForm.type === 'expense' ? -amountPLN : amountPLN;

        try {
            await addTransaction({
                date: cashForm.date,
                amount: signedAmount,
                original_amount: originalAmount,
                currency: cashForm.currency,
                title: cashForm.title.trim(),
                sender: cashForm.sender.trim() || (cashForm.type === 'expense' ? 'Gotówka' : 'Gotówka'),
                category: cashForm.category || '',
                camp: cashForm.camp || '',
                needs_review: false,
                source_file: 'cash',
            });
            setShowCashModal(false);
            setCashForm({ type: 'income', date: new Date().toISOString().slice(0, 10), amount: '', currency: 'PLN', exchangeRate: '', title: '', sender: '', category: '', camp: '' });
        } catch (err) {
            alert('Błąd zapisu: ' + err.message);
        }
    };

    // File Handler
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        try {
            const data = await parseCSV(file, camps);
            console.log("Parsed Data:", data);

            // Convert field names to match Supabase schema (snake_case)
            const formattedData = data.map(t => ({
                date: t.date,
                amount: t.amount,
                original_amount: t.originalAmount,
                currency: t.currency,
                sender: t.sender,
                title: t.title,
                category: t.category,
                camp: t.camp,
                needs_review: t.needsReview ?? false,
                source_file: t.sourceFile
            }));

            // Deduplication logic inside Dashboard
            const newTransactions = formattedData.filter(newTx => {
                return !transactions.some(existingTx =>
                    existingTx.date === newTx.date &&
                    existingTx.amount === newTx.amount &&
                    existingTx.title === newTx.title &&
                    existingTx.sender === newTx.sender
                );
            });

            if (newTransactions.length === 0) {
                alert('Wszystkie transakcje z tego pliku już istnieją w systemie!');
                return;
            }

            await addTransactions(newTransactions);

            if (newTransactions.length < formattedData.length) {
                alert(`Zaimportowano ${newTransactions.length} nowych transakcji. Pominięto ${formattedData.length - newTransactions.length} duplikatów!`);
            } else {
                alert(`Zaimportowano ${newTransactions.length} transakcji!`);
            }
        } catch (err) {
            console.error(err);
            alert('Błąd importu: ' + err.message);
        } finally {
            setIsImporting(false);
            e.target.value = null;
        }
    };

    const handleCategoryChange = (id, newCategory) => {
        updateTransaction(id, { category: newCategory });
    };

    const handleCampChange = (id, newCamp) => {
        updateTransaction(id, { camp: newCamp });
    };

    const getCategoryStyle = (cat) => {
        if (cat === 'usługa turystyczna') return { color: '#05CD99', fontWeight: 600 };
        if (cat === 'nauka pływania') return { color: '#4318FF', fontWeight: 600 };
        if (cat === 'Szkolenie') return { color: '#FFB547', fontWeight: 600 };
        return {};
    };

    const childrenByParent = transactions.reduce((acc, t) => {
        if (t.parent_id) {
            if (!acc[t.parent_id]) acc[t.parent_id] = [];
            acc[t.parent_id].push(t);
        }
        return acc;
    }, {});

    const filteredTransactions = transactions?.filter(t => {
        if (t.parent_id) return false; // sub-transactions shown inline under parent

        const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.sender.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        if (filterType === 'income') { if (t.amount <= 0) return false; }
        if (filterType === 'expense') { if (t.amount >= 0) return false; }
        if (filterType === 'euro') { if (t.currency !== 'EUR') return false; }

        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;

        if (filterCategory && t.category !== filterCategory) return false;
        if (filterCamp && t.camp !== filterCamp) return false;
        if (filterReview && !t.needs_review) return false;

        return true;
    }).sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';

        if (sortConfig.key === 'amount') {
            aValue = Number(aValue);
            bValue = Number(bValue);
        } else {
            aValue = String(aValue).toLowerCase();
            bValue = String(bValue).toLowerCase();
        }

        if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key) => {
        if (sortConfig.key !== key) return ' ↕';
        return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

    const handleMonthFilter = (monthStr) => {
        setFilterMonth(monthStr);
        setLastDays('');
        if (monthStr) {
            const [year, month] = monthStr.split('-').map(Number);
            const lastDay = new Date(year, month, 0).getDate();
            setDateFrom(`${monthStr}-01`);
            setDateTo(`${monthStr}-${String(lastDay).padStart(2, '0')}`);
        } else {
            setDateFrom('');
            setDateTo('');
        }
    };

    const handleLastDays = (days) => {
        setLastDays(days);
        setFilterMonth('');
        if (days && parseInt(days) > 0) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(days));
            setDateFrom(cutoff.toISOString().split('T')[0]);
            setDateTo('');
        } else {
            setDateFrom('');
            setDateTo('');
        }
    };

    const MONTHS_PL = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    const formatMonth = (m) => {
        const [year, month] = m.split('-');
        return `${MONTHS_PL[parseInt(month) - 1]} ${year}`;
    };
    const availableMonths = [...new Set((transactions || []).map(t => t.date?.slice(0, 7)).filter(Boolean))].sort().reverse();

    const totalPages = Math.ceil((filteredTransactions?.length || 0) / pageSize);
    const displayedTransactions = filteredTransactions?.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // KPI stats (from ALL non-sub transactions, unfiltered for full picture)
    const allParent = (transactions || []).filter(t => !t.parent_id);
    const kpiIncome  = allParent.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const kpiExpense = allParent.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const kpiBalance = kpiIncome - kpiExpense;
    const kpiCount   = allParent.length;
    const kpiReview  = allParent.filter(t => t.needs_review).length;
    const fmt = (n) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Ładowanie danych...</div>;
    }

    return (
        <div className="dashboard-container">

            {/* ── KPI Cards ── */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#4318FF,#7551FF)' }}>
                        <Wallet size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Saldo</span>
                        <span className="kpi-value" style={{ color: kpiBalance >= 0 ? '#05CD99' : '#EE5D50' }}>
                            {fmt(kpiBalance)} PLN
                        </span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#05CD99,#00B385)' }}>
                        <TrendingUp size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Przychody</span>
                        <span className="kpi-value" style={{ color: '#05CD99' }}>{fmt(kpiIncome)} PLN</span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#EE5D50,#FF8B83)' }}>
                        <TrendingDown size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Wydatki</span>
                        <span className="kpi-value" style={{ color: '#EE5D50' }}>{fmt(kpiExpense)} PLN</span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#FFB547,#FF8C00)' }}>
                        <Receipt size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Transakcji</span>
                        <span className="kpi-value" style={{ color: '#1B2559' }}>{kpiCount.toLocaleString('pl-PL')}</span>
                        {kpiReview > 0 && (
                            <span className="kpi-badge">{kpiReview} do przejrzenia</span>
                        )}
                    </div>
                </div>
            </div>

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
                        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setFilterMonth(''); setLastDays(''); }} className="date-input" />
                        <span>-</span>
                        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setFilterMonth(''); setLastDays(''); }} className="date-input" />
                    </div>

                    {/* Month filter */}
                    <select
                        value={filterMonth}
                        onChange={e => handleMonthFilter(e.target.value)}
                        className="date-input"
                        style={{ cursor: 'pointer' }}
                    >
                        <option value="">-- Miesiąc --</option>
                        {availableMonths.map(m => (
                            <option key={m} value={m}>{formatMonth(m)}</option>
                        ))}
                    </select>

                    {/* Last N days */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="number"
                            min="1"
                            placeholder="Dni wstecz"
                            value={lastDays}
                            onChange={e => handleLastDays(e.target.value)}
                            className="date-input"
                            style={{ width: '100px' }}
                        />
                    </div>

                    {/* Additional Filters */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <select
                            value={filterCategory}
                            onChange={e => setFilterCategory(e.target.value)}
                            className="date-input"
                            style={{ cursor: 'pointer' }}
                        >
                            <option value="">-- Wszystkie Kategorie --</option>
                            {categories?.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                            <option value="Koszt">Koszt</option>
                        </select>

                        <select
                            value={filterCamp}
                            onChange={e => setFilterCamp(e.target.value)}
                            className="date-input"
                            style={{ cursor: 'pointer' }}
                        >
                            <option value="">-- Wszystkie Wyjazdy --</option>
                            {camps?.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>

                        {/* Sort by dropdown */}
                        <select
                            value={`${sortConfig.key}_${sortConfig.direction}`}
                            onChange={e => {
                                const [key, direction] = e.target.value.split('_');
                                setSortConfig({ key, direction });
                            }}
                            className="date-input"
                            style={{ cursor: 'pointer' }}
                        >
                            <option value="date_desc">Data ▼</option>
                            <option value="date_asc">Data ▲</option>
                            <option value="category_asc">Kategoria A-Z</option>
                            <option value="category_desc">Kategoria Z-A</option>
                            <option value="amount_desc">Kwota ▼</option>
                            <option value="amount_asc">Kwota ▲</option>
                            <option value="sender_asc">Nadawca A-Z</option>
                            <option value="camp_asc">Wyjazd A-Z</option>
                        </select>

                        {/* Page size */}
                        <select
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            className="date-input"
                            style={{ cursor: 'pointer' }}
                        >
                            {[25, 50, 100, 150, 200, 400].map(n => (
                                <option key={n} value={n}>Pokaż {n}</option>
                            ))}
                        </select>
                    </div>

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
                        <button
                            className={`filter-btn ${filterType === 'euro' ? 'active' : ''}`}
                            onClick={() => setFilterType('euro')}
                        >
                            Euro
                        </button>
                    </div>

                    <button
                        className={`filter-btn ${filterReview ? 'active' : ''}`}
                        onClick={() => setFilterReview(v => !v)}
                        style={filterReview ? { background: '#FFF3F3', color: '#EE5D50', borderColor: '#EE5D50', border: '1px solid', fontWeight: 700 } : { color: '#EE5D50' }}
                        title="Pokaż tylko transakcje wymagające przejrzenia"
                    >
                        🔴 Do przejrzenia ({transactions.filter(t => t.needs_review).length})
                    </button>
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
                        onClick={async () => {
                            if (window.confirm("Czy na pewno chcesz usunąć wszystkie transakcje?")) {
                                await clearAllTransactions();
                            }
                        }}
                        style={{ marginRight: 'auto', color: 'red' }} // push it to left side of action-buttons box
                    >
                        Usuń wszystko
                    </button>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            className="btn-secondary"
                            onClick={autoAssignCampsToExisting}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#4318FF', borderColor: '#4318FF', height: '42px', padding: '0 20px', borderRadius: '12px', fontWeight: 600 }}
                            title="Spróbuj automatycznie przypisać wyjazdy do starszych transakcji w bazie"
                        >
                            <Wand2 size={18} />
                            Auto-dopasuj
                        </button>

                        <label className="btn-primary" style={{ height: '42px', padding: '0 20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', borderRadius: '12px', fontWeight: 600 }}>
                            <Upload size={18} />
                            <span>{isImporting ? 'Importowanie...' : 'Wgraj CSV'}</span>
                            <input type="file" accept=".csv" onChange={handleFileUpload} hidden />
                        </label>

                        <button
                            className="btn-cash"
                            onClick={() => setShowCashModal(true)}
                        >
                            + Dodaj gotówkową
                        </button>
                    </div>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="card table-card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3>Ostatnie transakcje</h3>
                    <span style={{ fontSize: '13px', color: '#A3AED0' }}>
                        Strona {currentPage} z {totalPages || 1} · {filteredTransactions?.length ?? 0} transakcji łącznie
                    </span>
                </div>

                {!transactions || transactions.length === 0 ? (
                    <div className="empty-state">
                        <p>Brak transakcji. Wgraj plik CSV aby rozpocząć.</p>
                    </div>
                ) : (
                    <>
                    <table className="transactions-table">
                        <thead>
                            <tr>
                                <th style={{ width: '28px' }}></th>
                                <th style={{ width: '40px' }}>
                                    <input type="checkbox" onChange={toggleAll} checked={selectedIds.size > 0 && selectedIds.size === filteredTransactions?.length} />
                                </th>
                                <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>Data{getSortIndicator('date')}</th>
                                <th onClick={() => handleSort('sender')} style={{ cursor: 'pointer' }}>Nadawca / Odbiorca{getSortIndicator('sender')}</th>
                                <th onClick={() => handleSort('title')} style={{ cursor: 'pointer' }}>Tytuł{getSortIndicator('title')}</th>
                                <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>Kwota{getSortIndicator('amount')}</th>
                                <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>Kategoria{getSortIndicator('category')}</th>
                                <th onClick={() => handleSort('camp')} style={{ cursor: 'pointer' }}>Wyjazd{getSortIndicator('camp')}</th>
                                <th style={{ textAlign: 'center', width: '140px' }}>Notatka</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedTransactions?.map((t, index) => {
                                const children = childrenByParent[t.id] || [];
                                const isExpanded = expandedIds.has(t.id);
                                const isAddingHere = addingSubFor === t.id;
                                const allocatedSum = children.reduce((s, c) => s + (c.amount || 0), 0);
                                const requiresCampSub = (cat) => cat && cat.toLowerCase().includes('usługa turystyczna');
                                return (
                            <React.Fragment key={t.id}>
                                <tr className={t.needs_review ? 'needs-review' : ''} style={selectedIds.has(t.id) ? { background: '#fef2f2' } : {}}>
                                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            {children.length > 0 && (
                                                <button
                                                    onClick={() => toggleExpand(t.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#4318FF', padding: '0 4px', lineHeight: 1 }}
                                                    title={isExpanded ? 'Zwiń' : 'Rozwiń podtransakcje'}
                                                >
                                                    {isExpanded ? '▼' : '▶'}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => { setAddingSubFor(isAddingHere ? null : t.id); setNewSub({ amount: '', category: t.category || '', camp: t.camp || '', note: '' }); }}
                                                style={{ background: 'none', border: '1px dashed #A3AED0', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', color: isAddingHere ? '#EE5D50' : '#A3AED0', width: '20px', height: '20px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                title={isAddingHere ? 'Anuluj podział' : 'Dodaj podział'}
                                            >{isAddingHere ? '×' : '+'}</button>
                                        </div>
                                    </td>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(t.id)}
                                            onChange={(e) => toggleSelection(t.id, index, e.nativeEvent.shiftKey)}
                                        />
                                    </td>
                                    <td>{t.date}</td>
                                    <td>{t.sender}</td>
                                    <td>{t.title}</td>
                                    <td className={t.amount > 0 ? 'amount-pos' : 'amount-neg'}>
                                        {t.currency === 'EUR' ? (
                                            <>
                                                <div style={{ fontWeight: 700 }}>{t.original_amount?.toFixed(2)} EUR</div>
                                                <div style={{ fontSize: '0.85em', fontWeight: 400, opacity: 0.8 }}>{t.amount.toFixed(2)} PLN</div>
                                            </>
                                        ) : (
                                            <>{t.amount.toFixed(2)} PLN</>
                                        )}
                                    </td>
                                    <td>
                                        {children.length > 0 ? (
                                            <span style={{ color: '#A3AED0', fontSize: '12px', fontStyle: 'italic' }}>— podzielona —</span>
                                        ) : (
                                        <select
                                            value={t.category || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (selectedIds.has(t.id) && selectedIds.size > 1) {
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
                                        )}
                                    </td>
                                    <td>
                                        {children.length > 0 ? (
                                            <span style={{ color: '#A3AED0', fontSize: '12px', fontStyle: 'italic' }}>— podzielona —</span>
                                        ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <select
                                                value={t.camp || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (selectedIds.has(t.id) && selectedIds.size > 1) {
                                                        if (window.confirm(`Zmienić wyjazd na "${val}" dla ${selectedIds.size} zaznaczonych elementów?`)) {
                                                            handleBulkCamp(val);
                                                        } else {
                                                            updateTransaction(t.id, { camp: val, needs_review: false });
                                                        }
                                                    } else {
                                                        updateTransaction(t.id, { camp: val, needs_review: false });
                                                    }
                                                }}
                                                className={`category-select ${t.needs_review ? 'needs-review-select' : ''}`}
                                                style={{ width: '120px' }}
                                            >
                                                <option value="">-</option>
                                                {camps?.map(c => (
                                                    <option key={c.id} value={c.name}>{c.name}</option>
                                                ))}
                                            </select>
                                            {t.needs_review && (
                                                <button
                                                    className="confirm-btn"
                                                    onClick={() => handleCampConfirm(t.id)}
                                                    title="Zatwierdź to dopasowanie"
                                                >
                                                    ✓
                                                </button>
                                            )}
                                        </div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        {t.note ? (
                                            <div
                                                style={{
                                                    cursor: 'pointer',
                                                    backgroundColor: '#F4F7FE',
                                                    color: '#4318FF',
                                                    padding: '6px 10px',
                                                    borderRadius: '8px',
                                                    fontSize: '13px',
                                                    fontWeight: '600',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px',
                                                    maxWidth: '130px',
                                                    transition: 'all 0.2s',
                                                    border: '1px solid #e0e5f2'
                                                }}
                                                onClick={() => {
                                                    const newNote = window.prompt('Wpisz notatkę do tej transakcji:', t.note || '');
                                                    if (newNote !== null) {
                                                        updateTransaction(t.id, { note: newNote });
                                                    }
                                                }}
                                                title={t.note}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(67, 24, 255, 0.15)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.transform = 'translateY(0)';
                                                    e.currentTarget.style.boxShadow = 'none';
                                                }}
                                            >
                                                <StickyNote size={14} style={{ flexShrink: 0 }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {t.note}
                                                </span>
                                            </div>
                                        ) : (
                                            <div
                                                style={{ cursor: 'pointer', color: '#A3AED0', transition: 'transform 0.2s', display: 'flex', justifyContent: 'center' }}
                                                onClick={() => {
                                                    const newNote = window.prompt('Dodaj nową notatkę:', '');
                                                    if (newNote !== null && newNote.trim() !== '') {
                                                        updateTransaction(t.id, { note: newNote });
                                                    }
                                                }}
                                                title="Dodaj notatkę..."
                                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                            >
                                                <StickyNote size={18} />
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                {/* Sub-transaction rows */}
                                {isExpanded && children.map(child => (
                                    <tr key={child.id} className="sub-transaction">
                                        <td></td>
                                        <td></td>
                                        <td style={{ color: '#A3AED0', fontSize: '13px' }}>{child.date}</td>
                                        <td></td>
                                        <td style={{ color: '#A3AED0', fontSize: '13px', fontStyle: 'italic' }}>
                                            ↳ {child.note || 'Podział'}
                                        </td>
                                        <td className={child.amount > 0 ? 'amount-pos' : 'amount-neg'}>
                                            {child.amount?.toFixed(2)} PLN
                                        </td>
                                        <td>
                                            <select
                                                value={child.category || ''}
                                                onChange={e => updateTransaction(child.id, { category: e.target.value })}
                                                className="category-select"
                                            >
                                                <option value="">-- Wybierz --</option>
                                                {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                <option value="Koszt">Koszt</option>
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={child.camp || ''}
                                                onChange={e => updateTransaction(child.id, { camp: e.target.value })}
                                                className="category-select"
                                                style={{ width: '120px' }}
                                            >
                                                <option value="">-</option>
                                                {camps?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleDeleteSub(child.id)}
                                                style={{ background: 'none', border: 'none', color: '#EE5D50', cursor: 'pointer', fontSize: '16px', fontWeight: 700 }}
                                                title="Usuń podtransakcję"
                                            >✕</button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Add sub-transaction form — shown when "+" clicked or after expand if adding */}
                                {(isAddingHere || (isExpanded && addingSubFor === t.id)) && (
                                    <tr key={`sub-form-${t.id}-${subFormKey}`} className="add-sub-row">
                                        <td colSpan={2}></td>
                                        <td colSpan={2} style={{ color: '#4318FF', fontSize: '13px', fontWeight: 600 }}>
                                            + Podział #{children.length + 1}
                                            <span style={{ marginLeft: '10px', fontWeight: 400, color: '#A3AED0' }}>
                                                {`przypisano ${allocatedSum.toFixed(2)} / ${t.amount?.toFixed(2)} PLN`}
                                                {(t.amount - allocatedSum) > 0 &&
                                                    <span style={{ color: '#EE5D50', marginLeft: '6px' }}>· pozostało {(t.amount - allocatedSum).toFixed(2)} PLN</span>
                                                }
                                            </span>
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                placeholder="Kwota PLN"
                                                value={newSub.amount}
                                                onChange={e => setNewSub(s => ({ ...s, amount: e.target.value }))}
                                                style={{ width: '100px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #ddd' }}
                                                autoFocus
                                                onKeyDown={e => e.key === 'Enter' && handleAddSub(t.id)}
                                            />
                                        </td>
                                        <td>
                                            <select
                                                value={newSub.category}
                                                onChange={e => setNewSub(s => ({ ...s, category: e.target.value }))}
                                                className="category-select"
                                            >
                                                <option value="">-- Kategoria --</option>
                                                {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                <option value="Koszt">Koszt</option>
                                            </select>
                                        </td>
                                        <td>
                                            {requiresCampSub(newSub.category) && (
                                                <select
                                                    value={newSub.camp}
                                                    onChange={e => setNewSub(s => ({ ...s, camp: e.target.value }))}
                                                    className="category-select"
                                                    style={{ width: '120px' }}
                                                >
                                                    <option value="">- Wyjazd -</option>
                                                    {camps?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                </select>
                                            )}
                                        </td>
                                        <td style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <button onClick={() => handleAddSub(t.id)} style={{ background: '#4318FF', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '5px 14px' }}>+ Dodaj</button>
                                            <button onClick={() => setAddingSubFor(null)} style={{ background: '#F4F7FE', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#2B3674', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px' }}>Gotowe</button>
                                        </td>
                                    </tr>
                                )}

                                {/* "Add another split" button when expanded but not currently adding */}
                                {isExpanded && !isAddingHere && children.length > 0 && (
                                    <tr className="add-sub-row">
                                        <td colSpan={9} style={{ textAlign: 'left', padding: '6px 24px' }}>
                                            <button
                                                onClick={() => { setAddingSubFor(t.id); setNewSub({ amount: '', category: t.category || '', camp: t.camp || '', note: '' }); }}
                                                style={{ background: 'none', border: '1px dashed #4318FF', borderRadius: '6px', color: '#4318FF', cursor: 'pointer', fontSize: '13px', padding: '3px 12px' }}
                                            >+ Dodaj kolejny podział</button>
                                            <span style={{ marginLeft: '16px', fontSize: '13px', color: '#A3AED0' }}>
                                                Przypisano: {allocatedSum.toFixed(2)} PLN / {t.amount?.toFixed(2)} PLN
                                            </span>
                                        </td>
                                    </tr>
                                )}

                            </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Pagination controls */}
                    {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '16px 0 8px' }}>
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: currentPage === 1 ? '#F4F7FE' : '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', color: currentPage === 1 ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                            >«</button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: currentPage === 1 ? '#F4F7FE' : '#fff', cursor: currentPage === 1 ? 'default' : 'pointer', color: currentPage === 1 ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                            >‹</button>

                            {/* Page number buttons — show up to 7 pages around current */}
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 3)
                                .reduce((acc, p, idx, arr) => {
                                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) =>
                                    p === '...'
                                        ? <span key={`dots-${i}`} style={{ padding: '0 4px', color: '#A3AED0' }}>…</span>
                                        : <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: p === currentPage ? '#4318FF' : '#fff', color: p === currentPage ? '#fff' : '#2B3674', cursor: 'pointer', fontWeight: p === currentPage ? 700 : 500, minWidth: '36px' }}
                                        >{p}</button>
                                )}

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: currentPage === totalPages ? '#F4F7FE' : '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', color: currentPage === totalPages ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                            >›</button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid #E2E8F0', background: currentPage === totalPages ? '#F4F7FE' : '#fff', cursor: currentPage === totalPages ? 'default' : 'pointer', color: currentPage === totalPages ? '#A3AED0' : '#2B3674', fontWeight: 600 }}
                            >»</button>
                        </div>
                    )}
                    </>
                )}
            </div>
            {/* Cash Transaction Modal */}
            {showCashModal && (
                <div className="cash-modal-backdrop" onClick={() => setShowCashModal(false)}>
                    <div className="cash-modal" onClick={e => e.stopPropagation()}>
                        <div className="cash-modal-header">
                            <h2>Dodaj transakcję gotówkową</h2>
                            <button className="cash-modal-close" onClick={() => setShowCashModal(false)}>✕</button>
                        </div>

                        <div className="cash-modal-body">
                            {/* Type toggle */}
                            <div className="cash-field">
                                <label>Typ transakcji</label>
                                <div className="cash-type-toggle">
                                    <button
                                        className={cashForm.type === 'income' ? 'active-income' : ''}
                                        onClick={() => setCashForm(f => ({ ...f, type: 'income' }))}
                                    >↑ Przychód</button>
                                    <button
                                        className={cashForm.type === 'expense' ? 'active-expense' : ''}
                                        onClick={() => setCashForm(f => ({ ...f, type: 'expense' }))}
                                    >↓ Wydatek</button>
                                </div>
                            </div>

                            <div className="cash-row">
                                <div className="cash-field">
                                    <label>Data</label>
                                    <input type="date" value={cashForm.date} onChange={e => setCashForm(f => ({ ...f, date: e.target.value }))} />
                                </div>
                                <div className="cash-field">
                                    <label>Waluta</label>
                                    <select value={cashForm.currency} onChange={e => setCashForm(f => ({ ...f, currency: e.target.value, exchangeRate: '' }))}>
                                        <option value="PLN">PLN</option>
                                        <option value="EUR">EUR</option>
                                    </select>
                                </div>
                            </div>

                            <div className="cash-row">
                                <div className="cash-field">
                                    <label>Kwota ({cashForm.currency})</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={cashForm.amount}
                                        onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))}
                                    />
                                </div>
                                {cashForm.currency === 'EUR' && (
                                    <div className="cash-field">
                                        <label>Kurs EUR → PLN</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.0001"
                                            placeholder="np. 4.25"
                                            value={cashForm.exchangeRate}
                                            onChange={e => setCashForm(f => ({ ...f, exchangeRate: e.target.value }))}
                                        />
                                    </div>
                                )}
                            </div>

                            {cashAmountPLN && (
                                <p className="cash-eur-hint">= {cashAmountPLN} PLN po przeliczeniu</p>
                            )}

                            <div className="cash-field">
                                <label>Tytuł</label>
                                <input
                                    type="text"
                                    placeholder="np. Opłata gotówkowa"
                                    value={cashForm.title}
                                    onChange={e => setCashForm(f => ({ ...f, title: e.target.value }))}
                                />
                            </div>

                            <div className="cash-field">
                                <label>Nadawca / Odbiorca</label>
                                <input
                                    type="text"
                                    placeholder="np. Jan Kowalski"
                                    value={cashForm.sender}
                                    onChange={e => setCashForm(f => ({ ...f, sender: e.target.value }))}
                                />
                            </div>

                            <div className="cash-row">
                                <div className="cash-field">
                                    <label>Kategoria</label>
                                    <select value={cashForm.category} onChange={e => setCashForm(f => ({ ...f, category: e.target.value }))}>
                                        <option value="">— Wybierz —</option>
                                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div className="cash-field">
                                    <label>Wyjazd</label>
                                    <select value={cashForm.camp} onChange={e => setCashForm(f => ({ ...f, camp: e.target.value }))}>
                                        <option value="">— Wybierz —</option>
                                        {camps.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="cash-modal-footer">
                            <button className="cash-cancel-btn" onClick={() => setShowCashModal(false)}>Anuluj</button>
                            <button
                                className={`cash-save-btn ${cashForm.type === 'expense' ? 'expense' : 'income'}`}
                                onClick={handleSaveCashTransaction}
                            >
                                {cashForm.type === 'income' ? '↑ Zapisz przychód' : '↓ Zapisz wydatek'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
