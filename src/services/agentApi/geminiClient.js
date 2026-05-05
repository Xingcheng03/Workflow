// Gemini HTTP client. Handles config, retry-with-backoff, JSON parsing,
// grounding sources, and a sessionStorage-backed response cache.

import { TTL, cacheGet, cacheKey, cacheSet, hashString } from '../cache.js';
import { parseJson } from './parseJson.js';

const MAX_SOURCES = 5;
const REQUEST_TIMEOUT_MS = 60_000;

// Retry policy for transient upstream failures (429, 5xx, network blips).
// Three total attempts with exponential backoff + ±25% jitter — Gemini's
// "model is overloaded, please try again later" usually clears in 5-15s,
// so attempts at ~0s / ~2s / ~6s give us a realistic chance to ride it out.
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 20_000;
const JITTER_RATIO = 0.25;

const SYSTEM_INSTRUCTION =
  'You are a careful finance workflow agent for a classroom dashboard. Return only valid JSON. Do not include markdown fences. If live market values are uncertain, say "not verified" instead of inventing exact numbers.';

const RETRY_HINT =
  '\n\nIMPORTANT: Your previous response was not valid JSON. Return only one JSON object, no markdown fences, no commentary.';

const pause = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

// Exponential backoff with jitter. Honors a Retry-After hint from 429
// responses when present; otherwise grows BASE × 2^attempt up to a cap.
// Jitter avoids the thundering-herd where every parallel agent retries at
// the same moment.
const backoffMs = (attempt, retryAfterSeconds) => {
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, MAX_BACKOFF_MS);
  }
  const exp = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
  const jitter = exp * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, exp + jitter);
};

// Parse Retry-After from a 429 response. Spec allows seconds-int OR HTTP-date;
// we only handle the seconds form (Gemini uses that). Returns NaN if absent
// or unparseable.
const parseRetryAfter = (response) => {
  const raw = response.headers?.get?.('retry-after');
  if (!raw) return NaN;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : NaN;
};

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

  const tryOnce = async (initFactory) => {
    // Re-call the factory each attempt so the AbortSignal is fresh — a
    // single signal is consumed once it aborts, so retries must rebuild it.
    const init = initFactory();
    const response = await fetch(url, init);
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(`Gemini API error: ${data?.error?.message || response.statusText}`);
      err.retryable = response.status === 429 || response.status >= 500;
      err.retryAfter = parseRetryAfter(response);
      err.status = response.status;
      throw err;
    }
    return data;
  };

  const fetchWithBackoff = async (initFactory) => {
    let lastError;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        return await tryOnce(initFactory);
      } catch (error) {
        // Caller-driven aborts and timeouts always bypass retry — a 60s
        // timeout suggests the upstream is hosed, not flaky. AbortSignal.any
        // propagates the source's reason so error.name distinguishes the two.
        if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
        // Network-level failure (TypeError on fetch) and 429/5xx are retryable.
        const retryable = error.retryable || error.name === 'TypeError';
        const isLast = attempt === MAX_ATTEMPTS - 1;
        if (!retryable || isLast) {
          throw error;
        }
        lastError = error;
        await pause(backoffMs(attempt, error.retryAfter));
      }
    }
    // Unreachable — the loop either returns or throws — but satisfies the
    // linter and gives a clearer message if invariants ever break.
    throw lastError ?? new Error('Gemini retry loop exhausted unexpectedly');
  };

  const parseResult = (data) => {
    const text = extractText(data);
    return {
      json: parseJson(text),
      text,
      sources: extractSources(data)
    };
  };

  let result = parseResult(await fetchWithBackoff(() => buildInit(prompt)));

  if (!result.json && result.text) {
    const retryData = await fetchWithBackoff(() => buildInit(prompt + RETRY_HINT));
    const retryResult = parseResult(retryData);
    if (retryResult.json) result = retryResult;
  }

  if (result.json) cacheSet(key, result);
  return { ...result, __cached: false };
};
