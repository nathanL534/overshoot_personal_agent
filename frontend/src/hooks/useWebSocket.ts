import { useEffect, useRef, useCallback, useState } from 'react';
import type { VisionSnapshot, LogEvent } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEvent['payload'][]>([]);

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
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'log') {
          setLogs((prev) => [...prev.slice(-49), data.payload]);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    wsRef.current = ws;
  }, []);

  const sendSnapshot = useCallback((snapshot: VisionSnapshot) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send snapshot');
      return;
    }

    wsRef.current.send(JSON.stringify({
      type: 'vision_snapshot',
      payload: snapshot,
    }));
  }, []);

  const sendUserResponse = useCallback((approved: boolean, text?: string) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'user_response',
      payload: { approved, text },
    }));
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, logs, sendSnapshot, sendUserResponse };
}
