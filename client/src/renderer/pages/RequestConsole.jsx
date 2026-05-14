/**
 * TelemetryHub - Request Console
 * Terminal-style request interface with multi-operator collaboration
 * Tabbed view: All Activity + Individual operator views
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import '../styles/RequestConsole.css';
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
  activity: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  computer: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="20" height="14"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  ),
  target: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  alert: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  history: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  inbox: (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/>
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
    </svg>
  ),
  clock: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  x: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};

// Operator colors for visual distinction - vibrant colors with glassy effect
const OPERATOR_COLORS = {
  '1': '#00ff88',  // Ghost Green
  '2': '#00aaff',  // Ghost Blue
  '3': '#ff6b35',  // Ghost Orange
  '4': '#bf5af2',  // Ghost Purple
  '5': '#ff375f',  // Ghost Pink
  '6': '#00d4aa',  // Ghost Cyan
  '7': '#ffd60a',  // Ghost Yellow
  '8': '#5e5ce6',  // Ghost Indigo
};

// Get glow color (same color with alpha for box-shadow)
const getOperatorGlow = (color) => {
  return color ? `${color}40` : 'rgba(0, 255, 136, 0.25)';
};

// Get background color (same color with low alpha for glassy effect)
const getOperatorBg = (color) => {
  return color ? `${color}15` : 'rgba(0, 255, 136, 0.08)';
};

// History storage key
const HISTORY_STORAGE_KEY = 'telemetryhub-request-history';

// Load history from localStorage
const loadHistoryFromStorage = () => {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error('Failed to load history:', e);
    return {};
  }
};

// Save history to localStorage
const saveHistoryToStorage = (history) => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
};

const RequestConsole = ({
  endpoints = [],
  selectedEndpoint: propSelectedEndpoint,
  setSelectedEndpoint: propSetSelectedEndpoint,
  requestHistoryByEndpoint = {},
  setRequestHistoryByEndpoint,
  currentOperator
}) => {
  // Use prop if available, otherwise manage locally
  const [localSelectedEndpoint, setLocalSelectedEndpoint] = useState(null);
  const selectedEndpoint = propSelectedEndpoint || localSelectedEndpoint;
  const setSelectedEndpoint = propSetSelectedEndpoint || setLocalSelectedEndpoint;

  const endpointId = selectedEndpoint?.id;

  // Local request history for arrow key navigation
  const history = endpointId ? (requestHistoryByEndpoint[endpointId] || []) : [];
  const setHistory = (updater) => {
    if (!endpointId || !setRequestHistoryByEndpoint) return;
    setRequestHistoryByEndpoint(prev => ({
      ...prev,
      [endpointId]: typeof updater === 'function' ? updater(prev[endpointId] || []) : updater
    }));
  };

  const [request, setRequest] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Server-synced state - ALL requests and results for this endpoint
  const [serverRequests, setServerRequests] = useState([]);
  const [serverResults, setServerResults] = useState({});
  const localRequestsRef = useRef([]);  // Local requests (help, etc.)

  // Tab state: 'all' or operator_id
  const [activeTab, setActiveTab] = useState('all');

  // Track if user has scrolled up (to prevent auto-scroll)
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [lastRequestCount, setLastRequestCount] = useState(0);

  // Persistent history storage (survives clear)
  const [persistentHistory, setPersistentHistory] = useState(() => loadHistoryFromStorage());
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Track cleared request IDs to hide them from view (persists through polling and navigation)
  const [clearedRequestIds, setClearedRequestIds] = useState(() => {
    try {
      const saved = localStorage.getItem('console-cleared-ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const inputRef = useRef(null);
  const outputRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const resultsRef = useRef({}); // Use ref to avoid closure issues
  const prevEndpointRef = useRef(null); // Track previous endpoint to detect actual changes

  // Available commands
  const availableRequests = [
    'whoami', 'hostname', 'pwd', 'cd', 'ls', 'dir', 'env', 'sysinfo',
    'ps', 'tasklist', 'netstat', 'ipconfig', 'ifconfig', 'cat', 'type',
    'interval', 'download', 'kill', 'shell', 'cmd', 'exec', 'clear', 'help'
  ];

  // Get unique operators from visible requests (excluding cleared)
  const activeOperators = useMemo(() => {
    const operatorMap = new Map();
    // Filter out cleared requests first
    const visibleReqs = serverRequests.filter(req => !clearedRequestIds.has(req.id));
    for (const req of visibleReqs) {
      if (req.operator_id && !operatorMap.has(req.operator_id)) {
        // Determine avatar from multiple sources
        let avatar = req.operator_avatar;
        if (!avatar) {
          const name = (req.operator_name || '').toLowerCase();
          if (name.includes('operator1') || name.includes('op1')) avatar = '1';
          else if (name.includes('operator2') || name.includes('op2')) avatar = '2';
          else if (name.includes('operator3') || name.includes('op3')) avatar = '3';
          else if (name.includes('operator4') || name.includes('op4')) avatar = '4';
          else if (name.includes('operator5') || name.includes('op5')) avatar = '5';
          else if (req.operator_id === 'op-001') avatar = '1';
          else if (req.operator_id === 'op-002') avatar = '2';
          else avatar = '1';
        }
        operatorMap.set(req.operator_id, {
          id: req.operator_id,
          name: req.operator_name || 'Unknown',
          avatar: avatar
        });
      }
    }
    return Array.from(operatorMap.values());
  }, [serverRequests, clearedRequestIds]);

  // Persist clearedRequestIds to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('console-cleared-ids', JSON.stringify([...clearedRequestIds]));
    } catch {
      // Ignore storage errors
    }
  }, [clearedRequestIds]);

  // Handle scroll event to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    // Consider "at bottom" if within 100px of bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    setUserScrolledUp(!isAtBottom);
  }, []);

  // Auto-scroll only when new requests arrive AND user hasn't scrolled up
  useEffect(() => {
    if (outputRef.current && !userScrolledUp && serverRequests.length > lastRequestCount) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
    setLastRequestCount(serverRequests.length);
  }, [serverRequests.length, userScrolledUp, lastRequestCount]);

  // Scroll to bottom button handler
  const scrollToBottom = () => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
      setUserScrolledUp(false);
    }
  };

  // Poll server for ALL requests and results for this endpoint
  useEffect(() => {
    if (!endpointId) {
      setServerRequests([]);
      setServerResults({});
      resultsRef.current = {};
      return;
    }

    const pollServer = async () => {
      try {
        // Fetch all requests for this endpoint
        const reqResponse = await fetch(`${getApiUrl()}/api/tasks`, {
          headers: getAuthHeaders()
        });
        if (!reqResponse.ok) return;

        const reqData = await reqResponse.json();
        const endpointRequests = (reqData.tasks || [])
          .filter(req => req.endpoint_id === endpointId)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        // Merge server requests with local requests
        const allRequests = [...endpointRequests, ...localRequestsRef.current]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        setServerRequests(allRequests);

        // Fetch results for requests that don't have results yet
        // Use ref to get current results (avoids stale closure)
        const currentResults = { ...resultsRef.current };
        let hasNewResults = false;

        for (const req of endpointRequests) {
          // Skip if we already have this result
          if (currentResults[req.id]) {
            continue;
          }

          try {
            const resResponse = await fetch(`${getApiUrl()}/api/results/${req.id}`, {
              headers: getAuthHeaders()
            });
            if (resResponse.ok) {
              const resData = await resResponse.json();
              if (resData && resData.result) {
                currentResults[req.id] = {
                  text: resData.result,
                  received_at: new Date().toISOString(),
                  request_id: req.id // Store request ID for verification
                };
                hasNewResults = true;
                console.log(`[+] Got result for request ${req.id}: ${resData.result.substring(0, 50)}...`);
              }
            }
          } catch (e) {
            // Result not ready yet
          }
        }

        // Update both ref and state if we got new results
        if (hasNewResults) {
          resultsRef.current = currentResults;
          setServerResults({ ...currentResults });
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    };

    // Reset results when endpoint changes
    resultsRef.current = {};
    localRequestsRef.current = [];
    setServerResults({});

    // Only reset cleared request IDs when endpoint actually changes (not on remount)
    if (prevEndpointRef.current !== null && prevEndpointRef.current !== endpointId) {
      setClearedRequestIds(new Set());
    }
    prevEndpointRef.current = endpointId;

    // Poll immediately and then every 2 seconds
    pollServer();
    pollIntervalRef.current = setInterval(pollServer, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [endpointId]);

  // Build output from server requests and results, filtered by active tab and cleared status
  const buildOutput = useCallback(() => {
    const output = [];

    // Filter requests based on active tab AND exclude cleared requests
    const filteredRequests = serverRequests
      .filter(req => !clearedRequestIds.has(req.id))
      .filter(req => activeTab === 'all' || req.operator_id === activeTab);

    for (const req of filteredRequests) {
      // Decode request args for display
      let reqText = req.type;
      if (req.args && req.args.length > 0) {
        try {
          const decodedArg = atob(req.args[0]);
          reqText = `${req.type} ${decodedArg}`;
        } catch (e) {
          reqText = `${req.type} ${req.args.join(' ')}`;
        }
      }

      const result = serverResults[req.id];
      const hasPendingResult = !result;

      // Determine avatar - check multiple sources
      const getAvatar = () => {
        if (req.operator_avatar) return req.operator_avatar;
        const name = (req.operator_name || '').toLowerCase();
        if (name.includes('operator1') || name.includes('op1')) return '1';
        if (name.includes('operator2') || name.includes('op2')) return '2';
        if (name.includes('operator3') || name.includes('op3')) return '3';
        if (name.includes('operator4') || name.includes('op4')) return '4';
        if (name.includes('operator5') || name.includes('op5')) return '5';
        // Use operator_id to determine color as fallback
        if (req.operator_id === 'op-001') return '1';
        if (req.operator_id === 'op-002') return '2';
        return '1';
      };
      const avatar = getAvatar();

      // Add request entry
      output.push({
        id: req.id,
        type: 'request',
        text: reqText,
        timestamp: new Date(req.created_at).toLocaleTimeString(),
        fullTimestamp: req.created_at,
        operatorId: req.operator_id,
        operatorName: req.operator_name,
        operatorAvatar: avatar,
        isCurrentOperator: req.operator_id === currentOperator?.operatorId,
        hasPendingResult
      });

      // Add result if available - MUST match the request ID
      if (result && result.request_id === req.id) {
        output.push({
          id: `${req.id}-result`,
          type: 'result',
          text: result.text,
          request: reqText,
          requestId: req.id,
          timestamp: new Date(result.received_at).toLocaleTimeString(),
          operatorId: req.operator_id,
          operatorName: req.operator_name,
          operatorAvatar: avatar
        });
      }
    }

    return output;
  }, [serverRequests, serverResults, activeTab, currentOperator?.operatorId, clearedRequestIds]);

  const output = buildOutput();

  // Handle request input change with autocomplete
  const handleInputChange = (e) => {
    const value = e.target.value;
    setRequest(value);

    if (value.trim()) {
      const filtered = availableRequests.filter(req =>
        req.toLowerCase().startsWith(value.toLowerCase().split(' ')[0])
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0 && value.indexOf(' ') === -1);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Handle request submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!request.trim() || !selectedEndpoint) return;

    const reqText = request.trim();

    // Add to local history for arrow key navigation
    setHistory(prev => [...prev, reqText]);
    setHistoryIndex(-1);

    // Handle local-only requests
    if (reqText === 'clear') {
      // Show confirmation dialog (same as Clear button)
      setRequest('');
      setShowClearConfirm(true);
      return;
    }

    if (reqText === 'help' || reqText === '?') {
      // Show help locally - don't send to agent
      setRequest('');
      const helpText = `
AVAILABLE COMMANDS (OPSEC-SAFE - No Process Spawning)
──────────────────────────────────────────────────────
  whoami          Get current username
  hostname        Get hostname
  pwd             Get current directory
  cd <path>       Change directory
  ls/dir [path]   List directory contents
  cat/type <file> Read file contents
  env             Show environment variables
  sysinfo         Get system information
  ps/tasklist     List running processes
  netstat         Show network connections
  ipconfig        Show network interfaces
  interval        Show current polling interval
  interval <sec>  Set polling interval (seconds)
  download <path> Download file from agent
  kill            Terminate the agent
  clear           Clear console output
  help            Show this help message

SHELL EXECUTION (Spawns cmd.exe - Use with caution)
──────────────────────────────────────────────────────
  shell <cmd>     Execute command via cmd.exe
  cmd <cmd>       Alias for shell
  exec <cmd>      Alias for shell

Example: shell net user, shell systeminfo
──────────────────────────────────────────────────────`;

      // Add help as a local message
      const helpRequest = {
        id: `help-${Date.now()}`,
        type: 'help',
        args: [],
        endpoint_id: selectedEndpoint.id,
        created_at: new Date().toISOString(),
        status: 'completed',
        isLocal: true,
        operator_id: currentOperator?.operatorId,
        operator_name: currentOperator?.operatorName,
        operator_avatar: currentOperator?.avatar
      };
      // Store in local requests ref so it persists through polling
      localRequestsRef.current = [...localRequestsRef.current, helpRequest];
      setServerRequests(prev => [...prev, helpRequest]);
      resultsRef.current[helpRequest.id] = {
        text: helpText,
        received_at: new Date().toISOString(),
        request_id: helpRequest.id
      };
      setServerResults({ ...resultsRef.current });
      return;
    }

    // Parse request
    const parts = reqText.split(' ');
    const reqType = parts[0];
    const args = parts.slice(1).join(' ');

    // Clear input immediately for better UX
    setRequest('');
    setShowSuggestions(false);

    try {
      // Base64 encode args
      const argsB64 = args ? btoa(args) : '';

      // Send request to backend with operator info
      const response = await fetch(`${getApiUrl()}/api/tasks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          type: reqType,
          args: argsB64 ? [argsB64] : [],
          endpoint_id: selectedEndpoint.id,
          operator_id: currentOperator?.operatorId,
          operator_name: currentOperator?.operatorName,
          operator_avatar: currentOperator?.avatar
        })
      });

      if (!response.ok) {
        console.error('Failed to send request');
      } else {
        // Scroll to bottom when sending new request
        setUserScrolledUp(false);
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error('Error sending request:', error);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setRequest(history[history.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setRequest(history[history.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setRequest('');
      }
    } else if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault();
      setRequest(suggestions[0] + ' ');
      setShowSuggestions(false);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion) => {
    setRequest(suggestion + ' ');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  // Save current session to persistent history before clearing
  // Always saves ALL visible requests (from all operators), not filtered by tab
  const saveToHistory = useCallback(() => {
    if (!endpointId) return;

    // Get only visible (non-cleared) requests to save
    const requestsToSave = serverRequests.filter(req => !clearedRequestIds.has(req.id));
    if (requestsToSave.length === 0) return;

    // Helper to determine correct avatar
    const getOperatorAvatar = (req) => {
      if (req.operator_avatar) return req.operator_avatar;
      const name = (req.operator_name || '').toLowerCase();
      if (name.includes('operator1') || name.includes('op1')) return '1';
      if (name.includes('operator2') || name.includes('op2')) return '2';
      if (name.includes('operator3') || name.includes('op3')) return '3';
      if (name.includes('operator4') || name.includes('op4')) return '4';
      if (name.includes('operator5') || name.includes('op5')) return '5';
      if (req.operator_id === 'op-001') return '1';
      if (req.operator_id === 'op-002') return '2';
      return '1';
    };

    const sessionData = {
      timestamp: new Date().toISOString(),
      endpointId: endpointId,
      endpointHostname: selectedEndpoint?.hostname || endpointId,
      requests: requestsToSave.map(req => {
        let reqText = req.type;
        if (req.args && req.args.length > 0) {
          try {
            const decodedArg = atob(req.args[0]);
            reqText = `${req.type} ${decodedArg}`;
          } catch (e) {
            reqText = `${req.type} ${req.args.join(' ')}`;
          }
        }
        return {
          id: req.id,
          request: reqText,
          type: req.type,
          timestamp: req.created_at,
          operator_id: req.operator_id,
          operator_name: req.operator_name || 'Unknown',
          operator_avatar: getOperatorAvatar(req),
          result: serverResults[req.id]?.text || null
        };
      })
    };

    setPersistentHistory(prev => {
      const newHistory = { ...prev };
      if (!newHistory[endpointId]) {
        newHistory[endpointId] = [];
      }
      newHistory[endpointId].push(sessionData);
      saveHistoryToStorage(newHistory);
      return newHistory;
    });
  }, [endpointId, serverRequests, serverResults, selectedEndpoint?.hostname, clearedRequestIds]);

  // Clear console with confirmation
  const clearConsole = () => {
    setShowClearConfirm(true);
  };

  // Confirm clear - save to history first, then mark requests as cleared
  const confirmClear = () => {
    saveToHistory();
    // Add all current request IDs to the cleared set so they stay hidden
    const currentIds = new Set(serverRequests.map(req => req.id));
    setClearedRequestIds(prev => new Set([...prev, ...currentIds]));
    // Clear local requests (help, etc.)
    localRequestsRef.current = [];
    setShowClearConfirm(false);
  };

  // Cancel clear
  const cancelClear = () => {
    setShowClearConfirm(false);
  };

  // Get history for export (respects current tab filter)
  const getHistoryForExport = useCallback(() => {
    if (!endpointId) return [];

    const endpointHistory = persistentHistory[endpointId] || [];
    let allRequests = [];

    // Add historical requests
    for (const session of endpointHistory) {
      for (const req of session.requests) {
        allRequests.push({
          ...req,
          sessionTimestamp: session.timestamp,
          isHistorical: true
        });
      }
    }

    // Add current session requests
    for (const req of serverRequests) {
      let reqText = req.type;
      if (req.args && req.args.length > 0) {
        try {
          const decodedArg = atob(req.args[0]);
          reqText = `${req.type} ${decodedArg}`;
        } catch (e) {
          reqText = `${req.type} ${req.args.join(' ')}`;
        }
      }
      allRequests.push({
        id: req.id,
        request: reqText,
        type: req.type,
        timestamp: req.created_at,
        operator_id: req.operator_id,
        operator_name: req.operator_name,
        operator_avatar: req.operator_avatar,
        result: serverResults[req.id]?.text || null,
        isHistorical: false
      });
    }

    // Filter by active tab if not 'all'
    if (activeTab !== 'all') {
      allRequests = allRequests.filter(req => req.operator_id === activeTab);
    }

    // Sort by timestamp
    allRequests.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return allRequests;
  }, [endpointId, persistentHistory, serverRequests, serverResults, activeTab]);

  // Get history items grouped by operator for display in modal
  const getHistoryByOperator = useCallback(() => {
    if (!endpointId) return { operators: [], requestsByOperator: {} };

    const endpointHistory = persistentHistory[endpointId] || [];
    const requestsByOperator = {};
    const operatorInfo = {};

    for (const session of endpointHistory) {
      for (const req of session.requests) {
        const opId = req.operator_id || 'unknown';

        if (!requestsByOperator[opId]) {
          requestsByOperator[opId] = [];
          operatorInfo[opId] = {
            id: opId,
            name: req.operator_name || 'Unknown',
            avatar: req.operator_avatar || '1'
          };
        }

        requestsByOperator[opId].push({
          ...req,
          sessionTimestamp: session.timestamp
        });
      }
    }

    // Sort requests within each operator by timestamp descending
    for (const opId of Object.keys(requestsByOperator)) {
      requestsByOperator[opId].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Get sorted list of operators
    const operators = Object.values(operatorInfo).sort((a, b) => a.name.localeCompare(b.name));

    return { operators, requestsByOperator };
  }, [endpointId, persistentHistory]);

  // Get total history count
  const getHistoryCount = useCallback(() => {
    if (!endpointId) return 0;
    const endpointHistory = persistentHistory[endpointId] || [];
    let count = 0;
    for (const session of endpointHistory) {
      count += session.requests.length;
    }
    return count;
  }, [endpointId, persistentHistory]);

  // Get visible requests (excluding cleared ones)
  const visibleRequests = useMemo(() => {
    return serverRequests.filter(req => !clearedRequestIds.has(req.id));
  }, [serverRequests, clearedRequestIds]);

  // Count pending requests (requests without results, excluding cleared)
  const pendingCount = visibleRequests.filter(req => !serverResults[req.id]).length;

  // Get request count for a specific operator (excluding cleared)
  const getOperatorRequestCount = (operatorId) => {
    return visibleRequests.filter(req => req.operator_id === operatorId).length;
  };

  // Get pending count for a specific operator (excluding cleared)
  const getOperatorPendingCount = (operatorId) => {
    return visibleRequests.filter(req => req.operator_id === operatorId && !serverResults[req.id]).length;
  };

  return (
    <div className="request-console">
      <div className="console-header">
        <div className="console-title">
          <span className="title-icon">{Icons.terminal}</span>
          Command Console
        </div>
        <div className="console-actions">
          <select
            className="endpoint-selector"
            value={selectedEndpoint?.id || ''}
            onChange={(e) => {
              const endpoint = endpoints.find(a => a.id === e.target.value);
              setSelectedEndpoint(endpoint);
              setActiveTab('all'); // Reset to All tab when changing endpoint
              setUserScrolledUp(false);
            }}
          >
            <option value="">Select Agent...</option>
            {endpoints.map(endpoint => (
              <option key={endpoint.id} value={endpoint.id}>
                {endpoint.hostname || endpoint.id} ({endpoint.os || 'Unknown'}) - {endpoint.id.substring(0, 8)}
              </option>
            ))}
          </select>
          <button className="btn btn-danger" onClick={clearConsole}>
            Clear
          </button>
          <button className="btn-action" onClick={() => setShowHistoryModal(true)}>
            History
          </button>
          <button className="btn-action" onClick={() => {
            // Export ALL history (historical + current) for the active tab
            const historyData = getHistoryForExport();
            const operatorLabel = activeTab === 'all' ? 'all-operators' : (activeOperators.find(o => o.id === activeTab)?.name || activeTab);

            const logContent = historyData.map(req => {
              const timestamp = new Date(req.timestamp).toLocaleString();
              const prefix = `[${timestamp}] ${req.operator_name || 'Unknown'} $ ${req.request}`;
              const result = req.result ? `\n${req.result}` : '\n[No result]';
              return prefix + result;
            }).join('\n\n' + '='.repeat(60) + '\n\n');

            const header = `TelemetryHub Request History Export
Endpoint: ${selectedEndpoint?.hostname || endpointId}
Operator Filter: ${operatorLabel}
Exported: ${new Date().toLocaleString()}
Total Requests: ${historyData.length}
${'='.repeat(60)}

`;

            const blob = new Blob([header + logContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `telemetryhub-${endpointId || 'console'}-${operatorLabel}-history-${new Date().toISOString().split('T')[0]}.log`;
            a.click();
            URL.revokeObjectURL(url);
          }}>
            <span style={{whiteSpace: 'nowrap'}}>Export Log</span>
          </button>
        </div>
      </div>

      {selectedEndpoint ? (
        <div className="console-body">
          {/* Operator Tabs */}
          <div className="console-tabs">
            <button
              className={`console-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <span className="tab-icon">{Icons.activity}</span>
              <span className="tab-label">All Activity</span>
              <span className="tab-count">{visibleRequests.length}</span>
              {pendingCount > 0 && (
                <span className="tab-pending">{pendingCount} Pending</span>
              )}
            </button>

            {activeOperators.map(op => {
              const isCurrentOp = op.id === currentOperator?.operatorId;
              const reqCount = getOperatorRequestCount(op.id);
              const pendCount = getOperatorPendingCount(op.id);

              const opColor = OPERATOR_COLORS[op.avatar] || '#00ff88';
              return (
                <button
                  key={op.id}
                  className={`console-tab ${activeTab === op.id ? 'active' : ''} ${isCurrentOp ? 'current-operator' : ''}`}
                  onClick={() => setActiveTab(op.id)}
                  style={{
                    '--operator-color': opColor,
                    '--operator-glow': getOperatorGlow(opColor),
                    '--operator-bg': getOperatorBg(opColor)
                  }}
                >
                  <span
                    className="tab-operator-dot"
                    style={{ background: opColor }}
                  ></span>
                  <span className="tab-label" style={{ color: opColor }}>
                    {op.name}
                    {isCurrentOp && <span className="you-badge">YOU</span>}
                  </span>
                  <span className="tab-count">{reqCount}</span>
                  {pendCount > 0 && (
                    <span className="tab-pending">{pendCount} Pending</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="console-info">
            <div className="info-badge">
              <span className="badge-label">Endpoint:</span>
              <span className="badge-value">{selectedEndpoint.hostname || selectedEndpoint.id}</span>
            </div>
            <div className="info-badge">
              <span className="badge-label">OS:</span>
              <span className="badge-value">{selectedEndpoint.os || 'Unknown'}</span>
            </div>
            <div className="info-badge">
              <span className="badge-label">Status:</span>
              <span className="badge-value status-active">{selectedEndpoint.status === 'active' ? 'Active' : selectedEndpoint.status || 'Active'}</span>
            </div>
            <div className="info-badge">
              <span className="badge-label">View:</span>
              <span className="badge-value">
                {activeTab === 'all' ? 'All Operators' : activeOperators.find(o => o.id === activeTab)?.name || 'Unknown'}
              </span>
            </div>
          </div>

          <div className="console-output-wrapper">
            <div
              className="console-output"
              ref={outputRef}
              onScroll={handleScroll}
            >
              {output.length === 0 ? (
                <div className="output-empty">
                  <div className="empty-icon">{Icons.computer}</div>
                  <div className="empty-text">
                    {activeTab === 'all' ? (
                      <>
                        Type A Command Below To Interact With The Agent.
                        <br />Press Tab For Autocomplete, Up/Down Arrows For History.
                        <br /><br />
                        <span className="help-text">
                          Available: Whoami, Hostname, Pwd, Cd, Ls, Env, Sysinfo, Interval, Download, Kill, Clear, Help
                        </span>
                      </>
                    ) : (
                      <>
                        No Requests From This Operator Yet.
                        <br /><br />
                        <span className="collab-hint">
                          Switch To "All Activity" To See Requests From All Operators
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                output.map((line, index) => (
                  <div
                    key={line.id || index}
                    className={`output-line output-${line.type} ${line.isCurrentOperator ? 'own-request' : ''} ${line.hasPendingResult ? 'pending-result' : ''}`}
                    style={{ '--line-operator-color': OPERATOR_COLORS[line.operatorAvatar] || '#00ff88' }}
                  >
                    <span className="output-timestamp">[{line.timestamp}]</span>
                    {line.type === 'request' && (
                      <>
                        <span
                          className="output-operator"
                          style={{
                            borderColor: OPERATOR_COLORS[line.operatorAvatar] || '#00ff88',
                            background: getOperatorBg(OPERATOR_COLORS[line.operatorAvatar]),
                            boxShadow: `0 0 10px ${getOperatorGlow(OPERATOR_COLORS[line.operatorAvatar])}`
                          }}
                        >
                          <span
                            className="operator-dot"
                            style={{ background: OPERATOR_COLORS[line.operatorAvatar] || '#00ff88' }}
                          ></span>
                          <span
                            className="operator-name"
                            style={{ color: OPERATOR_COLORS[line.operatorAvatar] || '#00ff88' }}
                          >{line.operatorName || 'Unknown'}</span>
                        </span>
                        <span className="output-prompt">
                          {endpointId?.substring(0, 8)}@ghostspan:~$
                        </span>
                        <span className="output-text">{line.text}</span>
                        {line.hasPendingResult && (
                          <span className="pending-indicator">{Icons.clock}</span>
                        )}
                      </>
                    )}
                    {line.type === 'result' && (
                      <span className="output-text">{line.text}</span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Scroll to bottom button */}
            {userScrolledUp && output.length > 0 && (
              <button className="scroll-to-bottom" onClick={scrollToBottom}>
                Down arrow - New activity
              </button>
            )}
          </div>

          <div className="console-input-wrapper">
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="suggestion-item"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSubmit} className="console-input-form">
              <span className="input-prompt">
                <span
                  className="operator-indicator"
                  style={{ background: OPERATOR_COLORS[currentOperator?.avatar] || '#00ff88' }}
                ></span>
                {selectedEndpoint.id.substring(0, 8)}@ghostspan:~$
              </span>
              <input
                ref={inputRef}
                type="text"
                className="console-input"
                value={request}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter request..."
                autoFocus
              />
              <button type="submit" className="btn btn-primary">
                Execute
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="console-empty-state">
          <div className="empty-icon">{Icons.target}</div>
          <div className="empty-title">No Agent Selected</div>
          <div className="empty-text">
            Select An Agent From The Dropdown Above To Start Sending Commands.
          </div>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      {showClearConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <span className="modal-icon">{Icons.alert}</span>
              <h3>Clear Console</h3>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to clear the console?</p>
              <p className="modal-hint">Current requests will be saved to history before clearing.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={cancelClear}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmClear}>
                Clear Console
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (() => {
        const { operators: historyOperators, requestsByOperator } = getHistoryByOperator();
        const totalCount = getHistoryCount();

        return (
          <div className="modal-overlay">
            <div className="modal-dialog modal-large">
              <div className="modal-header">
                <span className="modal-icon">{Icons.history}</span>
                <h3>Request History ({totalCount} requests)</h3>
                <button className="modal-close" onClick={() => setShowHistoryModal(false)}>{Icons.x}</button>
              </div>
              <div className="modal-body history-body">
                {totalCount === 0 ? (
                  <div className="history-empty">
                    <div className="empty-icon">{Icons.inbox}</div>
                    <p>No Historical Requests Found.</p>
                    <p className="modal-hint">History Is Saved When You Clear The Console.</p>
                  </div>
                ) : (
                  <div className="history-by-operator">
                    {historyOperators.map(op => {
                      const opRequests = requestsByOperator[op.id] || [];
                      if (opRequests.length === 0) return null;

                      const historyOpColor = OPERATOR_COLORS[op.avatar] || '#00ff88';
                      return (
                        <div key={op.id} className="history-operator-section">
                          <div
                            className="history-operator-header"
                            style={{
                              borderColor: historyOpColor,
                              background: getOperatorBg(historyOpColor),
                              boxShadow: `0 0 10px ${getOperatorGlow(historyOpColor)}`
                            }}
                          >
                            <span
                              className="operator-dot"
                              style={{ background: historyOpColor }}
                            ></span>
                            <span className="history-operator-name" style={{ color: historyOpColor }}>{op.name}</span>
                            <span className="history-operator-count">{opRequests.length} requests</span>
                          </div>
                          <div className="history-list">
                            {opRequests.map((item, index) => (
                              <div key={`${item.id}-${index}`} className="history-item">
                                <div className="history-item-header">
                                  <span className="history-timestamp">
                                    {new Date(item.timestamp).toLocaleString()}
                                  </span>
                                </div>
                                <div className="history-request">
                                  <span className="history-prompt">$</span>
                                  <span className="history-req-text">{item.request}</span>
                                </div>
                                {item.result && (
                                  <div className="history-result">
                                    <pre>{item.result}</pre>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn btn-danger" onClick={() => {
                  // Clear all history for this endpoint
                  if (window.confirm('Are you sure you want to delete all history for this endpoint?')) {
                    setPersistentHistory(prev => {
                      const newHistory = { ...prev };
                      delete newHistory[endpointId];
                      saveHistoryToStorage(newHistory);
                      return newHistory;
                    });
                  }
                }}>
                  Clear History
                </button>
                <button className="btn btn-primary" onClick={() => setShowHistoryModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default RequestConsole;
