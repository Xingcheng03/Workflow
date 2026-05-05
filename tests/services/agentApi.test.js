import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentDefinitions,
  callGemini,
  cleanJsonText,
  createCompanyShell,
  extractFirstObject,
  parseJson,
  prompts,
  summarizeContext,
  validateSymbol
} from '../../src/services/agentApi';

describe('validateSymbol', () => {
  it('accepts a typical ticker', () => {
    expect(validateSymbol('NVDA')).toEqual({ ok: true, symbol: 'NVDA' });
  });

  it('uppercases and trims input', () => {
    expect(validateSymbol('  tsla  ')).toEqual({ ok: true, symbol: 'TSLA' });
  });

  it('accepts dots and dashes (BRK.A, BF-B)', () => {
    expect(validateSymbol('BRK.A').ok).toBe(true);
    expect(validateSymbol('BF-B').ok).toBe(true);
  });

  it('rejects empty input', () => {
    expect(validateSymbol('').ok).toBe(false);
    expect(validateSymbol('   ').ok).toBe(false);
    expect(validateSymbol(undefined).ok).toBe(false);
    expect(validateSymbol(null).ok).toBe(false);
  });

  it('rejects digits and special characters', () => {
    expect(validateSymbol('AAPL1').ok).toBe(false);
    expect(validateSymbol('hello world').ok).toBe(false);
    expect(validateSymbol('A!B').ok).toBe(false);
  });

  it('rejects strings longer than 8 characters', () => {
    expect(validateSymbol('ABCDEFGHI').ok).toBe(false);
  });
});

describe('cleanJsonText', () => {
  it('strips a leading ```json fence', () => {
    expect(cleanJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a leading bare ``` fence', () => {
    expect(cleanJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('returns plain text untouched aside from trim', () => {
    expect(cleanJsonText('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('parseJson', () => {
  it('parses a clean JSON object', () => {
    expect(parseJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('parses JSON wrapped in markdown fences', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON when preceded or followed by prose', () => {
    expect(parseJson('Here is your data: {"a":1} thanks!')).toEqual({ a: 1 });
  });

  it('returns null for unparseable input', () => {
    expect(parseJson('not actually json at all')).toBeNull();
    expect(parseJson('{"unclosed":')).toBeNull();
  });

  it('rejects parsed non-object values so callers can fall back to plain-text payload', () => {
    // JSON.parse('42') succeeds, but a number is not a usable agent payload.
    expect(parseJson('42')).toBeNull();
    expect(parseJson('"just a string"')).toBeNull();
    expect(parseJson('null')).toBeNull();
    expect(parseJson('[1,2,3]')).toBeNull();
  });
});

describe('createCompanyShell', () => {
  it('normalizes the symbol', () => {
    expect(createCompanyShell('  nvda ').symbol).toBe('NVDA');
  });

  it('includes placeholder copy', () => {
    const shell = createCompanyShell('AAPL');
    expect(shell.name).toBeTruthy();
    expect(shell.recommendation).toBe('Not rated');
  });
});

describe('agentDefinitions', () => {
  it('exports six agents in workflow order ending with verifier', () => {
    expect(agentDefinitions.map((a) => a.id)).toEqual([
      'data',
      'news',
      'analysis',
      'risk',
      'report',
      'verifier'
    ]);
  });

  it('every agent has a shortLabel for compact UI display', () => {
    for (const agent of agentDefinitions) {
      expect(agent.shortLabel).toBeTruthy();
    }
  });
});

describe('extractFirstObject', () => {
  it('returns null when no opening brace', () => {
    expect(extractFirstObject('hello world')).toBeNull();
  });

  it('extracts a single object', () => {
    expect(extractFirstObject('{"a":1}')).toBe('{"a":1}');
  });

  it('extracts the first object when followed by another', () => {
    expect(extractFirstObject('{"a":1} and {"b":2}')).toBe('{"a":1}');
  });

  it('handles braces inside string literals', () => {
    expect(extractFirstObject('{"text":"has } brace"}')).toBe('{"text":"has } brace"}');
  });

  it('handles escaped quotes inside strings', () => {
    expect(extractFirstObject('{"text":"he said \\"hi\\""}')).toBe('{"text":"he said \\"hi\\""}');
  });

  it('handles nested objects', () => {
    expect(extractFirstObject('{"a":{"b":1}}')).toBe('{"a":{"b":1}}');
  });

  it('returns null when never balanced', () => {
    expect(extractFirstObject('{"unclosed":')).toBeNull();
  });
});

describe('summarizeContext', () => {
  it('returns null for empty input', () => {
    expect(summarizeContext(null)).toBeNull();
    expect(summarizeContext({})).toBeNull();
  });

  it('whitelists company fields under data', () => {
    const out = summarizeContext({
      data: {
        company: { symbol: 'NVDA', name: 'NVIDIA', sector: 'Tech', recommendation: 'Buy', thesis: 'leak' }
      }
    });
    expect(out.company).toEqual({ symbol: 'NVDA', name: 'NVIDIA', sector: 'Tech' });
  });

  it('strips noise fields like marketMeta and rawText', () => {
    const out = summarizeContext({
      data: {
        company: { symbol: 'NVDA', name: 'NVIDIA', sector: 'Tech' },
        marketMeta: { source: 'Yahoo' }
      },
      news: { news: ['a'], sentimentScore: 70, sources: [{ uri: 'x' }], rawText: 'leak' }
    });
    expect(out.marketMeta).toBeUndefined();
    expect(out.rawText).toBeUndefined();
    expect(out.sources).toBeUndefined();
  });

  it('keeps news headlines and sentiment together', () => {
    const out = summarizeContext({ news: { news: ['a', 'b'], sentimentScore: 70 } });
    expect(out.news).toEqual(['a', 'b']);
    expect(out.sentimentScore).toBe(70);
  });

  it('groups analysis fields under summary.analysis', () => {
    const out = summarizeContext({
      analysis: {
        valuation: 'high',
        growthView: 'strong',
        marginView: 'healthy',
        analysisSummary: 'overall positive'
      }
    });
    expect(out.analysis).toEqual({
      valuation: 'high',
      growthView: 'strong',
      marginView: 'healthy',
      summary: 'overall positive'
    });
  });

  it('forwards new fundamentals fields to downstream context', () => {
    const out = summarizeContext({
      data: {
        metrics: {
          price: '100 USD',
          change: '+1',
          peRatio: '40.50',
          forwardPE: '17.66',
          marketCap: '4.82T USD',
          revenueGrowth: '73.20%',
          profitMargin: '55.60%',
          operatingMargin: '65.02%',
          debtToEquity: '7.26',
          beta: '2.24'
        }
      }
    });
    expect(out.metrics.forwardPE).toBe('17.66');
    expect(out.metrics.operatingMargin).toBe('65.02%');
    expect(out.metrics.beta).toBe('2.24');
    expect(out.metrics.marketCap).toBe('4.82T USD');
  });

  it('lifts useful marketMeta fields into metrics without leaking marketMeta itself', () => {
    const out = summarizeContext({
      data: {
        metrics: { price: '100 USD', change: '+1 (+1%)', peRatio: 'not provided' },
        marketMeta: {
          source: 'Yahoo Finance chart API',
          regularMarketDayLow: '99 USD',
          regularMarketDayHigh: '101 USD',
          fiftyTwoWeekLow: '80 USD',
          fiftyTwoWeekHigh: '120 USD',
          volume: '10,000,000'
        }
      }
    });
    expect(out.marketMeta).toBeUndefined();
    expect(out.metrics.fiftyTwoWeekLow).toBe('80 USD');
    expect(out.metrics.fiftyTwoWeekHigh).toBe('120 USD');
    expect(out.metrics.dayLow).toBe('99 USD');
    expect(out.metrics.dayHigh).toBe('101 USD');
    expect(out.metrics.volume).toBe('10,000,000');
  });

  it('groups risk fields under summary.risk', () => {
    const out = summarizeContext({
      risk: {
        riskLevel: 'Moderate',
        risks: ['r1'],
        opportunities: ['o1']
      }
    });
    expect(out.risk).toEqual({ level: 'Moderate', risks: ['r1'], opportunities: ['o1'] });
  });
});

describe('prompts (boundary enforcement)', () => {
  it('analysis prompt forbids assigning a risk level', () => {
    const text = prompts.analysis('NVDA', null);
    expect(text).toMatch(/Do NOT assess investment risk|Do not assign a risk level/i);
  });

  it('analysis prompt allows citing but not adopting analyst forecasts', () => {
    const text = prompts.analysis('NVDA', null);
    expect(text).toMatch(/CITE analyst consensus/);
    expect(text).toMatch(/DO NOT adopt their forecasts/i);
  });

  it('risk prompt forbids assigning a Buy/Hold/Sell rating', () => {
    const text = prompts.risk('NVDA', null);
    expect(text).toMatch(/Do NOT assign a Buy\/Hold\/Sell/i);
  });

  it('risk prompt forbids forecasting prices', () => {
    const text = prompts.risk('NVDA', null);
    expect(text).toMatch(/Do NOT forecast prices/i);
  });

  it('risk prompt frames analyst targets as signals not endorsements', () => {
    const text = prompts.risk('NVDA', null);
    expect(text).toMatch(/signals to interpret, not endorse/);
  });

  it('report prompt requires recommendation grounded in workflow Risk+Analysis', () => {
    const text = prompts.report('NVDA', null);
    expect(text).toMatch(/recommendation cannot rest solely on/);
    expect(text).toMatch(/Risk and Analysis output/);
  });

  it('report prompt forbids self-prediction; predictions must be attributed', () => {
    const text = prompts.report('NVDA', null);
    expect(text).toMatch(/Do not predict price movements yourself/);
    expect(text).toMatch(/explicitly attributed/);
  });

  it('verifier prompt declares Data.metrics as the only authoritative number source', () => {
    const text = prompts.verifier('NVDA', null);
    expect(text).toMatch(/DATA_METRICS:\s+The authoritative source/);
    expect(text).toMatch(/Numbers in ANALYSIS_OUTPUT or RISK_OUTPUT do NOT count/);
  });

  it('verifier prompt covers all 8 checks (numbers, news, alignment, prediction, reasoning, bullets, boundary, thesis)', () => {
    const text = prompts.verifier('NVDA', null);
    expect(text).toMatch(/CHECK 1.*Number fidelity/i);
    expect(text).toMatch(/CHECK 2.*Recommendation\/RiskLevel/i);
    expect(text).toMatch(/CHECK 3.*Self-prediction/i);
    expect(text).toMatch(/CHECK 4.*Recommendation reasoning/i);
    expect(text).toMatch(/CHECK 5.*Bullet traceability/i);
    expect(text).toMatch(/CHECK 6.*Upstream boundary lint/i);
    expect(text).toMatch(/CHECK 7.*News event fidelity/i);
    expect(text).toMatch(/CHECK 8.*Thesis vs Analysis direction/i);
  });

  it('verifier prompt enforces strict JSON output schema', () => {
    const text = prompts.verifier('NVDA', null);
    expect(text).toMatch(/strict JSON/i);
    expect(text).toMatch(/"status":\s*"pass"\s*\|\s*"warn"\s*\|\s*"fail"/);
    expect(text).toMatch(/"severity":\s*"blocking"\s*\|\s*"warning"/);
  });

  it('reportRevision prompt embeds previous report + issues + Data.metrics authority', () => {
    const ctx = { data: { metrics: { peRatio: '20.50' } }, report: { title: 'Old' } };
    const text = prompts.reportRevision('NVDA', ctx, {
      previousReport: { title: 'Old', recommendation: 'Buy', thesis: 'broken', bullets: [] },
      issues: [{ claim: 'PE 35', problem: 'Not in DATA_METRICS', suggestion: 'Use 20.50' }]
    });
    expect(text).toMatch(/You previously generated this investment brief/);
    expect(text).toMatch(/PE 35/);
    expect(text).toMatch(/Use 20\.50/);
    expect(text).toMatch(/All numerical claims must come from DATA_METRICS only/);
    expect(text).toMatch(/peRatio.*20\.50/);
  });
});

describe('runAgent verifier + revision integration', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
    vi.stubEnv('VITE_GEMINI_MODEL', 'test-model');
    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'false');
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const okResponse = (text) => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] })
  });

  it('parses Verifier fail status with blocking issue', async () => {
    const { runAgent } = await import('../../src/services/agentApi');
    const verifierResp =
      '{"status":"fail","issues":[{"severity":"blocking","claim":"PE 35","problem":"Not in DATA_METRICS","suggestion":"Use 20.50"}]}';
    global.fetch = vi.fn().mockResolvedValue(okResponse(verifierResp));
    const result = await runAgent('verifier', 'NVDA', () => {}, {
      data: { metrics: { peRatio: '20.50' } },
      report: { title: 't', recommendation: 'Buy', thesis: 'x', bullets: ['a'] }
    });
    expect(result.verifier.status).toBe('fail');
    expect(result.verifier.issues).toHaveLength(1);
    expect(result.verifier.issues[0].severity).toBe('blocking');
  });

  it('parses Verifier warn status without escalating', async () => {
    const { runAgent } = await import('../../src/services/agentApi');
    const verifierResp =
      '{"status":"warn","issues":[{"severity":"warning","claim":"x","problem":"vague","suggestion":"clarify"}]}';
    global.fetch = vi.fn().mockResolvedValue(okResponse(verifierResp));
    const result = await runAgent('verifier', 'NVDA', () => {}, {
      data: { metrics: {} },
      report: { title: 't', recommendation: 'Hold', thesis: 'x', bullets: [] }
    });
    expect(result.verifier.status).toBe('warn');
    expect(result.verifier.issues[0].severity).toBe('warning');
  });

  it('Verifier non-JSON output → falls back to a warn payload, not a thrown error', async () => {
    const { runAgent } = await import('../../src/services/agentApi');
    global.fetch = vi.fn().mockResolvedValue(okResponse('plain text not JSON'));
    const result = await runAgent('verifier', 'NVDA', () => {}, {
      data: { metrics: {} },
      report: { title: 't' }
    });
    expect(result.verifier.status).toBe('warn');
    expect(result.verifier.issues[0].severity).toBe('warning');
  });

  it('Report with revisionFeedback uses reportRevision prompt (contains previous + issues)', async () => {
    const { runAgent } = await import('../../src/services/agentApi');
    const revisedResp =
      '{"title":"Revised","recommendation":"Hold","thesis":"Fixed numbers from DATA","bullets":["a","b","c","d"]}';
    let capturedPromptText;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      const body = JSON.parse(init.body);
      capturedPromptText = body.contents[0].parts[0].text;
      return Promise.resolve(okResponse(revisedResp));
    });
    const result = await runAgent(
      'report',
      'NVDA',
      () => {},
      { data: { metrics: { peRatio: '20.50' } } },
      undefined,
      {
        revisionFeedback: {
          previousReport: { title: 'Old', recommendation: 'Buy', thesis: 'bad', bullets: ['x'] },
          issues: [
            { severity: 'blocking', claim: 'PE 35', problem: 'Not in Data', suggestion: 'Use 20.50' }
          ]
        }
      }
    );
    expect(capturedPromptText).toContain('You previously generated this investment brief');
    expect(capturedPromptText).toContain('PE 35');
    expect(capturedPromptText).toContain('CRITICAL when fixing issues');
    expect(capturedPromptText).toContain('20.50'); // DATA_METRICS authoritative block
    expect(result.report.title).toBe('Revised');
    expect(result.report.recommendation).toBe('Hold');
  });

  it('Verifier call has google_search tools disabled even when env enables it', async () => {
    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'true');
    let capturedTools;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedTools = JSON.parse(init.body).tools;
      return Promise.resolve(okResponse('{"status":"pass","issues":[]}'));
    });
    const { runAgent } = await import('../../src/services/agentApi');
    await runAgent('verifier', 'NVDA', () => {}, {
      data: { metrics: {} },
      report: { title: 't' }
    });
    expect(capturedTools).toBeUndefined();
  });

  it('Report-revision call has google_search tools disabled', async () => {
    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'true');
    let capturedTools;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedTools = JSON.parse(init.body).tools;
      return Promise.resolve(
        okResponse('{"title":"R","recommendation":"Hold","thesis":"x","bullets":["a","b","c","d"]}')
      );
    });
    const { runAgent } = await import('../../src/services/agentApi');
    await runAgent(
      'report',
      'NVDA',
      () => {},
      { data: { metrics: {} } },
      undefined,
      { revisionFeedback: { previousReport: {}, issues: [] } }
    );
    expect(capturedTools).toBeUndefined();
  });

  it('Normal Report call still respects env grounding (sanity)', async () => {
    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'true');
    let capturedTools;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedTools = JSON.parse(init.body).tools;
      return Promise.resolve(
        okResponse('{"title":"R","recommendation":"Hold","thesis":"x","bullets":["a","b","c","d"]}')
      );
    });
    const { runAgent } = await import('../../src/services/agentApi');
    await runAgent('report', 'NVDA', () => {}, { data: { metrics: {} } });
    expect(capturedTools).toEqual([{ google_search: {} }]);
  });

  it('Report without revisionFeedback uses normal report prompt (no revision text)', async () => {
    const { runAgent } = await import('../../src/services/agentApi');
    const reportResp = '{"title":"Fresh","recommendation":"Hold","thesis":"...","bullets":["a","b","c","d"]}';
    let capturedPromptText;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedPromptText = JSON.parse(init.body).contents[0].parts[0].text;
      return Promise.resolve(okResponse(reportResp));
    });
    await runAgent('report', 'NVDA', () => {}, { data: { metrics: {} } });
    expect(capturedPromptText).not.toContain('You previously generated this investment brief');
    expect(capturedPromptText).toContain('Generate a final investment brief');
  });
});

describe('callGemini', () => {
  const okResponse = (text) => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }]
    })
  });

  const errorResponse = (status, message) => ({
    ok: false,
    status,
    json: async () => ({ error: { message } })
  });

  beforeEach(() => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'test-key');
    vi.stubEnv('VITE_GEMINI_MODEL', 'test-model');
    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'false');
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns parsed JSON on first try', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse('{"a":1}'));
    const result = await callGemini('test prompt');
    expect(result.json).toEqual({ a: 1 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries once on HTTP 500 then succeeds', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(500, 'server error'))
      .mockResolvedValueOnce(okResponse('{"ok":true}'));
    const result = await callGemini('test prompt');
    expect(result.json).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('retries once on HTTP 429 then succeeds', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(errorResponse(429, 'rate limit'))
      .mockResolvedValueOnce(okResponse('{"ok":true}'));
    const result = await callGemini('test prompt');
    expect(result.json).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('does not retry on HTTP 403', async () => {
    global.fetch = vi.fn().mockResolvedValue(errorResponse(403, 'forbidden'));
    await expect(callGemini('test prompt')).rejects.toThrow(/forbidden/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries with hint when first response is unparseable JSON', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(okResponse('no json here at all'))
      .mockResolvedValueOnce(okResponse('{"recovered":true}'));
    const result = await callGemini('test prompt');
    expect(result.json).toEqual({ recovered: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache when JSON parse fails on both attempts', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse('still no json'));
    const result = await callGemini('test prompt');
    expect(result.json).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('caches successful results and serves from cache on second call', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse('{"hit":true}'));
    await callGemini('same prompt');
    await callGemini('same prompt');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('uses different cache keys when useGoogleSearch toggles', async () => {
    global.fetch = vi.fn().mockResolvedValue(okResponse('{"x":1}'));

    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'false');
    await callGemini('same prompt');

    vi.stubEnv('VITE_GEMINI_USE_GOOGLE_SEARCH', 'true');
    await callGemini('same prompt');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('propagates AbortError without retrying', async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return Promise.resolve(okResponse('{"a":1}'));
    });
    await expect(callGemini('test', controller.signal)).rejects.toThrow(/Aborted/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('propagates TimeoutError without retrying (per-attempt timeout fired)', async () => {
    // Simulate the per-attempt timeout firing inside fetch by rejecting with
    // a TimeoutError on the first call and resolving the second. The retry
    // path should NOT activate, so fetch is called exactly once.
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(okResponse('{"recovered":true}'));
    await expect(callGemini('test prompt')).rejects.toThrow(/timed out/);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('attaches a non-aborted signal to each attempt by default', async () => {
    // No caller-supplied signal: the per-attempt timeout signal is still
    // attached (so we can race the request) but must start out non-aborted.
    let capturedSignal;
    global.fetch = vi.fn().mockImplementation((_url, init) => {
      capturedSignal = init.signal;
      return Promise.resolve(okResponse('{"a":1}'));
    });
    await callGemini('test');
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal.aborted).toBe(false);
  });

  it('throws if VITE_GEMINI_API_KEY is missing', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    global.fetch = vi.fn();
    await expect(callGemini('test prompt')).rejects.toThrow(/VITE_GEMINI_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
