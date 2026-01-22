#!/usr/bin/env node
import { chromium, Browser, Page } from 'playwright';
import { createInterface } from 'readline';
import { config } from 'dotenv';
import { captureDomSnapshot } from './services/domSnapshot.js';
import { waitForChange } from './services/changeDetector.js';
import { planNextAction } from './services/planner.js';
import { executeAction, detectCaptcha, isRiskyIntent, isAllowedDomain } from './services/executor.js';
import { RunLogger, createRunId } from './services/logger.js';
import { visionStore } from './services/visionStore.js';
import { screenStreamer } from './services/screenStreamer.js';
import type { AgentState, HistoryEntry, Action, CLIOptions } from './types/index.js';

config();

// Parse CLI args
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    goal: '',
    url: undefined, // Optional - if not provided, user navigates manually
    allowlist: (process.env.DOMAIN_ALLOWLIST || 'localhost,127.0.0.1').split(',').map(s => s.trim()),
    maxSteps: parseInt(process.env.MAX_STEPS || '40'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--goal' && args[i + 1]) {
      options.goal = args[++i];
    } else if (args[i] === '--url' && args[i + 1]) {
      options.url = args[++i];
    } else if (args[i] === '--allowlist' && args[i + 1]) {
      options.allowlist = args[++i].split(',').map(s => s.trim());
    } else if (args[i] === '--maxSteps' && args[i + 1]) {
      options.maxSteps = parseInt(args[++i]);
    }
  }

  // Goal is required
  if (!options.goal) {
    console.error('Error: --goal is required');
    console.error('Usage: npm run agent -- --goal "your goal" [--url "http://..."] [--allowlist "domain1,domain2"] [--maxSteps 40]');
    process.exit(1);
  }

  return options;
}

// Readline for terminal prompts
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function askUser(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`APPROVAL REQUIRED: ${question} (y/n): `, (answer) => {
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

async function waitForUserInput(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    rl.question(prompt, () => resolve());
  });
}

function log(step: number, message: string) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`[${timestamp}] Step ${step}: ${message}`);
}

async function runAgent(options: CLIOptions) {
  const runId = createRunId();
  const logger = new RunLogger(runId);
  await logger.init();

  console.log('='.repeat(60));
  console.log('BROWSER AGENT');
  console.log('='.repeat(60));
  console.log(`Goal: ${options.goal}`);
  console.log(`URL: ${options.url || '(manual navigation)'}`);
  console.log(`Allowlist: ${options.allowlist.join(', ')}`);
  console.log(`Max steps: ${options.maxSteps}`);
  console.log(`Run log: ${logger.getRunDir()}`);
  console.log('='.repeat(60));
  console.log('');

  // Launch browser headed
  const browser: Browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page: Page = await context.newPage();

  // Add visual indicator so user knows which browser is being controlled
  await context.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      body { border: 4px solid #ff6b00 !important; }
      body::before {
        content: '🤖 BROWSER AGENT';
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ff6b00;
        color: white;
        padding: 4px 12px;
        font-family: system-ui, sans-serif;
        font-size: 12px;
        font-weight: bold;
        z-index: 999999;
        text-align: center;
      }
      body { padding-top: 28px !important; }
    `;
    document.head.appendChild(style);
  });

  // Agent state
  const state: AgentState = {
    goal: options.goal,
    currentStep: 0,
    maxSteps: options.maxSteps,
    history: [],
    stuckCounter: 0,
    lastDomHash: '',
    running: true,
  };

  try {
    // Start screen streaming to frontend
    screenStreamer.setPage(page);
    screenStreamer.start();
    log(0, 'Screen streaming started - open Vision Bridge to view');

    // Navigation: either go to provided URL or wait for user to navigate manually
    if (options.url) {
      // URL provided - navigate to it
      log(0, `Navigating to ${options.url}`);
      await page.goto(options.url, { waitUntil: 'domcontentloaded' });
    } else {
      // No URL - manual navigation flow
      log(0, 'Opening blank page for manual navigation');
      await page.goto('about:blank');

      console.log('');
      console.log('='.repeat(60));
      console.log('MANUAL NAVIGATION MODE');
      console.log('='.repeat(60));
      console.log('');
      console.log('The Playwright browser is now open.');
      console.log('Please navigate to the page where you want the agent to operate.');
      console.log('');
      console.log('When ready, press Enter to continue...');
      console.log('');

      await waitForUserInput('');

      // Get the current URL after user navigation
      const currentUrl = page.url();
      log(0, `User navigated to: ${currentUrl}`);

      // Check domain allowlist
      if (currentUrl && currentUrl !== 'about:blank') {
        if (!isAllowedDomain(currentUrl, options.allowlist)) {
          const hostname = new URL(currentUrl).hostname;
          console.log('');
          const approved = await askUser(`Domain not in allowlist: ${hostname}. Approve?`);
          if (!approved) {
            console.log('Domain not approved. Exiting.');
            await browser.close();
            rl.close();
            return;
          }
          // Add to allowlist for this session
          options.allowlist.push(hostname);
          log(0, `Added ${hostname} to session allowlist`);
        }
      } else {
        console.log('Warning: Still on about:blank. The agent will wait for a proper page.');
      }
    }

    // Main agent loop
    while (state.running && state.currentStep < state.maxSteps) {
      state.currentStep++;
      const step = state.currentStep;

      // Capture DOM snapshot
      const dom = await captureDomSnapshot(page);
      await logger.logDomSnapshot(step, dom);

      // Get vision snapshot
      const vision = visionStore.get();
      await logger.logVisionSnapshot(step, vision);

      // Log current state
      log(step, `URL: ${dom.url}`);
      log(step, `Vision: ${vision?.summaryText?.slice(0, 60) || '[not streaming]'}`);
      log(step, `Targets: ${dom.targets.length} interactive elements`);

      // Check for CAPTCHA
      const hasCaptcha = await detectCaptcha(page);
      if (hasCaptcha) {
        log(step, 'CAPTCHA DETECTED');
        await waitForUserInput('CAPTCHA detected. Solve it manually, then press Enter: ');
        continue;
      }

      // Check stuck counter
      if (state.stuckCounter >= 3) {
        log(step, 'STUCK: No DOM changes for 3 steps');
        const proceed = await askUser("I'm stuck with no progress. Continue anyway?");
        if (!proceed) {
          log(step, 'User aborted due to stuck state');
          break;
        }
        state.stuckCounter = 0;
      }

      // Plan next action
      log(step, 'Planning next action...');
      const action = await planNextAction(
        state.goal,
        dom,
        vision,
        state.history,
        process.env.CLAUDE_API_KEY
      );

      log(step, `Action: ${action.type}${action.targetId ? ` on ${action.targetId}` : ''}`);
      if (action.expect) {
        log(step, `Expect: ${action.expect}`);
      }

      // Handle special actions
      if (action.type === 'stop') {
        log(step, action.done ? 'Goal completed!' : `Stopping: ${action.expect}`);
        await logger.logAction(step, action, 'success');
        await logger.logScreenshot(step, page);
        break;
      }

      if (action.type === 'ask_user') {
        const approved = await askUser(action.text || 'Should I proceed?');
        const historyEntry: HistoryEntry = {
          step,
          action,
          result: approved ? 'success' : 'failed',
        };
        state.history.push(historyEntry);
        await logger.logAction(step, action, approved ? 'success' : 'failed');

        if (!approved) {
          log(step, 'User declined, stopping');
          break;
        }
        continue;
      }

      // Safety: Check domain allowlist for navigation
      if (action.type === 'navigate' && action.url) {
        if (!isAllowedDomain(action.url, options.allowlist)) {
          log(step, `Domain not in allowlist: ${action.url}`);
          const approved = await askUser(`Navigate to ${action.url}? (outside allowlist)`);
          if (!approved) {
            const historyEntry: HistoryEntry = { step, action, result: 'failed', error: 'User blocked navigation' };
            state.history.push(historyEntry);
            continue;
          }
        }
      }

      // Safety: Check risky intent
      if (isRiskyIntent(action)) {
        log(step, 'RISKY ACTION DETECTED');
        const approved = await askUser(`Risky action: ${action.type}. Proceed?`);
        if (!approved) {
          const historyEntry: HistoryEntry = { step, action, result: 'failed', error: 'User blocked risky action' };
          state.history.push(historyEntry);
          continue;
        }
      }

      // Execute action
      const prevDom = dom;
      const result = await executeAction(page, action, dom);
      await logger.logScreenshot(step, page);

      const historyEntry: HistoryEntry = {
        step,
        action,
        result: result.success ? 'success' : 'failed',
        error: result.error,
      };
      state.history.push(historyEntry);
      await logger.logAction(step, action, result.success ? 'success' : 'failed', result.error);

      if (!result.success) {
        log(step, `Action failed: ${result.error}`);
        continue;
      }

      log(step, 'Action succeeded, waiting for changes...');

      // Wait for change
      const changeResult = await waitForChange(
        prevDom,
        page,
        () => visionStore.get(),
        action.timeoutMs || 5000
      );

      if (changeResult.domChanged) {
        log(step, 'DOM changed');
        state.stuckCounter = 0;
        state.lastDomHash = changeResult.newDom.pageHash;
      } else if (changeResult.visionChanged) {
        log(step, 'Vision changed (DOM unchanged)');
      } else if (changeResult.timeout) {
        log(step, 'No changes detected (timeout)');
        state.stuckCounter++;
      }
    }

    if (state.currentStep >= state.maxSteps) {
      log(state.currentStep, 'Max steps reached');
    }
  } catch (error) {
    console.error('Agent error:', error);
  } finally {
    // Stop screen streaming
    screenStreamer.stop();

    // Write final summary
    await logger.writeFinalSummary(
      state.goal,
      state.history,
      page.url(),
      state.history.some(h => h.action.done)
    );

    console.log('');
    console.log('='.repeat(60));
    console.log(`Run completed. Logs: ${logger.getRunDir()}`);
    console.log('='.repeat(60));

    await browser.close();
    rl.close();
  }
}

// Main
const options = parseArgs();
runAgent(options).catch(console.error);
