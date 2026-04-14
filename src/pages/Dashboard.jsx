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
    getUnprocessedTransactions,
    clearAllTransactions,
    logActivity,
    subscribeToTransactions,
    subscribeToCategories,
    subscribeToCamps,
    unsubscribe
} from '../db';
import { parseCSV, normalizeTransaction } from '../utils/csvParser';
import { Upload, Search, StickyNote, Wand2, TrendingUp, TrendingDown, Receipt, DollarSign, PieChart, Euro, AlertCircle, Zap, Calendar, Sparkles } from 'lucide-react';
import './Dashboard.css';

// Normalize strings for deduplication — collapse whitespace, lowercase
const normalizeDedupKey = (str) => {
    if (!str) return '';
    return str.trim().replace(/\s+/g, ' ').toLowerCase();
};

// Normalize amount to fixed 2-decimal string: "123.450" and "123.45" both → "123.45"
const normalizeAmount = (val) => parseFloat(String(val)).toFixed(2);

// Normalize date to YYYY-MM-DD: handles "2024-1-15" → "2024-01-15"
const normalizeDate = (d) => {
    if (!d) return '';
    const parts = String(d).split('-');
    if (parts.length === 3) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return d;
};

export default function Dashboard() {
    const [transactions, setTransactions] = useState([]);
    const [categories, setCategories] = useState([]);
    const [camps, setCamps] = useState([]);
    const activeCamps = (camps || []).filter(c => !c.is_completed);
    // Exclude "Koszt" from dynamic list — it's always added as a hardcoded option
    // Case-insensitive + trimmed comparison to avoid duplicates from accidental DB entries
    const displayCategories = (categories || []).filter(c => (c.name || '').trim().toLowerCase() !== 'koszt');
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
    const [filterCampYear, setFilterCampYear] = useState(''); // '' | '2025' | '2026' etc.
    const [pageSize, setPageSize] = useState(50);
    // Draft filter state (what user is editing before applying)
    const [draft, setDraft] = useState({ searchTerm: '', dateFrom: '', dateTo: '', filterMonth: '', lastDays: '', filterCategory: '', filterCamp: '' });
    const [lastClickedIndex, setLastClickedIndex] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());
    // Split wizard: null when closed, object when open
    // { parentId, parentAmount, confirmedParts: [{amount,category,camp}], currentAmount, currentCategory, currentCamp }
    const [splitWizard, setSplitWizard] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
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
        setFilterReview('');
    };

    const hasActiveDraft = draft.searchTerm !== searchTerm || draft.dateFrom !== dateFrom || draft.dateTo !== dateTo || draft.filterCategory !== filterCategory || draft.filterCamp !== filterCamp;

    // Count currently APPLIED filters (for the badge)
    const activeFiltersCount = [
        searchTerm,
        dateFrom,
        dateTo,
        filterCategory,
        filterCamp,
        filterType !== 'all' ? filterType : '',
        filterReview,
    ].filter(Boolean).length;

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
            const ids = Array.from(selectedIds);
            const snapshots = transactions.filter(t => selectedIds.has(t.id));
            await deleteTransactions(ids);
            // Log bulk deletion as one entry (avoids 1000+ individual log writes)
            await logActivity({
                action: 'bulk_delete',
                message: `Usunięto ${snapshots.length} transakcji`,
                details: { count: snapshots.length, ids },
            });
            setSelectedIds(new Set());
            await loadTransactions();
        }
    };

    const handleBulkCategory = async (cat) => {
        if (!selectedIds.size || !cat) return;
        const ids = Array.from(selectedIds);
        const changes = [];
        for (const id of ids) {
            const tx = transactions.find(t => t.id === id);
            if (tx && tx.category !== cat) {
                changes.push({ id, from: tx.category || '—', title: tx.title || '' });
            }
        }
        await Promise.all(ids.map(id => updateTransaction(id, { category: cat })));
        if (changes.length > 0) {
            await logActivity({
                action: 'bulk_category',
                message: `Zmieniono kategorię na "${cat}" dla ${changes.length} transakcji`,
                details: { category: cat, changes: changes.map(c => ({ id: c.id, from: c.from, title: c.title })) },
            });
        }
        setSelectedIds(new Set());
        await loadTransactions();
    };

    const handleBulkCamp = async (camp) => {
        if (!selectedIds.size || !camp) return;
        const ids = Array.from(selectedIds);
        const changes = [];
        for (const id of ids) {
            const tx = transactions.find(t => t.id === id);
            if (tx && tx.camp !== camp) {
                changes.push({ id, from: tx.camp || '—', title: tx.title || '' });
            }
        }
        await Promise.all(ids.map(id => updateTransaction(id, { camp })));
        if (changes.length > 0) {
            await logActivity({
                action: 'bulk_camp',
                message: `Zmieniono wyjazd na "${camp}" dla ${changes.length} transakcji`,
                details: { camp, changes: changes.map(c => ({ id: c.id, from: c.from, title: c.title })) },
            });
        }
        await loadTransactions();
    };

    // Check if any filters are currently active
    const hasActiveFilters = !!(searchTerm || dateFrom || dateTo || filterCategory || filterCamp || filterReview || filterCampYear || (filterType && filterType !== 'income'));

    const autoAssignCampsToExisting = async () => {
        const useFiltered = hasActiveFilters;
        const confirmMsg = useFiltered
            ? `Auto-dopasuj uruchomi się TYLKO na ${filteredTransactions?.length || 0} widocznych transakcjach (wg aktywnych filtrów). Transakcje z potwierdzonym obozem (bez flagi "do przejrzenia") nie zostaną nadpisane. Kontynuować?`
            : "Ta operacja spróbuje automatycznie dobrać wyjazd do WSZYSTKICH transakcji bez pioruna (⚡). Kontynuować?";
        if (!window.confirm(confirmMsg)) return;

        setLoading(true);
        try {
            let updatedCount = 0;
            let confirmedCount = 0;
            let skippedConfirmed = 0;
            let reprocessedCount = 0;
            const requiresCamp = (category) => category && category.toLowerCase().includes('usługa turystyczna');

            let pool;
            if (useFiltered) {
                // Filtered mode: process ALL visible transactions (ignores auto_processed)
                // User explicitly chose which transactions to re-run via filters
                pool = filteredTransactions || [];
            } else {
                // No filters: process only unprocessed transactions (no piorun)
                pool = await getUnprocessedTransactions();
            }

            if (pool.length === 0) {
                alert(useFiltered
                    ? 'Brak transakcji pasujących do aktywnych filtrów.'
                    : 'Brak nowych transakcji do przetworzenia — algorytm już wszystko przejrzał.\nUżyj filtrów żeby ponowić dopasowanie wybranych transakcji.');
                return;
            }

            for (const t of pool) {
                // In filtered mode: skip transactions that already have a confirmed camp
                if (useFiltered && t.camp && !t.needs_review) {
                    skippedConfirmed++;
                    continue;
                }
                if (useFiltered && t.auto_processed) reprocessedCount++;

                const mockedRow = [t.date, t.amount, t.currency || 'PLN', t.sender, t.title];
                const normalizedResult = await normalizeTransaction(mockedRow, camps);
                const requiresCampForThis = requiresCamp(t.category || normalizedResult.category);

                const updates = { auto_processed: true };  // zawsze oznacz jako przetworzone

                if (!requiresCampForThis) {
                    updates.needs_review = false;
                    confirmedCount++;
                } else if (normalizedResult.camp) {
                    updates.camp = normalizedResult.camp;
                    updates.needs_review = normalizedResult.needsReview;
                    updatedCount++;
                } else {
                    updates.needs_review = true;  // brak dopasowania — do przejrzenia
                }

                await updateTransaction(t.id, updates);
            }

            const msgs = [];
            if (updatedCount > 0) msgs.push(`Dopasowano obóz do ${updatedCount} transakcji`);
            if (confirmedCount > 0) msgs.push(`Potwierdzono kategorię dla ${confirmedCount} transakcji`);
            const skipped = pool.length - updatedCount - confirmedCount - skippedConfirmed;
            if (skipped > 0) msgs.push(`${skipped} bez dopasowania — do ręcznego uzupełnienia`);
            if (skippedConfirmed > 0) msgs.push(`${skippedConfirmed} pominięto (już potwierdzone)`);
            if (reprocessedCount > 0) msgs.push(`(w tym ${reprocessedCount} przetworzonych ponownie)`);
            alert(msgs.join('\n'));
        } catch (e) {
            console.error(e);
            alert("Błąd automatycznego dopasowania: " + e.message);
        } finally {
            setLoading(false);
            loadData();
        }
    };

    const aiCategorize = async () => {
        const pool = transactions.filter(t => t.needs_review === true && !t.parent_id);

        if (pool.length === 0) {
            alert('Brak transakcji oznaczonych "do przejrzenia". Nie ma czego kategoryzować.');
            return;
        }

        if (!window.confirm(
            `AI-dopasuj przeanalizuje ${pool.length} transakcji oznaczonych do przejrzenia.\n` +
            `Claude przypisze kategorię i wyjazd jednocześnie.\n` +
            `Istniejące wartości zostaną nadpisane. Kontynuować?`
        )) return;

        setLoading(true);
        try {
            const payload = {
                transactions: pool.map(t => ({
                    id: t.id,
                    title: t.title,
                    sender: t.sender,
                    amount: t.amount,
                    date: t.date,
                })),
                categories: categories.map(c => c.name),
                camps: activeCamps.map(c => ({ name: c.name, tags: c.tags || [], year: c.year, season: c.season })),
            };

            const response = await fetch('/api/categorize-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${response.status}`);
            }

            const { results, debug } = await response.json();

            // DEBUG — otwórz DevTools → Console żeby zobaczyć
            console.log('AI-dopasuj results (pierwsze 5):', results.slice(0, 5));
            if (debug) console.log('AI-dopasuj debug:', debug);

            let updatedCount = 0;
            let reviewCount = 0;

            for (const result of results) {
                const updates = { needs_review: result.needsReview };
                if (result.category) updates.category = result.category;
                updates.camp = result.camp || null;  // zawsze nadpisuj — null czyści stary obóz

                try {
                    await updateTransaction(result.id, updates);
                    // Count based on needsReview — niezależnie od logActivity
                    if (!result.needsReview) updatedCount++;
                    else reviewCount++;
                } catch (err) {
                    console.error(`AI-dopasuj: błąd zapisu dla ${result.id}:`, err);
                    reviewCount++;
                }
                // logActivity osobno — błąd nie wpływa na licznik ani zapis
                try {
                    const t = pool.find(x => x.id === result.id);
                    if (t) {
                        await logActivity({
                            action: 'ai_categorize',
                            transactionId: result.id,
                            snapshot: { ...t, ...updates },
                            message: `AI-dopasuj: "${t.title || ''}" → ${result.category || '?'}${result.camp ? ` · ${result.camp}` : ''}`,
                        });
                    }
                } catch (logErr) {
                    console.warn(`AI-dopasuj: logActivity failed dla ${result.id}:`, logErr);
                }
            }

            alert(
                `AI-dopasuj zakończone.\n` +
                `Pewnie dopasowano: ${updatedCount}\n` +
                `Nadal do przejrzenia: ${reviewCount}`
            );
        } catch (e) {
            console.error(e);
            alert('Błąd AI-dopasuj: ' + e.message);
        } finally {
            setLoading(false);
            loadData();
        }
    };

    // Admin confirms the camp assignment — clears the needs_review flag
    // If the clicked transaction is part of a multi-selection, confirm ALL selected
    const handleCampConfirm = async (id) => {
        const targetIds = (selectedIds.has(id) && selectedIds.size > 1) ? Array.from(selectedIds) : [id];
        setTransactions(prev => prev.map(t => targetIds.includes(t.id) ? { ...t, needs_review: false } : t));
        await Promise.all(targetIds.map(sid => updateTransaction(sid, { needs_review: false })));
        // Log confirmation for each transaction
        targetIds.forEach(tid => {
            const t = transactions.find(x => x.id === tid);
            if (!t) return;
            logActivity({
                action: 'category_confirm',
                transactionId: tid,
                snapshot: { ...t, needs_review: false },
                message: `Potwierdzono dopasowanie: ${t.title || ''} → ${t.category || ''}${t.camp ? ` · ${t.camp}` : ''}`,
            });
        });
        if (targetIds.length > 1) setSelectedIds(new Set());
    };

    // Sub-transactions
    const toggleExpand = (id) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    // --- Split wizard handlers ---

    const openSplitWizard = (parentId) => {
        const parent = transactions.find(t => t.id === parentId);
        if (!parent) return;
        setSplitWizard({
            parentId,
            parentAmount: Math.abs(parent.amount),
            isNegative: parent.amount < 0,
            confirmedParts: [],
            currentAmount: '',
            currentCategory: parent.category || '',
            currentCamp: parent.camp || '',
            isLastStep: false, // false = amount editable; true = amount locked to remaining
        });
        setExpandedIds(prev => { const s = new Set(prev); s.add(parentId); return s; });
    };

    const splitWizardRemaining = splitWizard
        ? splitWizard.parentAmount - splitWizard.confirmedParts.reduce((s, p) => s + p.amount, 0)
        : 0;

    const splitWizardNext = () => {
        if (!splitWizard) return;
        const amount = parseFloat(String(splitWizard.currentAmount).replace(',', '.'));
        if (!amount || isNaN(amount) || amount <= 0) {
            alert('Podaj kwotę dla tego podziału');
            return;
        }
        if (amount >= splitWizardRemaining - 0.001) {
            alert(`Kwota musi być mniejsza niż pozostałe ${splitWizardRemaining.toFixed(2)} PLN`);
            return;
        }
        setSplitWizard(prev => ({
            ...prev,
            confirmedParts: [...prev.confirmedParts, {
                amount,
                category: prev.currentCategory,
                camp: prev.currentCamp,
            }],
            currentAmount: '',
            currentCategory: '',
            currentCamp: '',
            isLastStep: true, // next step locks amount to remaining
        }));
    };

    const splitWizardBack = () => {
        if (!splitWizard || splitWizard.confirmedParts.length === 0) return;
        const last = splitWizard.confirmedParts[splitWizard.confirmedParts.length - 1];
        setSplitWizard(prev => ({
            ...prev,
            confirmedParts: prev.confirmedParts.slice(0, -1),
            currentAmount: String(last.amount),
            currentCategory: last.category,
            currentCamp: last.camp,
            isLastStep: false, // restored to editable
        }));
    };

    const splitWizardCommit = async () => {
        if (!splitWizard) return;
        const confirmedSum = splitWizard.confirmedParts.reduce((s, p) => s + p.amount, 0);
        const remaining = Math.round((splitWizard.parentAmount - confirmedSum) * 100) / 100;
        const sign = splitWizard.isNegative ? -1 : 1;

        const allParts = [
            ...splitWizard.confirmedParts,
            { amount: remaining, category: splitWizard.currentCategory, camp: splitWizard.currentCamp },
        ];

        const parent = transactions.find(t => t.id === splitWizard.parentId);
        if (!parent) return;

        try {
            // Delete any existing children first
            const existingChildren = transactions.filter(t => t.parent_id === splitWizard.parentId);
            for (const child of existingChildren) await deleteTransaction(child.id);

            // Create all parts at once
            for (const part of allParts) {
                const created = await addTransaction({
                    parent_id: splitWizard.parentId,
                    date: parent.date,
                    amount: sign * part.amount,
                    original_amount: null,
                    currency: parent.currency || 'PLN',
                    sender: parent.sender,
                    title: parent.title,
                    category: part.category || '',
                    camp: part.camp || '',
                    note: '',
                    needs_review: false,
                    source_file: 'manual',
                });
                await logActivity({
                    action: 'split_add',
                    transactionId: created?.id || null,
                    snapshot: created,
                    message: `Podział: ${(sign * part.amount).toFixed(2)} ${parent.currency || 'PLN'} · ${part.category || '—'}${part.camp ? ` · ${part.camp}` : ''}`,
                    details: { parent_id: splitWizard.parentId, parent_title: parent.title, parent_amount: parent.amount },
                });
            }

            await updateTransaction(splitWizard.parentId, { needs_review: false });
            setSplitWizard(null);
            await loadTransactions();
        } catch (err) {
            alert('Błąd zapisu podziału: ' + err.message);
        }
    };

    const splitWizardCancel = () => setSplitWizard(null);

    const handleDeleteSub = async (id) => {
        const snapshot = transactions.find(t => t.id === id);
        if (!snapshot) return;
        const confirmMsg = `Usunąć podział ${snapshot.amount} ${snapshot.currency || 'PLN'}${snapshot.category ? ` (${snapshot.category})` : ''}?`;
        if (!window.confirm(confirmMsg)) return;
        setTransactions(prev => prev.filter(t => t.id !== id));
        try {
            await deleteTransaction(id);
        } catch (error) {
            console.error('Delete sub error:', error);
            await loadTransactions();
            return;
        }
        if (snapshot) {
            await logActivity({
                action: 'split_delete',
                transactionId: id,
                snapshot,
                message: `Usunięto podział: ${snapshot.amount} ${snapshot.currency || 'PLN'} · ${snapshot.category || '—'}`,
                details: { parent_id: snapshot.parent_id },
            });
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

        // Auto-categorize if user didn't pick a category
        let finalCategory = cashForm.category || '';
        if (signedAmount < 0 && !finalCategory) finalCategory = 'Koszt';

        // Determine needs_review: if category requires camp and camp is empty → flag it
        const campRequired = isTurystyczna(finalCategory);
        const finalCamp = cashForm.camp || '';
        const needsReview = campRequired && !finalCamp;

        try {
            const created = await addTransaction({
                date: cashForm.date,
                amount: signedAmount,
                original_amount: originalAmount,
                currency: cashForm.currency,
                title: cashForm.title.trim(),
                sender: cashForm.sender.trim() || 'Gotówka',
                category: finalCategory,
                camp: finalCamp,
                needs_review: needsReview,
                auto_processed: true,
                source_file: 'cash',
            });
            await logActivity({
                action: 'create',
                transactionId: created?.id || null,
                snapshot: created,
                message: `Dodano ${cashForm.type === 'expense' ? 'wydatek' : 'przychód'} gotówkowy: ${cashForm.title.trim()} · ${signedAmount.toFixed(2)} PLN`,
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
            const data = await parseCSV(file, activeCamps);
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
                auto_processed: true,   // algorytm widział tę transakcję podczas importu
                source_file: t.sourceFile,
                ...(t.note ? { note: t.note } : {})
            }));

            // Dedup: skip rows already in DB where ALL 4 fields are identical
            const existingTransactions = await getAllTransactionsIncludingDeleted();
            const toImport = formattedData.filter(newTx =>
                !existingTransactions.some(ex =>
                    normalizeDate(ex.date) === normalizeDate(newTx.date) &&
                    normalizeAmount(ex.amount) === normalizeAmount(newTx.amount) &&
                    normalizeDedupKey(ex.title) === normalizeDedupKey(newTx.title) &&
                    normalizeDedupKey(ex.sender) === normalizeDedupKey(newTx.sender)
                )
            );

            if (toImport.length === 0) {
                alert('Wszystkie transakcje z tego pliku już istnieją w systemie!');
                return;
            }

            await addTransactions(toImport);

            await logActivity({
                action: 'csv_import',
                message: `Zaimportowano plik: ${file.name}`,
                details: {
                    file_name: file.name,
                    imported_count: toImport.length,
                    total_rows_in_file: formattedData.length,
                    skipped_duplicates: formattedData.length - toImport.length,
                },
            });

            await loadTransactions();

            if (toImport.length < formattedData.length) {
                alert(`Zaimportowano ${toImport.length} transakcji. Pominięto ${formattedData.length - toImport.length} duplikatów (identyczna data, kwota, tytuł i nadawca).`);
            } else {
                alert(`Zaimportowano ${toImport.length} transakcji!`);
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
                const key = `${normalizeDate(tx.date)}|${normalizeAmount(tx.amount)}|${normalizeDedupKey(tx.title)}|${normalizeDedupKey(tx.sender)}`;
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

            const snapshots = all.filter(t => idsToDelete.includes(t.id));
            await deleteTransactions(idsToDelete);
            await Promise.all(snapshots.map(snap => logActivity({
                action: 'delete',
                transactionId: snap.id,
                snapshot: snap,
                message: `Usunięto duplikat: ${snap.title || ''} (${snap.amount} ${snap.currency || 'PLN'})`,
                details: { reason: 'duplicate_removal' },
            })));
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
                const prevTx = transactions.find(t => t.id === tid);
                // If camp is empty after edit AND category requires a camp → mark as needs_review
                const finalCamp = 'camp' in edits ? edits.camp : undefined;
                const finalCategory = 'category' in edits ? edits.category : prevTx?.category;
                const campRequired = isTurystyczna(finalCategory);
                // Validate camp exists in camps list (prevent orphaned references)
                const campValid = !finalCamp || camps.some(c => c.name === finalCamp);
                if (finalCamp && !campValid) {
                    console.warn(`Camp "${finalCamp}" not found in camps list — clearing`);
                    edits.camp = '';
                }
                const effectiveCamp = campValid ? finalCamp : '';
                const needsReview = campRequired ? (effectiveCamp !== undefined ? !effectiveCamp : false) : false;
                const updates = { ...edits, needs_review: needsReview };
                setTransactions(p => {
                    const tx = p.find(t => t.id === tid);
                    if (tx?.parent_id && !needsReview) parentIdsToClear.add(tx.parent_id);
                    return p.map(t => t.id === tid ? { ...t, ...updates } : t);
                });
                updateTransaction(tid, updates);
                // Build diff and log
                if (prevTx) {
                    const changes = {};
                    Object.keys(updates).forEach(k => {
                        if (prevTx[k] !== updates[k]) {
                            changes[k] = { from: prevTx[k] ?? null, to: updates[k] ?? null };
                        }
                    });
                    if (Object.keys(changes).length > 0) {
                        const fieldNames = Object.keys(changes).filter(k => k !== 'needs_review').join(', ') || 'needs_review';
                        logActivity({
                            action: 'update',
                            transactionId: tid,
                            snapshot: { ...prevTx, ...updates },
                            changes,
                            message: `Zmieniono ${fieldNames}: ${prevTx.title || ''} (${prevTx.amount} ${prevTx.currency || 'PLN'})`,
                        });
                    }
                }
                delete next[tid];
            });
            return next;
        });

        // Clear needs_review on parent(s) — tylko jeśli WSZYSTKIE dzieci są już zatwierdzone
        setTimeout(() => {
            parentIdsToClear.forEach(pid => {
                setTransactions(p => {
                    const siblings = p.filter(t => t.parent_id === pid);
                    if (siblings.some(t => t.needs_review)) return p; // inne dzieci wciąż do przejrzenia
                    updateTransaction(pid, { needs_review: false });
                    const parent = p.find(t => t.id === pid);
                    if (parent) {
                        logActivity({
                            action: 'split_confirm',
                            transactionId: pid,
                            snapshot: parent,
                            message: `Zatwierdzono split: "${parent.title || ''}" — wszystkie dzieci potwierdzone`,
                        });
                    }
                    return p.map(t => t.id === pid ? { ...t, needs_review: false } : t);
                });
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
    // While the split form is open for a parent, treat it as a regular transaction
    // so it stays visible in the current filter view and KPIs reflect the full parent amount.
    const effectiveSplitParentIds = new Set(
        [...splitParentIds].filter(id => id !== String(splitWizard?.parentId))
    );

    // Shared predicate — applies all active filters to a single row (parent or child)
    const matchesAllFilters = (t) => {
        const matchesSearch = t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.sender?.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        if (filterType === 'income' && t.amount <= 0) return false;
        if (filterType === 'expense' && t.amount >= 0) return false;
        if (filterType === 'euro' && t.currency !== 'EUR') return false;

        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;

        if (filterCategory && t.category !== filterCategory) return false;
        if (filterCamp && filterCamp !== '__none__' && t.camp !== filterCamp) return false;
        if (filterCamp === '__none__' && t.camp) return false;

        if (filterReview === 'uncertain' && !(t.needs_review && t.camp)) return false;
        if (filterReview === 'missing' && !(t.needs_review && !t.camp)) return false;
        if (filterReview === 'no_category' && !(!t.category || t.category === '')) return false;

        // Year filter: match camp year
        if (filterCampYear && t.camp) {
            const campObj = camps.find(c => c.name === t.camp);
            // Try explicit year first, fall back to year extracted from camp name
            const campYear = campObj?.year || (campObj?.name?.match(/\b(20\d{2})\b/)?.[1] ? parseInt(campObj.name.match(/\b(20\d{2})\b/)[1]) : null);
            if (campYear && String(campYear) !== filterCampYear) return false;
            if (!campYear) return false; // truly no year anywhere → hide when filtering by year
        }

        return true;
    };

    // Children of each split parent that currently match the active filters
    const matchingChildrenByParent = {};
    Object.entries(childrenByParent).forEach(([parentId, kids]) => {
        const matching = kids.filter(matchesAllFilters);
        if (matching.length > 0) matchingChildrenByParent[parentId] = matching;
    });

    // Predicate that decides whether a row (parent) appears in the table
    const parentPassesFilters = (t) => {
        // For split parents: use only non-category/camp/review filters on the parent itself,
        // then require at least one child matching the category/camp/review filters.
        if (effectiveSplitParentIds.has(t.id)) {
            const matchesSearch = t.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.sender?.toLowerCase().includes(searchTerm.toLowerCase());
            if (!matchesSearch) return false;
            if (filterType === 'income' && t.amount <= 0) return false;
            if (filterType === 'expense' && t.amount >= 0) return false;
            if (filterType === 'euro' && t.currency !== 'EUR') return false;
            if (dateFrom && t.date < dateFrom) return false;
            if (dateTo && t.date > dateTo) return false;
            // If any row-level filter narrows results → require a matching child
            const hasNarrowing = !!(filterCategory || filterCamp || filterReview);
            if (hasNarrowing) return (matchingChildrenByParent[t.id]?.length || 0) > 0;
            return true;
        }
        return matchesAllFilters(t);
    };

    const filteredTransactions = transactions?.filter(t => {
        if (t.parent_id) return false; // sub-transactions shown inline under parent
        return parentPassesFilters(t);
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
    // Split parents are excluded from sums; their children are counted individually using the same filters.
    const kpiParents = (filteredTransactions || []).filter(t => !effectiveSplitParentIds.has(t.id));
    // All children from split parents that match the active filters (exclude in-progress split)
    const kpiChildren = Object.entries(matchingChildrenByParent)
        .filter(([pid]) => pid !== String(splitWizard?.parentId))
        .flatMap(([, kids]) => kids);
    const kpiItems   = [...kpiParents, ...kpiChildren];
    const kpiIncome  = kpiItems.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const kpiExpense = kpiItems.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    const kpiCount   = kpiItems.length;
    // Review counters operate only on leaf parents (split parents never carry needs_review)
    const kpiReview      = kpiParents.filter(t => t.needs_review && t.camp).length;
    const kpiMissing     = kpiParents.filter(t => t.needs_review && !t.camp).length;
    const kpiNoCategory  = kpiParents.filter(t => !t.category || t.category === '').length;
    // New KPIs
    const kpiEurIncome = kpiItems.filter(t => t.currency === 'EUR' && t.amount > 0).reduce((s, t) => s + (t.original_amount || 0), 0);
    const kpiEurExpense = kpiItems.filter(t => t.currency === 'EUR' && t.amount < 0).reduce((s, t) => s + Math.abs(t.original_amount || 0), 0);
    const fmt = (n) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center' }}>Ładowanie danych...</div>;
    }

    return (
        <div className="dashboard-container">

            {/* ── KPI Cards ── */}
            <div className="kpi-grid">
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#05CD99,#00B385)' }}>
                        <TrendingUp size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Przychody</span>
                        <span className="kpi-value" style={{ color: '#05CD99' }}>{fmt(kpiIncome)} PLN</span>
                        {kpiEurIncome > 0 && (
                            <span className="kpi-badge" style={{ background: '#DBEAFE', color: '#1E40AF' }}>+ {fmt(kpiEurIncome)} EUR</span>
                        )}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#EE5D50,#FF8B83)' }}>
                        <TrendingDown size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Wydatki</span>
                        <span className="kpi-value" style={{ color: '#EE5D50' }}>{fmt(kpiExpense)} PLN</span>
                        {kpiEurExpense > 0 && (
                            <span className="kpi-badge" style={{ background: '#DBEAFE', color: '#1E40AF' }}>+ {fmt(kpiEurExpense)} EUR</span>
                        )}
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: 'linear-gradient(135deg,#FFB547,#FF8C00)' }}>
                        <Receipt size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Transakcji</span>
                        <span className="kpi-value" style={{ color: '#1B2559' }}>{kpiCount.toLocaleString('pl-PL')}</span>
                    </div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-icon-wrap" style={{ background: (kpiReview + kpiMissing) > 0 ? 'linear-gradient(135deg,#EE5D50,#DC2626)' : 'linear-gradient(135deg,#05CD99,#00B385)' }}>
                        <AlertCircle size={20} color="#fff" />
                    </div>
                    <div className="kpi-body">
                        <span className="kpi-label">Do przejrzenia</span>
                        <span className="kpi-value" style={{ color: (kpiReview + kpiMissing) > 0 ? '#EE5D50' : '#05CD99' }}>{kpiReview + kpiMissing}</span>
                        {kpiReview > 0 && (
                            <span className="kpi-badge" style={{ background: '#FEF3C7', color: '#92400E' }}>{kpiReview} sugerowane</span>
                        )}
                        {kpiMissing > 0 && (
                            <span className="kpi-badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>{kpiMissing} bez obozu</span>
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
                        Do przejrzenia ({kpiReview})
                    </button>
                    <button
                        className={`review-btn ${filterReview === 'missing' ? 'active' : ''}`}
                        onClick={() => setFilterReview(v => v === 'missing' ? '' : 'missing')}
                        title="Pokaż transakcje bez przypisanego obozu"
                        style={{ borderColor: '#EE5D50', color: filterReview === 'missing' ? '#fff' : '#991B1B', background: filterReview === 'missing' ? '#EE5D50' : 'transparent' }}
                    >
                        <span className="review-dot" style={{ background: '#EE5D50' }} />
                        Bez obozu ({kpiMissing})
                    </button>
                    {kpiNoCategory > 0 && (
                        <button
                            className={`review-btn ${filterReview === 'no_category' ? 'active' : ''}`}
                            onClick={() => setFilterReview(v => v === 'no_category' ? '' : 'no_category')}
                            title="Pokaż transakcje bez przypisanej kategorii"
                            style={{ borderColor: '#7C3AED', color: filterReview === 'no_category' ? '#fff' : '#5B21B6', background: filterReview === 'no_category' ? '#7C3AED' : 'transparent' }}
                        >
                            <span className="review-dot" style={{ background: '#7C3AED' }} />
                            Nie dopasowane ({kpiNoCategory})
                        </button>
                    )}
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
                            {displayCategories.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                            <option value="Koszt">Koszt</option>
                        </select>
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Wyjazd</span>
                        <select value={draft.filterCamp} onChange={e => setDraft(d => ({ ...d, filterCamp: e.target.value }))} className="filter-select">
                            <option value="">Wszystkie</option>
                            <option value="__none__">— Bez wyjazdu —</option>
                            {camps?.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="filter-field-group">
                        <span className="filter-field-label">Rok obozu</span>
                        <select value={filterCampYear} onChange={e => setFilterCampYear(e.target.value)} className="filter-select" style={{ minWidth: 90 }}>
                            <option value="">Wszystkie</option>
                            {[...new Set(camps.map(c => c.year).filter(Boolean))].sort().map(y => (
                                <option key={y} value={String(y)}>{y}</option>
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
                    {activeFiltersCount > 0 && (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '14px',
                            background: '#EDE9FE',
                            color: '#6D28D9',
                            fontSize: '12px',
                            fontWeight: 700,
                        }}>
                            {activeFiltersCount} aktywn{activeFiltersCount === 1 ? 'y filtr' : activeFiltersCount < 5 ? 'e filtry' : 'ych filtrów'}
                        </span>
                    )}
                    <button className="btn-filter-clear" onClick={clearFilters}>Wyczyść filtry</button>
                    <button className={`btn-filter-apply ${hasActiveDraft ? 'has-changes' : ''}`} onClick={applyFilters}>
                        Zastosuj filtry{hasActiveDraft ? ' •' : ''}
                    </button>
                    <div className="filter-actions-separator" />
                    <button
                        className="btn-secondary"
                        onClick={autoAssignCampsToExisting}
                        disabled={loading || isImporting}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        title={hasActiveFilters
                            ? `Auto-dopasuj TYLKO widoczne transakcje (${filteredTransactions?.length || 0} szt.)`
                            : "Auto-dopasuj wszystkie nieprzetworzone transakcje (bez ⚡)"
                        }
                    >
                        <Wand2 size={16} />
                        Auto-dopasuj{hasActiveFilters ? ` (${filteredTransactions?.length || 0})` : ''}
                    </button>
                    <button
                        className="btn-ai-categorize"
                        onClick={aiCategorize}
                        disabled={loading || isImporting}
                        title="AI analizuje tytuł, nadawcę i kwotę — przypisuje kategorię i wyjazd jednocześnie dla transakcji 'do przejrzenia'"
                    >
                        <Sparkles size={16} />
                        AI-dopasuj
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
                                <th onClick={() => handleSort('title')} style={{ cursor: 'pointer' }}>Tytuł{getSortIndicator('title')}</th>
                                <th onClick={() => handleSort('camp')} style={{ cursor: 'pointer' }}>Wyjazd{getSortIndicator('camp')}</th>
                                <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>Kategoria{getSortIndicator('category')}</th>
                                <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>Kwota{getSortIndicator('amount')}</th>
                                <th onClick={() => handleSort('sender')} style={{ cursor: 'pointer' }}>Nadawca / Odbiorca{getSortIndicator('sender')}</th>
                                <th style={{ textAlign: 'center', width: '140px' }}>Notatka</th>
                            </tr>
                        </thead>
                        <tbody>
                            {displayedTransactions?.map((t, index) => {
                                const children = childrenByParent[t.id] || [];
                                const isExpanded = expandedIds.has(t.id);
                                const isAddingHere = splitWizard?.parentId === t.id;
                                const allocatedSum = children.reduce((s, c) => s + (c.amount || 0), 0);
                                const requiresCampSub = (cat) => cat && cat.toLowerCase().includes('usługa turystyczna');
                                const hasNarrowingFilter = !!(filterCategory || filterCamp || filterReview);
                                const matchingChildren = matchingChildrenByParent[t.id] || [];
                                const visibleChildren = hasNarrowingFilter ? matchingChildren : children;
                                return (
                            <React.Fragment key={t.id}>
                                <tr className={t.needs_review ? (t.camp ? 'needs-review-uncertain' : 'needs-review-missing') : ''} style={selectedIds.has(t.id) ? { background: '#fef2f2' } : {}}>
                                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            {t.auto_processed && (
                                                <Zap size={11} title="Algorytm już przetworzył tę transakcję" style={{ color: '#7551FF', flexShrink: 0 }} />
                                            )}
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
                                                onClick={() => isAddingHere ? splitWizardCancel() : openSplitWizard(t.id)}
                                                style={{ background: 'none', border: '1px dashed #A3AED0', borderRadius: '50%', cursor: 'pointer', fontSize: '14px', color: isAddingHere ? '#EE5D50' : '#A3AED0', width: '20px', height: '20px', lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                title={isAddingHere ? 'Anuluj podział' : 'Podziel transakcję'}
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
                                    <td>{t.title}</td>
                                    <td>
                                        {children.length > 0 ? (
                                            <span style={{ color: '#6D28D9', fontSize: '11px', fontWeight: 600, background: '#EDE9FE', padding: '2px 8px', borderRadius: '6px' }}>wg podziału</span>
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
                                                            ...(hasPending && pendingCamp !== undefined ? { border: '2px dashed #4318FF', background: '#F5F3FF' } : {}),
                                                            ...(!isTurystyczna(effectiveCat) ? { opacity: 0.4, pointerEvents: hasPending ? 'none' : 'auto' } : {})
                                                        }}
                                                        disabled={!isTurystyczna(effectiveCat)}
                                                    >
                                                        <option value="">-</option>
                                                        {activeCamps?.map(c => (
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
                                    <td>
                                        {children.length > 0 ? (
                                            <>
                                            <span style={{
                                                display: 'inline-block',
                                                background: '#EDE9FE',
                                                color: '#6D28D9',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                letterSpacing: '0.3px'
                                            }}>
                                                PODZIELONE ({hasNarrowingFilter
                                                    ? `${matchingChildren.length}/${children.length}`
                                                    : children.length})
                                            </span>
                                            {Math.abs(t.amount - allocatedSum) > 0.01 && (
                                                <span style={{
                                                    display: 'inline-block',
                                                    background: '#FEF3C7',
                                                    color: '#92400E',
                                                    padding: '2px 6px',
                                                    borderRadius: '6px',
                                                    fontSize: '10px',
                                                    fontWeight: 600,
                                                    marginLeft: '4px'
                                                }} title={`Suma podziałów: ${fmt(allocatedSum)} PLN (parent: ${fmt(t.amount)} PLN)`}>
                                                    {t.amount > allocatedSum
                                                        ? `+${fmt(t.amount - allocatedSum)} niedopodzielone`
                                                        : `${fmt(allocatedSum - t.amount)} nadwyżka`}
                                                </span>
                                            )}
                                            </>
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
                                                        ...(hasPending && pendingCat !== undefined ? { border: '2px dashed #4318FF', background: '#F5F3FF' } : {})
                                                    }}
                                                >
                                                    <option value="" style={{ color: '#EE5D50' }}>-- Wybierz --</option>
                                                    {displayCategories.map(c => (
                                                        <option key={c.id} value={c.name}>{c.name}</option>
                                                    ))}
                                                    <option value="Koszt">Koszt</option>
                                                </select>
                                            );
                                        })()}
                                    </td>
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
                                    <td>{t.sender}</td>
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
                                                    if (newNote !== null && newNote !== t.note) {
                                                        setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, note: newNote } : tx));
                                                        updateTransaction(t.id, { note: newNote });
                                                        logActivity({
                                                            action: 'note_update',
                                                            transactionId: t.id,
                                                            snapshot: { ...t, note: newNote },
                                                            changes: { note: { from: t.note || null, to: newNote || null } },
                                                            message: `Zmieniono notatkę: ${t.title || ''}`,
                                                        });
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
                                                        setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, note: newNote } : tx));
                                                        updateTransaction(t.id, { note: newNote });
                                                        logActivity({
                                                            action: 'note_update',
                                                            transactionId: t.id,
                                                            snapshot: { ...t, note: newNote },
                                                            changes: { note: { from: null, to: newNote } },
                                                            message: `Dodano notatkę: ${t.title || ''}`,
                                                        });
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
                                {isExpanded && visibleChildren.map(child => (
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
                                                style={pendingEdits[child.id]?.category !== undefined ? { border: '2px dashed #4318FF', background: '#F5F3FF' } : {}}
                                            >
                                                <option value="">-- Wybierz --</option>
                                                {displayCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                <option value="Koszt">Koszt</option>
                                            </select>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <select
                                                    value={pendingEdits[child.id]?.camp ?? child.camp ?? ''}
                                                    onChange={e => handlePendingChange(child.id, 'camp', e.target.value)}
                                                    className="category-select"
                                                    style={{ width: '100px', ...(pendingEdits[child.id]?.camp !== undefined ? { border: '2px dashed #4318FF', background: '#F5F3FF' } : {}) }}
                                                >
                                                    <option value="">-</option>
                                                    {activeCamps?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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

                                {/* Split wizard — shown when "+" clicked on this row */}
                                {isAddingHere && splitWizard && (() => {
                                    const wizard = splitWizard;
                                    const confirmedSum = wizard.confirmedParts.reduce((s, p) => s + p.amount, 0);
                                    const remaining = Math.round((wizard.parentAmount - confirmedSum) * 100) / 100;
                                    const stepNum = wizard.confirmedParts.length + 1;
                                    const isLastStep = wizard.isLastStep; // true = amount locked to remaining
                                    const canFinish = wizard.confirmedParts.length >= 1 && isLastStep;
                                    const requiresCampW = (cat) => cat && cat.toLowerCase().includes('usługa turystyczna');

                                    return (
                                        <>
                                            {/* Confirmed parts (locked, read-only) */}
                                            {wizard.confirmedParts.map((part, pi) => (
                                                <tr key={`wizard-confirmed-${pi}`} className="add-sub-row">
                                                    <td colSpan={2}></td>
                                                    <td colSpan={2} style={{ color: '#05CD99', fontSize: '13px', fontWeight: 600 }}>
                                                        ✓ Część {pi + 1}
                                                    </td>
                                                    <td style={{ fontSize: '13px', color: '#2B3674', fontWeight: 700 }}>
                                                        {part.amount.toFixed(2)} PLN
                                                    </td>
                                                    <td style={{ fontSize: '13px', color: '#2B3674' }}>{part.category || '—'}</td>
                                                    <td style={{ fontSize: '13px', color: '#2B3674' }}>{part.camp || '—'}</td>
                                                    <td colSpan={2}></td>
                                                </tr>
                                            ))}

                                            {/* Current step form */}
                                            <tr className="add-sub-row">
                                                <td colSpan={2}></td>
                                                <td colSpan={2} style={{ color: '#4318FF', fontSize: '13px', fontWeight: 600 }}>
                                                    {canFinish
                                                        ? <span>Część {stepNum} <span style={{ fontWeight: 400, color: '#A3AED0', fontSize: '12px' }}>· kwota: <strong style={{ color: '#2B3674' }}>{remaining.toFixed(2)} PLN</strong> (auto)</span></span>
                                                        : <span>Część {stepNum} <span style={{ fontWeight: 400, color: '#A3AED0', fontSize: '12px' }}>· podaj kwotę tej części</span></span>
                                                    }
                                                </td>
                                                <td>
                                                    {canFinish ? (
                                                        /* Last part: amount locked to exact remaining */
                                                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#2B3674', padding: '4px 10px', background: '#F0FFF4', border: '1px solid #05CD99', borderRadius: '6px', display: 'inline-block', minWidth: '90px' }}>
                                                            {remaining.toFixed(2)} PLN
                                                        </span>
                                                    ) : (
                                                        /* First+ parts: editable */
                                                        <input
                                                            type="number"
                                                            placeholder={`max ${remaining.toFixed(2)}`}
                                                            value={wizard.currentAmount}
                                                            onChange={e => setSplitWizard(prev => ({ ...prev, currentAmount: e.target.value }))}
                                                            style={{ width: '110px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #4318FF' }}
                                                            autoFocus
                                                            onKeyDown={e => e.key === 'Enter' && splitWizardNext()}
                                                        />
                                                    )}
                                                </td>
                                                <td>
                                                    <select
                                                        value={wizard.currentCategory}
                                                        onChange={e => setSplitWizard(prev => ({ ...prev, currentCategory: e.target.value, currentCamp: '' }))}
                                                        className="category-select"
                                                    >
                                                        <option value="">-- Kategoria --</option>
                                                        {displayCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                        <option value="Koszt">Koszt</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    {requiresCampW(wizard.currentCategory) && (
                                                        <select
                                                            value={wizard.currentCamp}
                                                            onChange={e => setSplitWizard(prev => ({ ...prev, currentCamp: e.target.value }))}
                                                            className="category-select"
                                                            style={{ width: '120px' }}
                                                        >
                                                            <option value="">- Wyjazd -</option>
                                                            {activeCamps?.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                                        </select>
                                                    )}
                                                </td>
                                                <td colSpan={2} style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    {wizard.confirmedParts.length > 0 && (
                                                        <button onClick={splitWizardBack}
                                                            style={{ background: '#F4F7FE', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#2B3674', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px' }}
                                                        >← Wróć</button>
                                                    )}
                                                    {/* Amount editable → show "Dalej" */}
                                                    {!isLastStep && (
                                                        <button onClick={splitWizardNext}
                                                            style={{ background: '#4318FF', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '5px 14px' }}
                                                        >Dalej →</button>
                                                    )}
                                                    {/* Amount locked → "Podziel dalej" unlocks it for 3+ parts */}
                                                    {isLastStep && (
                                                        <button onClick={() => setSplitWizard(prev => ({ ...prev, isLastStep: false, currentAmount: '' }))}
                                                            style={{ background: 'none', border: '1px dashed #4318FF', borderRadius: '8px', color: '#4318FF', cursor: 'pointer', fontSize: '12px', fontWeight: 600, padding: '4px 10px' }}
                                                        >+ Podziel dalej</button>
                                                    )}
                                                    {canFinish && (
                                                        <button onClick={splitWizardCommit}
                                                            style={{ background: '#05CD99', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, padding: '5px 14px' }}
                                                        >✓ Gotowe</button>
                                                    )}
                                                    <button onClick={splitWizardCancel}
                                                        style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#A3AED0', cursor: 'pointer', fontSize: '12px', padding: '4px 8px' }}
                                                    >Anuluj</button>
                                                </td>
                                            </tr>
                                        </>
                                    );
                                })()}

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
                                        {displayCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        <option value="Koszt">Koszt</option>
                                    </select>
                                </div>
                                <div className="cash-field">
                                    <label>Wyjazd</label>
                                    <select value={cashForm.camp} onChange={e => setCashForm(f => ({ ...f, camp: e.target.value }))}>
                                        <option value="">— Wybierz —</option>
                                        {activeCamps.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
