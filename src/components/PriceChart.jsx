import { memo } from 'react';

// Pure SVG candlestick + volume chart. No external charting library — keeps
// the bundle lean and lets us style cleanly with the rest of the dashboard.
//
// Layout (when bars carry volume):
//   ┌──────────────────────────────┐
//   │ price grid + candles  ~70%   │
//   ├──────────────────────────────┤
//   │ volume bars           ~20%   │
//   ├──────────────────────────────┤
//   │ first / mid / last date tick │
//   └──────────────────────────────┘
//
// Volume pane is omitted automatically when no bar has finite volume — for
// older mock fixtures or when Yahoo doesn't include the field.

const UP_COLOR = '#1d8f7a';
const DOWN_COLOR = '#c74751';
const AXIS_COLOR = '#c8bfae';
const GRID_COLOR = '#ecdfd0';
const LABEL_COLOR = '#6e675d';
const LATEST_COLOR = '#5567d9';
const VOLUME_OPACITY = 0.55;

const PAD_TOP = 8;
const PAD_LEFT = 56;
const PAD_RIGHT = 64;     // Wider than left so the latest-price label fits.
const X_AXIS_H = 22;      // Bottom strip for date labels.
const PANE_GAP = 6;       // Gap between price and volume panes.

const formatPrice = (n) => (Number.isFinite(n) ? n.toFixed(2) : '');

// Compact volume formatter: 12_345_678 → "12.3M". Yahoo can return raw share
// counts in the billions for big-cap tickers, so we go up to T just in case.
const formatVolume = (n) => {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};

// Tick label for the x-axis. Detect whether the series spans a single calendar
// day — if so, show times (HH:MM) since the date is meaningless; otherwise
// show "Mon DD".
const buildDateFormatter = (bars) => {
  const withTs = bars.filter((b) => Number.isFinite(b.timestamp));
  if (withTs.length === 0) return null;
  const first = new Date(withTs[0].timestamp * 1000);
  const last = new Date(withTs[withTs.length - 1].timestamp * 1000);
  const sameDay =
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth() &&
    first.getDate() === last.getDate();
  return (ts) => {
    if (!Number.isFinite(ts)) return '';
    const d = new Date(ts * 1000);
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
};

export const PriceChart = memo(({
  bars,
  height = 240,
  width = 600,
  ariaLabel = 'Price candlestick chart'
}) => {
  if (!Array.isArray(bars) || bars.length === 0) return null;

  const showVolume = bars.some((b) => Number.isFinite(b.volume) && b.volume > 0);

  // Vertical layout split between price pane and (optional) volume pane.
  const innerW = width - PAD_LEFT - PAD_RIGHT;
  const totalUsable = height - PAD_TOP - X_AXIS_H;
  const volumeH = showVolume ? Math.max(36, totalUsable * 0.22) : 0;
  const priceH = totalUsable - (showVolume ? volumeH + PANE_GAP : 0);
  const priceTop = PAD_TOP;
  const priceBottom = priceTop + priceH;
  const volumeTop = priceBottom + PANE_GAP;
  const volumeBottom = volumeTop + volumeH;

  // Price scale spans all wicks — high-of-highs to low-of-lows. 5% headroom
  // keeps wicks from kissing the chart edge.
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = Math.max(max - min, max * 0.001 || 0.01);
  const padded = range * 1.05;
  const yMid = (max + min) / 2;
  const yTop = yMid + padded / 2;
  const yBot = yMid - padded / 2;
  const priceToY = (price) => {
    const t = (yTop - price) / (yTop - yBot);
    return priceTop + t * priceH;
  };

  // Volume scale — independent of price.
  const volMax = showVolume
    ? Math.max(...bars.map((b) => (Number.isFinite(b.volume) ? b.volume : 0)))
    : 0;
  const volumeToY = (v) => {
    if (!Number.isFinite(v) || volMax === 0) return volumeBottom;
    return volumeBottom - (v / volMax) * volumeH;
  };

  const stepX = innerW / bars.length;
  const bodyW = Math.min(stepX * 0.65, 14);

  // Three horizontal grid lines (max / mid / min).
  const gridPrices = [yTop, (yTop + yBot) / 2, yBot];

  // Latest-close marker — dashed line + label in the right gutter.
  const latestClose = bars[bars.length - 1].close;
  const latestY = priceToY(latestClose);

  // Date tick formatter + which bar indices to label (first / middle / last).
  const fmtDate = buildDateFormatter(bars);
  const tickIndices = bars.length >= 3
    ? [0, Math.floor(bars.length / 2), bars.length - 1]
    : bars.map((_, i) => i);

  const barColor = (b) => (b.close >= b.open ? UP_COLOR : DOWN_COLOR);

  return (
    <svg
      className="price-chart"
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      {/* ── Price grid lines + price-axis labels ── */}
      {gridPrices.map((price) => {
        const y = priceToY(price);
        return (
          <g key={`grid-${price}`}>
            <line
              x1={PAD_LEFT}
              x2={width - PAD_RIGHT}
              y1={y}
              y2={y}
              stroke={GRID_COLOR}
              strokeDasharray="2 4"
            />
            <text
              x={PAD_LEFT - 6}
              y={y}
              fill={LABEL_COLOR}
              fontSize="10"
              fontWeight="600"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatPrice(price)}
            </text>
          </g>
        );
      })}

      {/* Y-axis spine for price pane */}
      <line x1={PAD_LEFT} x2={PAD_LEFT} y1={priceTop} y2={priceBottom} stroke={AXIS_COLOR} />

      {/* ── Candles ── */}
      {bars.map((b, i) => {
        const cx = PAD_LEFT + (i + 0.5) * stepX;
        const yHigh = priceToY(b.high);
        const yLow = priceToY(b.low);
        const yOpen = priceToY(b.open);
        const yClose = priceToY(b.close);
        const top = Math.min(yOpen, yClose);
        const bodyH = Math.max(Math.abs(yOpen - yClose), 1);
        const color = barColor(b);
        return (
          <g key={`candle-${i}`}>
            <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={color} strokeWidth="1.2" />
            <rect
              x={cx - bodyW / 2}
              y={top}
              width={bodyW}
              height={bodyH}
              fill={color}
              stroke={color}
              strokeWidth="0.5"
            />
          </g>
        );
      })}

      {/* ── Latest-close horizontal reference line + label ── */}
      <line
        x1={PAD_LEFT}
        x2={width - PAD_RIGHT}
        y1={latestY}
        y2={latestY}
        stroke={LATEST_COLOR}
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <rect
        x={width - PAD_RIGHT + 2}
        y={latestY - 8}
        width={PAD_RIGHT - 6}
        height={16}
        rx="3"
        fill={LATEST_COLOR}
      />
      <text
        x={width - PAD_RIGHT + 4 + (PAD_RIGHT - 6) / 2}
        y={latestY}
        fill="white"
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {formatPrice(latestClose)}
      </text>

      {/* ── Volume pane ── */}
      {showVolume && (
        <>
          <line
            x1={PAD_LEFT}
            x2={width - PAD_RIGHT}
            y1={volumeBottom}
            y2={volumeBottom}
            stroke={AXIS_COLOR}
          />
          <text
            x={PAD_LEFT - 6}
            y={volumeTop + 4}
            fill={LABEL_COLOR}
            fontSize="10"
            fontWeight="600"
            textAnchor="end"
            dominantBaseline="hanging"
          >
            {formatVolume(volMax)}
          </text>
          <text
            x={PAD_LEFT - 6}
            y={volumeBottom}
            fill={LABEL_COLOR}
            fontSize="9"
            fontWeight="600"
            textAnchor="end"
            dominantBaseline="alphabetic"
          >
            VOL
          </text>
          {bars.map((b, i) => {
            if (!Number.isFinite(b.volume) || b.volume <= 0) return null;
            const cx = PAD_LEFT + (i + 0.5) * stepX;
            const yTopV = volumeToY(b.volume);
            const h = volumeBottom - yTopV;
            return (
              <rect
                key={`vol-${i}`}
                x={cx - bodyW / 2}
                y={yTopV}
                width={bodyW}
                height={Math.max(h, 1)}
                fill={barColor(b)}
                opacity={VOLUME_OPACITY}
              />
            );
          })}
        </>
      )}

      {/* ── X-axis baseline ── */}
      <line
        x1={PAD_LEFT}
        x2={width - PAD_RIGHT}
        y1={showVolume ? volumeBottom : priceBottom}
        y2={showVolume ? volumeBottom : priceBottom}
        stroke={AXIS_COLOR}
      />

      {/* ── Date tick labels (first / mid / last) ── */}
      {fmtDate &&
        tickIndices.map((idx) => {
          const cx = PAD_LEFT + (idx + 0.5) * stepX;
          const anchor =
            idx === 0 ? 'start' : idx === bars.length - 1 ? 'end' : 'middle';
          return (
            <text
              key={`tick-${idx}`}
              x={cx}
              y={height - 6}
              fill={LABEL_COLOR}
              fontSize="10"
              fontWeight="700"
              textAnchor={anchor}
            >
              {fmtDate(bars[idx].timestamp)}
            </text>
          );
        })}

      {/* Bar count in top-right (above latest-price label area) */}
      <text
        x={width - PAD_RIGHT - 4}
        y={PAD_TOP + 10}
        fill={LABEL_COLOR}
        fontSize="10"
        fontWeight="700"
        textAnchor="end"
      >
        {bars.length} bars
      </text>
    </svg>
  );
});
