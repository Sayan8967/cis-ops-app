// frontend/src/api/config.js - AWS Host IP Resolution for Kind Cluster
// Enhanced API configuration with AWS EC2 host IP detection

const getRuntimeConfig = () => {
  // Check if runtime config is available (injected by Docker container)
  if (typeof window !== 'undefined' && window.RUNTIME_CONFIG) {
    return window.RUNTIME_CONFIG;
  }
  return {};
};

// Get the AWS EC2 host IP dynamically
const getAWSHostIP = async () => {
  console.log('🔍 Starting AWS host IP detection...');
  
  // Method 1: Check current hostname first
  const hostname = window.location.hostname;
  console.log('Current hostname:', hostname);
  
  if (hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    console.log('✅ Using current IP from hostname:', hostname);
    return hostname;
  }

  // Method 2: Try to get AWS EC2 metadata (if accessible from frontend)
  try {
    console.log('🌐 Attempting to get AWS EC2 public IP...');
    
    // Try AWS EC2 metadata service (usually not accessible from browser, but worth trying)
    const metadataResponse = await fetch('http://169.254.169.254/latest/meta-data/public-ipv4', {
      method: 'GET',
      timeout: 2000,
      signal: AbortSignal.timeout(2000)
    });
    
    if (metadataResponse.ok) {
      const awsIP = await metadataResponse.text();
      if (awsIP && awsIP.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        console.log('✅ Got AWS EC2 public IP:', awsIP);
        return awsIP;
      }
    }
  } catch (error) {
    console.log('❌ AWS metadata not accessible from browser:', error.message);
  }

  // Method 3: Try external IP detection services
  const ipServices = [
    { url: 'https://api.ipify.org?format=json', key: 'ip' },
    { url: 'https://httpbin.org/ip', key: 'origin' },
    { url: 'https://icanhazip.com', key: null },
    { url: 'https://ipinfo.io/ip', key: null }
  ];

  for (const service of ipServices) {
    try {
      console.log(`🌐 Trying IP service: ${service.url}`);
      
      const response = await fetch(service.url, {
        method: 'GET',
        timeout: 5000,
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        let ip;
        if (service.key) {
          const data = await response.json();
          ip = service.key === 'origin' ? data[service.key].split(',')[0].trim() : data[service.key];
        } else {
          ip = (await response.text()).trim();
        }
        
        if (ip && ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
          console.log(`✅ Got host IP from ${service.url}:`, ip);
          return ip;
        }
      }
    } catch (error) {
      console.log(`❌ Failed to get IP from ${service.url}:`, error.message);
    }
  }

  // Method 4: Try to resolve from domain if it's a known domain
  if (hostname && hostname.includes('mydevopsproject.live')) {
    try {
      console.log('🔍 Attempting DNS resolution for domain...');
      
      // Try a simple ping-like test to different common AWS patterns
      const commonAWSPatterns = [
        '18.', '52.', '54.', '3.', '13.', '35.', '34.', // Common AWS IP prefixes
      ];
      
      // This won't work directly, but we can try to detect patterns
      console.log('ℹ️ Domain detected, will test backend connectivity patterns');
      
      return hostname; // Return domain for now, will test connectivity later
    } catch (error) {
      console.log('❌ DNS resolution failed:', error.message);
    }
  }

  console.log('⚠️ No AWS host IP detected, will use fallback patterns');
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
  
  // Dynamic detection for AWS deployment
  if (process.env.NODE_ENV === 'production') {
    const hostname = window.location.hostname;
    
    // For Kind cluster on AWS, use NodePort (30400)
    const dynamicUrl = `http://${hostname}:30400`;
    console.log('Using dynamic AWS backend URL:', dynamicUrl);
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
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
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

// Get the best available backend URL with AWS IP resolution
const getBestBackendUrl = async () => {
  const primaryUrl = getBackendUrl();
  
  // Test primary URL first
  const primaryResult = await testBackendConnection(primaryUrl);
  if (primaryResult.success) {
    return { url: primaryUrl, result: primaryResult };
  }
  
  console.log('Primary URL failed, trying AWS host IP resolution...');
  
  // Try to get the actual AWS host IP
  let awsHostIP = null;
  try {
    awsHostIP = await getAWSHostIP();
  } catch (error) {
    console.log('Failed to get AWS host IP:', error.message);
  }
  
  // Generate fallback URLs based on AWS deployment
  const hostname = window.location.hostname;
  const fallbackUrls = [];
  
  // Add AWS host IP based URLs if we got one
  if (awsHostIP && awsHostIP !== hostname) {
    fallbackUrls.push(
      `http://${awsHostIP}:30400`,  // Kind NodePort service
      `http://${awsHostIP}:4000`,   // Direct backend port
      `http://${awsHostIP}`         // Default HTTP port
    );
  }
  
  // Add current hostname based URLs
  fallbackUrls.push(
    `http://${hostname}:30400`,
    `http://${hostname}:4000`,
    `http://${hostname}`
  );
  
  // Add localhost for development testing
  if (process.env.NODE_ENV !== 'production') {
    fallbackUrls.push(
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
    await new Promise(resolve => setTimeout(resolve, 300));
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
    console.log('🚀 Initializing API configuration for AWS deployment...');
    
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
  getAWSHostIP
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
  getAWSHostIP
};