import { mkdir, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';
import { Page } from 'playwright';
import type { Action, DomSnapshot, VisionSnapshot, HistoryEntry } from '../types/index.js';

export class RunLogger {
  private runDir: string;
  private actionsFile: string;
  private domDir: string;
  private visionDir: string;
  private screenshotsDir: string;

  constructor(runId: string) {
    this.runDir = join(process.cwd(), 'runs', runId);
    this.actionsFile = join(this.runDir, 'actions.jsonl');
    this.domDir = join(this.runDir, 'domSnapshots');
    this.visionDir = join(this.runDir, 'visionSnapshots');
    this.screenshotsDir = join(this.runDir, 'screenshots');
  }

  async init(): Promise<void> {
    await mkdir(this.runDir, { recursive: true });
    await mkdir(this.domDir, { recursive: true });
    await mkdir(this.visionDir, { recursive: true });
    await mkdir(this.screenshotsDir, { recursive: true });
    await writeFile(this.actionsFile, '');
  }

  async logAction(step: number, action: Action, result: string, error?: string): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      step,
      action,
      result,
      error,
    };
    await appendFile(this.actionsFile, JSON.stringify(entry) + '\n');
  }

  async logDomSnapshot(step: number, dom: DomSnapshot): Promise<void> {
    const file = join(this.domDir, `${step}.json`);
    await writeFile(file, JSON.stringify(dom, null, 2));
  }

  async logVisionSnapshot(step: number, vision: VisionSnapshot | null): Promise<void> {
    const file = join(this.visionDir, `${step}.json`);
    await writeFile(file, JSON.stringify(vision, null, 2));
  }

  async logScreenshot(step: number, page: Page): Promise<void> {
    const file = join(this.screenshotsDir, `${step}.png`);
    await page.screenshot({ path: file, fullPage: false });
  }

  async writeFinalSummary(
    goal: string,
    history: HistoryEntry[],
    finalUrl: string,
    success: boolean
  ): Promise<void> {
    const summary = {
      goal,
      totalSteps: history.length,
      success,
      finalUrl,
      history,
      completedAt: new Date().toISOString(),
    };
    const file = join(this.runDir, 'final.json');
    await writeFile(file, JSON.stringify(summary, null, 2));
  }

  getRunDir(): string {
    return this.runDir;
  }
}

export function createRunId(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
