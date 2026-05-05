import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  FileText,
  LineChart,
  Newspaper,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react';
import { agentDefinitions, createCompanyShell, runAgent, validateSymbol } from './services/agentApi';

const icons = {
  data: Activity,
  news: Newspaper,
  analysis: BarChart3,
  risk: ShieldAlert,
  report: FileText
};

const metricItems = [
  ['price', 'Price'],
  ['change', 'Daily Change'],
  ['marketCap', 'Market Cap'],
  ['peRatio', 'P/E Ratio'],
  ['revenueGrowth', 'Revenue Growth'],
  ['profitMargin', 'Profit Margin'],
  ['debtToEquity', 'Debt / Equity']
];

function App() {
  const [symbol, setSymbol] = useState('TSLA');
  const [activeAgents, setActiveAgents] = useState([]);
  const [completedAgents, setCompletedAgents] = useState([]);
  const [failedAgents, setFailedAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(() => ({ company: createCompanyShell('TSLA') }));
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  const company = results.company || createCompanyShell(symbol);
  const knownSymbol = company.symbol;
  const timeline = useMemo(() => results.trend || [], [results.trend]);

  const emitLog = (message) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((current) => [{ time, message }, ...current].slice(0, 18));
  };

  const mergeResult = (agentId, payload) => {
    setResults((current) => ({
      ...current,
      ...payload,
      completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      lastAgent: agentId
    }));
  };

  const executeAgent = async (agentId) => {
    const validation = validateSymbol(symbol);
    if (!validation.ok) {
      setError(validation.error);
      emitLog(`Error: ${validation.error}`);
      return;
    }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setIsRunning(true);
    setActiveAgents([agentId]);
    setError('');
    setFailedAgents((current) => current.filter((id) => id !== agentId));
    try {
      const payload = await runAgent(agentId, validation.symbol, emitLog, results, signal);
      mergeResult(agentId, payload);
      setCompletedAgents((current) => (current.includes(agentId) ? current : [...current, agentId]));
      emitLog(`${agentDefinitions.find((agent) => agent.id === agentId).label} completed.`);
    } catch (exception) {
      if (exception.name !== 'AbortError') {
        setError(exception.message);
        emitLog(`Error: ${exception.message}`);
        setFailedAgents((current) => (current.includes(agentId) ? current : [...current, agentId]));
        setCompletedAgents((current) => current.filter((id) => id !== agentId));
      }
    } finally {
      setActiveAgents([]);
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const executeWorkflow = async () => {
    const validation = validateSymbol(symbol);
    if (!validation.ok) {
      setError(validation.error);
      emitLog(`Error: ${validation.error}`);
      return;
    }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setIsRunning(true);
    setCompletedAgents([]);
    setFailedAgents([]);
    setError('');
    let nextResults = { company: createCompanyShell(validation.symbol) };
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
          completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

    setActiveAgents(['data']);
    applyOutcome(await runOne('data', nextResults));
    setResults(nextResults);

    if (!signal.aborted) {
      const fanOut = ['news', 'analysis', 'risk'];
      setActiveAgents(fanOut);
      const fanContext = nextResults;
      const fanOutcomes = await Promise.all(fanOut.map((id) => runOne(id, fanContext)));
      fanOutcomes.forEach(applyOutcome);
      setResults(nextResults);
    }

    if (!signal.aborted) {
      setActiveAgents(['report']);
      applyOutcome(await runOne('report', nextResults));
      setResults(nextResults);
    }

    if (signal.aborted) {
      emitLog('Workflow aborted by user.');
    } else if (firstFailure) {
      setError(`Workflow finished with errors. First failure: ${firstFailure}`);
      emitLog('Workflow finished with errors. Downstream agents ran with reduced context.');
    } else {
      emitLog('Full finance workflow completed.');
    }

    setActiveAgents([]);
    setIsRunning(false);
    abortRef.current = null;
  };

  const resetBoard = () => {
    setCompletedAgents([]);
    setFailedAgents([]);
    setLogs([]);
    setError('');
    setResults({ company: createCompanyShell(symbol) });
    setActiveAgents([]);
  };

  const cancelOrReset = () => {
    if (isRunning && abortRef.current) {
      abortRef.current.abort();
    } else {
      resetBoard();
    }
  };

  return (
    <main className="app-shell" aria-busy={isRunning}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Finance workflow cockpit</p>
          <h1>FinAgent Dashboard</h1>
        </div>
        <div className="status-pill">
          <span className={isRunning ? 'pulse-dot running' : 'pulse-dot'} />
          {isRunning ? 'Agents running' : 'Ready'}
        </div>
      </header>

      <section className="command-strip" aria-label="Stock command center">
        <label className="symbol-field">
          <span>Ticker</span>
          <div className="input-wrap">
            <Search size={18} aria-hidden="true" />
            <input
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              placeholder="AAPL, TSLA, NVDA"
              maxLength={12}
              aria-label="Stock ticker"
            />
          </div>
        </label>
        <div className="company-snapshot">
          <span>{knownSymbol}</span>
          <strong>{company.name}</strong>
          <small>{company.sector}</small>
        </div>
        <div className="command-actions">
          <button className="primary-btn" onClick={executeWorkflow} disabled={isRunning} title="Run all agents">
            <Play size={18} aria-hidden="true" />
            Run Full Analysis
          </button>
          <button
            className="icon-btn"
            onClick={cancelOrReset}
            title={isRunning ? 'Cancel workflow' : 'Reset dashboard'}
            aria-label={isRunning ? 'Cancel workflow' : 'Reset dashboard'}
          >
            {isRunning ? <X size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        {error && (
          <div className="error-panel" role="alert">
            <strong>Agent error</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="agent-panel">
          <div className="panel-heading">
            <h2>Agent Controls</h2>
            <span>
              {completedAgents.length}/5 complete
              {failedAgents.length > 0 ? ` · ${failedAgents.length} failed` : ''}
            </span>
          </div>
          <div className="agent-list">
            {agentDefinitions.map((agent) => {
              const Icon = icons[agent.id];
              const isActive = activeAgents.includes(agent.id);
              const isDone = completedAgents.includes(agent.id);
              const isFailed = failedAgents.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  className={`agent-button ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''}`}
                  onClick={() => executeAgent(agent.id)}
                  disabled={isRunning}
                  style={{ '--agent-accent': agent.accent }}
                  title={`Run ${agent.label}`}
                >
                  <span className="agent-icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{agent.label}</strong>
                    <small>{agent.purpose}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="workflow-panel">
          <div className="panel-heading">
            <h2>Workflow</h2>
            <span>{results.completedAt || 'Not run yet'}</span>
          </div>
          <div className="workflow-track">
            {agentDefinitions.map((agent, index) => {
              const Icon = icons[agent.id];
              const state =
                activeAgents.includes(agent.id)
                  ? 'active'
                  : completedAgents.includes(agent.id)
                    ? 'done'
                    : failedAgents.includes(agent.id)
                      ? 'failed'
                      : '';
              return (
                <div className="workflow-step-wrap" key={agent.id}>
                  <div className={`workflow-step ${state}`} style={{ '--agent-accent': agent.accent }}>
                    <Icon size={19} aria-hidden="true" />
                    <span>{agent.label.replace(' Agent', '')}</span>
                  </div>
                  {index < agentDefinitions.length - 1 && <div className={`connector ${state}`} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="metrics-panel">
          <div className="panel-heading">
            <h2>Financial Metrics</h2>
            <span>{company.recommendation}</span>
          </div>
          <div className="metric-grid">
            {metricItems.map(([key, label]) => (
              <div className="metric-card" key={key}>
                <span>{label}</span>
                <strong>{results.metrics?.[key] ?? '--'}</strong>
              </div>
            ))}
            <div className="metric-card sentiment">
              <span>Sentiment</span>
              <strong>{results.sentimentScore !== undefined ? `${results.sentimentScore}/100` : '--'}</strong>
            </div>
          </div>
        </div>

        <div className="trend-panel">
          <div className="panel-heading">
            <h2>Price Trend</h2>
            <span>{timeline.length ? `${timeline.length} points` : 'Live chart'}</span>
          </div>
          <div className="trend-bars" role="img" aria-label="Seven period price trend">
            {timeline.length ? (
              timeline.map((value, index) => {
                const min = Math.min(...timeline);
                const max = Math.max(...timeline);
                const height = 34 + ((value - min) / Math.max(max - min, 1)) * 92;
                return (
                  <div className="bar-wrap" key={`${value}-${index}`}>
                    <div className="bar" style={{ height }} />
                    <span>{index + 1}</span>
                  </div>
                );
              })
            ) : (
              <p className="empty-state">Run Data or Analysis Agent.</p>
            )}
          </div>
        </div>

        <div className="log-panel">
          <div className="panel-heading">
            <h2>Execution Logs</h2>
            <span>{logs.length} entries</span>
          </div>
          <div className="log-list" role="log" aria-live="polite" aria-relevant="additions">
            {logs.length === 0 ? (
              <p className="empty-state">No agent activity yet.</p>
            ) : (
              logs.map((log, index) => (
                <div className="log-row" key={`${log.time}-${index}`}>
                  <time>{log.time}</time>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="report-panel">
          <div className="panel-heading">
            <h2>Agent Report</h2>
            <span>{results.report ? 'Generated' : 'Draft pending'}</span>
          </div>
          {results.report ? (
            <article className="report">
              <div className="report-title">
                <Sparkles size={20} aria-hidden="true" />
                <div>
                  <h3>{results.report.title}</h3>
                  <span>{results.report.recommendation}</span>
                </div>
              </div>
              <p>{results.report.thesis}</p>
              <ul>
                {results.report.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
              {results.sources?.length > 0 && (
                <div className="source-list">
                  <strong>Sources</strong>
                  {results.sources.map((source) => (
                    <a href={source.uri} key={source.uri} target="_blank" rel="noreferrer">
                      {source.title}
                    </a>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <article className="report standby">
              <div className="report-title">
                <LineChart size={20} aria-hidden="true" />
                <div>
                  <h3>{company.name}</h3>
                  <span>{company.recommendation}</span>
                </div>
              </div>
              <p>{company.thesis}</p>
              {results.marketMeta && (
                <ul>
                  <li>Source: {results.marketMeta.source}</li>
                  <li>Regular close: {results.marketMeta.regularMarketPrice}</li>
                  <li>Day range: {results.marketMeta.regularMarketDayLow} to {results.marketMeta.regularMarketDayHigh}</li>
                  <li>52 week range: {results.marketMeta.fiftyTwoWeekLow} to {results.marketMeta.fiftyTwoWeekHigh}</li>
                </ul>
              )}
            </article>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
