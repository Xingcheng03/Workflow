// Agent metadata (display labels, accent colors) and ticker validation.
// Pure constants + functions; no I/O or framework deps.

const TICKER_RE = /^[A-Z.-]{1,8}$/;

export const normalizeSymbol = (symbol) => String(symbol ?? '').trim().toUpperCase();

export const validateSymbol = (symbol) => {
  const cleaned = normalizeSymbol(symbol);
  if (!cleaned) {
    return { ok: false, error: 'Enter a ticker symbol before running an agent.' };
  }
  if (!TICKER_RE.test(cleaned)) {
    return {
      ok: false,
      error: `"${cleaned}" is not a valid ticker. Use 1-8 letters, dots, or dashes.`
    };
  }
  return { ok: true, symbol: cleaned };
};

export const agentDefinitions = [
  {
    id: 'data',
    label: 'Data Agent',
    shortLabel: 'Data',
    purpose: 'Market snapshot',
    accent: '#1d8f7a'
  },
  {
    id: 'news',
    label: 'News Agent',
    shortLabel: 'News',
    purpose: 'Recent headlines',
    accent: '#c8791a'
  },
  {
    id: 'analysis',
    label: 'Analysis Agent',
    shortLabel: 'Analysis',
    purpose: 'Ratios and trends',
    accent: '#5567d9'
  },
  {
    id: 'risk',
    label: 'Risk Agent',
    shortLabel: 'Risk',
    purpose: 'Scenario review',
    accent: '#c74751'
  },
  {
    id: 'report',
    label: 'Report Agent',
    shortLabel: 'Report',
    purpose: 'Final memo',
    accent: '#6e7f2d'
  },
  {
    id: 'verifier',
    label: 'Verifier Agent',
    shortLabel: 'Verify',
    purpose: 'Cross-check report',
    accent: '#7355d6'
  }
];

export const createCompanyShell = (symbol) => ({
  symbol: normalizeSymbol(symbol),
  name: 'Awaiting Gemini analysis',
  sector: 'Live Gemini workflow',
  recommendation: 'Not rated',
  thesis: 'Run an agent to generate live analysis from Gemini.'
});
