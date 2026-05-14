/**
 * TelemetryHub - Main Application
 * Enterprise Telemetry Platform - Operations Center
 */

import React, { useState, useEffect } from 'react';
import './styles/App.css';
import { getServerUrl } from './utils/config';
import { endpointsAPI } from './utils/api';
import { getSession } from './utils/auth';

// Authentication
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';

// Components
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import OperatorsTab from './pages/OperatorsTab';
import EndpointsTab from './pages/EndpointsTab';
import NetworkMap from './pages/NetworkMap';
import RequestConsole from './pages/RequestConsole';
import Downloads from './pages/Downloads';
import ServiceBuilder from './pages/ServiceBuilder';
import Settings from './pages/Settings';

function AppContent() {
  const { isAuthenticated, currentOperator, loading, operators: authOperators, refreshOperators, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [endpoints, setEndpoints] = useState([]);
  const [operators, setOperators] = useState([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  // Console output per endpoint: { endpointId: [...outputs] }
  const [consoleOutputByEndpoint, setConsoleOutputByEndpoint] = useState({});
  // Request history per endpoint: { endpointId: [...requests] }
  const [requestHistoryByEndpoint, setRequestHistoryByEndpoint] = useState({});

  useEffect(() => {
    // Initialize connection to backend
    initializeBackend();

    // Set up real-time updates
    if (window.electronAPI) {
      window.electronAPI.onEndpointUpdate((data) => {
        updateEndpoints(data);
      });

      window.electronAPI.onRequestResult((data) => {
        handleRequestResult(data);
      });
    }
  }, []);

  // Periodic connection status check - only when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkConnection = async () => {
      const data = await endpointsAPI.getAll();
      if (data.connected && !data.unauthorized) {
        setConnectionStatus('connected');
        setEndpoints(data.endpoints || []);
      } else {
        setConnectionStatus('disconnected');
      }
    };

    // Check connection every 5 seconds
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const initializeBackend = async () => {
    const data = await endpointsAPI.getAll();
    if (data.connected && !data.unauthorized) {
      setConnectionStatus('connected');
      setEndpoints(data.endpoints || []);
      loadOperators();
    } else {
      setConnectionStatus('disconnected');
    }
  };

  const loadEndpoints = async () => {
    try {
      const data = await endpointsAPI.getAll();
      setEndpoints(data.endpoints || []);
    } catch (error) {
      console.error('Failed to load endpoints:', error);
    }
  };

  const loadOperators = async () => {
    // Operators are now loaded from AuthContext
    setOperators(authOperators);
  };

  // Sync operators from auth context
  useEffect(() => {
    setOperators(authOperators);
  }, [authOperators]);

  // Global refresh function - refreshes all data
  const handleGlobalRefresh = async () => {
    console.log('[Refresh] Refreshing all data...');
    const data = await endpointsAPI.getAll();
    if (data.connected && !data.unauthorized) {
      setConnectionStatus('connected');
      setEndpoints(data.endpoints || []);
      await refreshOperators();
    } else {
      setConnectionStatus('disconnected');
    }
    console.log('[Refresh] Complete');
  };

  const updateEndpoints = (data) => {
    setEndpoints(prev => {
      const index = prev.findIndex(a => a.id === data.id);
      if (index >= 0) {
        const updated = [...prev];
        updated[index] = { ...updated[index], ...data };
        return updated;
      }
      return [...prev, data];
    });
  };

  const handleRequestResult = (data) => {
    console.log('Request result:', data);
    // Handle request results
  };

  // Show loading state
  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <div className="loading-text">Initializing...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginPage key={Date.now()} />;
  }

  const renderContent = () => {
    const props = {
      endpoints,
      operators,
      selectedEndpoint,
      setSelectedEndpoint,
      connectionStatus,
      setActiveTab,
      consoleOutputByEndpoint,
      setConsoleOutputByEndpoint,
      requestHistoryByEndpoint,
      setRequestHistoryByEndpoint,
      loadEndpoints,
      currentOperator
    };

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard {...props} />;
      case 'operators':
        return <OperatorsTab {...props} />;
      case 'endpoints':
        return <EndpointsTab {...props} />;
      case 'network':
        return <NetworkMap {...props} />;
      case 'console':
        return <RequestConsole {...props} />;
      case 'downloads':
        return <Downloads {...props} />;
      case 'builder':
        return <ServiceBuilder {...props} />;
      case 'settings':
        return <Settings {...props} />;
      default:
        return <Dashboard {...props} />;
    }
  };

  return (
    <div className="app">
      <TitleBar
        connectionStatus={connectionStatus}
        onRefresh={handleGlobalRefresh}
        onLogout={logout}
        currentOperator={currentOperator}
      />

      <div className="app-content">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} endpointCount={endpoints.length} />

        <main className="main-content">
          {renderContent()}
        </main>
      </div>

      {/* Background effects */}
      <div className="ghost-grid"></div>
    </div>
  );
}

// Main App wrapper with AuthProvider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
