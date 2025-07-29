import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useAuthContext } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { login } = useAuthContext();

  const handleSuccess = credentialResponse => {
    const user = jwtDecode(credentialResponse.credential);
    login(user);
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-80 text-center">
        <h1 className="text-2xl font-bold mb-6">CIS Ops Tool Login</h1>
        <GoogleLogin onSuccess={handleSuccess} onError={() => console.error('Login Failed')} />
      </div>
    </div>
  );
}