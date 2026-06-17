// StuntCock — Toast notifications
import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 right-5 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id}
            className="flex items-start gap-2.5 px-4 py-3 rounded-2xl text-sm max-w-xs animate-slide-up"
            style={{
              background: t.type === 'error' ? 'rgba(232,54,93,0.15)' : 'rgba(17,30,71,0.9)',
              border: `1px solid ${t.type === 'error' ? 'rgba(232,54,93,0.35)' : 'rgba(61,114,232,0.3)'}`,
              backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              color: t.type === 'error' ? '#E8365D' : 'white',
            }}>
            <span>{t.type === 'error' ? '⚠' : 'ℹ'}</span>
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
