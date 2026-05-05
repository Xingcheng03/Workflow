// UI-layer constants. Kept separate from agent-layer constants
// (`services/agentApi/definitions.js`) because these are about display, not
// agent behavior — accent colors, chip variants, status-pill phrasing.

import {
  Activity,
  BarChart3,
  CheckCircle2,
  FileText,
  Newspaper,
  ShieldAlert
} from 'lucide-react';

export const DEFAULT_SYMBOL = 'TSLA';

export const AGENT_ICONS = {
  data: Activity,
  news: Newspaper,
  analysis: BarChart3,
  risk: ShieldAlert,
  report: FileText,
  verifier: CheckCircle2
};

export const VERIFIER_CHIP = {
  pass: 'chip-low',
  warn: 'chip-watch',
  fail: 'chip-avoid'
};

export const VERIFIER_LABEL = {
  pass: 'Verified',
  warn: 'Warnings',
  fail: 'Issues found'
};

export const PHASE_PILL_TEXT = {
  'verify-v1': 'Verifying report',
  revise: 'Revising report (1 of 1)',
  'verify-v2': 'Verifying revised report'
};

export const METRIC_ITEMS = [
  // Row 1 — quote
  ['price', 'Price'],
  ['change', 'Daily Change'],
  ['marketCap', 'Market Cap'],
  ['beta', 'Beta'],
  // Row 2 — valuation
  ['peRatio', 'P/E (TTM)'],
  ['forwardPE', 'Forward P/E'],
  ['revenueGrowth', 'Revenue Growth'],
  ['debtToEquity', 'Debt / Equity'],
  // Row 3 — profitability + cash
  ['profitMargin', 'Profit Margin'],
  ['operatingMargin', 'Op Margin'],
  ['freeCashFlow', 'Free Cash Flow'],
  ['epsSurpriseTrend', 'EPS Surprise'],
  // Row 4 — earnings cycle + analyst view
  ['nextEarningsDate', 'Next Earnings'],
  ['daysToEarnings', 'Days to Earnings'],
  ['analystTargetMean', 'Analyst Target'],
  ['analystConsensus', 'Consensus']
];

export const RECOMMENDATION_CHIP = {
  Buy: 'chip-buy',
  Hold: 'chip-hold',
  Watch: 'chip-watch',
  Avoid: 'chip-avoid'
};

export const RISK_CHIP = {
  Low: 'chip-low',
  Moderate: 'chip-moderate',
  Elevated: 'chip-elevated',
  High: 'chip-high'
};

// Workflow visualisation: phases, not agents. Phase 3 fans out into two
// parallel agents; Phase 5 wraps the verifier-loop sub-states (verify-v1
// / revise / verify-v2) so the track can show the full revision cycle.
export const WORKFLOW_PHASES = [
  { id: 'phase-data', label: 'Data', agents: ['data'] },
  { id: 'phase-news', label: 'News', agents: ['news'] },
  { id: 'phase-fanout', label: 'Analysis · Risk', agents: ['analysis', 'risk'], parallel: true },
  { id: 'phase-report', label: 'Report', agents: ['report'] },
  { id: 'phase-verify', label: 'Verify', agents: ['verifier'], usesVerifierLoop: true }
];

// Short labels for the verifier-loop sub-state badge over the Phase 5 cell.
export const PHASE_BADGE = {
  'verify-v1': 'v1',
  revise: 'revise',
  'verify-v2': 'v2'
};
