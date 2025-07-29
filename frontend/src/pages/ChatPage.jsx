import React from 'react';
import Navbar from '../components/Navbar.jsx';
import ChatWindow from '../components/ChatWindow.jsx';

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />
      <div className="flex-1">
        <ChatWindow />
      </div>
    </div>
  );
}