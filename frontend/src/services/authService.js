// frontend/src/services/authService.js - Fixed Authentication Service
import axios from 'axios';
import { getBestBackendUrl } from '../api/config.js';

class AuthService {
  constructor() {
    this.token = localStorage.getItem('jwt_token');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.apiBaseUrl = null;
    this.axiosInstance = null;
    this.initializationPromise = null;
    this.isInitialized = false;
    
    // Start initialization immediately
    this.initializationPromise = this.initializeAxios();
  }

  async initializeAxios() {
    try {
      console.log('Initializing authentication service...');
      
      // Get the best backend URL with timeout protection
      const { url, result } = await Promise.race([
        getBestBackendUrl(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Backend URL resolution timeout')), 15000)
        )
      ]);
      
      this.apiBaseUrl = url;
      console.log('Using backend URL:', this.apiBaseUrl);
      
      // Create axios instance with extended timeout and better error handling
      this.axiosInstance = axios.create({
        baseURL: this.apiBaseUrl,
        timeout: 15000, // Increased timeout
        headers: {
          'Content-Type': 'application/json',
        },
        // Add retry logic
        retries: 2,
        retryDelay: 1000,
      });

      // Request interceptor to add JWT token
      this.axiosInstance.interceptors.request.use(
        (config) => {
          if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
          }
          
          // Add request logging
          console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
          return config;
        },
        (error) => {
          console.error('Request interceptor error:', error);
          return Promise.reject(error);
        }
      );

      // Response interceptor with better error handling
      this.axiosInstance.interceptors.response.use(
        (response) => {
          // Check for token refresh header
          const newToken = response.headers['x-new-token'];
          if (newToken) {
            this.updateToken(newToken);
          }
          
          console.log(`API Response: ${response.status} ${response.config.url}`);
          return response;
        },
        async (error) => {
          console.error('API Error:', {
            url: error.config?.url,
            status: error.response?.status,
            message: error.message
          });
          
          // Handle specific error cases
          if (error.response?.status === 401) {
            console.log('Unauthorized, clearing auth state');
            this.logout();
            
            // Don't redirect immediately if we're already on login page
            if (!window.location.pathname.includes('/login')) {
              setTimeout(() => {
                window.location.href = '/login';
              }, 1000);
            }
          }
          
          // Add retry logic for network errors
          if (error.code === 'ECONNABORTED' || error.message.includes('Network Error')) {
            const config = error.config;
            if (!config._retry && config.retries > 0) {
              config._retry = true;
              config.retries -= 1;
              
              console.log(`Retrying request to ${config.url}, attempts left: ${config.retries}`);
              
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, config.retryDelay));
              
              return this.axiosInstance(config);
            }
          }
          
          return Promise.reject(error);
        }
      );

      this.isInitialized = true;
      console.log('Auth service initialized successfully');
      
      return true;
      
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
      this.isInitialized = false;
      
      // Create a basic axios instance as fallback
      this.axiosInstance = axios.create({
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      throw error;
    }
  }

  // Wait for initialization to complete
  async waitForInitialization() {
    if (this.isInitialized) {
      return true;
    }
    
    try {
      await this.initializationPromise;
      return true;
    } catch (error) {
      console.error('Auth service initialization failed:', error);
      return false;
    }
  }

  // Google OAuth login with improved error handling
  async loginWithGoogle(googleAccessToken) {
    try {
      console.log('Starting backend authentication with Google token');
      
      // Ensure service is initialized
      await this.waitForInitialization();
      
      if (!this.axiosInstance) {
        throw new Error('Authentication service not available');
      }

      // First, get user info from Google to verify token
      let userInfo;
      try {
        console.log('Fetching user info from Google...');
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${googleAccessToken}` },
          timeout: 10000,
        });
        
        if (!userInfoResponse.ok) {
          throw new Error(`Google API error: ${userInfoResponse.status}`);
        }
        
        userInfo = await userInfoResponse.json();
        console.log('Google user info retrieved:', userInfo.email);
        
      } catch (error) {
        console.error('Failed to get Google user info:', error);
        throw new Error('Invalid Google token');
      }

      // Now authenticate with our backend
      console.log('Authenticating with backend...');
      const response = await this.axiosInstance.post('/auth/google', {
        token: googleAccessToken,
        userInfo: userInfo // Send user info as backup
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Backend authentication failed');
      }

      const { token, user } = response.data;
      
      // Store token and user data
      this.token = token;
      this.user = user;
      localStorage.setItem('jwt_token', token);
      localStorage.setItem('user', JSON.stringify(user));

      console.log('Login successful for:', user.email);
      return { success: true, user, token };

    } catch (error) {
      console.error('Google login failed:', error);
      
      // Clear any partial auth state
      this.token = null;
      this.user = null;
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user');
      
      // Provide more specific error messages
      let errorMessage = 'Login failed';
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = 'Connection timeout - please check if the backend server is running';
      } else if (error.response?.status === 400) {
        errorMessage = error.response.data?.message || 'Invalid login credentials';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error - please try again later';
      } else if (error.message.includes('Invalid Google token')) {
        errorMessage = 'Google authentication failed - please try again';
      } else if (error.message.includes('Network Error')) {
        errorMessage = 'Cannot connect to server - please check your connection';
      }
      
      throw new Error(errorMessage);
    }
  }

  // Verify current JWT token
  async verifyToken() {
    try {
      if (!this.token) {
        return { valid: false };
      }

      await this.waitForInitialization();
      
      if (!this.axiosInstance) {
        return { valid: false };
      }

      const response = await this.axiosInstance.get('/auth/verify');
      
      // Update user data if token is valid
      if (response.data.valid) {
        this.user = response.data.user;
        localStorage.setItem('user', JSON.stringify(this.user));
      }

      return response.data;

    } catch (error) {
      console.error('Token verification failed:', error);
      this.logout();
      return { valid: false };
    }
  }

  // Get user profile
  async getProfile() {
    try {
      await this.waitForInitialization();
      
      if (!this.axiosInstance) {
        throw new Error('Service not initialized');
      }

      const response = await this.axiosInstance.get('/auth/profile');
      
      this.user = response.data.user;
      localStorage.setItem('user', JSON.stringify(this.user));
      
      return response.data.user;

    } catch (error) {
      console.error('Get profile failed:', error);
      throw error;
    }
  }

  // Logout
  async logout() {
    try {
      if (this.axiosInstance && this.token) {
        // Don't wait too long for logout API call
        await Promise.race([
          this.axiosInstance.post('/auth/logout'),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Logout timeout')), 5000)
          )
        ]);
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with local cleanup regardless
    } finally {
      // Clear local storage regardless of API call success
      this.token = null;
      this.user = null;
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user');
      
      console.log('User logged out successfully');
    }
  }

  // Update token (for refresh)
  updateToken(newToken) {
    this.token = newToken;
    localStorage.setItem('jwt_token', newToken);
    console.log('JWT token refreshed');
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!(this.token && this.user);
  }

  // Get current user
  getCurrentUser() {
    return this.user;
  }

  // Get current token
  getToken() {
    return this.token;
  }

  // Check user role
  hasRole(requiredRole) {
    if (!this.user) return false;
    
    const roleHierarchy = {
      'user': 1,
      'moderator': 2,
      'admin': 3
    };
    
    const userLevel = roleHierarchy[this.user.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    return userLevel >= requiredLevel;
  }

  // Get authenticated axios instance
  getAxiosInstance() {
    return this.axiosInstance;
  }

  // Get API base URL
  getApiBaseUrl() {
    return this.apiBaseUrl;
  }

  // Health check method
  async healthCheck() {
    try {
      await this.waitForInitialization();
      
      if (!this.axiosInstance) {
        return { healthy: false, error: 'Service not initialized' };
      }

      const response = await Promise.race([
        this.axiosInstance.get('/health'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);

      return { healthy: true, data: response.data };
      
    } catch (error) {
      console.error('Health check failed:', error);
      return { healthy: false, error: error.message };
    }
  }
}

// Create singleton instance
const authService = new AuthService();

export default authService;