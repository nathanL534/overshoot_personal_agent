import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useVision } from './hooks/useVision';
import { ConsentModal } from './components/ConsentModal';
import { RecordingIndicator } from './components/RecordingIndicator';
import type { VisionSnapshot, VisionMode } from './types';
import './App.css';

const DEFAULT_API_KEY = import.meta.env.VITE_OVERSHOOT_API_KEY || '';

function App() {
  const [consented, setConsented] = useState(false);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [mode, setMode] = useState<VisionMode>('screen');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enumerate cameras when consented
  useEffect(() => {
    if (!consented) return;

    async function getCameras() {
      try {
        // Request permission first to get device labels
        await navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => stream.getTracks().forEach(t => t.stop()));

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        setCameras(videoDevices);

        // Auto-select OBS Virtual Camera if found
        const obsDevice = videoDevices.find(d =>
          d.label.toLowerCase().includes('obs') ||
          d.label.toLowerCase().includes('virtual')
        );
        if (obsDevice) {
          setSelectedDeviceId(obsDevice.deviceId);
        } else if (videoDevices.length > 0) {
          setSelectedDeviceId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error('Failed to enumerate cameras:', err);
      }
    }

    getCameras();
  }, [consented]);

  const { connected, status, sendSnapshot } = useWebSocket();

  const handleSnapshot = useCallback((snapshot: VisionSnapshot) => {
    sendSnapshot(snapshot);
    setSnapshotCount((c) => c + 1);
  }, [sendSnapshot]);

  const { running, error, lastResult, deviceName, start, stop } = useVision({
    apiKey,
    mode,
    videoFile,
    deviceId: selectedDeviceId || null,
    onSnapshot: handleSnapshot,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
    }
  };

  const handleStart = () => {
    start();
  };

  const handleStop = () => {
    stop();
  };

  // Show consent modal first
  if (!consented) {
    return <ConsentModal onConsent={() => setConsented(true)} />;
  }

  return (
    <div className="app">
      <header>
        <h1>Screen Copilot</h1>
        <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? '● Connected' : '○ Disconnected'}
        </div>
      </header>

      {running && (
        <RecordingIndicator deviceName={deviceName} onStop={handleStop} />
      )}

      <main>
        {!running ? (
          <section className="setup">
            <h2>Setup</h2>

            <div className="field">
              <label>Overshoot API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="ovs_..."
              />
            </div>

            <div className="field">
              <label>Input Source</label>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="screen"
                    checked={mode === 'screen'}
                    onChange={() => setMode('screen')}
                  />
                  Screen Capture (Recommended)
                </label>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="camera"
                    checked={mode === 'camera'}
                    onChange={() => setMode('camera')}
                  />
                  Camera
                </label>
                <label>
                  <input
                    type="radio"
                    name="mode"
                    value="video"
                    checked={mode === 'video'}
                    onChange={() => setMode('video')}
                  />
                  Video File
                </label>
              </div>
            </div>

            {mode === 'screen' && (
              <div className="info-box">
                <h3>How it works</h3>
                <ol>
                  <li>Click "Start Screen Capture" below</li>
                  <li>Browser will ask you to pick a screen, window, or tab</li>
                  <li>Select what you want the AI to see</li>
                  <li>Your screen will be analyzed every 3 seconds</li>
                </ol>
              </div>
            )}

            {mode === 'camera' && (
              <div className="field">
                <label>Select Camera</label>
                <select
                  className="camera-select"
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                >
                  {cameras.length === 0 && (
                    <option value="">No cameras found</option>
                  )}
                  {cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label || `Camera ${camera.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {mode === 'video' && (
              <div className="field">
                <label>Select Video</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                />
                {videoFile && <span className="file-name">{videoFile.name}</span>}
              </div>
            )}

            {error && <div className="error">{error}</div>}

            <button
              className="start-button"
              onClick={handleStart}
              disabled={!apiKey || (mode === 'video' && !videoFile) || (mode === 'camera' && !selectedDeviceId)}
            >
              {mode === 'screen' ? '🖥️ Start Screen Capture' : mode === 'camera' ? '📷 Start Camera' : '🎬 Start Video'}
            </button>
          </section>
        ) : (
          <section className="running">
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Snapshots sent:</span>
                <span className="stat-value">{snapshotCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Agent status:</span>
                <span className="stat-value">{status?.agentState || 'idle'}</span>
              </div>
              {status?.step && (
                <div className="stat">
                  <span className="stat-label">Current step:</span>
                  <span className="stat-value">{status.step}</span>
                </div>
              )}
            </div>

            <div className="latest-result">
              <h3>Latest Vision Result</h3>
              <pre>{lastResult || '(waiting for results...)'}</pre>
            </div>
          </section>
        )}

        <section className="instructions">
          <h2>How It Works</h2>
          <ol>
            <li><strong>Screen Capture</strong> records your screen every 3 seconds</li>
            <li><strong>Overshoot AI</strong> analyzes what's visible</li>
            <li><strong>Backend</strong> receives vision snapshots via WebSocket</li>
            <li><strong>Agent CLI</strong> uses Claude to plan actions based on your goal</li>
            <li><strong>You approve</strong> any actions before execution</li>
          </ol>

          <h3>Run the Agent</h3>
          <pre className="code-block">npm run agent -- --goal "Your goal here" --mode proposal</pre>
        </section>
      </main>

      <footer>
        <p className="warning">
          ⚠️ <strong>Hackathon Demo</strong> - Overshoot API key is exposed in client code. Do not use production keys.
        </p>
      </footer>
    </div>
  );
}

export default App;
