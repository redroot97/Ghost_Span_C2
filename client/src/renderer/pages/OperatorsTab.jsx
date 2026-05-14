/**
 * TelemetryHub - Operators Tab
 * Manage telemetry operators and their activities
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { addOperator as addOperatorAPI, removeOperator as removeOperatorAPI } from '../utils/auth';
import '../styles/OperatorsTab.css';
import { getServerUrl } from '../utils/config';

const getApiUrl = () => getServerUrl();

// SVG Icons
const Icons = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  x: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
};

// Operator colors for visual distinction (grayscale for sharp theme)
const OPERATOR_COLORS = {
  '1': '#f0f6fc',
  '2': '#8b949e',
  '3': '#6e7681',
  '4': '#484f58',
  '5': '#30363d'
};

const OperatorsTab = ({ currentOperator }) => {
  const { operators, refreshOperators } = useAuth();
  const [selectedOperator, setSelectedOperator] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newOperator, setNewOperator] = useState({ username: '', password: '', role: 'Operator' });
  const [addError, setAddError] = useState('');

  const getStatusColor = (status) => {
    switch (status) {
      case 'online':
        return '#00ff88';
      case 'away':
        return '#ffbf00';
      case 'offline':
        return '#ff4444';
      default:
        return '#666';
    }
  };

  const formatLastActive = (date) => {
    if (!date) return 'Never';
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just Now';
    if (minutes < 60) return `${minutes} Minutes Ago`;
    if (hours < 24) return `${hours} Hours Ago`;
    return `${days} Days Ago`;
  };

  const handleAddOperator = async () => {
    setAddError('');

    if (!newOperator.username.trim() || !newOperator.password.trim()) {
      setAddError('Username and password are required');
      return;
    }

    const result = await addOperatorAPI(newOperator.username, newOperator.password, newOperator.role);

    if (result.success) {
      await refreshOperators();
      setShowAddModal(false);
      setNewOperator({ username: '', password: '', role: 'Operator' });
    } else {
      setAddError(result.error || 'Failed to add operator');
    }
  };

  const handleRemoveOperator = async (operatorId) => {
    if (operatorId === currentOperator?.operatorId) {
      alert('Cannot remove yourself while logged in');
      return;
    }

    if (confirm('Are you sure you want to remove this operator?')) {
      const result = await removeOperatorAPI(operatorId);
      if (result.success) {
        await refreshOperators();
        setSelectedOperator(null);
      } else {
        alert(result.error || 'Failed to remove operator');
      }
    }
  };

  // Capitalize first letter of username
  const capitalizeFirstLetter = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  return (
    <div className="operators-tab">
      <div className="page-header">
        <div className="page-title">
          <span className="title-icon">{Icons.users}</span>
          Operators
        </div>
        <div className="header-meta">
          <button className="meta-item meta-highlight" onClick={() => setShowAddModal(true)}>
            <span className="meta-icon">{Icons.plus}</span>
            Add Operator
          </button>
        </div>
      </div>

      <div className="operators-stats">
        <div className="stat-card">
          <div className="card-header">
            <span className="card-icon">{Icons.users}</span>
            <h3 className="card-title">Total Operators</h3>
          </div>
          <div className="stat-card-body">
            <div className="stat-value">{operators.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="card-header">
            <span className="card-icon">{Icons.user}</span>
            <h3 className="card-title">Online Now</h3>
          </div>
          <div className="stat-card-body">
            <div className="stat-value">
              {operators.filter(o => o.status === 'online').length}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="card-header">
            <span className="card-icon">{Icons.check}</span>
            <h3 className="card-title">Total Commands</h3>
          </div>
          <div className="stat-card-body">
            <div className="stat-value">
              {operators.reduce((sum, o) => sum + (o.requests_issued || 0), 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="operators-content">
        <div className="operators-list">
          <div className="operators-grid">
            {operators.map(operator => {
              const isSelected = selectedOperator?.operatorId === operator.operatorId;
              return (
                <div
                  key={operator.operatorId}
                  className={`op-tile ${isSelected ? 'op-tile-active' : ''}`}
                  onClick={() => setSelectedOperator(operator)}
                >
                  <div className="op-tile-head">
                    <span className="op-tile-ico">{Icons.user}</span>
                    <span className="op-tile-name">
                      {operator.operatorName}
                      {operator.operatorId === currentOperator?.operatorId && (
                        <span className="you-badge">YOU</span>
                      )}
                    </span>
                    <span className="op-tile-role">{operator.role}</span>
                    <span
                      className="op-tile-status"
                      style={{ color: getStatusColor(operator.status) }}
                    >
                      {operator.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="op-tile-content">
                    <span className="op-tile-label">Commands</span>
                    <span className="op-tile-num">{operator.requests_issued || 0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedOperator && (
          <div className="operator-details">
            <div className="details-header">
              <div className="details-title">Operator Details</div>
              <button
                className="btn-close"
                onClick={() => setSelectedOperator(null)}
              >
                {Icons.x}
              </button>
            </div>

            <div className="details-body">
              <div className="operator-profile">
                <div className="profile-avatar-large">
                  {selectedOperator.operatorName?.charAt(0).toUpperCase()}
                </div>
                <div className="profile-info">
                  <div className="profile-username">{capitalizeFirstLetter(selectedOperator.operatorName)}</div>
                  <div className="profile-role">{selectedOperator.role}</div>
                  <div
                    className="profile-status"
                    style={{ color: getStatusColor(selectedOperator.status) }}
                  >
                    {selectedOperator.status?.toUpperCase() || 'OFFLINE'}
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <div className="section-title">Statistics</div>
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">Commands Sent</div>
                    <div className="detail-value">{selectedOperator.requests_issued || 0}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Member Since</div>
                    <div className="detail-value">
                      {selectedOperator.created_at
                        ? new Date(selectedOperator.created_at).toLocaleDateString()
                        : 'Never Logged In'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <div className="section-title">Permissions</div>
                <div className="permissions-list">
                  {selectedOperator.role === 'Admin' ? (
                    <>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">Full Access</span>
                      </div>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">Manage Operators</span>
                      </div>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">Deploy Agents</span>
                      </div>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">Execute Commands</span>
                      </div>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">View Agents</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">View Agents</span>
                      </div>
                      <div className="permission-item enabled">
                        <span className="permission-icon">{Icons.check}</span>
                        <span className="permission-name">Execute Commands</span>
                      </div>
                      <div className="permission-item disabled">
                        <span className="permission-icon">{Icons.x}</span>
                        <span className="permission-name">Manage Operators</span>
                      </div>
                      <div className="permission-item disabled">
                        <span className="permission-icon">{Icons.x}</span>
                        <span className="permission-name">Deploy Agents</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {selectedOperator.operatorId !== currentOperator?.operatorId && (
                <div className="action-buttons">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleRemoveOperator(selectedOperator.operatorId)}
                  >
                    {Icons.trash}
                    <span>Remove Operator</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add New Operator</h3>
              <button className="btn-close" onClick={() => setShowAddModal(false)}>
                {Icons.x}
              </button>
            </div>
            <div className="modal-body">
              {addError && (
                <div className="modal-error">{addError}</div>
              )}
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter username"
                  value={newOperator.username}
                  onChange={(e) => setNewOperator({ ...newOperator, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select
                  className="form-input"
                  value={newOperator.role}
                  onChange={(e) => setNewOperator({ ...newOperator, role: e.target.value })}
                >
                  <option value="Administrator">Administrator</option>
                  <option value="Operator">Operator</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter password"
                  value={newOperator.password}
                  onChange={(e) => setNewOperator({ ...newOperator, password: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleAddOperator}>
                Add Operator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorsTab;
