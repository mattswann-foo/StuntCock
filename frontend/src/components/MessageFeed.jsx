// StuntCock — Live message feed, updated via WebSocket
import React, { useEffect, useRef, useState } from 'react';
import { API, formatTime, formatDate, getAuthHeaders } from '../lib/utils.js';

function ResponseBadge({ type, ruleName }) {
  if (type === 'llm') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: 'rgba(232,54,93,0.15)', color: '#E8365D', border: '1px solid rgba(232,54,93,0.3)' }}>
      ♥ Claude
    </span>
  );
  if (type === 'static' || type === 'template') return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
      title={ruleName}
      style={{ background: 'rgba(61,114,232,0.15)', color: '#3D72E8', border: '1px solid rgba(61,114,232,0.3)' }}>
      ⚡ {ruleName || 'Rule'}
    </span>
  );
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
      silent
    </span>
  );
}

function Avatar({ sender }) {
  const initials = (sender || '??').slice(-2);
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
      style={{
        background: 'linear-gradient(135deg, rgba(61,114,232,0.3), rgba(61,114,232,0.1))',
        border: '1px solid rgba(61,114,232,0.3)',
        color: '#3D72E8',
      }}>
      {initials}
    </div>
  );
}

export default function MessageFeed({ liveMessages }) {
  const [messages, setMessages] = useState([]);
  const [newKeys, setNewKeys] = useState(new Set());
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/messages?limit=50`, { headers: { ...getAuthHeaders() } })
      .then(r => r.json())
      .then(data => setMessages(data.reverse()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!liveMessages?.length) return;
    const latest = liveMessages[liveMessages.length - 1];
    if (!latest) return;
    const key = `${latest.timestamp}-${latest.sender}`;
    setMessages(prev => {
      if (prev.some(m => `${m.timestamp}-${m.sender}` === key)) return prev;
      return [...prev, latest];
    });
    setNewKeys(prev => new Set([...prev, key]));
    setTimeout(() => setNewKeys(prev => { const n = new Set(prev); n.delete(key); return n; }), 800);
  }, [liveMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(61,114,232,0.1)', border: '1px solid rgba(61,114,232,0.2)' }}>
          <img src="/sc_bubble.jpg" alt="" className="w-10 h-10 opacity-70" style={{ objectFit: 'cover', borderRadius: '22%' }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white/40">No messages yet</p>
          <p className="text-xs mt-1 text-white/25">StuntCock is listening…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
      {messages.map((msg, i) => {
        const key = `${msg.timestamp || i}-${msg.sender}`;
        const isNew = newKeys.has(key);
        return (
          <div key={key}
            className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl transition-all ${isNew ? 'animate-slide-up' : ''}`}
            style={{
              background: isNew
                ? 'rgba(61,114,232,0.08)'
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${isNew ? 'rgba(61,114,232,0.25)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <Avatar sender={msg.sender} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-white text-sm font-semibold truncate">{msg.sender}</span>
                {msg.platform === 'whatsapp' && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(37,211,102,0.12)', color: '#25D366', border: '1px solid rgba(37,211,102,0.25)' }}>
                    WhatsApp
                  </span>
                )}
                {msg.group_id && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                    group
                  </span>
                )}
                <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {formatDate(msg.timestamp)} {formatTime(msg.timestamp)}
                </span>
              </div>
              <p className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>{msg.message_body}</p>
              {msg.response_sent && (
                <p className="text-xs mt-1.5 truncate flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  <span style={{ color: '#3D72E8' }}>↩</span> {msg.response_sent}
                </p>
              )}
            </div>
            <div className="flex-shrink-0 pt-0.5">
              <ResponseBadge type={msg.response_type} ruleName={msg.rule_name} />
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
