import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, PieChart, Settings, Tent, Search, Download, ReceiptText, RotateCcw, History, Share2, ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import './Layout.css';

const SidebarItem = ({ to, icon: Icon, label, indent }) => {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''} ${indent ? 'sidebar-item--indent' : ''}`
            }
        >
            <Icon size={18} />
            <span>{label}</span>
        </NavLink>
    );
};

export default function Layout() {
    const location = useLocation();
    const [financeOpen, setFinanceOpen] = useState(true);

    const financeRoutes = ['/', '/reports', '/camps', '/vat-marza', '/zwroty', '/historia'];
    const isFinanceActive = financeRoutes.some(r =>
        r === '/' ? location.pathname === '/' : location.pathname.startsWith(r)
    );

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/': return 'Dashboard';
            case '/reports': return 'Raporty';
            case '/camps': return 'Wyjazdy';
            case '/vat-marza': return 'VAT Marża';
            case '/zwroty': return 'Zwroty';
            case '/historia': return 'Historia';
            case '/social': return 'Social Media';
            default: return 'Finance';
        }
    };

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="logo-area">
                    <div className="logo-icon">F</div>
                    <span className="logo-text">Finance<span>App</span></span>
                </div>

                <div className="nav-section">
                    <span className="nav-section-label">Nawigacja</span>

                    {/* Finanse – collapsible group */}
                    <button
                        className={`sidebar-group-header ${isFinanceActive ? 'active' : ''}`}
                        onClick={() => setFinanceOpen(o => !o)}
                    >
                        <Wallet size={18} />
                        <span>Finanse</span>
                        {financeOpen
                            ? <ChevronDown size={14} className="sidebar-group-chevron" />
                            : <ChevronRight size={14} className="sidebar-group-chevron" />
                        }
                    </button>

                    {financeOpen && (
                        <div className="sidebar-group-items">
                            <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" indent />
                            <SidebarItem to="/reports" icon={PieChart} label="Raporty" indent />
                            <SidebarItem to="/camps" icon={Tent} label="Wyjazdy" indent />
                            <SidebarItem to="/vat-marza" icon={ReceiptText} label="VAT Marża" indent />
                            <SidebarItem to="/zwroty" icon={RotateCcw} label="Zwroty" indent />
                            <SidebarItem to="/historia" icon={History} label="Historia" indent />
                        </div>
                    )}

                    <SidebarItem to="/social" icon={Share2} label="Social Media" />
                </div>

                <div className="nav-footer">
                    <span className="nav-section-label">Ustawienia</span>
                    <div className="sidebar-item">
                        <Settings size={18} />
                        <span>Ustawienia</span>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <header className="top-bar">
                    <div className="top-bar-left">
                        <span className="page-title">{getPageTitle()}</span>
                    </div>
                    <div className="top-bar-right">
                        <div className="topbar-search">
                            <Search size={14} />
                            <input type="text" placeholder="Szukaj..." />
                        </div>
                        <button className="topbar-export-btn">
                            <Download size={14} />
                            Eksport CSV
                        </button>
                        <div className="user-avatar" title="Użytkownik">K</div>
                    </div>
                </header>

                <div className="content-scrollable">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
