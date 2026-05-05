import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentDefinitions,
  callGemini,
  cleanJsonText,
  createCompanyShell,
  extractFirstObject,
  parseJson,
  summarizeContext,
  validateSymbol
} from './agentApi';

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
  it('exports five agents in workflow order', () => {
    expect(agentDefinitions.map((a) => a.id)).toEqual(['data', 'news', 'analysis', 'risk', 'report']);
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

  it('throws if VITE_GEMINI_API_KEY is missing', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    global.fetch = vi.fn();
    await expect(callGemini('test prompt')).rejects.toThrow(/VITE_GEMINI_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
