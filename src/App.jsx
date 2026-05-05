import { useEffect, useRef, useState } from 'react';
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

function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const wf = useAgentWorkflow(DEFAULT_SYMBOL);

  const company = wf.results.data?.company || createCompanyShell(symbol);
  const history = wf.results.data?.history || [];
  const intraday = wf.results.data?.trend || [];
  const timeline = history.length > 0 ? history : intraday;
  const timelineLabel = history.length > 0 ? '6-month daily' : 'Intraday';

  const handleCancelOrReset = () => {
    if (wf.isRunning) wf.cancel();
    else wf.reset(symbol);
  };

  // Keep a ref so the keydown listener (registered once) always sees the
  // latest workflow state without needing to re-bind the listener on each render.
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
      <Topbar
        isRunning={wf.isRunning}
        workflowPhase={wf.workflowPhase}
        activeAgents={wf.activeAgents}
        agentDefinitions={agentDefinitions}
      />

      <CommandStrip
        symbol={symbol}
        setSymbol={setSymbol}
        isRunning={wf.isRunning}
        onRun={() => wf.runWorkflow(symbol)}
        onCancelOrReset={handleCancelOrReset}
        knownSymbol={company.symbol}
        companyName={company.name}
        companySector={company.sector}
      />

      <section className="workspace-grid" aria-busy={wf.isRunning}>
        <ErrorBanner message={wf.error} />

        <AgentControls
          agents={agentDefinitions}
          activeAgents={wf.activeAgents}
          completedAgents={wf.completedAgents}
          failedAgents={wf.failedAgents}
          isRunning={wf.isRunning}
          hasReportTitle={!!wf.results.report?.title}
          hasDataPrice={!!wf.results.data?.metrics?.price}
          onRunAgent={(agentId) => wf.runAgent(agentId, symbol)}
        />

        <WorkflowTrack
          agents={agentDefinitions}
          getStepState={wf.getStepState}
          completedAt={wf.results.completedAt}
        />

        <MetricsPanel
          recommendation={company.recommendation}
          metrics={wf.results.data?.metrics}
          sentimentScore={wf.results.news?.sentimentScore}
        />

        <FindingsPanel
          news={wf.results.news}
          analysis={wf.results.analysis}
          risk={wf.results.risk}
        />

        <TrendPanel
          timeline={timeline}
          timelineLabel={timelineLabel}
          metrics={wf.results.data?.metrics}
        />

        <LogPanel logs={wf.logs} />

        <ReportPanel
          report={wf.results.report}
          verifier={wf.results.verifier}
          allSources={wf.allSources}
          company={company}
          marketMeta={wf.results.data?.marketMeta}
        />
      </section>
    </main>
  );
}

export default App;
