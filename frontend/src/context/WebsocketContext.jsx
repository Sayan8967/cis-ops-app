// frontend/src/context/WebsocketContext.jsx - Updated with JWT Authentication
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getBestBackendUrl } from '../api/config.js';
import authService from '../services/authService.js';

const WsContext = createContext();

export function WebsocketProvider({ children }) {
  const [metrics, setMetrics] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('initializing');
  const [socket, setSocket] = useState(null);
  const [userCount, setUserCount] = useState(0);

  const connectWebSocket = async (backendUrl) => {
    try {
      // Check if user is authenticated
      if (!authService.isAuthenticated()) {
        console.log('User not authenticated, skipping WebSocket connection');
        setConnectionStatus('unauthenticated');
        return null;
      }

      const token = authService.getToken();
      console.log('Attempting authenticated WebSocket connection to:', backendUrl);
      
      // Clean up existing socket
      if (socket) {
        socket.disconnect();
      }

      const newSocket = io(backendUrl, {
        timeout: 10000,
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        forceNew: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: 5,
        auth: {
          token: token
        }
      });

      newSocket.on('connect', () => {
        console.log('Authenticated WebSocket connected successfully to:', backendUrl);
        setConnectionStatus('connected');
      });

      newSocket.on('metrics', (data) => {
        console.log('Received metrics from server:', data);
        setMetrics(data);
      });

      newSocket.on('userCount', (count) => {
        console.log('Received user count:', count);
        setUserCount(count);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setConnectionStatus('disconnected');
      });

      newSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error.message);
        
        if (error.message.includes('Authentication failed')) {
          setConnectionStatus('auth_failed');
          // Token might be expired, try to refresh
          authService.verifyToken().catch(() => {
            console.log('Token verification failed, user needs to re-login');
          });
        } else {
          setConnectionStatus('error');
        }
      });

      newSocket.on('reconnect', (attemptNumber) => {
        console.log('WebSocket reconnected after', attemptNumber, 'attempts');
        setConnectionStatus('connected');
      });

      newSocket.on('reconnect_error', (error) => {
        console.error('WebSocket reconnection error:', error);
      });

      newSocket.on('reconnect_failed', () => {
        console.error('WebSocket reconnection failed');
        setConnectionStatus('failed');
      });

      setSocket(newSocket);
      return newSocket;

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setConnectionStatus('error');
      return null;
    }
  };

  const tryMultipleConnections = async () => {
    const { url: primaryUrl } = await getBestBackendUrl();
    const urls = [
      primaryUrl,
      `http://${window.location.hostname}:30400`,
      `http://${window.location.hostname}:4000`,
      'http://localhost:30400',
      'http://localhost:4000',
    ];

    for (const url of urls) {
      try {
        console.log('Testing WebSocket connection to:', url);
        
        const socketConnection = await connectWebSocket(url);
        if (socketConnection) {
          return socketConnection;
        }
      } catch (error) {
        console.log('Failed to connect to:', url, error.message);
      }
    }

    console.error('All WebSocket connection attempts failed');
    setConnectionStatus('failed');
    return null;
  };

  const startPollingFallback = async () => {
    console.log('Starting authenticated polling fallback for metrics');
    
    const pollMetrics = async () => {
      try {
        const apiInstance = authService.getAxiosInstance();
        if (!apiInstance) {
          console.error('No authenticated API instance available');
          return;
        }

        const response = await apiInstance.get('/api/metrics');
        
        if (response.status === 200) {
          setMetrics(response.data.current || response.data);
          setConnectionStatus('polling');
        } else {
          console.error('Polling failed with status:', response.status);
        }
      } catch (error) {
        console.error('Polling error:', error);
        
        if (error.response?.status === 401) {
          setConnectionStatus('auth_failed');
        }
      }
    };

    // Poll every 10 seconds (less frequent than WebSocket)
    const pollInterval = setInterval(pollMetrics, 10000);
    
    // Initial poll
    pollMetrics();

    return pollInterval;
  };

  useEffect(() => {
    let pollInterval = null;
    let mounted = true;

    const initialize = async () => {
      if (!mounted) return;

      // Wait a bit for auth to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!authService.isAuthenticated()) {
        setConnectionStatus('unauthenticated');
        return;
      }

      setConnectionStatus('connecting');

      // Try WebSocket connections first
      const socketConnection = await tryMultipleConnections();
      
      if (!socketConnection && mounted && authService.isAuthenticated()) {
        // If WebSocket fails, fall back to polling
        console.log('WebSocket failed, falling back to polling');
        pollInterval = await startPollingFallback();
      }
    };

    initialize();

    return () => {
      mounted = false;
      
      if (socket) {
        socket.disconnect();
      }
      
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  // Reconnect function for manual retry
  const reconnect = async () => {
    if (!authService.isAuthenticated()) {
      setConnectionStatus('unauthenticated');
      return;
    }

    setConnectionStatus('connecting');
    await tryMultipleConnections();
  };

  const contextValue = {
    metrics,
    userCount,
    connectionStatus,
    reconnect,
    isConnected: connectionStatus === 'connected',
    isPolling: connectionStatus === 'polling',
    isAuthFailed: connectionStatus === 'auth_failed',
    isUnauthenticated: connectionStatus === 'unauthenticated',
  };
  
  return (
    <WsContext.Provider value={contextValue}>
      {children}
    </WsContext.Provider>
  );
}

export const useWsContext = () => useContext(WsContext);