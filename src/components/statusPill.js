// Pure helper for the topbar status text. Extracted so the (previously
// 5-deep nested) ternary can be unit-tested without rendering React.
//
// Precedence:
//   1. Idle (not running) → "Ready"
//   2. Workflow phase override → e.g. "Verifying report"
//   3. Multiple agents in parallel → "Running N agents in parallel"
//   4. Single agent → "Running <Label>"
//   5. None of the above (between phases) → "Wrapping up"

import { PHASE_PILL_TEXT } from '../constants.js';

export const statusPillText = ({ isRunning, workflowPhase, activeAgents, agentDefinitions }) => {
  if (!isRunning) return 'Ready';
  if (PHASE_PILL_TEXT[workflowPhase]) return PHASE_PILL_TEXT[workflowPhase];

  const count = activeAgents?.length || 0;
  if (count > 1) return `Running ${count} agents in parallel`;
  if (count === 1) {
    const label =
      agentDefinitions.find((a) => a.id === activeAgents[0])?.label ?? 'agent';
    return `Running ${label}`;
  }
  return 'Wrapping up';
};
