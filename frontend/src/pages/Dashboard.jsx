import React from 'react';
import Navbar from '../components/Navbar.jsx';
import { useWsContext } from '../context/WebsocketContext.jsx';
import MetricCard from '../components/MetricCard.jsx';

export default function Dashboard() {
  const { metrics } = useWsContext();
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <MetricCard label="CPU (%)" value={metrics.cpu} />
        <MetricCard label="Memory (%)" value={metrics.memory} />
        <MetricCard label="Disk (%)" value={metrics.disk} />
        <MetricCard label="Network (Mbps)" value={metrics.network} />
        <MetricCard label="Last Updated" value={metrics.timestamp} />
      </div>
    </div>
  );
}