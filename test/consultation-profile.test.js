import assert from 'node:assert/strict';
import test from 'node:test';

import { consultationSystemPrompt } from '../src/ai.js';
import {
  CLONE_FREE_PROFILE_ID,
  resolveConsultationProfile,
} from '../src/consultation-profiles.js';

test('Звёздный клон использует зафиксированный бесплатный профиль', () => {
  const profile = resolveConsultationProfile({ product: 'clone' });

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-07-23.1145');
  assert.deepEqual(profile.factorBudget, { min: 2, max: 4 });
});

test('профиль клона сохраняет точечный контракт ответа', () => {
  const prompt = consultationSystemPrompt('deep', 'clone');

  assert.match(prompt, /самостоятельная символическая модель/);
  assert.match(prompt, /2–4 конкретных фактора карты/);
  assert.match(prompt, /уточняющий вопрос только тогда/);
  assert.doesNotMatch(prompt, /пять ключей HeroStar/);
});

test('обычная консультация HeroStar не получает профиль клона', () => {
  assert.equal(resolveConsultationProfile({ product: 'herostar' }), null);
  assert.match(consultationSystemPrompt('deep', 'herostar'), /пять ключей HeroStar/);
});
