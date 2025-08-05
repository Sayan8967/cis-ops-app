// frontend/src/services/authService.js - Frontend Authentication Service
import axios from 'axios';
import { getBestBackendUrl } from '../api/config.js';

class AuthService {
  constructor() {
    this.token = localStorage.getItem('jwt_token');
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    this.apiBaseUrl = null;
    this.axiosInstance = null;
    this.initializeAxios();
  }

  async initializeAxios() {
    try {
      const { url } = await getBestBackendUrl();
      this.apiBaseUrl = url;
      
      // Create axios instance with interceptors
      this.axiosInstance = axios.create({
        baseURL: this.apiBaseUrl,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Request interceptor to add JWT token
      this.axiosInstance.interceptors.request.use(
        (config) => {
          if (this.token) {
            config.headers.Authorization = `Bearer ${this.token}`;
          }
          return config;
        },
        (error) => {
          return Promise.reject(error);
        }
      );

      // Response interceptor to handle token refresh and errors
      this.axiosInstance.interceptors.response.use(
        (response) => {
          // Check for token refresh header
          const newToken = response.headers['x-new-token'];
          if (newToken) {
            this.updateToken(newToken);
          }
          return response;
        },
        (error) => {
          if (error.response?.status === 401) {
            // Token expired or invalid
            this.logout();
            window.location.href = '/login';
          }
          return Promise.reject(error);
        }
      );

      console.log('Auth service initialized with backend:', this.apiBaseUrl);
      
    } catch (error) {
      console.error('Failed to initialize auth service:', error);
      throw error;
    }
  }

  // Google OAuth login
  async loginWithGoogle(googleToken) {
    try {
      if (!this.axiosInstance) {
        await this.initializeAxios();
      }

      const response = await this.axiosInstance.post('/auth/google', {
        token: googleToken
      });

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
      
      const errorMessage = error.response?.data?.message || error.message;
      throw new Error(`Login failed: ${errorMessage}`);
    }
  }

  // Verify current JWT token
  async verifyToken() {
    try {
      if (!this.token || !this.axiosInstance) {
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
      if (!this.axiosInstance) {
        await this.initializeAxios();
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
        await this.axiosInstance.post('/auth/logout');
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
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
}

// Create singleton instance
const authService = new AuthService();

export default authService;