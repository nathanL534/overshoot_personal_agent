import { Page } from 'playwright';
import type { Action, DomSnapshot, Target } from '../types/index.js';
import { findTarget } from './domSnapshot.js';

export interface ExecutionResult {
  success: boolean;
  error?: string;
}

async function getLocator(page: Page, target: Target) {
  switch (target.locatorType) {
    case 'role':
      if (target.locatorValue.role) {
        return page.getByRole(target.locatorValue.role.role as any, {
          name: target.locatorValue.role.name,
        });
      }
      break;
    case 'label':
      if (target.locatorValue.label) {
        return page.getByLabel(target.locatorValue.label.name);
      }
      break;
    case 'css':
      if (target.locatorValue.css) {
        return page.locator(target.locatorValue.css.selector);
      }
      break;
  }

  // Fallback: try by text or role
  return page.locator(`text="${target.label}"`).first();
}

export async function executeAction(
  page: Page,
  action: Action,
  dom: DomSnapshot
): Promise<ExecutionResult> {
  const timeout = action.timeoutMs || 5000;

  try {
    switch (action.type) {
      case 'click': {
        if (!action.targetId) {
          return { success: false, error: 'No targetId for click' };
        }
        const target = findTarget(dom, action.targetId);
        if (!target) {
          return { success: false, error: `Target not found: ${action.targetId}` };
        }
        const locator = await getLocator(page, target);
        await locator.click({ timeout });
        return { success: true };
      }

      case 'type_text': {
        if (!action.targetId) {
          return { success: false, error: 'No targetId for type_text' };
        }
        if (!action.text) {
          return { success: false, error: 'No text for type_text' };
        }
        const target = findTarget(dom, action.targetId);
        if (!target) {
          return { success: false, error: `Target not found: ${action.targetId}` };
        }
        const locator = await getLocator(page, target);
        await locator.fill(action.text, { timeout });
        return { success: true };
      }

      case 'press_key': {
        if (!action.key) {
          return { success: false, error: 'No key for press_key' };
        }
        await page.keyboard.press(action.key);
        return { success: true };
      }

      case 'scroll': {
        await page.mouse.wheel(0, 300);
        return { success: true };
      }

      case 'wait': {
        await page.waitForTimeout(timeout);
        return { success: true };
      }

      case 'navigate': {
        if (!action.url) {
          return { success: false, error: 'No url for navigate' };
        }
        await page.goto(action.url, { timeout, waitUntil: 'domcontentloaded' });
        return { success: true };
      }

      case 'ask_user':
      case 'stop':
        // These are handled by the orchestrator
        return { success: true };

      default:
        return { success: false, error: `Unknown action type: ${(action as any).type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// CAPTCHA detection heuristics
export async function detectCaptcha(page: Page): Promise<boolean> {
  const captchaIndicators = [
    'captcha',
    'recaptcha',
    'hcaptcha',
    "i'm not a robot",
    'verify you are human',
    'security check',
  ];

  try {
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());

    for (const indicator of captchaIndicators) {
      if (pageText.includes(indicator)) {
        return true;
      }
    }

    // Check for reCAPTCHA iframe
    const recaptchaFrame = await page.$('iframe[src*="recaptcha"]');
    if (recaptchaFrame) return true;

    // Check for hCaptcha
    const hcaptchaFrame = await page.$('iframe[src*="hcaptcha"]');
    if (hcaptchaFrame) return true;

    return false;
  } catch {
    return false;
  }
}

// Check if action text indicates risky intent
export function isRiskyIntent(action: Action): boolean {
  const riskyKeywords = [
    'submit', 'send', 'publish', 'delete', 'pay', 'purchase',
    'order', 'transfer', 'confirm', 'permissions', 'remove',
  ];

  const textToCheck = [
    action.text?.toLowerCase() || '',
    action.expect?.toLowerCase() || '',
  ].join(' ');

  return riskyKeywords.some(kw => textToCheck.includes(kw)) || action.risk === 'high';
}

// Check if URL is in allowlist
export function isAllowedDomain(url: string, allowlist: string[]): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    return allowlist.some(allowed => {
      const pattern = allowed.toLowerCase();
      return hostname === pattern || hostname.endsWith('.' + pattern);
    });
  } catch {
    return false;
  }
}
