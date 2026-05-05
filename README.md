# FinAgent Dashboard

> A six-agent, five-phase finance research workflow. Yahoo provides the
> facts, Gemini does the reasoning, and a Verifier cross-checks the final
> report.
>
> - Visual project tour: [`docs/index.html`](docs/index.html) (open in any browser)
> - Deep architecture reference: [`docs/architecture.md`](docs/architecture.md)

## Quick start

Requires **Node.js 18+** (20 recommended).

```bash
git clone <this-repo>
cd Workflow
npm install
```

Create `.env.local` in the project root:

```env
VITE_GEMINI_API_KEY=AIzaSy...your-key
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_USE_GOOGLE_SEARCH=true
```

Notes:

- The filename is exactly `.env.local` (not `env.local` or `.env.local.txt`)
- Do not wrap the key in quotes; no leading/trailing whitespace
- Restart the dev server after editing `.env.local`

Start it:

```bash
npm run dev
```

Open the `Local:` URL the terminal prints (usually `http://127.0.0.1:5173/`).

## npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (the Yahoo proxy runs here too) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Preview the prod build (proxy still active — **not a static deploy**) |
| `npm run lint` | ESLint flat config |
| `npm test` | Run the full 201-test suite |
| `npm run test:watch` | Watch mode |

## Using the dashboard

1. Type a ticker (`NVDA` / `TSLA` / `AAPL` / ...) in the Ticker field
2. Click `Run Full Analysis`, or press `Enter` in the input
3. Five phases run in order:

   ```
   Phase 1  Data             (Yahoo Finance — never goes through Gemini)
   Phase 2  News             (Gemini + Google Search grounding)
   Phase 3  Analysis + Risk    in parallel
   Phase 4  Report v1
   Phase 5  Verifier  → optional Report v2 → Verifier again
   ```

4. Press `Esc` or click the X button to cancel a running workflow at any time
5. **Click any agent card in Agent Controls** to open its detail modal
   (Data → full metrics + candlestick chart + volume; News → headlines +
   sentiment; Verifier → issue list with severities; etc.)
6. Re-running the same ticker within 12 minutes hits the Gemini cache;
   market data reuses the Yahoo response within 90 seconds. Cache hits
   are tagged `(cached)` in the execution log.

## What each panel shows

- **Topbar** — status pill that distinguishes phases (`Verifying report` /
  `Revising report (1 of 1)` / `Verifying revised report` / `Running 2 agents in parallel`)
- **Agent Controls** — six agent cards. Color reflects run-state (green =
  done, red = failed, glow = active). **Clicking opens the detail modal**
- **Workflow** — five phase cells with an x-axis flow. Phase 3 stacks
  Analysis + Risk as two sub-cards to make concurrency visible. Phase 5
  carries a sub-state badge (v1 / revise / v2)
- **Financial Metrics** — 16 metric cards covering quote, valuation,
  profitability, earnings cycle, and analyst views, plus the sentiment bar
- **Price Trend** — real candlestick (OHLC) chart with volume sub-pane,
  latest-close reference line, and locale-formatted date ticks
- **Agent Findings** — news headlines, analysis (valuation/growth/margin/trend),
  risk level + risks/opportunities columns
- **Report** — title, recommendation chip, thesis paragraph, bullets,
  Verifier strip, and grounding sources
- **Logs** — last 40 execution log entries

## ⚠️ Deployment caveat

**This project currently only runs under `npm run dev` or `npm run preview`.**

The page hits `/api/market-chart/...` and `/api/market-summary/...`. Those
routes are registered by [`server/yahooProxy.js`](server/yahooProxy.js)
against Vite's dev/preview servers. **A bare `dist/` static deploy has no
`/api/*` routes** — it would 404 every market-data request on Netlify,
Vercel, GitHub Pages, etc.

For a real deploy, lift the Yahoo proxy logic in `server/yahooProxy.js`
into a backend of your choice (Express / Fastify / Cloudflare Worker —
the file is already factored out for this).

## Troubleshooting

**Gemini API key not valid**
- Verify the key is copied in full with no quotes, no whitespace
- Restart the dev server after edits (`Ctrl+C` then `npm run dev`)

**Gemini quota exhausted / `Quota exceeded ... limit: 0`**
- `limit: 0` means the API key has **no free-tier allowance** for that
  model (not "used it up" — it was zero from the start)
- Try a different model in this order:
  1. `VITE_GEMINI_MODEL=gemini-2.0-flash` (drop-in compatible with 2.5-flash)
  2. `VITE_GEMINI_MODEL=gemini-2.0-flash-lite` (different quota pool)
  3. `VITE_GEMINI_MODEL=gemini-1.5-flash` + `VITE_GEMINI_USE_GOOGLE_SEARCH=false`
     (1.5 uses an older tool-format that's incompatible with our `google_search` field)
- Or generate a fresh key at [aistudio.google.com](https://aistudio.google.com/),
  ideally from a Google account that hasn't been linked to billing
- Restart after editing — the cache is namespaced by model so switching
  doesn't pollute previous results

**Page doesn't update**
- `Ctrl+F5` to hard-reload, or restart the dev server

**Port is not 5173**
- If 5173 is taken, Vite picks the next free port — use whatever the
  terminal's `Local:` line shows

**`npm install` fails**
- Confirm you're in the project root and have network access
- Node 18+ is required (`node --version`)

## Project structure

```
src/
  App.jsx                       React layout shell (~140 lines; all business logic in the hook)
  main.jsx                      Entry, wraps the tree in <ErrorBoundary>
  constants.js                  UI constants (chip palette, agent icons, phase definitions)
  hooks/
    useAgentWorkflow.js         Workflow controller (state, phase pipeline, abort, cache)
  services/
    cache.js                    sessionStorage cache (Gemini 12min / market 90s)
    agentApi/
      definitions.js            Agent metadata + ticker validation
      parseJson.js              Extract JSON from LLM output (tolerates fences + prose)
      geminiClient.js           Gemini HTTP client (retry + exponential backoff + Retry-After)
      prompts.js                Six prompt templates + context summarization
      runner.js                 runAgent dispatcher
      types.js                  JSDoc @typedef definitions
    marketData/
      formatters.js             Five number formatters
      yahooParsers.js           Yahoo-response parsers (analyst, eps, cashflow, ...)
      index.js                  fetchMarketData orchestrator
  components/                   All wrapped in React.memo
    Topbar / CommandStrip / ErrorBanner /
    AgentControls / WorkflowTrack /
    MetricsPanel / FindingsPanel / TrendPanel / LogPanel / ReportPanel /
    AgentDetailModal / PriceChart / Chip / SentimentBar / ErrorBoundary /
    statusPill.js
server/
  yahooProxy.js                 Yahoo proxy (in-flight dedup + crumb mutex + 15s timeout)
docs/
  index.html                    Visual project tour (open in any browser)
  architecture.md               Deep architecture reference
tests/                          201 tests; directory mirrors src/
```

For more depth, see [`docs/architecture.md`](docs/architecture.md) and
[`docs/index.html`](docs/index.html).
