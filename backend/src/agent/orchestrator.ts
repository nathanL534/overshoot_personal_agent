import { createInterface } from 'readline';
import { planNextAction } from './planner_cli.js';
import { checkActionSafety, isInputAction } from './safety.js';
import { executeAction } from './executor.js';
import { RunLogger } from '../logging/runLogger.js';
import type { AgentState, VisionSnapshot, HistoryEntry, CLIOptions, Action } from '../types/index.js';

export class Orchestrator {
  private state: AgentState;
  private logger: RunLogger;
  private rl: ReturnType<typeof createInterface>;
  private getLatestSnapshot: () => VisionSnapshot | null;
  private broadcastStatus: (state: AgentState) => void;

  constructor(
    options: CLIOptions,
    getLatestSnapshot: () => VisionSnapshot | null,
    broadcastStatus: (state: AgentState) => void
  ) {
    this.state = {
      goal: options.goal,
      mode: options.mode,
      currentStep: 0,
      maxSteps: options.maxSteps,
      history: [],
      running: false,
      waitingForApproval: false,
      waitingForUser: false,
    };

    this.logger = new RunLogger();
    this.getLatestSnapshot = getLatestSnapshot;
    this.broadcastStatus = broadcastStatus;

    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async askUser(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  private async askApproval(prompt: string): Promise<boolean> {
    const answer = await this.askUser(`\n🔒 APPROVAL REQUIRED: ${prompt}\nApprove? (y/n): `);
    return answer.toLowerCase().startsWith('y');
  }

  private log(message: string) {
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] ${message}`);
    this.logger.logEvent(message);
  }

  async run(): Promise<void> {
    await this.logger.init();
    this.state.running = true;

    console.log('\n' + '='.repeat(60));
    console.log('🖥️  SCREEN COPILOT');
    console.log('='.repeat(60));
    console.log(`Goal: ${this.state.goal}`);
    console.log(`Mode: ${this.state.mode.toUpperCase()}`);
    console.log(`Max steps: ${this.state.maxSteps}`);
    console.log(`Run log: ${this.logger.getRunDir()}`);
    console.log('='.repeat(60) + '\n');

    // Wait for first vision snapshot
    this.log('Waiting for vision snapshots from frontend...');
    this.log('Make sure Vision Bridge is running and OBS Virtual Camera is selected.\n');

    let waitCount = 0;
    while (!this.getLatestSnapshot() && waitCount < 60) {
      await new Promise(r => setTimeout(r, 1000));
      waitCount++;
      if (waitCount % 10 === 0) {
        this.log(`Still waiting for vision... (${waitCount}s)`);
      }
    }

    if (!this.getLatestSnapshot()) {
      this.log('❌ No vision snapshots received after 60s. Exiting.');
      this.cleanup();
      return;
    }

    this.log('✅ Vision connected! Starting agent loop.\n');

    // Main loop
    while (this.state.running && this.state.currentStep < this.state.maxSteps) {
      this.state.currentStep++;
      const step = this.state.currentStep;
      this.broadcastStatus(this.state);

      // Get latest vision
      const snapshot = this.getLatestSnapshot();
      await this.logger.logVisionSnapshot(step, snapshot);

      this.log(`\n--- Step ${step} ---`);
      this.log(`Vision: ${snapshot?.summaryText?.slice(0, 100)}...`);

      // Plan next action
      this.log('Planning...');
      const action = await planNextAction(
        this.state.goal,
        this.state.mode,
        snapshot,
        this.state.history,
        this.logger.getRunDir(),
        step
      );

      this.log(`Action: ${action.type}`);
      this.log(`Rationale: ${action.rationale}`);
      if (action.risk !== 'low') {
        this.log(`⚠️  Risk: ${action.risk.toUpperCase()}`);
      }

      // Safety check
      const safety = checkActionSafety(action, this.state.mode);
      const finalAction = safety.transformedAction || action;

      // Handle different action types
      if (finalAction.type === 'stop') {
        this.log(finalAction.done ? '✅ Goal accomplished!' : `🛑 Stopping: ${finalAction.rationale}`);
        await this.recordStep(step, finalAction, 'success', true);
        break;
      }

      if (finalAction.type === 'ask_user') {
        this.state.waitingForUser = true;
        this.broadcastStatus(this.state);
        const userResponse = await this.askUser(`\n❓ ${finalAction.text}\nYour response: `);
        this.state.waitingForUser = false;
        this.log(`User said: ${userResponse}`);
        await this.recordStep(step, finalAction, 'success', true);
        // Add user response to history for next planning
        continue;
      }

      // Check if approval needed
      let approved = true;
      if (safety.requiresApproval) {
        this.state.waitingForApproval = true;
        this.broadcastStatus(this.state);
        this.log(`🔒 ${safety.reason}`);
        approved = await this.askApproval(
          `${finalAction.type}: ${finalAction.rationale}\nExpect: ${finalAction.expect}`
        );
        this.state.waitingForApproval = false;
      }

      if (!approved) {
        this.log('❌ Action rejected by user');
        await this.recordStep(step, finalAction, 'skipped', false);
        continue;
      }

      // Execute action
      const result = await executeAction(finalAction);
      this.log(`Result: ${result.message}`);

      await this.recordStep(
        step,
        finalAction,
        result.success ? 'success' : 'failed',
        approved
      );

      // Brief pause between steps
      await new Promise(r => setTimeout(r, 1000));
    }

    if (this.state.currentStep >= this.state.maxSteps) {
      this.log(`\n⚠️  Max steps (${this.state.maxSteps}) reached`);
    }

    this.cleanup();
  }

  private async recordStep(
    step: number,
    action: Action,
    result: 'success' | 'failed' | 'skipped',
    approved: boolean
  ): Promise<void> {
    const entry: HistoryEntry = {
      step,
      action,
      result,
      approved,
      timestamp: Date.now(),
    };
    this.state.history.push(entry);
    await this.logger.logAction(entry);
  }

  private async cleanup(): Promise<void> {
    this.state.running = false;
    this.broadcastStatus(this.state);

    await this.logger.writeFinalSummary(
      this.state.goal,
      this.state.mode,
      this.state.history
    );

    console.log('\n' + '='.repeat(60));
    console.log(`Run completed. Logs: ${this.logger.getRunDir()}`);
    console.log('='.repeat(60) + '\n');

    this.rl.close();
  }

  stop(): void {
    this.state.running = false;
  }
}
