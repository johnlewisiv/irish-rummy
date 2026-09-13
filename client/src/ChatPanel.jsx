import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export default function ChatPanel({ chat, act, onClose, inline }) {
  const [text, setText] = useState('');
  const messagesRef = useRef(null);
  useEffect(() => {
    const panel = messagesRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [chat]);
  const send = (event) => {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    act('chat:send', { text: message });
    setText('');
  };
  return <section className={`chat-panel ${inline ? 'inline-chat' : ''}`} aria-label="Table chat">
    <header className="chat-header"><h2><Icon name="chat" /> Table chat</h2>{onClose && <button onClick={onClose} aria-label="Close chat"><Icon name="close" /></button>}</header>
    <div ref={messagesRef} className="chat-messages" role="log" aria-live="polite" aria-relevant="additions">
      {chat.length === 0 && <p className="chat-empty">Say hello to the table.</p>}
      {chat.map((message, index) => <p className="chat-message" key={message.id || index}><strong>{message.from}</strong>{message.role === 'spectator' && <small> watching</small>}<br /><span>{message.text}</span></p>)}
    </div>
    <form onSubmit={send} className="chat-form"><input aria-label="Chat message" placeholder="Message the table…" maxLength={300} value={text} onChange={(event) => setText(event.target.value)} /><button className="primary-button" disabled={!text.trim()}><Icon name="send" size={16} /> Send</button></form>
  </section>;
}
