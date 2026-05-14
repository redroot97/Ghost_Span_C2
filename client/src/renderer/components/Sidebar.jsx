/**
 * TelemetryHub - Navigation Sidebar
 * Enterprise Telemetry Platform
 */

import React from 'react';
import '../styles/Sidebar.css';

const Sidebar = ({ activeTab, setActiveTab, endpointCount }) => {
  const menuItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', badge: null },
    { id: 'operators', icon: 'users', label: 'Operators', badge: null },
    { id: 'builder', icon: 'package', label: 'Payload', badge: null },
    { id: 'endpoints', icon: 'terminal', label: 'Agents', badge: endpointCount },
    { id: 'console', icon: 'code', label: 'Console', badge: null },
    { id: 'downloads', icon: 'download', label: 'Downloads', badge: null },
    { id: 'network', icon: 'network', label: 'Graph View', badge: null },
    { id: 'settings', icon: 'settings', label: 'Settings', badge: null },
  ];

  const getIcon = (iconName) => {
    const icons = {
      dashboard: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
      ),
      users: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      terminal: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="4 17 10 11 4 5"/>
          <line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
      ),
      network: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="2"/>
          <circle cx="12" cy="4" r="2"/>
          <circle cx="12" cy="20" r="2"/>
          <circle cx="4" cy="12" r="2"/>
          <circle cx="20" cy="12" r="2"/>
          <line x1="12" y1="6" x2="12" y2="10"/>
          <line x1="12" y1="14" x2="12" y2="18"/>
          <line x1="6" y1="12" x2="10" y2="12"/>
          <line x1="14" y1="12" x2="18" y2="12"/>
        </svg>
      ),
      code: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      ),
      download: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      ),
      package: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      ),
      settings: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v6m0 6v6m5.196-15a9 9 0 0 1 1.732 1m1.268 4.268A9 9 0 0 1 21 12m-1 5.196a9 9 0 0 1-1.732 1m-4.464 1.268A9 9 0 0 1 12 21m-5.196-1a9 9 0 0 1-1.732-1m-1.268-4.464A9 9 0 0 1 3 12m1-5.196a9 9 0 0 1 1.732-1m4.464-1.268A9 9 0 0 1 12 3"/>
        </svg>
      ),
    };
    return icons[iconName] || null;
  };

  return (
    <div className="sidebar">
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
            title={item.label}
          >
            <div className="nav-icon">
              {getIcon(item.icon)}
            </div>
            <span className="nav-label">{item.label}</span>
            {item.badge !== null && item.badge > 0 && (
              <span className="nav-badge">{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

    </div>
  );
};

export default Sidebar;
