import React, { useEffect, useRef, useState } from 'react';
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
import { agentDefinitions, createCompanyShell } from './services/agentApi';
import { useAgentWorkflow } from './hooks/useAgentWorkflow';

const DEFAULT_SYMBOL = 'TSLA';

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

const RECOMMENDATION_CHIP = {
  Buy: 'chip-buy',
  Hold: 'chip-hold',
  Watch: 'chip-watch',
  Avoid: 'chip-avoid'
};

const RISK_CHIP = {
  Low: 'chip-low',
  Moderate: 'chip-moderate',
  Elevated: 'chip-elevated',
  High: 'chip-high'
};

const Chip = ({ value, classMap, fallback = 'Not rated' }) => {
  const display = value || fallback;
  const variant = classMap[display] || 'chip-neutral';
  return <span className={`chip ${variant}`}>{display}</span>;
};

const SentimentBar = ({ score }) => {
  if (score === undefined || score === null) return <strong>--</strong>;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 65 ? 'pos' : clamped >= 35 ? 'neu' : 'neg';
  return (
    <div className="sentiment-row" aria-label={`Sentiment ${clamped} out of 100`}>
      <div className="sentiment-bar">
        <div className={`sentiment-fill sentiment-${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <strong>{clamped}</strong>
    </div>
  );
};

function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const wf = useAgentWorkflow(DEFAULT_SYMBOL);

  const company = wf.results.data?.company || createCompanyShell(symbol);
  const knownSymbol = company.symbol;
  const timeline = wf.results.data?.trend || [];
  const newsHeadlines = wf.results.news?.news || [];
  const riskRisks = wf.results.risk?.risks || [];
  const riskOpportunities = wf.results.risk?.opportunities || [];

  const handleCancelOrReset = () => {
    if (wf.isRunning) wf.cancel();
    else wf.reset(symbol);
  };

  const wfRef = useRef(wf);
  wfRef.current = wf;
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape' && wfRef.current.isRunning) {
        wfRef.current.cancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Finance workflow cockpit</p>
          <h1>FinAgent Dashboard</h1>
        </div>
        <div className="status-pill">
          <span className={wf.isRunning ? 'pulse-dot running' : 'pulse-dot'} />
          {!wf.isRunning
            ? 'Ready'
            : wf.activeAgents.length > 1
              ? `Running ${wf.activeAgents.length} agents in parallel`
              : wf.activeAgents.length === 1
                ? `Running ${agentDefinitions.find((a) => a.id === wf.activeAgents[0])?.label ?? 'agent'}`
                : 'Wrapping up'}
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
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !wf.isRunning) {
                  wf.runWorkflow(symbol);
                }
              }}
              placeholder="AAPL, TSLA, NVDA"
              maxLength={8}
              aria-label="Stock ticker (press Enter to run full analysis)"
            />
          </div>
        </label>
        <div className="company-snapshot">
          <span>{knownSymbol}</span>
          <strong>{company.name}</strong>
          <small>{company.sector}</small>
        </div>
        <div className="command-actions">
          <button
            className="primary-btn"
            onClick={() => wf.runWorkflow(symbol)}
            disabled={wf.isRunning}
            title="Run all agents"
          >
            <Play size={18} aria-hidden="true" />
            Run Full Analysis
          </button>
          <button
            className="icon-btn"
            onClick={handleCancelOrReset}
            title={wf.isRunning ? 'Cancel workflow' : 'Reset dashboard'}
            aria-label={wf.isRunning ? 'Cancel workflow' : 'Reset dashboard'}
          >
            {wf.isRunning ? <X size={18} aria-hidden="true" /> : <RefreshCw size={18} aria-hidden="true" />}
          </button>
        </div>
      </section>

      <section className="workspace-grid" aria-busy={wf.isRunning}>
        {wf.error && (
          <div className="error-panel" role="alert">
            <strong>Agent error</strong>
            <span>{wf.error}</span>
          </div>
        )}

        <div className="agent-panel">
          <div className="panel-heading">
            <h2>Agent Controls</h2>
            <span>
              {wf.completedAgents.length}/5 complete
              {wf.failedAgents.length > 0 ? ` · ${wf.failedAgents.length} failed` : ''}
            </span>
          </div>
          <div className="agent-list">
            {agentDefinitions.map((agent) => {
              const Icon = icons[agent.id];
              const isActive = wf.activeAgents.includes(agent.id);
              const isDone = wf.completedAgents.includes(agent.id);
              const isFailed = wf.failedAgents.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  className={`agent-button ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''}`}
                  onClick={() => wf.runAgent(agent.id, symbol)}
                  disabled={wf.isRunning}
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
            <span>{wf.results.completedAt || 'Not run yet'}</span>
          </div>
          <div className="workflow-track">
            {agentDefinitions.map((agent, index) => {
              const Icon = icons[agent.id];
              const state = wf.getStepState(agent.id);
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
            <Chip value={company.recommendation} classMap={RECOMMENDATION_CHIP} />
          </div>
          <div className="metric-grid">
            {metricItems.map(([key, label]) => (
              <div className="metric-card" key={key}>
                <span>{label}</span>
                <strong>{wf.results.data?.metrics?.[key] ?? '--'}</strong>
              </div>
            ))}
            <div className="metric-card sentiment">
              <span>Sentiment</span>
              <SentimentBar score={wf.results.news?.sentimentScore} />
            </div>
          </div>
        </div>

        <div className="findings-panel">
          <div className="panel-heading">
            <h2>Agent Findings</h2>
            <span>
              {wf.results.news || wf.results.analysis || wf.results.risk ? 'Live' : 'Pending'}
            </span>
          </div>
          <div className="findings-body">
            {newsHeadlines.length > 0 && (
              <section className="finding-block news">
                <h3>Recent News</h3>
                <ul>
                  {newsHeadlines.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </section>
            )}

            {wf.results.analysis &&
              (wf.results.analysis.valuation ||
                wf.results.analysis.growthView ||
                wf.results.analysis.marginView ||
                wf.results.analysis.analysisSummary) && (
                <section className="finding-block analysis">
                  <h3>Analysis</h3>
                  <ul className="kv">
                    {wf.results.analysis.valuation && <li><b>Valuation:</b> {wf.results.analysis.valuation}</li>}
                    {wf.results.analysis.growthView && <li><b>Growth:</b> {wf.results.analysis.growthView}</li>}
                    {wf.results.analysis.marginView && <li><b>Margins:</b> {wf.results.analysis.marginView}</li>}
                  </ul>
                  {wf.results.analysis.analysisSummary && <p>{wf.results.analysis.analysisSummary}</p>}
                </section>
              )}

            {wf.results.risk?.riskLevel && (
              <section className="finding-block risk">
                <h3>
                  Risks &amp; Opportunities{' '}
                  <Chip value={wf.results.risk.riskLevel} classMap={RISK_CHIP} fallback="" />
                </h3>
                <div className="risk-cols">
                  <div>
                    <strong>Risks</strong>
                    <ul>
                      {riskRisks.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                  <div>
                    <strong>Opportunities</strong>
                    <ul>
                      {riskOpportunities.map((o, i) => <li key={i}>{o}</li>)}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {!(wf.results.news || wf.results.analysis || wf.results.risk) && (
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
            <span>{wf.logs.length} entries</span>
          </div>
          <div className="log-list" role="log" aria-live="polite" aria-relevant="additions">
            {wf.logs.length === 0 ? (
              <p className="empty-state">No agent activity yet.</p>
            ) : (
              wf.logs.map((log) => (
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
            <span>{wf.results.report?.title ? 'Generated' : 'Draft pending'}</span>
          </div>
          {wf.results.report?.title ? (
            <article className="report">
              <div className="report-title">
                <Sparkles size={20} aria-hidden="true" />
                <div>
                  <h3>{wf.results.report.title}</h3>
                  <Chip value={wf.results.report.recommendation} classMap={RECOMMENDATION_CHIP} />
                </div>
              </div>
              <p>{wf.results.report.thesis}</p>
              <ul>
                {(wf.results.report.bullets || []).map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
              {wf.allSources.length > 0 && (
                <div className="source-list">
                  <strong>Sources</strong>
                  {wf.allSources.map((source) => (
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
                  <Chip value={company.recommendation} classMap={RECOMMENDATION_CHIP} />
                </div>
              </div>
              <p>{company.thesis}</p>
              {wf.results.data?.marketMeta && (
                <ul>
                  <li>Source: {wf.results.data.marketMeta.source}</li>
                  <li>Regular close: {wf.results.data.marketMeta.regularMarketPrice}</li>
                  <li>Day range: {wf.results.data.marketMeta.regularMarketDayLow} to {wf.results.data.marketMeta.regularMarketDayHigh}</li>
                  <li>52 week range: {wf.results.data.marketMeta.fiftyTwoWeekLow} to {wf.results.data.marketMeta.fiftyTwoWeekHigh}</li>
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
