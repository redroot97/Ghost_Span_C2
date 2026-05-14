/**
 * TelemetryHub - Network Map
 * Interactive network visualization with drag-and-drop, zoom, and pan
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import '../styles/NetworkMap.css';

// SVG Icons
const Icons = {
  network: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="5" r="3"/>
      <circle cx="5" cy="19" r="3"/>
      <circle cx="19" cy="19" r="3"/>
      <line x1="12" y1="8" x2="5" y2="16"/>
      <line x1="12" y1="8" x2="19" y2="16"/>
    </svg>
  ),
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  windows: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
    </svg>
  ),
  linux: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.002c-.06-.135-.12-.266-.184-.335-.064-.066-.166-.2-.298-.2h-.033c-.176.023-.393.2-.602.266-.068.078-.021-.064-.043-.131a.404.404 0 00-.014-.068h.014c.12-.202.096-.266-.074-.4-.233-.135-.646-.266-.978-.336-.332-.066-.603-.133-.687-.266-.085.066-.1.133-.141.2-.034.066-.068.132-.149.132-.141 0-.271-.066-.37-.2-.098-.065-.146-.133-.195-.2-.07.135-.091.2-.14.333-.049.135-.198.135-.283.068-.087-.068-.181-.136-.307-.2-.063-.032-.09-.066-.168-.2v-.004c-.024-.053-.057-.135-.087-.135-.037 0-.077.023-.121.068-.054.045-.107.1-.148.135-.133.066-.195.135-.327.135-.063-.066-.063-.2 0-.333.063-.066.08-.135.127-.2.043-.065.088-.135.073-.2-.015-.133-.1-.266-.184-.4-.084-.066-.166-.132-.248-.132h-.016c-.05 0-.1.015-.152.047-.082.067-.148.067-.249.133-.1.066-.182.135-.312.2-.063.032-.125.068-.167.068-.04 0-.064-.015-.135-.068-.064-.065-.119-.132-.119-.2.005-.066.046-.133.082-.2.036-.066.104-.132.166-.198.063-.066.08-.135.047-.2-.033-.065-.112-.065-.212-.133-.105-.068-.229-.133-.35-.2h-.006c-.106-.066-.18-.133-.22-.2-.058-.066-.09-.132-.127-.2-.037-.065-.063-.132-.152-.132a.147.147 0 00-.044.003c-.037.006-.077.017-.118.068-.05.06-.094.135-.14.2-.046.066-.094.135-.14.135h-.01c-.037 0-.075-.023-.115-.068-.04-.045-.077-.101-.106-.135-.03-.033-.06-.065-.1-.133-.024-.032-.048-.065-.095-.065-.046 0-.113.018-.181.068-.1.067-.161.132-.3.132h-.026c-.067-.005-.124-.065-.147-.132a.304.304 0 01.009-.2c.036-.067.069-.135.102-.2.033-.066.063-.132.049-.2-.014-.067-.063-.067-.152-.132-.09-.066-.21-.133-.348-.2-.137-.066-.26-.133-.35-.2-.09-.065-.13-.132-.164-.198-.07.066-.11.132-.194.2-.051.064-.108.131-.175.197l-.044.046h-.002c-.067.066-.129.065-.185.065h-.022c-.133-.063-.065-.2.049-.334.118-.135.265-.267.336-.467.07-.2.09-.335.068-.468-.022-.133-.1-.266-.182-.4-.123-.133-.225-.265-.212-.398.014-.135.057-.266.175-.398.116-.133.256-.27.358-.403.043-.066.082-.067.115-.2.033-.133.02-.266-.038-.334-.053-.067-.156-.065-.283-.133-.124-.068-.27-.135-.393-.266-.087-.132-.13-.2-.168-.332-.038-.133-.048-.267-.006-.4l.005-.019c.042-.133.127-.265.246-.332h.012c.022-.067.055-.068.1-.135.043-.067.088-.135.11-.267.023-.135.018-.267-.026-.4-.043-.133-.109-.266-.155-.4-.046-.133-.066-.265-.041-.398.025-.135.102-.27.227-.403.182-.196.308-.33.426-.465.117-.133.157-.266.14-.4-.016-.065-.033-.197-.033-.332 0-.066.007-.2.066-.333.059-.135.174-.27.36-.4.186-.133.472-.266.888-.4l.005-.003c.218-.065.437-.132.652-.132h.062a.907.907 0 01.412.135c.124.066.207.132.25.265.045.135.028.2-.05.335-.078.132-.206.265-.36.398-.124.068-.241.135-.328.135h-.052c-.046-.004-.09-.02-.127-.066-.037-.047-.073-.101-.097-.135-.023-.033-.047-.065-.082-.133-.035-.066-.083-.066-.14-.066h-.022c-.127.006-.251.042-.348.133-.097.065-.167.131-.22.265-.054.135-.074.266-.074.4v.02c.012.133.038.2.087.333.05.134.112.267.199.333.063.064.122.065.181.133.058.066.1.132.1.199v.063c-.005.095-.045.183-.115.267-.07.066-.14.135-.223.2a.407.407 0 01-.26.066h-.038c-.095 0-.185-.024-.262-.066-.08-.045-.148-.09-.204-.135a.655.655 0 01-.139-.133c-.024-.033-.048-.066-.073-.133a.507.507 0 01-.036-.132v-.054c.003-.066.023-.133.062-.2.039-.065.088-.132.15-.198.061-.067.106-.135.116-.2.01-.067-.017-.134-.083-.2-.123-.135-.268-.268-.38-.4-.113-.133-.186-.267-.163-.4.024-.135.093-.267.22-.4.126-.132.3-.265.517-.398.28-.199.48-.266.6-.398.12-.135.15-.267.152-.4v-.018c-.007-.068-.017-.135-.033-.2a1.002 1.002 0 00-.074-.2c-.028-.067-.061-.133-.115-.2-.054-.066-.117-.133-.188-.2a3.97 3.97 0 00-.336-.333c-.127-.132-.22-.265-.273-.398-.053-.135-.054-.2-.018-.333a.658.658 0 01.181-.267c.088-.066.19-.133.31-.2.12-.066.25-.132.4-.198.15-.067.304-.135.465-.2l.019-.006c.141-.046.286-.089.433-.132.147-.043.295-.088.447-.116l.092-.016c.099-.01.199-.018.3-.017z"/>
    </svg>
  ),
  apple: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  ),
  computer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="3" width="20" height="14"></rect>
      <line x1="8" y1="21" x2="16" y2="21"></line>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
  ),
};

const NetworkMap = ({ endpoints = [], selectedEndpoint, setSelectedEndpoint, setActiveTab }) => {
  const [selectedNode, setSelectedNode] = useState(null);
  const [viewMode, setViewMode] = useState('network');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggedNode, setDraggedNode] = useState(null);
  const [nodePositions, setNodePositions] = useState({});
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: rect.width || 800, height: rect.height || 600 });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Extract subnet from IP
  const getSubnet = (ip) => {
    if (!ip || ip === 'N/A') return 'Unknown';
    const parts = ip.split('.');
    if (parts.length >= 3) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
    return 'Unknown';
  };

  // Get privilege level
  const getPrivilegeLevel = (endpoint) => {
    if (endpoint.elevated === true) return 'admin';
    if (endpoint.user?.toLowerCase().includes('system')) return 'system';
    if (endpoint.user?.toLowerCase().includes('admin')) return 'admin';
    return 'user';
  };

  // Get privilege color
  const getPrivilegeColor = (level) => {
    switch (level) {
      case 'system': return '#ff0066';
      case 'admin': return '#ff6600';
      case 'user': return '#00ff88';
      default: return '#666666';
    }
  };

  // Get OS info
  const getOSInfo = (os) => {
    if (!os) return { icon: 'computer', name: 'Unknown' };
    const osLower = os.toLowerCase();
    if (osLower.includes('windows')) return { icon: 'windows', name: 'Windows' };
    if (osLower.includes('linux')) return { icon: 'linux', name: 'Linux' };
    if (osLower.includes('darwin') || osLower.includes('mac')) return { icon: 'apple', name: 'macOS' };
    return { icon: 'computer', name: os };
  };

  // Render OS icon in SVG
  const renderOSIcon = (iconName, x = 0, y = 0, size = 16) => {
    if (iconName === 'windows') {
      return (
        <g transform={`translate(${x - size/2}, ${y - size/2})`}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
          </svg>
        </g>
      );
    }
    if (iconName === 'linux') {
      return (
        <g transform={`translate(${x - size/2}, ${y - size/2})`}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/>
          </svg>
        </g>
      );
    }
    if (iconName === 'apple') {
      return (
        <g transform={`translate(${x - size/2}, ${y - size/2})`}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
        </g>
      );
    }
    // Default computer icon
    return (
      <g transform={`translate(${x - size/2}, ${y - size/2})`}>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
      </g>
    );
  };

  // Group endpoints by subnet
  const networkGroups = useMemo(() => {
    const groups = {};
    endpoints.forEach(endpoint => {
      const subnet = getSubnet(endpoint.ip_address);
      if (!groups[subnet]) groups[subnet] = [];
      groups[subnet].push(endpoint);
    });
    return groups;
  }, [endpoints]);

  // Platform stats
  const platformStats = useMemo(() => {
    const stats = { windows: 0, linux: 0, macos: 0, unknown: 0 };
    endpoints.forEach(endpoint => {
      const os = (endpoint.os || '').toLowerCase();
      if (os.includes('windows')) stats.windows++;
      else if (os.includes('linux')) stats.linux++;
      else if (os.includes('darwin') || os.includes('mac')) stats.macos++;
      else stats.unknown++;
    });
    return stats;
  }, [endpoints]);

  // Calculate initial positions based on view mode
  const calculatePositions = useCallback(() => {
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const positions = {};

    // Collector Server position
    positions['collector-server'] = { x: centerX, y: centerY };

    if (viewMode === 'network') {
      // Network view - group by subnet
      const subnets = Object.keys(networkGroups);
      subnets.forEach((subnet, subnetIndex) => {
        const subnetEndpoints = networkGroups[subnet];
        const subnetAngle = (2 * Math.PI * subnetIndex) / Math.max(subnets.length, 1) - Math.PI / 2;
        const subnetRadius = Math.min(dimensions.width, dimensions.height) * 0.3;
        const subnetCenterX = centerX + Math.cos(subnetAngle) * subnetRadius;
        const subnetCenterY = centerY + Math.sin(subnetAngle) * subnetRadius;

        subnetEndpoints.forEach((endpoint, endpointIndex) => {
          const endpointAngle = (2 * Math.PI * endpointIndex) / Math.max(subnetEndpoints.length, 1);
          const endpointRadius = 50 + subnetEndpoints.length * 15;
          positions[endpoint.id] = {
            x: subnetEndpoints.length === 1 ? subnetCenterX : subnetCenterX + Math.cos(endpointAngle) * endpointRadius,
            y: subnetEndpoints.length === 1 ? subnetCenterY : subnetCenterY + Math.sin(endpointAngle) * endpointRadius
          };
        });
      });
    } else if (viewMode === 'hierarchy') {
      // Hierarchy view - privilege-based levels
      const levels = { system: [], admin: [], user: [] };
      endpoints.forEach(endpoint => {
        const level = getPrivilegeLevel(endpoint);
        levels[level].push(endpoint);
      });

      let yOffset = 120;
      ['system', 'admin', 'user'].forEach(level => {
        const levelEndpoints = levels[level];
        levelEndpoints.forEach((endpoint, idx) => {
          const xSpacing = dimensions.width / (levelEndpoints.length + 1);
          positions[endpoint.id] = {
            x: xSpacing * (idx + 1),
            y: yOffset
          };
        });
        if (levelEndpoints.length > 0) yOffset += 150;
      });

      positions['collector-server'] = { x: centerX, y: dimensions.height - 80 };
    } else if (viewMode === 'list') {
      // List view - simple grid
      const cols = Math.ceil(Math.sqrt(endpoints.length));
      endpoints.forEach((endpoint, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        positions[endpoint.id] = {
          x: 150 + col * 120,
          y: 100 + row * 120
        };
      });
      positions['collector-server'] = { x: dimensions.width - 100, y: dimensions.height / 2 };
    }

    return positions;
  }, [endpoints, networkGroups, viewMode, dimensions]);

  // Initialize positions when endpoints or view mode changes
  useEffect(() => {
    setNodePositions(calculatePositions());
  }, [calculatePositions]);

  // Get current position for a node
  const getNodePosition = (id) => {
    return nodePositions[id] || { x: dimensions.width / 2, y: dimensions.height / 2 };
  };

  // Mouse handlers for panning
  const handleMouseDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === 'rect') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && !draggedNode) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (draggedNode) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const x = (e.clientX - svgRect.left - pan.x) / zoom;
      const y = (e.clientY - svgRect.top - pan.y) / zoom;
      setNodePositions(prev => ({ ...prev, [draggedNode]: { x, y } }));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDraggedNode(null);
  };

  // Node drag handlers
  const handleNodeMouseDown = (e, nodeId) => {
    e.stopPropagation();
    setDraggedNode(nodeId);
  };

  // Zoom with scroll
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.3, Math.min(3, prev + delta)));
  };

  // Stats
  const stats = useMemo(() => {
    const adminCount = endpoints.filter(a => getPrivilegeLevel(a) === 'admin').length;
    const systemCount = endpoints.filter(a => getPrivilegeLevel(a) === 'system').length;
    const userCount = endpoints.filter(a => getPrivilegeLevel(a) === 'user').length;
    const activeCount = endpoints.filter(a => a.status === 'active').length;
    return { adminCount, systemCount, userCount, activeCount };
  }, [endpoints]);

  // Build nodes array
  const nodes = useMemo(() => {
    const result = [{
      id: 'collector-server',
      type: 'server',
      label: 'Collector',
      color: '#00ffff'
    }];

    endpoints.forEach(endpoint => {
      const privilege = getPrivilegeLevel(endpoint);
      result.push({
        id: endpoint.id,
        type: 'endpoint',
        endpoint,
        subnet: getSubnet(endpoint.ip_address),
        privilege,
        color: getPrivilegeColor(privilege),
        status: endpoint.status || 'active',
        label: endpoint.hostname || endpoint.id.substring(0, 8)
      });
    });

    return result;
  }, [endpoints]);

  // Build connections
  const connections = useMemo(() => {
    const serverPos = getNodePosition('collector-server');
    return nodes
      .filter(n => n.type === 'endpoint')
      .map(endpoint => ({
        from: serverPos,
        to: getNodePosition(endpoint.id),
        status: endpoint.status
      }));
  }, [nodes, nodePositions]);

  return (
    <div className="network-map">
      <div className="page-header">
        <h1 className="page-title">
          <span className="title-icon">{Icons.network}</span>
          Graph View
        </h1>
        <div className="page-actions">
          <select
            className="view-selector filter-select"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="network">Network View</option>
            <option value="hierarchy">Hierarchy View</option>
            <option value="list">Grid View</option>
          </select>
          <div className="zoom-controls">
            <button className="btn-zoom" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}>−</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button className="btn-zoom" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>+</button>
          </div>
          <button className="btn-reset" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setNodePositions(calculatePositions()); }}>
            {Icons.refresh}
            <span>Reset View</span>
          </button>
        </div>
      </div>

      <div className="map-content">
        <div
          className="map-canvas"
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {endpoints.length === 0 ? (
            <div className="canvas-empty">
              <div className="empty-icon">{Icons.network}</div>
              <div className="empty-title">No Agents Connected</div>
              <div className="empty-text">Deploy Agents To See Network Visualization</div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,255,136,0.05)" strokeWidth="1"/>
                </pattern>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>

              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />

                {/* Subnet grouping circles (network view only) */}
                {viewMode === 'network' && Object.keys(networkGroups).map(subnet => {
                  const subnetNodes = nodes.filter(n => n.subnet === subnet);
                  if (subnetNodes.length === 0) return null;

                  const positions = subnetNodes.map(n => getNodePosition(n.id));
                  const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length;
                  const avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length;
                  const radius = Math.max(80, subnetNodes.length * 35);

                  return (
                    <g key={subnet}>
                      <circle
                        cx={avgX} cy={avgY} r={radius}
                        fill="rgba(0,255,136,0.02)"
                        stroke="rgba(0,255,136,0.15)"
                        strokeWidth="1"
                        strokeDasharray="8,4"
                      />
                      <text x={avgX} y={avgY - radius - 8} textAnchor="middle" fill="#00ff88" fontSize="10" fontFamily="Roboto Mono">
                        {subnet}
                      </text>
                    </g>
                  );
                })}

                {/* Connection lines */}
                {connections.map((conn, idx) => (
                  <line
                    key={idx}
                    x1={getNodePosition('collector-server').x}
                    y1={getNodePosition('collector-server').y}
                    x2={conn.to.x}
                    y2={conn.to.y}
                    stroke={conn.status === 'active' ? 'rgba(0,255,136,0.3)' : 'rgba(255,0,0,0.2)'}
                    strokeWidth="1.5"
                    strokeDasharray={conn.status === 'active' ? '0' : '5,5'}
                  />
                ))}

                {/* Collector Server */}
                {(() => {
                  const pos = getNodePosition('collector-server');
                  return (
                    <g
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onMouseDown={(e) => handleNodeMouseDown(e, 'collector-server')}
                      style={{ cursor: 'move' }}
                      className="network-node"
                    >
                      <circle r="40" fill="rgba(0,255,255,0.1)" stroke="#00ffff" strokeWidth="2" filter="url(#glow)" />
                      <text textAnchor="middle" dy="8" fontSize="28">🖥️</text>
                      <text textAnchor="middle" dy="60" fill="#00ffff" fontSize="11" fontWeight="bold" fontFamily="Rajdhani">
                        COLLECTOR
                      </text>
                    </g>
                  );
                })()}

                {/* Endpoint nodes */}
                {nodes.filter(n => n.type === 'endpoint').map(node => {
                  const pos = getNodePosition(node.id);
                  const osInfo = getOSInfo(node.endpoint?.os);
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      onClick={() => { setSelectedNode(node); setSelectedEndpoint?.(node.endpoint); }}
                      style={{ cursor: 'move' }}
                      className={`network-node ${selectedNode?.id === node.id ? 'selected' : ''}`}
                    >
                      {/* Outer ring - privilege indicator */}
                      <circle r="30" fill="transparent" stroke={node.color} strokeWidth="3" opacity={node.status === 'active' ? 0.8 : 0.3} />
                      {/* Inner circle */}
                      <circle r="25" fill={node.status === 'active' ? 'rgba(10,10,20,0.9)' : 'rgba(40,40,40,0.9)'} stroke={node.color} strokeWidth="1.5" />
                      {/* OS Icon */}
                      <g fill={node.status === 'active' ? '#00ff88' : '#666'} opacity={node.status === 'active' ? 1 : 0.5}>
                        {renderOSIcon(osInfo.icon, 0, 0, 20)}
                      </g>
                      {/* Label */}
                      <text textAnchor="middle" dy="48" fill={node.status === 'active' ? '#fff' : '#666'} fontSize="9" fontFamily="JetBrains Mono">
                        {node.label}
                      </text>
                      {/* Privilege badge */}
                      <g transform="translate(20, -20)">
                        <circle r="9" fill={node.color} />
                        <text textAnchor="middle" dy="3" fontSize="8" fill="#000" fontWeight="bold">
                          {node.privilege === 'system' ? 'S' : node.privilege === 'admin' ? 'A' : 'U'}
                        </text>
                      </g>
                      {/* Status dot */}
                      <circle cx="-20" cy="-20" r="6" fill={node.status === 'active' ? '#00ff88' : '#ff3333'} />
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>

        <div className="map-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">Legend</h3>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-node" style={{ background: '#00ffff' }}></div>
                <span className="legend-label">C2 Server</span>
              </div>
              <div className="legend-item">
                <div className="legend-node" style={{ background: '#ff0066' }}></div>
                <span className="legend-label">SYSTEM Privilege</span>
              </div>
              <div className="legend-item">
                <div className="legend-node" style={{ background: '#ff6600' }}></div>
                <span className="legend-label">Admin Privilege</span>
              </div>
              <div className="legend-item">
                <div className="legend-node" style={{ background: '#00ff88' }}></div>
                <span className="legend-label">User Privilege</span>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Platforms</h3>
            <div className="platform-stats">
              <div className="platform-item">
                <span className="platform-icon">{Icons.windows}</span>
                <span className="platform-name">Windows</span>
                <span className="platform-count">{platformStats.windows}</span>
              </div>
              <div className="platform-item">
                <span className="platform-icon">{Icons.linux}</span>
                <span className="platform-name">Linux</span>
                <span className="platform-count">{platformStats.linux}</span>
              </div>
              <div className="platform-item">
                <span className="platform-icon">{Icons.apple}</span>
                <span className="platform-name">macOS</span>
                <span className="platform-count">{platformStats.macos}</span>
              </div>
              {platformStats.unknown > 0 && (
                <div className="platform-item">
                  <span className="platform-icon">{Icons.computer}</span>
                  <span className="platform-name">Unknown</span>
                  <span className="platform-count">{platformStats.unknown}</span>
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Network Stats</h3>
            <div className="stats-grid">
              <div className="stat-box">
                <div className="stat-value">{endpoints.length}</div>
                <div className="stat-label">Endpoints</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{stats.activeCount}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{Object.keys(networkGroups).length}</div>
                <div className="stat-label">Subnets</div>
              </div>
              <div className="stat-box">
                <div className="stat-value">{stats.adminCount + stats.systemCount}</div>
                <div className="stat-label">Elevated</div>
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Privileges</h3>
            <div className="privilege-bars">
              <div className="priv-bar">
                <div className="priv-label">SYSTEM</div>
                <div className="priv-track">
                  <div className="priv-fill system" style={{ width: `${endpoints.length ? (stats.systemCount / endpoints.length) * 100 : 0}%` }}></div>
                </div>
                <div className="priv-count">{stats.systemCount}</div>
              </div>
              <div className="priv-bar">
                <div className="priv-label">Admin</div>
                <div className="priv-track">
                  <div className="priv-fill admin" style={{ width: `${endpoints.length ? (stats.adminCount / endpoints.length) * 100 : 0}%` }}></div>
                </div>
                <div className="priv-count">{stats.adminCount}</div>
              </div>
              <div className="priv-bar">
                <div className="priv-label">User</div>
                <div className="priv-track">
                  <div className="priv-fill user" style={{ width: `${endpoints.length ? (stats.userCount / endpoints.length) * 100 : 0}%` }}></div>
                </div>
                <div className="priv-count">{stats.userCount}</div>
              </div>
            </div>
          </div>

          {selectedNode && selectedNode.type === 'endpoint' && (
            <div className="sidebar-section">
              <h3 className="sidebar-title">Selected Endpoint</h3>
              <div className="node-details">
                <div className="detail-row">
                  <span className="detail-label">ID</span>
                  <span className="detail-value mono">{selectedNode.endpoint?.id}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Hostname</span>
                  <span className="detail-value">{selectedNode.endpoint?.hostname || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">IP</span>
                  <span className="detail-value mono">{selectedNode.endpoint?.ip_address || 'N/A'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Subnet</span>
                  <span className="detail-value mono">{selectedNode.subnet}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Privilege</span>
                  <span className={`detail-value priv-${selectedNode.privilege}`}>
                    {selectedNode.privilege.toUpperCase()}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">OS</span>
                  <span className="detail-value">{selectedNode.endpoint?.os || 'Unknown'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">User</span>
                  <span className="detail-value">{selectedNode.endpoint?.user || 'N/A'}</span>
                </div>
                <button className="btn-console" onClick={() => setActiveTab?.('console')}>
                  Open Console
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkMap;
