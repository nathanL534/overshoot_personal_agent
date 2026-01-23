import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { parseAction, type Action } from './schema.js';
import type { VisionSnapshot, HistoryEntry } from '../types/index.js';

const SYSTEM_PROMPT = `You are a screen copilot assistant. You see the user's screen and help them accomplish their goal by suggesting or performing actions.

CRITICAL RULES:
1. Output ONLY valid JSON matching the Action schema. No markdown, no explanation outside the JSON.
2. Be conservative - if uncertain, use ask_user to clarify.
3. Never attempt to bypass security dialogs, CAPTCHAs, or permission prompts.
4. For risky actions (submit, send, delete, pay, purchase, etc.), set risk: "high".
5. Describe what you see and your reasoning in the rationale field.

Action schema:
{
  "type": "propose" | "move_mouse" | "click" | "type_text" | "press_key" | "wait" | "stop" | "ask_user",
  "x": number (for mouse actions),
  "y": number (for mouse actions),
  "text": string (for type_text or ask_user question),
  "key": string (for press_key, e.g., "Enter", "Tab", "Escape"),
  "timeoutMs": number (default 5000),
  "risk": "low" | "medium" | "high",
  "rationale": string (explain what you see and why this action),
  "expect": string (what should happen after this action),
  "done": boolean (true if goal is complete)
}

Examples:
- Propose clicking: {"type":"propose","x":500,"y":300,"rationale":"I see a Submit button at approximately (500,300)","expect":"Would click the submit button","risk":"high","done":false}
- Ask user: {"type":"ask_user","text":"I see two forms on screen. Which one should I fill?","rationale":"Multiple forms visible, need clarification","expect":"User will specify","risk":"low","done":false}
- Done: {"type":"stop","rationale":"Goal accomplished - form is submitted and confirmation shown","expect":"Task complete","risk":"low","done":true}

OUTPUT ONLY THE JSON OBJECT.`;

function buildPrompt(
  goal: string,
  mode: 'proposal' | 'execute',
  vision: VisionSnapshot | null,
  history: HistoryEntry[]
): string {
  const recentHistory = history.slice(-10);

  const historyText = recentHistory.length > 0
    ? recentHistory.map(h =>
        `  Step ${h.step}: ${h.action.type} - ${h.action.rationale?.slice(0, 50)}... -> ${h.result}`
      ).join('\n')
    : '  (no previous actions)';

  const visionText = vision
    ? `Summary: ${vision.summaryText}\n\nDetected text snippets:\n${vision.detectedTextSnippets.map(s => `  - "${s}"`).join('\n')}`
    : '[No vision data yet - waiting for screen capture]';

  return `${SYSTEM_PROMPT}

---

USER GOAL: ${goal}

MODE: ${mode === 'proposal' ? 'PROPOSAL (describe what you would do, do not execute)' : 'EXECUTE (actions will be performed with approval)'}

CURRENT SCREEN STATE:
${visionText}

PREVIOUS ACTIONS:
${historyText}

Based on the current screen state, decide the next action to accomplish the goal. Output JSON only.`;
}

async function callClaudeCLI(prompt: string, runDir: string, step: number): Promise<string> {
  // Save prompt for audit
  const promptFile = join(runDir, 'planner_outputs', `${step}_prompt.txt`);
  await mkdir(join(runDir, 'planner_outputs'), { recursive: true });
  await writeFile(promptFile, prompt);

  return new Promise((resolve, reject) => {
    const claude = spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',
      '--no-session-persistence',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claude.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claude.on('close', async (code) => {
      // Save output for audit
      const outputFile = join(runDir, 'planner_outputs', `${step}_output.txt`);
      await writeFile(outputFile, `EXIT CODE: ${code}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`);

      if (code !== 0) {
        console.error('[Planner] Claude CLI error:', stderr);
        reject(new Error(`Claude CLI exited with code ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    claude.on('error', (err) => {
      reject(err);
    });

    // Send prompt via stdin
    claude.stdin.write(prompt);
    claude.stdin.end();
  });
}

export async function planNextAction(
  goal: string,
  mode: 'proposal' | 'execute',
  vision: VisionSnapshot | null,
  history: HistoryEntry[],
  runDir: string,
  step: number
): Promise<Action> {
  const prompt = buildPrompt(goal, mode, vision, history);

  try {
    console.log('[Planner] Calling Claude CLI...');
    const response = await callClaudeCLI(prompt, runDir, step);
    console.log('[Planner] Response received, parsing...');

    const action = parseAction(response);
    if (!action) {
      throw new Error('Failed to parse action from response');
    }

    return action;
  } catch (error) {
    console.error('[Planner] Error:', error);

    // Fallback stub action
    return {
      type: 'ask_user',
      text: `Planner error: ${error instanceof Error ? error.message : 'Unknown'}. What should I do?`,
      risk: 'low',
      rationale: 'Planner encountered an error',
      expect: 'User will provide guidance',
      timeoutMs: 5000,
      done: false,
    };
  }
}
