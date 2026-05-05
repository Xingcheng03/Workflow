// Gemini HTTP client. Handles config, retry-with-backoff, JSON parsing,
// grounding sources, and a sessionStorage-backed response cache.

import { TTL, cacheGet, cacheKey, cacheSet, hashString } from '../cache.js';
import { parseJson } from './parseJson.js';

const RETRY_BACKOFF_MS = 800;
const MAX_SOURCES = 5;
const REQUEST_TIMEOUT_MS = 60_000;

const SYSTEM_INSTRUCTION =
  'You are a careful finance workflow agent for a classroom dashboard. Return only valid JSON. Do not include markdown fences. If live market values are uncertain, say "not verified" instead of inventing exact numbers.';

const RETRY_HINT =
  '\n\nIMPORTANT: Your previous response was not valid JSON. Return only one JSON object, no markdown fences, no commentary.';

const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

// Build a signal that aborts when EITHER the caller's signal aborts OR the
// per-attempt timeout fires. A fresh timeout per attempt is intentional —
// retry-after-backoff should get its own full budget rather than racing the
// original timeout.
const buildAttemptSignal = (userSignal) => {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return userSignal ? AbortSignal.any([userSignal, timeoutSignal]) : timeoutSignal;
};

const getGeminiConfig = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const model = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
  const useGoogleSearch = import.meta.env.VITE_GEMINI_USE_GOOGLE_SEARCH !== 'false';

  if (!apiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Add it to .env.local and restart npm run dev.');
  }

  return { apiKey, model, useGoogleSearch };
};

const extractText = (data) =>
  data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';

const extractSources = (data) => {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return chunks
    .map((chunk) => chunk.web)
    .filter(Boolean)
    .map((web) => ({ title: web.title || web.uri, uri: web.uri }))
    .filter((source, index, all) => source.uri && all.findIndex((item) => item.uri === source.uri) === index)
    .slice(0, MAX_SOURCES);
};

// options.disableGrounding=true forces useGoogleSearch off for this call
// (e.g., Verifier and Report-revision must not re-search).
export const callGemini = async (prompt, signal, options = {}) => {
  const config = getGeminiConfig();
  const { apiKey, model } = config;
  const useGoogleSearch = options.disableGrounding ? false : config.useGoogleSearch;
  const key = cacheKey('gemini', model, useGoogleSearch ? 'g' : 'j', hashString(prompt));
  const cached = cacheGet(key, TTL.gemini);
  if (cached) return { ...cached, __cached: true };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const buildInit = (text) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      tools: useGoogleSearch ? [{ google_search: {} }] : undefined,
      generationConfig: {
        temperature: 0.25,
        ...(useGoogleSearch ? {} : { responseMimeType: 'application/json' })
      }
    }),
    signal: buildAttemptSignal(signal)
  });

  const tryOnce = async (init) => {
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(`Gemini API error: ${data?.error?.message || response.statusText}`);
      err.retryable = response.status === 429 || response.status >= 500;
      throw err;
    }
    return data;
  };

  const fetchWithBackoff = async (init) => {
    try {
      return await tryOnce(init);
    } catch (error) {
      // Caller-driven aborts and timeouts both bypass retry — a 60s timeout
      // suggests the upstream is hosed, not flaky. AbortSignal.any propagates
      // the source's reason so error.name distinguishes the two.
      if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
      if (error.retryable || error.name === 'TypeError') {
        await pause(RETRY_BACKOFF_MS);
        return await tryOnce(init);
      }
      throw error;
    }
  };

  const parseResult = (data) => {
    const text = extractText(data);
    return {
      json: parseJson(text),
      text,
      sources: extractSources(data)
    };
  };

  let result = parseResult(await fetchWithBackoff(buildInit(prompt)));

  if (!result.json && result.text) {
    const retryData = await fetchWithBackoff(buildInit(prompt + RETRY_HINT));
    const retryResult = parseResult(retryData);
    if (retryResult.json) result = retryResult;
  }

  if (result.json) cacheSet(key, result);
  return { ...result, __cached: false };
};
