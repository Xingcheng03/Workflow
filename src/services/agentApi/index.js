// Public surface for the agent layer. Existing imports keep working:
//   import { agentDefinitions, runAgent, validateSymbol, ... } from 'services/agentApi'
//
// Internals live in sibling modules:
//   ./definitions   — agent metadata + ticker validation
//   ./parseJson     — JSON extraction helpers (markdown fences, prose stripping)
//   ./geminiClient  — Gemini HTTP client + retry/cache
//   ./prompts       — prompt templates + context summarization
//   ./runner        — runAgent dispatcher

export { agentDefinitions, createCompanyShell, validateSymbol } from './definitions.js';
export { cleanJsonText, extractFirstObject, parseJson } from './parseJson.js';
export { callGemini } from './geminiClient.js';
export { prompts, summarizeContext, verifierContextBlock } from './prompts.js';
export { runAgent } from './runner.js';

// Re-export the typedef path so consumers can do
//   /** @typedef {import('services/agentApi').WorkflowResults} WorkflowResults */
export * from './types.js';
