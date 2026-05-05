import { memo } from 'react';

// Sentiment 0-100 visualisation. Coerces score to a finite number; renders
// `--` when input is missing/invalid so we never produce `width: NaN%`.
export const SentimentBar = memo(({ score }) => {
  const numeric = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(numeric)) return <strong>--</strong>;
  const clamped = Math.max(0, Math.min(100, numeric));
  const tone = clamped >= 65 ? 'pos' : clamped >= 35 ? 'neu' : 'neg';
  return (
    <div className="sentiment-row" aria-label={`Sentiment ${clamped} out of 100`}>
      <div className="sentiment-bar">
        <div className={`sentiment-fill sentiment-${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <strong>{clamped}</strong>
    </div>
  );
});
