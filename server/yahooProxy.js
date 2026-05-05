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
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing symbol' }));
    return;
  }

  // Allowlist range/interval to keep the proxy from being a generic Yahoo passthrough.
  const rawRange = parsed.searchParams.get('range') || '1d';
  const rawInterval = parsed.searchParams.get('interval') || '5m';
  const range = ALLOWED_RANGES.has(rawRange) ? rawRange : '1d';
  const interval = ALLOWED_INTERVALS.has(rawInterval) ? rawInterval : '5m';
  const includePrePost = range === '1d' ? '&includePrePost=true' : '';

  try {
    const yahooResponse = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=${range}&interval=${interval}${includePrePost}`
    );
    const body = await yahooResponse.text();

    res.statusCode = yahooResponse.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message }));
  }
};

// Yahoo's quoteSummary endpoint requires a (cookie, crumb) pair. We fetch them
// once at first request and reuse — yfinance has used this same trick for years.
// On 401 we refresh and retry exactly once.
let crumbState = null;

const refreshCrumb = async () => {
  // fc.yahoo.com sets the auth cookie; the 404 status is expected — we only
  // care about Set-Cookie. Cookie name has historically rotated between A1/A3.
  const cookieRes = await fetch('https://fc.yahoo.com/', {
    headers: { 'User-Agent': YAHOO_UA },
    redirect: 'manual'
  });
  const setCookie = cookieRes.headers.get('set-cookie') || '';
  const match = /(A1|A3)=[^;]+/.exec(setCookie);
  if (!match) throw new Error('Yahoo did not return an auth cookie (A1/A3)');
  const cookie = match[0];

  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': YAHOO_UA, Cookie: cookie }
  });
  if (!crumbRes.ok) throw new Error(`Yahoo crumb fetch failed: HTTP ${crumbRes.status}`);
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.length > 32) throw new Error('Yahoo crumb response looks malformed');

  crumbState = { cookie, crumb, fetchedAt: Date.now() };
  return crumbState;
};

const callQuoteSummary = (symbol, state) => {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol
  )}?modules=${QUOTE_SUMMARY_MODULES}&crumb=${encodeURIComponent(state.crumb)}`;
  return fetch(url, {
    headers: { 'User-Agent': YAHOO_UA, Cookie: state.cookie }
  });
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
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing symbol' }));
    return;
  }

  try {
    let state = crumbState || (await refreshCrumb());
    let yahooResponse = await callQuoteSummary(symbol, state);

    if (yahooResponse.status === 401) {
      state = await refreshCrumb();
      yahooResponse = await callQuoteSummary(symbol, state);
    }

    const body = await yahooResponse.text();
    res.statusCode = yahooResponse.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  } catch (error) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error.message }));
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
