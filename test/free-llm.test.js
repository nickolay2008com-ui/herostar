import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_LLM_PROVIDERS,
  extractFreeLlmText,
  freeLlmApiKey,
  freeLlmModel,
  freeLlmProvider,
  generateFreeLlmChat,
  getFreeLlmDiagnostics,
  isFreeLlmChatConfigured,
  resetFreeLlmRuntimeForTests,
  toChatMessages,
} from '../src/free-llm.js';

function configuredEnv(overrides = {}) {
  return {
    GROQ_API_KEY: 'secret-key',
    ...overrides,
  };
}

function fakeResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] || null;
      },
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

test('HeroStar defaults to the proven Olli Groq GPT-OSS route when GROQ_API_KEY exists', () => {
  const env = configuredEnv();
  assert.equal(freeLlmProvider(env), 'groq');
  assert.equal(freeLlmModel(env), 'openai/gpt-oss-20b');
  assert.equal(freeLlmApiKey(env), 'secret-key');
  assert.equal(isFreeLlmChatConfigured(env), true);
});

test('only curated Olli provider hosts are accepted', () => {
  assert.equal(FREE_LLM_PROVIDERS.groq.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(
    freeLlmProvider(configuredEnv({ CLONE_FREE_LLM_PROVIDER: 'https://example.com' })),
    '',
  );
});

test('diagnostics never expose the provider secret', () => {
  const diagnostics = getFreeLlmDiagnostics(configuredEnv());
  assert.equal(diagnostics.configured, true);
  assert.equal(JSON.stringify(diagnostics).includes('secret-key'), false);
});

test('system and user content keep the Olli OpenAI-compatible message shape', () => {
  assert.deepEqual(toChatMessages('System', [{ role: 'user', content: 'One' }]), [
    { role: 'system', content: 'System' },
    { role: 'user', content: 'One' },
  ]);
  assert.equal(
    extractFreeLlmText({ choices: [{ message: { content: 'Answer' } }] }),
    'Answer',
  );
});

test('Groq request stays bounded and rejects redirects', async () => {
  resetFreeLlmRuntimeForTests();
  let seen = null;
  const result = await generateFreeLlmChat({
    instructions: 'System',
    input: [{ role: 'user', content: 'Hello' }],
    env: configuredEnv(),
    fetchImpl: async (url, options) => {
      seen = { url, options };
      return fakeResponse(200, {
        choices: [{ message: { content: 'Safe answer' } }],
        usage: { total_tokens: 42 },
      });
    },
  });

  assert.equal(result.text, 'Safe answer');
  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.equal(seen.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(seen.options.redirect, 'manual');
  assert.equal(seen.options.headers.Authorization, 'Bearer secret-key');
});


test('GPT-OSS uses low reasoning and current completion-token field', async () => {
  resetFreeLlmRuntimeForTests();
  let body = null;
  await generateFreeLlmChat({
    instructions: 'System',
    input: [{ role: 'user', content: 'Hello' }],
    maxOutputTokens: 900,
    env: configuredEnv(),
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return fakeResponse(200, {
        choices: [{ message: { content: 'Complete answer' }, finish_reason: 'stop' }],
        usage: { total_tokens: 90 },
      });
    },
  });

  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.max_completion_tokens, 900);
  assert.equal('max_tokens' in body, false);
});

test('truncated Groq completion is rejected instead of reaching the user', async () => {
  resetFreeLlmRuntimeForTests();

  await assert.rejects(
    () => generateFreeLlmChat({
      instructions: 'System',
      input: [{ role: 'user', content: 'Hello' }],
      env: configuredEnv(),
      fetchImpl: async () => fakeResponse(200, {
        choices: [{
          message: { content: 'Клон бы выбрал страну, где важна стабильная' },
          finish_reason: 'length',
        }],
        usage: {
          prompt_tokens: 400,
          completion_tokens: 900,
          completion_tokens_details: { reasoning_tokens: 760 },
          total_tokens: 1300,
        },
      }),
    }),
    (error) => error?.code === 'free_llm_truncated_response',
  );
});
