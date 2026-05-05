const formatCurrency = (value, currency = 'USD') => {
  if (!Number.isFinite(value)) {
    return 'not verified';
  }

  return `${value.toFixed(2)} ${currency}`;
};

const formatChange = (latest, reference) => {
  if (!Number.isFinite(latest) || !Number.isFinite(reference)) {
    return 'not verified';
  }

  const diff = latest - reference;
  const percent = reference === 0 ? 0 : (diff / reference) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)} (${sign}${percent.toFixed(2)}%)`;
};

const compactTrend = (values, maxPoints = 28) => {
  const cleanValues = values.filter((value) => Number.isFinite(value));

  if (cleanValues.length <= maxPoints) {
    return cleanValues;
  }

  const step = (cleanValues.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => cleanValues[Math.round(index * step)]);
};

export const fetchMarketData = async (symbol) => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const response = await fetch(`/api/market-chart/${encodeURIComponent(normalizedSymbol)}`);
  const data = await response.json();

  if (!response.ok || data?.chart?.error) {
    throw new Error(data?.chart?.error?.description || 'Market data request failed.');
  }

  const result = data?.chart?.result?.[0];
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

  return {
    company: {
      symbol: meta?.symbol || normalizedSymbol,
      name: meta?.longName || meta?.shortName || normalizedSymbol,
      sector: meta?.fullExchangeName || meta?.exchangeName || 'Public equity',
      recommendation: 'Not rated',
      thesis: `Live quote loaded from Yahoo Finance chart data. Last quote timestamp: ${
        latestPoint?.timestamp ? new Date(latestPoint.timestamp * 1000).toLocaleString() : 'not verified'
      }.`
    },
    metrics: {
      price: formatCurrency(latestPrice, currency),
      change: formatChange(latestPrice, referencePrice),
      marketCap: 'not provided by quote endpoint',
      peRatio: 'not provided by quote endpoint',
      revenueGrowth: 'not provided by quote endpoint',
      profitMargin: 'not provided by quote endpoint',
      debtToEquity: 'not provided by quote endpoint'
    },
    trend: compactTrend(validPairs.map((point) => point.close)),
    marketMeta: {
      source: 'Yahoo Finance chart API',
      regularMarketPrice: formatCurrency(meta?.regularMarketPrice, currency),
      regularMarketDayLow: formatCurrency(meta?.regularMarketDayLow, currency),
      regularMarketDayHigh: formatCurrency(meta?.regularMarketDayHigh, currency),
      fiftyTwoWeekLow: formatCurrency(meta?.fiftyTwoWeekLow, currency),
      fiftyTwoWeekHigh: formatCurrency(meta?.fiftyTwoWeekHigh, currency),
      volume: meta?.regularMarketVolume?.toLocaleString?.() || 'not verified'
    }
  };
};
