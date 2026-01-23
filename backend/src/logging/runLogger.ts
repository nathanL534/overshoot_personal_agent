import { mkdir, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';
import type { VisionSnapshot, HistoryEntry } from '../types/index.js';

export class RunLogger {
  private runDir: string;
  private actionsFile: string;
  private eventsFile: string;
  private visionDir: string;

  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.runDir = join(process.cwd(), 'runs', timestamp);
    this.actionsFile = join(this.runDir, 'actions.jsonl');
    this.eventsFile = join(this.runDir, 'events.log');
    this.visionDir = join(this.runDir, 'visionSnapshots');
  }

  async init(): Promise<void> {
    await mkdir(this.runDir, { recursive: true });
    await mkdir(this.visionDir, { recursive: true });
    await mkdir(join(this.runDir, 'planner_outputs'), { recursive: true });
    await writeFile(this.actionsFile, '');
    await writeFile(this.eventsFile, `Run started: ${new Date().toISOString()}\n`);
  }

  getRunDir(): string {
    return this.runDir;
  }

  async logEvent(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await appendFile(this.eventsFile, `[${timestamp}] ${message}\n`);
  }

  async logAction(entry: HistoryEntry): Promise<void> {
    await appendFile(this.actionsFile, JSON.stringify(entry) + '\n');
  }

  async logVisionSnapshot(step: number, snapshot: VisionSnapshot | null): Promise<void> {
    const file = join(this.visionDir, `${step}.json`);
    await writeFile(file, JSON.stringify(snapshot, null, 2));
  }

  async writeFinalSummary(
    goal: string,
    mode: string,
    history: HistoryEntry[]
  ): Promise<void> {
    const summary = {
      goal,
      mode,
      totalSteps: history.length,
      completedAt: new Date().toISOString(),
      finalAction: history[history.length - 1]?.action || null,
      success: history[history.length - 1]?.action?.done || false,
      history,
    };

    const file = join(this.runDir, 'final.json');
    await writeFile(file, JSON.stringify(summary, null, 2));

    await this.logEvent('Run completed');
  }
}
