import { memo } from 'react';
import { AGENT_ICONS } from '../constants.js';

export const AgentControls = memo(({
  agents,
  activeAgents,
  completedAgents,
  failedAgents,
  isRunning,
  hasReportTitle,
  hasDataPrice,
  onRunAgent
}) => (
  <div className="agent-panel">
    <div className="panel-heading">
      <h2>Agent Controls</h2>
      <span>
        {completedAgents.length}/{agents.length} complete
        {failedAgents.length > 0 ? ` · ${failedAgents.length} failed` : ''}
      </span>
    </div>
    <div className="agent-list">
      {agents.map((agent) => {
        const Icon = AGENT_ICONS[agent.id];
        const isActive = activeAgents.includes(agent.id);
        const isDone = completedAgents.includes(agent.id);
        const isFailed = failedAgents.includes(agent.id);
        const verifierBlocked = agent.id === 'verifier' && !hasReportTitle;
        const upstreamMissing = agent.id !== 'data' && !hasDataPrice;
        const buttonTitle = verifierBlocked
          ? 'Run Report Agent first — Verifier checks an existing report'
          : upstreamMissing
            ? `Run ${agent.label} (no Data context yet — output will be limited)`
            : `Run ${agent.label}`;
        return (
          <button
            key={agent.id}
            className={`agent-button ${isActive ? 'active' : ''} ${isDone ? 'done' : ''} ${isFailed ? 'failed' : ''}`}
            onClick={() => onRunAgent(agent.id)}
            disabled={isRunning || verifierBlocked}
            style={{ '--agent-accent': agent.accent }}
            title={buttonTitle}
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
));
