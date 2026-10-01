const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_PRIMARY_MODEL = 'gemini-3.7-flash';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash';
export const GEMINI_PRIMARY_TIMEOUT_MS = 18_000;
export const GEMINI_FALLBACK_TIMEOUT_MS = 8_000;
export const GEMINI_PROVIDER_DEADLINE_MS = 24_000;
export const PROVIDER_TRANSIENT_COOLDOWN_MS = 30_000;
export const PROVIDER_HARD_COOLDOWN_MS = 5 * 60_000;

const providerCooldownUntil = new Map();

function clean(value = '') {
  return String(value || '').trim();
}

function geminiApiKey(env = process.env) {
  return clean(env?.GEMINI_API_KEY || env?.GOOGLE_API_KEY);
}

export function providerFailureCooldownMs(failure, status = 0) {
  const code = Number(status || failure?.status || failure?.statusCode || 0);
  const message = clean(failure?.message || failure).toLowerCase();

  if (
    [401, 402, 403, 429].includes(code)
    || /quota|credits remaining|billing|resource_exhausted|rate[ -]?limit/.test(message)
  ) {
    return PROVIDER_HARD_COOLDOWN_MS;
  }

  if (
    code >= 500
    || /high demand|timeout|timed out|aborted|temporarily unavailable|fetch failed/.test(message)
  ) {
    return PROVIDER_TRANSIENT_COOLDOWN_MS;
  }

  return 0;
}

function providerCooldownKey(model = '') {
  return `gemini:${model || 'default'}`;
}

function providerCooldownRemaining(model = '') {
  const key = providerCooldownKey(model);
  const until = Number(providerCooldownUntil.get(key) || 0);
  const remaining = until - Date.now();
  if (remaining <= 0) {
    providerCooldownUntil.delete(key);
    return 0;
  }
  return remaining;
}

function markProviderFailure(model, failure, status = 0) {
  const cooldownMs = providerFailureCooldownMs(failure, status);
  if (!cooldownMs) return 0;
  providerCooldownUntil.set(providerCooldownKey(model), Date.now() + cooldownMs);
  return cooldownMs;
}

function clearProviderFailure(model = '') {
  providerCooldownUntil.delete(providerCooldownKey(model));
}

export function resolveGeminiModel(env = process.env) {
  return clean(env?.GEMINI_MODEL_FORCE) || GEMINI_PRIMARY_MODEL;
}

function outputTextFromGemini(payload = {}) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter((part) => part?.thought !== true)
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
}

function generationConfig(model, maxOutputTokens, { fallback = false } = {}) {
  const config = { maxOutputTokens };
  if (/^gemini-3(?:\.|-)/.test(model)) {
    config.thinkingConfig = { thinkingLevel: fallback ? 'low' : 'medium' };
  } else if (/^gemini-2\.5-pro(?:$|-)/.test(model)) {
    config.thinkingConfig = { thinkingBudget: fallback ? 8192 : 24576 };
  } else if (/^gemini-2\.5-flash(?:$|-)/.test(model)) {
    config.thinkingConfig = { thinkingBudget: fallback ? 4096 : 8192 };
  }
  return config;
}

function userContent(input) {
  return (Array.isArray(input) ? input : [])
    .filter((item) => item?.role !== 'assistant')
    .map((item) => String(item?.content || '').trim())
    .filter(Boolean)
    .join('\n');
}

async function callGemini(fetchImpl, {
  apiKey,
  instructions,
  content,
  model,
  maxOutputTokens,
  timeoutMs,
  fallback = false,
}) {
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: content }] }],
      generationConfig: generationConfig(model, maxOutputTokens, { fallback }),
    }),
    signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(data?.error?.message || data?.message || `HTTP ${response.status}`);
    const error = new Error(`Gemini ${model} failed: ${detail}`);
    error.status = response.status;
    throw error;
  }
  const text = outputTextFromGemini(data);
  if (!text) throw new Error(`Gemini ${model} returned an empty answer.`);
  return { text, model };
}

export async function generateGeminiClone({
  instructions = '',
  input = [],
  maxOutputTokens = 1000,
  timeoutMs = GEMINI_PROVIDER_DEADLINE_MS,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const apiKey = geminiApiKey(env);
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.code = 'gemini_not_configured';
    throw error;
  }

  const content = userContent(input);
  if (!content) {
    const error = new Error('Gemini chat input is empty');
    error.code = 'empty_input';
    throw error;
  }

  const startedAt = Date.now();
  const deadlineMs = Math.min(
    GEMINI_PROVIDER_DEADLINE_MS,
    Math.max(1, Number(timeoutMs) || GEMINI_PROVIDER_DEADLINE_MS),
  );
  const models = [resolveGeminiModel(env)];
  if (models[0] !== GEMINI_FALLBACK_MODEL) models.push(GEMINI_FALLBACK_MODEL);

  let lastError = null;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    const fallback = index > 0;
    const cooldown = providerCooldownRemaining(model);
    if (cooldown > 0) {
      lastError = new Error(`Gemini ${model} is cooling down after a recent provider failure.`);
      console.warn(`[HeroStar AI] skipping Gemini model=${model}; cooldown_ms=${cooldown}`);
      continue;
    }

    const remaining = deadlineMs - (Date.now() - startedAt);
    if (remaining < 1000) break;
    const desired = fallback ? GEMINI_FALLBACK_TIMEOUT_MS : GEMINI_PRIMARY_TIMEOUT_MS;

    try {
      const result = await callGemini(fetchImpl, {
        apiKey,
        instructions,
        content,
        model,
        maxOutputTokens: Math.max(256, Math.min(4096, Number(maxOutputTokens) || 1000)),
        timeoutMs: Math.min(desired, remaining),
        fallback,
      });
      clearProviderFailure(model);
      console.info(`[HeroStar AI] provider=gemini product=clone model=${model} thinking=${fallback ? 'low' : 'medium'}`);
      return result;
    } catch (error) {
      lastError = error;
      const cooldownMs = markProviderFailure(model, error);
      console.error(`[HeroStar AI] Gemini ${fallback ? 'fallback' : 'primary'} failed:`, error?.message || error);
      if (cooldownMs) {
        console.warn(`[HeroStar AI] Gemini cooldown armed model=${model} cooldown_ms=${cooldownMs}`);
      }
    }
  }

  throw lastError || new Error('Gemini clone provider failed.');
}
