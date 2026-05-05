import { Chip } from './Chip.jsx';
import { RISK_CHIP } from '../constants.js';

export const FindingsPanel = ({ news, analysis, risk }) => {
  const newsHeadlines = news?.news || [];
  const riskRisks = risk?.risks || [];
  const riskOpportunities = risk?.opportunities || [];
  const hasAnything = news || analysis || risk;
  const analysisHasContent =
    analysis &&
    (analysis.valuation || analysis.growthView || analysis.marginView || analysis.analysisSummary);

  return (
    <div className="findings-panel">
      <div className="panel-heading">
        <h2>Agent Findings</h2>
        <span>{hasAnything ? 'Live' : 'Pending'}</span>
      </div>
      <div className="findings-body">
        {newsHeadlines.length > 0 && (
          <section className="finding-block news">
            <h3>Recent News</h3>
            <ul>
              {newsHeadlines.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>
        )}

        {analysisHasContent && (
          <section className="finding-block analysis">
            <h3>Analysis</h3>
            <ul className="kv">
              {analysis.valuation && <li><b>Valuation:</b> {analysis.valuation}</li>}
              {analysis.growthView && <li><b>Growth:</b> {analysis.growthView}</li>}
              {analysis.marginView && <li><b>Margins:</b> {analysis.marginView}</li>}
              {analysis.trendView && <li><b>Trend:</b> {analysis.trendView}</li>}
            </ul>
            {analysis.analysisSummary && <p>{analysis.analysisSummary}</p>}
          </section>
        )}

        {risk?.riskLevel && (
          <section className="finding-block risk">
            <h3>
              Risks &amp; Opportunities{' '}
              <Chip value={risk.riskLevel} classMap={RISK_CHIP} fallback="" />
            </h3>
            <div className="risk-cols">
              <div>
                <strong>Risks</strong>
                <ul>
                  {riskRisks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
              <div>
                <strong>Opportunities</strong>
                <ul>
                  {riskOpportunities.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
            </div>
          </section>
        )}

        {!hasAnything && (
          <p className="empty-state">News, Analysis, and Risk findings appear here as agents complete.</p>
        )}
      </div>
    </div>
  );
};
