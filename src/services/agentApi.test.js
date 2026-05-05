import { describe, expect, it } from 'vitest';
import {
  agentDefinitions,
  cleanJsonText,
  createCompanyShell,
  parseJson,
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
});
