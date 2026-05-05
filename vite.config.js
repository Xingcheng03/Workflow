import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { yahooProxyPlugin } from './server/yahooProxy.js';

// NOTE: yahooProxyPlugin only runs under `vite dev` and `vite preview`.
// A bare `dist/` static deploy has no /api/* endpoints — see README.

export default defineConfig({
  plugins: [react(), yahooProxyPlugin()]
});
