// frontend/src/api/config.js - Updated to support runtime environment variables
// Enhanced API configuration with runtime environment support

const getRuntimeConfig = () => {
  // Check if runtime config is available (injected by Docker container)
  if (typeof window !== 'undefined' && window.RUNTIME_CONFIG) {
    return window.RUNTIME_CONFIG;
  }
  return {};
};

const getBackendUrl = () => {
  const runtimeConfig = getRuntimeConfig();
  
  // Priority order:
  // 1. Runtime environment (Docker injection)
  // 2. Build-time environment variable
  // 3. Dynamic detection based on current location
  
  const runtimeBackendUrl = runtimeConfig.REACT_APP_BACKEND_URL;
  const buildTimeBackendUrl = process.env.REACT_APP_BACKEND_URL;
  
  if (runtimeBackendUrl && runtimeBackendUrl !== 'undefined') {
    console.log('Using runtime REACT_APP_BACKEND_URL:', runtimeBackendUrl);
    return runtimeBackendUrl;
  }
  
  if (buildTimeBackendUrl && buildTimeBackendUrl !== 'undefined') {
    console.log('Using build-time REACT_APP_BACKEND_URL:', buildTimeBackendUrl);
    return buildTimeBackendUrl;
  }
  
  // Dynamic detection
  if (process.env.NODE_ENV === 'production') {
    const hostname = window.location.hostname;
    const dynamicUrl = `http://${hostname}:30400`;
    console.log('Using dynamic backend URL:', dynamicUrl);
    return dynamicUrl;
  }
  
  // Development fallback
  const devUrl = 'http://localhost:4000';
  console.log('Using development backend URL:', devUrl);
  return devUrl;
};

// Test backend connectivity with enhanced error handling
const testBackendConnection = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
    
    console.log(`Testing backend connection to: ${url}`);
    
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      // Add credentials if needed for CORS
      credentials: 'omit',
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Backend connection successful:', {
        url,
        status: response.status,
        health: data.status,
        uptime: data.uptime
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
    if (error.name === 'AbortError') {
      console.warn('⏱️ Backend connection timeout:', url);
      return { success: false, error: 'Connection timeout', timeout: true };
    } else {
      console.warn('❌ Backend connection failed:', { url, error: error.message });
      return { success: false, error: error.message, networkError: true };
    }
  }
};

// Get the best available backend URL with comprehensive fallback
const getBestBackendUrl = async () => {
  const primaryUrl = getBackendUrl();
  
  // Test primary URL first
  const primaryResult = await testBackendConnection(primaryUrl);
  if (primaryResult.success) {
    return { url: primaryUrl, result: primaryResult };
  }
  
  console.log('Primary URL failed, trying fallbacks...');
  
  // Generate fallback URLs based on current environment
  const hostname = window.location.hostname;
  const fallbackUrls = [
    // Try different ports on current hostname
    `http://${hostname}:30400`,
    `http://${hostname}:4000`,
    // Try localhost variants
    'http://localhost:30400',
    'http://localhost:4000',
    // Try common development URLs
    'http://127.0.0.1:30400',
    'http://127.0.0.1:4000',
  ].filter(url => url !== primaryUrl); // Remove duplicates
  
  for (const url of fallbackUrls) {
    const result = await testBackendConnection(url);
    if (result.success) {
      console.log('✅ Using fallback URL:', url);
      return { url, result };
    }
  }
  
  console.error('❌ All backend connection attempts failed');
  return { 
    url: primaryUrl, 
    result: { 
      success: false, 
      error: 'All connection attempts failed',
      allAttempts: [primaryUrl, ...fallbackUrls]
    } 
  };
};

// Initialize the API base URL
let API_BASE_URL = getBackendUrl();
let CONNECTION_STATUS = 'initializing';
let CONNECTION_RESULT = null;

// Attempt to find the best URL on module load
getBestBackendUrl().then(({ url, result }) => {
  API_BASE_URL = url;
  CONNECTION_STATUS = result.success ? 'connected' : 'failed';
  CONNECTION_RESULT = result;
  
  console.log('🌐 API Configuration Initialized:', {
    baseUrl: API_BASE_URL,
    status: CONNECTION_STATUS,
    result: CONNECTION_RESULT
  });
  
  // Dispatch custom event for components to listen to
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apiConfigReady', {
      detail: { baseUrl: API_BASE_URL, status: CONNECTION_STATUS, result: CONNECTION_RESULT }
    }));
  }
}).catch(error => {
  console.error('❌ Failed to initialize API configuration:', error);
  CONNECTION_STATUS = 'error';
  CONNECTION_RESULT = { success: false, error: error.message };
});

// Export commonly used endpoints
const getApiEndpoints = () => ({
  HEALTH: `${API_BASE_URL}/health`,
  API_HEALTH: `${API_BASE_URL}/api/health`,
  METRICS: `${API_BASE_URL}/api/metrics`,
  USERS: `${API_BASE_URL}/api/users`,
});

// Helper function to create full endpoint URLs
const createEndpoint = (path) => `${API_BASE_URL}${path}`;

// Helper function to update API base URL dynamically
const updateApiBaseUrl = (newUrl) => {
  const oldUrl = API_BASE_URL;
  API_BASE_URL = newUrl;
  
  console.log('🔄 API Base URL updated:', { from: oldUrl, to: newUrl });
  
  // Dispatch update event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apiConfigUpdated', {
      detail: { baseUrl: API_BASE_URL, previousUrl: oldUrl }
    }));
  }
};

// Get current connection status
const getConnectionStatus = () => ({
  baseUrl: API_BASE_URL,
  status: CONNECTION_STATUS,
  result: CONNECTION_RESULT,
  endpoints: getApiEndpoints()
});

// Export all functions and current state
export { 
  API_BASE_URL, 
  getApiEndpoints as API_ENDPOINTS,
  createEndpoint, 
  updateApiBaseUrl, 
  testBackendConnection,
  getBestBackendUrl,
  getConnectionStatus,
  getRuntimeConfig
};

export default {
  get API_BASE_URL() { return API_BASE_URL; },
  get API_ENDPOINTS() { return getApiEndpoints(); },
  createEndpoint,
  updateApiBaseUrl,
  testBackendConnection,
  getBestBackendUrl,
  getConnectionStatus,
  getRuntimeConfig,
};