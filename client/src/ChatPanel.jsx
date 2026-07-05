// ChatPanel.jsx — in-game chat (players and spectators).
import React, { useEffect, useRef, useState } from 'react';

export default function ChatPanel({ chat, act, onClose, inline }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    act('chat:send', { text: t });
    setText('');
  };

  return (
    <div className={`bg-emerald-950/95 border border-emerald-700 rounded-2xl flex flex-col ${inline ? 'h-56' : 'h-80 shadow-2xl'}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-800">
        <b className="text-sm">Table chat</b>
        {onClose && <button onClick={onClose} className="text-emerald-300 hover:text-white">✕</button>}
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 text-sm flex flex-col gap-1">
        {chat.length === 0 && <span className="text-emerald-200/40 italic">Say hello…</span>}
        {chat.map((m, i) => (
          <div key={i}>
            <b className={m.role === 'spectator' ? 'text-purple-300' : 'text-amber-300'}>
              {m.from}{m.role === 'spectator' ? ' 👁' : ''}:
            </b>{' '}
            <span className="text-emerald-50/90">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 p-2 border-t border-emerald-800">
        <input
          className="flex-1 rounded-lg px-3 py-1.5 text-black bg-emerald-50 text-sm outline-none"
          placeholder="Message…"
          maxLength={300}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg px-3 text-sm">Send</button>
      </form>
    </div>
  );
}
