// Vite dev/preview proxy for Yahoo Finance.
//
// IMPORTANT: This middleware only runs under `vite dev` and `vite preview`.
// A static `dist/` build has no /api/* endpoints — production deployment
// would need a real backend. See README for the dev-only deployment story.

const YAHOO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0';

const ALLOWED_RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'ytd', 'max']);
const ALLOWED_INTERVALS = new Set(['5m', '15m', '30m', '1h', '1d', '1wk', '1mo']);

const QUOTE_SUMMARY_MODULES = [
  'summaryDetail',
  'financialData',
  'defaultKeyStatistics',
  // 财务结构与事件
  'incomeStatementHistoryQuarterly',
  'cashflowStatementHistoryQuarterly',
  'balanceSheetHistoryQuarterly',
  'earningsHistory',
  'calendarEvents',
  // 第三方分析师数据（作为事实展示，agent 不采纳为预测）
  'earningsTrend',
  'recommendationTrend'
].join(',');

const UPSTREAM_TIMEOUT_MS = 15_000;

// In-flight de-duplication. While one request to Yahoo is in flight for a
// given key, any concurrent caller awaits the same promise instead of firing
// its own request — important when `Run Full Analysis` triggers chart +
// history + summary in parallel and then a second click does it again before
// the first round finishes.
const inFlight = new Map();

const dedupe = (key, factory) => {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = factory().finally(() => {
    // Only clear the slot if we're still the owner — protects against a race
    // where a later caller already replaced the entry.
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
};

// Pull the upstream response into a serialisable `{status, body}` shape so it
// can be replayed across multiple awaiting callers.
const readUpstream = async (response) => ({
  status: response.status,
  body: await response.text()
});

const writeProxyResponse = (res, { status, body }) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(body);
};

const writeError = (res, status, message) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
};

const fetchWithTimeout = (url, init = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });

export const marketChartHandler = async (req, res, next) => {
  if (!req.url?.startsWith('/api/market-chart/')) {
    next();
    return;
  }

  const parsed = new URL(req.url, 'http://localhost');
  const symbol = decodeURIComponent(parsed.pathname.replace('/api/market-chart/', ''))
    .trim()
    .toUpperCase();

  if (!symbol) {
    writeError(res, 400, 'Missing symbol');
    return;
  }

  // Allowlist range/interval to keep the proxy from being a generic Yahoo passthrough.
  const rawRange = parsed.searchParams.get('range') || '1d';
  const rawInterval = parsed.searchParams.get('interval') || '5m';
  const range = ALLOWED_RANGES.has(rawRange) ? rawRange : '1d';
  const interval = ALLOWED_INTERVALS.has(rawInterval) ? rawInterval : '5m';
  const includePrePost = range === '1d' ? '&includePrePost=true' : '';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=${range}&interval=${interval}${includePrePost}`;

  try {
    const result = await dedupe(`chart:${symbol}:${range}:${interval}`, () =>
      fetchWithTimeout(url).then(readUpstream)
    );
    writeProxyResponse(res, result);
  } catch (error) {
    writeError(res, 502, error.message);
  }
};

// Yahoo's quoteSummary endpoint requires a (cookie, crumb) pair. We fetch them
// once at first request and reuse — yfinance has used this same trick for years.
// On 401 we refresh and retry exactly once.
let crumbState = null;
let crumbRefreshInFlight = null;

const refreshCrumb = () => {
  // Mutex: if a refresh is already running, every caller awaits the same one
  // instead of triple-pinging fc.yahoo.com from parallel handlers.
  if (crumbRefreshInFlight) return crumbRefreshInFlight;

  crumbRefreshInFlight = (async () => {
    try {
      // fc.yahoo.com sets the auth cookie; the 404 status is expected — we only
      // care about Set-Cookie. Cookie names have historically rotated; allow
      // any single-letter+digit prefix (A1, A3, B1...) instead of hardcoding.
      const cookieRes = await fetchWithTimeout('https://fc.yahoo.com/', {
        headers: { 'User-Agent': YAHOO_UA },
        redirect: 'manual'
      });
      const setCookie = cookieRes.headers.get('set-cookie') || '';
      const match = /[A-Z]\d=[^;]+/.exec(setCookie);
      if (!match) throw new Error('Yahoo did not return a recognisable auth cookie');
      const cookie = match[0];

      const crumbRes = await fetchWithTimeout(
        'https://query2.finance.yahoo.com/v1/test/getcrumb',
        { headers: { 'User-Agent': YAHOO_UA, Cookie: cookie } }
      );
      if (!crumbRes.ok) throw new Error(`Yahoo crumb fetch failed: HTTP ${crumbRes.status}`);
      const crumb = (await crumbRes.text()).trim();
      if (!crumb || crumb.length > 32) throw new Error('Yahoo crumb response looks malformed');

      crumbState = { cookie, crumb, fetchedAt: Date.now() };
      return crumbState;
    } finally {
      crumbRefreshInFlight = null;
    }
  })();

  return crumbRefreshInFlight;
};

const callQuoteSummary = (symbol, state) => {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol
  )}?modules=${QUOTE_SUMMARY_MODULES}&crumb=${encodeURIComponent(state.crumb)}`;
  return fetchWithTimeout(url, {
    headers: { 'User-Agent': YAHOO_UA, Cookie: state.cookie }
  });
};

const fetchSummary = async (symbol) => {
  let state = crumbState || (await refreshCrumb());
  let yahooResponse = await callQuoteSummary(symbol, state);

  if (yahooResponse.status === 401) {
    state = await refreshCrumb();
    yahooResponse = await callQuoteSummary(symbol, state);
  }

  return readUpstream(yahooResponse);
};

export const marketSummaryHandler = async (req, res, next) => {
  if (!req.url?.startsWith('/api/market-summary/')) {
    next();
    return;
  }

  const symbol = decodeURIComponent(req.url.replace('/api/market-summary/', '').split('?')[0])
    .trim()
    .toUpperCase();

  if (!symbol) {
    writeError(res, 400, 'Missing symbol');
    return;
  }

  try {
    const result = await dedupe(`summary:${symbol}`, () => fetchSummary(symbol));
    writeProxyResponse(res, result);
  } catch (error) {
    writeError(res, 502, error.message);
  }
};

// Vite plugin that wires both proxy routes onto the dev/preview server.
export const yahooProxyPlugin = () => ({
  name: 'local-market-chart-api',
  configureServer(server) {
    server.middlewares.use(marketChartHandler);
    server.middlewares.use(marketSummaryHandler);
  },
  configurePreviewServer(server) {
    server.middlewares.use(marketChartHandler);
    server.middlewares.use(marketSummaryHandler);
  }
});

// Test-only hooks. Exposed so the proxy unit tests can reset module-level
// state (in-flight maps, crumb cache) between cases without restarting the
// process. Not part of the runtime API.
export const __resetForTests = () => {
  inFlight.clear();
  crumbState = null;
  crumbRefreshInFlight = null;
};

export const __getCrumbState = () => crumbState;
