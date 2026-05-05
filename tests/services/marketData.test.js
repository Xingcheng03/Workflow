import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compactTrend,
  computeTrendStats,
  fetchMarketData,
  formatChange,
  formatCurrency,
  formatLargeNumber,
  formatPercent,
  formatRatio,
  parseAnalystTargets,
  parseCalendarEvents,
  parseCashFlowMetrics,
  parseEarningsSurprise,
  parseEpsRevisions,
  parseNetDebt,
  parseRecommendationTrend,
  parseRevenueGrowthRecent
} from '../../src/services/marketData';

describe('formatCurrency', () => {
  it('formats finite numbers with two decimals', () => {
    expect(formatCurrency(123.456, 'USD')).toBe('123.46 USD');
  });

  it('defaults to USD when currency missing', () => {
    expect(formatCurrency(10)).toBe('10.00 USD');
  });

  it('returns "not verified" for non-finite values', () => {
    expect(formatCurrency(NaN)).toBe('not verified');
    expect(formatCurrency(Infinity)).toBe('not verified');
    expect(formatCurrency(undefined)).toBe('not verified');
    expect(formatCurrency(null)).toBe('not verified');
  });
});

describe('formatChange', () => {
  it('formats a positive change with + sign', () => {
    expect(formatChange(110, 100)).toBe('+10.00 (+10.00%)');
  });

  it('formats a negative change without extra sign', () => {
    expect(formatChange(90, 100)).toBe('-10.00 (-10.00%)');
  });

  it('handles a zero reference price without dividing by zero', () => {
    expect(formatChange(50, 0)).toBe('+50.00 (+0.00%)');
  });

  it('returns "not verified" when either input is non-finite', () => {
    expect(formatChange(NaN, 100)).toBe('not verified');
    expect(formatChange(100, undefined)).toBe('not verified');
  });
});

describe('formatLargeNumber', () => {
  it('formats trillions with T suffix', () => {
    expect(formatLargeNumber(4.82e12, 'USD')).toBe('4.82T USD');
  });

  it('formats billions with B suffix', () => {
    expect(formatLargeNumber(1.5e9)).toBe('1.50B USD');
  });

  it('formats millions with M suffix', () => {
    expect(formatLargeNumber(2.5e6)).toBe('2.50M USD');
  });

  it('formats small numbers with no suffix and no decimals', () => {
    expect(formatLargeNumber(500)).toBe('500 USD');
  });

  it('handles negatives', () => {
    expect(formatLargeNumber(-2.5e9)).toBe('-2.50B USD');
  });

  it('returns "not verified" for non-finite', () => {
    expect(formatLargeNumber(NaN)).toBe('not verified');
    expect(formatLargeNumber(undefined)).toBe('not verified');
  });
});

describe('formatRatio', () => {
  it('formats with two decimals', () => {
    expect(formatRatio(40.506)).toBe('40.51');
  });

  it('returns "not verified" for non-finite', () => {
    expect(formatRatio(NaN)).toBe('not verified');
    expect(formatRatio(null)).toBe('not verified');
  });
});

describe('formatPercent', () => {
  it('multiplies by 100 and adds % sign', () => {
    expect(formatPercent(0.556)).toBe('55.60%');
  });

  it('handles negative growth', () => {
    expect(formatPercent(-0.123)).toBe('-12.30%');
  });

  it('returns "not verified" for non-finite', () => {
    expect(formatPercent(NaN)).toBe('not verified');
  });
});

describe('computeTrendStats', () => {
  it('returns null for too-short history', () => {
    expect(computeTrendStats([1, 2, 3])).toBeNull();
    expect(computeTrendStats(null)).toBeNull();
    expect(computeTrendStats(undefined)).toBeNull();
    expect(computeTrendStats([])).toBeNull();
  });

  it('computes return + range for an ascending series', () => {
    const series = Array.from({ length: 25 }, (_, i) => 100 + i); // 100 → 124
    const out = computeTrendStats(series);
    expect(out.returnSixMonth).toBe('24.00%');
    expect(out.drawdownFromHigh).toBe('0.00%');
    expect(out.periodHigh).toBe('124.00 USD');
    expect(out.periodLow).toBe('100.00 USD');
  });

  it('reports a negative drawdown when current is below period high', () => {
    const series = [100, 110, 120, 130, 125, 120, 115, 110];
    const out = computeTrendStats(series);
    expect(out.drawdownFromHigh).toBe('-15.38%');
    expect(out.periodHigh).toBe('130.00 USD');
  });

  it('respects the currency argument', () => {
    const series = Array.from({ length: 10 }, (_, i) => 50 + i);
    const out = computeTrendStats(series, 'EUR');
    expect(out.periodHigh).toBe('59.00 EUR');
  });
});

describe('compactTrend', () => {
  it('returns the input untouched when below max points', () => {
    expect(compactTrend([1, 2, 3], 7)).toEqual([1, 2, 3]);
  });

  it('downsamples to exactly maxPoints when input is larger', () => {
    const input = Array.from({ length: 28 }, (_, i) => i);
    const result = compactTrend(input, 7);
    expect(result).toHaveLength(7);
    expect(result[0]).toBe(0);
    expect(result[6]).toBe(27);
  });

  it('drops non-finite values before downsampling', () => {
    const input = [1, NaN, 2, Infinity, 3, undefined, 4];
    expect(compactTrend(input, 7)).toEqual([1, 2, 3, 4]);
  });
});

describe('parseCalendarEvents', () => {
  it('returns "not provided" when calendar missing', () => {
    expect(parseCalendarEvents(null)).toEqual({ nextEarningsDate: 'not provided', daysToEarnings: 'not provided' });
    expect(parseCalendarEvents({})).toEqual({ nextEarningsDate: 'not provided', daysToEarnings: 'not provided' });
  });

  it('parses an upcoming earnings date', () => {
    const futureTs = Math.floor(Date.now() / 1000) + 10 * 86400;
    const out = parseCalendarEvents({ earnings: { earningsDate: [{ raw: futureTs }] } });
    expect(out.nextEarningsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(out.daysToEarnings)).toBeGreaterThan(8);
    expect(Number(out.daysToEarnings)).toBeLessThanOrEqual(10);
  });
});

describe('parseAnalystTargets', () => {
  it('returns null when no analyst coverage', () => {
    expect(parseAnalystTargets(null)).toBeNull();
    expect(parseAnalystTargets({})).toBeNull();
    expect(parseAnalystTargets({ recommendationKey: 'none' })).toBeNull();
  });

  it('extracts targets with sample size and consensus', () => {
    const out = parseAnalystTargets({
      targetMeanPrice: { raw: 215.4 },
      targetMedianPrice: { raw: 210.0 },
      targetHighPrice: { raw: 260.0 },
      targetLowPrice: { raw: 180.0 },
      recommendationKey: 'strong_buy',
      recommendationMean: { raw: 1.8 },
      numberOfAnalystOpinions: { raw: 42 }
    }, 'USD');
    expect(out.analystTargetMean).toBe('215.40 USD (n=42)');
    expect(out.analystTargetRange).toBe('180.00 USD - 260.00 USD');
    expect(out.analystConsensus).toBe('Strong Buy');
    expect(out.analystConsensusMean).toBe('1.8');
  });

  it('survives missing range while still surfacing mean', () => {
    const out = parseAnalystTargets({
      targetMeanPrice: { raw: 100 },
      numberOfAnalystOpinions: { raw: 5 }
    });
    expect(out.analystTargetMean).toBe('100.00 USD (n=5)');
    expect(out.analystTargetRange).toBe('not provided');
  });
});

describe('parseRecommendationTrend', () => {
  it('returns "not provided" without trend', () => {
    expect(parseRecommendationTrend(null)).toBe('not provided');
    expect(parseRecommendationTrend({ trend: [] })).toBe('not provided');
  });

  it('compares Buy ratio between latest and oldest snapshots', () => {
    const trend = {
      trend: [
        { period: '0m', strongBuy: 5, buy: 5, hold: 10, sell: 5, strongSell: 0 },     // 40% Buy now
        { period: '-1m', strongBuy: 5, buy: 5, hold: 10, sell: 5, strongSell: 0 },
        { period: '-2m', strongBuy: 5, buy: 5, hold: 10, sell: 5, strongSell: 0 },
        { period: '-3m', strongBuy: 10, buy: 4, hold: 4, sell: 2, strongSell: 0 }     // 70% Buy 3mo ago
      ]
    };
    expect(parseRecommendationTrend(trend)).toBe('3mo ago: 70% Buy → now: 40% Buy');
  });
});

describe('parseEpsRevisions', () => {
  it('returns "not provided" without trend', () => {
    expect(parseEpsRevisions(null)).toBe('not provided');
  });

  it('prefers next-quarter revisions and tolerates Yahoo casing', () => {
    const earningsTrend = {
      trend: [
        { period: '0q', epsRevisions: { upLast30days: { raw: 0 }, downLast30Days: { raw: 0 } } },
        { period: '+1q', epsRevisions: { upLast30days: { raw: 1 }, downLast30Days: { raw: 12 } } }
      ]
    };
    expect(parseEpsRevisions(earningsTrend)).toBe('30d: 1 up / 12 down');
  });

  it('preserves a legit 0 in the canonical casing instead of falling through to fallback', () => {
    // Both casings present; canonical "downLast30Days" is 0 — a legit zero,
    // not "missing". It must NOT fall through to the lowercase fallback (5).
    const earningsTrend = {
      trend: [
        {
          period: '+1q',
          epsRevisions: {
            upLast30days: { raw: 3 },
            downLast30Days: { raw: 0 },
            downLast30days: { raw: 5 }
          }
        }
      ]
    };
    expect(parseEpsRevisions(earningsTrend)).toBe('30d: 3 up / 0 down');
  });
});

describe('parseEarningsSurprise', () => {
  it('returns "not provided" when history missing', () => {
    expect(parseEarningsSurprise(null)).toBe('not provided');
    expect(parseEarningsSurprise({ history: [] })).toBe('not provided');
  });

  it('formats beat/miss for last 4 quarters', () => {
    const earningsHistory = {
      history: [
        { epsActual: { raw: 1.0 }, epsEstimate: { raw: 1.0 } },   // beat 0%
        { epsActual: { raw: 1.05 }, epsEstimate: { raw: 1.0 } },  // beat 5%
        { epsActual: { raw: 0.98 }, epsEstimate: { raw: 1.0 } },  // miss -2%
        { epsActual: { raw: 0.92 }, epsEstimate: { raw: 1.0 } }   // miss -8%
      ]
    };
    const out = parseEarningsSurprise(earningsHistory);
    expect(out).toContain('miss');
    expect(out).toContain('beat');
  });
});

describe('parseCashFlowMetrics', () => {
  it('returns "not provided" pair when statements missing', () => {
    expect(parseCashFlowMetrics(null)).toEqual({
      operatingCashFlow: 'not provided',
      freeCashFlow: 'not provided'
    });
  });

  it('sums TTM OCF and FCF (capex is negative)', () => {
    const cashflowQuarterly = {
      cashflowStatements: [
        { totalCashFromOperatingActivities: { raw: 3e9 }, capitalExpenditures: { raw: -5e8 } },
        { totalCashFromOperatingActivities: { raw: 3e9 }, capitalExpenditures: { raw: -5e8 } },
        { totalCashFromOperatingActivities: { raw: 3e9 }, capitalExpenditures: { raw: -5e8 } },
        { totalCashFromOperatingActivities: { raw: 3e9 }, capitalExpenditures: { raw: -5e8 } }
      ]
    };
    const out = parseCashFlowMetrics(cashflowQuarterly, 'USD');
    expect(out.operatingCashFlow).toBe('12.00B USD (TTM)');
    expect(out.freeCashFlow).toBe('10.00B USD (TTM)');
  });
});

describe('parseNetDebt', () => {
  it('returns "not provided" when statements missing', () => {
    expect(parseNetDebt(null)).toBe('not provided');
  });

  it('computes total debt minus cash from latest quarter', () => {
    const balanceSheet = {
      balanceSheetStatements: [
        { cash: { raw: 2e9 }, totalDebt: { raw: 7.6e9 } }
      ]
    };
    expect(parseNetDebt(balanceSheet, 'USD')).toBe('5.60B USD');
  });
});

describe('parseRevenueGrowthRecent', () => {
  it('returns "not provided" when too few quarters', () => {
    expect(parseRevenueGrowthRecent(null)).toBe('not provided');
    expect(parseRevenueGrowthRecent({ incomeStatementHistory: [{ totalRevenue: { raw: 100 } }] })).toBe('not provided');
  });

  it('formats QoQ deltas oldest → newest', () => {
    const stmt = {
      incomeStatementHistory: [
        { totalRevenue: { raw: 110 } }, // most recent
        { totalRevenue: { raw: 100 } },
        { totalRevenue: { raw: 105 } },
        { totalRevenue: { raw: 100 } }  // oldest
      ]
    };
    const out = parseRevenueGrowthRecent(stmt);
    // oldest→newest: 100→105 = +5%, 105→100 = -5%, 100→110 = +10%
    expect(out).toBe('+5% / -5% / +10% (QoQ)');
  });
});

describe('fetchMarketData', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const chartOk = (price = 100) => ({
    ok: true,
    status: 200,
    json: async () => ({
      chart: {
        result: [
          {
            meta: {
              symbol: 'NVDA',
              longName: 'NVIDIA Corp',
              currency: 'USD',
              regularMarketPrice: price,
              previousClose: 95,
              regularMarketDayLow: 99,
              regularMarketDayHigh: 101,
              fiftyTwoWeekLow: 80,
              fiftyTwoWeekHigh: 120,
              regularMarketVolume: 10_000_000
            },
            timestamp: [1, 2, 3],
            indicators: { quote: [{ close: [98, 99, price] }] }
          }
        ]
      }
    })
  });

  const summaryOk = () => ({
    ok: true,
    status: 200,
    json: async () => ({
      quoteSummary: {
        result: [
          {
            summaryDetail: {
              marketCap: { raw: 4.82e12 },
              trailingPE: { raw: 40.5 },
              forwardPE: { raw: 17.6 }
            },
            financialData: {
              revenueGrowth: { raw: 0.732 },
              profitMargins: { raw: 0.556 },
              operatingMargins: { raw: 0.65 },
              debtToEquity: { raw: 7.25 }
            },
            defaultKeyStatistics: { beta: { raw: 2.24 } }
          }
        ]
      }
    })
  });

  const summaryFail = () => ({ ok: false, status: 502, json: async () => ({}) });

  const chartFail = () => ({
    ok: false,
    status: 500,
    json: async () => ({ chart: { error: { description: 'upstream blew up' } } })
  });

  const historyOk = (closes = Array.from({ length: 30 }, (_, i) => 80 + i)) => ({
    ok: true,
    status: 200,
    json: async () => ({
      chart: {
        result: [{ indicators: { quote: [{ close: closes }] } }]
      }
    })
  });

  const dispatch = (chartResp, summaryResp, historyResp = null) =>
    vi.fn((url) => {
      if (url.startsWith('/api/market-summary')) return Promise.resolve(summaryResp);
      if (url.includes('range=6mo')) return Promise.resolve(historyResp || chartResp);
      return Promise.resolve(chartResp);
    });

  it('populates fundamentals when summary endpoint returns data', async () => {
    global.fetch = dispatch(chartOk(100), summaryOk());
    const data = await fetchMarketData('NVDA');
    expect(data.metrics.marketCap).toBe('4.82T USD');
    expect(data.metrics.peRatio).toBe('40.50');
    expect(data.metrics.forwardPE).toBe('17.60');
    expect(data.metrics.profitMargin).toBe('55.60%');
    expect(data.metrics.operatingMargin).toBe('65.00%');
    expect(data.metrics.beta).toBe('2.24');
    expect(data.marketMeta.source).toBe('Yahoo Finance chart + quoteSummary');
  });

  it('falls back to "not provided" when summary endpoint fails (chart still succeeds)', async () => {
    global.fetch = dispatch(chartOk(100), summaryFail());
    const data = await fetchMarketData('NVDA');
    expect(data.metrics.price).toBe('100.00 USD');
    expect(data.metrics.marketCap).toBe('not provided');
    expect(data.metrics.peRatio).toBe('not provided');
    expect(data.metrics.beta).toBe('not provided');
    expect(data.marketMeta.source).toBe('Yahoo Finance chart API (fundamentals unavailable)');
  });

  it('throws when chart endpoint fails (chart is required)', async () => {
    global.fetch = dispatch(chartFail(), summaryOk());
    await expect(fetchMarketData('NVDA')).rejects.toThrow(/upstream blew up/);
  });

  it('populates descriptive trend metrics when history is available', async () => {
    const ascending = Array.from({ length: 30 }, (_, i) => 80 + i); // 80 → 109
    global.fetch = dispatch(chartOk(109), summaryOk(), historyOk(ascending));
    const data = await fetchMarketData('NVDA');
    expect(data.history.length).toBeGreaterThan(0);
    // (109 - 80) / 80 = 36.25%
    expect(data.metrics.returnSixMonth).toBe('36.25%');
    expect(data.metrics.drawdownFromHigh).toBe('0.00%');
    expect(data.metrics.periodHigh).toBe('109.00 USD');
  });

  it('falls back to "not provided" trend metrics when history is too short', async () => {
    global.fetch = dispatch(chartOk(100), summaryOk(), historyOk([100, 101]));
    const data = await fetchMarketData('NVDA');
    expect(data.metrics.returnSixMonth).toBe('not provided');
    expect(data.metrics.drawdownFromHigh).toBe('not provided');
    expect(data.history).toEqual([]);
  });

  it('populates extended fundamentals when all quoteSummary modules present', async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 5 * 86400;
    const richSummary = {
      ok: true,
      status: 200,
      json: async () => ({
        quoteSummary: {
          result: [
            {
              summaryDetail: { marketCap: { raw: 1e12 }, trailingPE: { raw: 20 }, forwardPE: { raw: 18 } },
              financialData: {
                profitMargins: { raw: 0.2 },
                operatingMargins: { raw: 0.25 },
                revenueGrowth: { raw: 0.15 },
                debtToEquity: { raw: 1.2 },
                targetMeanPrice: { raw: 250 },
                targetHighPrice: { raw: 300 },
                targetLowPrice: { raw: 200 },
                numberOfAnalystOpinions: { raw: 30 },
                recommendationKey: 'buy',
                recommendationMean: { raw: 1.9 }
              },
              defaultKeyStatistics: { beta: { raw: 1.5 } },
              calendarEvents: { earnings: { earningsDate: [{ raw: futureTs }] } },
              earningsHistory: {
                history: [
                  { epsActual: { raw: 1 }, epsEstimate: { raw: 1 } },
                  { epsActual: { raw: 1.05 }, epsEstimate: { raw: 1 } }
                ]
              },
              earningsTrend: {
                trend: [
                  { period: '+1q', epsRevisions: { upLast30days: { raw: 2 }, downLast30Days: { raw: 8 } } }
                ]
              },
              recommendationTrend: {
                trend: [
                  { period: '0m', strongBuy: 5, buy: 5, hold: 10, sell: 0, strongSell: 0 },
                  { period: '-1m', strongBuy: 5, buy: 5, hold: 10, sell: 0, strongSell: 0 },
                  { period: '-2m', strongBuy: 8, buy: 6, hold: 6, sell: 0, strongSell: 0 }
                ]
              },
              incomeStatementHistoryQuarterly: {
                incomeStatementHistory: [
                  { totalRevenue: { raw: 110 } },
                  { totalRevenue: { raw: 100 } }
                ]
              },
              cashflowStatementHistoryQuarterly: {
                cashflowStatements: [
                  { totalCashFromOperatingActivities: { raw: 1e9 }, capitalExpenditures: { raw: -1e8 } }
                ]
              },
              balanceSheetHistoryQuarterly: {
                balanceSheetStatements: [{ cash: { raw: 5e9 }, totalDebt: { raw: 8e9 } }]
              }
            }
          ]
        }
      })
    };
    global.fetch = dispatch(chartOk(100), richSummary);
    const data = await fetchMarketData('NVDA');

    expect(data.metrics.nextEarningsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(data.metrics.daysToEarnings)).toBeGreaterThan(3);
    expect(data.metrics.analystTargetMean).toBe('250.00 USD (n=30)');
    expect(data.metrics.analystTargetRange).toBe('200.00 USD - 300.00 USD');
    expect(data.metrics.analystConsensus).toBe('Buy');
    expect(data.metrics.analystConsensusMean).toBe('1.9');
    expect(data.metrics.epsRevisionsRecent).toBe('30d: 2 up / 8 down');
    expect(data.metrics.netDebt).toBe('3.00B USD');
    expect(data.metrics.epsSurpriseTrend).toContain('beat');
    expect(data.metrics.consensusEvolution).toContain('% Buy');
    expect(data.metrics.revenueQoQRecent).toContain('QoQ');
    expect(data.metrics.operatingCashFlow).toContain('TTM');
  });

  it('falls back to "not provided" for new metrics when only base modules present', async () => {
    global.fetch = dispatch(chartOk(100), summaryOk());
    const data = await fetchMarketData('NVDA');
    // Existing fundamentals still populate
    expect(data.metrics.marketCap).toBe('4.82T USD');
    // New metrics gracefully degrade
    expect(data.metrics.nextEarningsDate).toBe('not provided');
    expect(data.metrics.analystTargetMean).toBe('not provided');
    expect(data.metrics.netDebt).toBe('not provided');
  });

  it('propagates AbortError from summary fetch', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = vi.fn((url) =>
      url.startsWith('/api/market-summary') ? Promise.reject(abortError) : Promise.resolve(chartOk(100))
    );
    await expect(fetchMarketData('NVDA')).rejects.toThrow(/aborted/);
  });
});
