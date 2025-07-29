export async function queryLLM(prompt) {
  const resp = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.REACT_APP_HF_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model: 'meta-llama/Llama-3.1-8B-Instruct:novita',
      stream: false
    })
  });

  if (!resp.ok) throw new Error(await resp.text());
  return await resp.json();
}

export async function handleAsk(prompt, setMessages, setInput) {
  setMessages(prev => [...prev, { from: 'user', text: prompt }]);
  try {
    const response = await queryLLM(prompt);
    const content = response.choices?.[0]?.message?.content ?? JSON.stringify(response);
    setMessages(prev => [...prev, { from: 'bot', text: content }]);
  } catch (error) {
    setMessages(prev => [...prev, { from: 'bot', text: `Error: ${error.message}` }]);
  }
  setInput('');
}
