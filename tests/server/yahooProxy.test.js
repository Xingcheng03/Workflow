import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  marketChartHandler,
  marketSummaryHandler,
  __resetForTests
} from '../../server/yahooProxy.js';

// Minimal stand-in for Node's res object. Captures everything the handler
// writes so assertions can inspect status / body without spinning up a real
// HTTP server.
const makeRes = () => {
  const res = {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    end(body) { this.body = body; }
  };
  return res;
};

const ok = (status, body = '{}') => ({ status, text: async () => body });

beforeEach(() => {
  __resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('marketChartHandler', () => {
  it('rejects an empty symbol with 400', async () => {
    global.fetch = vi.fn();
    const res = makeRes();
    const next = vi.fn();
    await marketChartHandler(
      { url: '/api/market-chart/' },
      res,
      next
    );
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through to next() when path does not match', async () => {
    global.fetch = vi.fn();
    const res = makeRes();
    const next = vi.fn();
    await marketChartHandler({ url: '/something/else' }, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('dedupes concurrent identical chart requests into a single Yahoo call', async () => {
    let resolveYahoo;
    const yahooPromise = new Promise((resolve) => { resolveYahoo = resolve; });
    global.fetch = vi.fn(() => yahooPromise);

    const r1 = makeRes();
    const r2 = makeRes();

    // Fire two requests for the same (symbol, range, interval) in parallel.
    const p1 = marketChartHandler({ url: '/api/market-chart/AAPL' }, r1, () => {});
    const p2 = marketChartHandler({ url: '/api/market-chart/AAPL' }, r2, () => {});

    // Only one upstream Yahoo call should have started.
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveYahoo(ok(200, '{"chart":{}}'));
    await Promise.all([p1, p2]);

    // Both responses received the same body.
    expect(r1.body).toBe('{"chart":{}}');
    expect(r2.body).toBe('{"chart":{}}');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT dedupe when range/interval differ', async () => {
    global.fetch = vi.fn(() => Promise.resolve(ok(200, '{}')));
    const r1 = makeRes();
    const r2 = makeRes();
    await Promise.all([
      marketChartHandler({ url: '/api/market-chart/AAPL?range=1d&interval=5m' }, r1, () => {}),
      marketChartHandler({ url: '/api/market-chart/AAPL?range=6mo&interval=1d' }, r2, () => {})
    ]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight slot after settling so a follow-up request can fire fresh', async () => {
    global.fetch = vi.fn(() => Promise.resolve(ok(200, '{}')));
    await marketChartHandler({ url: '/api/market-chart/AAPL' }, makeRes(), () => {});
    await marketChartHandler({ url: '/api/market-chart/AAPL' }, makeRes(), () => {});
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns 502 on upstream failure with the error message', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('boom')));
    const res = makeRes();
    await marketChartHandler({ url: '/api/market-chart/AAPL' }, res, () => {});
    expect(res.statusCode).toBe(502);
    expect(res.body).toContain('boom');
  });
});

describe('marketSummaryHandler', () => {
  // Wires fetch to respond differently per URL: cookie probe → Set-Cookie,
  // crumb endpoint → text, quoteSummary → quoteSummary JSON.
  const wireFetch = ({ summaryStatus = 200 } = {}) =>
    vi.fn((url) => {
      if (url.startsWith('https://fc.yahoo.com')) {
        return Promise.resolve({
          status: 404,
          headers: {
            get: (k) => (k.toLowerCase() === 'set-cookie' ? 'A1=cookieval; Path=/' : null)
          }
        });
      }
      if (url.includes('getcrumb')) {
        return Promise.resolve({ ok: true, status: 200, text: async () => 'crumbval' });
      }
      if (url.includes('quoteSummary')) {
        return Promise.resolve({ status: summaryStatus, text: async () => '{"quoteSummary":{}}' });
      }
      throw new Error(`unexpected url ${url}`);
    });

  it('refreshes crumb once across concurrent summary requests (mutex)', async () => {
    global.fetch = wireFetch();
    const r1 = makeRes();
    const r2 = makeRes();

    await Promise.all([
      marketSummaryHandler({ url: '/api/market-summary/AAPL' }, r1, () => {}),
      marketSummaryHandler({ url: '/api/market-summary/MSFT' }, r2, () => {})
    ]);

    // fc.yahoo.com (cookie) and getcrumb should each have been hit exactly once,
    // not twice — concurrent first-time requests share the in-flight refresh.
    const cookieCalls = global.fetch.mock.calls.filter((c) => c[0].startsWith('https://fc.yahoo.com')).length;
    const crumbCalls = global.fetch.mock.calls.filter((c) => c[0].includes('getcrumb')).length;
    expect(cookieCalls).toBe(1);
    expect(crumbCalls).toBe(1);

    expect(r1.body).toContain('quoteSummary');
    expect(r2.body).toContain('quoteSummary');
  });

  it('dedupes two concurrent summary requests for the same symbol', async () => {
    global.fetch = wireFetch();
    const r1 = makeRes();
    const r2 = makeRes();

    await Promise.all([
      marketSummaryHandler({ url: '/api/market-summary/AAPL' }, r1, () => {}),
      marketSummaryHandler({ url: '/api/market-summary/AAPL' }, r2, () => {})
    ]);

    // Only one quoteSummary call should have hit Yahoo.
    const summaryCalls = global.fetch.mock.calls.filter((c) => c[0].includes('quoteSummary')).length;
    expect(summaryCalls).toBe(1);
  });

  it('rejects an empty symbol with 400', async () => {
    global.fetch = vi.fn();
    const res = makeRes();
    await marketSummaryHandler({ url: '/api/market-summary/' }, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
