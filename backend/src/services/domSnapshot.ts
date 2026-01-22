import { Page } from 'playwright';
import { createHash } from 'crypto';
import type { DomSnapshot, Target } from '../types/index.js';

const MAX_TARGETS = 40;

function hashString(str: string): string {
  return createHash('md5').update(str).digest('hex').slice(0, 12);
}

export async function captureDomSnapshot(page: Page): Promise<DomSnapshot> {
  const url = page.url();
  const title = await page.title();

  // Get alerts (dialog boxes)
  const alerts: string[] = [];

  // Extract interactive targets
  const targets = await page.evaluate(() => {
    const results: Array<{
      id: string;
      role: string;
      label: string;
      locatorType: string;
      locatorValue: Record<string, unknown>;
    }> = [];

    const roleMap: Record<string, string> = {
      'BUTTON': 'button',
      'A': 'link',
      'INPUT': 'input',
      'SELECT': 'select',
      'TEXTAREA': 'input',
    };

    // Get all interactive elements
    const selectors = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[onclick]',
    ];

    const elements = document.querySelectorAll(selectors.join(','));
    const seen = new Set<string>();
    let index = 0;

    elements.forEach((el) => {
      if (index >= 40) return; // MAX_TARGETS

      const htmlEl = el as HTMLElement;
      if (!htmlEl.offsetParent && htmlEl.tagName !== 'BODY') return; // Not visible

      const tag = el.tagName;
      const ariaRole = el.getAttribute('role');
      const ariaLabel = el.getAttribute('aria-label');
      const name = el.getAttribute('name');
      const id = el.getAttribute('id');
      const type = el.getAttribute('type');
      const placeholder = el.getAttribute('placeholder');
      const text = htmlEl.innerText?.trim().slice(0, 50) || '';

      // Determine role
      let role = 'other';
      if (ariaRole === 'button' || tag === 'BUTTON') role = 'button';
      else if (ariaRole === 'link' || tag === 'A') role = 'link';
      else if (ariaRole === 'checkbox' || type === 'checkbox') role = 'checkbox';
      else if (tag === 'SELECT') role = 'select';
      else if (tag === 'INPUT' || tag === 'TEXTAREA') role = 'input';

      // Build label
      let label = ariaLabel || text || placeholder || name || id || `${tag.toLowerCase()}`;
      if (type) label = `${label} [${type}]`;
      label = label.slice(0, 60);

      // Build ID
      const stableId = `${role}:${label.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}:${index}`;

      if (seen.has(stableId)) return;
      seen.add(stableId);

      // Determine best locator
      let locatorType = 'css';
      let locatorValue: Record<string, unknown> = {};

      if (ariaLabel || (role !== 'other' && text)) {
        locatorType = 'role';
        locatorValue = { role, name: ariaLabel || text };
      } else if (id) {
        locatorType = 'css';
        locatorValue = { selector: `#${id}` };
      } else if (name) {
        locatorType = 'css';
        locatorValue = { selector: `[name="${name}"]` };
      } else {
        locatorType = 'css';
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        locatorValue = { selector: classes ? `${tag.toLowerCase()}.${classes}` : tag.toLowerCase() };
      }

      results.push({
        id: stableId,
        role,
        label,
        locatorType,
        locatorValue,
      });

      index++;
    });

    return results;
  });

  // Build page hash for change detection
  const targetsSignature = targets.map(t => `${t.id}:${t.label}`).join('|');
  const pageHash = hashString(`${url}|${title}|${targetsSignature}`);

  return {
    url,
    title,
    alerts,
    pageHash,
    targets: targets.slice(0, MAX_TARGETS) as Target[],
  };
}

export function findTarget(snapshot: DomSnapshot, targetId: string): Target | undefined {
  return snapshot.targets.find(t => t.id === targetId);
}
