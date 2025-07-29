import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { logout } = useAuthContext();
  return (
    <nav className="bg-blue-600 p-4 text-white flex justify-between">
      <div className="space-x-4">
        <Link className="hover:underline" to="/dashboard">Dashboard</Link>
        <Link className="hover:underline" to="/chat">Chat</Link>
      </div>
      <button onClick={logout} className="bg-red-500 px-3 py-1 rounded">Logout</button>
    </nav>
  );
}