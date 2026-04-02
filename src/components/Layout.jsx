import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, PieChart, Settings, Tent, Search, Download, ReceiptText, RotateCcw } from 'lucide-react';
import './Layout.css';

const SidebarItem = ({ to, icon: Icon, label }) => {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''}`
            }
        >
            <Icon size={18} />
            <span>{label}</span>
        </NavLink>
    );
};

export default function Layout() {
    const location = useLocation();

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/': return 'Dashboard';
            case '/reports': return 'Raporty';
            case '/camps': return 'Wyjazdy';
            case '/vat-marza': return 'VAT Marża';
            case '/zwroty': return 'Zwroty';
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
                    <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" />
                    <SidebarItem to="/reports" icon={PieChart} label="Raporty" />
                    <SidebarItem to="/camps" icon={Tent} label="Wyjazdy" />
                    <SidebarItem to="/vat-marza" icon={ReceiptText} label="VAT Marża" />
                    <SidebarItem to="/zwroty" icon={RotateCcw} label="Zwroty" />
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
