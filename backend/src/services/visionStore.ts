import type { VisionSnapshot } from '../types/index.js';

// Simple in-memory store for latest vision snapshot
class VisionStore {
  private latestSnapshot: VisionSnapshot | null = null;
  private lastUpdateTime: number = 0;

  update(snapshot: VisionSnapshot): void {
    this.latestSnapshot = snapshot;
    this.lastUpdateTime = Date.now();
  }

  get(): VisionSnapshot | null {
    return this.latestSnapshot;
  }

  getTimeSinceLastUpdate(): number {
    if (this.lastUpdateTime === 0) return Infinity;
    return Date.now() - this.lastUpdateTime;
  }

  isStale(thresholdMs: number = 3000): boolean {
    return this.getTimeSinceLastUpdate() > thresholdMs;
  }

  clear(): void {
    this.latestSnapshot = null;
    this.lastUpdateTime = 0;
  }
}

export const visionStore = new VisionStore();
