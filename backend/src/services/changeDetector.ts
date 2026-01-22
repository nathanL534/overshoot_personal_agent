import { Page } from 'playwright';
import { captureDomSnapshot } from './domSnapshot.js';
import type { DomSnapshot, VisionSnapshot } from '../types/index.js';

// Jaccard similarity for string arrays
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

export interface ChangeResult {
  changed: boolean;
  domChanged: boolean;
  visionChanged: boolean;
  newDom: DomSnapshot;
  timeout: boolean;
}

export async function waitForChange(
  prevDom: DomSnapshot,
  page: Page,
  getLatestVision: () => VisionSnapshot | null,
  timeoutMs: number = 5000
): Promise<ChangeResult> {
  const startTime = Date.now();
  const domCheckInterval = 200;
  const visionCheckThreshold = 1000; // Only check vision after 1s of no DOM change

  let lastDomCheckTime = startTime;
  let domUnchangedSince = startTime;
  let prevVisionSnippets: string[] = getLatestVision()?.detectedTextSnippets || [];

  while (Date.now() - startTime < timeoutMs) {
    // Check DOM
    const currentDom = await captureDomSnapshot(page);
    const domChanged = currentDom.pageHash !== prevDom.pageHash ||
                       currentDom.url !== prevDom.url ||
                       currentDom.alerts.length !== prevDom.alerts.length;

    if (domChanged) {
      return {
        changed: true,
        domChanged: true,
        visionChanged: false,
        newDom: currentDom,
        timeout: false,
      };
    }

    // DOM unchanged, track duration
    const now = Date.now();
    if (now - domUnchangedSince >= visionCheckThreshold) {
      // Check vision for significant change
      const currentVision = getLatestVision();
      if (currentVision) {
        const currentSnippets = currentVision.detectedTextSnippets;
        const similarity = jaccardSimilarity(prevVisionSnippets, currentSnippets);

        if (similarity < 0.7) {
          return {
            changed: true,
            domChanged: false,
            visionChanged: true,
            newDom: currentDom,
            timeout: false,
          };
        }
      }
    }

    // Wait before next check
    await new Promise(r => setTimeout(r, domCheckInterval));
  }

  // Timeout
  const finalDom = await captureDomSnapshot(page);
  return {
    changed: false,
    domChanged: false,
    visionChanged: false,
    newDom: finalDom,
    timeout: true,
  };
}
