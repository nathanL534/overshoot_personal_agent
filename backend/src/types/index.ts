import { z } from 'zod';

// Vision Snapshot from frontend
export interface VisionSnapshot {
  timestamp: number;
  summaryText: string;
  detectedTextSnippets: string[];
  raw?: unknown;
}

// Action schema with Zod for validation
export const ActionSchema = z.object({
  type: z.enum([
    'propose',
    'move_mouse',
    'click',
    'type_text',
    'press_key',
    'wait',
    'stop',
    'ask_user'
  ]),
  x: z.number().optional(),
  y: z.number().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  timeoutMs: z.number().default(5000),
  risk: z.enum(['low', 'medium', 'high']).default('low'),
  rationale: z.string(),
  expect: z.string(),
  done: z.boolean().default(false),
});

export type Action = z.infer<typeof ActionSchema>;

// WebSocket message types
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

export type WSMessageFromClient = VisionEvent;
export type WSMessageToClient = StatusEvent;

// History entry for planner context
export interface HistoryEntry {
  step: number;
  action: Action;
  result: 'success' | 'failed' | 'skipped' | 'pending';
  approved?: boolean;
  error?: string;
  timestamp: number;
}

// Agent state
export interface AgentState {
  goal: string;
  mode: 'proposal' | 'execute';
  currentStep: number;
  maxSteps: number;
  history: HistoryEntry[];
  running: boolean;
  waitingForApproval: boolean;
  waitingForUser: boolean;
}

// CLI options
export interface CLIOptions {
  goal: string;
  mode: 'proposal' | 'execute';
  maxSteps: number;
}

// Risky keywords that require approval
export const RISKY_KEYWORDS = [
  'submit', 'send', 'publish', 'delete', 'pay', 'purchase',
  'order', 'transfer', 'confirm', 'remove', 'permission',
  'upload', 'download', 'install', 'uninstall', 'grant'
];
