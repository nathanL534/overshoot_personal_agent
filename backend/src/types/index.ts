import { z } from 'zod';

// Vision Snapshot from frontend
export interface VisionSnapshot {
  timestamp: number;
  summaryText: string;
  detectedTextSnippets: string[];
  raw?: unknown;
}

// Target element in DOM
export interface Target {
  id: string;
  role: 'button' | 'link' | 'input' | 'checkbox' | 'select' | 'other';
  label: string;
  locatorType: 'role' | 'label' | 'css';
  locatorValue: {
    role?: { role: string; name: string };
    label?: { name: string };
    css?: { selector: string };
  };
}

// DOM Snapshot
export interface DomSnapshot {
  url: string;
  title: string;
  alerts: string[];
  pageHash: string;
  targets: Target[];
}

// Action schema with Zod for validation
export const ActionSchema = z.object({
  type: z.enum(['click', 'type_text', 'press_key', 'scroll', 'wait', 'navigate', 'ask_user', 'stop']),
  targetId: z.string().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  url: z.string().optional(),
  timeoutMs: z.number().default(5000),
  risk: z.enum(['low', 'medium', 'high']).default('low'),
  expect: z.string().optional(),
  done: z.boolean().default(false),
});

export type Action = z.infer<typeof ActionSchema>;

// WebSocket message types
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

export type WSMessageFromClient = VisionEvent | ControlEvent;
export type WSMessageToClient = LogEvent;

// History entry for planner context
export interface HistoryEntry {
  step: number;
  action: Action;
  result: 'success' | 'failed' | 'pending';
  error?: string;
}

// Agent state
export interface AgentState {
  goal: string;
  currentStep: number;
  maxSteps: number;
  history: HistoryEntry[];
  stuckCounter: number;
  lastDomHash: string;
  running: boolean;
}

// CLI options
export interface CLIOptions {
  goal: string;
  url?: string; // Optional - if not provided, user navigates manually
  allowlist: string[];
  maxSteps: number;
}
