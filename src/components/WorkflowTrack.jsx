import { memo } from 'react';
import { agentDefinitions } from '../services/agentApi';
import { AGENT_ICONS, PHASE_BADGE, WORKFLOW_PHASES } from '../constants.js';

const agentById = (id) => agentDefinitions.find((a) => a.id === id);

// Phase-level state derived from the union of its agents' states. The Verify
// phase has special handling because the verifier loop (verify-v1 / revise /
// verify-v2) repeatedly cycles between the verifier and report agents — we
// treat the whole phase as 'active' whenever workflowPhase is set.
//
// Phase 4 (Report) is also forced to 'done' during the verifier loop:
// the report agent re-enters activeAgents during 'revise', but conceptually
// Phase 4 finished long before — showing it as still-active there would be
// misleading.
export const phaseState = (phase, ctx) => {
  const { activeAgents, completedAgents, failedAgents, workflowPhase } = ctx;

  if (phase.usesVerifierLoop) {
    if (workflowPhase) return 'active';
    if (failedAgents.includes('verifier')) return 'failed';
    if (completedAgents.includes('verifier')) return 'done';
    return '';
  }

  if (workflowPhase && phase.agents.includes('report')) {
    if (failedAgents.includes('report')) return 'failed';
    return 'done';
  }

  if (phase.agents.some((id) => activeAgents.includes(id))) return 'active';
  if (phase.agents.some((id) => failedAgents.includes(id))) return 'failed';
  if (phase.agents.every((id) => completedAgents.includes(id))) return 'done';
  return '';
};

// Per-agent state inside a phase cell — used to highlight ONLY the agent
// that's currently running within a parallel phase (e.g. Risk done first,
// Analysis still active → Risk shows 'done', Analysis shows 'active').
const agentMicroState = (id, ctx) => {
  if (ctx.activeAgents.includes(id)) return 'active';
  if (ctx.failedAgents.includes(id)) return 'failed';
  if (ctx.completedAgents.includes(id)) return 'done';
  return '';
};

const PhaseCell = ({ phase, ctx }) => {
  const state = phaseState(phase, ctx);
  const isVerify = phase.usesVerifierLoop;
  const badge = isVerify ? PHASE_BADGE[ctx.workflowPhase] : null;
  return (
    <div
      className={`workflow-phase ${state} ${phase.parallel ? 'parallel' : ''}`}
      aria-label={`${phase.label} phase, ${state || 'idle'}`}
    >
      {badge && <span className={`phase-badge phase-badge-${ctx.workflowPhase}`}>{badge}</span>}
      <div className="phase-cell">
        {phase.agents.map((id) => {
          const agent = agentById(id);
          const Icon = AGENT_ICONS[id];
          const micro = agentMicroState(id, ctx);
          return (
            <div
              key={id}
              className={`phase-agent ${micro}`}
              style={{ '--agent-accent': agent.accent }}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{agent.shortLabel}</span>
            </div>
          );
        })}
      </div>
      <small className="phase-label">{phase.label}</small>
    </div>
  );
};

// Re-renders only when one of its consumed slices changes. App.jsx passes
// the four arrays/string directly so memo can compare them with shallow ref
// equality — the hook keeps these stable across renders that don't touch them.
export const WorkflowTrack = memo(({
  activeAgents,
  completedAgents,
  failedAgents,
  workflowPhase,
  completedAt
}) => {
  const ctx = { activeAgents, completedAgents, failedAgents, workflowPhase };
  return (
    <div className="workflow-panel">
      <div className="panel-heading">
        <h2>Workflow</h2>
        <span>{completedAt || 'Not run yet'}</span>
      </div>
      <div className="workflow-track">
        {WORKFLOW_PHASES.map((phase, index) => (
          <div className="workflow-phase-wrap" key={phase.id}>
            <PhaseCell phase={phase} ctx={ctx} />
            {index < WORKFLOW_PHASES.length - 1 && (
              <div className={`connector ${phaseState(phase, ctx)}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});
