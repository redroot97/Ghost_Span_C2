/**
 * TelemetryHub - Custom Title Bar
 * Enterprise Telemetry Platform
 */

import React, { useState } from 'react';
import '../styles/TitleBar.css';

const Icons = {
  alert: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
};

const TitleBar = ({ connectionStatus, onRefresh, onLogout, currentOperator }) => {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout();
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleMinimize = () => {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI) {
      window.electronAPI.maximizeWindow();
    }
  };

  const handleClose = () => {
    if (window.electronAPI) {
      window.electronAPI.closeWindow();
    }
  };

  return (
    <>
      <div className="titlebar">
        <div className="titlebar-drag-region">
          <div className="titlebar-left">
            <div className="app-icon">
              <svg width="20" height="20" viewBox="0 0 100 100" fill="none">
                <path
                  d="M50 10 C25 10, 15 35, 15 55 L15 85 L25 75 L35 85 L45 75 L55 85 L65 75 L75 85 L85 75 L85 55 C85 35, 75 10, 50 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="5"
                />
                <circle cx="35" cy="45" r="6" fill="currentColor" />
                <circle cx="65" cy="45" r="6" fill="currentColor" />
              </svg>
            </div>
            <span className="app-title">GhostSpan</span>
            <span className="app-version">v1.0.0</span>
          </div>

          <div className="titlebar-center">
            {/* Empty center for balanced layout */}
          </div>

          <div className="titlebar-right">
            <div className={`connection-status ${connectionStatus}`}>
              <div className="status-dot"></div>
              <span>{connectionStatus === 'connected' ? 'Server Connected' : 'Server Disconnected'}</span>
            </div>
            <button className="refresh-btn" onClick={onRefresh} title="Refresh All">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M21 12a9 9 0 11-2.64-6.36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Refresh</span>
            </button>
            {currentOperator && (
              <button className="logout-btn" onClick={handleLogoutClick} title="Logout">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                <span>Logout</span>
              </button>
            )}
            <button className="titlebar-button" onClick={handleMinimize} title="Minimize">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1"/>
              </svg>
            </button>
            <button className="titlebar-button" onClick={handleMaximize} title="Maximize">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1" fill="none"/>
              </svg>
            </button>
            <button className="titlebar-button close-button" onClick={handleClose} title="Close">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1"/>
                <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <span className="modal-icon">{Icons.alert}</span>
              <h3>Confirm Logout</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to logout?</p>
              <p className="modal-hint">You will need to re-authenticate to access the system.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={cancelLogout}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TitleBar;
