# FinAgent Dashboard

Interactive React dashboard for operating a Gemini-powered multi-agent finance analysis workflow.

## Local Setup

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the URL shown by Vite, usually:

```text
http://127.0.0.1:5173
```

Build for production:

```bash
npm run build
```

## Gemini API Key

This project calls the Gemini REST API directly from the Vite frontend.

1. Copy `.env.example` to `.env.local`.
2. Put your Gemini API key in `.env.local`.
3. Restart the dev server.

```env
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-2.5-flash
VITE_GEMINI_USE_GOOGLE_SEARCH=true
```

Important: Vite frontend environment variables are visible in the browser bundle. For a real product, do not put private paid API keys directly in React. Use a small backend proxy such as Express or FastAPI, keep the secret key on the server, and let React call your backend.

## Market Data

The Data Agent uses a local Vite endpoint at `/api/market-chart/:symbol`, which proxies Yahoo Finance chart data for live quote and intraday trend values. Gemini is used for narrative analysis, not precise prices.

## Main Files

- `src/App.jsx`: Dashboard UI and workflow state.
- `src/services/agentApi.js`: Gemini agent runner and agent definitions.
- `src/services/marketData.js`: Live quote and intraday chart parser.
- `vite.config.js`: Local market-data proxy for development and preview.
- `src/styles.css`: Dashboard styling.
