import { ActionSchema, type Action } from '../types/index.js';

export function parseAction(jsonStr: string): Action | null {
  try {
    // Remove markdown code blocks if present
    let cleaned = jsonStr;
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }

    // Find JSON object
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return ActionSchema.parse(parsed);
  } catch (error) {
    console.error('[Schema] Parse error:', error);
    return null;
  }
}

export function validateAction(action: Action): { valid: boolean; error?: string } {
  // Validate required fields based on action type
  switch (action.type) {
    case 'move_mouse':
    case 'click':
      if (action.x === undefined || action.y === undefined) {
        return { valid: false, error: `${action.type} requires x and y coordinates` };
      }
      break;
    case 'type_text':
      if (!action.text) {
        return { valid: false, error: 'type_text requires text' };
      }
      break;
    case 'press_key':
      if (!action.key) {
        return { valid: false, error: 'press_key requires key' };
      }
      break;
    case 'ask_user':
      if (!action.text) {
        return { valid: false, error: 'ask_user requires text (the question)' };
      }
      break;
  }

  return { valid: true };
}

export { ActionSchema, type Action };
