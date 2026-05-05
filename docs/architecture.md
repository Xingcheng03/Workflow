# FinAgent Dashboard — Architecture

A React + Vite SPA with a Vite-middleware backend that proxies Yahoo Finance.
The user types a ticker; six agents run in five phases to produce a verified
investment brief. State is held in a single custom hook (`useAgentWorkflow`).

## Module layout

```
server/
  yahooProxy.js                 dev/preview-only Yahoo proxy with cookie+crumb
                                handling, in-flight dedup, and refreshCrumb mutex

src/
  main.jsx                      React entry; wraps <App> in <ErrorBoundary>
  App.jsx                       layout shell, no business logic
  constants.js                  UI constants (chip class maps, agent icons,
                                metric items, status pill phase labels)
  components/                   one panel per file, each wrapped in React.memo
    Topbar.jsx, CommandStrip.jsx, ErrorBanner.jsx, AgentControls.jsx,
    WorkflowTrack.jsx, MetricsPanel.jsx, FindingsPanel.jsx, TrendPanel.jsx,
    LogPanel.jsx, ReportPanel.jsx, ErrorBoundary.jsx,
    Chip.jsx, SentimentBar.jsx, statusPill.js
  hooks/
    useAgentWorkflow.js         orchestrator: state, phase pipeline,
                                AbortController plumbing, allSources memo
  services/
    cache.js                    sessionStorage cache (90s market, 12min Gemini)
    agentApi/                   barrel re-export
      definitions.js            agent metadata + ticker validation
      parseJson.js              JSON extraction from Gemini text
      geminiClient.js           Gemini HTTP client with retry/cache/timeout
      prompts.js                six prompt templates + summarizeContext
      runner.js                 runAgent dispatcher
      types.js                  JSDoc @typedefs (AgentId, WorkflowResults, ...)
    marketData/                 barrel re-export
      formatters.js             pre-format numbers as flat strings
      yahooParsers.js           Yahoo-response field parsers (analyst, eps, ...)
      index.js                  fetchMarketData orchestrator

tests/
  components/                   atom + helper tests
  hooks/                        useAgentWorkflow integration tests
  services/                     unit tests per module
  server/                       Yahoo proxy dedup + mutex tests
```

## Six agents, five phases

| # | Phase             | Agents                  | Notes                                                   |
|---|-------------------|-------------------------|---------------------------------------------------------|
| 1 | Data              | Data                    | Yahoo only — never goes through Gemini                  |
| 2 | News              | News                    | Gemini + Google Search grounding                        |
| 3 | Fan-out           | Analysis + Risk         | Parallel; both see Data + News                          |
| 4 | Report v1         | Report                  | Combines Data + News + Analysis + Risk                  |
| 5 | Verify + revise   | Verifier (+Report v2)   | Eight checks; one revision pass max; re-verify          |

Verifier is grounded on already-fetched facts (`disableGrounding: true`) so it
can't paper over upstream gaps. Revision-mode Report runs the same way for
the same reason.

### Verifier checks (full list)

1. **Number fidelity** (BLOCKING): every number in the report must appear in
   `DATA_METRICS` within ±5%. Numbers in Analysis or Risk text don't count.
2. **Recommendation × RiskLevel matrix** (4×5): see `prompts.js verifier`.
3. **Self-prediction language** (WARNING): predictions need third-party
   attribution.
4. **Recommendation reasoning** (WARNING): must cite Risk or Analysis,
   not just analyst consensus.
5. **Bullet traceability** (WARNING): each bullet maps to a specific
   upstream fact.
6. **Upstream boundary lint** (WARNING): Analysis must not assign risk
   levels; Risk must not assign Buy/Hold/Sell.
7. **News event fidelity** (BLOCKING): cited events must appear in
   `NEWS_OUTPUT.news`.
8. **Thesis vs Analysis direction** (WARNING): thesis must not contradict
   Analysis output's overall direction.

`fail` or any `blocking` issue triggers exactly one revision. Warnings are
surfaced but don't trigger revision.

## Key design principle

**Deterministic facts come from Yahoo. Reasoning comes from Gemini.**

Stock prices, fundamentals, and earnings are not things an LLM should
hallucinate. The Data agent fetches verified data; every other agent is
constrained to use only what Data provides for numbers. The Verifier
enforces this at the end.

## Workflow diagram

```
                         User input
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  Phase 1   Data Agent  (Yahoo, no LLM)  │
        └─────────────────┬───────────────────────┘
                          ▼
        ┌─────────────────────────────────────────┐
        │  Phase 2   News Agent                    │
        └─────────────────┬───────────────────────┘
                          ▼
        ┌─────────────────────────────────────────┐
        │  Phase 3   Analysis  ║  Risk    parallel │
        └─────────────────┬───────────────────────┘
                          ▼
        ┌─────────────────────────────────────────┐
        │  Phase 4   Report v1                     │
        └─────────────────┬───────────────────────┘
                          ▼
        ┌─────────────────────────────────────────┐
        │  Phase 5a  Verifier on v1                │
        │      └── pass / warn  →  done            │
        │      └── fail         ↓                  │
        │  Phase 5b  Report v2 (revision)          │
        │  Phase 5c  Verifier on v2                │
        └─────────────────────────────────────────┘
                          │
                          ▼
                   Dashboard render
```

The user can cancel mid-workflow via the X button or the **Esc** key.

## Caching layers

| Layer            | Where                              | TTL   | Key                                         |
|------------------|------------------------------------|-------|---------------------------------------------|
| Yahoo summary    | `services/cache.js` (sessionStorage) | 90s   | `finagent:market:<symbol>`                  |
| Gemini response  | `services/cache.js`                | 12min | `finagent:gemini:<model>:<g\|j>:<promptHash>` |
| Yahoo proxy in-flight | `server/yahooProxy.js` (in-mem) | request lifetime | `chart:<symbol>:<range>:<interval>` / `summary:<symbol>` |
| Yahoo crumb       | `server/yahooProxy.js` (in-mem)    | until 401 | single global; refresh under mutex      |

`(cached)` appears in the execution log when a Gemini call hits its cache.

## Why a Vite middleware proxy and not a real backend

The dashboard fetches from `/api/market-chart/...` and `/api/market-summary/...`.
These routes are wired up by `yahooProxyPlugin` against Vite's
`configureServer` and `configurePreviewServer` hooks. **They only exist while
`vite dev` or `vite preview` is running.** A bare `dist/` static deploy has
no `/api/*` and would fail with 404s on every market data request.

If/when a real deploy is needed, the proxy logic (`server/yahooProxy.js`) is
already factored into a single file that can be lifted into an Express,
Fastify, or Cloudflare Workers handler with minimal changes.

## Hook surface

`useAgentWorkflow(initialSymbol)` returns:

```js
{
  results,          // WorkflowResults — current agent payloads
  activeAgents,     // AgentId[] currently running
  completedAgents,  // AgentId[] completed in this run (deduplicated)
  failedAgents,     // AgentId[] that failed in this run
  logs,             // last 40 LogEntry items
  isRunning,        // boolean
  error,            // string (workflow-level error message)
  allSources,       // GroundingSource[] — deduped citations
  workflowPhase,    // 'verify-v1' | 'revise' | 'verify-v2' | null
  runAgent,         // (agentId, rawSymbol) => Promise<void>
  runWorkflow,      // (rawSymbol) => Promise<void>
  cancel,           // () => void
  reset,            // (symbol) => void
  getStepState      // (id) => 'active' | 'done' | 'failed' | ''
}
```

`runAgent` / `runWorkflow` re-entry is guarded by the synchronous
`abortRef.current` check, so a fast double-click can't orphan an
AbortController. Unmount triggers `abortRef.current?.abort()` so navigating
away during a workflow doesn't leak Gemini fetches.

## Testing

161 tests under `tests/`:

| Suite                          | What it covers                                               |
|--------------------------------|--------------------------------------------------------------|
| `services/cache.test.js`       | TTL, expiry, corrupted JSON                                  |
| `services/agentApi.test.js`    | Validation, JSON extraction, prompts, Gemini retry/timeout   |
| `services/marketData.test.js`  | Formatters + every Yahoo parser + fetchMarketData orchestration |
| `hooks/useAgentWorkflow.test.js` | All 5 phases, verifier loop cases 1-10, abort, dedup, unmount |
| `server/yahooProxy.test.js`    | In-flight dedup, refreshCrumb mutex, timeout                 |
| `components/Chip.test.jsx`     | Class mapping, fallback                                      |
| `components/SentimentBar.test.jsx` | Score validation, tone classes                            |
| `components/statusPill.test.js` | Five-precedence pill text logic                             |
