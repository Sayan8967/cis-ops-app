// frontend/src/pages/LoginPage.jsx - FIXED redirect logic
import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../context/AuthContext.jsx';
import authService from '../services/authService.js';

export default function LoginPage() {
  const { login, loading, error, clearError, user } = useAuthContext();
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [backendHealth, setBackendHealth] = useState(null);

  // Check backend connectivity on component mount
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        setConnectionStatus('checking');
        const health = await authService.healthCheck();
        
        if (health.healthy) {
          setConnectionStatus('connected');
          setBackendHealth(health.data);
        } else {
          setConnectionStatus('error');
          console.error('Backend health check failed:', health.error);
        }
      } catch (error) {
        setConnectionStatus('error');
        console.error('Backend connection failed:', error);
      }
    };

    checkBackendHealth();
    
    // Check every 30 seconds
    const interval = setInterval(checkBackendHealth, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // REMOVED: Auto-redirect logic from here
  // The redirect is now handled by PublicRoute in App.jsx
  // This prevents the infinite loading issue

  const handleGoogleLogin = () => {
    clearError();
    login();
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-400';
      case 'checking': return 'bg-yellow-400';
      case 'error': return 'bg-red-400';
      default: return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'All Systems Operational';
      case 'checking': return 'Checking System Status...';
      case 'error': return 'Backend Connection Issues';
      default: return 'Unknown Status';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 via-blue-800/90 to-indigo-900/90">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='7' cy='7' r='7'/%3E%3Ccircle cx='53' cy='7' r='7'/%3E%3Ccircle cx='7' cy='53' r='7'/%3E%3Ccircle cx='53' cy='53' r='7'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}
        ></div>
      </div>

      <div className="relative max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="bg-white p-4 rounded-2xl shadow-xl">
              <svg className="w-12 h-12 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">CIS Operations</h1>
          <p className="text-blue-200 text-lg mb-2">System Management Portal</p>
          <p className="text-blue-300 text-sm">Secure access to your operations dashboard</p>
        </div>

        {/* Connection Status Alert */}
        {connectionStatus === 'error' && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium">Backend Connection Issue</p>
                <p className="text-sm">Cannot connect to the authentication server. Please check if the backend is running.</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">Login Failed</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
              <button
                onClick={clearError}
                className="text-red-500 hover:text-red-700 ml-4"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
            <p className="text-gray-600">Sign in to access your dashboard</p>
          </div>

          {/* Login Form */}
          <div className="space-y-6">
            <div className="flex justify-center">
              <button
                onClick={handleGoogleLogin}
                disabled={loading || connectionStatus === 'error'}
                className={`
                  flex items-center justify-center space-x-3 px-6 py-3 rounded-lg font-medium transition-all duration-200
                  ${loading || connectionStatus === 'error' 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:shadow-md'
                  }
                `}
                style={{ minWidth: '280px' }}
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Secure Enterprise Login</span>
              </div>
            </div>

            {/* Security Features */}
            <div className="grid grid-cols-1 gap-3 text-sm">
              <div className="flex items-center text-gray-600">
                <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Multi-factor authentication</span>
              </div>
              <div className="flex items-center text-gray-600">
                <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>End-to-end encryption</span>
              </div>
              <div className="flex items-center text-gray-600">
                <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Role-based access control</span>
              </div>
            </div>

            {/* Backend Information */}
            {connectionStatus === 'connected' && backendHealth && (
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-sm text-green-800">
                  <p className="font-medium">Backend Status: Operational</p>
                  <p className="text-xs mt-1">Version {backendHealth.version} • Uptime: {Math.round(backendHealth.uptime)}s</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Status */}
        <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-xl p-4">
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${getStatusColor()} ${connectionStatus === 'checking' ? 'animate-pulse' : ''}`}></div>
              <span className="text-sm font-medium">System Status</span>
            </div>
            <span className={`text-sm ${connectionStatus === 'connected' ? 'text-green-300' : connectionStatus === 'error' ? 'text-red-300' : 'text-yellow-300'}`}>
              {getStatusText()}
            </span>
          </div>
          
          {/* Troubleshooting Tips */}
          {connectionStatus === 'error' && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <p className="text-xs text-blue-200 mb-2">Troubleshooting tips:</p>
              <ul className="text-xs text-blue-300 space-y-1">
                <li>• Check if the backend server is running</li>
                <li>• Verify network connectivity</li>
                <li>• Ensure ports 4000 and 30400 are accessible</li>
                <li>• Check browser console for detailed errors</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-blue-200 text-sm">
            Protected by enterprise-grade security
          </p>
          <div className="flex justify-center items-center mt-4 space-x-6 text-xs text-blue-300">
            <span>Privacy Policy</span>
            <span>•</span>
            <span>Terms of Service</span>
            <span>•</span>
            <span>Support</span>
          </div>
          
          {/* Debug Information */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-4 text-xs text-blue-400">
              <p>Debug: Connection Status: {connectionStatus}</p>
              <p>User: {user ? user.email : 'Not logged in'}</p>
              <p>Loading: {loading.toString()}</p>
              {authService.getApiBaseUrl() && (
                <p>Backend URL: {authService.getApiBaseUrl()}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Additional Background Elements */}
      <div className="absolute top-10 right-10 w-20 h-20 bg-blue-400/10 rounded-full blur-xl"></div>
      <div className="absolute bottom-10 left-10 w-32 h-32 bg-indigo-400/10 rounded-full blur-xl"></div>
      <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-purple-400/10 rounded-full blur-xl"></div>
    </div>
  );
}