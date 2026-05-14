/**
 * TelemetryHub - Authentication Context
 * Server-based authentication with heartbeat for session management
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  authenticateOperator,
  getSession,
  clearSession,
  sendHeartbeat,
  getOperators
} from '../utils/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentOperator, setCurrentOperator] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const heartbeatInterval = useRef(null);
  const operatorPollInterval = useRef(null);

  // Initialize on mount - check for existing session
  useEffect(() => {
    const initAuth = async () => {
      const session = getSession();
      if (session && session.token) {
        // Verify session is still valid with heartbeat
        const result = await sendHeartbeat();
        if (result.valid) {
          setCurrentOperator(session);
          setIsAuthenticated(true);
          startHeartbeat();
          startOperatorPolling();
        } else if (result.reason === 'expired' || result.reason === 'no_session') {
          // Session expired on server, clear it
          await clearSession();
        } else {
          // Network error - server down, but keep session for reconnect
          setCurrentOperator(session);
          setIsAuthenticated(true);
          startHeartbeat();
          startOperatorPolling();
        }
      }
      // Load initial operators list
      await refreshOperators();
      setLoading(false);
    };

    initAuth();

    // Cleanup on unmount
    return () => {
      stopHeartbeat();
      stopOperatorPolling();
    };
  }, []);

  // Start heartbeat interval (every 30 seconds)
  const startHeartbeat = () => {
    if (heartbeatInterval.current) return;

    heartbeatInterval.current = setInterval(async () => {
      const result = await sendHeartbeat();
      if (!result.valid) {
        if (result.reason === 'expired' || result.reason === 'no_session') {
          // Session actually expired on server - logout
          console.log('Session expired, logging out');
          await logout();
        } else {
          // Network error - server down, don't logout
          console.log('Server unreachable, keeping session');
        }
      }
    }, 30000); // 30 seconds
  };

  // Stop heartbeat interval
  const stopHeartbeat = () => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  };

  // Start operator polling (every 10 seconds)
  const startOperatorPolling = () => {
    if (operatorPollInterval.current) return;

    operatorPollInterval.current = setInterval(async () => {
      await refreshOperators();
    }, 10000); // 10 seconds
  };

  // Stop operator polling
  const stopOperatorPolling = () => {
    if (operatorPollInterval.current) {
      clearInterval(operatorPollInterval.current);
      operatorPollInterval.current = null;
    }
  };

  // Refresh operators list from server
  const refreshOperators = async () => {
    try {
      const ops = await getOperators();
      setOperators(ops);
    } catch (error) {
      console.error('Failed to refresh operators:', error);
    }
  };

  // Login function
  const login = async (username, password, accessKey) => {
    const result = await authenticateOperator(username, password, accessKey);

    if (result.success) {
      setCurrentOperator(result.operator);
      setIsAuthenticated(true);
      startHeartbeat();
      startOperatorPolling();
      await refreshOperators();
      return { success: true };
    }

    return { success: false, error: result.error };
  };

  // Logout function
  const logout = async () => {
    stopHeartbeat();
    stopOperatorPolling();
    await clearSession();
    setCurrentOperator(null);
    setIsAuthenticated(false);
    setOperators([]); // Clear operators list instead of fetching (no session = no access)
  };

  const value = {
    currentOperator,
    isAuthenticated,
    operators,
    loading,
    login,
    logout,
    refreshOperators
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
