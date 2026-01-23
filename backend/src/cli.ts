#!/usr/bin/env node
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { createInterface } from 'readline';
import { config } from 'dotenv';
import { captureDomSnapshot } from './services/domSnapshot.js';
import { waitForChange } from './services/changeDetector.js';
import { planNextAction } from './services/planner.js';
import { executeAction, detectCaptcha, isRiskyIntent, isAllowedDomain } from './services/executor.js';
import { solveCaptcha, detectCaptchaType } from './services/captchaSolver.js';
import { RunLogger, createRunId } from './services/logger.js';
import { visionStore } from './services/visionStore.js';
import { screenStreamer } from './services/screenStreamer.js';
import type { AgentState, HistoryEntry, CLIOptions } from './types/index.js';

config();

// Parse CLI args
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    goal: '',
    url: undefined,
    connect: undefined,
    allowlist: (process.env.DOMAIN_ALLOWLIST || 'localhost,127.0.0.1').split(',').map(s => s.trim()),
    maxSteps: parseInt(process.env.MAX_STEPS || '40'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--goal' && args[i + 1]) {
      options.goal = args[++i];
    } else if (args[i] === '--url' && args[i + 1]) {
      options.url = args[++i];
    } else if (args[i] === '--connect' && args[i + 1]) {
      options.connect = args[++i];
    } else if (args[i] === '--allowlist' && args[i + 1]) {
      options.allowlist = args[++i].split(',').map(s => s.trim());
    } else if (args[i] === '--maxSteps' && args[i + 1]) {
      options.maxSteps = parseInt(args[++i]);
    }
  }

  // Goal is required
  if (!options.goal) {
    console.error('Error: --goal is required');
    console.error('');
    printUsage();
    process.exit(1);
  }

  // Connect is required (no more launching separate browsers)
  if (!options.connect) {
    console.error('');
    console.error('='.repeat(60));
    console.error('SETUP REQUIRED: Start Chrome with remote debugging');
    console.error('='.repeat(60));
    console.error('');
    console.error('The agent needs to connect to your existing browser.');
    console.error('');
    console.error('Step 1: Close Chrome completely, then restart with:');
    console.error('');
    console.error('  # Linux:');
    console.error('  google-chrome --remote-debugging-port=9222');
    console.error('');
    console.error('  # macOS:');
    console.error('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    console.error('');
    console.error('  # Windows:');
    console.error('  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222');
    console.error('');
    console.error('Step 2: Navigate to the page you want the agent to work on');
    console.error('');
    console.error('Step 3: In Vision Bridge, pick that Chrome window');
    console.error('');
    console.error('Step 4: Run the agent with --connect:');
    console.error('');
    console.error(`  npm run agent -- --goal "${options.goal}" --connect "http://localhost:9222"`);
    console.error('');
    console.error('='.repeat(60));
    process.exit(1);
  }

  return options;
}

function printUsage() {
  console.error('Usage:');
  console.error('  npm run agent -- --goal "your goal" --connect "http://localhost:9222"');
  console.error('');
  console.error('Options:');
  console.error('  --goal        (required) Task for the agent');
  console.error('  --connect     (required) CDP endpoint (e.g., http://localhost:9222)');
  console.error('  --allowlist   Comma-separated allowed domains');
  console.error('  --maxSteps    Maximum steps (default: 40)');
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

// Connect to existing Chrome browser via CDP
async function connectToExistingBrowser(cdpEndpoint: string): Promise<{ browser: Browser; page: Page; context: BrowserContext }> {
  console.log(`Connecting to browser at ${cdpEndpoint}...`);

  const browser = await chromium.connectOverCDP(cdpEndpoint);
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    throw new Error('No browser contexts found. Make sure Chrome has at least one window open.');
  }

  const context = contexts[0];
  const pages = context.pages();

  if (pages.length === 0) {
    throw new Error('No pages found. Make sure Chrome has at least one tab open.');
  }

  // Use the first/active page
  const page = pages[0];
  console.log(`Connected to page: ${page.url()}`);

  return { browser, page, context };
}

async function runAgent(options: CLIOptions) {
  const runId = createRunId();
  const logger = new RunLogger(runId);
  await logger.init();

  console.log('='.repeat(60));
  console.log('BROWSER AGENT');
  console.log('='.repeat(60));
  console.log(`Goal: ${options.goal}`);
  console.log(`Connecting to: ${options.connect}`);
  console.log(`Allowlist: ${options.allowlist.join(', ')}`);
  console.log(`Max steps: ${options.maxSteps}`);
  console.log(`Run log: ${logger.getRunDir()}`);
  console.log('='.repeat(60));
  console.log('');

  let browser: Browser | undefined;
  let page: Page | undefined;
  let context: BrowserContext | undefined;

  try {
    // Connect to existing browser (the one Overshoot is watching)
    const connected = await connectToExistingBrowser(options.connect!);
    browser = connected.browser;
    page = connected.page;
    context = connected.context;

    console.log('');
    console.log('='.repeat(60));
    console.log('CONNECTED TO YOUR BROWSER');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Current page: ${page.url()}`);
    console.log('');
    console.log('The agent will now control this page.');
    console.log('Make sure Vision Bridge is capturing this same Chrome window!');
    console.log('');
    console.log('Press Enter to start the agent...');
    console.log('');

    await waitForUserInput('');

    // Check domain allowlist for current page
    const currentUrl = page.url();
    log(0, `Starting on: ${currentUrl}`);

    if (currentUrl && currentUrl !== 'about:blank') {
      if (!isAllowedDomain(currentUrl, options.allowlist)) {
        const hostname = new URL(currentUrl).hostname;
        console.log('');
        const approved = await askUser(`Domain not in allowlist: ${hostname}. Approve?`);
        if (!approved) {
          console.log('Domain not approved. Exiting.');
          rl.close();
          return;
        }
        options.allowlist.push(hostname);
        log(0, `Added ${hostname} to session allowlist`);
      }
    }

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

    // Start screen streaming (even in connect mode, for logging)
    screenStreamer.setPage(page);
    screenStreamer.start();
    log(0, 'Screen streaming started');

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
        const captchaType = await detectCaptchaType(page);
        log(step, `CAPTCHA DETECTED (type: ${captchaType || 'unknown'})`);

        // Try to solve automatically
        log(step, 'Attempting automatic CAPTCHA solve...');
        const solveResult = await solveCaptcha(page, process.env.CLAUDE_API_KEY);

        if (solveResult.solved) {
          log(step, `CAPTCHA solved automatically via ${solveResult.method}`);
          continue;
        }

        // Automatic solve failed, fall back to manual
        log(step, `Auto-solve failed: ${solveResult.error}`);
        await waitForUserInput('CAPTCHA requires manual solving. Solve it, then press Enter: ');
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

    // Write final summary
    await logger.writeFinalSummary(
      state.goal,
      state.history,
      page.url(),
      state.history.some(h => h.action.done)
    );

  } catch (error) {
    console.error('Agent error:', error);
  } finally {
    // Stop screen streaming
    screenStreamer.stop();

    console.log('');
    console.log('='.repeat(60));
    console.log(`Run completed. Logs: ${logger.getRunDir()}`);
    console.log('='.repeat(60));

    // Never close the user's browser - they may want to keep using it
    if (browser) {
      console.log('(Browser left open - you can continue using it)');
    }
    rl.close();
  }
}

// Main
const options = parseArgs();
runAgent(options).catch(console.error);
