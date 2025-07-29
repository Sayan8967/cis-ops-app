import { googleLogout, useGoogleLogin } from '@react-oauth/google';
import axios from 'axios';

export function useAuth() {
  const login = useGoogleLogin({
    onSuccess: async tokenResponse => {
      const userInfo = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      localStorage.setItem('user', JSON.stringify(userInfo.data));
      window.location.href = '/chat';
    },
    onError: error => console.error('Login Failed:', error),
  });

  const logout = () => {
    googleLogout();
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return { login, logout };
}