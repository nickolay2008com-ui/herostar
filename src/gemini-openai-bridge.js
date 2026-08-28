const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_PRIMARY_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_FALLBACK_MODEL = 'gemini-3.7-flash';

function clean(value = '') {
  return String(value || '').trim();
}

function geminiApiKey() {
  return clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function resolveGeminiModel(env = process.env) {
  return clean(env?.GEMINI_MODEL_FORCE) || GEMINI_PRIMARY_MODEL;
}

function openAiResponseUrl(input) {
  const url = typeof input === 'string' || input instanceof URL
    ? String(input)
    : clean(input?.url);
  return /\/v1\/responses(?:\?|$)/.test(url) && /api\.openai\.com/.test(url);
}

function requestBody(input, init = {}) {
  if (typeof init?.body === 'string') return init.body;
  if (typeof input === 'object' && input && typeof input.clone === 'function') return null;
  return null;
}

function extractCloneConsultation(payload = {}) {
  if (!Array.isArray(payload.input)) return null;
  const system = payload.input.find((item) => item?.role === 'system');
  const user = [...payload.input].reverse().find((item) => item?.role === 'user');
  const rawUser = typeof user?.content === 'string' ? user.content : '';
  let context = null;
  try {
    context = JSON.parse(rawUser);
  } catch {
    return null;
  }
  if (context?.product !== 'clone') return null;
  return {
    system: typeof system?.content === 'string' ? system.content : '',
    user: rawUser,
    mode: context?.mode || 'dialog',
  };
}

function outputTextFromGemini(payload = {}) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim();
}

function asOpenAiResponse(text, model) {
  return {
    id: `resp_gemini_${Date.now().toString(36)}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model,
    output: [{
      id: `msg_gemini_${Date.now().toString(36)}`,
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{
        type: 'output_text',
        text,
        annotations: [],
      }],
    }],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };
}

function generationConfig(model, maxOutputTokens) {
  const config = { maxOutputTokens };
  if (/^gemini-3(?:\.|-)/.test(model)) {
    config.thinkingConfig = { thinkingLevel: 'high' };
  }
  return config;
}

async function callGemini(originalFetch, consultation, payload, model) {
  const key = geminiApiKey();
  if (!key) throw new Error('GEMINI_API_KEY is not configured.');
  const maxOutputTokens = Math.max(256, Math.min(4096, Number(payload.max_output_tokens) || (consultation.mode === 'deep' ? 1800 : 1000)));
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const response = await originalFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: consultation.system }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: consultation.user }],
      }],
      generationConfig: generationConfig(model, maxOutputTokens),
    }),
    signal: AbortSignal.timeout(Number(process.env.GEMINI_TIMEOUT_MS || 90000)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean(data?.error?.message || data?.message || `HTTP ${response.status}`);
    throw new Error(`Gemini ${model} failed: ${detail}`);
  }
  const text = outputTextFromGemini(data);
  if (!text) throw new Error(`Gemini ${model} returned an empty answer.`);
  console.info(`[HeroStar AI] provider=gemini product=clone mode=${consultation.mode} model=${model} thinking=high`);
  return new Response(JSON.stringify(asOpenAiResponse(text, model)), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let installed = false;

export function installGeminiForLiveClone() {
  if (installed) return;
  const key = geminiApiKey();
  if (!key) {
    console.info('[HeroStar AI] Gemini bridge disabled: GEMINI_API_KEY/GOOGLE_API_KEY is absent.');
    return;
  }

  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const hadOpenAiKey = Boolean(clean(process.env.OPENAI_API_KEY));
  if (!hadOpenAiKey) process.env.OPENAI_API_KEY = 'gemini-live-bridge';

  globalThis.fetch = async function geminiAwareFetch(input, init = {}) {
    if (!openAiResponseUrl(input)) return originalFetch(input, init);

    let payload = null;
    const body = requestBody(input, init);
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        payload = null;
      }
    }
    const consultation = payload ? extractCloneConsultation(payload) : null;
    if (!consultation) return originalFetch(input, init);

    const primaryModel = resolveGeminiModel();
    try {
      return await callGemini(originalFetch, consultation, payload, primaryModel);
    } catch (primaryError) {
      console.error('[HeroStar AI] Gemini primary Live clone failed:', primaryError?.message || primaryError);

      if (primaryModel !== GEMINI_FALLBACK_MODEL) {
        console.warn(`[HeroStar AI] retrying Live clone with Gemini fallback model=${GEMINI_FALLBACK_MODEL}`);
        try {
          return await callGemini(originalFetch, consultation, payload, GEMINI_FALLBACK_MODEL);
        } catch (fallbackError) {
          console.error('[HeroStar AI] Gemini fallback Live clone failed:', fallbackError?.message || fallbackError);
        }
      }

      if (hadOpenAiKey) {
        console.warn('[HeroStar AI] falling back to OpenAI for Live clone.');
        return originalFetch(input, init);
      }
      return new Response(JSON.stringify({
        error: {
          message: primaryError?.message || 'Gemini Live clone failed.',
          type: 'gemini_bridge_error',
        },
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };

  console.info(`[HeroStar AI] Gemini is enabled as the primary provider for Live clone consultations. model=${resolveGeminiModel()} fallback=${GEMINI_FALLBACK_MODEL}`);
}
