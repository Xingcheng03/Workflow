import { describe, expect, it } from 'vitest';
import { statusPillText } from '../../src/components/statusPill.js';

const agentDefinitions = [
  { id: 'data', label: 'Data Agent' },
  { id: 'verifier', label: 'Verifier Agent' }
];

describe('statusPillText', () => {
  it('returns Ready when not running', () => {
    expect(statusPillText({ isRunning: false, workflowPhase: null, activeAgents: [], agentDefinitions })).toBe('Ready');
  });

  it('prefers workflow phase text when set', () => {
    expect(
      statusPillText({ isRunning: true, workflowPhase: 'verify-v1', activeAgents: ['verifier'], agentDefinitions })
    ).toBe('Verifying report');
    expect(
      statusPillText({ isRunning: true, workflowPhase: 'revise', activeAgents: ['report'], agentDefinitions })
    ).toBe('Revising report (1 of 1)');
    expect(
      statusPillText({ isRunning: true, workflowPhase: 'verify-v2', activeAgents: ['verifier'], agentDefinitions })
    ).toBe('Verifying revised report');
  });

  it('reports parallel-agent count when more than one is active and no phase set', () => {
    expect(
      statusPillText({
        isRunning: true,
        workflowPhase: null,
        activeAgents: ['analysis', 'risk'],
        agentDefinitions
      })
    ).toBe('Running 2 agents in parallel');
  });

  it('names a single active agent by label', () => {
    expect(
      statusPillText({ isRunning: true, workflowPhase: null, activeAgents: ['data'], agentDefinitions })
    ).toBe('Running Data Agent');
  });

  it('falls back to a neutral string when running but no agent is active (between phases)', () => {
    expect(
      statusPillText({ isRunning: true, workflowPhase: null, activeAgents: [], agentDefinitions })
    ).toBe('Wrapping up');
  });

  it('uses "agent" sentinel when activeAgent id has no matching definition', () => {
    expect(
      statusPillText({
        isRunning: true,
        workflowPhase: null,
        activeAgents: ['unknown-id'],
        agentDefinitions
      })
    ).toBe('Running agent');
  });
});
