import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { SentimentBar } from '../../src/components/SentimentBar.jsx';

afterEach(cleanup);

describe('SentimentBar', () => {
  it('renders -- when score is missing', () => {
    render(<SentimentBar />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('renders -- when score is non-numeric', () => {
    render(<SentimentBar score="high" />);
    expect(screen.getByText('--')).toBeTruthy();
  });

  it('clamps a numeric score to [0,100] and renders the integer', () => {
    render(<SentimentBar score={150} />);
    expect(screen.getByText('100')).toBeTruthy();
  });

  it('coerces a numeric string', () => {
    render(<SentimentBar score="72" />);
    expect(screen.getByText('72')).toBeTruthy();
  });

  it('uses positive tone class for a high score', () => {
    const { container } = render(<SentimentBar score={80} />);
    const fill = container.querySelector('.sentiment-fill');
    expect(fill?.className).toContain('sentiment-pos');
  });

  it('uses negative tone class for a low score', () => {
    const { container } = render(<SentimentBar score={10} />);
    const fill = container.querySelector('.sentiment-fill');
    expect(fill?.className).toContain('sentiment-neg');
  });
});
