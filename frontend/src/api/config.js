// frontend/src/api/config.js
// Centralized API configuration

const getBackendUrl = () => {
  // If explicitly set via environment variable, use it
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  
  // For production, use the current host with NodePort
  if (process.env.NODE_ENV === 'production') {
    return `http://${window.location.hostname}:30400`;
  }
  
  // For development, use localhost
  return 'http://localhost:4000';
};

export const API_BASE_URL = getBackendUrl();

console.log('Using API Base URL:', API_BASE_URL);

// Export commonly used endpoints
export const API_ENDPOINTS = {
  HEALTH: `${API_BASE_URL}/health`,
  API_HEALTH: `${API_BASE_URL}/api/health`,
  METRICS: `${API_BASE_URL}/api/metrics`,
  USERS: `${API_BASE_URL}/api/users`,
};

// Helper function to create full endpoint URLs
export const createEndpoint = (path) => `${API_BASE_URL}${path}`;

export default {
  API_BASE_URL,
  API_ENDPOINTS,
  createEndpoint,
};