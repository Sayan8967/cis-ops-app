// frontend/src/api/metrics.js - Updated for Ingress
import axios from 'axios';

// Use relative URLs - Ingress will route them correctly
export const fetchMetrics = () => axios.get('/api/metrics').then(res => res.data);

// frontend/src/context/WebsocketContext.jsx - Updated for Ingress  
import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const WsContext = createContext();

export function WebsocketProvider({ children }) {
  const [metrics, setMetrics] = useState({});
  
  useEffect(() => {
    // Connect to socket.io through the current host (Ingress will route it)
    const socket = io(window.location.origin, {
      path: '/socket.io'
    });
    
    socket.on('metrics', data => setMetrics(data));
    
    return () => socket.disconnect();
  }, []);
  
  return <WsContext.Provider value={{ metrics }}>{children}</WsContext.Provider>;
}

export const useWsContext = () => useContext(WsContext);