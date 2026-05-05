import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WorkflowTrack, phaseState } from '../../src/components/WorkflowTrack.jsx';
import { WORKFLOW_PHASES } from '../../src/constants.js';

afterEach(cleanup);

const findPhase = (id) => WORKFLOW_PHASES.find((p) => p.id === id);

const ctx = (overrides = {}) => ({
  activeAgents: [],
  completedAgents: [],
  failedAgents: [],
  workflowPhase: null,
  ...overrides
});

describe('phaseState (Phase 3 fan-out)', () => {
  const fanout = findPhase('phase-fanout');

  it('is "active" while either of analysis/risk is running', () => {
    expect(phaseState(fanout, ctx({ activeAgents: ['analysis'] }))).toBe('active');
    expect(phaseState(fanout, ctx({ activeAgents: ['risk'] }))).toBe('active');
    expect(phaseState(fanout, ctx({ activeAgents: ['analysis', 'risk'] }))).toBe('active');
  });

  it('is "done" only when BOTH analysis and risk completed', () => {
    expect(phaseState(fanout, ctx({ completedAgents: ['analysis'] }))).toBe('');
    expect(phaseState(fanout, ctx({ completedAgents: ['analysis', 'risk'] }))).toBe('done');
  });

  it('is "failed" if either fan-out agent failed (even if the other is done)', () => {
    expect(
      phaseState(fanout, ctx({ completedAgents: ['analysis'], failedAgents: ['risk'] }))
    ).toBe('failed');
  });
});

describe('phaseState (Phase 5 verifier loop)', () => {
  const verify = findPhase('phase-verify');

  it('is "active" whenever workflowPhase is set, regardless of which agent is in activeAgents', () => {
    expect(phaseState(verify, ctx({ workflowPhase: 'verify-v1', activeAgents: ['verifier'] }))).toBe('active');
    expect(phaseState(verify, ctx({ workflowPhase: 'revise', activeAgents: ['report'] }))).toBe('active');
    expect(phaseState(verify, ctx({ workflowPhase: 'verify-v2', activeAgents: ['verifier'] }))).toBe('active');
  });

  it('is "done" once verifier completed and the loop has cleared', () => {
    expect(phaseState(verify, ctx({ completedAgents: ['verifier'] }))).toBe('done');
  });

  it('is "failed" when verifier itself failed', () => {
    expect(phaseState(verify, ctx({ failedAgents: ['verifier'] }))).toBe('failed');
  });
});

describe('phaseState (Phase 4 Report during verifier loop)', () => {
  const report = findPhase('phase-report');

  it('shows Phase 4 as "done" even though report is briefly active during revise', () => {
    // revise sub-phase: report is in activeAgents, but Phase 4 conceptually
    // finished long before. The Verify phase owns the active highlight.
    const state = phaseState(report, ctx({
      workflowPhase: 'revise',
      activeAgents: ['report'],
      completedAgents: ['data', 'news', 'analysis', 'risk', 'report']
    }));
    expect(state).toBe('done');
  });

  it('still surfaces failed-report during the revision loop', () => {
    const state = phaseState(report, ctx({
      workflowPhase: 'revise',
      failedAgents: ['report']
    }));
    expect(state).toBe('failed');
  });
});

describe('WorkflowTrack rendering', () => {
  it('renders all 5 phases with correct labels', () => {
    const { container } = render(
      <WorkflowTrack
        activeAgents={[]}
        completedAgents={[]}
        failedAgents={[]}
        workflowPhase={null}
        completedAt=""
      />
    );
    // The phase-label class disambiguates from agent shortLabels (which can
    // share the same text — e.g. single-agent phases like "Data").
    const labels = Array.from(container.querySelectorAll('.phase-label')).map(
      (el) => el.textContent
    );
    expect(labels).toEqual(WORKFLOW_PHASES.map((p) => p.label));
  });

  it('renders the Verify badge when workflowPhase is set', () => {
    render(
      <WorkflowTrack
        activeAgents={['verifier']}
        completedAgents={[]}
        failedAgents={[]}
        workflowPhase="revise"
        completedAt=""
      />
    );
    expect(screen.getByText('revise')).toBeTruthy();
  });

  it('does not render the Verify badge when not in the verifier loop', () => {
    render(
      <WorkflowTrack
        activeAgents={['data']}
        completedAgents={[]}
        failedAgents={[]}
        workflowPhase={null}
        completedAt=""
      />
    );
    expect(screen.queryByText('v1')).toBeNull();
    expect(screen.queryByText('revise')).toBeNull();
    expect(screen.queryByText('v2')).toBeNull();
  });

  it('renders both Analysis and Risk badges inside the fan-out cell', () => {
    render(
      <WorkflowTrack
        activeAgents={['analysis', 'risk']}
        completedAgents={[]}
        failedAgents={[]}
        workflowPhase={null}
        completedAt=""
      />
    );
    // shortLabels from agentDefinitions: 'Analysis' and 'Risk'
    expect(screen.getByText('Analysis')).toBeTruthy();
    expect(screen.getByText('Risk')).toBeTruthy();
  });
});
