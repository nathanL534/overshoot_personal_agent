#!/usr/bin/env node
/**
 * Launch a Chrome browser with remote debugging enabled.
 * Use this browser for both Vision Bridge (screen share) and the agent (--connect).
 *
 * Usage: npm run browser
 */

import { chromium } from 'playwright';

const PORT = 9222;

async function launchBrowser() {
  console.log('='.repeat(60));
  console.log('LAUNCHING BROWSER WITH REMOTE DEBUGGING');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Debugging port: ${PORT}`);
  console.log('');

  const browser = await chromium.launch({
    headless: false,
    args: [
      `--remote-debugging-port=${PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto('about:blank');

  console.log('Browser launched successfully!');
  console.log('');
  console.log('='.repeat(60));
  console.log('NEXT STEPS:');
  console.log('='.repeat(60));
  console.log('');
  console.log('1. Navigate to the page you want the agent to work on');
  console.log('');
  console.log('2. In Vision Bridge (http://localhost:5173):');
  console.log('   - Click "Pick Window/Tab"');
  console.log('   - Select THIS browser window');
  console.log('');
  console.log('3. Run the agent:');
  console.log('   npm run agent -- --goal "your goal" --connect "http://localhost:9222"');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('Press Ctrl+C to close the browser when done.');
  console.log('');

  // Keep the process alive
  await new Promise(() => {});
}

launchBrowser().catch(console.error);
