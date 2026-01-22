// Vision Snapshot sent to backend
export interface VisionSnapshot {
  timestamp: number;
  summaryText: string;
  detectedTextSnippets: string[];
  raw?: unknown;
}

// WebSocket messages
export interface VisionEvent {
  type: 'vision_snapshot';
  payload: VisionSnapshot;
}

export interface ControlEvent {
  type: 'user_response';
  payload: {
    approved: boolean;
    text?: string;
  };
}

export interface LogEvent {
  type: 'log';
  payload: {
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: unknown;
  };
}

// Vision mode
export type VisionMode = 'camera' | 'video';

// Overshoot SDK types (partial, for our use)
export interface OvershootResult {
  response?: string;
  text?: string;
  [key: string]: unknown;
}
