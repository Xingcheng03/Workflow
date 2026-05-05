// Yahoo quoteSummary response parsers.
//
// Each parser is best-effort and either returns a flat string field or
// `'not provided'` so the dashboard can degrade gracefully when Yahoo omits
// a module or rotates field shapes.

import { formatLargeNumber } from './formatters.js';

const NOT_PROVIDED = 'not provided';

// Yahoo wraps numeric fields in either { raw: <number>, fmt: ... } or
// (occasionally) the bare number. Anything else is treated as missing.
const rawNumber = (obj, key) => {
  const v = obj?.[key];
  if (v == null) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && Number.isFinite(v.raw)) return v.raw;
  return NaN;
};

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
  // Yahoo's API has inconsistent casing for this field. Use the first
  // FINITE value (a legit zero must not fall through the casing fallback).
  const downA = rawNumber(target?.epsRevisions, 'downLast30Days');
  const downB = rawNumber(target?.epsRevisions, 'downLast30days');
  const down = Number.isFinite(downA) ? downA : downB;
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
