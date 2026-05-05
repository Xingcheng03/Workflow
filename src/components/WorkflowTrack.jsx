import { AGENT_ICONS } from '../constants.js';

export const WorkflowTrack = ({ agents, getStepState, completedAt }) => (
  <div className="workflow-panel">
    <div className="panel-heading">
      <h2>Workflow</h2>
      <span>{completedAt || 'Not run yet'}</span>
    </div>
    <div className="workflow-track">
      {agents.map((agent, index) => {
        const Icon = AGENT_ICONS[agent.id];
        const state = getStepState(agent.id);
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
