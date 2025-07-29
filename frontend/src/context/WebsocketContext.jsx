import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
const WsContext = createContext();
export function WebsocketProvider({ children }) {
  const [metrics, setMetrics] = useState({});
  useEffect(() => {
    const socket = io('http://localhost:4000');
    socket.on('metrics', data => setMetrics(data));
    return () => socket.disconnect();
  }, []);
  return <WsContext.Provider value={{ metrics }}>{children}</WsContext.Provider>;
}
export const useWsContext = () => useContext(WsContext);