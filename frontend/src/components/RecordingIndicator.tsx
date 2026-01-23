interface RecordingIndicatorProps {
  deviceName: string;
  onStop: () => void;
}

export function RecordingIndicator({ deviceName, onStop }: RecordingIndicatorProps) {
  return (
    <div className="recording-indicator">
      <div className="recording-status">
        <span className="recording-dot"></span>
        <span className="recording-text">Recording</span>
      </div>
      <div className="recording-device">
        {deviceName || 'Camera'}
      </div>
      <button className="stop-button" onClick={onStop}>
        ■ Stop Capture
      </button>
    </div>
  );
}
