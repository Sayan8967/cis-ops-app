import React, { useState } from 'react';
import { handleAsk } from '../api/chat.js';

export default function ChatWindow() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const send = () => {
    if (!input.trim()) return;
    handleAsk(input, setMessages, setInput);
  };

  return (
    <div className="flex flex-col flex-1 h-screen">
      <div className="flex-1 overflow-auto p-6 space-y-4 bg-gray-100">
        {messages.map((m,i) => (
          <div key={i}
               className={`p-3 rounded-lg max-w-xs ${m.from==='user' ? 'bg-blue-200 self-end' : 'bg-white self-start'}`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="p-4 bg-white flex">
        <input
          className="flex-1 border rounded-l-lg p-2"
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter' && send()}
          placeholder="Type your message..."
        />
        <button onClick={send} className="bg-blue-600 text-white px-4 rounded-r-lg">Send</button>
      </div>
    </div>
  );
}