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
  },
  {
    id: 'verifier',
    label: 'Verifier Agent',
    shortLabel: 'Verify',
    purpose: 'Cross-check report',
    accent: '#7355d6'
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
// options.disableGrounding=true forces useGoogleSearch off for this call
// (e.g., Verifier and Report-revision must not re-search).
export const callGemini = async (prompt, signal, options = {}) => {
  const config = getGeminiConfig();
  const { apiKey, model } = config;
  const useGoogleSearch = options.disableGrounding ? false : config.useGoogleSearch;
  const key = cacheKey('gemini', model, useGoogleSearch ? 'g' : 'j', hashString(prompt));
  const cached = cacheGet(key, TTL.gemini);
  if (cached) return { ...cached, __cached: true };

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
  return { ...result, __cached: false };
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
      trendView: 'Generated by Gemini',
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

  if (agentId === 'verifier') {
    return {
      status: 'warn',
      issues: [
        {
          severity: 'warning',
          claim: 'Verifier returned non-JSON output',
          problem: 'Could not parse structured verification result.',
          suggestion: text.slice(0, 220)
        }
      ]
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
    const m = context.data.metrics;
    const meta = context.data.marketMeta || {};
    summary.metrics = {
      price: m.price,
      change: m.change,
      peRatio: m.peRatio,
      forwardPE: m.forwardPE,
      marketCap: m.marketCap,
      revenueGrowth: m.revenueGrowth,
      profitMargin: m.profitMargin,
      operatingMargin: m.operatingMargin,
      debtToEquity: m.debtToEquity,
      beta: m.beta,
      dayLow: meta.regularMarketDayLow,
      dayHigh: meta.regularMarketDayHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      volume: meta.volume,
      returnSixMonth: m.returnSixMonth,
      returnOneMonth: m.returnOneMonth,
      drawdownFromHigh: m.drawdownFromHigh,
      periodHigh: m.periodHigh,
      periodLow: m.periodLow,
      // Quarterly fundamentals + events
      revenueQoQRecent: m.revenueQoQRecent,
      operatingCashFlow: m.operatingCashFlow,
      freeCashFlow: m.freeCashFlow,
      netDebt: m.netDebt,
      epsSurpriseTrend: m.epsSurpriseTrend,
      nextEarningsDate: m.nextEarningsDate,
      daysToEarnings: m.daysToEarnings,
      // Third-party analyst data (cite as facts, never adopt as own forecasts)
      analystTargetMean: m.analystTargetMean,
      analystTargetMedian: m.analystTargetMedian,
      analystTargetRange: m.analystTargetRange,
      analystConsensus: m.analystConsensus,
      analystConsensusMean: m.analystConsensusMean,
      epsRevisionsRecent: m.epsRevisionsRecent,
      consensusEvolution: m.consensusEvolution
    };
  }
  if (Array.isArray(context.data?.trend)) {
    summary.trend = context.data.trend;
  }
  if (Array.isArray(context.data?.history) && context.data.history.length > 0) {
    summary.history = context.data.history;
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
      trendView: context.analysis.trendView,
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

// Verifier needs raw upstream outputs (not summarized) to do precise comparisons.
// Each section is null-safe — missing input becomes "(not produced)".
export const verifierContextBlock = (context) => {
  const block = (label, value) =>
    `\n\n${label}:\n${value ? JSON.stringify(value, null, 2) : '(not produced)'}`;

  const dataMetrics = context?.data?.metrics || null;
  const newsOutput = context?.news
    ? { news: context.news.news, sentimentScore: context.news.sentimentScore }
    : null;
  const analysisOutput = context?.analysis
    ? {
        valuation: context.analysis.valuation,
        growthView: context.analysis.growthView,
        marginView: context.analysis.marginView,
        trendView: context.analysis.trendView,
        analysisSummary: context.analysis.analysisSummary
      }
    : null;
  const riskOutput = context?.risk
    ? {
        riskLevel: context.risk.riskLevel,
        risks: context.risk.risks,
        opportunities: context.risk.opportunities
      }
    : null;
  const reportV1 = context?.report
    ? {
        title: context.report.title,
        recommendation: context.report.recommendation,
        thesis: context.report.thesis,
        bullets: context.report.bullets
      }
    : null;

  return (
    block('DATA_METRICS', dataMetrics) +
    block('NEWS_OUTPUT', newsOutput) +
    block('ANALYSIS_OUTPUT', analysisOutput) +
    block('RISK_OUTPUT', riskOutput) +
    block('REPORT_V1', reportV1)
  );
};

// Exported for tests; not part of the public API.
export const prompts = {
  news: (symbol, context) => `
Research recent news for "${symbol}" and summarize what matters for investors.
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "news": ["headline-style summary", "headline-style summary", "headline-style summary"],
  "sentimentScore": number
}
sentimentScore must be 0-100.${contextBlock(context)}`,
  analysis: (symbol, context) => `
Analyze valuation, growth, profitability, and recent price trend for "${symbol}".
Rules:
- Use only the metrics and history provided in the dashboard context. If a field is "not provided" or "not verified", say so plainly instead of estimating.
- Yahoo data has occasional anomalies (e.g. priceToBook off by orders of magnitude on dual-class shares); if a number looks implausible, flag it explicitly.
- The "trendView" field must DESCRIBE what has already happened (use returnSixMonth, returnOneMonth, drawdownFromHigh, history). Do NOT forecast or predict where the price will go next.
- DO NOT assess investment risk or assign a risk level. That is the Risk Agent's job. Stick to describing fundamentals and price history.
- You may CITE analyst consensus as descriptive data (e.g. "analysts target $X, n=42") but DO NOT adopt their forecasts as your own conclusions. "Analysts target $215" is fine; "the stock will reach $215" is not.
- If news context is absent (News Agent failed), do not reference "sentimentScore" or quote News-curated headlines.
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "valuation": "short phrase",
  "growthView": "short phrase",
  "marginView": "short phrase",
  "trendView": "short phrase describing past 6-month price action",
  "analysisSummary": "two sentence summary"
}${contextBlock(context)}`,
  risk: (symbol, context) => `
Assess investment risks and opportunities for "${symbol}".
Rules:
- Ground every risk and opportunity in observable, current evidence: the metrics provided (beta, debtToEquity, drawdownFromHigh, position within fiftyTwoWeekRange, daysToEarnings, netDebt, freeCashFlow, epsSurpriseTrend) or news headlines.
- Do NOT forecast prices or extrapolate trends. "The stock will fall further" is not a valid risk; "drawdown of -22% from 6-month high signals weakening momentum" is.
- DO NOT assign a Buy/Hold/Sell-style valuation rating. That is the Report Agent's job. Stick to risk identification and opportunity framing.
- Analyst price targets and EPS revisions are signals to interpret, not endorse. Frame as "consensus revised down 12 times in 30 days = mixed sentiment", not "EPS will fall". Do not cite "analyst target $X" as an opportunity by itself; treat targets as one input among many.
- If news context is absent (News Agent failed), you may still reference events found via your own grounding, but cannot cite a "sentimentScore" value or quote News-curated headlines as if News Agent supplied them.
Return compact valid JSON only. Do not use markdown. Do not add explanations outside JSON. Return this exact JSON shape:
{
  "riskLevel": "Low | Moderate | Elevated | High",
  "risks": ["risk 1", "risk 2", "risk 3"],
  "opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"]
}${contextBlock(context)}`,
  verifier: (symbol, context) => `
You are a verifier for a finance research workflow. You receive five inputs in the dashboard context:
- DATA_METRICS:    The authoritative source for ALL numerical facts. The only place numbers may be sourced from.
- NEWS_OUTPUT:     Headlines + sentimentScore.
- ANALYSIS_OUTPUT: Qualitative interpretation of fundamentals.
- RISK_OUTPUT:     riskLevel + risks/opportunities.
- REPORT_V1:       The synthesis to check.

Your job: identify issues where REPORT_V1 drifted from upstream evidence. Apply each check below. Return strict JSON.

CHECK 1 — Number fidelity (BLOCKING):
For every number in REPORT_V1 (price, growth %, margin %, ratio, $ amount), verify it appears in DATA_METRICS within ±5% tolerance. Numbers in ANALYSIS_OUTPUT or RISK_OUTPUT do NOT count as valid sources — they are intermediate restatements of DATA_METRICS. If a number is not in DATA_METRICS, flag BLOCKING.

CHECK 2 — Recommendation/RiskLevel alignment. Apply this full 4×5 map:

  recommendation × riskLevel:
  Buy   + Low      → OK
  Buy   + Moderate → OK
  Buy   + Elevated → WARNING
  Buy   + High     → BLOCKING
  Hold  + (any)    → OK
  Watch + (any)    → OK
  Avoid + Low      → BLOCKING
  Avoid + Moderate → WARNING
  Avoid + Elevated → OK
  Avoid + High     → OK
  Not rated + (any) → OK

  Only emit an issue if the cell is WARNING or BLOCKING.

CHECK 3 — Self-prediction language (WARNING):
Flag REPORT_V1 phrases that predict price/value movement WITHOUT clear third-party attribution.
  "Will reach $X" with no source → WARNING
  "Expected to recover" with no source → WARNING
  "Analysts target $X" → OK (attributed)
  "Wall Street consensus is bullish" → OK (attributed)
  "The stock could outperform" → WARNING (vague + no source)

CHECK 4 — Recommendation reasoning (WARNING):
Report.recommendation must be supported by reasoning citing RISK_OUTPUT or ANALYSIS_OUTPUT findings. If the only justification is "analysts say buy" or analyst consensus alone → WARNING.

CHECK 5 — Bullet traceability (WARNING):
Each bullet in REPORT_V1.bullets must connect to a specific upstream fact: a metric value (DATA), a headline (NEWS), a risk item (RISK), or an analysis point (ANALYSIS). Bullets that introduce new claims → WARNING.

CHECK 6 — Upstream boundary lint (WARNING, does not by itself trigger revision):
- ANALYSIS_OUTPUT contains "riskLevel"/"high risk"/"major risk" style assignments → WARNING
- RISK_OUTPUT contains "rated Buy"/"recommendation: X"/"valuation rating" → WARNING

CHECK 7 — News event fidelity (BLOCKING):
If REPORT_V1 references a specific news event, headline, or sentiment claim, that claim must be supported by an entry in NEWS_OUTPUT.news (verbatim or close paraphrase) or by the sentimentScore. Citing an event not present in NEWS_OUTPUT (and not in DATA_METRICS as a calendarEvent) → BLOCKING. Generic remarks without a specific claim are OK.

CHECK 8 — Thesis vs Analysis direction (WARNING):
REPORT_V1.thesis must not contradict ANALYSIS_OUTPUT's overall direction. Examples of contradictions:
- ANALYSIS_OUTPUT.valuation says "estimated rich/expensive" but thesis says "undervalued" → WARNING
- ANALYSIS_OUTPUT.growthView says "decelerating" but thesis says "accelerating growth story" → WARNING
- ANALYSIS_OUTPUT.marginView says "compressed margins" but thesis says "expanding profitability" → WARNING

OUTPUT (strict JSON, no markdown, no explanation outside JSON):
{
  "status": "pass" | "warn" | "fail",
  "issues": [
    {
      "severity": "blocking" | "warning",
      "claim": "exact text from REPORT_V1 (or ANALYSIS_OUTPUT / RISK_OUTPUT for CHECK 6)",
      "problem": "which check failed and why",
      "suggestion": "concrete fix using DATA_METRICS values where applicable"
    }
  ]
}

Status rules:
- Any blocking → "fail"
- Only warnings (no blocking) → "warn"
- No issues → "pass"
${verifierContextBlock(context)}`,
  reportRevision: (symbol, context, options = {}) => {
    const previousReport = options.previousReport || context?.report || {};
    const issues = Array.isArray(options.issues) ? options.issues : [];
    const issuesList = issues
      .map((i) => `- ${i.claim || '(unspecified)'} → ${i.problem || ''}. Suggested fix: ${i.suggestion || ''}`)
      .join('\n');
    const dataMetricsBlock = context?.data?.metrics
      ? JSON.stringify(context.data.metrics, null, 2)
      : '(not provided)';
    return `
You previously generated this investment brief for "${symbol}":
${JSON.stringify(previousReport, null, 2)}

A verification step found these issues that must be fixed:
${issuesList}

Generate a revised brief. Same JSON schema as before:
{
  "title": "string",
  "recommendation": "Buy | Hold | Watch | Avoid | Not rated",
  "thesis": "two sentence thesis",
  "bullets": ["bullet 1", "bullet 2", "bullet 3", "bullet 4"]
}

CRITICAL when fixing issues:
- All numerical claims must come from DATA_METRICS only. Do NOT take numbers from Risk's or Analysis's narrative — those are interpretations, not authoritative sources. If Verifier flagged a number issue, replace it with the value from DATA_METRICS exactly.
- If Verifier flagged self-prediction language, rephrase with explicit attribution ("analysts target $X", "consensus says ...") OR remove the predictive claim.
- Do not introduce new facts not present in the dashboard context.
${contextBlock(context)}

DATA_METRICS (authoritative source for all numbers):
${dataMetricsBlock}
`;
  },
  report: (symbol, context) => `
Generate a final investment brief for "${symbol}" using the dashboard context.
Rules:
- Your "recommendation" must be GROUNDED in this dashboard's Risk and Analysis output. You may cite analyst consensus as supporting evidence, but the recommendation cannot rest solely on "analysts say buy/sell"; it must reflect the workflow's own Risk + Analysis findings.
- Numerical claims in "thesis" or "bullets" must come from the Data context (metrics block). Do not introduce new numbers not present upstream.
- Do not predict price movements yourself. Predictions you cite (analyst targets, consensus growth estimates) must be explicitly attributed: "analysts target $X" — never "the stock will reach $X".
- If News Agent did not supply a sentimentScore (failed/missing), do not reference one.
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

export const runAgent = async (agentId, symbol, emitLog, context = {}, signal, options = {}) => {
  const resolvedSymbol = normalizeSymbol(symbol);
  const agent = agentDefinitions.find((item) => item.id === agentId);

  // Data Agent intentionally bypasses Gemini — prices must come from a verified source.
  if (agentId === 'data') {
    emitLog(`${agent.label} started for ${resolvedSymbol}. Calling live market chart API...`);
    const { __cached, ...marketPayload } = await fetchMarketData(resolvedSymbol, signal);
    emitLog(`${agent.label} loaded live price and intraday chart data${__cached ? ' (cached)' : ''}.`);

    return {
      symbol: marketPayload.company.symbol,
      data: marketPayload
    };
  }

  // Pick the prompt: Report has a special "revision" mode when Verifier flagged blocking issues.
  let promptText;
  let logSuffix = '';
  if (agentId === 'report' && options.revisionFeedback) {
    promptText = prompts.reportRevision(resolvedSymbol, context, options.revisionFeedback);
    logSuffix = ' (revision)';
  } else {
    promptText = prompts[agentId](resolvedSymbol, context);
  }

  emitLog(`${agent.label} started for ${resolvedSymbol}${logSuffix}. Calling Gemini API...`);

  // Verifier and Report-revision must not re-ground — they reason on already-fetched facts.
  const callOptions = {};
  if (agentId === 'verifier' || (agentId === 'report' && options.revisionFeedback)) {
    callOptions.disableGrounding = true;
  }
  const { json, text, sources, __cached } = await callGemini(promptText, signal, callOptions);
  emitLog(`${agent.label} received Gemini response${__cached ? ' (cached)' : ''}${logSuffix}.`);

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
