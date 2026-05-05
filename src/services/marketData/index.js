// Market data orchestrator. Combines Yahoo's chart + quoteSummary endpoints
// into the flat-string `metrics` shape the agents consume.
//
// Re-exports formatters and parsers so existing callers (and tests) can keep
// importing from `services/marketData`.

import { TTL, cacheGet, cacheKey, cacheSet } from '../cache.js';
import {
  compactTrend,
  computeTrendStats,
  formatChange,
  formatCurrency,
  formatLargeNumber,
  formatPercent,
  formatRatio
} from './formatters.js';
import {
  parseAnalystTargets,
  parseCalendarEvents,
  parseCashFlowMetrics,
  parseEarningsSurprise,
  parseEpsRevisions,
  parseNetDebt,
  parseRecommendationTrend,
  parseRevenueGrowthRecent
} from './yahooParsers.js';

export * from './formatters.js';
export * from './yahooParsers.js';

const NOT_PROVIDED = 'not provided';

// rawNumber duplicated here to avoid coupling index → yahooParsers internals.
// Kept private; if a third caller appears, promote to a shared util.
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

  // Extended quarterly + analyst data, all best-effort.
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
