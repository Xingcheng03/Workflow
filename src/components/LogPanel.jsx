export const LogPanel = ({ logs }) => (
  <div className="log-panel">
    <div className="panel-heading">
      <h2>Execution Logs</h2>
      <span>{logs.length} entries</span>
    </div>
    <div className="log-list" role="log" aria-live="polite" aria-relevant="additions">
      {logs.length === 0 ? (
        <p className="empty-state">No agent activity yet.</p>
      ) : (
        logs.map((log) => (
          <div className="log-row" key={log.id}>
            <time>{log.time}</time>
            <span>{log.message}</span>
          </div>
        ))
      )}
    </div>
  </div>
);
