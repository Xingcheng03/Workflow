import { memo, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Chip } from './Chip.jsx';
import { SentimentBar } from './SentimentBar.jsx';
import { PriceChart } from './PriceChart.jsx';
import { agentDefinitions } from '../services/agentApi';
import {
  AGENT_ICONS,
  RECOMMENDATION_CHIP,
  RISK_CHIP,
  VERIFIER_CHIP,
  VERIFIER_LABEL
} from '../constants.js';

const agentById = (id) => agentDefinitions.find((a) => a.id === id);

// ─── Reusable detail-view primitives ──────────────────────────────────────

const DetailSection = ({ title, children }) => (
  <section className="detail-section">
    <h3>{title}</h3>
    {children}
  </section>
);

const DetailKV = ({ label, value }) => (
  <div className="detail-kv">
    <span>{label}</span>
    <strong>{value ?? '--'}</strong>
  </div>
);

const SourceLinks = ({ sources }) => {
  if (!sources || sources.length === 0) return null;
  return (
    <DetailSection title="Sources">
      <div className="detail-sources">
        {sources.map((s) => (
          <a key={s.uri} href={s.uri} target="_blank" rel="noopener noreferrer">
            {s.title}
          </a>
        ))}
      </div>
    </DetailSection>
  );
};

const EmptyState = ({ text }) => (
  <p className="empty-state detail-empty">{text}</p>
);

// ─── Per-agent detail renderers ───────────────────────────────────────────

const DataDetail = ({ payload }) => {
  if (!payload) {
    return <EmptyState text="The Data Agent hasn't run yet. Click Run Full Analysis to fetch live market data." />;
  }
  const {
    company = {},
    metrics = {},
    historyOhlc = [],
    trendOhlc = [],
    marketMeta = {}
  } = payload;

  // Filter out undefined values so the metrics grid stays clean.
  const metricEntries = Object.entries(metrics).filter(([, v]) => v !== undefined && v !== null);

  return (
    <>
      <DetailSection title="Company">
        <div className="detail-kv-grid">
          <DetailKV label="Symbol" value={company.symbol} />
          <DetailKV label="Name" value={company.name} />
          <DetailKV label="Sector" value={company.sector} />
        </div>
      </DetailSection>

      {historyOhlc.length > 0 && (
        <DetailSection title={`6-Month Daily Candles · ${historyOhlc.length} bars`}>
          <PriceChart bars={historyOhlc} height={220} ariaLabel="6-month daily candlestick chart" />
        </DetailSection>
      )}

      {trendOhlc.length > 0 && (
        <DetailSection title={`Intraday Candles · ${trendOhlc.length} bars`}>
          <PriceChart bars={trendOhlc} height={180} ariaLabel="Intraday candlestick chart" />
        </DetailSection>
      )}

      <DetailSection title="All Metrics">
        <div className="detail-kv-grid">
          {metricEntries.map(([k, v]) => (
            <DetailKV key={k} label={k} value={v} />
          ))}
        </div>
      </DetailSection>

      {marketMeta.source && (
        <DetailSection title="Market Meta">
          <div className="detail-kv-grid">
            {Object.entries(marketMeta).map(([k, v]) => (
              <DetailKV key={k} label={k} value={v} />
            ))}
          </div>
        </DetailSection>
      )}
    </>
  );
};

const NewsDetail = ({ payload }) => {
  if (!payload) {
    return <EmptyState text="The News Agent hasn't run yet. Run Full Analysis to fetch headlines." />;
  }
  return (
    <>
      <DetailSection title="Sentiment">
        <SentimentBar score={payload.sentimentScore} />
      </DetailSection>
      <DetailSection title="Headlines">
        {payload.news?.length > 0 ? (
          <ul className="detail-list">
            {payload.news.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        ) : (
          <EmptyState text="No headlines returned." />
        )}
      </DetailSection>
      <SourceLinks sources={payload.sources} />
    </>
  );
};

const AnalysisDetail = ({ payload }) => {
  if (!payload) {
    return <EmptyState text="The Analysis Agent hasn't run yet. Run Full Analysis to populate." />;
  }
  return (
    <>
      <DetailSection title="Views">
        <div className="detail-kv-grid">
          <DetailKV label="Valuation" value={payload.valuation} />
          <DetailKV label="Growth" value={payload.growthView} />
          <DetailKV label="Margin" value={payload.marginView} />
          <DetailKV label="Trend" value={payload.trendView} />
        </div>
      </DetailSection>
      {payload.analysisSummary && (
        <DetailSection title="Summary">
          <p>{payload.analysisSummary}</p>
        </DetailSection>
      )}
      <SourceLinks sources={payload.sources} />
    </>
  );
};

const RiskDetail = ({ payload }) => {
  if (!payload) {
    return <EmptyState text="The Risk Agent hasn't run yet. Run Full Analysis to populate." />;
  }
  return (
    <>
      <DetailSection title="Risk Level">
        <Chip value={payload.riskLevel} classMap={RISK_CHIP} fallback="Not rated" />
      </DetailSection>
      {payload.risks?.length > 0 && (
        <DetailSection title="Risks">
          <ul className="detail-list">
            {payload.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </DetailSection>
      )}
      {payload.opportunities?.length > 0 && (
        <DetailSection title="Opportunities">
          <ul className="detail-list">
            {payload.opportunities.map((o, i) => <li key={i}>{o}</li>)}
          </ul>
        </DetailSection>
      )}
      <SourceLinks sources={payload.sources} />
    </>
  );
};

const ReportDetail = ({ payload }) => {
  if (!payload?.title) {
    return <EmptyState text="The Report Agent hasn't produced output yet. Run Full Analysis to generate." />;
  }
  return (
    <>
      <DetailSection title="Brief">
        <h2 className="detail-title">{payload.title}</h2>
        <Chip value={payload.recommendation} classMap={RECOMMENDATION_CHIP} />
      </DetailSection>
      {payload.thesis && (
        <DetailSection title="Thesis">
          <p>{payload.thesis}</p>
        </DetailSection>
      )}
      {payload.bullets?.length > 0 && (
        <DetailSection title="Key Points">
          <ul className="detail-list">
            {payload.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </DetailSection>
      )}
      <SourceLinks sources={payload.sources} />
    </>
  );
};

const VerifierDetail = ({ payload }) => {
  if (!payload?.status) {
    return <EmptyState text="The Verifier Agent hasn't reviewed a report yet. Run Full Analysis through Phase 5." />;
  }
  return (
    <>
      <DetailSection title="Verdict">
        <Chip
          value={VERIFIER_LABEL[payload.status] || payload.status}
          classMap={VERIFIER_CHIP}
          fallback={payload.status}
        />
      </DetailSection>
      {Array.isArray(payload.issues) && payload.issues.length > 0 ? (
        <DetailSection title={`Issues · ${payload.issues.length}`}>
          <ul className="detail-list verifier-issue-list">
            {payload.issues.map((issue, i) => (
              <li key={i} className={`verifier-issue verifier-${issue.severity || 'warning'}`}>
                <b>{issue.severity === 'blocking' ? '✗' : '⚠'} {issue.problem || 'Issue'}</b>
                {issue.claim && <em> — “{issue.claim}”</em>}
                {issue.suggestion && <span> → {issue.suggestion}</span>}
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : (
        <p className="empty-state">No issues flagged.</p>
      )}
      <SourceLinks sources={payload.sources} />
    </>
  );
};

const DETAIL_COMPONENTS = {
  data: DataDetail,
  news: NewsDetail,
  analysis: AnalysisDetail,
  risk: RiskDetail,
  report: ReportDetail,
  verifier: VerifierDetail
};

// ─── Modal shell ──────────────────────────────────────────────────────────

export const AgentDetailModal = memo(({ agentId, results, onClose }) => {
  const closeBtnRef = useRef(null);

  // Close on Esc; focus the close button on open for keyboard users.
  useEffect(() => {
    if (!agentId) return;
    closeBtnRef.current?.focus();
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [agentId, onClose]);

  if (!agentId) return null;

  const agent = agentById(agentId);
  const Icon = AGENT_ICONS[agentId];
  const Detail = DETAIL_COMPONENTS[agentId];
  const payload = results?.[agentId];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`agent-modal-title-${agentId}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header" style={{ '--agent-accent': agent.accent }}>
          <span className="modal-icon">
            <Icon size={20} aria-hidden="true" />
          </span>
          <div className="modal-title-block">
            <h2 id={`agent-modal-title-${agentId}`}>{agent.label}</h2>
            <small>{agent.purpose}</small>
          </div>
          <button
            ref={closeBtnRef}
            className="icon-btn"
            onClick={onClose}
            aria-label="Close detail"
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          <Detail payload={payload} />
        </div>
      </div>
    </div>
  );
});
