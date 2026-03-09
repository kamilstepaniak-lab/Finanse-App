import React, { useState, useEffect, useMemo } from 'react';
import { getAllTransactions, subscribeToTransactions, unsubscribe } from '../db';
import './VatMarza.css';

const fmt = (n) =>
    Number(n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VatMarza() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Per-camp manual settings — persisted to localStorage
    const [settings, setSettings] = useState(() => {
        try { return JSON.parse(localStorage.getItem('vat_marza_settings') || '{}'); }
        catch { return {}; }
    });

    const updateSetting = (camp, field, value) => {
        setSettings(prev => {
            const next = { ...prev, [camp]: { ...prev[camp], [field]: value } };
            localStorage.setItem('vat_marza_settings', JSON.stringify(next));
            return next;
        });
    };

    useEffect(() => {
        loadData();
        const ch = subscribeToTransactions(() => loadData());
        return () => unsubscribe(ch);
    }, []);

    const loadData = async () => {
        const data = await getAllTransactions();
        setTransactions(data);
        setLoading(false);
    };

    // Camps that have income transactions with category "usługa turystyczna"
    const tourismCamps = useMemo(() => {
        const s = new Set(
            transactions
                .filter(t =>
                    t.amount > 0 &&
                    t.camp &&
                    t.camp.trim() !== '' &&
                    t.camp !== 'Bez wyjazdu' &&
                    t.category &&
                    t.category.toLowerCase().includes('turystyczna')
                )
                .map(t => t.camp)
        );
        return Array.from(s).sort();
    }, [transactions]);

    // Build financial data for one camp
    const buildCampData = (campName) => {
        const s = settings[campName] || {};
        const rate = parseFloat(s.rate) || null; // manual EUR→PLN rate

        const campTx = transactions.filter(t => t.camp === campName && !t.parent_id);

        // Income
        const incomes = campTx.filter(t => t.amount > 0);
        const incomePLN = incomes.filter(t => t.currency !== 'EUR').reduce((a, t) => a + t.amount, 0);
        const incomeEUR = incomes.filter(t => t.currency === 'EUR').reduce((a, t) => a + (t.original_amount || 0), 0);
        const incomeConverted = rate
            ? incomePLN + incomeEUR * rate
            : incomes.reduce((a, t) => a + t.amount, 0);

        // Expenses — group by category
        const expenses = campTx.filter(t => t.amount < 0);
        const catMap = {};
        expenses.forEach(t => {
            const cat = t.category || 'Inne';
            if (!catMap[cat]) catMap[cat] = { pln: 0, eur: 0 };
            if (t.currency === 'EUR') {
                catMap[cat].eur += Math.abs(t.original_amount || 0);
            } else {
                catMap[cat].pln += Math.abs(t.amount);
            }
        });

        const costRows = Object.entries(catMap).map(([cat, vals]) => {
            const converted = rate
                ? vals.pln + vals.eur * rate
                : expenses
                    .filter(t => (t.category || 'Inne') === cat)
                    .reduce((a, t) => a + Math.abs(t.amount), 0);
            return { cat, pln: vals.pln, eur: vals.eur, converted };
        }).sort((a, b) => b.converted - a.converted);

        const totalCostConverted = costRows.reduce((a, r) => a + r.converted, 0);

        const marza = incomeConverted - totalCostConverted;

        const umowy = parseFloat(s.umowy) || 0;
        const vatAuto = marza > 0 ? +(marza * 23 / 123).toFixed(2) : 0;
        const vatManual = s.vatManual !== undefined ? parseFloat(s.vatManual) : null;
        const vatValue = vatManual !== null ? vatManual : vatAuto;

        const zysk = marza - umowy - vatValue;
        const dzieci = parseInt(s.dzieci) || 0;
        const zyskPerChild = dzieci > 0 ? zysk / dzieci : null;

        return {
            s,
            rate,
            incomePLN, incomeEUR, incomeConverted,
            costRows, totalCostConverted,
            marza,
            umowy, vatValue, vatAuto,
            zysk, dzieci, zyskPerChild,
        };
    };

    if (loading) return <div className="vm-loading">Pobieranie danych…</div>;

    return (
        <div className="vm-page">
            <header className="vm-header">
                <div>
                    <h1>VAT Marża</h1>
                    <p>Rozliczenie każdego wyjazdu turystycznego</p>
                </div>
                <div className="vm-header-badge">
                    {tourismCamps.length} wyjazd{tourismCamps.length === 1 ? '' : tourismCamps.length < 5 ? 'y' : 'ów'}
                </div>
            </header>

            {tourismCamps.length === 0 && (
                <div className="vm-empty">
                    <p>Brak wyjazdów z kategorią <strong>usługa turystyczna</strong>.</p>
                    <p>Przypisz kategorię i wyjazd do transakcji przychodowych w Dashboardzie.</p>
                </div>
            )}

            {tourismCamps.map(campName => {
                const d = buildCampData(campName);
                const s = d.s;

                return (
                    <div className="vm-card" key={campName}>
                        {/* Card header */}
                        <div className="vm-card-header">
                            <div className="vm-camp-title">
                                <span className="vm-camp-icon">🏕</span>
                                <h2>{campName}</h2>
                            </div>
                            <div className="vm-manual-inputs">
                                <div className="vm-input-group">
                                    <label>Ile dzieci</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={s.dzieci || ''}
                                        placeholder="—"
                                        onChange={e => updateSetting(campName, 'dzieci', e.target.value)}
                                    />
                                </div>
                                <div className="vm-input-group">
                                    <label>Kurs EUR → PLN</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={s.rate || ''}
                                        placeholder="np. 4,22"
                                        onChange={e => updateSetting(campName, 'rate', e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Main table */}
                        <div className="vm-table-wrap">
                            <table className="vm-table">
                                <thead>
                                    <tr>
                                        <th className="vm-col-label"></th>
                                        <th className="vm-col-num">Złoty</th>
                                        <th className="vm-col-num">Euro</th>
                                        <th className="vm-col-num">Po zmianie na zł</th>
                                    </tr>
                                </thead>
                                <tbody>

                                    {/* ── Przychody ── */}
                                    <tr className="vm-row-income">
                                        <td className="vm-row-main">Przychody</td>
                                        <td className="vm-num income">
                                            {d.incomePLN > 0 ? fmt(d.incomePLN) : '0,00'}
                                        </td>
                                        <td className="vm-num income">
                                            {d.incomeEUR > 0 ? fmt(d.incomeEUR) : '0,00'}
                                        </td>
                                        <td className="vm-num income fw">{fmt(d.incomeConverted)}</td>
                                    </tr>

                                    {/* ── Koszty header ── */}
                                    <tr className="vm-row-section">
                                        <td className="vm-row-main">Koszty</td>
                                        <td></td>
                                        <td></td>
                                        <td className="vm-num expense fw">{fmt(d.totalCostConverted)}</td>
                                    </tr>

                                    {/* ── Cost rows by category ── */}
                                    {d.costRows.map(row => (
                                        <tr key={row.cat} className="vm-row-cost">
                                            <td className="vm-row-sub">{row.cat}</td>
                                            <td className="vm-num">{row.pln > 0 ? fmt(row.pln) : '0,00'}</td>
                                            <td className="vm-num">{row.eur > 0 ? fmt(row.eur) : '0,00'}</td>
                                            <td className="vm-num expense">{fmt(row.converted)}</td>
                                        </tr>
                                    ))}

                                    {d.costRows.length === 0 && (
                                        <tr className="vm-row-cost">
                                            <td className="vm-row-sub" colSpan={4} style={{ fontStyle: 'italic', color: '#94A3B8' }}>
                                                Brak kosztów przypisanych do tego wyjazdu
                                            </td>
                                        </tr>
                                    )}

                                    {/* ── Marża ── */}
                                    <tr className="vm-row-marza">
                                        <td className="vm-row-main">Marża</td>
                                        <td></td>
                                        <td></td>
                                        <td className={`vm-num fw ${d.marza >= 0 ? 'income' : 'expense'}`}>
                                            {fmt(d.marza)}
                                        </td>
                                    </tr>

                                    {/* ── Umowy zlecenia ── */}
                                    <tr className="vm-row-manual">
                                        <td className="vm-row-sub">Umowy zlecenia</td>
                                        <td colSpan={2}></td>
                                        <td className="vm-num">
                                            <input
                                                className="vm-inline-input"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={s.umowy || ''}
                                                placeholder="0,00"
                                                onChange={e => updateSetting(campName, 'umowy', e.target.value)}
                                            />
                                        </td>
                                    </tr>

                                    {/* ── VAT ── */}
                                    <tr className="vm-row-manual">
                                        <td className="vm-row-sub">
                                            VAT marży
                                            <span
                                                className="vm-vat-auto-badge"
                                                title={`Auto = ${fmt(d.vatAuto)} PLN (23/123 × marża)`}
                                            >
                                                auto: {fmt(d.vatAuto)}
                                            </span>
                                        </td>
                                        <td colSpan={2}></td>
                                        <td className="vm-num">
                                            <input
                                                className="vm-inline-input"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={s.vatManual !== undefined ? s.vatManual : ''}
                                                placeholder={fmt(d.vatAuto)}
                                                onChange={e => updateSetting(campName, 'vatManual', e.target.value === '' ? undefined : e.target.value)}
                                            />
                                        </td>
                                    </tr>

                                    {/* ── Zysk obozu ── */}
                                    <tr className="vm-row-zysk">
                                        <td className="vm-row-main">Zysk obozu</td>
                                        <td></td>
                                        <td></td>
                                        <td className={`vm-num fw ${d.zysk >= 0 ? 'income' : 'expense'}`}>
                                            {fmt(d.zysk)}
                                        </td>
                                    </tr>

                                    {/* ── Zysk per dziecko ── */}
                                    {d.dzieci > 0 && (
                                        <tr className="vm-row-per-child">
                                            <td className="vm-row-sub">Zysk / dziecko ({d.dzieci} dzieci)</td>
                                            <td></td>
                                            <td></td>
                                            <td className={`vm-num fw ${d.zyskPerChild >= 0 ? 'income' : 'expense'}`}>
                                                {fmt(d.zyskPerChild)}
                                            </td>
                                        </tr>
                                    )}

                                </tbody>
                            </table>
                        </div>

                        {/* Note about rate */}
                        {!d.rate && d.incomeEUR > 0 && (
                            <p className="vm-rate-warn">
                                ⚠ Brak kursu EUR → PLN — kwoty EUR przeliczone po kursie z dnia transakcji.
                                Wpisz kurs ręcznie powyżej, aby przeliczyć według własnego kursu.
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
