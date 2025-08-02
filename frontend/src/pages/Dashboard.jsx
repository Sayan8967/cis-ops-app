// frontend/src/pages/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar.jsx';
import { useWsContext } from '../context/WebsocketContext.jsx';
import MetricCard from '../components/MetricCard.jsx';
import UserManagement from '../components/UserManagement.jsx';
import { getBestBackendUrl, testBackendConnection } from '../api/config.js';

export default function Dashboard() {
  const { metrics, connectionStatus, reconnect } = useWsContext();
  const [activeTab, setActiveTab] = useState('metrics');
  const [backendHealth, setBackendHealth] = useState(null);
  const [healthCheckLoading, setHealthCheckLoading] = useState(false);

  // Check backend health
  const checkBackendHealth = async () => {
    setHealthCheckLoading(true);
    try {
      const backendUrl = await getBestBackendUrl();
      const response = await fetch(`${backendUrl}/api/health`, {
        method: 'GET',
        timeout: 5000,
      });
      
      if (response.ok) {
        const healthData = await response.json();
        setBackendHealth(healthData);
      } else {
        setBackendHealth({ status: 'unhealthy', error: `HTTP ${response.status}` });
      }
    } catch (error) {
      setBackendHealth({ status: 'unreachable', error: error.message });
    } finally {
      setHealthCheckLoading(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
    // Check health every 30 seconds
    const healthInterval = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(healthInterval);
  }, []);

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  const getStatusColor = (value, type) => {
    if (!value) return 'text-gray-400';
    switch (type) {
      case 'cpu':
        return value > 80 ? 'text-red-600' : value > 60 ? 'text-yellow-600' : 'text-green-600';
      case 'memory':
        return value > 85 ? 'text-red-600' : value > 70 ? 'text-yellow-600' : 'text-green-600';
      case 'disk':
        return value > 90 ? 'text-red-600' : value > 75 ? 'text-yellow-600' : 'text-green-600';
      default:
        return 'text-blue-600';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'polling': return 'text-blue-600 bg-blue-100';
      case 'connecting': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-red-600 bg-red-100';
    }
  };

  const getSystemStatusText = () => {
    if (!backendHealth) return 'CHECKING...';
    if (backendHealth.status === 'healthy') return 'OPERATIONAL';
    if (backendHealth.status === 'degraded') return 'DEGRADED';
    return 'OFFLINE';
  };

  const getSystemStatusColor = () => {
    if (!backendHealth) return 'text-yellow-400';
    if (backendHealth.status === 'healthy') return 'text-green-400';
    if (backendHealth.status === 'degraded') return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <Navbar />
      
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">System Operations Dashboard</h1>
              <p className="text-blue-200 text-lg">Real-time monitoring and management center</p>
            </div>
            <div className="hidden md:block space-y-2">
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="text-sm text-blue-200">System Status</div>
                <div className={`text-2xl font-bold ${getSystemStatusColor()}`}>
                  {getSystemStatusText()}
                </div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                <div className="text-xs text-blue-200">Connection</div>
                <div className={`text-sm font-medium capitalize ${
                  connectionStatus === 'connected' ? 'text-green-300' :
                  connectionStatus === 'polling' ? 'text-blue-300' :
                  'text-red-300'
                }`}>
                  {connectionStatus}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Alert */}
      {(connectionStatus === 'failed' || connectionStatus === 'error') && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800">Connection Issues Detected</h3>
                <p className="text-sm text-red-700 mt-1">
                  Unable to connect to the backend service. Some features may not work properly.
                </p>
              </div>
              <button
                onClick={reconnect}
                className="ml-4 bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded text-sm font-medium"
              >
                Retry Connection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('metrics')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'metrics'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              System Metrics
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              User Management
            </button>
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'metrics' && (
          <div className="space-y-8">
            {/* Connection Status Bar */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${getConnectionStatusColor()}`}>
                    Connection: {connectionStatus}
                  </div>
                  {backendHealth && (
                    <div className="text-sm text-gray-600">
                      Backend Health: {backendHealth.status}
                      {backendHealth.uptime && (
                        <span className="ml-2">
                          (Uptime: {formatUptime(backendHealth.uptime)})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={checkBackendHealth}
                    disabled={healthCheckLoading}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:text-gray-400"
                  >
                    {healthCheckLoading ? 'Checking...' : 'Check Health'}
                  </button>
                  <button
                    onClick={reconnect}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Reconnect
                  </button>
                </div>
              </div>
            </div>

            {/* Primary Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-blue-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">CPU Usage</p>
                    <p className={`text-3xl font-bold ${getStatusColor(metrics.cpu, 'cpu')}`}>
                      {metrics.cpu || '--'}%
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-full">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-green-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Memory Usage</p>
                    <p className={`text-3xl font-bold ${getStatusColor(metrics.memory, 'memory')}`}>
                      {metrics.memory || '--'}%
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-full">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-yellow-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Disk Usage</p>
                    <p className={`text-3xl font-bold ${getStatusColor(metrics.disk, 'disk')}`}>
                      {metrics.disk || '--'}%
                    </p>
                  </div>
                  <div className="p-3 bg-yellow-100 rounded-full">
                    <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6 border-l-4 border-purple-500">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Network</p>
                    <p className="text-3xl font-bold text-purple-600">
                      {metrics.network || '--'} Mbps
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-full">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* System Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Hostname:</span>
                    <span className="font-medium">{metrics.hostname || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Platform:</span>
                    <span className="font-medium">{metrics.platform || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">CPU Cores:</span>
                    <span className="font-medium">{metrics.cpuCount || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Memory:</span>
                    <span className="font-medium">{metrics.totalMemory || 'N/A'} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Free Memory:</span>
                    <span className="font-medium">{metrics.freeMemory || 'N/A'} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Uptime:</span>
                    <span className="font-medium">{metrics.uptime ? formatUptime(metrics.uptime) : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Data Source:</span>
                    <span className="font-medium capitalize">{metrics.source || connectionStatus}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${
                        backendHealth?.status === 'healthy' ? 'bg-green-500' : 
                        backendHealth?.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <span className="font-medium">System Health</span>
                    </div>
                    <span className={`font-semibold ${
                      backendHealth?.status === 'healthy' ? 'text-green-600' : 
                      backendHealth?.status === 'degraded' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {backendHealth?.status || 'Unknown'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${
                        connectionStatus === 'connected' ? 'bg-blue-500' : 
                        connectionStatus === 'polling' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <span className="font-medium">Connection</span>
                    </div>
                    <span className={`font-semibold capitalize ${
                      connectionStatus === 'connected' ? 'text-blue-600' : 
                      connectionStatus === 'polling' ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {connectionStatus}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div className="flex items-center">
                      <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                      <span className="font-medium">Alerts</span>
                    </div>
                    <span className="text-yellow-600 font-semibold">0 Active</span>
                  </div>
                  
                  <div className="text-xs text-gray-500 text-center mt-4">
                    Last updated: {metrics.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'Never'}
                  </div>
                </div>
              </div>
            </div>

            {/* Kubernetes Information (if available) */}
            {metrics.kubernetes && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Kubernetes Cluster Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {metrics.kubernetes.cluster?.pods?.total || 0}
                    </div>
                    <div className="text-sm text-gray-600">Total Pods</div>
                    <div className="text-xs text-green-600 mt-1">
                      {metrics.kubernetes.cluster?.pods?.running || 0} Running
                    </div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {metrics.kubernetes.cluster?.nodes?.ready || 0}
                    </div>
                    <div className="text-sm text-gray-600">Ready Nodes</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {metrics.kubernetes.cluster?.nodes?.total || 0} Total
                    </div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {metrics.kubernetes.cluster?.services || 0}
                    </div>
                    <div className="text-sm text-gray-600">Services</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Namespace: {metrics.kubernetes.cluster?.namespace || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && <UserManagement />}
      </div>
    </div>
  );
}