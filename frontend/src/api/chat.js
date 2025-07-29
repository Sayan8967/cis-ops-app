// LLM API Call Logic
export async function queryLLM(prompt) {
  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REACT_APP_HF_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'meta-llama/Llama-3.1-8B-Instruct:novita',
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${errorText}`);
  }

  return await response.json();
}

export async function handleAsk(prompt, setMessages, setInput) {
  // Add user message to the chat
  setMessages(prev => [...prev, { 
    from: 'user', 
    text: prompt, 
    timestamp: new Date().toISOString() 
  }]);

  try {
    const response = await queryLLM(prompt);
    
    // Extract and display the assistant's response
    if (response.choices && response.choices[0]?.message?.content) {
      setMessages(prev => [...prev, { 
        from: 'bot', 
        text: response.choices[0].message.content, 
        timestamp: new Date().toISOString() 
      }]);
    } else {
      setMessages(prev => [...prev, { 
        from: 'bot', 
        text: JSON.stringify(response), 
        timestamp: new Date().toISOString() 
      }]);
    }
  } catch (error) {
    setMessages(prev => [...prev, { 
      from: 'bot', 
      text: `Error: ${error.message}`, 
      timestamp: new Date().toISOString() 
    }]);
  }
  
  setInput('');
}