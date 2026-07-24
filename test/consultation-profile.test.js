import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { consultationSystemPrompt } from '../src/ai.js';
import {
  CLONE_FREE_PROFILE_ID,
  CLONE_PREMIUM_PROFILE_ID,
  prepareConsultationQuestion,
  resolveConsultationProfile,
} from '../src/consultation-profiles.js';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('бесплатный клон использует алгоритм диалога 23 июля 11:45', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-07-23.1145');
  assert.match(question, /Рассмотри описанную ситуацию не как прогноз поступка человека/);
  assert.match(question, /2–4 конкретных фактора карты/);
  assert.match(question, /Ситуация: Войти ли в новый проект\?/);

  const prompt = consultationSystemPrompt('deep', 'clone', false);
  assert.match(prompt, /пять ключей HeroStar/);
  assert.doesNotMatch(prompt, /Режим «Звёздный клон» имеет приоритет/);
});

test('платный клон сохраняет текущий серверный алгоритм', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: true });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_PREMIUM_PROFILE_ID);
  assert.equal(question, 'Войти ли в новый проект?');

  const prompt = consultationSystemPrompt('deep', 'clone', true);
  assert.match(prompt, /пять ключей HeroStar/);
  assert.match(prompt, /Режим «Звёздный клон» имеет приоритет/);
  assert.match(prompt, /2–4 конкретных фактора карты/);
});

test('уровень доступа выбирается только на сервере', () => {
  assert.match(serverSource, /const premium = hasCloneAccessForChart\(req\.user, record\.id\)/);
  assert.match(serverSource, /answerConsultation\(\{[\s\S]*?product,[\s\S]*?premium,/);
});

test('обычная консультация HeroStar не получает профиль клона', () => {
  assert.equal(resolveConsultationProfile({ product: 'herostar', premium: true }), null);
  assert.match(consultationSystemPrompt('deep', 'herostar', true), /пять ключей HeroStar/);
  assert.doesNotMatch(consultationSystemPrompt('deep', 'herostar', true), /Режим «Звёздный клон»/);
});
