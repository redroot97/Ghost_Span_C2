/**
 * GhostSpan - Login Page
 * Open Telemetry C2 Framework - Operator authentication
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getServerUrl, setServerUrl } from '../utils/config';
import '../styles/LoginPage.css';

const LoginPage = () => {
  const [serverUrl, setServerUrlState] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null); // 'username', 'password', 'accessKey', or null
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const ghostRef = useRef(null);
  const { login } = useAuth();

  // Load saved server URL on mount
  useEffect(() => {
    setServerUrlState(getServerUrl());
  }, []);

  const pageRef = useRef(null);

  // Track mouse movement for eye following
  const handleMouseMove = (e) => {
    if (focusedField === 'password' || focusedField === 'accessKey') return;

    if (ghostRef.current) {
      const rect = ghostRef.current.getBoundingClientRect();
      const ghostCenterX = rect.left + rect.width / 2;
      const ghostCenterY = rect.top + rect.height / 2;

      const deltaX = e.clientX - ghostCenterX;
      const deltaY = e.clientY - ghostCenterY;

      const maxOffset = 4;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const normalizedX = distance > 0 ? (deltaX / distance) * Math.min(distance / 50, 1) * maxOffset : 0;
      const normalizedY = distance > 0 ? (deltaY / distance) * Math.min(distance / 50, 1) * maxOffset : 0;

      setEyeOffset({ x: normalizedX, y: normalizedY });
    }
  };

  // Focus window and first input on mount
  useEffect(() => {
    // Focus the Electron window first
    if (window.electronAPI && window.electronAPI.focusWindow) {
      window.electronAPI.focusWindow();
    }

    const timer = setTimeout(() => {
      const firstInput = document.getElementById('serverUrl');
      if (firstInput) {
        firstInput.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!serverUrl.trim()) {
      setError('Please Enter Server URL');
      return;
    }

    if (!accessKey.trim()) {
      setError('Please Enter Access Key');
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError('Please Enter Username And Password');
      return;
    }

    // Save server URL before attempting login
    setServerUrl(serverUrl);

    setIsLoading(true);

    try {
      const result = await login(username, password, accessKey);
      if (!result.success) {
        setError(result.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Window control handlers
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
    <div className="login-page" ref={pageRef} onMouseMove={handleMouseMove}>
      {/* Window controls */}
      <div className="login-window-controls">
        <button className="window-btn" onClick={handleMinimize} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="0" y1="6" x2="12" y2="6" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
        <button className="window-btn" onClick={handleMaximize} title="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1" fill="none"/>
          </svg>
        </button>
        <button className="window-btn close-btn" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1"/>
            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1"/>
          </svg>
        </button>
      </div>

      <div className="login-background">
        <div className="grid-overlay"></div>
      </div>

      <div className="login-container">
        <div className="login-logo" ref={ghostRef}>
          <svg viewBox="0 0 100 100" className="ghost-icon">
            {/* Ghost body */}
            <path
              d="M50 10 C25 10, 15 35, 15 55 L15 85 L25 75 L35 85 L45 75 L55 85 L65 75 L75 85 L85 75 L85 55 C85 35, 75 10, 50 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            {/* Eye sockets */}
            <ellipse cx="35" cy="45" rx="8" ry="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            <ellipse cx="65" cy="45" rx="8" ry="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
            {/* Eyes - animated based on focus state */}
            {(focusedField === 'password' || focusedField === 'accessKey') ? (
              /* Closed eyes when entering secrets */
              <>
                <path d="M28 45 Q35 50, 42 45" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M58 45 Q65 50, 72 45" stroke="currentColor" strokeWidth="2" fill="none" />
              </>
            ) : focusedField === 'username' ? (
              /* Looking down when entering username */
              <>
                <circle cx="35" cy="50" r="4" fill="currentColor" />
                <circle cx="65" cy="50" r="4" fill="currentColor" />
              </>
            ) : (
              /* Eyes follow mouse */
              <>
                <circle
                  cx={35 + eyeOffset.x}
                  cy={45 + eyeOffset.y}
                  r="4"
                  fill="currentColor"
                  style={{ transition: 'cx 0.1s ease-out, cy 0.1s ease-out' }}
                />
                <circle
                  cx={65 + eyeOffset.x}
                  cy={45 + eyeOffset.y}
                  r="4"
                  fill="currentColor"
                  style={{ transition: 'cx 0.1s ease-out, cy 0.1s ease-out' }}
                />
              </>
            )}
          </svg>
        </div>

        <h1 className="login-title">GHOSTSPAN</h1>
        <p className="login-subtitle">Open Telemetry C2 Framework</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="serverUrl">SERVER URL</label>
            <input
              id="serverUrl"
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrlState(e.target.value)}
              placeholder="Server URL"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="accessKey">ACCESS KEY</label>
            <input
              id="accessKey"
              type="password"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              onFocus={() => setFocusedField('accessKey')}
              onBlur={() => setFocusedField(null)}
              placeholder="Enter server access key"
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">OPERATOR</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
              placeholder="Enter operator name"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">PASSWORD</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField('password')}
              onBlur={() => setFocusedField(null)}
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error">
              <span className="error-icon">!</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="loading-spinner"></span>
            ) : (
              'AUTHENTICATE'
            )}
          </button>
        </form>

        <div className="login-footer">
          <div className="version-info">v1.0.0</div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
