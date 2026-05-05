import { afterEach, describe, expect, it } from 'vitest';
import { cacheGet, cacheKey, cacheSet, hashString } from './cache';

afterEach(() => {
  sessionStorage.clear();
});

describe('cacheKey', () => {
  it('joins parts with colons under finagent prefix', () => {
    expect(cacheKey('gemini', 'model-a', 'g', 'abc')).toBe('finagent:gemini:model-a:g:abc');
  });

  it('handles a single part', () => {
    expect(cacheKey('market', 'NVDA')).toBe('finagent:market:NVDA');
  });
});

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashString('foo')).not.toBe(hashString('bar'));
  });

  it('returns a base36 string', () => {
    expect(hashString('anything')).toMatch(/^[0-9a-z]+$/);
  });
});

describe('cacheGet / cacheSet', () => {
  it('round-trips an object value', () => {
    cacheSet('finagent:test:a', { hello: 'world', n: 42 });
    expect(cacheGet('finagent:test:a', 60_000)).toEqual({ hello: 'world', n: 42 });
  });

  it('returns null for a missing key', () => {
    expect(cacheGet('finagent:test:missing', 60_000)).toBeNull();
  });

  it('returns null and clears expired entries', () => {
    sessionStorage.setItem('finagent:test:stale', JSON.stringify({ ts: 1000, value: 'old' }));
    expect(cacheGet('finagent:test:stale', 1)).toBeNull();
    expect(sessionStorage.getItem('finagent:test:stale')).toBeNull();
  });

  it('returns null for corrupted JSON', () => {
    sessionStorage.setItem('finagent:test:bad', 'not-json');
    expect(cacheGet('finagent:test:bad', 60_000)).toBeNull();
  });
});
