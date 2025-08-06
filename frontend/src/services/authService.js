// frontend/src/services/authService.js - Simplified Authentication Service (No JWT)
import { API_ENDPOINTS } from '../api/config.js';

class SimpleAuthService {
  constructor() {
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    console.log('Simple Auth Service initialized');
  }

  // Google OAuth login - simplified
  async loginWithGoogle(googleAccessToken, userInfo = null) {
    try {
      console.log('Starting simplified Google authentication...');
      
      // If userInfo is provided, use it; otherwise let backend fetch it
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Authentication failed');
      }

      // Store user data locally
      this.user = data.user;
      localStorage.setItem('user', JSON.stringify(this.user));

      console.log('Login successful for:', this.user.email);
      return { success: true, user: this.user };

    } catch (error) {
      console.error('Google login failed:', error);
      
      // Clear any partial auth state
      this.user = null;
      localStorage.removeItem('user');
      
      // Provide specific error messages
      let errorMessage = 'Login failed';
      
      if (error.message.includes('timeout') || error.name === 'AbortError') {
        errorMessage = 'Connection timeout - please check if the server is running';
      } else if (error.message.includes('Invalid Google token')) {
        errorMessage = 'Google authentication failed - please try again';
      } else if (error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Cannot connect to server - please check your connection';
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
          this.user = data.user;
          localStorage.setItem('user', JSON.stringify(this.user));
          return this.user;
        }
      }
      
      // If server says not authenticated, clear local storage
      this.user = null;
      localStorage.removeItem('user');
      return null;

    } catch (error) {
      console.error('Get current user failed:', error);
      // On error, keep local state but don't throw
      return this.user;
    }
  }

  // Logout
  async logout() {
    try {
      // Try to notify server (don't wait too long)
      await Promise.race([
        fetch(API_ENDPOINTS.AUTH_LOGOUT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Logout timeout')), 3000)
        )
      ]);
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with local cleanup regardless
    } finally {
      // Clear local storage regardless of API call success
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

  // Health check method
  async healthCheck() {
    try {
      const response = await fetch(API_ENDPOINTS.HEALTH, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
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

  // Wait for initialization (simplified - always ready)
  async waitForInitialization() {
    return true;
  }
}

// Create singleton instance
const authService = new SimpleAuthService();

export default authService;