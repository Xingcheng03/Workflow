import { describe, expect, it } from 'vitest';
import { compactTrend, formatChange, formatCurrency } from './marketData';

describe('formatCurrency', () => {
  it('formats finite numbers with two decimals', () => {
    expect(formatCurrency(123.456, 'USD')).toBe('123.46 USD');
  });

  it('defaults to USD when currency missing', () => {
    expect(formatCurrency(10)).toBe('10.00 USD');
  });

  it('returns "not verified" for non-finite values', () => {
    expect(formatCurrency(NaN)).toBe('not verified');
    expect(formatCurrency(Infinity)).toBe('not verified');
    expect(formatCurrency(undefined)).toBe('not verified');
    expect(formatCurrency(null)).toBe('not verified');
  });
});

describe('formatChange', () => {
  it('formats a positive change with + sign', () => {
    expect(formatChange(110, 100)).toBe('+10.00 (+10.00%)');
  });

  it('formats a negative change without extra sign', () => {
    expect(formatChange(90, 100)).toBe('-10.00 (-10.00%)');
  });

  it('handles a zero reference price without dividing by zero', () => {
    expect(formatChange(50, 0)).toBe('+50.00 (+0.00%)');
  });

  it('returns "not verified" when either input is non-finite', () => {
    expect(formatChange(NaN, 100)).toBe('not verified');
    expect(formatChange(100, undefined)).toBe('not verified');
  });
});

describe('compactTrend', () => {
  it('returns the input untouched when below max points', () => {
    expect(compactTrend([1, 2, 3], 7)).toEqual([1, 2, 3]);
  });

  it('downsamples to exactly maxPoints when input is larger', () => {
    const input = Array.from({ length: 28 }, (_, i) => i);
    const result = compactTrend(input, 7);
    expect(result).toHaveLength(7);
    expect(result[0]).toBe(0);
    expect(result[6]).toBe(27);
  });

  it('drops non-finite values before downsampling', () => {
    const input = [1, NaN, 2, Infinity, 3, undefined, 4];
    expect(compactTrend(input, 7)).toEqual([1, 2, 3, 4]);
  });
});
