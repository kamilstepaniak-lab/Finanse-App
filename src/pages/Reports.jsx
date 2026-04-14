import React, { useState, useMemo, useEffect } from 'react';
import { getAllTransactions, getAllCamps, subscribeToTransactions, unsubscribe } from '../db';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend, LineChart, Line, CartesianGrid, Area, AreaChart
} from 'recharts';
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowDownUp, Download } from 'lucide-react';
import './Reports.css';

const COLORS = ['#1570EF', '#3B8AFF', '#059669', '#FFB547', '#DC2626', '#9c27b0', '#e91e63', '#EFF4FB'];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p className="label">{`${label}`}</p>
                {payload.map((entry, index) => (
                    <p key={index} style={{ color: entry.color }}>
                        {`${entry.name}: ${entry.value.toLocaleString()} PLN`}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

export default function Reports() {
    const [transactions, setTransactions] = useState([]);
    const [camps, setCamps] = useState([]);
    const [loading, setLoading] = useState(true);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    // Restore last used date range from localStorage, fallback to current month
    const savedFrom = localStorage.getItem('reports_dateFrom');
    const savedTo = localStorage.getItem('reports_dateTo');
    const savedMonth = localStorage.getItem('reports_selectedMonth');
    const savedYear = localStorage.getItem('reports_selectedYear');

    const initFrom = savedFrom || firstDay;
    const initTo = savedTo || today;
    const initMonth = savedMonth ? parseInt(savedMonth) : now.getMonth() + 1;
    const initYear = savedYear ? parseInt(savedYear) : now.getFullYear();

    const [dateFrom, setDateFromState] = useState(initFrom);
    const [dateTo, setDateToState] = useState(initTo);
    const [selectedMonth, setSelectedMonthState] = useState(initMonth);
    const [selectedYear, setSelectedYearState] = useState(initYear);

    const setDateFrom = (val) => { setDateFromState(val); localStorage.setItem('reports_dateFrom', val); };
    const setDateTo = (val) => { setDateToState(val); localStorage.setItem('reports_dateTo', val); };
    const setSelectedMonth = (val) => { setSelectedMonthState(val); localStorage.setItem('reports_selectedMonth', val); };
    const setSelectedYear = (val) => { setSelectedYearState(val); localStorage.setItem('reports_selectedYear', val); };

    // Camp table sort: 'value' (default — highest first) or 'name' (A-Z)
    const [campSort, setCampSort] = useState('value');

    useEffect(() => {
        loadData();
        const channel = subscribeToTransactions(() => loadData());
        return () => unsubscribe(channel);
    }, []);

    const loadData = async () => {
        const [txData, campData] = await Promise.all([getAllTransactions(), getAllCamps()]);
        setTransactions(txData);
        setCamps(campData);
        setLoading(false);
    };

    // Map camp name → season for quick lookup
    const campSeasonMap = useMemo(() => {
        const map = {};
        (camps || []).forEach(c => { map[c.name] = c.season || ''; });
        return map;
    }, [camps]);

    const reportData = useMemo(() => {
        if (!transactions) return { stats: {}, incomeByCategoryData: [], incomeByCampData: [], monthlyData: [], topExpenses: [], sumLato: 0, sumZima: 0 };

        // Exclude split parents (have children) — count children instead, same as Dashboard
        const splitParentIds = new Set(
            transactions.filter(t => t.parent_id).map(t => t.parent_id)
        );

        const filtered = transactions.filter(t => {
            if (splitParentIds.has(t.id)) return false; // skip split parents
            if (dateFrom && t.date < dateFrom) return false;
            if (dateTo && t.date > dateTo) return false;
            return true;
        }).sort((a, b) => a.date.localeCompare(b.date));

        const income = filtered.filter(t => t.amount > 0).reduce((acc, t) => acc + t.amount, 0);
        const expense = filtered.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);

        const incomeEUR = filtered.filter(t => t.amount > 0 && t.currency === 'EUR')
            .reduce((acc, t) => acc + (t.original_amount || 0), 0);
        const expenseEUR = filtered.filter(t => t.amount < 0 && t.currency === 'EUR')
            .reduce((acc, t) => acc + Math.abs(t.original_amount || 0), 0);

        // Top 20 expenses
        const topExpenses = filtered
            .filter(t => t.amount < 0)
            .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
            .slice(0, 20);

        // Monthly History — use the same date-filtered dataset so chart stays in sync with KPIs
        const monthlyMap = {};
        filtered.forEach(t => {
            if (!t.date) return;
            const month = t.date.slice(0, 7);
            if (!monthlyMap[month]) monthlyMap[month] = { month, income: 0, expense: 0 };
            if (t.amount > 0) monthlyMap[month].income += t.amount;
            else if (t.amount < 0) monthlyMap[month].expense += Math.abs(t.amount);
        });
        const monthlyData = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

        // Income by Categories
        const incomeByCatMap = {};
        filtered.filter(t => t.amount > 0).forEach(t => {
            const c = t.category || 'Nieprzypisane';
            if (!incomeByCatMap[c]) incomeByCatMap[c] = 0;
            incomeByCatMap[c] += t.amount;
        });
        const incomeByCategoryData = Object.keys(incomeByCatMap).map(name => ({ name, value: incomeByCatMap[name] }))
            .sort((a, b) => b.value - a.value);

        // Income by Camps (including exact amount and EUR tracking)
        const incomeByCampMap = {};
        const incomeEURByCampMap = {};

        filtered.filter(t => t.amount > 0).forEach(t => {
            const campName = t.camp || 'Bez wyjazdu';
            if (!incomeByCampMap[campName]) incomeByCampMap[campName] = 0;
            incomeByCampMap[campName] += t.amount;

            if (t.currency === 'EUR') {
                if (!incomeEURByCampMap[campName]) incomeEURByCampMap[campName] = 0;
                incomeEURByCampMap[campName] += (t.original_amount || 0);
            }
        });

        const incomeByCampData = Object.keys(incomeByCampMap).map(name => ({
            name,
            value: incomeByCampMap[name],
            eurValue: incomeEURByCampMap[name] || 0,
            season: campSeasonMap[name] || ''
        }))
            .sort((a, b) => b.value - a.value);

        // Season totals (only camps with assigned season)
        const sumLato = incomeByCampData.filter(c => c.season === 'lato').reduce((s, c) => s + c.value, 0);
        const sumZima = incomeByCampData.filter(c => c.season === 'zima').reduce((s, c) => s + c.value, 0);

        // Weekly cashflow
        const weeklyMap = {};
        filtered.forEach(t => {
            if (!t.date) return;
            const d = new Date(t.date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
            const monday = new Date(d.setDate(diff));
            const weekKey = monday.toISOString().slice(0, 10);
            if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { week: weekKey, income: 0, expense: 0 };
            if (t.amount > 0) weeklyMap[weekKey].income += t.amount;
            else if (t.amount < 0) weeklyMap[weekKey].expense += Math.abs(t.amount);
        });
        const weeklyData = Object.values(weeklyMap).sort((a, b) => a.week.localeCompare(b.week));

        // Top contractors (income by sender)
        const senderMap = {};
        filtered.filter(t => t.amount > 0).forEach(t => {
            const s = t.sender || 'Nieznany';
            if (!senderMap[s]) senderMap[s] = { name: s, total: 0, count: 0 };
            senderMap[s].total += t.amount;
            senderMap[s].count += 1;
        });
        const topContractors = Object.values(senderMap).sort((a, b) => b.total - a.total).slice(0, 20);

        // Camp profitability (income - expense per camp)
        // Costs without a camp → "Koszty ogólne", unmatched income → "Bez wyjazdu"
        const campProfitMap = {};
        filtered.forEach(t => {
            let campName;
            if (t.camp) {
                campName = t.camp;
            } else if (t.amount < 0) {
                campName = 'Koszty ogólne';
            } else {
                campName = 'Bez wyjazdu';
            }
            if (!campProfitMap[campName]) campProfitMap[campName] = { name: campName, income: 0, expense: 0 };
            if (t.amount > 0) campProfitMap[campName].income += t.amount;
            else if (t.amount < 0) campProfitMap[campName].expense += Math.abs(t.amount);
        });
        const campProfitability = Object.values(campProfitMap)
            .map(c => ({ ...c, profit: c.income - c.expense }))
            .sort((a, b) => b.profit - a.profit);

        // Period comparison: compute previous period of same length
        let prevStats = null;
        if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            const to = new Date(dateTo);
            const days = Math.round((to - from) / (1000 * 60 * 60 * 24));
            const prevTo = new Date(from);
            prevTo.setDate(prevTo.getDate() - 1);
            const prevFrom = new Date(prevTo);
            prevFrom.setDate(prevFrom.getDate() - days);
            const pf = prevFrom.toISOString().slice(0, 10);
            const pt = prevTo.toISOString().slice(0, 10);
            const prevFiltered = transactions.filter(t => {
                if (splitParentIds.has(t.id)) return false;
                if (t.date < pf || t.date > pt) return false;
                return true;
            });
            const prevIncome = prevFiltered.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
            const prevExpense = prevFiltered.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
            prevStats = { income: prevIncome, expense: prevExpense, dateFrom: pf, dateTo: pt };
        }

        return {
            stats: { income, expense, incomeEUR, expenseEUR },
            incomeByCategoryData,
            incomeByCampData,
            monthlyData,
            weeklyData,
            topExpenses,
            topContractors,
            campProfitability,
            prevStats,
            sumLato,
            sumZima
        };
    }, [transactions, dateFrom, dateTo, campSeasonMap]);

    const exportCSV = () => {
        const rows = [
            ['Sekcja', 'Nazwa', 'Kwota PLN', 'Szczegóły'],
            ['KPI', 'Przychody', reportData.stats.income.toFixed(2), `EUR: ${reportData.stats.incomeEUR.toFixed(2)}`],
            ['KPI', 'Wydatki', reportData.stats.expense.toFixed(2), `EUR: ${reportData.stats.expenseEUR.toFixed(2)}`],
            [],
            ['Kategoria', 'Przychód PLN'],
            ...reportData.incomeByCategoryData.map(c => [c.name, c.value.toFixed(2)]),
            [],
            ['Wyjazd', 'Przychód PLN', 'EUR', 'Sezon'],
            ...reportData.incomeByCampData.map(c => [c.name, c.value.toFixed(2), c.eurValue?.toFixed(2) || '0', c.season || '']),
            [],
            ['Wyjazd', 'Przychód', 'Wydatki', 'Zysk'],
            ...reportData.campProfitability.map(c => [c.name, c.income.toFixed(2), c.expense.toFixed(2), c.profit.toFixed(2)]),
            [],
            ['Kontrahent', 'Przychód PLN', 'Liczba transakcji'],
            ...reportData.topContractors.map(c => [c.name, c.total.toFixed(2), c.count]),
        ];
        const csv = rows.map(r => Array.isArray(r) ? r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') : '').join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `raport_${dateFrom}_${dateTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const pctChange = (curr, prev) => {
        if (!prev || prev === 0) return null;
        return Math.round(((curr - prev) / prev) * 100);
    };

    const ComparisonBadge = ({ current, previous, inverse = false }) => {
        const pct = pctChange(current, previous);
        if (pct === null) return null;
        const isPositive = inverse ? pct < 0 : pct > 0;
        return (
            <small style={{
                color: isPositive ? '#059669' : '#DC2626',
                fontWeight: 600,
                fontSize: '11px'
            }}>
                {pct > 0 ? '+' : ''}{pct}% vs. poprzedni okres
            </small>
        );
    };

    if (loading) return <div className="reports-loading">Pobieranie danych finansowych...</div>;

    return (
        <div className="reports-page">
            <header className="reports-header-pro">
                <div className="header-title">
                    <h1>Analityka Finansowa</h1>
                    <p>Podsumowanie operacji i trendów rynkowych</p>
                </div>
                <div className="reports-filters-group">
                    {/* Szybki wybór miesiąca i roku */}
                    <div className="quick-select-box">
                        <div className="filter-input-wrapper">
                            <label>MIESIĄC</label>
                            <select
                                value={selectedMonth}
                                onChange={(e) => {
                                    const m = parseInt(e.target.value);
                                    setSelectedMonth(m);
                                    const newFirst = new Date(selectedYear, m - 1, 1).toISOString().slice(0, 10);
                                    let newLast;
                                    if (m === now.getMonth() + 1 && selectedYear === now.getFullYear()) {
                                        newLast = now.toISOString().slice(0, 10);
                                    } else {
                                        newLast = new Date(selectedYear, m, 0).toISOString().slice(0, 10);
                                    }
                                    setDateFrom(newFirst);
                                    setDateTo(newLast);
                                }}
                            >
                                <option value={1}>Styczeń</option>
                                <option value={2}>Luty</option>
                                <option value={3}>Marzec</option>
                                <option value={4}>Kwiecień</option>
                                <option value={5}>Maj</option>
                                <option value={6}>Czerwiec</option>
                                <option value={7}>Lipiec</option>
                                <option value={8}>Sierpień</option>
                                <option value={9}>Wrzesień</option>
                                <option value={10}>Październik</option>
                                <option value={11}>Listopad</option>
                                <option value={12}>Grudzień</option>
                            </select>
                        </div>

                        <div className="filter-input-wrapper">
                            <label>ROK</label>
                            <select
                                value={selectedYear}
                                onChange={(e) => {
                                    const y = parseInt(e.target.value);
                                    setSelectedYear(y);
                                    const newFirst = new Date(y, selectedMonth - 1, 1).toISOString().slice(0, 10);
                                    let newLast;
                                    if (selectedMonth === now.getMonth() + 1 && y === now.getFullYear()) {
                                        newLast = now.toISOString().slice(0, 10);
                                    } else {
                                        newLast = new Date(y, selectedMonth, 0).toISOString().slice(0, 10);
                                    }
                                    setDateFrom(newFirst);
                                    setDateTo(newLast);
                                }}
                            >
                                {[2023, 2024, 2025, 2026, 2027, 2028].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="custom-date-box">
                        <div className="filter-input-wrapper custom-date-item">
                            <label>OD (WŁASNA DATA)</label>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                            />
                        </div>
                        <div className="filter-input-wrapper custom-date-item">
                            <label>DO (WŁASNA DATA)</label>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                            />
                        </div>
                    </div>
                    <button onClick={exportCSV} className="export-btn" title="Eksportuj raport do CSV">
                        <Download size={14} /> Eksport CSV
                    </button>
                </div>
            </header>

            <section className="kpi-grid">
                <div className="kpi-card income">
                    <div className="kpi-icon">↑</div>
                    <div className="kpi-content">
                        <span>Przychody</span>
                        <h3>{reportData.stats.income.toLocaleString()} PLN</h3>
                        <small>{reportData.stats.incomeEUR.toLocaleString()} EUR</small>
                        {reportData.prevStats && <ComparisonBadge current={reportData.stats.income} previous={reportData.prevStats.income} />}
                    </div>
                </div>
                <div className="kpi-card expense">
                    <div className="kpi-icon">↓</div>
                    <div className="kpi-content">
                        <span>Wydatki</span>
                        <h3>{reportData.stats.expense.toLocaleString()} PLN</h3>
                        <small>{reportData.stats.expenseEUR.toLocaleString()} EUR</small>
                        {reportData.prevStats && <ComparisonBadge current={reportData.stats.expense} previous={reportData.prevStats.expense} inverse />}
                    </div>
                </div>
            </section>

            <main className="dashboard-layout-new">

                <div className="chart-container full-width">
                    <div className="chart-header-row">
                        <h3><TrendingUp size={17} style={{ color: '#059669', marginRight: 8, verticalAlign: 'middle' }} />Przychody wg. Wyjazdów</h3>
                        <div className="sort-controls">
                            <button className={`sort-btn${campSort === 'value' ? ' active' : ''}`} onClick={() => setCampSort('value')}>
                                <ArrowDownUp size={13} /> Wg. kwoty
                            </button>
                            <button className={`sort-btn${campSort === 'name' ? ' active' : ''}`} onClick={() => setCampSort('name')}>
                                <ArrowUpDown size={13} /> Wg. nazwy
                            </button>
                        </div>
                    </div>


                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Wyjazd</th>
                                    <th>Sezon</th>
                                    <th>Przychód (PLN)</th>
                                    <th>W tym EUR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...reportData.incomeByCampData]
                                    .sort((a, b) => campSort === 'name' ? a.name.localeCompare(b.name, 'pl') : b.value - a.value)
                                    .map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.name}</td>
                                        <td>
                                            {item.season === 'lato' && <span style={{ fontSize: '11px', fontWeight: 700, background: '#FEF3C7', color: '#B45309', borderRadius: '6px', padding: '2px 8px' }}>☀️ Lato</span>}
                                            {item.season === 'zima' && <span style={{ fontSize: '11px', fontWeight: 700, background: '#EFF6FF', color: '#1570EF', borderRadius: '6px', padding: '2px 8px' }}>❄️ Zima</span>}
                                            {!item.season && <span style={{ fontSize: '11px', color: '#94A3B8' }}>—</span>}
                                        </td>
                                        <td className="pos fw-bold">{item.value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                        <td className="text-muted">
                                            {item.eurValue > 0 ? `${item.eurValue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} EUR` : '-'}
                                        </td>
                                    </tr>
                                ))}
                                {reportData.incomeByCampData.length === 0 && (
                                    <tr><td colSpan="4" className="text-center">Brak przychodów w wybranym okresie</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-muted small">
                        * Wpłaty w EUR zostały przeliczone na PLN w momencie transakcji i stanowią część sumy "Przychód (PLN)".
                    </p>
                </div>

                <div className="grid-secondary-new">
                    <div className="chart-container expenses-limit-height">
                        <h3><TrendingUp size={17} style={{ color: '#059669', marginRight: 8, verticalAlign: 'middle' }} />Przychody wg. Kategorii</h3>
                        <div className="table-responsive">
                            <table className="data-table small-table">
                                <thead>
                                    <tr>
                                        <th>Kategoria</th>
                                        <th>Przychód (PLN)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.incomeByCategoryData.map((cat, idx) => {
                                        const n = cat.name.toLowerCase();
                                        const isTurystyczna = n.includes('turystyczna');
                                        const catColor = isTurystyczna ? '#059669'
                                            : n.includes('pływania') ? '#1570EF'
                                            : n.includes('szkolenie') ? '#B07A1A'
                                            : undefined;
                                        return (
                                        <React.Fragment key={idx}>
                                            <tr>
                                                <td><strong style={catColor ? { color: catColor } : {}}>{cat.name}</strong></td>
                                                <td className="pos fw-bold">{cat.value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                            </tr>
                                            {isTurystyczna && (reportData.sumLato > 0 || reportData.sumZima > 0) && (
                                                <>
                                                    <tr style={{ background: '#FFFBEB' }}>
                                                        <td style={{ paddingLeft: '24px', fontSize: '12px', color: '#B45309' }}>☀️ Obozy letnie</td>
                                                        <td style={{ fontSize: '12px', color: '#B45309', fontWeight: 600 }}>{reportData.sumLato.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                                    </tr>
                                                    <tr style={{ background: '#EFF6FF' }}>
                                                        <td style={{ paddingLeft: '24px', fontSize: '12px', color: '#1570EF' }}>❄️ Obozy zimowe</td>
                                                        <td style={{ fontSize: '12px', color: '#1570EF', fontWeight: 600 }}>{reportData.sumZima.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                                    </tr>
                                                </>
                                            )}
                                        </React.Fragment>
                                        );
                                    })}
                                    {reportData.incomeByCategoryData.length === 0 && (
                                        <tr><td colSpan="2" className="text-center">Brak przychodów w wybranym okresie</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="chart-container expenses-limit-height">
                        <h3><TrendingDown size={17} style={{ color: '#DC2626', marginRight: 8, verticalAlign: 'middle' }} />20 Najwyższych Kosztów</h3>
                        <div className="table-responsive">
                            <table className="data-table small-table">
                                <thead>
                                    <tr>
                                        <th>Podmiot / Tytuł</th>
                                        <th>Kwota</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.topExpenses.map((exp, idx) => (
                                        <tr key={idx}>
                                            <td title={exp.title}>
                                                <strong>{exp.sender || '—'}</strong>
                                                <br />
                                                <small className="text-muted">{exp.title && exp.title.length > 45 ? exp.title.substring(0, 45) + '…' : (exp.title || '—')}</small>
                                            </td>
                                            <td className="neg fw-bold">{Math.abs(exp.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                        </tr>
                                    ))}
                                    {reportData.topExpenses.length === 0 && (
                                        <tr><td colSpan="2" className="text-center">Brak kosztów w wybranym okresie</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="chart-container full-width">
                    <h3>Historia Miesięczna</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={reportData.monthlyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} width={80} tickFormatter={(v) => v.toLocaleString('pl-PL')} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="income" name="Przychody" fill="#059669" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="expense" name="Wydatki" fill="#DC2626" radius={[4, 4, 0, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {reportData.weeklyData.length > 1 && (
                    <div className="chart-container full-width">
                        <h3>Cashflow Tygodniowy</h3>
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={reportData.weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="week" axisLine={false} tickLine={false} fontSize={11} />
                                <YAxis axisLine={false} tickLine={false} width={80} tickFormatter={(v) => v.toLocaleString('pl-PL')} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Area type="monotone" dataKey="income" name="Przychody" stroke="#059669" fill="#05966920" strokeWidth={2} />
                                <Area type="monotone" dataKey="expense" name="Wydatki" stroke="#DC2626" fill="#DC262620" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="grid-secondary-new">
                    <div className="chart-container expenses-limit-height">
                        <h3><TrendingUp size={17} style={{ color: '#1570EF', marginRight: 8, verticalAlign: 'middle' }} />Top 20 Kontrahentów (Przychody)</h3>
                        <div className="table-responsive">
                            <table className="data-table small-table">
                                <thead>
                                    <tr>
                                        <th>Kontrahent</th>
                                        <th>Przychód (PLN)</th>
                                        <th>Transakcji</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.topContractors.map((c, idx) => (
                                        <tr key={idx}>
                                            <td><strong>{c.name}</strong></td>
                                            <td className="pos fw-bold">{c.total.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                            <td className="text-muted">{c.count}</td>
                                        </tr>
                                    ))}
                                    {reportData.topContractors.length === 0 && (
                                        <tr><td colSpan="3" className="text-center">Brak danych</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="chart-container expenses-limit-height">
                        <h3>Rentowność Wyjazdów</h3>
                        <div className="table-responsive">
                            <table className="data-table small-table">
                                <thead>
                                    <tr>
                                        <th>Wyjazd</th>
                                        <th>Przychód</th>
                                        <th>Koszty</th>
                                        <th>Zysk</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.campProfitability.map((c, idx) => (
                                        <tr key={idx}>
                                            <td><strong>{c.name}</strong></td>
                                            <td className="pos">{c.income.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</td>
                                            <td className="neg">{c.expense.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</td>
                                            <td className={`fw-bold ${c.profit >= 0 ? 'pos' : 'neg'}`}>{c.profit.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                        </tr>
                                    ))}
                                    {reportData.campProfitability.length === 0 && (
                                        <tr><td colSpan="4" className="text-center">Brak danych</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
