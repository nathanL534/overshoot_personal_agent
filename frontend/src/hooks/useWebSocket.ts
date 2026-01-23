import { useEffect, useRef, useCallback, useState } from 'react';
import type { VisionSnapshot, StatusEvent } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<StatusEvent['payload'] | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('[WS] Connecting to', WS_URL);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setConnected(false);
      setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          setStatus(data.payload);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    wsRef.current = ws;
  }, []);

  const sendSnapshot = useCallback((snapshot: VisionSnapshot) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'vision_snapshot',
      payload: snapshot,
    }));
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, status, sendSnapshot };
}
