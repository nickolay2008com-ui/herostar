import assert from 'node:assert/strict';
import test from 'node:test';
import { consultationSystemPrompt } from '../src/ai.js';
import { resolveConsultationProfile } from '../src/consultation-profile.js';

test('бесплатный профиль клона фиксирует механику теста 23 июля', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const prompt = consultationSystemPrompt('deep', profile);

  assert.equal(profile.id, 'clone-free-v1');
  assert.equal(profile.promptVersion, '2026-07-23.1145');
  assert.match(prompt, /решение самостоятельного персонажа «Звёздный клон»/);
  assert.match(prompt, /2–4 конкретных фактора карты/);
  assert.match(prompt, /уточняющий вопрос только тогда/);
});

test('платный профиль расширяет глубину, не меняя личность клона', () => {
  const freeProfile = resolveConsultationProfile({ product: 'clone', premium: false });
  const premiumProfile = resolveConsultationProfile({ product: 'clone', premium: true });

  assert.equal(premiumProfile.id, 'clone-premium-v1');
  assert.equal(premiumProfile.product, freeProfile.product);
  assert.equal(premiumProfile.historyLimit, 16);
  assert.match(premiumProfile.instructions, /4–7 релевантных факторов/);
  assert.match(premiumProfile.instructions, /условия, при которых решение клона изменилось бы/);
});

test('старый строковый вызов prompt builder остаётся совместимым', () => {
  const prompt = consultationSystemPrompt('dialog', 'clone');
  assert.match(prompt, /clone-free-v1/);
});
