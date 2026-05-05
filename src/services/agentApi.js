import { fetchMarketData } from './marketData';
import { TTL, cacheGet, cacheKey, cacheSet, hashString } from './cache';

const RETRY_BACKOFF_MS = 800;
const MAX_SOURCES = 5;

const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

const TICKER_RE = /^[A-Z.\-]{1,8}$/;

const normalizeSymbol = (symbol) => String(symbol ?? '').trim().toUpperCase();

export const validateSymbol = (symbol) => {
  const cleaned = normalizeSymbol(symbol);
  if (!cleaned) {
    return { ok: false, error: 'Enter a ticker symbol before running an agent.' };
  }
  if (!TICKER_RE.test(cleaned)) {
    return {
      ok: false,
      error: `"${cleaned}" is not a valid ticker. Use 1-8 letters, dots, or dashes.`
    };
  }
  return { ok: true, symbol: cleaned };
};

export const agentDefinitions = [
  {
    id: 'data',
    label: 'Data Agent',
    shortLabel: 'Data',
    purpose: 'Market snapshot',
    accent: '#1d8f7a'
  },
  {
    id: 'news',
    label: 'News Agent',
    shortLabel: 'News',
    purpose: 'Recent headlines',
    accent: '#c8791a'
  },
  {
    id: 'analysis',
    label: 'Analysis Agent',
    shortLabel: 'Analysis',
    purpose: 'Ratios and trends',
    accent: '#5567d9'
  },
  {
    id: 'risk',
    label: 'Risk Agent',
    shortLabel: 'Risk',
    purpose: 'Scenario review',
    accent: '#c74751'
  },
  {
    id: 'report',
    label: 'Report Agent',
    shortLabel: 'Report',
    purpose: 'Final memo',
    accent: '#6e7f2d'
  }
];

const getGeminiConfig = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const model = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
  const useGoogleSearch = import.meta.env.VITE_GEMINI_USE_GOOGLE_SEARCH !== 'false';

  if (!apiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Add it to .env.local and restart npm run dev.');
  }

  return { apiKey, model, useGoogleSearch };
};

const extractText = (data) =>
  data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';

export const cleanJsonText = (text) =>
  text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

export const extractFirstObject = (text) => {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

export const parseJson = (text) => {
  const cleaned = cleanJsonText(text);
  const candidate = extractFirstObject(cleaned) ?? cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

const extractSources = (data) => {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    .map((chunk) => chunk.web)
    .filter(Boolean)
    .map((web) => ({ title: web.title || web.uri, uri: web.uri }))
    .filter((source, index, all) => source.uri && all.findIndex((item) => item.uri === source.uri) === index)
    .slice(0, MAX_SOURCES);
};

const SYSTEM_INSTRUCTION =
  'You are a careful finance workflow agent for a classroom dashboard. Return only valid JSON. Do not include markdown fences. If live market values are uncertain, say "not verified" instead of inventing exact numbers.';

const RETRY_HINT =
  '\n\nIMPORTANT: Your previous response was not valid JSON. Return only one JSON object, no markdown fences, no commentary.';

// Exported for tests; not part of the public API.
export const callGemini = async (prompt, signal) => {
  const { apiKey, model, useGoogleSearch } = getGeminiConfig();
  const key = cacheKey('gemini', model, useGoogleSearch ? 'g' : 'j', hashString(prompt));
  const cached = cacheGet(key, TTL.gemini);
  if (cached) return cached;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const buildInit = (text) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      tools: useGoogleSearch ? [{ google_search: {} }] : undefined,
      generationConfig: {
        temperature: 0.25,
        ...(useGoogleSearch ? {} : { responseMimeType: 'application/json' })
      }
    }),
    signal
  });

  const tryOnce = async (init) => {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(`Gemini API error: ${data?.error?.message || response.statusText}`);
      err.retryable = response.status === 429 || response.status >= 500;
      throw err;
    }
    return data;
  };

  const fetchWithBackoff = async (init) => {
    try {
      return await tryOnce(init);
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      if (error.retryable || error.name === 'TypeError') {
        await pause(RETRY_BACKOFF_MS);
        return await tryOnce(init);
      }
      throw error;
    }
  };

  const parseResult = (data) => {
    const text = extractText(data);
    return {
      json: parseJson(text),
      text,
      sources: extractSources(data)
    };
  };

  let result = parseResult(await fetchWithBackoff(buildInit(prompt)));

  if (!result.json && result.text) {
    const retryData = await fetchWithBackoff(buildInit(prompt + RETRY_HINT));
    const retryResult = parseResult(retryData);
    if (retryResult.json) result = retryResult;
  }

  if (result.json) cacheSet(key, result);
  return result;
};

const plainTextPayload = (agentId, symbol, text) => {
  if (agentId === 'news') {
    return {
      news: text
        .split(/\n+/)
        .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
        .filter(Boolean)
        .slice(0, 3),
      sentimentScore: 50
    };
  }

  if (agentId === 'analysis') {
    return {
      valuation: 'Generated by Gemini',
      growthView: 'Generated by Gemini',
      marginView: 'Generated by Gemini',
      analysisSummary: text.slice(0, 500)
    };
  }

  if (agentId === 'risk') {
    return {
      riskLevel: 'Moderate',
      risks: [text.slice(0, 220)],
      opportunities: ['See Gemini-generated analysis in the report section.']
    };
  }

  return {
    title: `${symbol} Gemini Investment Brief`,
    recommendation: 'Not rated',
    thesis: text.slice(0, 500),
    bullets: text
      .split(/\n+/)
      .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 4)
  };
};

// Exported for tests; not part of the public API.
export const summarizeContext = (context) => {
  if (!context) return null;
  const summary = {};

  if (context.data?.company) {
    summary.company = {
      symbol: context.data.company.symbol,
      name: context.data.company.name,
      sector: context.data.company.sector
    };
  }
  if (context.data?.metrics) {
    summary.metrics = {
      price: context.data.metrics.price,
      change: context.data.metrics.change,
      peRatio: context.data.metrics.peRatio
    };
  }
  if (Array.isArray(context.data?.trend)) {
    summary.trend = context.data.trend;
  }
  if (Array.isArray(context.news?.news)) {
    summary.news = context.news.news;
    summary.sentimentScore = context.news.sentimentScore;
  }
  if (context.analysis?.valuation || context.analysis?.analysisSummary) {
    summary.analysis = {
      valuation: context.analysis.valuation,
      growthView: context.analysis.growthView,
      marginView: context.analysis.marginView,
      summary: context.analysis.analysisSummary
    };
  }
  if (context.risk?.riskLevel) {
    summary.risk = {
      level: context.risk.riskLevel,
      risks: context.risk.risks,
      opportunities: context.risk.opportunities
    };
  }

  return Object.keys(summary).length ? summary : null;
};

const contextBlock = (context) => {
  const summary = summarizeContext(context);
  return summary ? `\n\nCurrent dashboard context:\n${JSON.stringify(summary, null, 2)}` : '';
};

const prompts = {
  news: (symbol, context) => `
Research recent news for "${symbol}" and summarize what matters for investors.
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "news": ["headline-style summary", "headline-style summary", "headline-style summary"],
  "sentimentScore": number
}
sentimentScore must be 0-100.${contextBlock(context)}`,
  analysis: (symbol, context) => `
Analyze valuation, growth, profitability, and market trend for "${symbol}".
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "valuation": "short phrase",
  "growthView": "short phrase",
  "marginView": "short phrase",
  "analysisSummary": "two sentence summary",
  "trend": [number, number, number, number, number, number, number]
}${contextBlock(context)}`,
  risk: (symbol, context) => `
Assess investment risks and opportunities for "${symbol}".
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "riskLevel": "Low | Moderate | Elevated | High",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"]
}${contextBlock(context)}`,
  report: (symbol, context) => `
Generate a final investment brief for "${symbol}" using the dashboard context.
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "title": "string",
  "recommendation": "Buy | Hold | Watch | Avoid | Not rated",
  "thesis": "two sentence thesis",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"]
}${contextBlock(context)}`
};

export const createCompanyShell = (symbol) => ({
  symbol: normalizeSymbol(symbol),
  name: 'Awaiting Gemini analysis',
  sector: 'Live Gemini workflow',
  recommendation: 'Not rated',
  thesis: 'Run an agent to generate live analysis from Gemini.'
});

export const runAgent = async (agentId, symbol, emitLog, context = {}, signal) => {
  const resolvedSymbol = normalizeSymbol(symbol);
  const agent = agentDefinitions.find((item) => item.id === agentId);

  // Data Agent intentionally bypasses Gemini — prices must come from a verified source.
  if (agentId === 'data') {
    emitLog(`${agent.label} started for ${resolvedSymbol}. Calling live market chart API...`);
    const marketPayload = await fetchMarketData(resolvedSymbol, signal);
    emitLog(`${agent.label} loaded live price and intraday chart data.`);

    return {
      symbol: marketPayload.company.symbol,
      data: marketPayload
    };
  }

  emitLog(`${agent.label} started for ${resolvedSymbol}. Calling Gemini API...`);

  const { json, text, sources } = await callGemini(prompts[agentId](resolvedSymbol, context), signal);
  emitLog(`${agent.label} received Gemini response.`);

  // Defensive: if Gemini still wraps report inside a "report" field, unwrap it.
  let payload = json;
  if (agentId === 'report' && payload?.report && !payload.title) {
    payload = payload.report;
  }

  return {
    symbol: resolvedSymbol,
    [agentId]: {
      ...(payload || plainTextPayload(agentId, resolvedSymbol, text)),
      sources,
      rawText: payload ? undefined : text
    }
  };
};
