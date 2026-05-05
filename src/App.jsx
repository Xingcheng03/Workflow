import React, { useMemo, useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { agentDefinitions, createCompanyShell, runAgent } from './services/agentApi';

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
  const [activeAgent, setActiveAgent] = useState(null);
  const [completedAgents, setCompletedAgents] = useState([]);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(() => ({ company: createCompanyShell('TSLA') }));
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');

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
    setIsRunning(true);
    setActiveAgent(agentId);
    setError('');
    try {
      const payload = await runAgent(agentId, symbol, emitLog, results);
      mergeResult(agentId, payload);
      setCompletedAgents((current) => (current.includes(agentId) ? current : [...current, agentId]));
      emitLog(`${agentDefinitions.find((agent) => agent.id === agentId).label} completed.`);
    } catch (exception) {
      setError(exception.message);
      emitLog(`Error: ${exception.message}`);
    } finally {
      setActiveAgent(null);
      setIsRunning(false);
    }
  };

  const executeWorkflow = async () => {
    setIsRunning(true);
    setCompletedAgents([]);
    setError('');
    let nextResults = { company: createCompanyShell(symbol) };
    setResults(nextResults);
    emitLog(`Full workflow queued for ${symbol.trim().toUpperCase() || 'AAPL'}.`);

    try {
      for (const agent of agentDefinitions) {
        setActiveAgent(agent.id);
        const payload = await runAgent(agent.id, symbol, emitLog, nextResults);
        nextResults = {
          ...nextResults,
          ...payload,
          completedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          lastAgent: agent.id
        };
        setResults(nextResults);
        setCompletedAgents((current) => [...current, agent.id]);
      }
      emitLog('Full finance workflow completed.');
    } catch (exception) {
      setError(exception.message);
      emitLog(`Error: ${exception.message}`);
    } finally {
      setActiveAgent(null);
      setIsRunning(false);
    }
  };

  const resetBoard = () => {
    setCompletedAgents([]);
    setLogs([]);
    setError('');
    setResults({ company: createCompanyShell(symbol) });
    setActiveAgent(null);
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
          <button className="icon-btn" onClick={resetBoard} disabled={isRunning} title="Reset dashboard" aria-label="Reset dashboard">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="workspace-grid">
        {error && (
          <div className="error-panel" role="alert">
            <strong>Gemini API error</strong>
            <span>{error}</span>
          </div>
        )}

        <div className="agent-panel">
          <div className="panel-heading">
            <h2>Agent Controls</h2>
            <span>{completedAgents.length}/5 complete</span>
          </div>
          <div className="agent-list">
            {agentDefinitions.map((agent) => {
              const Icon = icons[agent.id];
              const isActive = activeAgent === agent.id;
              const isDone = completedAgents.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  className={`agent-button ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
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
              const state = activeAgent === agent.id ? 'active' : completedAgents.includes(agent.id) ? 'done' : '';
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
          <div className="log-list">
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
