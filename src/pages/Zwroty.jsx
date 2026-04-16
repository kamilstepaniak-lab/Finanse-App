import React, { useState, useEffect } from 'react';
import { getAllTransactions, subscribeToTransactions, unsubscribe } from '../db';
import './Dashboard.css';

export default function Zwroty() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const channel = subscribeToTransactions(() => loadData());
        return () => unsubscribe(channel);
    }, []);

    const loadData = async () => {
        setLoading(true);
        const all = await getAllTransactions();
        // Exclude split parents — their children carry the real allocation and may
        // individually be 'Zwrot'. Counting the parent would double-count.
        const splitParentIds = new Set(all.filter(t => t.parent_id).map(t => t.parent_id));
        setTransactions(all.filter(t => t.category === 'Zwrot' && !splitParentIds.has(t.id)));
        setLoading(false);
    };

    const total = transactions.reduce((s, t) => s + (t.amount || 0), 0);
    const fmt = (n) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (loading) return <div className="empty-state">Ładowanie...</div>;

    return (
        <div className="card table-card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Zwroty</h3>
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)' }}>
                    Łącznie: {fmt(total)} PLN
                </span>
            </div>
            {transactions.length === 0 ? (
                <div className="empty-state">
                    <p>Brak transakcji ze kategorią "Zwrot".</p>
                </div>
            ) : (
                <table className="transactions-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Nadawca / Odbiorca</th>
                            <th>Tytuł</th>
                            <th>Kwota</th>
                            <th>Wyjazd</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(t => (
                            <tr key={t.id}>
                                <td>{t.date}</td>
                                <td>{t.sender}</td>
                                <td>{t.title}</td>
                                <td className={t.amount > 0 ? 'amount-pos' : 'amount-neg'}>
                                    {t.amount?.toFixed(2)} PLN
                                </td>
                                <td>{t.camp || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
