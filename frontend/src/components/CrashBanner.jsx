// StuntCock — Signal crash/reconnect banner
import React from 'react';

export default function CrashBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-3 px-5 py-3 text-sm" style={{
      background: 'rgba(232,54,93,0.12)',
      borderBottom: '1px solid rgba(232,54,93,0.25)',
      color: 'rgba(255,255,255,0.8)',
    }}>
      <span style={{ color: '#E8365D' }}>⚠</span>
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="text-xs px-2 py-1 rounded-lg transition-colors"
        style={{ color: 'rgba(232,54,93,0.7)', background: 'rgba(232,54,93,0.1)' }}>
        Dismiss
      </button>
    </div>
  );
}
