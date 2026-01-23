export interface VisionSnapshot {
  timestamp: number;
  summaryText: string;
  detectedTextSnippets: string[];
  raw?: unknown;
}

export interface VisionEvent {
  type: 'vision_snapshot';
  payload: VisionSnapshot;
}

export interface StatusEvent {
  type: 'status';
  payload: {
    connected: boolean;
    lastSnapshotAt?: number;
    agentState?: string;
    step?: number;
  };
}

export type VisionMode = 'screen' | 'camera' | 'video';

export interface OvershootResult {
  response?: string;
  text?: string;
  [key: string]: unknown;
}
