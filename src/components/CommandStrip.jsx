import { Play, RefreshCw, Search, X } from 'lucide-react';

export const CommandStrip = ({
  symbol,
  setSymbol,
  isRunning,
  onRun,
  onCancelOrReset,
  knownSymbol,
  companyName,
  companySector
}) => (
  <section className="command-strip" aria-label="Stock command center">
    <label className="symbol-field">
      <span>Ticker</span>
      <div className="input-wrap">
        <Search size={18} aria-hidden="true" />
        <input
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !isRunning) onRun();
          }}
          placeholder="AAPL, TSLA, NVDA"
          maxLength={8}
          aria-label="Stock ticker (press Enter to run full analysis)"
        />
      </div>
    </label>
    <div className="company-snapshot">
      <span>{knownSymbol}</span>
      <strong>{companyName}</strong>
      <small>{companySector}</small>
    </div>
    <div className="command-actions">
      <button
        className="primary-btn"
        onClick={onRun}
        disabled={isRunning}
        title="Run all agents"
      >
        <Play size={18} aria-hidden="true" />
        Run Full Analysis
      </button>
      <button
        className="icon-btn"
        onClick={onCancelOrReset}
        title={isRunning ? 'Cancel workflow' : 'Reset dashboard'}
        aria-label={isRunning ? 'Cancel workflow' : 'Reset dashboard'}
      >
        {isRunning
          ? <X size={18} aria-hidden="true" />
          : <RefreshCw size={18} aria-hidden="true" />}
      </button>
    </div>
  </section>
);
