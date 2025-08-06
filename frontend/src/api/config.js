// frontend/src/api/config.js - Fixed API configuration with better error handling
// Enhanced API configuration with runtime environment support and better fallback handling

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
  
  // Dynamic detection with better URL handling
  if (process.env.NODE_ENV === 'production') {
    const hostname = window.location.hostname;
    
    // Handle different hostname patterns
    if (hostname.includes('mydevopsproject.live')) {
      const dynamicUrl = `http://mydevopsproject.live:30400`;
      console.log('Using production backend URL:', dynamicUrl);
      return dynamicUrl;
    } else {
      const dynamicUrl = `http://${hostname}:30400`;
      console.log('Using dynamic backend URL:', dynamicUrl);
      return dynamicUrl;
    }
  }
  
  // Development fallback
  const devUrl = 'http://localhost:4000';
  console.log('Using development backend URL:', devUrl);
  return devUrl;
};

// Test backend connectivity with enhanced error handling and shorter timeout
const testBackendConnection = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced to 3 seconds
    
    console.log(`Testing backend connection to: ${url}`);
    
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      // Remove credentials to avoid CORS issues
      credentials: 'omit',
      // Add mode to handle CORS better
      mode: 'cors',
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      let data;
      try {
        data = await response.json();
      } catch {
        data = { status: 'ok', text: await response.text() };
      }
      
      console.log('✅ Backend connection successful:', {
        url,
        status: response.status,
        data: data
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

// Get the best available backend URL with faster fallback
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
  const fallbackUrls = [];
  
  // Add production-specific fallbacks
  if (hostname.includes('mydevopsproject.live')) {
    fallbackUrls.push(
      'http://mydevopsproject.live:30400',
      'http://mydevopsproject.live:4000'
    );
  } else {
    // Add development and general fallbacks
    fallbackUrls.push(
      `http://${hostname}:30400`,
      `http://${hostname}:4000`,
      'http://localhost:30400',
      'http://localhost:4000',
      'http://127.0.0.1:30400',
      'http://127.0.0.1:4000'
    );
  }
  
  // Remove duplicates
  const uniqueUrls = [...new Set(fallbackUrls.filter(url => url !== primaryUrl))];
  
  // Test fallback URLs with reduced parallelism to avoid overwhelming
  for (const url of uniqueUrls) {
    const result = await testBackendConnection(url);
    if (result.success) {
      console.log('✅ Using fallback URL:', url);
      return { url, result };
    }
    
    // Small delay between attempts to avoid overwhelming
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.error('❌ All backend connection attempts failed');
  return { 
    url: primaryUrl, 
    result: { 
      success: false, 
      error: 'All connection attempts failed',
      allAttempts: [primaryUrl, ...uniqueUrls]
    } 
  };
};

// Initialize the API base URL
let API_BASE_URL = getBackendUrl();
let CONNECTION_STATUS = 'initializing';
let CONNECTION_RESULT = null;

// Attempt to find the best URL on module load with timeout
const initializeApiConfig = async () => {
  try {
    // Add a maximum initialization time
    const initializationPromise = getBestBackendUrl();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('API initialization timeout')), 10000)
    );
    
    const { url, result } = await Promise.race([initializationPromise, timeoutPromise]);
    
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
    
  } catch (error) {
    console.error('❌ Failed to initialize API configuration:', error);
    CONNECTION_STATUS = 'error';
    CONNECTION_RESULT = { success: false, error: error.message };
    
    // Still dispatch event so components can handle the error
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('apiConfigReady', {
        detail: { baseUrl: API_BASE_URL, status: CONNECTION_STATUS, result: CONNECTION_RESULT }
      }));
    }
  }
};

// Start initialization
initializeApiConfig();

// Export commonly used endpoints
const getApiEndpoints = () => ({
  HEALTH: `${API_BASE_URL}/health`,
  API_HEALTH: `${API_BASE_URL}/api/health`,
  METRICS: `${API_BASE_URL}/api/metrics`,
  USERS: `${API_BASE_URL}/api/users`,
  AUTH_GOOGLE: `${API_BASE_URL}/auth/google`,
  AUTH_VERIFY: `${API_BASE_URL}/auth/verify`,
  AUTH_LOGOUT: `${API_BASE_URL}/auth/logout`,
  AUTH_PROFILE: `${API_BASE_URL}/auth/profile`,
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

// Wait for initialization to complete
const waitForInitialization = (timeout = 10000) => {
  return new Promise((resolve, reject) => {
    if (CONNECTION_STATUS !== 'initializing') {
      resolve(getConnectionStatus());
      return;
    }
    
    const timeoutId = setTimeout(() => {
      reject(new Error('API configuration timeout'));
    }, timeout);
    
    const handleReady = (event) => {
      clearTimeout(timeoutId);
      window.removeEventListener('apiConfigReady', handleReady);
      resolve(event.detail);
    };
    
    window.addEventListener('apiConfigReady', handleReady);
  });
};

// Export all functions and current state
export { 
  API_BASE_URL, 
  getApiEndpoints as API_ENDPOINTS,
  createEndpoint, 
  updateApiBaseUrl, 
  testBackendConnection,
  getBestBackendUrl,
  getConnectionStatus,
  getRuntimeConfig,
  waitForInitialization
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
  waitForInitialization,
};