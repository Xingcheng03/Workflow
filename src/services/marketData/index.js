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

// Yahoo's chart endpoint returns parallel arrays for open/high/low/close.
// Zip them into an OHLC series; tolerate missing OHL by collapsing to the
// close (flat doji-style candle) so older tests/responses without full OHLC
// still render. Returns `{closes, ohlc}` so callers needing only closes
// (agent prompt context) don't pay for the richer shape.
const buildPriceSeries = (quote, timestamps) => {
  const opens = quote?.open || [];
  const highs = quote?.high || [];
  const lows = quote?.low || [];
  const closes = quote?.close || [];
  const volumes = quote?.volume || [];

  const ohlc = closes.map((close, i) => {
    if (!Number.isFinite(close)) return null;
    const open = Number.isFinite(opens[i]) ? opens[i] : close;
    const high = Number.isFinite(highs[i]) ? highs[i] : Math.max(open, close);
    const low = Number.isFinite(lows[i]) ? lows[i] : Math.min(open, close);
    // volume may legitimately be 0 (after-hours, halted) — keep finite zeros
    // and only fall back to null when Yahoo omits the field entirely.
    const volume = Number.isFinite(volumes[i]) ? volumes[i] : null;
    return { open, high, low, close, volume, timestamp: timestamps?.[i] ?? null };
  }).filter(Boolean);

  return {
    closes: ohlc.map((b) => b.close),
    ohlc
  };
};

// 6-month daily history. Best-effort like summary — null on failure.
// Returns `{ closes, ohlc }` so the agent prompt context can stay flat
// (closes only) while the UI gets full OHLC for proper candlesticks.
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
    const series = buildPriceSeries(result?.indicators?.quote?.[0], result?.timestamp);
    return series.closes.length >= 5 ? series : null;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return null;
  }
};

// Generic ordered-downsampler. Operates on any array — used for both number
// arrays (close-only series for prompt context) and object arrays (OHLC for
// candlestick rendering).
const compactSeries = (values, maxPoints) => {
  if (values.length <= maxPoints) return values;
  const step = (values.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => values[Math.round(i * step)]);
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

  const [chartResponse, summary, history] = await Promise.all([
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
  const intraday = buildPriceSeries(result?.indicators?.quote?.[0], result?.timestamp);
  const latestBar = intraday.ohlc.at(-1);
  const latestPrice = latestBar?.close ?? meta?.regularMarketPrice;
  const referencePrice = meta?.regularMarketPrice ?? meta?.previousClose ?? meta?.chartPreviousClose;
  const currency = meta?.currency || 'USD';

  // Pre-existing trend stats helper still wants a flat closes array.
  const historyCloses = history?.closes || null;
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
        latestBar?.timestamp ? new Date(latestBar.timestamp * 1000).toLocaleString() : 'not verified'
      }.`
    },
    metrics: { ...fundamentalsMetrics, ...trendMetrics, ...extendedMetrics },
    // Two flavours of each series:
    //   trend / history          — closes only (what summarizeContext sends
    //                              to the agents — keeps prompt size small)
    //   trendOhlc / historyOhlc  — OHLC bars for proper candlestick rendering
    trend: compactTrend(intraday.closes, 7),
    history: historyCloses ? compactTrend(historyCloses, 30) : [],
    trendOhlc: compactSeries(intraday.ohlc, 30),
    historyOhlc: history?.ohlc ? compactSeries(history.ohlc, 60) : [],
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
