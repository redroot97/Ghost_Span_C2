/**
 * TelemetryHub - Dashboard
 * Technical overview with statistics and activity feed
 */

import React, { useState, useEffect } from 'react';
import { endpointsAPI, tasksAPI, resultsAPI } from '../utils/api';
import '../styles/Dashboard.css';

// SVG Icons
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"></rect>
      <rect x="14" y="3" width="7" height="7"></rect>
      <rect x="14" y="14" width="7" height="7"></rect>
      <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
  ),
  server: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
      <line x1="6" y1="6" x2="6.01" y2="6"></line>
      <line x1="6" y1="18" x2="6.01" y2="18"></line>
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  ),
  linux: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/>
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  cpu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
      <rect x="9" y="9" width="6" height="6"></rect>
      <line x1="9" y1="1" x2="9" y2="4"></line>
      <line x1="15" y1="1" x2="15" y2="4"></line>
      <line x1="9" y1="20" x2="9" y2="23"></line>
      <line x1="15" y1="20" x2="15" y2="23"></line>
      <line x1="20" y1="9" x2="23" y2="9"></line>
      <line x1="20" y1="14" x2="23" y2="14"></line>
      <line x1="1" y1="9" x2="4" y2="9"></line>
      <line x1="1" y1="14" x2="4" y2="14"></line>
    </svg>
  ),
  network: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
      <circle cx="9" cy="7" r="4"></circle>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"></circle>
      <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  )
};

const Dashboard = ({ endpoints = [], operators = [], setActiveTab, currentOperator }) => {
  const [tasks, setTasks] = useState([]);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({
    totalEndpoints: 0,
    activeEndpoints: 0,
    totalTasks: 0,
    successfulTasks: 0
  });
  // Load data
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 5000);
    return () => clearInterval(interval);
  }, [endpoints]);

  const loadDashboardData = async () => {
    try {
      const [tasksData, resultsData] = await Promise.all([
        tasksAPI.getAll(),
        resultsAPI.getAll()
      ]);

      setTasks(tasksData.tasks || []);
      setResults(resultsData.results || []);

      const now = Date.now();
      const fiveMinutesAgo = now - (5 * 60 * 1000);
      const activeEndpoints = endpoints.filter(a =>
        new Date(a.last_seen).getTime() > fiveMinutesAgo
      ).length;

      setStats({
        totalEndpoints: endpoints.length,
        activeEndpoints,
        totalTasks: tasksData.tasks?.length || 0,
        successfulTasks: resultsData.results?.length || 0
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  };

  // Get OS distribution - only for ACTIVE endpoints
  const getActiveOSDistribution = () => {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    const activeEndpointsList = endpoints.filter(a => new Date(a.last_seen).getTime() > fiveMinutesAgo);

    const distribution = [];
    let windows = 0, linux = 0, macos = 0;

    activeEndpointsList.forEach(endpoint => {
      const os = (endpoint.os || '').toLowerCase();
      if (os.includes('windows')) windows++;
      else if (os.includes('linux')) linux++;
      else if (os.includes('mac') || os.includes('darwin')) macos++;
    });

    // Only add platforms that have active endpoints
    if (windows > 0) distribution.push({ name: 'Windows', count: windows, icon: 'windows' });
    if (linux > 0) distribution.push({ name: 'Linux', count: linux, icon: 'linux' });
    if (macos > 0) distribution.push({ name: 'macOS', count: macos, icon: 'apple' });

    return { distribution, total: activeEndpointsList.length };
  };

  // Get recent activity - only agent connections and operator events
  const getRecentActivity = () => {
    const activities = [];
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);

    // Agent connected events - only for currently active agents
    endpoints.forEach(endpoint => {
      const lastSeen = new Date(endpoint.last_seen).getTime();
      const isActive = lastSeen > fiveMinutesAgo;

      if (endpoint.first_seen && isActive) {
        activities.push({
          type: 'endpoint_registered',
          timestamp: new Date(endpoint.first_seen),
          id: endpoint.id,
          message: `Agent ${endpoint.id.substring(0, 8)} connected`,
          os: endpoint.os
        });
      }
    });

    // Operator joined events
    operators.forEach(op => {
      if (op.status === 'online' && op.lastActive) {
        activities.push({
          type: 'operator_joined',
          timestamp: new Date(op.lastActive),
          id: op.id,
          message: `Operator ${op.username || op.operatorName} Joined`,
        });
      }
    });

    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 12);
  };

  const activeOsData = getActiveOSDistribution();
  const recentActivity = getRecentActivity();

  const getOSIcon = (iconName) => {
    if (iconName === 'windows') return Icons.windows;
    if (iconName === 'linux') return Icons.linux;
    if (iconName === 'apple') return Icons.apple;
    return Icons.cpu;
  };

  const getOSIconByOS = (os) => {
    const osLower = (os || '').toLowerCase();
    if (osLower.includes('windows')) return Icons.windows;
    if (osLower.includes('linux')) return Icons.linux;
    if (osLower.includes('mac') || osLower.includes('darwin')) return Icons.apple;
    return Icons.cpu;
  };

  return (
    <div className="dashboard">
      <div className="page-header">
        <div className="page-title">
          <span className="title-icon">{Icons.dashboard}</span>
          Dashboard
        </div>
        <div className="header-meta">
          <span className="meta-item meta-highlight">
            <span className="meta-icon">{Icons.clock}</span>
            {new Date().toLocaleTimeString()}
          </span>
          <span className="meta-item meta-highlight">
            <span className="meta-icon">{Icons.users}</span>
            {currentOperator?.operatorName || 'Operator'}
          </span>
        </div>
      </div>

      {/* Top Row - 4 Stat Cards */}
      <div className="stats-row">
        <div className="dashboard-card" onClick={() => setActiveTab('endpoints')}>
          <div className="card-header">
            <span className="card-icon">{Icons.server}</span>
            <h3 className="card-title">Total Agents</h3>
          </div>
          <div className="stat-card-content">
            <div className="stat-icon-wrap">{Icons.server}</div>
            <div className="stat-value">{stats.totalEndpoints}</div>
            <div className="stat-bar"><div className="stat-bar-fill"></div></div>
          </div>
        </div>

        <div className="dashboard-card" onClick={() => setActiveTab('endpoints')}>
          <div className="card-header">
            <span className="card-icon">{Icons.zap}</span>
            <h3 className="card-title">Active Agents</h3>
          </div>
          <div className="stat-card-content">
            <div className="stat-icon-wrap">{Icons.zap}</div>
            <div className="stat-value">{stats.activeEndpoints}</div>
            <div className="stat-bar"><div className="stat-bar-fill"></div></div>
          </div>
        </div>

        <div className="dashboard-card" onClick={() => setActiveTab('console')}>
          <div className="card-header">
            <span className="card-icon">{Icons.upload}</span>
            <h3 className="card-title">Commands Sent</h3>
          </div>
          <div className="stat-card-content">
            <div className="stat-icon-wrap">{Icons.upload}</div>
            <div className="stat-value">{stats.totalTasks}</div>
            <div className="stat-bar"><div className="stat-bar-fill"></div></div>
          </div>
        </div>

        <div className="dashboard-card" onClick={() => setActiveTab('console')}>
          <div className="card-header">
            <span className="card-icon">{Icons.download}</span>
            <h3 className="card-title">Commands Received</h3>
          </div>
          <div className="stat-card-content">
            <div className="stat-icon-wrap">{Icons.download}</div>
            <div className="stat-value">{stats.successfulTasks}</div>
            <div className="stat-bar"><div className="stat-bar-fill"></div></div>
          </div>
        </div>
      </div>

      {/* Bottom Row - 2 Cards */}
      <div className="bottom-row">
        <div className="dashboard-card">
          <div className="card-header">
            <span className="card-icon">{Icons.cpu}</span>
            <h3 className="card-title">Active Platforms</h3>
            <span className="card-badge">{activeOsData.total} Online</span>
          </div>
          <div className="card-body">
            {activeOsData.distribution.length > 0 ? (
              <div className="os-distribution">
                {activeOsData.distribution.map((platform, index) => (
                  <div className="os-item" key={index}>
                    <div className="os-header">
                      <span className="os-icon">{getOSIcon(platform.icon)}</span>
                      <span className="os-name">{platform.name}</span>
                      <span className="os-count">{platform.count}</span>
                    </div>
                    <div className="os-bar">
                      <div className="os-bar-fill" style={{ width: `${(platform.count / activeOsData.total) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">{Icons.server}</div>
                <div className="empty-title">No Agents Connected</div>
                <div className="empty-text">Deploy An Agent To Get Started</div>
                <button className="empty-action" onClick={() => setActiveTab('builder')}>
                  Deploy Agent
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card">
          <div className="card-header">
            <span className="card-icon">{Icons.activity}</span>
            <h3 className="card-title">Activity Stream</h3>
          </div>
          <div className="card-body">
            {recentActivity.length > 0 ? (
              <div className="activity-feed">
                {recentActivity.map((activity, index) => (
                  <div key={index} className={`activity-item ${activity.type}`}>
                    <div className="activity-indicator"></div>
                    <div className="activity-content">
                      <div className="activity-message">
                        <code>{activity.message}</code>
                      </div>
                      <div className="activity-meta">
                        <span className="activity-time">
                          {activity.timestamp.toLocaleTimeString()}
                        </span>
                        {activity.os && (
                          <span className="activity-os">{getOSIconByOS(activity.os)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">{Icons.activity}</div>
                <div className="empty-title">Waiting For Activity</div>
                <div className="empty-text">Agent Connections And Operator Actions Will Appear Here</div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
