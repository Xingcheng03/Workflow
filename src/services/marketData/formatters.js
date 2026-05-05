// Display formatters and trend-stat helpers used across marketData.
// Pure functions — no I/O.

export const formatCurrency = (value, currency = 'USD') => {
  if (!Number.isFinite(value)) {
    return 'not verified';
  }

  return `${value.toFixed(2)} ${currency}`;
};

export const formatChange = (latest, reference) => {
  if (!Number.isFinite(latest) || !Number.isFinite(reference)) {
    return 'not verified';
  }

  const diff = latest - reference;
  const percent = reference === 0 ? 0 : (diff / reference) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
};

export const formatLargeNumber = (value, currency = 'USD') => {
  if (!Number.isFinite(value)) return 'not verified';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T ${currency}`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B ${currency}`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M ${currency}`;
  return `${value.toFixed(0)} ${currency}`;
};

export const formatRatio = (value) => {
  if (!Number.isFinite(value)) return 'not verified';
  return value.toFixed(2);
};

export const formatPercent = (value) => {
  if (!Number.isFinite(value)) return 'not verified';
  return `${(value * 100).toFixed(2)}%`;
};

export const compactTrend = (values, maxPoints = 28) => {
  const cleanValues = values.filter((value) => Number.isFinite(value));

  if (cleanValues.length <= maxPoints) {
    return cleanValues;
  }

  const step = (cleanValues.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => cleanValues[Math.round(index * step)]);
};

// Descriptive (backward-looking only) trend stats. Returns null if history too short.
export const computeTrendStats = (history, currency = 'USD') => {
  if (!Array.isArray(history) || history.length < 5) return null;
  const first = history[0];
  const last = history[history.length - 1];
  const max = Math.max(...history);
  const min = Math.min(...history);
  // ~21 trading days = 1 month. Clamp to start of series for short history.
  const oneMonthBack = history[Math.max(0, history.length - 22)];
  return {
    returnSixMonth: formatPercent((last - first) / first),
    returnOneMonth: formatPercent((last - oneMonthBack) / oneMonthBack),
    drawdownFromHigh: formatPercent((last - max) / max),
    periodHigh: formatCurrency(max, currency),
    periodLow: formatCurrency(min, currency)
  };
};
