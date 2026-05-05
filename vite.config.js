import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const marketChartHandler = async (req, res, next) => {
  if (!req.url?.startsWith('/api/market-chart/')) {
    next();
    return;
  }

  const symbol = decodeURIComponent(req.url.replace('/api/market-chart/', '').split('?')[0])
    .trim()
    .toUpperCase();

  if (!symbol) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing symbol' }));
    return;
  }

  try {
    const yahooResponse = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        symbol
      )}?range=1d&interval=5m&includePrePost=true`
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

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-market-chart-api',
      configureServer(server) {
        server.middlewares.use(marketChartHandler);
      },
      configurePreviewServer(server) {
        server.middlewares.use(marketChartHandler);
      }
    }
  ]
});
