// frontend/src/api/config.js - Fixed for Kubernetes deployment
// API endpoints - relative to current domain for Kubernetes
const API_ENDPOINTS = {
  // Health and system
  HEALTH: '/api/health',
  METRICS: '/api/metrics',
  SYSTEM: '/api/system',
  USERS: '/api/users',
  
  // Authentication
  AUTH_GOOGLE: '/api/auth/google',
  AUTH_USER: '/api/auth/user',
  AUTH_LOGOUT: '/api/auth/logout',
};

// Helper to probe possible backend base URLs (for websockets or debug)
export const getBestBackendUrl = async () => {
  const candidates = [
    window.location.origin,
    `http://${window.location.hostname}:30400`,
    `http://${window.location.hostname}:4000`,
  ];
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/api/health`, { method: 'GET' });
      if (res.ok) return { url: base, status: 'ok' };
    } catch (_) {}
  }
  return { url: window.location.origin, status: 'fallback' };
};

// Test backend connectivity
const testBackendConnection = async (url = '/api/health') => {
  try {
    console.log(`Testing backend connection to: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend connection successful:', {
        url,
        status: response.status,
        health: data.status
      });
      return { success: true, data, status: response.status };
    } else {
      console.warn('⚠️ Backend returned non-OK status:', {
        url,
        status: response.status,
        statusText: response.statusText
      });
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}`, status: response.status };
    }
  } catch (error) {
    console.warn('❌ Backend connection failed:', { url, error: error.message });
    return { success: false, error: error.message, networkError: true };
  }
};

// Simple health check function
const healthCheck = async () => {
  return testBackendConnection('/api/health');
};

// Get current connection status
const getConnectionStatus = () => ({
  baseUrl: window.location.origin,
  status: 'ready',
  endpoints: API_ENDPOINTS
});

console.log('🌐 API Configuration Loaded for Kubernetes');
console.log('📡 Base URL:', window.location.origin);
console.log('🔗 API Endpoints:', API_ENDPOINTS);

// Export all functions and endpoints
export { 
  API_ENDPOINTS,
  testBackendConnection,
  getConnectionStatus,
  healthCheck
};

export default {
  API_ENDPOINTS,
  testBackendConnection,
  getConnectionStatus,
  healthCheck
};