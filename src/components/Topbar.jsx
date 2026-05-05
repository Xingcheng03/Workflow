import { memo } from 'react';
import { statusPillText } from './statusPill.js';

export const Topbar = memo(({ isRunning, workflowPhase, activeAgents, agentDefinitions }) => {
  const text = statusPillText({ isRunning, workflowPhase, activeAgents, agentDefinitions });
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Finance workflow cockpit</p>
        <h1>FinAgent Dashboard</h1>
      </div>
      <div className="status-pill">
        <span className={isRunning ? 'pulse-dot running' : 'pulse-dot'} />
        {text}
      </div>
    </header>
  );
});
