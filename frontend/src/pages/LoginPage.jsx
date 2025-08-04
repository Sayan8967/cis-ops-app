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
    <>
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 via-blue-800/90 to-indigo-900/90">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='7' cy='7' r='7'/%3E%3Ccircle cx='53' cy='7' r='7'/%3E%3Ccircle cx='7' cy='53' r='7'/%3E%3Ccircle cx='53' cy='53' r='7'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
            }}
          ></div>
        </div>

        <div className="relative max-w-md w-full">
          {/* Logo and Header */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="bg-white p-4 rounded-2xl shadow-xl">
                <svg className="w-12 h-12 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">LBWL CIS Operations</h1>
            <p className="text-blue-200 text-lg mb-2">System Management Portal</p>
            <p className="text-blue-300 text-sm">Secure access to your operations dashboard</p>
          </div>

          {/* Login Card */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome Back</h2>
              <p className="text-gray-600">Sign in to access your dashboard</p>
            </div>

            {/* Login Form */}
            <div className="space-y-6">
              <div className="flex justify-center">
                <GoogleLogin 
                  onSuccess={handleSuccess} 
                  onError={() => console.error('Login Failed')}
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  logo_alignment="left"
                  width="280"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Secure Enterprise Login</span>
                </div>
              </div>

              {/* Security Features */}
              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex items-center text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Multi-factor authentication</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>End-to-end encryption</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <svg className="w-4 h-4 text-green-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Role-based access control</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-xl p-4">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">System Status</span>
              </div>
              <span className="text-sm text-green-300">All Systems Operational</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-blue-200 text-sm">
              Protected by enterprise-grade security
            </p>
            <div className="flex justify-center items-center mt-4 space-x-6 text-xs text-blue-300">
              <span>Privacy Policy</span>
              <span>•</span>
              <span>Terms of Service</span>
              <span>•</span>
              <span>Support</span>
            </div>
          </div>
        </div>

        {/* Additional Background Elements */}
        <div className="absolute top-10 right-10 w-20 h-20 bg-blue-400/10 rounded-full blur-xl"></div>
        <div className="absolute bottom-10 left-10 w-32 h-32 bg-indigo-400/10 rounded-full blur-xl"></div>
        <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-purple-400/10 rounded-full blur-xl"></div>
      </div>
    </>
  );
}