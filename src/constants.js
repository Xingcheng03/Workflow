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
  ['price', 'Price'],
  ['change', 'Daily Change'],
  ['marketCap', 'Market Cap'],
  ['peRatio', 'P/E Ratio'],
  ['revenueGrowth', 'Revenue Growth'],
  ['profitMargin', 'Profit Margin'],
  ['debtToEquity', 'Debt / Equity'],
  ['freeCashFlow', 'Free Cash Flow'],
  ['nextEarningsDate', 'Next Earnings'],
  ['analystTargetMean', 'Analyst Target']
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
