// src/pages/social/PlanMonthModal.jsx
import React, { useState } from 'react';
import { X, CalendarRange } from 'lucide-react';

export default function PlanMonthModal({ channel, onClose, onComplete }) {
    const [status, setStatus] = useState('idle'); // idle | loading | done | error
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleStart = async () => {
        setStatus('loading');
        try {
            const res = await fetch('/api/social/plan-month', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setResult(data);
            setStatus('done');
        } catch (e) {
            setError(e.message);
            setStatus('error');
        }
    };

    return (
        <div className="edit-panel-overlay" onClick={onClose}>
            <div className="plan-month-modal" onClick={e => e.stopPropagation()}>
                <div className="edit-panel-header">
                    <span>Zaplanuj miesiąc</span>
                    <button onClick={onClose} className="close-btn"><X size={16} /></button>
                </div>

                {status === 'idle' && (
                    <>
                        <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                            Claude zaproponuje pomysły na posty dla kanału <strong>{channel === 'BS' ? 'BiegunSport' : 'Akademia Pływania'}</strong> na najbliższe 30 dni.
                            Posty trafią do tabeli jako drafty bez daty — termin ustawisz sam przy zatwierdzaniu każdego posta.
                        </p>
                        <button className="btn-primary" onClick={handleStart} style={{ marginTop: 8 }}>
                            <CalendarRange size={15} /> Generuj plan
                        </button>
                    </>
                )}

                {status === 'loading' && (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
                        <div className="spin" style={{ display: 'inline-block', fontSize: 24 }}>⟳</div>
                        <p>Generowanie planu... (może potrwać 30–60 sekund)</p>
                    </div>
                )}

                {status === 'done' && (
                    <>
                        <p style={{ color: '#16a34a', fontWeight: 500 }}>
                            Gotowe! Utworzono {result.count} postów-draftów.
                        </p>
                        <ul style={{ fontSize: 13, color: '#374151', paddingLeft: 16 }}>
                            {result.posts.slice(0, 5).map((p, i) => (
                                <li key={i}>
                                    {p.post_type} — {p.context_note}
                                </li>
                            ))}
                            {result.posts.length > 5 && <li>...i {result.posts.length - 5} więcej</li>}
                        </ul>
                        <button className="btn-primary" onClick={() => { onComplete(); onClose(); }}>
                            Zamknij i odśwież
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <p style={{ color: '#dc2626' }}>{error}</p>
                        <button className="btn-secondary" onClick={() => setStatus('idle')}>Spróbuj ponownie</button>
                    </>
                )}
            </div>
        </div>
    );
}
