// Shared state between server and CLI
import type { VisionSnapshot, AgentState } from './types/index.js';

let latestSnapshot: VisionSnapshot | null = null;
let currentAgentState: AgentState = 'idle';

export function getLatestSnapshot(): VisionSnapshot | null {
  return latestSnapshot;
}

export function setLatestSnapshot(snapshot: VisionSnapshot): void {
  latestSnapshot = snapshot;
}

export function getAgentState(): AgentState {
  return currentAgentState;
}

export function setAgentState(state: AgentState): void {
  currentAgentState = state;
}
