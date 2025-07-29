import React, { createContext, useState, useContext } from 'react';
import { useAuth as useGoogleAuth } from '../api/auth.js';

const AuthContext = createContext();
export function AuthProvider({ children }) {
  const google = useGoogleAuth();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));

  const login = () => google.login(userInfo => { setUser(userInfo); });
  const logout = () => { google.logout(); setUser(null); };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuthContext = () => useContext(AuthContext);