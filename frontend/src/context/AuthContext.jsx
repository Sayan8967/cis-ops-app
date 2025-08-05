// frontend/src/context/AuthContext.jsx - Updated with JWT Authentication
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import authService from '../services/authService.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Google OAuth login hook
  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError(null);
      
      try {
        // Get user info from Google
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        
        if (!userInfoResponse.ok) {
          throw new Error('Failed to get user info from Google');
        }
        
        const googleUserInfo = await userInfoResponse.json();
        
        // Authenticate with our backend using Google ID token
        const result = await authService.loginWithGoogle(tokenResponse.access_token);
        
        if (result.success) {
          setUser(result.user);
          
          // Redirect to dashboard after successful login
          setTimeout(() => {
            window.location.href = '/dashboard';
          }, 500);
        }
        
      } catch (error) {
        console.error('Login failed:', error);
        setError(error.message);
        setUser(null);
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.error('Google OAuth failed:', error);
      setError('Google login failed. Please try again.');
      setLoading(false);
    },
  });

  // Initialize authentication state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Check if user has a valid token
        if (authService.isAuthenticated()) {
          const verification = await authService.verifyToken();
          
          if (verification.valid) {
            setUser(verification.user);
          } else {
            // Token invalid, clear storage
            await authService.logout();
            setUser(null);
          }
        } else {
          setUser(null);
        }
        
      } catch (error) {
        console.error('Auth initialization failed:', error);
        setError('Authentication initialization failed');
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
    googleLogin();
  };

  // Logout function
  const logout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await authService.logout();
      setUser(null);
      
      // Redirect to login page
      window.location.href = '/login';
      
    } catch (error) {
      console.error('Logout failed:', error);
      setError('Logout failed');
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