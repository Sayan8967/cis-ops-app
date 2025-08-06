// frontend/src/context/AuthContext.jsx - Simplified Auth Context
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useAuth } from '../api/auth.js';
import authService from '../services/authService.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { login: googleLogin, logout: googleLogout } = useAuth();

  // Initialize authentication state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Check local storage first
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userData = JSON.parse(storedUser);
          setUser(userData);
          console.log('Restored user from localStorage:', userData.email);
          
          // Optionally verify with backend
          try {
            const currentUser = await authService.getCurrentUser();
            if (currentUser) {
              setUser(currentUser);
            }
          } catch (backendError) {
            console.warn('Backend verification failed, but keeping local user:', backendError);
            // Keep the user from localStorage even if backend fails
          }
        } else {
          console.log('No stored user found');
          setUser(null);
        }
        
      } catch (error) {
        console.error('Auth initialization failed:', error);
        setError('Authentication system error');
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
    setLoading(true);
    
    try {
      console.log('Starting Google login...');
      googleLogin();
      // Note: googleLogin handles the rest asynchronously
    } catch (error) {
      console.error('Login failed:', error);
      setError(error.message || 'Login failed');
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await googleLogout();
      setUser(null);
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout failed:', error);
      // Clear user anyway
      setUser(null);
      localStorage.removeItem('user');
    } finally {
      setLoading(false);
    }
  };

  // Refresh user profile
  const refreshProfile = async () => {
    try {
      const updatedUser = await authService.getCurrentUser();
      if (updatedUser) {
        setUser(updatedUser);
        return updatedUser;
      }
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
    refreshProfile,
    isAuthenticated: !!(user && user.email),
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