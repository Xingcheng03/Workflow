import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PriceChart } from '../../src/components/PriceChart.jsx';

afterEach(cleanup);

const UP_COLOR = '#1d8f7a';
const DOWN_COLOR = '#c74751';

const bar = (open, high, low, close, extras = {}) => ({ open, high, low, close, ...extras });

// Candle bodies are coloured with the up/down palette; the latest-price
// pill uses LATEST_COLOR. Filter rects by fill so tests stay focused on
// candles.
const candleRects = (container) =>
  Array.from(container.querySelectorAll('rect')).filter((r) =>
    [UP_COLOR, DOWN_COLOR].includes(r.getAttribute('fill'))
  );

describe('PriceChart', () => {
  it('renders nothing when bars is empty', () => {
    const { container } = render(<PriceChart bars={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when bars is missing', () => {
    const { container } = render(<PriceChart bars={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one candle body per bar', () => {
    const bars = [bar(100, 105, 99, 103), bar(103, 108, 102, 107)];
    const { container } = render(<PriceChart bars={bars} />);
    expect(candleRects(container).length).toBe(2);
  });

  it('colors up-bars green and down-bars red', () => {
    const bars = [
      bar(100, 105, 99, 110), // up: close > open
      bar(110, 112, 100, 102) // down: close < open
    ];
    const { container } = render(<PriceChart bars={bars} />);
    const rects = candleRects(container);
    expect(rects[0].getAttribute('fill')).toBe(UP_COLOR);
    expect(rects[1].getAttribute('fill')).toBe(DOWN_COLOR);
  });

  it('treats doji (open === close) as up — body still renders with at least 1px height', () => {
    const bars = [bar(100, 102, 98, 100)];
    const { container } = render(<PriceChart bars={bars} />);
    const rect = candleRects(container)[0];
    expect(rect.getAttribute('fill')).toBe(UP_COLOR);
    expect(Number(rect.getAttribute('height'))).toBeGreaterThanOrEqual(1);
  });

  it('exposes the bar count and an aria-label for screen readers', () => {
    const bars = [bar(1, 2, 0, 1.5), bar(1.5, 3, 1, 2)];
    const { container } = render(<PriceChart bars={bars} ariaLabel="Custom label" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-label')).toBe('Custom label');
    // The "N bars" annotation in the top-right corner
    expect(svg.textContent).toContain('2 bars');
  });

  it('y-axis labels show min, mid, and max prices to 2 decimals', () => {
    const bars = [bar(100, 110, 90, 105), bar(105, 130, 95, 120)];
    const { container } = render(<PriceChart bars={bars} />);
    const labels = Array.from(container.querySelectorAll('text'))
      .map((t) => t.textContent)
      .filter((t) => /^\d+\.\d{2}$/.test(t));
    expect(labels.length).toBeGreaterThanOrEqual(3);
  });

  it('shows the latest close price as a marker label', () => {
    const bars = [bar(100, 105, 99, 103), bar(103, 108, 102, 107.50)];
    const { container } = render(<PriceChart bars={bars} />);
    const texts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
    // Latest close 107.50 is rendered as the marker label.
    expect(texts).toContain('107.50');
  });

  describe('volume sub-chart', () => {
    it('does not render a volume pane when no bar has volume', () => {
      const bars = [bar(100, 105, 99, 103), bar(103, 108, 102, 107)];
      const { container } = render(<PriceChart bars={bars} />);
      expect(container.querySelector('text')?.textContent).not.toContain('VOL');
      const allTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
      expect(allTexts).not.toContain('VOL');
    });

    it('renders a volume pane (with VOL label and per-bar rects) when volumes are present', () => {
      const bars = [
        bar(100, 105, 99, 103, { volume: 1_000_000 }),
        bar(103, 108, 102, 107, { volume: 2_000_000 })
      ];
      const { container } = render(<PriceChart bars={bars} />);
      const allTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
      expect(allTexts).toContain('VOL');
      // Volume max formatted as compact units: 2,000,000 → "2.0M"
      expect(allTexts).toContain('2.0M');
    });

    it('skips the volume pane when every volume is null/zero (mock fixtures)', () => {
      const bars = [
        bar(100, 105, 99, 103, { volume: null }),
        bar(103, 108, 102, 107, { volume: 0 })
      ];
      const { container } = render(<PriceChart bars={bars} />);
      const allTexts = Array.from(container.querySelectorAll('text')).map((t) => t.textContent);
      expect(allTexts).not.toContain('VOL');
    });
  });

  describe('date tick labels', () => {
    it('formats x-axis ticks as month-day when the series spans multiple days', () => {
      const dayMs = 24 * 3600;
      const baseTs = Math.floor(new Date('2024-11-01T00:00:00Z').getTime() / 1000);
      const bars = [
        bar(100, 105, 99, 103, { timestamp: baseTs }),
        bar(103, 108, 102, 107, { timestamp: baseTs + 30 * dayMs }),
        bar(107, 110, 105, 109, { timestamp: baseTs + 60 * dayMs })
      ];
      const { container } = render(<PriceChart bars={bars} />);
      // Tick labels live in the bottom strip (y ≈ height - 6). Filter by y
      // attribute so we don't entangle with price/VOL/bars labels.
      const tickTexts = Array.from(container.querySelectorAll('text'))
        .filter((t) => Math.abs(Number(t.getAttribute('y')) - (240 - 6)) < 2)
        .map((t) => t.textContent);
      expect(tickTexts.length).toBe(3);
      // Each label should contain a digit (the day number).
      tickTexts.forEach((text) => expect(text).toMatch(/\d/));
    });

    it('renders 3 x-axis ticks (first / mid / last) when bars.length >= 3', () => {
      const ts = (offset) => Math.floor(Date.UTC(2024, 5, 1 + offset, 12) / 1000);
      const bars = Array.from({ length: 5 }, (_, i) =>
        bar(100 + i, 105 + i, 99 + i, 103 + i, { timestamp: ts(i) })
      );
      const { container } = render(<PriceChart bars={bars} />);
      const tickTexts = Array.from(container.querySelectorAll('text'))
        .filter((t) => Math.abs(Number(t.getAttribute('y')) - (240 - 6)) < 2);
      expect(tickTexts.length).toBe(3);
    });

    it('omits tick labels entirely when no bar has a timestamp', () => {
      const bars = [bar(100, 105, 99, 103), bar(103, 108, 102, 107)];
      const { container } = render(<PriceChart bars={bars} />);
      const tickTexts = Array.from(container.querySelectorAll('text'))
        .filter((t) => Math.abs(Number(t.getAttribute('y')) - (240 - 6)) < 2);
      expect(tickTexts.length).toBe(0);
    });
  });
});
