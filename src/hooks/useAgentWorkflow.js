import { useMemo, useRef, useState } from 'react';
import {
  agentDefinitions,
  createCompanyShell,
  runAgent,
  validateSymbol
} from '../services/agentApi';

const FAN_OUT_AGENTS = ['news', 'analysis', 'risk'];
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

    const runOne = async (agentId, context) => {
      if (signal.aborted) return { aborted: true, agentId };
      try {
        const payload = await runAgent(agentId, validation.symbol, emitLog, context, signal);
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

    setActiveAgents(FAN_OUT_AGENTS);
    const fanContext = nextResults;
    const fanOutcomes = await Promise.all(FAN_OUT_AGENTS.map((id) => runOne(id, fanContext)));
    fanOutcomes.forEach(applyOutcome);
    setResults(nextResults);
    if (signal.aborted) return exitAborted();

    setActiveAgents(['report']);
    applyOutcome(await runOne('report', nextResults));
    setResults(nextResults);

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
    runAgent: runOneAgent,
    runWorkflow,
    cancel,
    reset,
    getStepState
  };
};
