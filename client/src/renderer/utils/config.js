/**
 * TelemetryHub - Configuration
 * Enterprise Telemetry Platform - Centralized config
 */

const SETTINGS_KEY = 'telemetryhub-settings';

const DEFAULTS = {
  serverUrl: '',
  theme: 'dark',
  refreshInterval: 3000
};

// Get server URL from settings
export const getServerUrl = () => {
  try {
    const settings = localStorage.getItem(SETTINGS_KEY);
    if (settings) {
      const parsed = JSON.parse(settings);
      return parsed.serverUrl || DEFAULTS.serverUrl;
    }
  } catch (error) {
    console.error('Failed to get server URL:', error);
  }
  return DEFAULTS.serverUrl;
};

// Set server URL in settings
export const setServerUrl = (url) => {
  try {
    const settings = getSettings();
    settings.serverUrl = url;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Failed to set server URL:', error);
    return false;
  }
};

// Get all settings
export const getSettings = () => {
  try {
    const settings = localStorage.getItem(SETTINGS_KEY);
    if (settings) {
      return { ...DEFAULTS, ...JSON.parse(settings) };
    }
  } catch (error) {
    console.error('Failed to get settings:', error);
  }
  return DEFAULTS;
};

// Test server connection
export const testServerConnection = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${url}/api/operators`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    return { success: response.ok, status: response.status };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Connection timeout' };
    }
    return { success: false, error: error.message };
  }
};

export default { getServerUrl, setServerUrl, getSettings, testServerConnection };
