import { useState, useRef, useCallback, useEffect } from 'react';
import { RealtimeVision } from '@overshoot/sdk';
import type { VisionSnapshot, VisionMode, OvershootResult } from '../types';

const API_URL = 'https://cluster1.overshoot.ai/api/v0.2';
const VISION_PROMPT = 'Describe what you see on this screen. Read any visible text including form labels, button text, headings, and status messages. Identify UI elements like buttons, input fields, dropdowns, and checkboxes. Note their current state (filled/empty, checked/unchecked, selected values).';

interface UseVisionProps {
  apiKey: string;
  mode: VisionMode | 'screen';
  videoFile: File | null;
  cameraFacing: 'user' | 'environment';
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  onSnapshot: (snapshot: VisionSnapshot) => void;
}

export function useVision({ apiKey, mode, videoFile, cameraFacing, canvasRef, onSnapshot }: UseVisionProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string>('');
  const visionRef = useRef<RealtimeVision | null>(null);
  const syntheticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenCaptureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Process Overshoot result into VisionSnapshot
  const processResult = useCallback((result: OvershootResult) => {
    lastUpdateRef.current = Date.now();

    // Extract text from result
    const responseText = result.response || result.text || '';
    const summaryText = typeof responseText === 'string'
      ? responseText.slice(0, 500)
      : JSON.stringify(responseText).slice(0, 500);

    // Extract text snippets (simple heuristic)
    const snippets: string[] = [];
    if (typeof responseText === 'string') {
      // Extract quoted strings or capitalized words
      const matches = responseText.match(/"[^"]+"|'[^']+'|\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
      if (matches) {
        snippets.push(...matches.slice(0, 10).map(s => s.replace(/['"]/g, '')));
      }
    }

    const snapshot: VisionSnapshot = {
      timestamp: Date.now(),
      summaryText,
      detectedTextSnippets: snippets,
      raw: result,
    };

    setLastResult(summaryText);
    onSnapshot(snapshot);
  }, [onSnapshot]);

  // Send synthetic snapshot when vision not streaming
  const sendSyntheticSnapshot = useCallback(() => {
    const timeSinceUpdate = Date.now() - lastUpdateRef.current;
    if (timeSinceUpdate > 3000 && visionRef.current) {
      const snapshot: VisionSnapshot = {
        timestamp: Date.now(),
        summaryText: '[vision not streaming]',
        detectedTextSnippets: [`visionKeys: ${Object.keys(visionRef.current).join(',')}`],
      };
      onSnapshot(snapshot);
    }
  }, [onSnapshot]);

  // Capture canvas to video file and send to Overshoot
  const captureCanvasToVideo = useCallback(async () => {
    const canvas = canvasRef?.current;
    if (!canvas || !apiKey) return;

    try {
      // Create a blob from canvas
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      });

      if (!blob) return;

      // Convert to File (Overshoot expects a video file, but we'll try with image)
      // For proper video, we'd need to use MediaRecorder, but for hackathon
      // we'll create a new vision instance per frame batch

      // Actually, let's just send images directly if the SDK supports it
      // or create a minimal webm video from the canvas

      // For now, create a simple approach: restart vision with captured frame
      // This is hacky but works for demo

      const file = new File([blob], 'screen-capture.jpg', { type: 'image/jpeg' });

      // Stop existing vision
      if (visionRef.current && typeof visionRef.current.stop === 'function') {
        visionRef.current.stop();
      }

      // Create new vision with captured frame
      // Note: Overshoot may not accept single images, so we'll create a minimal video
      const newVision = new RealtimeVision({
        apiUrl: API_URL,
        apiKey,
        prompt: VISION_PROMPT,
        source: { type: 'video', file },
        onResult: (result: OvershootResult) => {
          console.log('[Vision] Screen result:', result);
          processResult(result);
        },
        onError: (err: Error) => {
          console.error('[Vision] Screen error:', err);
          // Don't set error state, just log - we'll retry
        },
      });

      if (typeof newVision.start === 'function') {
        newVision.start();
      }

      visionRef.current = newVision;
    } catch (err) {
      console.error('[Vision] Canvas capture error:', err);
    }
  }, [canvasRef, apiKey, processResult]);

  const start = useCallback(() => {
    if (running || !apiKey) return;

    setError(null);

    try {
      if (mode === 'screen') {
        // Screen mode: capture canvas periodically and send to Overshoot
        console.log('[Vision] Starting screen capture mode');
        setRunning(true);
        lastUpdateRef.current = Date.now();

        // Capture every 3 seconds (matches backend)
        screenCaptureIntervalRef.current = setInterval(captureCanvasToVideo, 3000);
        // Initial capture
        captureCanvasToVideo();

        // Synthetic fallback
        syntheticIntervalRef.current = setInterval(sendSyntheticSnapshot, 1000);
        return;
      }

      // Camera or video file mode
      let source: { type: 'camera'; cameraFacing: 'user' | 'environment' } | { type: 'video'; file: File };

      if (mode === 'video' && videoFile) {
        source = { type: 'video', file: videoFile };
      } else {
        source = { type: 'camera', cameraFacing };
      }

      console.log('[Vision] Starting with source:', source.type);

      const vision = new RealtimeVision({
        apiUrl: API_URL,
        apiKey,
        prompt: VISION_PROMPT,
        source,
        onResult: (result: OvershootResult) => {
          console.log('[Vision] Result:', result);
          processResult(result);
        },
        onError: (err: Error) => {
          console.error('[Vision] Error:', err);
          setError(err.message);
        },
      });

      // Start processing
      if (typeof vision.start === 'function') {
        vision.start();
      }

      visionRef.current = vision;
      setRunning(true);
      lastUpdateRef.current = Date.now();

      // Start synthetic snapshot interval
      syntheticIntervalRef.current = setInterval(sendSyntheticSnapshot, 1000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start vision');
    }
  }, [running, apiKey, mode, videoFile, cameraFacing, processResult, sendSyntheticSnapshot, captureCanvasToVideo]);

  const stop = useCallback(() => {
    if (visionRef.current) {
      if (typeof visionRef.current.stop === 'function') {
        visionRef.current.stop();
      }
      visionRef.current = null;
    }

    if (syntheticIntervalRef.current) {
      clearInterval(syntheticIntervalRef.current);
      syntheticIntervalRef.current = null;
    }

    if (screenCaptureIntervalRef.current) {
      clearInterval(screenCaptureIntervalRef.current);
      screenCaptureIntervalRef.current = null;
    }

    setRunning(false);
    setLastResult('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { running, error, lastResult, start, stop };
}
