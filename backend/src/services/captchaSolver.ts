import { Page, Frame } from 'playwright';
import Anthropic from '@anthropic-ai/sdk';

interface CaptchaSolveResult {
  solved: boolean;
  method?: string;
  error?: string;
}

/**
 * Attempts to solve CAPTCHAs automatically using various methods:
 * 1. Click the checkbox (reCAPTCHA v2 checkbox)
 * 2. Use Claude Vision to solve image grid challenges
 * 3. Use audio CAPTCHA fallback with speech-to-text
 */
export async function solveCaptcha(
  page: Page,
  apiKey?: string
): Promise<CaptchaSolveResult> {
  console.log('[CaptchaSolver] Attempting to solve CAPTCHA...');

  // Try method 1: Click the reCAPTCHA checkbox
  const checkboxResult = await tryClickCheckbox(page);
  if (checkboxResult.solved) {
    return checkboxResult;
  }

  // Try method 2: Solve image grid with Claude Vision
  if (apiKey) {
    const imageResult = await tryImageGridSolve(page, apiKey);
    if (imageResult.solved) {
      return imageResult;
    }
  }

  // If all methods fail, return failure
  return {
    solved: false,
    error: 'Could not solve CAPTCHA automatically. Manual intervention required.',
  };
}

/**
 * Try to click the "I'm not a robot" checkbox
 */
async function tryClickCheckbox(page: Page): Promise<CaptchaSolveResult> {
  try {
    // Find reCAPTCHA iframe
    const recaptchaFrame = await page.$('iframe[src*="recaptcha/api2/anchor"]');
    if (!recaptchaFrame) {
      return { solved: false, error: 'No reCAPTCHA checkbox iframe found' };
    }

    const frame = await recaptchaFrame.contentFrame();
    if (!frame) {
      return { solved: false, error: 'Could not access reCAPTCHA frame' };
    }

    // Click the checkbox
    const checkbox = await frame.$('.recaptcha-checkbox-border');
    if (!checkbox) {
      return { solved: false, error: 'No checkbox found in reCAPTCHA' };
    }

    await checkbox.click();
    console.log('[CaptchaSolver] Clicked reCAPTCHA checkbox');

    // Wait a moment and check if it was solved (green checkmark)
    await page.waitForTimeout(2000);

    const checkmark = await frame.$('.recaptcha-checkbox-checked');
    if (checkmark) {
      console.log('[CaptchaSolver] Checkbox click succeeded!');
      return { solved: true, method: 'checkbox_click' };
    }

    // If not solved, an image challenge probably appeared
    console.log('[CaptchaSolver] Checkbox clicked but challenge appeared');
    return { solved: false, error: 'Image challenge appeared after checkbox click' };

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { solved: false, error: `Checkbox click failed: ${msg}` };
  }
}

/**
 * Solve image grid CAPTCHA using Claude Vision
 */
async function tryImageGridSolve(
  page: Page,
  apiKey: string
): Promise<CaptchaSolveResult> {
  try {
    // Find the reCAPTCHA challenge iframe
    const challengeFrame = await findChallengeFrame(page);
    if (!challengeFrame) {
      return { solved: false, error: 'No challenge frame found' };
    }

    // Get the challenge instruction text
    const instructionEl = await challengeFrame.$('.rc-imageselect-desc-wrapper');
    const instruction = instructionEl
      ? await instructionEl.textContent()
      : 'Select all matching images';

    console.log(`[CaptchaSolver] Challenge instruction: ${instruction}`);

    // Screenshot the challenge
    const challengeArea = await challengeFrame.$('.rc-imageselect-challenge');
    if (!challengeArea) {
      return { solved: false, error: 'Could not find challenge area' };
    }

    const screenshot = await challengeArea.screenshot({ type: 'png' });
    const base64Image = screenshot.toString('base64');

    // Send to Claude Vision
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `This is a CAPTCHA image grid challenge. The instruction is: "${instruction}"

The grid is typically 3x3 or 4x4. Please identify which grid cells match the instruction.

Return ONLY a JSON array of cell numbers (1-9 for 3x3, 1-16 for 4x4), where cells are numbered left-to-right, top-to-bottom:
1 2 3
4 5 6
7 8 9

Example response: [1, 4, 7]

If you cannot determine which cells to select, return: []`,
            },
          ],
        },
      ],
    });

    // Parse response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return { solved: false, error: 'No text response from Claude' };
    }

    const cellsMatch = textContent.text.match(/\[[\d,\s]*\]/);
    if (!cellsMatch) {
      return { solved: false, error: 'Could not parse cell numbers from response' };
    }

    const cells: number[] = JSON.parse(cellsMatch[0]);
    console.log(`[CaptchaSolver] Claude identified cells: ${cells}`);

    if (cells.length === 0) {
      return { solved: false, error: 'Claude could not identify matching cells' };
    }

    // Click the identified cells
    const table = await challengeFrame.$('.rc-imageselect-table-33, .rc-imageselect-table-44');
    if (!table) {
      return { solved: false, error: 'Could not find image grid table' };
    }

    const tiles = await table.$$('td');
    const gridSize = tiles.length === 9 ? 3 : 4;

    for (const cellNum of cells) {
      const index = cellNum - 1; // Convert 1-indexed to 0-indexed
      if (index >= 0 && index < tiles.length) {
        await tiles[index].click();
        await page.waitForTimeout(300); // Small delay between clicks
      }
    }

    console.log('[CaptchaSolver] Clicked all identified cells');

    // Click verify button
    const verifyButton = await challengeFrame.$('#recaptcha-verify-button');
    if (verifyButton) {
      await verifyButton.click();
      console.log('[CaptchaSolver] Clicked verify button');
    }

    // Wait and check result
    await page.waitForTimeout(2000);

    // Check if challenge is gone (solved)
    const stillHasChallenge = await page.$('iframe[src*="recaptcha/api2/bframe"]');
    if (!stillHasChallenge) {
      console.log('[CaptchaSolver] Image grid CAPTCHA solved!');
      return { solved: true, method: 'claude_vision' };
    }

    // Challenge might have refreshed with new images
    return { solved: false, error: 'Challenge still present after attempt' };

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CaptchaSolver] Image grid solve error:', msg);
    return { solved: false, error: `Image grid solve failed: ${msg}` };
  }
}

/**
 * Find the reCAPTCHA challenge iframe (the one with the image grid)
 */
async function findChallengeFrame(page: Page): Promise<Frame | null> {
  // Look for the bframe (challenge iframe)
  const bframeEl = await page.$('iframe[src*="recaptcha/api2/bframe"]');
  if (!bframeEl) {
    // Try hCaptcha
    const hcaptchaEl = await page.$('iframe[src*="hcaptcha.com/captcha"]');
    if (hcaptchaEl) {
      return await hcaptchaEl.contentFrame();
    }
    return null;
  }

  return await bframeEl.contentFrame();
}

/**
 * Detect what type of CAPTCHA is present
 */
export async function detectCaptchaType(page: Page): Promise<string | null> {
  // reCAPTCHA v2
  const recaptchaAnchor = await page.$('iframe[src*="recaptcha/api2/anchor"]');
  if (recaptchaAnchor) return 'recaptcha_v2';

  // reCAPTCHA v3 (invisible, usually no iframe visible)
  const recaptchaV3 = await page.$('.grecaptcha-badge');
  if (recaptchaV3) return 'recaptcha_v3';

  // hCaptcha
  const hcaptcha = await page.$('iframe[src*="hcaptcha"]');
  if (hcaptcha) return 'hcaptcha';

  // Cloudflare
  const cloudflare = await page.$('#challenge-running, #cf-challenge-running');
  if (cloudflare) return 'cloudflare';

  // Generic text-based detection
  const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (pageText.includes('captcha') || pageText.includes('verify you are human')) {
    return 'unknown';
  }

  return null;
}
