// frontend/src/api/config.js - Dynamic host IP resolution for Kubernetes Kind
// Enhanced API configuration with automatic host IP detection

const getRuntimeConfig = () => {
  // Check if runtime config is available (injected by Docker container)
  if (typeof window !== 'undefined' && window.RUNTIME_CONFIG) {
    return window.RUNTIME_CONFIG;
  }
  return {};
};

// Get the Kind cluster host IP dynamically
const getKindHostIP = async () => {
  try {
    // Method 1: Try to get host IP from a public IP service
    const response = await fetch('https://api.ipify.org?format=json', {
      method: 'GET',
      timeout: 3000
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Got external IP from ipify:', data.ip);
      return data.ip;
    }
  } catch (error) {
    console.log('Failed to get external IP from ipify:', error.message);
  }

  try {
    // Method 2: Try alternative IP service
    const response = await fetch('https://httpbin.org/ip', {
      method: 'GET',
      timeout: 3000
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Got external IP from httpbin:', data.origin);
      return data.origin.split(',')[0].trim(); // Handle multiple IPs
    }
  } catch (error) {
    console.log('Failed to get external IP from httpbin:', error.message);
  }

  // Method 3: Try to detect from current hostname/location
  const hostname = window.location.hostname;
  if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    console.log('Using current IP from hostname:', hostname);
    return hostname;
  }

  // Method 4: Try common Kind cluster patterns
  const kindPatterns = [
    '172.18.0.1',  // Common Kind host IP
    '172.17.0.1',  // Docker default bridge
    '192.168.1.1', // Common router IP
    '10.0.2.2'     // VirtualBox host IP
  ];

  for (const ip of kindPatterns) {
    try {
      // Test if this IP responds on port 30400
      const testResponse = await fetch(`http://${ip}:30400/health`, {
        method: 'GET',
        timeout: 2000,
        mode: 'no-cors' // Bypass CORS for testing
      });
      console.log(`Kind pattern IP ${ip} is reachable`);
      return ip;
    } catch (error) {
      console.log(`Kind pattern IP ${ip} not reachable:`, error.message);
    }
  }

  // Fallback: return null to use hostname-based detection
  return null;
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
    
    // Check if we're accessing via a domain name
    if (hostname.includes('mydevopsproject.live')) {
      // For production domain, we'll resolve the IP later
      const dynamicUrl = `http://${hostname}:30400`;
      console.log('Using domain-based backend URL (will resolve IP):', dynamicUrl);
      return dynamicUrl;
    } else if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      // If accessing via IP directly
      const dynamicUrl = `http://${hostname}:30400`;
      console.log('Using IP-based backend URL:', dynamicUrl);
      return dynamicUrl;
    } else {
      const dynamicUrl = `http://${hostname}:30400`;
      console.log('Using hostname-based backend URL:', dynamicUrl);
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
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    console.log(`Testing backend connection to: ${url}`);
    
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      credentials: 'omit',
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

// Get the best available backend URL with dynamic IP resolution
const getBestBackendUrl = async () => {
  const primaryUrl = getBackendUrl();
  
  // Test primary URL first
  const primaryResult = await testBackendConnection(primaryUrl);
  if (primaryResult.success) {
    return { url: primaryUrl, result: primaryResult };
  }
  
  console.log('Primary URL failed, trying fallbacks with dynamic IP resolution...');
  
  // Generate fallback URLs based on current environment
  const hostname = window.location.hostname;
  const fallbackUrls = [];
  
  // Try to get the actual host IP for Kind cluster
  let hostIP = null;
  try {
    hostIP = await getKindHostIP();
  } catch (error) {
    console.log('Failed to get Kind host IP:', error.message);
  }
  
  // Add IP-based fallbacks if we got a host IP
  if (hostIP && hostIP !== hostname) {
    fallbackUrls.push(
      `http://${hostIP}:30400`,
      `http://${hostIP}:4000`
    );
  }
  
  // Add other fallback patterns
  if (hostname.includes('mydevopsproject.live') || hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    // Try common Kind cluster IPs
    const kindIPs = ['172.18.0.1', '172.17.0.1', '192.168.1.1', '10.0.2.2'];
    for (const ip of kindIPs) {
      fallbackUrls.push(
        `http://${ip}:30400`,
        `http://${ip}:4000`
      );
    }
    
    // Add current hostname fallbacks
    fallbackUrls.push(
      `http://${hostname}:30400`,
      `http://${hostname}:4000`
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
  
  // Test fallback URLs
  for (const url of uniqueUrls) {
    const result = await testBackendConnection(url);
    if (result.success) {
      console.log('✅ Using fallback URL:', url);
      return { url, result };
    }
    
    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 200));
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
      setTimeout(() => reject(new Error('API initialization timeout')), 15000)
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
const waitForInitialization = (timeout = 15000) => {
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
  waitForInitialization,
  getKindHostIP
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
  getKindHostIP
};