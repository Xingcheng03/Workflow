import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { Chip } from '../../src/components/Chip.jsx';

afterEach(cleanup);

const map = { Buy: 'chip-buy', Hold: 'chip-hold' };

describe('Chip', () => {
  it('uses the mapped class for a known value', () => {
    render(<Chip value="Buy" classMap={map} />);
    const el = screen.getByText('Buy');
    expect(el.className).toContain('chip-buy');
  });

  it('falls back to chip-neutral for an unmapped value', () => {
    render(<Chip value="Unknown" classMap={map} />);
    expect(screen.getByText('Unknown').className).toContain('chip-neutral');
  });

  it('renders the default fallback text when value is empty', () => {
    render(<Chip value="" classMap={map} />);
    expect(screen.getByText('Not rated')).toBeTruthy();
  });

  it('respects a custom fallback', () => {
    render(<Chip value={null} classMap={map} fallback="—" />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
