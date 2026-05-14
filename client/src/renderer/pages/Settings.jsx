/**
 * TelemetryHub - Settings
 * Application configuration and preferences
 */

import React, { useState, useEffect } from 'react';
import '../styles/Settings.css';

// SVG Icons
const Icons = {
  settings: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

const DEFAULTS = {
  serverUrl: '',
  refreshInterval: 3000
};

const Settings = () => {
  const [serverUrl, setServerUrl] = useState(DEFAULTS.serverUrl);
  const [refreshInterval, setRefreshInterval] = useState(DEFAULTS.refreshInterval);
  const [savedSettings, setSavedSettings] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('telemetryhub-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setServerUrl(parsed.serverUrl || DEFAULTS.serverUrl);
      setRefreshInterval(parsed.refreshInterval || DEFAULTS.refreshInterval);
      setSavedSettings(parsed);
    } else {
      setSavedSettings(DEFAULTS);
    }
  }, []);

  // Check if there are unsaved changes
  const hasChanges = savedSettings && (
    serverUrl !== savedSettings.serverUrl ||
    refreshInterval !== savedSettings.refreshInterval
  );

  const handleSave = () => {
    const settings = { serverUrl, refreshInterval };
    localStorage.setItem('telemetryhub-settings', JSON.stringify(settings));
    setSavedSettings(settings);
    setStatusMessage('Settings Saved Successfully!');
    setTimeout(() => setStatusMessage(''), 3000);
  };

  const handleRevert = () => {
    if (savedSettings) {
      setServerUrl(savedSettings.serverUrl);
      setRefreshInterval(savedSettings.refreshInterval);
      setStatusMessage('Changes Reverted');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all settings to defaults?')) {
      setServerUrl(DEFAULTS.serverUrl);
      setRefreshInterval(DEFAULTS.refreshInterval);
      localStorage.setItem('telemetryhub-settings', JSON.stringify(DEFAULTS));
      setSavedSettings(DEFAULTS);
      setStatusMessage('Settings Reset To Defaults');
      setTimeout(() => setStatusMessage(''), 3000);
    }
  };

  const handleClearAllData = () => {
    if (confirm('Clear all saved data? This will reset everything and log you out.')) {
      localStorage.clear();
      sessionStorage.clear();
      setStatusMessage('All Data Cleared - Reloading...');
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  return (
    <div className="settings">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-icon">{Icons.settings}</span>
          Settings
        </h1>
        {hasChanges && <span className="unsaved-indicator">Unsaved Changes</span>}
      </div>

      {statusMessage && (
        <div className="settings-status">{statusMessage}</div>
      )}

      <div className="settings-content">
        <div className="settings-section">
          <h3 className="section-title">OTel Collector Configuration</h3>
          <div className="setting-group">
            <label className="setting-label">Collector URL</label>
            <input
              type="text"
              className="setting-input"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            <div className="setting-hint">
              C2 SERVER URL - gRPC PORT
            </div>
          </div>
          <div className="setting-group">
            <label className="setting-label">Refresh Interval (ms)</label>
            <input
              type="number"
              className="setting-input"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 3000)}
            />
            <div className="setting-hint">
              HOW OFTEN TO CHECK FOR UPDATES (3000MS = 3 SECONDS)
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h3 className="section-title">About</h3>
          <div className="about-info">
            <div className="about-item">
              <span className="about-label">Application</span>
              <span className="about-value">GhostSpan</span>
            </div>
            <div className="about-item">
              <span className="about-label">Description</span>
              <span className="about-value">OpenTelemetry C2 Framework</span>
            </div>
            <div className="about-item">
              <span className="about-label">Version</span>
              <span className="about-value">1.0.0</span>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn btn-secondary" onClick={handleRevert} disabled={!hasChanges}>
            Revert Changes
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!hasChanges}>
            Save Changes
          </button>
        </div>

        <div className="settings-section danger-zone">
          <h3 className="section-title">Danger Zone</h3>
          <div className="setting-group">
            <button className="btn btn-danger" onClick={handleReset}>
              Reset to Defaults
            </button>
            <div className="setting-hint">
              Reset all settings to default values
            </div>
          </div>
          <div className="setting-group">
            <button className="btn btn-danger" onClick={handleClearAllData}>
              Clear All Saved Data
            </button>
            <div className="setting-hint">
              Clear localStorage, session, and cached credentials. Will log you out.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
