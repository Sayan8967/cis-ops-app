// frontend/src/pages/Dashboard.jsx - Simplified Dashboard Page
import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../context/AuthContext.jsx';
import { API_ENDPOINTS } from '../api/config.js';

export default function Dashboard() {
  const { user, logout, loading } = useAuthContext();
  const [metrics, setMetrics] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  // Fetch dashboard data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        setError(null);

        // Prepare headers with user email for backend auth
        const headers = { 'Content-Type': 'application/json' };
        if (user?.email) {
          headers['X-User-Email'] = user.email;
        }

        // Fetch metrics
        const metricsResponse = await fetch(API_ENDPOINTS.METRICS, { headers });
        if (metricsResponse.ok) {
          const metricsData = await metricsResponse.json();
          setMetrics(metricsData.success ? (metricsData.metrics || metricsData) : metricsData);
        }

        // Fetch system info
        const systemResponse = await fetch(API_ENDPOINTS.SYSTEM, { headers });
        if (systemResponse.ok) {
          const systemData = await systemResponse.json();
          setSystemInfo(systemData.success ? (systemData.system || systemData) : systemData);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setError('Failed to load dashboard data');
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
    
    // Refresh data every 10 seconds
    const interval = setInterval(fetchData, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
  };

  // Helper functions
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Please log in to access the dashboard</p>
          <button
            onClick={() => window.location.href = '/login'}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">System Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user.username || user.email}</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="text-red-400 mr-2">⚠️</div>
              <div className="text-red-700">{error}</div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loadingData && !metrics && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading system data...</p>
          </div>
        )}

        {/* Metrics Grid */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {/* CPU Usage */}
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

            {/* Memory Usage */}
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

            {/* Disk Usage */}
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

            {/* Network */}
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
        )}

        {/* System Information */}
        {(metrics || systemInfo) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* System Details */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Information</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Hostname:</span>
                  <span className="font-medium">{systemInfo?.hostname || metrics?.hostname || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Platform:</span>
                  <span className="font-medium">{systemInfo?.platform || metrics?.platform || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">CPU Cores:</span>
                  <span className="font-medium">{systemInfo?.cpuCount || metrics?.cpuCount || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Memory:</span>
                  <span className="font-medium">{systemInfo?.totalMemory || metrics?.totalMemory || 'N/A'} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Free Memory:</span>
                  <span className="font-medium">{systemInfo?.freeMemory || metrics?.freeMemory || 'N/A'} GB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Uptime:</span>
                  <span className="font-medium">
                    {formatUptime(systemInfo?.uptime || metrics?.uptime)}
                  </span>
                </div>
              </div>
            </div>

            {/* System Status */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                    <span className="font-medium">System Health</span>
                  </div>
                  <span className="text-green-600 font-semibold">Operational</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                    <span className="font-medium">Connection</span>
                  </div>
                  <span className="text-blue-600 font-semibold">Active</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                    <span className="font-medium">Alerts</span>
                  </div>
                  <span className="text-yellow-600 font-semibold">0 Active</span>
                </div>
                
                <div className="text-xs text-gray-500 text-center mt-4">
                  Last updated: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'Just now'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}