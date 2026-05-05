import { describe, expect, it, afterEach, vi } from 'vitest';
import { fireEvent, render, cleanup, screen } from '@testing-library/react';
import { AgentDetailModal } from '../../src/components/AgentDetailModal.jsx';

afterEach(cleanup);

const ohlcBar = (close) => ({ open: close - 1, high: close + 1, low: close - 2, close });
const dataPayload = {
  company: { symbol: 'NVDA', name: 'NVIDIA Corp', sector: 'Tech' },
  metrics: { price: '500.00 USD', change: '+5.00 (+1.00%)', peRatio: '40.50' },
  history: [100, 105, 110, 108, 112, 115],
  trend: [114, 115, 116],
  historyOhlc: [100, 105, 110, 108, 112, 115].map(ohlcBar),
  trendOhlc: [114, 115, 116].map(ohlcBar),
  marketMeta: { source: 'Yahoo', regularMarketPrice: '500.00 USD' }
};

const newsPayload = {
  news: ['First headline', 'Second headline'],
  sentimentScore: 72,
  sources: [{ uri: 'https://example.com', title: 'Example' }]
};

describe('AgentDetailModal — gating', () => {
  it('renders nothing when agentId is null (closed state)', () => {
    const { container } = render(
      <AgentDetailModal agentId={null} results={{}} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when agentId is set', () => {
    render(<AgentDetailModal agentId="data" results={{}} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

describe('AgentDetailModal — close interactions', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<AgentDetailModal agentId="data" results={{}} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close detail'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <AgentDetailModal agentId="data" results={{}} onClose={onClose} />
    );
    const backdrop = container.querySelector('.modal-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does NOT call onClose when content area is clicked (event stopPropagation)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <AgentDetailModal agentId="data" results={{}} onClose={onClose} />
    );
    fireEvent.click(container.querySelector('.modal-content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<AgentDetailModal agentId="data" results={{}} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('AgentDetailModal — Data agent content', () => {
  it('shows empty state when payload is missing', () => {
    render(<AgentDetailModal agentId="data" results={{}} onClose={() => {}} />);
    expect(screen.getByText(/Data Agent hasn't run yet/i)).toBeTruthy();
  });

  it('shows company info, metrics, and trend bars when payload is present', () => {
    render(
      <AgentDetailModal
        agentId="data"
        results={{ data: dataPayload }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText('NVIDIA Corp')).toBeTruthy();
    // Both metrics.price and marketMeta.regularMarketPrice render '500.00 USD',
    // so at least one match is fine.
    expect(screen.getAllByText('500.00 USD').length).toBeGreaterThan(0);
    // Candlestick chart rendered for the 6-month history
    expect(screen.getByLabelText(/6-month daily candlestick chart/i)).toBeTruthy();
  });
});

describe('AgentDetailModal — News agent content', () => {
  it('shows empty state when news has not run', () => {
    render(<AgentDetailModal agentId="news" results={{}} onClose={() => {}} />);
    expect(screen.getByText(/News Agent hasn't run yet/i)).toBeTruthy();
  });

  it('renders headlines and the sentiment score', () => {
    render(
      <AgentDetailModal
        agentId="news"
        results={{ news: newsPayload }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText('First headline')).toBeTruthy();
    expect(screen.getByText('Second headline')).toBeTruthy();
    // SentimentBar renders the clamped score as text
    expect(screen.getByText('72')).toBeTruthy();
    // Source link
    expect(screen.getByText('Example').getAttribute('href')).toBe('https://example.com');
  });
});

describe('AgentDetailModal — Verifier agent content', () => {
  it('renders verdict + issue list when verifier produced output', () => {
    const verifierPayload = {
      status: 'fail',
      issues: [
        { severity: 'blocking', claim: 'PE 35', problem: 'Not in Data', suggestion: 'Use 20.5' }
      ]
    };
    render(
      <AgentDetailModal
        agentId="verifier"
        results={{ verifier: verifierPayload }}
        onClose={() => {}}
      />
    );
    // Verdict chip uses VERIFIER_LABEL → 'Issues found'
    expect(screen.getByText('Issues found')).toBeTruthy();
    // Issue text is concatenated; check for problem string
    expect(screen.getByText(/Not in Data/i)).toBeTruthy();
    expect(screen.getByText(/Use 20\.5/i)).toBeTruthy();
  });
});
