import { useEffect, useRef, useState, useCallback } from 'react';

interface ScreenFrame {
  timestamp: number;
  frame: string; // base64
  mimeType: string;
}

interface UseScreenStreamProps {
  wsUrl: string;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

export function useScreenStream({ wsUrl, canvasRef }: UseScreenStreamProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    console.log('[ScreenStream] Connecting to', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[ScreenStream] Connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('[ScreenStream] Disconnected');
      setConnected(false);
      // Reconnect after 2s
      setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[ScreenStream] Error:', err);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'screen_frame') {
          const frame: ScreenFrame = data.payload;
          drawFrameToCanvas(frame);
          setFrameCount((c) => c + 1);
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    };

    wsRef.current = ws;
  }, [wsUrl]);

  const drawFrameToCanvas = useCallback((frame: ScreenFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Resize canvas to match image
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:${frame.mimeType};base64,${frame.frame}`;
  }, [canvasRef]);

  // Create MediaStream from canvas
  const createStream = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    try {
      // captureStream returns a MediaStream that updates when canvas changes
      const stream = canvas.captureStream(2); // 2 fps
      setMediaStream(stream);
      console.log('[ScreenStream] Created MediaStream from canvas');
      return stream;
    } catch (err) {
      console.error('[ScreenStream] Failed to create stream:', err);
      return null;
    }
  }, [canvasRef]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [connect]);

  return { connected, frameCount, mediaStream, createStream };
}
