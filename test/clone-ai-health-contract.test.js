import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROVIDER_HARD_COOLDOWN_MS,
  PROVIDER_TRANSIENT_COOLDOWN_MS,
  providerFailureCooldownMs,
} from '../src/gemini-openai-bridge.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('quota and billing failures arm a longer provider cooldown', () => {
  assert.equal(
    providerFailureCooldownMs(new Error('Quota exceeded for metric generate_content_free_tier_requests')),
    PROVIDER_HARD_COOLDOWN_MS,
  );
  assert.equal(
    providerFailureCooldownMs(new Error('You have no credits remaining. Add credits to continue using the API.')),
    PROVIDER_HARD_COOLDOWN_MS,
  );
  assert.equal(providerFailureCooldownMs(null, 429), PROVIDER_HARD_COOLDOWN_MS);
});

test('temporary provider failures use a short cooldown and unrelated errors do not poison health', () => {
  assert.equal(
    providerFailureCooldownMs(new Error('This model is currently experiencing high demand.')),
    PROVIDER_TRANSIENT_COOLDOWN_MS,
  );
  assert.equal(
    providerFailureCooldownMs(new Error('The operation was aborted due to timeout')),
    PROVIDER_TRANSIENT_COOLDOWN_MS,
  );
  assert.equal(providerFailureCooldownMs(new Error('Malformed local payload')), 0);
});

test('Live bridge skips providers that are already cooling down before spending another deadline', async () => {
  const source = await read('src/gemini-openai-bridge.js');
  assert.match(source, /providerCooldownRemaining\('gemini', primaryModel\)/);
  assert.match(source, /providerCooldownRemaining\('gemini', GEMINI_FALLBACK_MODEL\)/);
  assert.match(source, /providerCooldownRemaining\('openai'\)/);
  assert.match(source, /skipping Gemini primary/);
  assert.match(source, /skipping OpenAI fallback/);
});

test('Clone consultation response exposes whether real AI or deterministic fallback answered', async () => {
  const server = await read('server.js');
  assert.match(server, /const aiStatus =/);
  assert.match(server, /consultation\.status \|\| 'ok'/);
  assert.match(server, /aiStatus,/);
  assert.match(server, /assistantMessageMetadata = \{[\s\S]*aiStatus,/);
});
