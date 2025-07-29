import React from 'react';

export default function MetricCard({ label, value }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow text-center">
      <h3 className="text-gray-500 text-sm">{label}</h3>
      <p className="text-2xl font-semibold mt-2">{value}</p>
    </div>
  );
}