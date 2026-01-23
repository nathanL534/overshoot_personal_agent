#!/usr/bin/env node
import { config } from 'dotenv';
import { Orchestrator } from './agent/orchestrator.js';
import { getLatestSnapshot, setAgentState } from './server.js';
import type { CLIOptions, AgentState } from './types/index.js';

config();

// Parse CLI arguments
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    goal: '',
    mode: (process.env.AGENT_MODE as 'proposal' | 'execute') || 'proposal',
    maxSteps: parseInt(process.env.MAX_STEPS || '30'),
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--goal' && args[i + 1]) {
      options.goal = args[++i];
    } else if (args[i] === '--mode' && args[i + 1]) {
      const mode = args[++i];
      if (mode === 'proposal' || mode === 'execute') {
        options.mode = mode;
      }
    } else if (args[i] === '--maxSteps' && args[i + 1]) {
      options.maxSteps = parseInt(args[++i]);
    } else if (!args[i].startsWith('--') && !options.goal) {
      // Treat as goal if no flag
      options.goal = args[i];
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  if (!options.goal) {
    console.error('Error: Goal is required');
    console.error('Usage: npm run agent -- --goal "your goal" [--mode proposal|execute] [--maxSteps 30]');
    process.exit(1);
  }

  console.log('Starting Screen Copilot Agent...');
  console.log('Make sure the backend server is running (npm run backend)\n');

  // Give server a moment to be ready
  await new Promise(r => setTimeout(r, 1000));

  const orchestrator = new Orchestrator(
    options,
    getLatestSnapshot,
    (state: AgentState) => setAgentState(state)
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    orchestrator.stop();
    process.exit(0);
  });

  await orchestrator.run();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
