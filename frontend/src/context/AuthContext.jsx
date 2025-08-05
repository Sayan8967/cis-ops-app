// frontend/src/context/AuthContext.jsx 
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import authService from '../services/authService.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Google OAuth login hook with fixed flow
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('Google OAuth success, token received');
        
        // Use the Google access token directly for backend authentication
        const result = await authService.loginWithGoogle(tokenResponse.access_token);
        
        if (result.success) {
          setUser(result.user);
          console.log('Login successful for user:', result.user.email);
          
          // Small delay to show success state, then redirect
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 1000);
        } else {
          throw new Error('Backend authentication failed');
        }
        
      } catch (error) {
        console.error('Login failed:', error);
        
        // Better error handling
        let errorMessage = 'Login failed. Please try again.';
        
        if (error.message.includes('timeout')) {
          errorMessage = 'Connection timeout. Please check your network and try again.';
        } else if (error.message.includes('Network Error')) {
          errorMessage = 'Cannot connect to server. Please check if the backend is running.';
        } else if (error.response?.status === 400) {
          errorMessage = 'Invalid Google token. Please try logging in again.';
        } else if (error.response?.status === 500) {
          errorMessage = 'Server error. Please try again later.';
        }
        
        setError(errorMessage);
        setUser(null);
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google OAuth failed:', error);
      setError('Google login failed. Please check your popup blocker and try again.');
      setLoading(false);
    },
    // Fixed OAuth configuration
    flow: 'implicit',
    scope: 'openid profile email',
  });

  // Initialize authentication state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('Initializing authentication...');
      setLoading(true);
      setError(null);
      
      try {
        // Wait for auth service to initialize
        await authService.waitForInitialization();
        
        // Check if user has a valid token
        if (authService.isAuthenticated()) {
          console.log('Found existing token, verifying...');
          const verification = await authService.verifyToken();
          
          if (verification.valid) {
            setUser(verification.user);
            console.log('Token verified, user restored:', verification.user.email);
          } else {
            console.log('Token invalid, clearing storage');
            await authService.logout();
            setUser(null);
          }
        } else {
          console.log('No existing authentication');
          setUser(null);
        }
        
      } catch (error) {
        console.error('Auth initialization failed:', error);
        
        // Only set error for critical failures, not network issues
        if (!error.message.includes('timeout') && !error.message.includes('Network Error')) {
          setError('Authentication system unavailable');
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Login function
  const login = async () => {
    setError(null);
    console.log('Starting Google login...');
    googleLogin();
  };

  // Logout function
  const logout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await authService.logout();
      setUser(null);
      console.log('Logout successful');
      
      // Redirect to login page
      window.location.href = '/login';
      
    } catch (error) {
      console.error('Logout failed:', error);
      // Don't block logout on error, just clear local state
      setUser(null);
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  // Check if user has required role
  const hasRole = (requiredRole) => {
    return authService.hasRole(requiredRole);
  };

  // Get authenticated API instance
  const getApiInstance = () => {
    return authService.getAxiosInstance();
  };

  // Refresh user profile
  const refreshProfile = async () => {
    try {
      const updatedUser = await authService.getProfile();
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      console.error('Profile refresh failed:', error);
      throw error;
    }
  };

  const contextValue = {
    user,
    loading,
    error,
    login,
    logout,
    hasRole,
    getApiInstance,
    refreshProfile,
    isAuthenticated: authService.isAuthenticated(),
    clearError: () => setError(null),
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  
  return context;
};