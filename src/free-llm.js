export const FREE_LLM_TIMEOUT_MS = 20_000;
export const FREE_LLM_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export const FREE_LLM_MAX_TEXT_CHARS = 20_000;
export const FREE_LLM_CIRCUIT_FAILURES = 3;
export const FREE_LLM_CIRCUIT_COOLDOWN_MS = 60_000;

export const FREE_LLM_PROVIDERS = Object.freeze({
  groq: Object.freeze({
    baseUrl: 'https://api.groq.com/openai/v1',
    keyEnv: 'GROQ_API_KEY',
  }),
  nvidia: Object.freeze({
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyEnv: 'NVIDIA_API_KEY',
  }),
  openrouter: Object.freeze({
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnv: 'OPENROUTER_API_KEY',
  }),
});

let lastFreeLlmAttempt = null;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function envValue(name, env = process.env) {
  const value = env?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function freeLlmMode(env = process.env) {
  const mode = envValue('CLONE_FREE_LLM_MODE', env).toLowerCase() || 'primary';
  return ['primary', 'fallback'].includes(mode) ? mode : 'off';
}

export function freeLlmProvider(env = process.env) {
  const provider = envValue('CLONE_FREE_LLM_PROVIDER', env).toLowerCase() || 'groq';
  return FREE_LLM_PROVIDERS[provider] ? provider : '';
}

function freeLlmProviderConfig(env = process.env) {
  const provider = freeLlmProvider(env);
  return provider ? FREE_LLM_PROVIDERS[provider] : null;
}

export function freeLlmApiKey(env = process.env) {
  const explicit = envValue('CLONE_FREE_LLM_API_KEY', env);
  if (explicit) return explicit;
  const config = freeLlmProviderConfig(env);
  return config ? envValue(config.keyEnv, env) : '';
}

export function freeLlmModel(env = process.env) {
  const configured = envValue('CLONE_FREE_LLM_MODEL', env);
  if (configured) return configured;
  return freeLlmProvider(env) === 'groq' ? 'openai/gpt-oss-20b' : '';
}

export function freeLlmAllowsUserContent(env = process.env) {
  const configured = envValue('CLONE_FREE_LLM_ALLOW_USER_CONTENT', env).toLowerCase();
  return configured ? configured === 'true' : true;
}

export function isFreeLlmConfigured(env = process.env) {
  return Boolean(freeLlmProviderConfig(env) && freeLlmApiKey(env) && freeLlmModel(env));
}

export function isFreeLlmChatConfigured(env = process.env) {
  return freeLlmMode(env) !== 'off'
    && freeLlmAllowsUserContent(env)
    && isFreeLlmConfigured(env);
}

function isCircuitOpen(now = Date.now()) {
  return circuitOpenUntil > now;
}

function rememberAttempt({ ok, provider, model, status = null, code = null }) {
  lastFreeLlmAttempt = {
    ok: Boolean(ok),
    provider: provider || null,
    model: model || null,
    status: Number.isFinite(Number(status)) && Number(status) > 0 ? Number(status) : null,
    code: code ? String(code).slice(0, 80) : null,
    at: new Date().toISOString(),
  };
}

function markSuccess() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function markFailure(now = Date.now()) {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FREE_LLM_CIRCUIT_FAILURES) {
    circuitOpenUntil = now + FREE_LLM_CIRCUIT_COOLDOWN_MS;
  }
}

export function getFreeLlmDiagnostics(env = process.env) {
  const provider = freeLlmProvider(env);
  const config = freeLlmProviderConfig(env);
  return {
    configured: isFreeLlmConfigured(env),
    eligible_for_clone_chat: isFreeLlmChatConfigured(env),
    mode: freeLlmMode(env),
    provider: provider || null,
    model: freeLlmModel(env) || null,
    base_url: config?.baseUrl || null,
    user_content_allowed: freeLlmAllowsUserContent(env),
    circuit_open: isCircuitOpen(),
    circuit_open_until: circuitOpenUntil ? new Date(circuitOpenUntil).toISOString() : null,
    consecutive_failures: consecutiveFailures,
    last_attempt: lastFreeLlmAttempt,
  };
}

export function toChatMessages(instructions, input) {
  const messages = [];
  const system = String(instructions || '').trim();
  if (system) messages.push({ role: 'system', content: system });

  for (const item of Array.isArray(input) ? input : []) {
    const content = String(item?.content || '').trim();
    if (!content) continue;
    messages.push({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content,
    });
  }
  return messages;
}

export function extractFreeLlmText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      if (typeof part?.content === 'string') return part.content;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function freeLlmTokensUsed(payload) {
  const usage = payload?.usage || {};
  if (Number.isFinite(Number(usage.total_tokens))) return Number(usage.total_tokens);
  return (Number(usage.prompt_tokens) || 0) + (Number(usage.completion_tokens) || 0);
}

function providerErrorCode(payload, fallback = 'free_llm_error') {
  const raw = payload?.error?.code || payload?.error?.type || payload?.error?.message || fallback;
  return String(raw).toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 80) || fallback;
}

export function outputTokenLimit(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return 900;
  return Math.min(2048, Math.max(64, Math.floor(requested)));
}

export async function generateFreeLlmChat({
  instructions = '',
  input = [],
  maxOutputTokens = 900,
  timeoutMs = FREE_LLM_TIMEOUT_MS,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  const provider = freeLlmProvider(env);
  const config = freeLlmProviderConfig(env);
  const model = freeLlmModel(env);
  const apiKey = freeLlmApiKey(env);

  if (!isFreeLlmChatConfigured(env) || !provider || !config || !model || !apiKey) {
    const error = new Error('HeroStar free LLM route is not configured');
    error.code = 'free_llm_not_configured';
    throw error;
  }

  if (isCircuitOpen()) {
    const error = new Error('Free LLM circuit is temporarily open');
    error.code = 'free_llm_circuit_open';
    throw error;
  }

  const messages = toChatMessages(instructions, input);
  if (!messages.some((message) => message.role === 'user')) {
    const error = new Error('Free LLM chat input is empty');
    error.code = 'empty_input';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(FREE_LLM_TIMEOUT_MS, Math.max(1, Number(timeoutMs) || FREE_LLM_TIMEOUT_MS)),
  );
  let response;

  try {
    response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: outputTokenLimit(maxOutputTokens),
        stream: false,
      }),
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timeout);
    const error = new Error(cause?.name === 'AbortError' ? 'Free LLM request timed out' : 'Free LLM request failed');
    error.code = cause?.name === 'AbortError' ? 'free_llm_timeout' : 'free_llm_network_error';
    rememberAttempt({ ok: false, provider, model, code: error.code });
    markFailure();
    throw error;
  }
  clearTimeout(timeout);

  const status = Number(response?.status || 0);
  if (status >= 300 && status < 400) {
    const error = new Error('Free LLM redirect rejected');
    error.status = status;
    error.code = 'free_llm_redirect_rejected';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  const contentLength = Number(response?.headers?.get?.('content-length') || 0);
  if (contentLength > FREE_LLM_MAX_RESPONSE_BYTES) {
    const error = new Error('Free LLM response is too large');
    error.status = status || null;
    error.code = 'free_llm_response_too_large';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  let raw = '';
  try {
    raw = await response.text();
  } catch {
    const error = new Error('Free LLM response could not be read');
    error.status = status || null;
    error.code = 'free_llm_bad_response';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  if (Buffer.byteLength(raw, 'utf8') > FREE_LLM_MAX_RESPONSE_BYTES) {
    const error = new Error('Free LLM response is too large');
    error.status = status || null;
    error.code = 'free_llm_response_too_large';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error('Free LLM returned invalid JSON');
    error.status = status || null;
    error.code = 'free_llm_invalid_json';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Free LLM request failed with status ${status || 'unknown'}`);
    error.status = status || null;
    error.code = providerErrorCode(payload, 'free_llm_http_error');
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  const text = extractFreeLlmText(payload);
  if (!text) {
    const error = new Error('Free LLM returned an empty chat response');
    error.code = 'empty_response';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }
  if (text.length > FREE_LLM_MAX_TEXT_CHARS) {
    const error = new Error('Free LLM text response is unexpectedly large');
    error.code = 'free_llm_text_too_large';
    rememberAttempt({ ok: false, provider, model, status, code: error.code });
    markFailure();
    throw error;
  }

  rememberAttempt({ ok: true, provider, model, status: status || 200, code: 'ok' });
  markSuccess();
  return {
    text,
    tokens_used: freeLlmTokensUsed(payload),
    provider,
    model,
  };
}

export function resetFreeLlmRuntimeForTests() {
  lastFreeLlmAttempt = null;
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}
