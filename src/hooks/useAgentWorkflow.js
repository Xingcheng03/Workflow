import { useMemo, useRef, useState } from 'react';
import {
  agentDefinitions,
  createCompanyShell,
  runAgent,
  validateSymbol
} from '../services/agentApi';

const FAN_OUT_AGENTS = ['analysis', 'risk'];
const SOURCE_AGENTS = ['news', 'analysis', 'risk', 'report'];
const MAX_LOGS = 40;

const initialResults = (symbol) => ({ data: { company: createCompanyShell(symbol) } });

const timeStamp = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const shortTime = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const useAgentWorkflow = (initialSymbol) => {
  const [activeAgents, setActiveAgents] = useState([]);
  const [completedAgents, setCompletedAgents] = useState([]);
  const [failedAgents, setFailedAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(() => initialResults(initialSymbol));
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  // workflowPhase distinguishes Phase 5a/5b/5c from generic "Running [Agent]" so the
  // UI status pill can show "Verifying report" / "Revising report (1 of 1)" /
  // "Verifying revised report" instead of indistinguishable "Running Verifier Agent" twice.
  const [workflowPhase, setWorkflowPhase] = useState(null);
  const abortRef = useRef(null);
  const logIdRef = useRef(0);

  const allSources = useMemo(() => {
    const collected = [];
    for (const id of SOURCE_AGENTS) {
      const list = results[id]?.sources;
      if (Array.isArray(list)) collected.push(...list);
    }
    return collected.filter(
      (s, i, arr) => s.uri && arr.findIndex((x) => x.uri === s.uri) === i
    );
  }, [results]);

  const emitLog = (message) => {
    const id = ++logIdRef.current;
    setLogs((current) => [...current, { id, time: timeStamp(), message }].slice(-MAX_LOGS));
  };

  const mergeResult = (agentId, payload) => {
    setResults((current) => ({
      ...current,
      ...payload,
      completedAt: shortTime(),
      lastAgent: agentId
    }));
  };

  const getStepState = (id) => {
    if (activeAgents.includes(id)) return 'active';
    if (completedAgents.includes(id)) return 'done';
    if (failedAgents.includes(id)) return 'failed';
    return '';
  };

  const reset = (symbol) => {
    setCompletedAgents([]);
    setFailedAgents([]);
    setLogs([]);
    setError('');
    setResults(initialResults(symbol));
    setActiveAgents([]);
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const validateOrFail = (rawSymbol) => {
    const validation = validateSymbol(rawSymbol);
    if (!validation.ok) {
      setError(validation.error);
      emitLog(`Error: ${validation.error}`);
      return null;
    }
    return validation;
  };

  const startRun = () => {
    abortRef.current = new AbortController();
    setIsRunning(true);
    setError('');
    return abortRef.current.signal;
  };

  const finishRun = () => {
    setActiveAgents([]);
    setIsRunning(false);
    setWorkflowPhase(null);
    abortRef.current = null;
  };

  const runOneAgent = async (agentId, rawSymbol) => {
    const validation = validateOrFail(rawSymbol);
    if (!validation) return;

    const previousSymbol = results.data?.company?.symbol;
    const stale = previousSymbol && previousSymbol !== validation.symbol;
    let agentContext = results;
    if (stale) {
      setResults(initialResults(validation.symbol));
      setCompletedAgents([]);
      setFailedAgents([]);
      emitLog(`Cleared previous results for ${previousSymbol}.`);
      agentContext = {};
    }

    const signal = startRun();
    setActiveAgents([agentId]);
    setFailedAgents((current) => current.filter((id) => id !== agentId));

    try {
      const payload = await runAgent(agentId, validation.symbol, emitLog, agentContext, signal);
      mergeResult(agentId, payload);
      setCompletedAgents((current) => (current.includes(agentId) ? current : [...current, agentId]));
      emitLog(`${agentDefinitions.find((a) => a.id === agentId).label} completed.`);
    } catch (exception) {
      if (exception.name !== 'AbortError') {
        setError(exception.message);
        emitLog(`Error: ${exception.message}`);
        setFailedAgents((current) => (current.includes(agentId) ? current : [...current, agentId]));
        setCompletedAgents((current) => current.filter((id) => id !== agentId));
      }
    } finally {
      finishRun();
    }
  };

  const runWorkflow = async (rawSymbol) => {
    const validation = validateOrFail(rawSymbol);
    if (!validation) return;

    const signal = startRun();
    setCompletedAgents([]);
    setFailedAgents([]);
    let nextResults = initialResults(validation.symbol);
    setResults(nextResults);
    emitLog(`Full workflow queued for ${validation.symbol}.`);

    let firstFailure = null;

    const runOne = async (agentId, context, options) => {
      if (signal.aborted) return { aborted: true, agentId };
      try {
        const payload = await runAgent(agentId, validation.symbol, emitLog, context, signal, options);
        return { ok: true, agentId, payload };
      } catch (exception) {
        if (exception.name === 'AbortError' || signal.aborted) {
          return { aborted: true, agentId };
        }
        return { ok: false, agentId, error: exception };
      }
    };

    const applyOutcome = (outcome) => {
      if (outcome.aborted) return;
      if (outcome.ok) {
        nextResults = {
          ...nextResults,
          ...outcome.payload,
          completedAt: shortTime(),
          lastAgent: outcome.agentId
        };
        setCompletedAgents((current) => [...current, outcome.agentId]);
      } else {
        const label = agentDefinitions.find((a) => a.id === outcome.agentId).label;
        emitLog(`${label} failed: ${outcome.error.message}`);
        setFailedAgents((current) => [...current, outcome.agentId]);
        if (!firstFailure) firstFailure = outcome.error.message;
      }
    };

    const exitAborted = () => {
      emitLog('Workflow aborted by user.');
      finishRun();
    };

    setActiveAgents(['data']);
    applyOutcome(await runOne('data', nextResults));
    setResults(nextResults);
    if (signal.aborted) return exitAborted();

    // Phase 2: News runs alone so its sentiment + headlines can ground Risk.
    setActiveAgents(['news']);
    applyOutcome(await runOne('news', nextResults));
    setResults(nextResults);
    if (signal.aborted) return exitAborted();

    // Phase 3: Analysis and Risk fan out, both seeing Data + News context.
    setActiveAgents(FAN_OUT_AGENTS);
    const fanContext = nextResults;
    const fanOutcomes = await Promise.all(FAN_OUT_AGENTS.map((id) => runOne(id, fanContext)));
    fanOutcomes.forEach(applyOutcome);
    setResults(nextResults);
    if (signal.aborted) return exitAborted();

    setActiveAgents(['report']);
    applyOutcome(await runOne('report', nextResults));
    setResults(nextResults);
    if (signal.aborted) return exitAborted();

    // Phase 5a: Verifier checks Report v1.
    if (nextResults.report) {
      setActiveAgents(['verifier']);
      setWorkflowPhase('verify-v1');
      applyOutcome(await runOne('verifier', nextResults));
      setResults(nextResults);
      if (signal.aborted) return exitAborted();

      const v1 = nextResults.verifier;
      const blockingIssues = (v1?.issues || []).filter((i) => i.severity === 'blocking');
      const triggersRevision = v1?.status === 'fail' || blockingIssues.length > 0;

      // Phase 5b/5c: At most one revision pass.
      if (triggersRevision) {
        emitLog(
          `Verifier flagged ${blockingIssues.length} blocking issue(s). Asking Report Agent to revise.`
        );
        const previousReport = nextResults.report;
        setActiveAgents(['report']);
        setWorkflowPhase('revise');
        const revisionOutcome = await runOne('report', nextResults, {
          revisionFeedback: { previousReport, issues: blockingIssues }
        });
        applyOutcome(revisionOutcome);
        setResults(nextResults);
        if (signal.aborted) return exitAborted();

        if (!revisionOutcome.ok) {
          // Revision generation itself failed. Don't run Phase 5c — re-running
          // Verifier on the unchanged v1 would just repeat the v1 issues. Keep
          // v1 results visible with original Verifier output as final state.
          emitLog('Report v2 generation failed; preserving v1 with original Verifier issues as final state.');
        } else {
          setActiveAgents(['verifier']);
          setWorkflowPhase('verify-v2');
          applyOutcome(await runOne('verifier', nextResults));
          setResults(nextResults);
          if (signal.aborted) return exitAborted();

          const v2 = nextResults.verifier;
          if (v2?.status === 'pass') {
            emitLog('Verifier passed after one revision.');
          } else {
            emitLog(`Verifier still reports ${v2?.status || 'unknown'} after revision; surfacing remaining issues.`);
          }
        }
      } else if (v1?.status === 'warn') {
        emitLog(`Verifier passed with ${v1.issues?.length || 0} warning(s); not triggering revision.`);
      } else {
        emitLog('Verifier passed.');
      }
    }

    if (firstFailure) {
      setError(`Workflow finished with errors. First failure: ${firstFailure}`);
      emitLog('Workflow finished with errors. Downstream agents ran with reduced context.');
    } else {
      emitLog('Full finance workflow completed.');
    }

    finishRun();
  };

  return {
    results,
    activeAgents,
    completedAgents,
    failedAgents,
    logs,
    isRunning,
    error,
    allSources,
    workflowPhase,
    runAgent: runOneAgent,
    runWorkflow,
    cancel,
    reset,
    getStepState
  };
};
