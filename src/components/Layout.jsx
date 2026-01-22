import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, PieChart, UploadCloud, Settings, FolderOpen, Tent } from 'lucide-react';
import './Layout.css'; // We will create this specific CSS

const SidebarItem = ({ to, icon: Icon, label }) => {
    return (
        <NavLink
            to={to}
            className={({ isActive }) =>
                `sidebar-item ${isActive ? 'active' : ''}`
            }
        >
            <Icon size={20} />
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
            default: return 'Finanse App';
        }
    }

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="logo-area">
                    <div className="logo-icon">F</div>
                    <span className="logo-text">Finance<span style={{ fontWeight: 300 }}>App</span></span>
                </div>

                <nav className="nav-menu">
                    <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" />
                    <SidebarItem to="/reports" icon={PieChart} label="Raporty" />
                    <SidebarItem to="/camps" icon={Tent} label="Obozy" />
                </nav>

                <div className="nav-footer">
                    <div className="sidebar-item">
                        <Settings size={20} />
                        <span>Ustawienia</span>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <header className="top-bar">
                    <div className="breadcrumbs">
                        <span className="page-title">{getPageTitle()}</span>
                    </div>
                    {/* Placeholder for future user profile or global actions */}
                </header>

                <div className="content-scrollable">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
