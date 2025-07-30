import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const WsContext = createContext();

export function WebsocketProvider({ children }) {
  const [metrics, setMetrics] = useState({});
  
  useEffect(() => {
    // Connect via current host - Ingress will route to backend
    const socket = io(window.location.origin, {
      path: '/socket.io'
    });
    
    socket.on('metrics', data => setMetrics(data));
    return () => socket.disconnect();
  }, []);
  
  return <WsContext.Provider value={{ metrics }}>{children}</WsContext.Provider>;
}

export const useWsContext = () => useContext(WsContext);