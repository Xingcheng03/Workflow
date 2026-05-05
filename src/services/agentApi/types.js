// JSDoc type definitions for the agent payload shapes that flow through
// `runAgent` → `useAgentWorkflow` → React panels.
//
// This file exports nothing at runtime — it exists purely so editors and
// `// @ts-check`-enabled consumers can resolve `@typedef`s by name. Import
// the typedefs in another file via:
//
//   /** @typedef {import('./types.js').WorkflowResults} WorkflowResults */
//
// or rely on ambient pickup if your editor scans the project.

/**
 * Identifier for one of the six agents. Matches `agentDefinitions[].id`.
 * @typedef {'data' | 'news' | 'analysis' | 'risk' | 'report' | 'verifier'} AgentId
 */

/**
 * Verdict status emitted by the Verifier agent.
 * @typedef {'pass' | 'warn' | 'fail'} VerifierStatus
 */

/**
 * @typedef {Object} GroundingSource
 * @property {string} uri
 * @property {string} title
 */

// ── Per-agent payload shapes (all flat strings; numerics are pre-formatted) ──

/**
 * @typedef {Object} CompanySnapshot
 * @property {string} symbol
 * @property {string} name
 * @property {string} sector
 * @property {string} recommendation       e.g. "Buy", "Hold", "Not rated"
 * @property {string} thesis
 */

/**
 * Pre-formatted display strings for the metrics card grid. Missing values are
 * rendered as `'not provided'` or `'not verified'` rather than dropping out.
 * @typedef {Object<string, string>} DataMetrics
 */

/**
 * @typedef {Object} MarketMeta
 * @property {string} source
 * @property {string} regularMarketPrice
 * @property {string} regularMarketDayLow
 * @property {string} regularMarketDayHigh
 * @property {string} fiftyTwoWeekLow
 * @property {string} fiftyTwoWeekHigh
 * @property {string} volume
 */

/**
 * Output of the Data agent (Yahoo-sourced; never goes through Gemini).
 * @typedef {Object} DataPayload
 * @property {CompanySnapshot} company
 * @property {DataMetrics} metrics
 * @property {number[]} trend         compacted intraday closes
 * @property {number[]} history       compacted 6-month daily closes
 * @property {MarketMeta} marketMeta
 */

/**
 * @typedef {Object} NewsPayload
 * @property {string[]} news
 * @property {number} sentimentScore                 0-100
 * @property {GroundingSource[]} [sources]
 * @property {string} [rawText]                      present only when JSON parse failed
 */

/**
 * @typedef {Object} AnalysisPayload
 * @property {string} valuation
 * @property {string} growthView
 * @property {string} marginView
 * @property {string} trendView
 * @property {string} analysisSummary
 * @property {GroundingSource[]} [sources]
 * @property {string} [rawText]
 */

/**
 * @typedef {Object} RiskPayload
 * @property {'Low' | 'Moderate' | 'Elevated' | 'High'} riskLevel
 * @property {string[]} risks
 * @property {string[]} opportunities
 * @property {GroundingSource[]} [sources]
 * @property {string} [rawText]
 */

/**
 * @typedef {Object} ReportPayload
 * @property {string} title
 * @property {'Buy' | 'Hold' | 'Watch' | 'Avoid' | 'Not rated'} recommendation
 * @property {string} thesis
 * @property {string[]} bullets
 * @property {GroundingSource[]} [sources]
 * @property {string} [rawText]
 */

/**
 * @typedef {Object} VerifierIssue
 * @property {'blocking' | 'warning'} severity
 * @property {string} [claim]
 * @property {string} [problem]
 * @property {string} [suggestion]
 */

/**
 * @typedef {Object} VerifierPayload
 * @property {VerifierStatus} status
 * @property {VerifierIssue[]} issues
 * @property {GroundingSource[]} [sources]
 * @property {string} [rawText]
 */

// ── Whole-workflow result shape (state stored in useAgentWorkflow) ──

/**
 * Aggregated workflow state surfaced by `useAgentWorkflow.results`. Every
 * agent slot is optional because agents may fail or be aborted. `lastAgent`
 * and `completedAt` are written by `mergeResult` / `applyOutcome`.
 * @typedef {Object} WorkflowResults
 * @property {DataPayload}     [data]
 * @property {NewsPayload}     [news]
 * @property {AnalysisPayload} [analysis]
 * @property {RiskPayload}     [risk]
 * @property {ReportPayload}   [report]
 * @property {VerifierPayload} [verifier]
 * @property {string}          [completedAt]   shortTime() of last successful agent
 * @property {AgentId}         [lastAgent]
 */

/**
 * Per-agent payload as returned by `runAgent`. Always shaped as
 * `{ symbol, [agentId]: <agent-specific payload> }` so it can be merged
 * straight into `WorkflowResults`.
 * @typedef {Object} RunAgentResult
 * @property {string} symbol
 * @property {DataPayload}     [data]
 * @property {NewsPayload}     [news]
 * @property {AnalysisPayload} [analysis]
 * @property {RiskPayload}     [risk]
 * @property {ReportPayload}   [report]
 * @property {VerifierPayload} [verifier]
 */

/**
 * Options for `runAgent`. `revisionFeedback` switches Report into "fix the
 * v1 issues" mode (and forces `disableGrounding: true` on the Gemini call).
 * @typedef {Object} RunAgentOptions
 * @property {{ previousReport: ReportPayload, issues: VerifierIssue[] }} [revisionFeedback]
 */

/**
 * One log line in the dashboard's execution log feed.
 * @typedef {Object} LogEntry
 * @property {number} id
 * @property {string} time           local hh:mm:ss
 * @property {string} message
 */

/**
 * Phase label exposed by `useAgentWorkflow.workflowPhase` so the status pill
 * can show "Verifying report" / "Revising report (1 of 1)" / "Verifying
 * revised report" instead of an indistinguishable "Running Verifier Agent".
 * @typedef {'verify-v1' | 'revise' | 'verify-v2' | null} WorkflowPhase
 */

// Empty export so this file is treated as a module.
export {};
