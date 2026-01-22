import { spawn } from 'child_process';
import { ActionSchema, type Action, type DomSnapshot, type VisionSnapshot, type HistoryEntry } from '../types/index.js';

const SYSTEM_PROMPT = `You are a browser automation agent. You analyze the current page state and decide the next action.

CRITICAL RULES:
1. Output ONLY valid JSON matching the Action schema. No markdown, no explanation, no code blocks.
2. Choose targetId ONLY from the provided targets list.
3. If uncertain or action seems risky, use ask_user type.
4. NEVER attempt to bypass CAPTCHA - use ask_user instead.
5. For risky actions (submit, send, delete, pay, purchase, order, transfer, confirm), set risk: "high".

Action schema:
{
  "type": "click" | "type_text" | "press_key" | "scroll" | "wait" | "navigate" | "ask_user" | "stop",
  "targetId": "string (from targets list)",
  "text": "string (for type_text)",
  "key": "string (for press_key, e.g., 'Enter', 'Tab')",
  "url": "string (for navigate)",
  "timeoutMs": number (default 5000),
  "risk": "low" | "medium" | "high",
  "expect": "string (what you expect to happen)",
  "done": boolean (true if goal is complete)
}

Examples:
- Click a button: {"type":"click","targetId":"button:Submit:5","risk":"low","expect":"Form submits","done":false}
- Type in input: {"type":"type_text","targetId":"input:email:2","text":"test@example.com","risk":"low","expect":"Email filled","done":false}
- Ask for help: {"type":"ask_user","text":"Should I proceed with payment?","risk":"high","expect":"User confirms","done":false}
- Stop: {"type":"stop","done":true,"expect":"Goal completed"}

OUTPUT ONLY THE JSON OBJECT. NO OTHER TEXT.`;

function buildPrompt(
  goal: string,
  dom: DomSnapshot,
  vision: VisionSnapshot | null,
  history: HistoryEntry[]
): string {
  const recentHistory = history.slice(-10);

  const targetsText = dom.targets.map(t =>
    `  - ${t.id} | ${t.role} | "${t.label}"`
  ).join('\n');

  const historyText = recentHistory.length > 0
    ? recentHistory.map(h =>
        `  Step ${h.step}: ${h.action.type}${h.action.targetId ? ` on ${h.action.targetId}` : ''} -> ${h.result}${h.error ? ` (${h.error})` : ''}`
      ).join('\n')
    : '  (none)';

  const visionText = vision
    ? `Summary: ${vision.summaryText}\nDetected text: ${vision.detectedTextSnippets.slice(0, 5).join(', ')}`
    : '[vision not streaming]';

  return `${SYSTEM_PROMPT}

---

GOAL: ${goal}

CURRENT PAGE:
URL: ${dom.url}
Title: ${dom.title}
Alerts: ${dom.alerts.length > 0 ? dom.alerts.join(', ') : '(none)'}

AVAILABLE TARGETS:
${targetsText || '  (no interactive elements found)'}

VISION (from camera/video):
${visionText}

RECENT HISTORY:
${historyText}

Decide the next action. Output JSON only, no markdown code blocks.`;
}

async function callClaudeCode(prompt: string): Promise<string> {
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

    claude.on('close', (code) => {
      if (code !== 0) {
        console.error('[Claude Code] stderr:', stderr);
        reject(new Error(`Claude Code exited with code ${code}`));
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
  dom: DomSnapshot,
  vision: VisionSnapshot | null,
  history: HistoryEntry[],
  _apiKey: string | undefined // Kept for compatibility, but not used
): Promise<Action> {
  const userPrompt = buildPrompt(goal, dom, vision, history);

  try {
    console.log('[Planner] Calling Claude Code...');
    const response = await callClaudeCode(userPrompt);
    console.log('[Planner] Raw response:', response.slice(0, 200));

    // Parse JSON from response - handle markdown code blocks
    let jsonStr = response;

    // Remove markdown code blocks if present
    const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const action = ActionSchema.parse(parsed);

    // Validate targetId if present
    if (action.targetId && action.type !== 'ask_user' && action.type !== 'stop' && action.type !== 'navigate' && action.type !== 'wait') {
      const targetExists = dom.targets.some(t => t.id === action.targetId);
      if (!targetExists) {
        console.log(`[Planner] Invalid targetId: ${action.targetId}`);
        return {
          type: 'stop',
          done: false,
          risk: 'low',
          timeoutMs: 5000,
          expect: `Error: targetId "${action.targetId}" not found in targets list`,
        };
      }
    }

    return action;
  } catch (error) {
    console.error('[Planner] Error:', error);

    // Fall back to mock planner
    console.log('[Planner] Falling back to mock planner');
    return mockPlanner(dom, history);
  }
}

// Simple mock planner for testing without Claude Code
function mockPlanner(dom: DomSnapshot, history: HistoryEntry[]): Action {
  // Find unfilled inputs
  const inputs = dom.targets.filter(t => t.role === 'input');
  const selects = dom.targets.filter(t => t.role === 'select');
  const checkboxes = dom.targets.filter(t => t.role === 'checkbox');

  // Simple heuristic: fill inputs, then select, then checkbox, then stop before submit
  const filledInputs = new Set(
    history
      .filter(h => h.action.type === 'type_text' && h.action.targetId)
      .map(h => h.action.targetId)
  );

  const clickedElements = new Set(
    history
      .filter(h => h.action.type === 'click' && h.action.targetId)
      .map(h => h.action.targetId)
  );

  // Find first unfilled text input
  for (const input of inputs) {
    if (!filledInputs.has(input.id) && !input.label.includes('checkbox')) {
      const isEmail = input.label.toLowerCase().includes('email');
      const isName = input.label.toLowerCase().includes('name');
      const text = isEmail ? 'demo@example.com' : isName ? 'Demo User' : 'demo value';

      return {
        type: 'type_text',
        targetId: input.id,
        text,
        risk: 'low',
        timeoutMs: 5000,
        expect: `Fill ${input.label} with dummy data`,
        done: false,
      };
    }
  }

  // Click first unclicked select
  for (const sel of selects) {
    if (!clickedElements.has(sel.id)) {
      return {
        type: 'click',
        targetId: sel.id,
        risk: 'low',
        timeoutMs: 5000,
        expect: `Open ${sel.label} dropdown`,
        done: false,
      };
    }
  }

  // Click first unclicked checkbox
  for (const cb of checkboxes) {
    if (!clickedElements.has(cb.id)) {
      return {
        type: 'click',
        targetId: cb.id,
        risk: 'low',
        timeoutMs: 5000,
        expect: `Toggle ${cb.label}`,
        done: false,
      };
    }
  }

  // All filled, stop before submit
  return {
    type: 'stop',
    done: true,
    risk: 'low',
    timeoutMs: 5000,
    expect: 'Form filled with dummy data, stopping before submit as requested',
  };
}
