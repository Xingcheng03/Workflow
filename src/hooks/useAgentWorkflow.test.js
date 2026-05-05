import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// Mock runAgent so the test controls every agent's response. Other exports
// (validateSymbol, createCompanyShell, agentDefinitions) keep their real
// implementations because the hook depends on them.
vi.mock('../services/agentApi', async () => {
  const actual = await vi.importActual('../services/agentApi');
  return {
    ...actual,
    runAgent: vi.fn()
  };
});

import { runAgent } from '../services/agentApi';
import { useAgentWorkflow } from './useAgentWorkflow';

const baseDataPayload = (symbol) => ({
  symbol,
  data: {
    company: { symbol, name: `${symbol} Corp`, sector: 'Tech', recommendation: 'Not rated', thesis: '' },
    metrics: { price: '100.00 USD', change: '+1.00 (+1.00%)' },
    trend: [],
    history: [],
    marketMeta: {}
  }
});

const baseNewsPayload = (symbol) => ({
  symbol,
  news: { news: ['headline 1'], sentimentScore: 50, sources: [] }
});

const baseAnalysisPayload = (symbol) => ({
  symbol,
  analysis: {
    valuation: 'fair',
    growthView: 'steady',
    marginView: 'healthy',
    trendView: 'sideways',
    analysisSummary: 'OK',
    sources: []
  }
});

const baseRiskPayload = (symbol) => ({
  symbol,
  risk: { riskLevel: 'Moderate', risks: ['r1'], opportunities: ['o1'], sources: [] }
});

const reportPayload = (symbol, isRevision) => ({
  symbol,
  report: {
    title: isRevision ? 'V2 Brief' : 'V1 Brief',
    recommendation: 'Hold',
    thesis: 'thesis text',
    bullets: ['a', 'b', 'c', 'd'],
    sources: []
  }
});

const verifierPayload = (symbol, status, issues = []) => ({
  symbol,
  verifier: { status, issues, sources: [] }
});

const wireMocks = (verifierV1, verifierV2 = null, reportV2Behavior = 'success') => {
  runAgent.mockImplementation(async (agentId, symbol, _emitLog, context, _signal, options) => {
    switch (agentId) {
      case 'data':
        return baseDataPayload(symbol);
      case 'news':
        return baseNewsPayload(symbol);
      case 'analysis':
        return baseAnalysisPayload(symbol);
      case 'risk':
        return baseRiskPayload(symbol);
      case 'report': {
        const isRevision = !!options?.revisionFeedback;
        if (isRevision && reportV2Behavior === 'throw') {
          throw new Error('Simulated Gemini outage during revision');
        }
        return reportPayload(symbol, isRevision);
      }
      case 'verifier': {
        // Distinguish v1 vs v2 verifier by inspecting the report title in context.
        const isV2 = context?.report?.title === 'V2 Brief';
        const r = isV2 ? verifierV2 || verifierV1 : verifierV1;
        return verifierPayload(symbol, r.status, r.issues);
      }
      default:
        throw new Error(`Unmocked agent: ${agentId}`);
    }
  });
};

const countCalls = (agentId, withRevisionFeedback) =>
  runAgent.mock.calls.filter((args) => {
    if (args[0] !== agentId) return false;
    if (withRevisionFeedback === undefined) return true;
    const opts = args[5];
    return withRevisionFeedback ? !!opts?.revisionFeedback : !opts?.revisionFeedback;
  }).length;

describe('useAgentWorkflow — Verifier + revision loop', () => {
  beforeEach(() => {
    runAgent.mockReset();
    sessionStorage.clear();
  });

  it('case 1: blocking issue triggers revision; final report is v2 and verifier passes', async () => {
    wireMocks(
      { status: 'fail', issues: [{ severity: 'blocking', claim: 'PE 35', problem: 'not in DATA', suggestion: 'use 20' }] },
      { status: 'pass', issues: [] }
    );
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });

    expect(result.current.results.report.title).toBe('V2 Brief');
    expect(result.current.results.verifier.status).toBe('pass');
    expect(countCalls('report', true)).toBe(1); // exactly one revision
    expect(countCalls('report', false)).toBe(1); // exactly one v1
    expect(countCalls('verifier')).toBe(2); // v1 verifier + v2 verifier
  });

  it('case 2: warning-only does NOT trigger revision; report stays v1, warnings surface', async () => {
    wireMocks({
      status: 'warn',
      issues: [{ severity: 'warning', claim: 'vague', problem: '...', suggestion: '...' }]
    });
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });

    expect(result.current.results.report.title).toBe('V1 Brief');
    expect(result.current.results.verifier.status).toBe('warn');
    expect(result.current.results.verifier.issues).toHaveLength(1);
    expect(countCalls('report', true)).toBe(0); // no revision
    expect(countCalls('verifier')).toBe(1); // only v1 verifier
  });

  it('case 3: pass on first try; no revision, no extra verifier call', async () => {
    wireMocks({ status: 'pass', issues: [] });
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });

    expect(result.current.results.report.title).toBe('V1 Brief');
    expect(result.current.results.verifier.status).toBe('pass');
    expect(countCalls('report', true)).toBe(0);
    expect(countCalls('verifier')).toBe(1);
  });

  it('case 4: v2 verifier still fails — final report is v2, verifier shows fail, no third retry', async () => {
    wireMocks(
      { status: 'fail', issues: [{ severity: 'blocking', claim: 'x', problem: 'p1', suggestion: 's1' }] },
      { status: 'fail', issues: [{ severity: 'blocking', claim: 'y', problem: 'p2', suggestion: 's2' }] }
    );
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });

    expect(result.current.results.report.title).toBe('V2 Brief');
    expect(result.current.results.verifier.status).toBe('fail');
    expect(result.current.results.verifier.issues[0].claim).toBe('y');
    expect(countCalls('report', true)).toBe(1); // only one revision attempt
    expect(countCalls('verifier')).toBe(2); // v1 + v2 only, no third
  });

  it('case 5: report v2 generation throws — preserves v1 + v1 verifier issues, no extra verifier call', async () => {
    wireMocks(
      { status: 'fail', issues: [{ severity: 'blocking', claim: 'x', problem: 'p', suggestion: 's' }] },
      null,
      'throw'
    );
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });

    expect(result.current.results.report.title).toBe('V1 Brief');
    expect(result.current.results.verifier.status).toBe('fail');
    expect(countCalls('report', true)).toBe(1); // tried revision
    expect(countCalls('verifier')).toBe(1); // did NOT run a second verifier
    expect(result.current.failedAgents).toContain('report');
  });

  it('case 6: workflowPhase transitions through verify-v1 / revise / verify-v2 then clears', async () => {
    wireMocks(
      { status: 'fail', issues: [{ severity: 'blocking', claim: 'x', problem: 'p', suggestion: 's' }] },
      { status: 'pass', issues: [] }
    );
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });

    // After workflow finishes, phase clears.
    await waitFor(() => expect(result.current.workflowPhase).toBeNull());
    expect(result.current.isRunning).toBe(false);
  });

  it('case 7: aborted Verifier does not crash workflow; revision NOT attempted on aborted result', async () => {
    runAgent.mockImplementation(async (agentId, symbol, _emitLog, _context, _signal, _options) => {
      if (agentId === 'data') return baseDataPayload(symbol);
      if (agentId === 'news') return baseNewsPayload(symbol);
      if (agentId === 'analysis') return baseAnalysisPayload(symbol);
      if (agentId === 'risk') return baseRiskPayload(symbol);
      if (agentId === 'report') return reportPayload(symbol, false);
      if (agentId === 'verifier') {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      throw new Error(`Unmocked agent: ${agentId}`);
    });
    const { result } = renderHook(() => useAgentWorkflow('NVDA'));
    await act(async () => {
      await result.current.runWorkflow('NVDA');
    });
    // Verifier was called once and aborted; revision should NOT have been attempted.
    expect(countCalls('report', true)).toBe(0);
    expect(countCalls('verifier')).toBe(1);
    expect(result.current.isRunning).toBe(false);
  });
});
