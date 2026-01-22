import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useVision } from './hooks/useVision';
import { useScreenShare } from './hooks/useScreenShare';
import type { VisionSnapshot, VisionMode } from './types';
import './App.css';

const DEFAULT_API_KEY = import.meta.env.VITE_OVERSHOOT_API_KEY || '';
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

type AppMode = VisionMode | 'screen' | 'pick';

function App() {
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [mode, setMode] = useState<AppMode>('pick'); // Default to pick window mode
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [screenFrameCount, setScreenFrameCount] = useState(0);
  const [pickFrameCount, setPickFrameCount] = useState(0);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pickPreviewRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const screenWsRef = useRef<WebSocket | null>(null);

  const { connected, logs, sendSnapshot } = useWebSocket();

  const handleSnapshot = useCallback((snapshot: VisionSnapshot) => {
    sendSnapshot(snapshot);
    setSnapshotCount((c) => c + 1);
  }, [sendSnapshot]);

  // Handle frames from screen share (pick mode)
  const handlePickFrame = useCallback((imageData: string) => {
    setPickFrameCount((c) => c + 1);

    // Draw to preview canvas
    const canvas = pickPreviewRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
        };
        img.src = imageData;
      }
    }

    // Send frame to backend as vision snapshot
    // Extract base64 data (remove data:image/jpeg;base64, prefix)
    const base64 = imageData.split(',')[1];
    if (base64) {
      // Send as a simple snapshot - Overshoot will analyze via canvas
      const snapshot: VisionSnapshot = {
        timestamp: Date.now(),
        summaryText: `[Screen capture frame ${pickFrameCount + 1}]`,
        detectedTextSnippets: [],
        raw: { frame: base64, type: 'screen_share' },
      };
      sendSnapshot(snapshot);
    }
  }, [sendSnapshot, pickFrameCount]);

  const {
    sharing: pickSharing,
    error: pickError,
    startSharing: startPick,
    stopSharing: stopPick,
  } = useScreenShare({
    onFrame: handlePickFrame,
    intervalMs: 3000,
  });

  const { running, error, lastResult, start, stop } = useVision({
    apiKey,
    mode: mode === 'pick' ? 'screen' : mode, // Map pick to screen for vision
    videoFile,
    cameraFacing,
    canvasRef: mode === 'pick' ? pickPreviewRef : canvasRef,
    onSnapshot: handleSnapshot,
  });

  // Connect to WebSocket for screen frames (playwright mode)
  useEffect(() => {
    if (mode !== 'screen') return;

    const connect = () => {
      console.log('[ScreenStream] Connecting...');
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[ScreenStream] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'screen_frame') {
            drawFrame(data.payload);
            setScreenFrameCount((c) => c + 1);
          }
        } catch {
          // Ignore
        }
      };

      ws.onclose = () => {
        console.log('[ScreenStream] Disconnected, reconnecting...');
        setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('[ScreenStream] Error:', err);
      };

      screenWsRef.current = ws;
    };

    connect();

    return () => {
      screenWsRef.current?.close();
    };
  }, [mode]);

  const drawFrame = (payload: { frame: string; mimeType: string }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:${payload.mimeType};base64,${payload.frame}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.src = URL.createObjectURL(file);
      }
    }
  };

  const handleStart = async () => {
    if (mode === 'pick') {
      // Start screen share picker
      await startPick();
      // Also start vision processing
      start();
      return;
    }

    if (mode === 'camera' && showPreview && videoPreviewRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing === 'user' ? 'user' : 'environment' },
        });
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      } catch (err) {
        console.error('Camera access error:', err);
      }
    }
    start();
  };

  const handleStop = () => {
    if (mode === 'pick') {
      stopPick();
    }
    stop();
    if (videoPreviewRef.current?.srcObject) {
      const stream = videoPreviewRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoPreviewRef.current.srcObject = null;
    }
  };

  const isRunning = running || pickSharing;
  const currentError = error || pickError;

  return (
    <div className="app">
      <header>
        <h1>Vision Bridge</h1>
        <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main>
        <section className="config">
          <h2>Configuration</h2>

          <div className="field">
            <label>Overshoot API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="ovs_..."
              disabled={isRunning}
            />
          </div>

          <div className="field">
            <label>Mode</label>
            <div className="radio-group">
              <label className="radio-highlight">
                <input
                  type="radio"
                  name="mode"
                  value="pick"
                  checked={mode === 'pick'}
                  onChange={() => setMode('pick')}
                  disabled={isRunning}
                />
                🖱️ Pick Window/Tab (click to select any window)
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="screen"
                  checked={mode === 'screen'}
                  onChange={() => setMode('screen')}
                  disabled={isRunning}
                />
                Playwright Browser (automatic)
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="camera"
                  checked={mode === 'camera'}
                  onChange={() => setMode('camera')}
                  disabled={isRunning}
                />
                Live Camera
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="video"
                  checked={mode === 'video'}
                  onChange={() => setMode('video')}
                  disabled={isRunning}
                />
                Video File
              </label>
            </div>
          </div>

          {mode === 'camera' && (
            <div className="field">
              <label>Camera Facing</label>
              <select
                value={cameraFacing}
                onChange={(e) => setCameraFacing(e.target.value as 'user' | 'environment')}
                disabled={isRunning}
              >
                <option value="environment">Environment (Back)</option>
                <option value="user">User (Front)</option>
              </select>
            </div>
          )}

          {mode === 'video' && (
            <div className="field">
              <label>Video File</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileChange}
                disabled={isRunning}
              />
              {videoFile && <span className="file-name">{videoFile.name}</span>}
            </div>
          )}

          <div className="field checkbox">
            <label>
              <input
                type="checkbox"
                checked={showPreview}
                onChange={(e) => setShowPreview(e.target.checked)}
                disabled={isRunning}
              />
              Show Preview
            </label>
          </div>

          <div className="actions">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={!apiKey || (mode === 'video' && !videoFile)}
                className={mode === 'pick' ? 'pick-button' : ''}
              >
                {mode === 'pick' ? '🖱️ Click to Pick Window' : 'Start Vision'}
              </button>
            ) : (
              <button onClick={handleStop} className="stop">
                Stop
              </button>
            )}
          </div>

          {currentError && <div className="error">{currentError}</div>}

          {mode === 'pick' && !pickSharing && (
            <div className="info-box">
              <strong>Pick Window Mode:</strong> Click the button above, then select any browser tab or window from the picker. The agent will see whatever you select.
            </div>
          )}

          {mode === 'screen' && (
            <div className="info-box">
              <strong>Playwright Mode:</strong> Run <code>npm run agent</code> to start. Screenshots stream automatically.
            </div>
          )}
        </section>

        <section className="preview">
          <h2>
            Preview
            {mode === 'pick' && pickSharing && ' (Your Selected Window)'}
            {mode === 'screen' && ' (Playwright Browser)'}
          </h2>

          {/* Canvas for pick mode */}
          {mode === 'pick' && (
            <canvas
              ref={pickPreviewRef}
              style={{
                display: showPreview ? 'block' : 'none',
                width: '100%',
                maxHeight: '400px',
                background: '#000',
                borderRadius: '8px',
                objectFit: 'contain',
              }}
            />
          )}

          {/* Canvas for screen mode (playwright) */}
          {mode === 'screen' && (
            <canvas
              ref={canvasRef}
              style={{
                display: showPreview ? 'block' : 'none',
                width: '100%',
                maxHeight: '400px',
                background: '#000',
                borderRadius: '8px',
              }}
            />
          )}

          {/* Video for camera/file mode */}
          {(mode === 'camera' || mode === 'video') && showPreview && (
            <video
              ref={videoPreviewRef}
              autoPlay
              muted
              playsInline
              style={{ display: running || videoFile ? 'block' : 'none' }}
            />
          )}

          {!showPreview && isRunning && <div className="hidden-preview">Preview hidden</div>}

          {mode === 'pick' && !pickSharing && (
            <div className="waiting-message">
              Click "Pick Window" to select a browser tab or window to watch.
            </div>
          )}

          {mode === 'screen' && screenFrameCount === 0 && (
            <div className="waiting-message">
              Waiting for screen frames from Playwright...
              <br />
              <small>Run: <code>npm run agent -- --goal "your goal"</code></small>
            </div>
          )}
        </section>

        <section className="stats">
          <h2>Status</h2>
          <div className="stat">
            <span>Running:</span>
            <span className={isRunning ? 'active' : ''}>{isRunning ? 'Yes' : 'No'}</span>
          </div>
          <div className="stat">
            <span>Vision snapshots sent:</span>
            <span>{snapshotCount}</span>
          </div>
          {mode === 'pick' && (
            <div className="stat">
              <span>Frames captured:</span>
              <span>{pickFrameCount}</span>
            </div>
          )}
          {mode === 'screen' && (
            <div className="stat">
              <span>Playwright frames:</span>
              <span>{screenFrameCount}</span>
            </div>
          )}
          <div className="stat">
            <span>WebSocket:</span>
            <span className={connected ? 'active' : ''}>{connected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </section>

        <section className="result">
          <h2>Latest Vision Result</h2>
          <pre>{lastResult || '(no result yet)'}</pre>
        </section>

        <section className="logs">
          <h2>Backend Logs</h2>
          <div className="log-list">
            {logs.length === 0 && <div className="empty">No logs yet</div>}
            {logs.map((log, i) => (
              <div key={i} className={`log-entry ${log.level}`}>
                <span className="level">[{log.level}]</span>
                <span className="message">{log.message}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <p>
          <strong>Warning:</strong> This is a hackathon demo. The Overshoot API key is exposed in client-side code.
          Do not use production keys.
        </p>
      </footer>
    </div>
  );
}

export default App;
