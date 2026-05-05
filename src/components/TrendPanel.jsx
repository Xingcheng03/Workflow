import { memo } from 'react';
import { PriceChart } from './PriceChart.jsx';

const isReal = (v) => v && v !== 'not provided' && v !== 'not verified';

export const TrendPanel = memo(({ ohlc, label, metrics, marketMeta }) => {
  const count = ohlc?.length ?? 0;
  const hasReturnStat = isReal(metrics?.returnSixMonth);
  const fiftyTwoLow = marketMeta?.fiftyTwoWeekLow;
  const fiftyTwoHigh = marketMeta?.fiftyTwoWeekHigh;
  const dayLow = marketMeta?.regularMarketDayLow;
  const dayHigh = marketMeta?.regularMarketDayHigh;
  const volume = marketMeta?.volume;
  const has52w = isReal(fiftyTwoLow) && isReal(fiftyTwoHigh);
  const hasDay = isReal(dayLow) && isReal(dayHigh);

  return (
    <div className="trend-panel">
      <div className="panel-heading">
        <h2>Price Trend</h2>
        <span>{count ? `${label} · ${count} bars` : 'Live chart'}</span>
      </div>
      <ul className="trend-stats">
        {hasReturnStat && (
          <>
            <li><b>6mo:</b> {metrics.returnSixMonth}</li>
            <li><b>1mo:</b> {metrics.returnOneMonth}</li>
            <li><b>From high:</b> {metrics.drawdownFromHigh}</li>
          </>
        )}
        {has52w && <li><b>52w range:</b> {fiftyTwoLow} – {fiftyTwoHigh}</li>}
        {hasDay && <li><b>Day range:</b> {dayLow} – {dayHigh}</li>}
        {isReal(volume) && <li><b>Volume:</b> {volume}</li>}
      </ul>
      <div className="trend-chart-host">
        {count ? (
          <PriceChart bars={ohlc} height={260} ariaLabel={`${label} candlesticks, ${count} bars`} />
        ) : (
          <p className="empty-state">Run Full Analysis to load price history.</p>
        )}
      </div>
    </div>
  );
});
