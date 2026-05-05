import { Component } from 'react';

// Catches any uncaught render-tree exception below it. Without this, a React
// error in any panel (e.g. a malformed agent payload) blanks the whole UI.
//
// Reset is a hard re-mount of children: clearing `error` state lets React
// re-render the original tree, but if the underlying problem is sticky the
// boundary will simply re-trigger.
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="app-shell">
        <div className="error-panel" role="alert">
          <strong>Something went wrong</strong>
          <span>{error.message || String(error)}</span>
          <button
            type="button"
            className="primary-btn"
            onClick={this.handleReset}
            style={{ marginTop: 12 }}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }
}
