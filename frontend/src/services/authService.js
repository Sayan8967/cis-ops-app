// frontend/src/services/authService.js - FIXED with better error handling
import { API_ENDPOINTS } from '../api/config.js';

class SimpleAuthService {
  constructor() {
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    console.log('Auth Service initialized');
  }

  // Google OAuth login
  async loginWithGoogle(googleAccessToken, userInfo = null) {
    try {
      console.log('Starting Google authentication...');
      
      const requestBody = {
        token: googleAccessToken
      };
      
      if (userInfo) {
        requestBody.userInfo = userInfo;
      }

      const response = await fetch(API_ENDPOINTS.AUTH_GOOGLE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('Failed to parse backend response:', parseError);
        throw new Error('Invalid response from server');
      }

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      if (!data.success) {
        throw new Error(data.message || 'Authentication failed');
      }

      // Store user data with role
      this.user = {
        ...data.user,
        role: data.user.role || 'admin' // Default to admin for demo
      };
      localStorage.setItem('user', JSON.stringify(this.user));

      console.log('Login successful for:', this.user.email, 'Role:', this.user.role);
      return { success: true, user: this.user };

    } catch (error) {
      console.error('Google login failed:', error);
      
      this.user = null;
      localStorage.removeItem('user');
      
      let errorMessage = 'Login failed';
      
      if (error.message.includes('timeout') || error.name === 'AbortError') {
        errorMessage = 'Connection timeout - please check if the server is running';
      } else if (error.message.includes('Invalid Google token')) {
        errorMessage = 'Google authentication failed - please try again';
      } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Cannot connect to server - please check your connection';
      } else if (error.message.includes('Invalid response from server')) {
        errorMessage = 'Server returned invalid response - please try again';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  }

  // Check current user status
  async getCurrentUser() {
    try {
      const response = await fetch(API_ENDPOINTS.AUTH_USER, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Ensure user has a role
          this.user = {
            ...data.user,
            role: data.user.role || 'admin' // Default to admin for demo
          };
          localStorage.setItem('user', JSON.stringify(this.user));
          return this.user;
        }
      }
      
      // If backend check fails, return current stored user
      return this.user;

    } catch (error) {
      console.error('Get current user failed:', error);
      // Return stored user if backend is unreachable
      return this.user;
    }
  }

  // Logout
  async logout() {
    try {
      await fetch(API_ENDPOINTS.AUTH_LOGOUT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
    } catch (error) {
      console.warn('Backend logout failed:', error);
    } finally {
      this.user = null;
      localStorage.removeItem('user');
      console.log('User logged out successfully');
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!(this.user && this.user.email);
  }

  // Get current user
  getUser() {
    return this.user;
  }

  // Health check
  async healthCheck() {
    try {
      const response = await fetch(API_ENDPOINTS.HEALTH, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const data = await response.json();
        return { healthy: true, data };
      } else {
        return { healthy: false, error: `HTTP ${response.status}` };
      }
      
    } catch (error) {
      console.error('Health check failed:', error);
      return { healthy: false, error: error.message };
    }
  }

  // Get API base URL for display purposes
  getApiBaseUrl() {
    return window.location.origin;
  }

  // Clear stored user data (for debugging)
  clearUserData() {
    this.user = null;
    localStorage.removeItem('user');
    console.log('User data cleared');
  }
}

// Create singleton instance
const authService = new SimpleAuthService();

export default authService;