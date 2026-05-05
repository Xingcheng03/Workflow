import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { agentDefinitions, createCompanyShell } from './services/agentApi';
import { useAgentWorkflow } from './hooks/useAgentWorkflow';
import { DEFAULT_SYMBOL } from './constants.js';
import { Topbar } from './components/Topbar.jsx';
import { CommandStrip } from './components/CommandStrip.jsx';
import { ErrorBanner } from './components/ErrorBanner.jsx';
import { AgentControls } from './components/AgentControls.jsx';
import { WorkflowTrack } from './components/WorkflowTrack.jsx';
import { MetricsPanel } from './components/MetricsPanel.jsx';
import { FindingsPanel } from './components/FindingsPanel.jsx';
import { TrendPanel } from './components/TrendPanel.jsx';
import { LogPanel } from './components/LogPanel.jsx';
import { ReportPanel } from './components/ReportPanel.jsx';
import { AgentDetailModal } from './components/AgentDetailModal.jsx';

function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  // Currently-open agent detail modal. null when no modal is open.
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  // Destructure the hook return so dep arrays below can name individual
  // callbacks instead of referencing `wf.x` (which makes the hooks lint rule
  // unhappy, and would also pull every render's fresh `wf` object reference
  // into the deps). `runAgent` is intentionally not destructured — the UI
  // no longer triggers single-agent runs; only Run Full Analysis kicks off
  // work. The hook still exposes runAgent for tests / future callers.
  const {
    results,
    activeAgents,
    completedAgents,
    failedAgents,
    logs,
    isRunning,
    error,
    allSources,
    workflowPhase,
    runWorkflow,
    cancel,
    reset
  } = useAgentWorkflow(DEFAULT_SYMBOL);

  // Memoised so memoised panels can bail when nothing they care about
  // changed. Without these wrappers, fresh array/object literals (`|| []`,
  // shell company) would be a new reference every render and defeat memo.
  const company = useMemo(
    () => results.data?.company || createCompanyShell(symbol),
    [results.data?.company, symbol]
  );
  // Prefer the 6-month daily OHLC when available (richer story); fall back
  // to intraday for live charts. Closes-only arrays are still used by the
  // agent prompts via summarizeContext.
  const trendOhlc = useMemo(() => {
    const history = results.data?.historyOhlc || [];
    const intraday = results.data?.trendOhlc || [];
    return history.length > 0 ? history : intraday;
  }, [results.data?.historyOhlc, results.data?.trendOhlc]);
  const trendLabel = (results.data?.historyOhlc?.length ?? 0) > 0 ? '6-month daily' : 'Intraday';

  const handleRun = useCallback(() => runWorkflow(symbol), [runWorkflow, symbol]);
  const handleCancelOrReset = useCallback(() => {
    if (isRunning) cancel();
    else reset(symbol);
  }, [isRunning, cancel, reset, symbol]);
  const handleAgentClick = useCallback((agentId) => setSelectedAgentId(agentId), []);
  const handleCloseModal = useCallback(() => setSelectedAgentId(null), []);

  // Keep a ref so the keydown listener (registered once) always sees the
  // latest values without re-binding on every render.
  const cancelRef = useRef(cancel);
  const isRunningRef = useRef(isRunning);
  cancelRef.current = cancel;
  isRunningRef.current = isRunning;
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape' && isRunningRef.current) {
        cancelRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <main className="app-shell">
      <Topbar
        isRunning={isRunning}
        workflowPhase={workflowPhase}
        activeAgents={activeAgents}
        agentDefinitions={agentDefinitions}
      />

      <CommandStrip
        symbol={symbol}
        setSymbol={setSymbol}
        isRunning={isRunning}
        onRun={handleRun}
        onCancelOrReset={handleCancelOrReset}
        knownSymbol={company.symbol}
        companyName={company.name}
        companySector={company.sector}
      />

      <section className="workspace-grid" aria-busy={isRunning}>
        <ErrorBanner message={error} />

        <AgentControls
          agents={agentDefinitions}
          activeAgents={activeAgents}
          completedAgents={completedAgents}
          failedAgents={failedAgents}
          onAgentClick={handleAgentClick}
        />

        <WorkflowTrack
          activeAgents={activeAgents}
          completedAgents={completedAgents}
          failedAgents={failedAgents}
          workflowPhase={workflowPhase}
          completedAt={results.completedAt}
        />

        <MetricsPanel
          recommendation={company.recommendation}
          metrics={results.data?.metrics}
          sentimentScore={results.news?.sentimentScore}
        />

        <FindingsPanel
          news={results.news}
          analysis={results.analysis}
          risk={results.risk}
        />

        <TrendPanel
          ohlc={trendOhlc}
          label={trendLabel}
          metrics={results.data?.metrics}
          marketMeta={results.data?.marketMeta}
        />

        <LogPanel logs={logs} />

        <ReportPanel
          report={results.report}
          verifier={results.verifier}
          allSources={allSources}
          company={company}
          marketMeta={results.data?.marketMeta}
        />
      </section>

      <AgentDetailModal
        agentId={selectedAgentId}
        results={results}
        onClose={handleCloseModal}
      />
    </main>
  );
}

export default App;
