// frontend/src/context/WebsocketContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getBestBackendUrl, testBackendConnection } from '../api/config.js';

const WsContext = createContext();

export function WebsocketProvider({ children }) {
  const [metrics, setMetrics] = useState({});
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [socket, setSocket] = useState(null);

  const connectWebSocket = async (backendUrl) => {
    try {
      console.log('Attempting WebSocket connection to:', backendUrl);
      
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
      });

      newSocket.on('connect', () => {
        console.log('WebSocket connected successfully to:', backendUrl);
        setConnectionStatus('connected');
      });

      newSocket.on('metrics', (data) => {
        console.log('Received metrics:', data);
        setMetrics(data);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setConnectionStatus('disconnected');
      });

      newSocket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        setConnectionStatus('error');
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
    const urls = [
      await getBestBackendUrl(),
      `http://${window.location.hostname}:30400`,
      `http://${window.location.hostname}:4000`,
      'http://localhost:30400',
      'http://localhost:4000',
    ];

    for (const url of urls) {
      try {
        console.log('Testing WebSocket connection to:', url);
        
        // First test if the backend is reachable
        const backendReachable = await testBackendConnection(url);
        if (!backendReachable) {
          console.log('Backend not reachable at:', url);
          continue;
        }

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
    console.log('Starting polling fallback for metrics');
    
    const pollMetrics = async () => {
      try {
        const backendUrl = await getBestBackendUrl();
        const response = await fetch(`${backendUrl}/api/metrics`);
        
        if (response.ok) {
          const data = await response.json();
          setMetrics(data);
          setConnectionStatus('polling');
        } else {
          console.error('Polling failed with status:', response.status);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    // Poll every 5 seconds
    const pollInterval = setInterval(pollMetrics, 5000);
    
    // Initial poll
    pollMetrics();

    return pollInterval;
  };

  useEffect(() => {
    let pollInterval = null;
    let mounted = true;

    const initialize = async () => {
      if (!mounted) return;

      // Try WebSocket connections first
      const socketConnection = await tryMultipleConnections();
      
      if (!socketConnection && mounted) {
        // If WebSocket fails, fall back to polling
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

  const contextValue = {
    metrics,
    connectionStatus,
    reconnect: tryMultipleConnections,
  };
  
  return (
    <WsContext.Provider value={contextValue}>
      {children}
    </WsContext.Provider>
  );
}

export const useWsContext = () => useContext(WsContext);