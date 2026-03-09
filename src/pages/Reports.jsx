import React, { useState, useMemo, useEffect } from 'react';
import { getAllTransactions, subscribeToTransactions, unsubscribe } from '../db';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
    PieChart, Pie, Legend, LineChart, Line, CartesianGrid, Area, AreaChart
} from 'recharts';
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowDownUp } from 'lucide-react';
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
    const [loading, setLoading] = useState(true);

    const now = new Date();
    // Default: 1st day of current month to current day (today)
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    const [dateFrom, setDateFrom] = useState(firstDay);
    const [dateTo, setDateTo] = useState(today);

    // Month/Year quick selectors state
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());

    // Camp table sort: 'value' (default — highest first) or 'name' (A-Z)
    const [campSort, setCampSort] = useState('value');

    useEffect(() => {
        loadTransactions();
        const channel = subscribeToTransactions(() => loadTransactions());
        return () => unsubscribe(channel);
    }, []);

    const loadTransactions = async () => {
        const data = await getAllTransactions();
        setTransactions(data);
        setLoading(false);
    };

    const reportData = useMemo(() => {
        if (!transactions) return { stats: {}, incomeByCategoryData: [], incomeByCampData: [], monthlyData: [], topExpenses: [] };

        const filtered = transactions.filter(t => {
            if (dateFrom && t.date < dateFrom) return false;
            if (dateTo && t.date > dateTo) return false;
            return true;
        }).sort((a, b) => a.date.localeCompare(b.date));

        // Basic Stats
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

        // Monthly History
        const monthlyMap = {};
        transactions.forEach(t => {
            const month = t.date.slice(0, 7);
            if (!monthlyMap[month]) monthlyMap[month] = { month, income: 0, expense: 0 };
            if (t.amount > 0) monthlyMap[month].income += t.amount;
            else monthlyMap[month].expense += Math.abs(t.amount);
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
            eurValue: incomeEURByCampMap[name] || 0
        }))
            .sort((a, b) => b.value - a.value);

        return {
            stats: { income, expense, balance: income - expense, incomeEUR, expenseEUR },
            incomeByCategoryData,
            incomeByCampData,
            monthlyData,
            topExpenses
        };
    }, [transactions, dateFrom, dateTo]);

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
                </div>
            </header>

            <section className="kpi-grid">
                <div className="kpi-card income">
                    <div className="kpi-icon">↑</div>
                    <div className="kpi-content">
                        <span>Przychody</span>
                        <h3>{reportData.stats.income.toLocaleString()} PLN</h3>
                        <small>{reportData.stats.incomeEUR.toLocaleString()} EUR</small>
                    </div>
                </div>
                <div className="kpi-card expense">
                    <div className="kpi-icon">↓</div>
                    <div className="kpi-content">
                        <span>Wydatki</span>
                        <h3>{reportData.stats.expense.toLocaleString()} PLN</h3>
                        <small>{reportData.stats.expenseEUR.toLocaleString()} EUR</small>
                    </div>
                </div>
                <div className="kpi-card balance">
                    <div className="kpi-icon">⚖</div>
                    <div className="kpi-content">
                        <span>Bilans</span>
                        <h3 className={reportData.stats.balance >= 0 ? 'pos' : 'neg'}>
                            {reportData.stats.balance.toLocaleString()} PLN
                        </h3>
                        <small>Wynik operacyjny</small>
                    </div>
                </div>
            </section>

            <main className="dashboard-layout-new">

                <div className="chart-container full-width">
                    <div className="chart-header-row">
                        <h3><TrendingUp size={17} style={{ color: '#059669', marginRight: 8, verticalAlign: 'middle' }} />Przychody wg. Wyjazdów</h3>
                        <div className="sort-controls">
                            <button
                                className={`sort-btn${campSort === 'value' ? ' active' : ''}`}
                                onClick={() => setCampSort('value')}
                            >
                                <ArrowDownUp size={13} /> Wg. kwoty
                            </button>
                            <button
                                className={`sort-btn${campSort === 'name' ? ' active' : ''}`}
                                onClick={() => setCampSort('name')}
                            >
                                <ArrowUpDown size={13} /> Wg. nazwy
                            </button>
                        </div>
                    </div>
                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Wyjazd</th>
                                    <th>Przychód (PLN)</th>
                                    <th>W tym wpłaty w EUR (wliczone w kolumnę PLN)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...reportData.incomeByCampData]
                                    .sort((a, b) => campSort === 'name' ? a.name.localeCompare(b.name, 'pl') : b.value - a.value)
                                    .map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.name}</td>
                                        <td className="pos fw-bold">{item.value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                        <td className="text-muted">
                                            {item.eurValue > 0 ? `${item.eurValue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} EUR` : '-'}
                                        </td>
                                    </tr>
                                ))}
                                {reportData.incomeByCampData.length === 0 && (
                                    <tr><td colSpan="3" className="text-center">Brak przychodów w wybranym okresie</td></tr>
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
                                        const catColor = n.includes('turystyczna') ? '#059669'
                                            : n.includes('pływania') ? '#1570EF'
                                            : n.includes('szkolenie') ? '#B07A1A'
                                            : undefined;
                                        return (
                                        <tr key={idx}>
                                            <td><strong style={catColor ? { color: catColor } : {}}>{cat.name}</strong></td>
                                            <td className="pos fw-bold">{cat.value.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</td>
                                        </tr>
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
                    <h3>Historia Miesięczna (Wszystkie Transakcje)</h3>
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
            </main>
        </div>
    );
}
