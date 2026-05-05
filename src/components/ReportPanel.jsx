import { memo } from 'react';
import { CheckCircle2, LineChart, Sparkles } from 'lucide-react';
import { Chip } from './Chip.jsx';
import { RECOMMENDATION_CHIP, VERIFIER_CHIP, VERIFIER_LABEL } from '../constants.js';

const VerifierStrip = ({ verifier }) => {
  if (!verifier?.status) return null;
  return (
    <div className={`verifier-strip verifier-${verifier.status}`}>
      <div className="verifier-strip-head">
        <CheckCircle2 size={16} aria-hidden="true" />
        <strong>Verification</strong>
        <Chip
          value={VERIFIER_LABEL[verifier.status] || verifier.status}
          classMap={VERIFIER_CHIP}
          fallback={verifier.status}
        />
      </div>
      {Array.isArray(verifier.issues) && verifier.issues.length > 0 && (
        <ul className="verifier-issues">
          {verifier.issues.map((issue, i) => (
            <li key={i} className={`verifier-issue verifier-${issue.severity || 'warning'}`}>
              <b>{issue.severity === 'blocking' ? '✗' : '⚠'} {issue.problem || 'Issue'}</b>
              {issue.claim && <em> — “{issue.claim}”</em>}
              {issue.suggestion && <span> → {issue.suggestion}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const SourceList = ({ sources }) => {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="source-list">
      <strong>Sources</strong>
      {sources.map((source) => (
        <a href={source.uri} key={source.uri} target="_blank" rel="noopener noreferrer">
          {source.title}
        </a>
      ))}
    </div>
  );
};

const StandbyReport = ({ company, marketMeta }) => (
  <article className="report standby">
    <div className="report-title">
      <LineChart size={20} aria-hidden="true" />
      <div>
        <h3>{company.name}</h3>
        <Chip value={company.recommendation} classMap={RECOMMENDATION_CHIP} />
      </div>
    </div>
    <p>{company.thesis}</p>
    {marketMeta && (
      <ul>
        <li>Source: {marketMeta.source}</li>
        <li>Regular close: {marketMeta.regularMarketPrice}</li>
        <li>Day range: {marketMeta.regularMarketDayLow} to {marketMeta.regularMarketDayHigh}</li>
        <li>52 week range: {marketMeta.fiftyTwoWeekLow} to {marketMeta.fiftyTwoWeekHigh}</li>
      </ul>
    )}
  </article>
);

export const ReportPanel = memo(({ report, verifier, allSources, company, marketMeta }) => (
  <div className="report-panel">
    <div className="panel-heading">
      <h2>Agent Report</h2>
      <span>{report?.title ? 'Generated' : 'Draft pending'}</span>
    </div>
    {report?.title ? (
      <article className="report">
        <div className="report-title">
          <Sparkles size={20} aria-hidden="true" />
          <div>
            <h3>{report.title}</h3>
            <Chip value={report.recommendation} classMap={RECOMMENDATION_CHIP} />
          </div>
        </div>
        <p>{report.thesis}</p>
        <ul>
          {(report.bullets || []).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
        <VerifierStrip verifier={verifier} />
        <SourceList sources={allSources} />
      </article>
    ) : (
      <StandbyReport company={company} marketMeta={marketMeta} />
    )}
  </div>
));
