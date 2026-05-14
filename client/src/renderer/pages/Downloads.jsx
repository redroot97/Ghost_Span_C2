/**
 * TelemetryHub - Downloads
 * View and manage files downloaded from agents
 */

import React, { useState, useEffect, useCallback } from 'react';
import '../styles/Downloads.css';
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
  download: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  file: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  folder: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  x: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  alert: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
};

const Downloads = ({ endpoints = [] }) => {
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDownload, setSelectedDownload] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestEndpoint, setRequestEndpoint] = useState('');
  const [requestPath, setRequestPath] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEndpoint, setFilterEndpoint] = useState('all');

  // Fetch downloads
  const fetchDownloads = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/downloads`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDownloads(data);
      }
    } catch (error) {
      console.error('Failed to fetch downloads:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll for updates
  useEffect(() => {
    fetchDownloads();
    const interval = setInterval(fetchDownloads, 3000);
    return () => clearInterval(interval);
  }, [fetchDownloads]);

  // Filter downloads
  const filtered = downloads.filter(dl => {
    const matchesStatus = filterStatus === 'all' || dl.status === filterStatus;
    const matchesEndpoint = filterEndpoint === 'all' || dl.endpoint_id === filterEndpoint;
    return matchesStatus && matchesEndpoint;
  });

  // Get unique endpoints from downloads
  const downloadEndpoints = [...new Set(downloads.map(dl => dl.endpoint_id))];

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  // Get status icon and class
  const getStatusInfo = (status) => {
    switch (status) {
      case 'complete':
        return { icon: Icons.check, class: 'status-complete', label: 'Complete' };
      case 'downloading':
        return { icon: Icons.clock, class: 'status-downloading', label: 'Downloading' };
      case 'pending':
        return { icon: Icons.clock, class: 'status-pending', label: 'Pending' };
      case 'failed':
        return { icon: Icons.alert, class: 'status-failed', label: 'Failed' };
      default:
        return { icon: Icons.file, class: 'status-unknown', label: status };
    }
  };

  // Request new download
  const handleRequestDownload = async () => {
    if (!requestEndpoint || !requestPath) {
      setRequestStatus('Please select an agent and enter a file path');
      return;
    }

    try {
      setRequestStatus('Requesting...');
      const response = await fetch(`${getApiUrl()}/api/downloads/request`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          endpoint_id: requestEndpoint,
          file_path: requestPath
        })
      });

      if (response.ok) {
        setRequestStatus('Download Requested');
        setRequestPath('');
        setTimeout(() => {
          setShowRequestModal(false);
          setRequestStatus('');
        }, 1500);
        fetchDownloads();
      } else {
        const error = await response.json();
        setRequestStatus(`Error: ${error.detail || 'Failed to request download'}`);
      }
    } catch (error) {
      setRequestStatus(`Error: ${error.message}`);
    }
  };

  // Delete download
  const handleDelete = async (fileId) => {
    if (!confirm('Delete this downloaded file?')) return;

    try {
      const response = await fetch(`${getApiUrl()}/api/downloads/${fileId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (response.ok) {
        fetchDownloads();
        if (selectedDownload?.id === fileId) {
          setSelectedDownload(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  // Download file - fetch with auth headers and create blob
  const handleDownloadFile = async (dl) => {
    if (dl.status !== 'complete') return;
    try {
      const response = await fetch(`${getApiUrl()}/api/downloads/${dl.id}/content`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = dl.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to download file:', error);
    }
  };

  // Get endpoint hostname
  const getEndpointName = (endpointId) => {
    const endpoint = endpoints.find(e => e.id === endpointId);
    return endpoint?.hostname || endpointId?.substring(0, 16) || 'Unknown';
  };

  return (
    <div className="downloads-page">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-icon">{Icons.download}</span>
          Downloads
        </h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}>
            {Icons.plus} Request Download
          </button>
          <button className="btn-action" onClick={fetchDownloads}>
            {Icons.refresh} Refresh
          </button>
        </div>
      </div>

      <div className="filters-bar">
        <select
          className="filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="complete">Complete</option>
          <option value="downloading">Downloading</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
        <select
          className="filter-select"
          value={filterEndpoint}
          onChange={(e) => setFilterEndpoint(e.target.value)}
        >
          <option value="all">All Agents</option>
          {downloadEndpoints.map(id => (
            <option key={id} value={id}>{getEndpointName(id)}</option>
          ))}
        </select>
        <span className="filter-count">{filtered.length} Files</span>
      </div>

      <div className="downloads-content">
        <div className="downloads-list">
          {loading ? (
            <div className="downloads-empty">
              <div className="empty-icon">{Icons.folder}</div>
              <div className="empty-text">Loading Downloads...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="downloads-empty">
              <div className="empty-icon">{Icons.folder}</div>
              <div className="empty-title">No Downloads</div>
              <div className="empty-text">
                Use The "Request Download" Button To Download Files From Connected Agents
              </div>
            </div>
          ) : (
            <div className="downloads-grid">
              {filtered.map(dl => {
                const statusInfo = getStatusInfo(dl.status);
                return (
                  <div
                    key={dl.id}
                    className={`download-card ${selectedDownload?.id === dl.id ? 'selected' : ''}`}
                    onClick={() => setSelectedDownload(dl)}
                  >
                    <div className="download-icon">{Icons.file}</div>
                    <div className="download-info">
                      <div className="download-filename">{dl.filename}</div>
                      <div className="download-meta">
                        <span className="download-size">{formatSize(dl.file_size)}</span>
                        <span className="download-separator">•</span>
                        <span className="download-agent">{getEndpointName(dl.endpoint_id)}</span>
                      </div>
                      <div className={`download-status ${statusInfo.class}`}>
                        {statusInfo.icon}
                        <span>{statusInfo.label}</span>
                        {dl.status === 'downloading' && (
                          <span className="download-progress">
                            ({dl.chunks_received}/{dl.total_chunks} chunks)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="download-actions">
                      {dl.status === 'complete' && (
                        <button
                          className="btn-icon"
                          onClick={(e) => { e.stopPropagation(); handleDownloadFile(dl); }}
                          title="Download File"
                        >
                          {Icons.download}
                        </button>
                      )}
                      <button
                        className="btn-icon btn-danger"
                        onClick={(e) => { e.stopPropagation(); handleDelete(dl.id); }}
                        title="Delete"
                      >
                        {Icons.trash}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectedDownload && (
          <div className="download-details">
            <div className="details-header">
              <h3>File Details</h3>
              <button className="btn-close" onClick={() => setSelectedDownload(null)}>
                {Icons.x}
              </button>
            </div>
            <div className="details-body">
              <div className="detail-section">
                <h4>File Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Filename</span>
                    <span className="detail-value">{selectedDownload.filename}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Size</span>
                    <span className="detail-value">{formatSize(selectedDownload.file_size)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Original Path</span>
                    <span className="detail-value mono">{selectedDownload.original_path}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Status</span>
                    <span className={`detail-value ${getStatusInfo(selectedDownload.status).class}`}>
                      {getStatusInfo(selectedDownload.status).label}
                    </span>
                  </div>
                  {selectedDownload.status === 'downloading' && (
                    <div className="detail-item">
                      <span className="detail-label">Progress</span>
                      <span className="detail-value">
                        {selectedDownload.chunks_received} / {selectedDownload.total_chunks} chunks
                      </span>
                    </div>
                  )}
                  {selectedDownload.error && (
                    <div className="detail-item error">
                      <span className="detail-label">Error</span>
                      <span className="detail-value">{selectedDownload.error}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h4>Agent Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Agent</span>
                    <span className="detail-value">{getEndpointName(selectedDownload.endpoint_id)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Agent ID</span>
                    <span className="detail-value mono">{selectedDownload.endpoint_id}</span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4>Timestamps</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Requested</span>
                    <span className="detail-value">
                      {new Date(selectedDownload.created_at).toLocaleString()}
                    </span>
                  </div>
                  {selectedDownload.completed_at && (
                    <div className="detail-item">
                      <span className="detail-label">Completed</span>
                      <span className="detail-value">
                        {new Date(selectedDownload.completed_at).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedDownload.status === 'complete' && (
                <div className="details-actions">
                  <button className="btn btn-primary" onClick={() => handleDownloadFile(selectedDownload)}>
                    {Icons.download} Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Request Download Modal */}
      {showRequestModal && (
        <div className="modal-overlay" onClick={() => setShowRequestModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request File Download</h3>
              <button className="btn-close" onClick={() => setShowRequestModal(false)}>
                {Icons.x}
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Select Agent</label>
                <select
                  className="form-input"
                  value={requestEndpoint}
                  onChange={(e) => setRequestEndpoint(e.target.value)}
                >
                  <option value="">Select An Agent...</option>
                  {endpoints.filter(e => e.status === 'active').map(endpoint => (
                    <option key={endpoint.id} value={endpoint.id}>
                      {endpoint.hostname || endpoint.id} ({endpoint.os || 'Unknown'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>File Path</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="C:\path\to\file.txt or /path/to/file"
                  value={requestPath}
                  onChange={(e) => setRequestPath(e.target.value)}
                />
              </div>
              {requestStatus && (
                <div className={`request-status ${requestStatus.includes('Error') ? 'error' : 'success'}`}>
                  {requestStatus}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowRequestModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleRequestDownload}>
                Request Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Downloads;
