// frontend/src/api/config.js - Simplified configuration (No CORS issues)
// Since we're serving React from the same Express server, no CORS configuration needed

// Simple API base URL - same domain as the served React app
const API_BASE_URL = '';  // Empty string means same domain

// Test backend connectivity (optional, mainly for debugging)
const testBackendConnection = async (url = '/api/health') => {
  try {
    console.log(`Testing backend connection to: ${url}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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

// API endpoints - all relative to the same domain
const API_ENDPOINTS = {
  // Health and system
  HEALTH: '/api/health',
  METRICS: '/api/metrics',
  SYSTEM: '/api/system',
  USERS: '/api/users',
  
  // Authentication (simplified)
  AUTH_GOOGLE: '/api/auth/google',
  AUTH_USER: '/api/auth/user',
  AUTH_LOGOUT: '/api/auth/logout',
};

// Helper function to create full endpoint URLs (now just returns the path)
const createEndpoint = (path) => path;

// Get current connection status
const getConnectionStatus = () => ({
  baseUrl: API_BASE_URL,
  status: 'connected', // Always connected since same domain
  endpoints: API_ENDPOINTS
});

// Simple health check function
const healthCheck = async () => {
  return testBackendConnection('/api/health');
};

console.log('🌐 Simplified API Configuration Loaded');
console.log('📡 No CORS issues - serving from same domain');
console.log('🔗 API Base URL:', API_BASE_URL || 'Same domain');

// Export all functions and endpoints
export { 
  API_BASE_URL, 
  API_ENDPOINTS,
  createEndpoint, 
  testBackendConnection,
  getConnectionStatus,
  healthCheck
};

export default {
  API_BASE_URL,
  API_ENDPOINTS,
  createEndpoint,
  testBackendConnection,
  getConnectionStatus,
  healthCheck
};