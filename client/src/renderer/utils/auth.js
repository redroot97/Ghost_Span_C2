/**
 * TelemetryHub - Authentication Utilities
 * Server-side operator authentication with session management
 */

import { getServerUrl } from './config';

const getApiUrl = () => getServerUrl();
const SESSION_KEY = 'telemetryhub_session';

// Get stored session from localStorage (just the token, not operator data)
export const getSession = () => {
  const session = localStorage.getItem(SESSION_KEY);
  return session ? JSON.parse(session) : null;
};

// Store session in localStorage
const saveSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

// Clear session from localStorage
export const clearSession = async () => {
  const session = getSession();
  if (session && session.token) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (session.accessKey) {
        headers['X-Access-Key'] = session.accessKey;
      }
      await fetch(`${getApiUrl()}/api/operators/logout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ token: session.token })
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
  localStorage.removeItem(SESSION_KEY);
};

// Authenticate operator via server
export const authenticateOperator = async (username, password, accessKey) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    // Include access key in header for Nginx authentication
    if (accessKey) {
      headers['X-Access-Key'] = accessKey;
    }

    const response = await fetch(`${getApiUrl()}/api/operators/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password })
    });

    // If we get no response or connection dropped, it means Nginx rejected (no access key)
    if (!response.ok && response.status === 0) {
      return { success: false, error: 'Access denied - invalid access key' };
    }

    const data = await response.json();

    if (data.success) {
      // Store session with token AND access key
      const session = {
        token: data.token,
        accessKey: accessKey,  // Store access key for future requests
        operatorId: data.operator.operatorId,
        operatorName: data.operator.operatorName,
        role: data.operator.role,
        avatar: data.operator.avatar,
        loginTime: new Date().toISOString()
      };
      saveSession(session);
      return { success: true, operator: session };
    }

    return { success: false, error: data.error || 'Authentication failed' };
  } catch (error) {
    console.error('Auth error:', error);
    // Connection failed likely means Nginx rejected the request (no/invalid access key)
    return { success: false, error: 'Connection Failed - Check Access Key And Server URL' };
  }
};

// Send heartbeat to keep session alive
// Returns: { valid: true } | { valid: false, reason: 'expired' | 'network' | 'no_session' }
export const sendHeartbeat = async () => {
  const session = getSession();
  if (!session || !session.token) {
    return { valid: false, reason: 'no_session' };
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (session.accessKey) {
      headers['X-Access-Key'] = session.accessKey;
    }

    const response = await fetch(`${getApiUrl()}/api/operators/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token: session.token })
    });

    const data = await response.json();
    if (data.success) {
      return { valid: true };
    } else {
      // Server responded but session is invalid/expired
      return { valid: false, reason: 'expired' };
    }
  } catch (error) {
    // Network error - server unreachable
    console.error('Heartbeat error:', error);
    return { valid: false, reason: 'network' };
  }
};

// Get all operators from server
export const getOperators = async () => {
  try {
    const session = getSession();
    const headers = {};
    if (session && session.token) {
      headers['X-Session-Token'] = session.token;
    }
    if (session && session.accessKey) {
      headers['X-Access-Key'] = session.accessKey;
    }
    const response = await fetch(`${getApiUrl()}/api/operators`, { headers });
    if (response.status === 401) return [];
    const data = await response.json();
    return data.operators || [];
  } catch (error) {
    console.error('Get operators error:', error);
    return [];
  }
};

// Register new operator on server
export const addOperator = async (username, password, role = 'Operator') => {
  try {
    const session = getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session && session.token) {
      headers['X-Session-Token'] = session.token;
    }
    if (session && session.accessKey) {
      headers['X-Access-Key'] = session.accessKey;
    }
    const response = await fetch(`${getApiUrl()}/api/operators/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password, role })
    });

    if (response.status === 401) return { success: false, error: 'Unauthorized' };
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Add operator error:', error);
    return { success: false, error: 'Server connection failed' };
  }
};

// Remove operator from server
export const removeOperator = async (operatorId) => {
  try {
    const session = getSession();
    const headers = {};
    if (session && session.token) {
      headers['X-Session-Token'] = session.token;
    }
    if (session && session.accessKey) {
      headers['X-Access-Key'] = session.accessKey;
    }
    const response = await fetch(`${getApiUrl()}/api/operators/${operatorId}`, {
      method: 'DELETE',
      headers
    });

    if (response.status === 401) return { success: false, error: 'Unauthorized' };
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Remove operator error:', error);
    return { success: false, error: 'Server connection failed' };
  }
};

// Check if session is valid (has token)
export const isSessionValid = () => {
  const session = getSession();
  return !!(session && session.token);
};

export default {
  getSession,
  clearSession,
  authenticateOperator,
  sendHeartbeat,
  getOperators,
  addOperator,
  removeOperator,
  isSessionValid
};
