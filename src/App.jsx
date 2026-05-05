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
  const logIdRef = useRef(0);

  const company = results.company || createCompanyShell(symbol);
  const knownSymbol = company.symbol;
  const timeline = useMemo(() => results.trend || [], [results.trend]);
  const allSources = useMemo(() => {
    const collected = [];
    ['news', 'analysis', 'risk', 'report'].forEach((id) => {
      const list = results[`${id}Sources`];
      if (Array.isArray(list)) collected.push(...list);
    });
    return collected.filter(
      (s, i, arr) => s.uri && arr.findIndex((x) => x.uri === s.uri) === i
    );
  }, [results]);

  const emitLog = (message) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const id = ++logIdRef.current;
    setLogs((current) => [...current, { id, time, message }].slice(-40));
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
    const previousSymbol = results.company?.symbol;
    const stale = previousSymbol && previousSymbol !== validation.symbol;
    let agentContext = results;
    if (stale) {
      setResults({ company: createCompanyShell(validation.symbol) });
      setCompletedAgents([]);
      setFailedAgents([]);
      emitLog(`Cleared previous results for ${previousSymbol}.`);
      agentContext = {};
    }
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    setIsRunning(true);
    setActiveAgents([agentId]);
    setError('');
    setFailedAgents((current) => current.filter((id) => id !== agentId));
    try {
      const payload = await runAgent(agentId, validation.symbol, emitLog, agentContext, signal);
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

    const finish = () => {
      setActiveAgents([]);
      setIsRunning(false);
      abortRef.current = null;
    };

    const exitAborted = () => {
      emitLog('Workflow aborted by user.');
      finish();
    };

    setActiveAgents(['data']);
    applyOutcome(await runOne('data', nextResults));
    setResults(nextResults);
    if (signal.aborted) return exitAborted();

    const fanOut = ['news', 'analysis', 'risk'];
    setActiveAgents(fanOut);
    const fanContext = nextResults;
    const fanOutcomes = await Promise.all(fanOut.map((id) => runOne(id, fanContext)));
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

    finish();
  };

  const resetBoard = () => {
    setCompletedAgents([]);
    setFailedAgents([]);
    setLogs([]);
    setError('');
    setResults({ company: createCompanyShell(symbol) });
    setActiveAgents([]);
  };

  const getStepState = (id) => {
    if (activeAgents.includes(id)) return 'active';
    if (completedAgents.includes(id)) return 'done';
    if (failedAgents.includes(id)) return 'failed';
    return '';
  };

  const cancelOrReset = () => {
    if (isRunning && abortRef.current) {
      abortRef.current.abort();
    } else {
      resetBoard();
    }
  };

  return (
    <main className="app-shell">
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
              maxLength={8}
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

      <section className="workspace-grid" aria-busy={isRunning}>
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
              const state = getStepState(agent.id);
              return (
                <div className="workflow-step-wrap" key={agent.id}>
                  <div className={`workflow-step ${state}`} style={{ '--agent-accent': agent.accent }}>
                    <Icon size={19} aria-hidden="true" />
                    <span>{agent.shortLabel}</span>
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

        <div className="findings-panel">
          <div className="panel-heading">
            <h2>Agent Findings</h2>
            <span>
              {results.news || results.valuation || results.riskLevel ? 'Live' : 'Pending'}
            </span>
          </div>
          <div className="findings-body">
            {results.news?.length > 0 && (
              <section className="finding-block news">
                <h3>Recent News</h3>
                <ul>
                  {results.news.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </section>
            )}

            {(results.valuation || results.growthView || results.marginView || results.analysisSummary) && (
              <section className="finding-block analysis">
                <h3>Analysis</h3>
                <ul className="kv">
                  {results.valuation && <li><b>Valuation:</b> {results.valuation}</li>}
                  {results.growthView && <li><b>Growth:</b> {results.growthView}</li>}
                  {results.marginView && <li><b>Margins:</b> {results.marginView}</li>}
                </ul>
                {results.analysisSummary && <p>{results.analysisSummary}</p>}
              </section>
            )}

            {results.riskLevel && (
              <section className="finding-block risk">
                <h3>Risks &amp; Opportunities <small>{results.riskLevel}</small></h3>
                <div className="risk-cols">
                  <div>
                    <strong>Risks</strong>
                    <ul>
                      {(results.risks || []).map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                  <div>
                    <strong>Opportunities</strong>
                    <ul>
                      {(results.opportunities || []).map((o, i) => <li key={i}>{o}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {!(results.news || results.valuation || results.riskLevel) && (
              <p className="empty-state">News, Analysis, and Risk findings appear here as agents complete.</p>
            )}
          </div>
        </div>

        <div className="trend-panel">
          <div className="panel-heading">
            <h2>Price Trend</h2>
            <span>{timeline.length ? `${timeline.length} points` : 'Live chart'}</span>
          </div>
          <div className="trend-bars" role="img" aria-label={`${timeline.length}-point price trend`}>
            {timeline.length ? (() => {
              const min = Math.min(...timeline);
              const max = Math.max(...timeline);
              const range = Math.max(max - min, 1);
              return timeline.map((value, index) => {
                const height = 34 + ((value - min) / range) * 92;
                return (
                  <div className="bar-wrap" key={index}>
                    <div className="bar" style={{ height }} />
                    <span>{index === 0 ? 'older' : index === timeline.length - 1 ? 'newer' : ''}</span>
                  </div>
                );
              });
            })() : (
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
              logs.map((log) => (
                <div className="log-row" key={log.id}>
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
                {results.report.bullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
              {allSources.length > 0 && (
                <div className="source-list">
                  <strong>Sources</strong>
                  {allSources.map((source) => (
                    <a href={source.uri} key={source.uri} target="_blank" rel="noopener noreferrer">
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
