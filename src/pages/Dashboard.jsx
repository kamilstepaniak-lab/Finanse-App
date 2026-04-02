import React, { useState, useEffect } from 'react';
import {
    getAllTransactions,
    getAllCategories,
    getAllCamps,
    addTransaction,
    addTransactions,
    updateTransaction,
    deleteTransaction,
    deleteTransactions,
    getAllTransactionsIncludingDeleted,
    clearAllTransactions,
    subscribeToTransactions,
    subscribeToCategories,
    subscribeToCamps,
    unsubscribe
} from '../db';
import { parseCSV, normalizeTransaction } from '../utils/csvParser';
import { Upload, Search, StickyNote, Wand2, TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import './Dashboard.css';

export default function Dashboard() {
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [camps, setCamps] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    // Applied filter state (drives actual filtering)
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('income');
    const [isImporting, setIsImporting] = useState(false);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterCamp, setFilterCamp] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    const [loading, setLoading] = useState(true);
    const [filterReview, setFilterReview] = useState(''); // '' | 'uncertain' | 'missing'
    const [pageSize, setPageSize] = useState(50);
    // Draft filter state (what user is editing before applying)
    const [draft, setDraft] = useState({ searchTerm: '', dateFrom: '', dateTo: '', filterMonth: '', lastDays: '', filterCategory: '', filterCamp: '' });
    const [lastClickedIndex, setLastClickedIndex] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [addingSubFor, setAddingSubFor] = useState(null);
    const [newSub, setNewSub] = useState({ amount: '', category: '', camp: '', note: '' });
    const [currentPage, setCurrentPage] = useState(1);
    const [subFormKey, setSubFormKey] = useState(0);
    // Pending edits: { [transactionId]: { category?: string, camp?: string } }
    const [pendingEdits, setPendingEdits] = useState({});

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

    // Reset to page 1 whenever any applied filter or sort changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterType, filterCategory, filterCamp, dateFrom, dateTo, filterReview, sortConfig, pageSize]);

    const applyFilters = () => {
        setSearchTerm(draft.searchTerm);
        setDateFrom(draft.dateFrom);
        setDateTo(draft.dateTo);
        setFilterCategory(draft.filterCategory);
        setFilterCamp(draft.filterCamp);
    };

    const clearFilters = () => {
        const empty = { searchTerm: '', dateFrom: '', dateTo: '', filterMonth: '', lastDays: '', filterCategory: '', filterCamp: '' };
        setDraft(empty);
        setSearchTerm('');
        setDateFrom('');
        setDateTo('');
        setFilterCategory('');
        setFilterCamp('');
        setFilterType('all');
        setFilterReview(false);
    };

    const hasActiveDraft = draft.searchTerm !== searchTerm || draft.dateFrom !== dateFrom || draft.dateTo !== dateTo || draft.filterCategory !== filterCategory || draft.filterCamp !== filterCamp;

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
            await loadTransactions();
        }
    };

    const handleBulkCategory = async (cat) => {
        if (!selectedIds.size || !cat) return;
        await Promise.all(
            Array.from(selectedIds).map(id => updateTransaction(id, { category: cat }))
        );
        setSelectedIds(new Set());
        await loadTransactions();
    };

    const handleBulkCamp = async (camp) => {
        if (!selectedIds.size || !camp) return;
        await Promise.all(
            Array.from(selectedIds).map(id => updateTransaction(id, { camp: camp }))
        );
        await loadTransactions();
    };

    const autoAssignCampsToExisting = async () => {
        if (!window.confirm("Ta operacja spróbuje automatycznie dobrać wyjazd do każdej transakcji, która jeszcze go nie ma. Kontynuować?")) return;

        setLoading(true);
        try {
            let updatedCount = 0;
            const requiresCamp = (category) => category && category.toLowerCase().includes('usługa turystyczna');

            const unassigned = transactions.filter(t => !t.camp || t.camp.trim() === '' || t.needs_review);

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
            setTransactions(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, needs_review: false } : t));
            Promise.all(Array.from(selectedIds).map(sid => updateTransaction(sid, { needs_review: false })));
            setSelectedIds(new Set());
        } else {
            setTransactions(prev => prev.map(t => t.id === id ? { ...t, needs_review: false } : t));
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
        await loadTransactions();
    };

    const handleDeleteSub = async (id) => {
        if (window.confirm('Usunąć tę podtransakcję?')) {
            // Optimistic: remove instantly from UI
            setTransactions(prev => prev.filter(t => t.id !== id));
            // Hard delete from DB (children don't need soft-delete)
            deleteTransaction(id);
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
            await loadTransactions();
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

            // Fetch ALL transactions including deleted — dedup must block re-import of deleted ones
            const freshTransactions = await getAllTransactionsIncludingDeleted();

            // Deduplication logic inside Dashboard
            const newTransactions = formattedData.filter(newTx => {
                return !freshTransactions.some(existingTx =>
                    existingTx.date === newTx.date &&
                    String(existingTx.amount) === String(newTx.amount) &&
                    existingTx.title === newTx.title &&
                    existingTx.sender === newTx.sender
                );
            });

            if (newTransactions.length === 0) {
                alert('Wszystkie transakcje z tego pliku już istnieją w systemie!');
                return;
            }

            await addTransactions(newTransactions);
            await loadTransactions();

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

    const handleRemoveDuplicates = async () => {
        if (!window.confirm('Czy na pewno chcesz usunąć duplikaty? Zostanie zachowana jedna kopia każdej transakcji (najstarsza według ID).')) return;
        try {
            const all = await getAllTransactions();
            const seen = new Map();
            const idsToDelete = [];

            // Sort by id to keep the first-inserted one
            const sorted = [...all].sort((a, b) => (a.id < b.id ? -1 : 1));
            for (const tx of sorted) {
                const key = `${tx.date}|${tx.amount}|${tx.title}|${tx.sender}`;
                if (seen.has(key)) {
                    idsToDelete.push(tx.id);
                } else {
                    seen.set(key, true);
                }
            }

            if (idsToDelete.length === 0) {
                alert('Brak duplikatów – wszystko jest w porządku!');
                return;
            }

            await deleteTransactions(idsToDelete);
            await loadTransactions();
            alert(`Usunięto ${idsToDelete.length} duplikat${idsToDelete.length === 1 ? '' : idsToDelete.length < 5 ? 'y' : 'ów'}.`);
        } catch (err) {
            alert('Błąd: ' + err.message);
        }
    };

    const isTurystyczna = (cat) => (cat || '').toLowerCase().includes('turystyczna');

    // Stage a field change — shows ✓/× before saving to DB
    // If multiple rows selected, stages for ALL selected. Auto-clears camp when category ≠ turystyczna.
    const handlePendingChange = (id, field, value) => {
        const idsToUpdate = (selectedIds.has(id) && selectedIds.size > 1)
            ? Array.from(selectedIds)
            : [id];

        setPendingEdits(prev => {
            const next = { ...prev };
            idsToUpdate.forEach(tid => {
                const current = next[tid] || {};
                const updated = { ...current, [field]: value };
                if (field === 'category' && !isTurystyczna(value)) {
                    updated.camp = '';
                }
                next[tid] = updated;
            });
            return next;
        });
    };

    // Commit pending edits for id — if id is in selectedIds, commits ALL selected
    // If the committed transaction is a child, also clears needs_review on the parent
    const handleCommitEdit = (id) => {
        const idsToCommit = (selectedIds.has(id) && selectedIds.size > 1)
            ? Array.from(selectedIds)
            : [id];

        const parentIdsToClear = new Set();

        setPendingEdits(prev => {
            const next = { ...prev };
            idsToCommit.forEach(tid => {
                const edits = next[tid];
                if (!edits) return;
                const updates = { ...edits, needs_review: false };
                setTransactions(p => {
                    const tx = p.find(t => t.id === tid);
                    if (tx?.parent_id) parentIdsToClear.add(tx.parent_id);
                    return p.map(t => t.id === tid ? { ...t, ...updates } : t);
                });
                updateTransaction(tid, updates);
                delete next[tid];
            });
            return next;
        });

        // Clear needs_review on parent(s) after state update
        setTimeout(() => {
            parentIdsToClear.forEach(pid => {
                setTransactions(p => p.map(t => t.id === pid ? { ...t, needs_review: false } : t));
                updateTransaction(pid, { needs_review: false });
            });
        }, 0);

        if (selectedIds.has(id) && selectedIds.size > 1) setSelectedIds(new Set());
    };

    const handleCancelEdit = (id) => {
        const idsToCancel = (selectedIds.has(id) && selectedIds.size > 1)
            ? Array.from(selectedIds)
            : [id];
        setPendingEdits(prev => {
            const next = { ...prev };
            idsToCancel.forEach(tid => delete next[tid]);
            return next;
        });
    };

    // Direct camp change without pending (e.g. bulk ops)
    const handleCampChange = (id, newCamp) => {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, camp: newCamp, needs_review: false } : t));
        updateTransaction(id, { camp: newCamp, needs_review: false });
    };

    const getCategoryStyle = (cat) => {
        if (cat === 'usługa turystyczna') return { color: '#05CD99', fontWeight: 600 };
        if (cat === 'nauka pływania') return { color: '#4318FF', fontWeight: 600 };
        if (cat === 'Szkolenie') return { color: '#FFB547', fontWeight: 600 };
        if (cat === 'Zwrot') return { color: '#7C3AED', fontWeight: 600 };
        return {};
    };

    const childrenByParent = transactions.reduce((acc, t) => {
        if (t.parent_id) {
            if (!acc[t.parent_id]) acc[t.parent_id] = [];
            acc[t.parent_id].push(t);
        }
        return acc;
    }, {});

    // Set of IDs that are split parents — these should never show as needs_review
    const splitParentIds = new Set(Object.keys(childrenByParent));

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
        if (filterReview === 'uncertain' && !(t.needs_review && t.camp)) return false;
        if (filterReview === 'missing' && !(t.needs_review && !t.camp)) return false;

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
        if (monthStr) {
            const [year, month] = monthStr.split('-').map(Number);
            const lastDay = new Date(year, month, 0).getDate();
            setDraft(d => ({ ...d, filterMonth: monthStr, lastDays: '', dateFrom: `${monthStr}-01`, dateTo: `${monthStr}-${String(lastDay).padStart(2, '0')}` }));
        } else {
            setDraft(d => ({ ...d, filterMonth: '', dateFrom: '', dateTo: '' }));
        }
    };

    const handleLastDays = (days) => {
        if (days && parseInt(days) > 0) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(days));
            setDraft(d => ({ ...d, lastDays: days, filterMonth: '', dateFrom: cutoff.toISOString().split('T')[0], dateTo: '' }));
        } else {
            setDraft(d => ({ ...d, lastDays: days, dateFrom: '', dateTo: '' }));
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

    // KPI stats — based on filtered transactions (respects all active filters)
    // Split parents are excluded; their children are included individually (with same filters applied)
    const kpiParents = (filteredTransactions || []).filter(t => !splitParentIds.has(t.id));
    const kpiChildren = (transactions || []).filter(t => {
        if (!t.parent_id) return false;
        if (filterCamp && t.camp !== filterCamp) return false;
        if (filterCategory && t.category !== filterCategory) return false;
        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;
        return true;
    });
    const kpiItems   = [...kpiParents, ...kpiChildren];
    const kpiIncome  = kpiItems.filter(t => t.amount > 0 && t.category !== 'Zwrot').reduce((s, t) => s + t.amount, 0);
    const kpiExpense = kpiItems.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const kpiBalance = kpiIncome - kpiExpense;
    const kpiCount   = kpiItems.length;
    const kpiZwrot   = kpiItems.filter(t => t.category === 'Zwrot' && t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const kpiReview  = kpiParents.filter(t => t.needs_review && t.camp).length;
    const kpiMissing = kpiParents.filter(t => t.needs_review && !t.camp).length;
    const fmt = (n) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Ładowanie danych...</div>;
    }

    return (
        <div className="dashboard-container">

            {/* ── KPI Cards ── */}
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
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
                            <span className="kpi-badge" style={{ background: '#FEF3C7', color: '#92400E' }}>{kpiReview} do przejrzenia</span>
                        )}
                        {kpiMissing > 0 && (
                            <span className="kpi-badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>{kpiMissing} bez obozu</span>
                        )}
                        {kpiZwrot > 0 && (
                            <span className="kpi-badge" style={{ background: '#EDE9FE', color: '#6D28D9' }}>{fmt(kpiZwrot)} PLN zwrotów</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="filter-panel">
                {/* Row 1: Type toggles + quick review */}
                <div className="filter-row">
                    <div className="filter-field-group">
                        <span className="filter-field-label">Typ</span>
                        <div className="filter-group">
                            {[['all','Wszystkie'],['income','Wpływy'],['expense','Koszty'],['euro','Euro']].map(([val, label]) => (
                                <button key={val} className={`filter-btn ${filterType === val ? 'active' : ''}`} onClick={() => setFilterType(val)}>{label}</button>
                            ))}
                        </div>
                    </div>
                    <button
                        className={`review-btn ${filterReview === 'uncertain' ? 'active' : ''}`}
                        onClick={() => setFilterReview(v => v === 'uncertain' ? '' : 'uncertain')}
                        title="Pokaż transakcje z sugerowanym obozem (do potwierdzenia)"
                        style={{ borderColor: '#F59E0B', color: filterReview === 'uncertain' ? '#fff' : '#92400E', background: filterReview === 'uncertain' ? '#F59E0B' : 'transparent' }}
                    >
                        <span className="review-dot" style={{ background: '#F59E0B' }} />
                        Do przejrzenia ({transactions.filter(t => t.needs_review && t.camp).length})
                    </button>
                    <button
                        className={`review-btn ${filterReview === 'missing' ? 'active' : ''}`}
                        onClick={() => setFilterReview(v => v === 'missing' ? '' : 'missing')}
                        title="Pokaż transakcje bez przypisanego obozu"
                        style={{ borderColor: '#EE5D50', color: filterReview === 'missing' ? '#fff' : '#991B1B', background: filterReview === 'missing' ? '#EE5D50' : 'transparent' }}
                    >
                        <span className="review-dot" style={{ background: '#EE5D50' }} />
                        Bez obozu ({transactions.filter(t => t.needs_review && !t.camp).length})
                    </button>
                    <div className="filter-spacer" />
                    <div className="filter-field-group">
                        <span className="filter-field-label">Sortuj</span>
                        <select
                            value={`${sortConfig.key}_${sortConfig.direction}`}
                            onChange={e => { const [key, direction] = e.target.value.split('_'); setSortConfig({ key, direction }); }}
                            className="filter-select"
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
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Na stronie</span>
                        <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="filter-select">
                            {[25, 50, 100, 150, 200, 400].map(n => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="filter-divider" />

                {/* Row 2: Search + date + category + camp */}
                <div className="filter-row">
                    <div className="filter-field-group" style={{ flex: '1', minWidth: '180px' }}>
                        <span className="filter-field-label">Szukaj</span>
                        <div className="search-box" style={{ width: '100%' }}>
                            <Search size={15} className="search-icon" />
                            <input
                                type="text"
                                placeholder="Tytuł lub nadawca..."
                                value={draft.searchTerm}
                                onChange={e => setDraft(d => ({ ...d, searchTerm: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Data od</span>
                        <input type="date" value={draft.dateFrom} onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value, filterMonth: '', lastDays: '' }))} className="filter-select" />
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Data do</span>
                        <input type="date" value={draft.dateTo} onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value, filterMonth: '', lastDays: '' }))} className="filter-select" />
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Miesiąc</span>
                        <select value={draft.filterMonth} onChange={e => handleMonthFilter(e.target.value)} className="filter-select">
                            <option value="">Wszystkie</option>
                            {availableMonths.map(m => (
                                <option key={m} value={m}>{formatMonth(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Dni wstecz</span>
                        <input type="number" min="1" placeholder="np. 30" value={draft.lastDays} onChange={e => handleLastDays(e.target.value)} className="filter-select" style={{ width: '90px' }} />
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Kategoria</span>
                        <select value={draft.filterCategory} onChange={e => setDraft(d => ({ ...d, filterCategory: e.target.value }))} className="filter-select">
                            <option value="">Wszystkie</option>
                            {categories?.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                            <option value="Koszt">Koszt</option>
                            <option value="Zwrot">Zwrot</option>
                        </select>
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Wyjazd</span>
                        <select value={draft.filterCamp} onChange={e => setDraft(d => ({ ...d, filterCamp: e.target.value }))} className="filter-select">
                            <option value="">Wszystkie</option>
                            {camps?.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="filter-divider" />

                {/* Row 3: Actions */}
                <div className="filter-row filter-actions-row">
                    {selectedIds.size > 0 && (
                        <div className="selection-info">
                            Zaznaczono: <strong>{selectedIds.size}</strong>
                            <button className="selection-delete-btn" onClick={handleBulkDelete}>Usuń zaznaczone</button>
                        </div>
                    )}
                    <button
                        className="btn-danger-ghost"
                        onClick={handleRemoveDuplicates}
                        title="Znajdź i usuń zduplikowane transakcje (zachowuje pierwszą kopię)"
                    >
                        Usuń duplikaty
                    </button>
                    <div className="filter-spacer" />
                    <button className="btn-filter-clear" onClick={clearFilters}>Wyczyść filtry</button>
                    <button className={`btn-filter-apply ${hasActiveDraft ? 'has-changes' : ''}`} onClick={applyFilters}>
                        Zastosuj filtry
                    </button>
                    <div className="filter-actions-separator" />
                    <button
                        className="btn-secondary"
                        onClick={autoAssignCampsToExisting}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        title="Spróbuj automatycznie przypisać wyjazdy do starszych transakcji w bazie"
                    >
                        <Wand2 size={16} />
                        Auto-dopasuj
                    </button>
                    <label className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer' }}>
                        <Upload size={16} />
                        <span>{isImporting ? 'Importowanie...' : 'Wgraj CSV'}</span>
                        <input type="file" accept=".csv" onChange={handleFileUpload} hidden />
                    </label>
                    <button className="btn-cash" onClick={() => setShowCashModal(true)}>
                        + Gotówkowa
                    </button>
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
                                <tr className={t.needs_review ? (t.camp ? 'needs-review-uncertain' : 'needs-review-missing') : ''} style={selectedIds.has(t.id) ? { background: '#fef2f2' } : {}}>
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
                                        ) : (() => {
                                            const pendingCat = pendingEdits[t.id]?.category;
                                            const displayCat = pendingCat !== undefined ? pendingCat : (t.category || '');
                                            const hasPending = pendingEdits[t.id] !== undefined;
                                            return (
                                                <select
                                                    value={displayCat}
                                                    onChange={(e) => handlePendingChange(t.id, 'category', e.target.value)}
                                                    className="category-select"
                                                    style={{
                                                        ...getCategoryStyle(displayCat),
                                                        ...(!displayCat ? { color: '#EE5D50', fontWeight: 600 } : {}),
                                                        ...(hasPending && pendingCat !== undefined ? { border: '2px solid #4318FF' } : {})
                                                    }}
                                                >
                                                    <option value="" style={{ color: '#EE5D50' }}>-- Wybierz --</option>
                                                    {categories?.map(c => (
                                                        <option key={c.id} value={c.name}>{c.name}</option>
                                                    ))}
                                                    <option value="Koszt">Koszt</option>
                                                    <option value="Zwrot">Zwrot</option>
                                                </select>
                                            );
                                        })()}
                                    </td>
                                    <td>
                                        {children.length > 0 ? (
                                            <span style={{ color: '#A3AED0', fontSize: '12px', fontStyle: 'italic' }}>— podzielona —</span>
                                        ) : (() => {
                                            const pendingCamp = pendingEdits[t.id]?.camp;
                                            const displayCamp = pendingCamp !== undefined ? pendingCamp : (t.camp || '');
                                            const hasPending = pendingEdits[t.id] !== undefined;
                                            const effectiveCat = pendingEdits[t.id]?.category !== undefined ? pendingEdits[t.id].category : t.category;
                                            return (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <select
                                                        value={displayCamp}
                                                        onChange={(e) => {
                                                            handlePendingChange(t.id, 'camp', e.target.value);
                                                        }}
                                                        className={`category-select ${!hasPending && t.needs_review ? (t.camp ? 'needs-review-select-uncertain' : 'needs-review-select-missing') : ''}`}
                                                        style={{
                                                            width: '120px',
                                                            ...(hasPending && pendingCamp !== undefined ? { border: '2px solid #4318FF' } : {}),
                                                            ...(!isTurystyczna(effectiveCat) ? { opacity: 0.4, pointerEvents: hasPending ? 'none' : 'auto' } : {})
                                                        }}
                                                        disabled={!isTurystyczna(effectiveCat)}
                                                    >
                                                        <option value="">-</option>
                                                        {camps?.map(c => (
                                                            <option key={c.id} value={c.name}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                    {hasPending ? (
                                                        <>
                                                            <button onClick={() => handleCommitEdit(t.id)} title="Zatwierdź zmiany"
                                                                style={{ background: '#05CD99', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</button>
                                                            <button onClick={() => handleCancelEdit(t.id)} title="Anuluj zmiany"
                                                                style={{ background: '#A3AED0', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                                                        </>
                                                    ) : t.needs_review ? (
                                                        <button className="confirm-btn" onClick={() => handleCampConfirm(t.id)} title="Zatwierdź dopasowanie">✓</button>
                                                    ) : null}
                                                </div>
                                            );
                                        })()}
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
                                                value={pendingEdits[child.id]?.category ?? child.category ?? ''}
                                                onChange={e => handlePendingChange(child.id, 'category', e.target.value)}
                                                className="category-select"
                                                style={pendingEdits[child.id]?.category !== undefined ? { border: '2px solid #4318FF' } : {}}
                                            >
                                                <option value="">-- Wybierz --</option>
                                                {categories?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                <option value="Koszt">Koszt</option>
                                                <option value="Zwrot">Zwrot</option>
                                            </select>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <select
                                                    value={pendingEdits[child.id]?.camp ?? child.camp ?? ''}
                                                    onChange={e => handlePendingChange(child.id, 'camp', e.target.value)}
                                                    className="category-select"
                                                    style={{ width: '100px', ...(pendingEdits[child.id]?.camp !== undefined ? { border: '2px solid #4318FF' } : {}) }}
                                                >
                                                    <option value="">-</option>
                                                    {camps?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                </select>
                                                {pendingEdits[child.id] && (
                                                    <>
                                                        <button onClick={() => handleCommitEdit(child.id)} title="Zatwierdź"
                                                            style={{ background: '#05CD99', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</button>
                                                        <button onClick={() => handleCancelEdit(child.id)} title="Anuluj"
                                                            style={{ background: '#A3AED0', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                                                    </>
                                                )}
                                            </div>
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
                                                <option value="Zwrot">Zwrot</option>
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
                                            <button onClick={() => {
                                                setAddingSubFor(null);
                                                // Clear needs_review on parent since split is now complete
                                                setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, needs_review: false } : tx));
                                                updateTransaction(t.id, { needs_review: false });
                                            }} style={{ background: '#F4F7FE', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#2B3674', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px' }}>Gotowe</button>
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
                                        <option value="Koszt">Koszt</option>
                                        <option value="Zwrot">Zwrot</option>
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
