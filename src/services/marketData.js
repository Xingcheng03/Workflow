import { TTL, cacheGet, cacheKey, cacheSet } from './cache';

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

const NOT_PROVIDED = 'not provided';

const rawNumber = (obj, key) => {
  const v = obj?.[key];
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && Number.isFinite(v.raw)) return v.raw;
  return NaN;
};

// Summary endpoint is best-effort. Failure → return null, callers fall back to placeholders.
const fetchMarketSummary = async (symbol, signal) => {
  try {
    const response = await fetch(`/api/market-summary/${encodeURIComponent(symbol)}`, { signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.quoteSummary?.error) return null;
    return data?.quoteSummary?.result?.[0] || null;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return null;
  }
};

// 6-month daily history. Best-effort like summary — null on failure.
const fetchMarketHistory = async (symbol, signal) => {
  try {
    const response = await fetch(
      `/api/market-chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`,
      { signal }
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.chart?.error) return null;
    const result = data?.chart?.result?.[0];
    const closes = result?.indicators?.quote?.[0]?.close || [];
    const valid = closes.filter((c) => Number.isFinite(c));
    return valid.length >= 5 ? valid : null;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return null;
  }
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

// ─── Quarterly statements parsing (best-effort, returns flat string fields) ───

export const parseCalendarEvents = (calendarEvents) => {
  const earningsArr = calendarEvents?.earnings?.earningsDate;
  const ts = Array.isArray(earningsArr) && earningsArr[0] ? rawNumber(earningsArr[0], 'raw') || (typeof earningsArr[0] === 'number' ? earningsArr[0] : NaN) : NaN;
  if (!Number.isFinite(ts)) {
    return { nextEarningsDate: NOT_PROVIDED, daysToEarnings: NOT_PROVIDED };
  }
  const ms = ts * 1000;
  const days = Math.round((ms - Date.now()) / (24 * 60 * 60 * 1000));
  return {
    nextEarningsDate: new Date(ms).toISOString().slice(0, 10),
    daysToEarnings: String(days)
  };
};

export const parseAnalystTargets = (financialData, currency = 'USD') => {
  if (!financialData) return null;
  const targetMean = rawNumber(financialData, 'targetMeanPrice');
  const targetMedian = rawNumber(financialData, 'targetMedianPrice');
  const high = rawNumber(financialData, 'targetHighPrice');
  const low = rawNumber(financialData, 'targetLowPrice');
  const consensus = financialData.recommendationKey;
  const consensusMean = rawNumber(financialData, 'recommendationMean');
  const numAnalysts = rawNumber(financialData, 'numberOfAnalystOpinions');

  const hasAnything =
    Number.isFinite(targetMean) ||
    Number.isFinite(targetMedian) ||
    (consensus && consensus !== 'none') ||
    Number.isFinite(numAnalysts);

  if (!hasAnything) return null;

  const fmtTarget = (v) => (Number.isFinite(v) ? `${v.toFixed(2)} ${currency}` : null);
  const nLabel = Number.isFinite(numAnalysts) ? ` (n=${numAnalysts})` : '';
  const titleCase = (s) =>
    s
      ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : null;

  return {
    analystTargetMean:
      fmtTarget(targetMean) ? `${fmtTarget(targetMean)}${nLabel}` : NOT_PROVIDED,
    analystTargetRange:
      fmtTarget(low) && fmtTarget(high) ? `${fmtTarget(low)} - ${fmtTarget(high)}` : NOT_PROVIDED,
    analystTargetMedian: fmtTarget(targetMedian) || NOT_PROVIDED,
    analystConsensus: titleCase(consensus) || NOT_PROVIDED,
    analystConsensusMean: Number.isFinite(consensusMean) ? consensusMean.toFixed(1) : NOT_PROVIDED
  };
};

export const parseRecommendationTrend = (recommendationTrend) => {
  const trend = recommendationTrend?.trend;
  if (!Array.isArray(trend) || trend.length < 2) return NOT_PROVIDED;
  const buyPct = (snap) => {
    const total =
      (snap.strongBuy || 0) + (snap.buy || 0) + (snap.hold || 0) + (snap.sell || 0) + (snap.strongSell || 0);
    if (total === 0) return null;
    return Math.round((((snap.strongBuy || 0) + (snap.buy || 0)) / total) * 100);
  };
  // trend[0] is most recent month, then earlier months. Take up to 4 months.
  const slice = trend.slice(0, 4);
  const latest = buyPct(slice[0]);
  const oldest = buyPct(slice[slice.length - 1]);
  if (latest == null || oldest == null) return NOT_PROVIDED;
  const monthsAgo = slice.length - 1;
  return `${monthsAgo}mo ago: ${oldest}% Buy → now: ${latest}% Buy`;
};

export const parseEpsRevisions = (earningsTrend) => {
  const trend = earningsTrend?.trend;
  if (!Array.isArray(trend) || trend.length === 0) return NOT_PROVIDED;
  // Prefer next quarter (+1q); fall back to the first entry.
  const target = trend.find((t) => t.period === '+1q') || trend[0];
  const up = rawNumber(target?.epsRevisions, 'upLast30days');
  // Yahoo's API has inconsistent casing for this field
  const down =
    rawNumber(target?.epsRevisions, 'downLast30Days') || rawNumber(target?.epsRevisions, 'downLast30days');
  if (!Number.isFinite(up) && !Number.isFinite(down)) return NOT_PROVIDED;
  const upN = Number.isFinite(up) ? up : 0;
  const downN = Number.isFinite(down) ? down : 0;
  return `30d: ${upN} up / ${downN} down`;
};

export const parseEarningsSurprise = (earningsHistory) => {
  const history = earningsHistory?.history;
  if (!Array.isArray(history) || history.length === 0) return NOT_PROVIDED;
  const recent = history.slice(-4); // chronological → 4 most recent
  const formatted = recent.map((q) => {
    const actual = rawNumber(q, 'epsActual');
    const estimate = rawNumber(q, 'epsEstimate');
    if (!Number.isFinite(actual) || !Number.isFinite(estimate) || estimate === 0) return '?';
    const surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
    const verb = surprise >= 0 ? 'beat' : 'miss';
    return `${verb} ${surprise >= 0 ? '+' : ''}${surprise.toFixed(0)}%`;
  });
  return formatted.join(', ');
};

export const parseCashFlowMetrics = (cashflowQuarterly, currency = 'USD') => {
  const stmts = cashflowQuarterly?.cashflowStatements;
  if (!Array.isArray(stmts) || stmts.length === 0) {
    return { operatingCashFlow: NOT_PROVIDED, freeCashFlow: NOT_PROVIDED };
  }
  const ttm = stmts.slice(0, 4); // up to 4 most recent quarters → TTM
  let sumOcf = 0;
  let sumCapex = 0;
  let countOcf = 0;
  let countCapex = 0;
  for (const s of ttm) {
    const ocf = rawNumber(s, 'totalCashFromOperatingActivities');
    const capex = rawNumber(s, 'capitalExpenditures'); // typically negative
    if (Number.isFinite(ocf)) {
      sumOcf += ocf;
      countOcf++;
    }
    if (Number.isFinite(capex)) {
      sumCapex += capex;
      countCapex++;
    }
  }
  const ocfLabel = countOcf > 0 ? `${formatLargeNumber(sumOcf, currency)} (TTM)` : NOT_PROVIDED;
  const fcfLabel =
    countOcf > 0 && countCapex > 0
      ? `${formatLargeNumber(sumOcf + sumCapex, currency)} (TTM)`
      : NOT_PROVIDED;
  return { operatingCashFlow: ocfLabel, freeCashFlow: fcfLabel };
};

export const parseNetDebt = (balanceSheetQuarterly, currency = 'USD') => {
  const stmts = balanceSheetQuarterly?.balanceSheetStatements;
  if (!Array.isArray(stmts) || stmts.length === 0) return NOT_PROVIDED;
  const latest = stmts[0];
  const cash = rawNumber(latest, 'cash');
  const totalDebt =
    rawNumber(latest, 'totalDebt') ||
    (rawNumber(latest, 'shortLongTermDebt') || 0) + (rawNumber(latest, 'longTermDebt') || 0);
  if (!Number.isFinite(cash) || !Number.isFinite(totalDebt) || totalDebt === 0) return NOT_PROVIDED;
  return formatLargeNumber(totalDebt - cash, currency);
};

export const parseRevenueGrowthRecent = (incomeStatementQuarterly) => {
  const stmts = incomeStatementQuarterly?.incomeStatementHistory;
  if (!Array.isArray(stmts) || stmts.length < 2) return NOT_PROVIDED;
  // Yahoo returns 4 quarters max in the quarterly endpoint, oldest last.
  // Compute QoQ for the 3 most recent quarters (need 4 quarters to get 3 QoQ deltas).
  const revenues = stmts.slice(0, 4).map((s) => rawNumber(s, 'totalRevenue'));
  const valid = revenues.filter(Number.isFinite);
  if (valid.length < 2) return NOT_PROVIDED;
  const deltas = [];
  for (let i = 0; i < valid.length - 1; i++) {
    const newer = valid[i];
    const older = valid[i + 1];
    if (older === 0) continue;
    deltas.push(((newer - older) / older) * 100);
  }
  if (deltas.length === 0) return NOT_PROVIDED;
  // Show oldest → newest direction so the trend reads naturally.
  return deltas
    .reverse()
    .map((d) => `${d >= 0 ? '+' : ''}${d.toFixed(0)}%`)
    .join(' / ') + ' (QoQ)';
};

const buildMetrics = (latestPrice, referencePrice, currency, summary) => {
  const sd = summary?.summaryDetail;
  const fd = summary?.financialData;
  const ks = summary?.defaultKeyStatistics;

  const fmtLarge = (obj, key) => (summary ? formatLargeNumber(rawNumber(obj, key), currency) : NOT_PROVIDED);
  const fmtRatio = (obj, key) => (summary ? formatRatio(rawNumber(obj, key)) : NOT_PROVIDED);
  const fmtPct = (obj, key) => (summary ? formatPercent(rawNumber(obj, key)) : NOT_PROVIDED);

  return {
    price: formatCurrency(latestPrice, currency),
    change: formatChange(latestPrice, referencePrice),
    marketCap: fmtLarge(sd, 'marketCap'),
    peRatio: fmtRatio(sd, 'trailingPE'),
    forwardPE: fmtRatio(sd, 'forwardPE'),
    revenueGrowth: fmtPct(fd, 'revenueGrowth'),
    profitMargin: fmtPct(fd, 'profitMargins'),
    operatingMargin: fmtPct(fd, 'operatingMargins'),
    debtToEquity: fmtRatio(fd, 'debtToEquity'),
    beta: fmtRatio(ks, 'beta')
  };
};

export const fetchMarketData = async (symbol, signal) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const key = cacheKey('market', normalizedSymbol);
  const cached = cacheGet(key, TTL.market);
  if (cached) return { ...cached, __cached: true };

  const [chartResponse, summary, historyCloses] = await Promise.all([
    fetch(`/api/market-chart/${encodeURIComponent(normalizedSymbol)}`, { signal }),
    fetchMarketSummary(normalizedSymbol, signal),
    fetchMarketHistory(normalizedSymbol, signal)
  ]);

  const chartData = await chartResponse.json();

  if (!chartResponse.ok || chartData?.chart?.error) {
    throw new Error(chartData?.chart?.error?.description || 'Market data request failed.');
  }

  const result = chartData?.chart?.result?.[0];
  const meta = result?.meta;
  const quote = result?.indicators?.quote?.[0];
  const closes = quote?.close || [];
  const timestamps = result?.timestamp || [];
  const validPairs = closes
    .map((close, index) => ({ close, timestamp: timestamps[index] }))
    .filter((point) => Number.isFinite(point.close));
  const latestPoint = validPairs.at(-1);
  const latestPrice = latestPoint?.close ?? meta?.regularMarketPrice;
  const referencePrice = meta?.regularMarketPrice ?? meta?.previousClose ?? meta?.chartPreviousClose;
  const currency = meta?.currency || 'USD';

  const trendStats = computeTrendStats(historyCloses, currency);
  const fundamentalsMetrics = buildMetrics(latestPrice, referencePrice, currency, summary);
  const trendMetricKeys = ['returnSixMonth', 'returnOneMonth', 'drawdownFromHigh', 'periodHigh', 'periodLow'];
  const trendMetrics = trendStats
    ? trendStats
    : Object.fromEntries(trendMetricKeys.map((k) => [k, NOT_PROVIDED]));

  // ── New: extended quarterly + analyst data, all best-effort.
  const calendarMetrics = parseCalendarEvents(summary?.calendarEvents);
  const analystTargets = parseAnalystTargets(summary?.financialData, currency);
  const analystMetrics = analystTargets || {
    analystTargetMean: NOT_PROVIDED,
    analystTargetRange: NOT_PROVIDED,
    analystTargetMedian: NOT_PROVIDED,
    analystConsensus: NOT_PROVIDED,
    analystConsensusMean: NOT_PROVIDED
  };
  const consensusEvolution = parseRecommendationTrend(summary?.recommendationTrend);
  const epsRevisionsRecent = parseEpsRevisions(summary?.earningsTrend);
  const epsSurpriseTrend = parseEarningsSurprise(summary?.earningsHistory);
  const cashFlowMetrics = parseCashFlowMetrics(summary?.cashflowStatementHistoryQuarterly, currency);
  const netDebt = parseNetDebt(summary?.balanceSheetHistoryQuarterly, currency);
  const revenueQoQRecent = parseRevenueGrowthRecent(summary?.incomeStatementHistoryQuarterly);

  const extendedMetrics = {
    ...calendarMetrics,
    ...analystMetrics,
    consensusEvolution,
    epsRevisionsRecent,
    epsSurpriseTrend,
    ...cashFlowMetrics,
    netDebt,
    revenueQoQRecent
  };

  const payload = {
    company: {
      symbol: meta?.symbol || normalizedSymbol,
      name: meta?.longName || meta?.shortName || normalizedSymbol,
      sector: meta?.fullExchangeName || meta?.exchangeName || 'Public equity',
      recommendation: 'Not rated',
      thesis: `Live quote loaded from Yahoo Finance chart data. Last quote timestamp: ${
        latestPoint?.timestamp ? new Date(latestPoint.timestamp * 1000).toLocaleString() : 'not verified'
      }.`
    },
    metrics: { ...fundamentalsMetrics, ...trendMetrics, ...extendedMetrics },
    trend: compactTrend(validPairs.map((point) => point.close), 7),
    history: historyCloses ? compactTrend(historyCloses, 30) : [],
    marketMeta: {
      source: summary
        ? 'Yahoo Finance chart + quoteSummary'
        : 'Yahoo Finance chart API (fundamentals unavailable)',
      regularMarketPrice: formatCurrency(meta?.regularMarketPrice, currency),
      regularMarketDayLow: formatCurrency(meta?.regularMarketDayLow, currency),
      regularMarketDayHigh: formatCurrency(meta?.regularMarketDayHigh, currency),
      fiftyTwoWeekLow: formatCurrency(meta?.fiftyTwoWeekLow, currency),
      fiftyTwoWeekHigh: formatCurrency(meta?.fiftyTwoWeekHigh, currency),
      volume: meta?.regularMarketVolume?.toLocaleString?.() || 'not verified'
    }
  };

  cacheSet(key, payload);
  return { ...payload, __cached: false };
};
