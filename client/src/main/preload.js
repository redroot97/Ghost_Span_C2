/**
 * TelemetryHub - Preload Script
 * Secure bridge between main and renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Endpoint management
  getEndpoints: () => ipcRenderer.invoke('get-endpoints'),
  sendTask: (endpointId, task) => ipcRenderer.invoke('send-task', endpointId, task),

  // Operator management
  getOperators: () => ipcRenderer.invoke('get-operators'),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  focusWindow: () => ipcRenderer.invoke('focus-window'),

  // Build tools
  executeShell: (shellInput) => ipcRenderer.invoke('execute-shell', shellInput),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  // Go service build (cross-platform)
  checkGo: () => ipcRenderer.invoke('check-go'),
  checkCgo: () => ipcRenderer.invoke('check-cgo'),
  checkPrecompiled: () => ipcRenderer.invoke('check-precompiled'),
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  buildServiceGo: (config) => ipcRenderer.invoke('build-service-go', config),

  // File operations
  getCompiledFile: (options) => ipcRenderer.invoke('get-compiled-file', options),
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  getOutputPath: () => ipcRenderer.invoke('get-output-path'),

  // Real-time updates
  onEndpointUpdate: (callback) => {
    ipcRenderer.on('endpoint-update', (event, data) => callback(data));
  },
  onRequestResult: (callback) => {
    ipcRenderer.on('request-result', (event, data) => callback(data));
  }
});
