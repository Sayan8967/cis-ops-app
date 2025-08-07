// frontend/src/api/auth.js - FIXED navigation flow
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
        
        // Determine user role (matching backend logic)
        const userRole = userInfoResponse.data.email.includes('admin') || 
                        userInfoResponse.data.email.endsWith('@cisops.com') ? 'admin' :
                        userInfoResponse.data.email.includes('mod') || 
                        userInfoResponse.data.email.includes('moderator') ? 'moderator' : 'admin';
        
        // Store user info with role
        const userData = {
          ...userInfoResponse.data,
          role: userRole
        };
        
        // Store in localStorage immediately
        localStorage.setItem('user', JSON.stringify(userData));
        
        // Also authenticate with backend
        try {
          const backendResponse = await authService.loginWithGoogle(tokenResponse.access_token, userData);
          console.log('Backend authentication successful:', backendResponse);
          
          // Update user data with backend response if available
          if (backendResponse.user) {
            const finalUserData = { ...userData, ...backendResponse.user };
            localStorage.setItem('user', JSON.stringify(finalUserData));
          }
        } catch (backendError) {
          console.warn('Backend authentication failed, but continuing with Google auth:', backendError);
          // Continue anyway - user is still authenticated with Google
        }
        
        // IMPORTANT: Trigger a custom event to notify the auth context
        window.dispatchEvent(new CustomEvent('userLoggedIn', { 
          detail: userData 
        }));
        
        // Small delay to ensure state updates, then redirect
        setTimeout(() => {
          window.location.href = '/chat';
        }, 100);
        
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
    
    // Trigger logout event
    window.dispatchEvent(new CustomEvent('userLoggedOut'));
    
    // Redirect to login
    window.location.href = '/login';
  };

  return { login, logout };
}