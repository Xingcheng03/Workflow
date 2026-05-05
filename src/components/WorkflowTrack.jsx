import { memo } from 'react';
import { AGENT_ICONS } from '../constants.js';

// Computes step state inline so `React.memo` can bail out cleanly: this
// component re-renders only when one of (activeAgents, completedAgents,
// failedAgents, completedAt) changes by reference. Avoids the indirection
// of a stable-but-opaque `getStepState` callback that wouldn't trip memo.
export const WorkflowTrack = memo(({
  agents,
  activeAgents,
  completedAgents,
  failedAgents,
  completedAt
}) => {
  const stateOf = (id) => {
    if (activeAgents.includes(id)) return 'active';
    if (completedAgents.includes(id)) return 'done';
    if (failedAgents.includes(id)) return 'failed';
    return '';
  };

  return (
    <div className="workflow-panel">
      <div className="panel-heading">
        <h2>Workflow</h2>
        <span>{completedAt || 'Not run yet'}</span>
      </div>
      <div className="workflow-track">
        {agents.map((agent, index) => {
          const Icon = AGENT_ICONS[agent.id];
          const state = stateOf(agent.id);
          return (
            <div className="workflow-step-wrap" key={agent.id}>
              <div className={`workflow-step ${state}`} style={{ '--agent-accent': agent.accent }}>
                <Icon size={19} aria-hidden="true" />
                <span>{agent.shortLabel}</span>
              </div>
              {index < agents.length - 1 && <div className={`connector ${state}`} />}
            </div>
          );
        })}
      </div>
    </div>
  );
});
