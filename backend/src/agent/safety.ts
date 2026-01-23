import { RISKY_KEYWORDS, type Action } from '../types/index.js';

export interface SafetyCheck {
  requiresApproval: boolean;
  reason?: string;
  transformedAction?: Action;
}

export function checkActionSafety(action: Action, mode: 'proposal' | 'execute'): SafetyCheck {
  // In proposal mode, never execute - just propose
  if (mode === 'proposal') {
    if (['move_mouse', 'click', 'type_text', 'press_key'].includes(action.type)) {
      return {
        requiresApproval: false,
        transformedAction: {
          ...action,
          type: 'propose',
          rationale: `[PROPOSAL] ${action.rationale}`,
        },
      };
    }
  }

  // High risk actions always require approval
  if (action.risk === 'high') {
    return {
      requiresApproval: true,
      reason: `High risk action: ${action.rationale}`,
    };
  }

  // Check for risky keywords in text or rationale
  const textToCheck = [
    action.text?.toLowerCase() || '',
    action.rationale?.toLowerCase() || '',
    action.expect?.toLowerCase() || '',
  ].join(' ');

  for (const keyword of RISKY_KEYWORDS) {
    if (textToCheck.includes(keyword)) {
      return {
        requiresApproval: true,
        reason: `Action involves "${keyword}" - requires approval`,
      };
    }
  }

  // In execute mode, any input action requires approval
  if (mode === 'execute' && ['move_mouse', 'click', 'type_text', 'press_key'].includes(action.type)) {
    return {
      requiresApproval: true,
      reason: `Execute mode: ${action.type} requires approval`,
    };
  }

  return { requiresApproval: false };
}

export function isInputAction(action: Action): boolean {
  return ['move_mouse', 'click', 'type_text', 'press_key'].includes(action.type);
}
