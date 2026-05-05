import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'docs/**', 'spike-*.mjs']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      react,
      'react-hooks': reactHooks
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Tests + Vite middleware get to use unused-prefixed args freely.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow empty catch blocks when paired with a comment explaining the swallow.
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      // Tests reassign global.fetch, build complex mock objects, etc.
      'no-unused-expressions': 'off'
    }
  },
  {
    files: ['vite.config.js', 'vitest.config.js', 'eslint.config.js', 'server/**/*.js'],
    languageOptions: {
      globals: { ...globals.node }
    }
  }
];
