import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Vite plugins must be re-declared so JSX in component tests is transformed
  // with the automatic-runtime that vite.config.js uses for the bundle.
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.{js,jsx}']
  }
});
