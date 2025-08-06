// frontend/src/api/auth.js - Simplified auth hook (based on your working version)
import { googleLogout, useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';
import authService from '../services/authService.js';

export function useAuth() {
  const login = useGoogleLogin({
    onSuccess: async tokenResponse => {
      try {
        console.log('Google OAuth success, processing...');
        
        // Get user info from Google first
        const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        
        console.log('Got user info from Google:', userInfoResponse.data.email);
        
        // Store user info locally (simplified approach)
        localStorage.setItem('user', JSON.stringify(userInfoResponse.data));
        
        // Also authenticate with backend
        try {
          await authService.loginWithGoogle(tokenResponse.access_token, userInfoResponse.data);
        } catch (backendError) {
          console.warn('Backend authentication failed, but continuing with Google auth:', backendError);
          // Continue anyway - user is still authenticated with Google
        }
        
        // Redirect to dashboard
        window.location.href = '/dashboard';
        
      } catch (error) {
        console.error('Login process failed:', error);
        alert('Login failed: ' + error.message);
      }
    },
    onError: error => {
      console.error('Google Login Failed:', error);
      alert('Google login failed. Please try again.');
    },
  });

  const logout = async () => {
    try {
      // Logout from backend
      await authService.logout();
    } catch (error) {
      console.warn('Backend logout failed:', error);
    }
    
    // Google logout
    googleLogout();
    
    // Clear local storage
    localStorage.removeItem('user');
    
    // Redirect to login
    window.location.href = '/login';
  };

  return { login, logout };
}