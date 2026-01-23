import { useState, useRef, useCallback, useEffect } from 'react';
import type { VisionSnapshot, VisionMode } from '../types';

const API_URL = 'https://cluster1.overshoot.ai/api/v0.2';
const VISION_PROMPT = 'Continuously summarize what is on screen. Extract visible text, UI elements, buttons, dialogs, errors. Be concise.';
const CAPTURE_INTERVAL = 3000; // 3 seconds between captures

interface UseVisionProps {
  apiKey: string;
  mode: VisionMode;
  videoFile: File | null;
  deviceId: string | null;
  onSnapshot: (snapshot: VisionSnapshot) => void;
}

export function useVision({ apiKey, mode, videoFile, deviceId, onSnapshot }: UseVisionProps) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !apiKey) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas size to match video
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw current frame
    ctx.drawImage(video, 0, 0);

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    const base64Image = imageData.split(',')[1];

    try {
      // Send to Overshoot API
      const response = await fetch(`${API_URL}/vision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          image: base64Image,
          prompt: VISION_PROMPT,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.response || result.text || JSON.stringify(result);
      const summaryText = typeof responseText === 'string'
        ? responseText.slice(0, 1000)
        : JSON.stringify(responseText).slice(0, 1000);

      setLastResult(summaryText);

      const snapshot: VisionSnapshot = {
        timestamp: Date.now(),
        summaryText,
        detectedTextSnippets: [],
        raw: result,
      };

      onSnapshot(snapshot);
    } catch (err) {
      console.error('[Vision] API error:', err);
      // Don't set error state for transient API issues, just log
    }
  }, [apiKey, onSnapshot]);

  const start = useCallback(async () => {
    if (running || !apiKey) return;
    setError(null);

    try {
      let stream: MediaStream;

      if (mode === 'screen') {
        // Screen capture - browser will show picker
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'monitor',
          },
          audio: false,
        });
        const track = stream.getVideoTracks()[0];
        setDeviceName(track?.label || 'Screen');

        // Handle user stopping share via browser UI
        track.onended = () => {
          stop();
        };
      } else if (mode === 'video' && videoFile) {
        // Video file mode - create object URL
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;
        video.loop = true;
        await video.play();
        videoRef.current = video;
        setDeviceName(videoFile.name);

        // Create canvas for frame capture
        canvasRef.current = document.createElement('canvas');

        // Start capture interval
        intervalRef.current = setInterval(captureAndAnalyze, CAPTURE_INTERVAL);
        setRunning(true);
        return;
      } else if (mode === 'camera' && deviceId) {
        // Camera mode with specific device
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        const track = stream.getVideoTracks()[0];
        setDeviceName(track?.label || 'Camera');
      } else {
        throw new Error('Invalid mode or missing configuration');
      }

      streamRef.current = stream;

      // Create hidden video element
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;

      // Create canvas for frame capture
      canvasRef.current = document.createElement('canvas');

      // Start capture interval
      intervalRef.current = setInterval(captureAndAnalyze, CAPTURE_INTERVAL);

      // Capture first frame immediately
      setTimeout(captureAndAnalyze, 500);

      setRunning(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start capture';
      setError(message);
      console.error('[Vision] Start error:', err);
    }
  }, [running, apiKey, mode, videoFile, deviceId, captureAndAnalyze]);

  const stop = useCallback(() => {
    // Stop interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clean up video element
    if (videoRef.current) {
      videoRef.current.pause();
      if (videoRef.current.src) {
        URL.revokeObjectURL(videoRef.current.src);
      }
      videoRef.current = null;
    }

    canvasRef.current = null;
    setRunning(false);
    setLastResult('');
    setDeviceName('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { running, error, lastResult, deviceName, start, stop };
}
