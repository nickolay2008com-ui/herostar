import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROVIDER_HARD_COOLDOWN_MS,
  PROVIDER_TRANSIENT_COOLDOWN_MS,
  providerFailureCooldownMs,
} from '../src/gemini-clone.js';

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

test('Clone provider route is Free LLM first, Gemini second, with no OpenAI branch', async () => {
  const source = await read('src/clone-ai-provider.js');
  const freeIndex = source.indexOf('await freeLlm');
  const geminiIndex = source.indexOf('await gemini');
  assert.ok(freeIndex >= 0);
  assert.ok(geminiIndex > freeIndex);
  assert.doesNotMatch(source, /OPENAI_API_KEY|api\.openai\.com|openai fallback/i);
});

test('Clone consultation response exposes real provider and availability status', async () => {
  const server = await read('server.js');
  assert.match(server, /const aiStatus =/);
  assert.match(server, /const aiProvider = product === 'clone'/);
  assert.match(server, /consultation\.status \|\| 'ok'/);
  assert.match(server, /assistantMessageMetadata = \{[\s\S]*aiStatus,[\s\S]*aiProvider,/);
});

test('production AI smoke requires a Free LLM as the primary real provider', async () => {
  const workflow = await read('.github/workflows/production-ai-smoke.yml');
  assert.match(workflow, /const aiStatus = String\(consulted\.data\?\.aiStatus \|\| 'unknown'\)/);
  assert.match(workflow, /const aiProvider = String\(consulted\.data\?\.aiProvider \|\| 'unknown'\)/);
  assert.match(workflow, /if \(aiStatus !== 'ok'\)/);
  assert.match(workflow, /if \(!aiProvider\.startsWith\('free:'\)\)/);
});
