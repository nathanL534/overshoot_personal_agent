import type { Action } from '../types/index.js';

// Executor stub - actual input injection requires nut.js or robotjs
// For MVP, we just log what would be done

export interface ExecutionResult {
  success: boolean;
  executed: boolean;
  message: string;
}

export async function executeAction(action: Action): Promise<ExecutionResult> {
  // In a full implementation, this would use nut.js or robotjs
  // For hackathon MVP, we just simulate/log

  switch (action.type) {
    case 'propose':
      return {
        success: true,
        executed: false,
        message: `[PROPOSAL] Would: ${action.rationale}`,
      };

    case 'move_mouse':
      console.log(`[Executor] Would move mouse to (${action.x}, ${action.y})`);
      return {
        success: true,
        executed: false, // Set to true if actually using nut.js
        message: `Mouse move to (${action.x}, ${action.y})`,
      };

    case 'click':
      console.log(`[Executor] Would click at (${action.x}, ${action.y})`);
      return {
        success: true,
        executed: false,
        message: `Click at (${action.x}, ${action.y})`,
      };

    case 'type_text':
      console.log(`[Executor] Would type: "${action.text}"`);
      return {
        success: true,
        executed: false,
        message: `Type: "${action.text?.slice(0, 50)}${(action.text?.length || 0) > 50 ? '...' : ''}"`,
      };

    case 'press_key':
      console.log(`[Executor] Would press key: ${action.key}`);
      return {
        success: true,
        executed: false,
        message: `Press key: ${action.key}`,
      };

    case 'wait':
      const waitTime = action.timeoutMs || 5000;
      console.log(`[Executor] Waiting ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
      return {
        success: true,
        executed: true,
        message: `Waited ${waitTime}ms`,
      };

    case 'stop':
      return {
        success: true,
        executed: true,
        message: 'Agent stopped',
      };

    case 'ask_user':
      return {
        success: true,
        executed: true,
        message: `Asked user: ${action.text}`,
      };

    default:
      return {
        success: false,
        executed: false,
        message: `Unknown action type: ${(action as Action).type}`,
      };
  }
}

// Optional: Full execution with nut.js (uncomment and install @nut-tree/nut-js)
/*
import { mouse, keyboard, Point, Button, Key } from '@nut-tree/nut-js';

export async function executeActionReal(action: Action): Promise<ExecutionResult> {
  switch (action.type) {
    case 'move_mouse':
      await mouse.setPosition(new Point(action.x!, action.y!));
      return { success: true, executed: true, message: `Moved to (${action.x}, ${action.y})` };

    case 'click':
      await mouse.setPosition(new Point(action.x!, action.y!));
      await mouse.click(Button.LEFT);
      return { success: true, executed: true, message: `Clicked at (${action.x}, ${action.y})` };

    case 'type_text':
      await keyboard.type(action.text!);
      return { success: true, executed: true, message: `Typed text` };

    case 'press_key':
      const keyMap: Record<string, Key> = {
        'Enter': Key.Enter,
        'Tab': Key.Tab,
        'Escape': Key.Escape,
        // Add more as needed
      };
      const key = keyMap[action.key!] || Key.Enter;
      await keyboard.pressKey(key);
      await keyboard.releaseKey(key);
      return { success: true, executed: true, message: `Pressed ${action.key}` };

    default:
      return executeAction(action); // Fall back to stub
  }
}
*/
