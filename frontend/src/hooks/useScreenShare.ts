import { useState, useRef, useCallback, useEffect } from 'react';

interface UseScreenShareProps {
  onFrame: (imageData: string) => void;
  intervalMs?: number;
}

export function useScreenShare({ onFrame, intervalMs = 3000 }: UseScreenShareProps) {
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);

    // Convert to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    onFrame(imageData);
  }, [onFrame]);

  const startSharing = useCallback(async () => {
    try {
      setError(null);

      // Request screen/window share - browser shows picker
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      streamRef.current = stream;

      // Create hidden video element to receive stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      videoRef.current = video;

      // Create hidden canvas for frame capture
      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;

      // Wait for video to be ready
      await video.play();

      // Handle stream end (user clicks "Stop sharing")
      stream.getVideoTracks()[0].onended = () => {
        stopSharing();
      };

      setSharing(true);

      // Start capturing frames
      intervalRef.current = setInterval(captureFrame, intervalMs);
      // Capture first frame immediately
      setTimeout(captureFrame, 500);

    } catch (err) {
      console.error('[ScreenShare] Error:', err);
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Screen sharing was denied. Please try again and select a window.');
        } else {
          setError(err.message);
        }
      }
    }
  }, [captureFrame, intervalMs]);

  const stopSharing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }

    setSharing(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSharing();
    };
  }, [stopSharing]);

  return {
    sharing,
    error,
    startSharing,
    stopSharing,
    // Expose video element for preview
    getVideoElement: () => videoRef.current,
  };
}
