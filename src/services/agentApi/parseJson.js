// JSON extraction helpers for LLM responses that occasionally come wrapped
// in markdown fences or surrounded by prose.

export const cleanJsonText = (text) =>
  text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

// Return the first balanced top-level `{...}` substring, respecting string
// literals and escape sequences. Used to recover JSON when the model emits
// extra prose around it.
export const extractFirstObject = (text) => {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

export const parseJson = (text) => {
  const cleaned = cleanJsonText(text);
  const candidate = extractFirstObject(cleaned) ?? cleaned;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  // Agent payloads are always plain JSON objects. Reject scalars (e.g. JSON.parse('42')),
  // arrays, and null so downstream `payload || plainTextPayload(...)` reliably falls back.
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return parsed;
};
