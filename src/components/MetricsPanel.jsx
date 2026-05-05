import { Chip } from './Chip.jsx';
import { SentimentBar } from './SentimentBar.jsx';
import { METRIC_ITEMS, RECOMMENDATION_CHIP } from '../constants.js';

export const MetricsPanel = ({ recommendation, metrics, sentimentScore }) => (
  <div className="metrics-panel">
    <div className="panel-heading">
      <h2>Financial Metrics</h2>
      <Chip value={recommendation} classMap={RECOMMENDATION_CHIP} />
    </div>
    <div className="metric-grid">
      {METRIC_ITEMS.map(([key, label]) => (
        <div className="metric-card" key={key}>
          <span>{label}</span>
          <strong>{metrics?.[key] ?? '--'}</strong>
        </div>
      ))}
      <div className="metric-card sentiment">
        <span>Sentiment</span>
        <SentimentBar score={sentimentScore} />
      </div>
    </div>
  </div>
);
