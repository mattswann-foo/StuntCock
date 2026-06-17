import { useEffect, useRef, useCallback } from 'react';
import { WS_URL } from '../lib/utils.js';

export function useWebSocket(onEvent) {
  const wsRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data);
        onEventRef.current?.(event, data);
      } catch {}
    };

    ws.onclose = () => {
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, [connect]);
}
