export const TrendPanel = ({ timeline, timelineLabel, metrics }) => {
  const hasReturnStat =
    metrics?.returnSixMonth && metrics.returnSixMonth !== 'not provided';

  return (
    <div className="trend-panel">
      <div className="panel-heading">
        <h2>Price Trend</h2>
        <span>{timeline.length ? `${timelineLabel} · ${timeline.length} points` : 'Live chart'}</span>
      </div>
      {hasReturnStat && (
        <ul className="trend-stats">
          <li><b>6mo return:</b> {metrics.returnSixMonth}</li>
          <li><b>1mo return:</b> {metrics.returnOneMonth}</li>
          <li><b>From high:</b> {metrics.drawdownFromHigh}</li>
        </ul>
      )}
      <div className="trend-bars" role="img" aria-label={`${timeline.length}-point price trend`}>
        {timeline.length ? (() => {
          const min = Math.min(...timeline);
          const max = Math.max(...timeline);
          const range = Math.max(max - min, 1);
          return timeline.map((value, index) => {
            const height = 34 + ((value - min) / range) * 92;
            return (
              <div className="bar-wrap" key={index}>
                <div className="bar" style={{ height }} />
                <span>{index === 0 ? 'older' : index === timeline.length - 1 ? 'newer' : ''}</span>
              </div>
            );
          });
        })() : (
          <p className="empty-state">Run Data or Analysis Agent.</p>
        )}
      </div>
    </div>
  );
};
