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

test('бесплатный клон сохраняет механику диалога 23 июля и использует базовую проекцию карты', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-07-24.free-unlimited-core');
  assert.equal(profile.derivedFromPromptVersion, '2026-07-23.1145');
  assert.match(question, /Рассмотри описанную ситуацию не как прогноз поступка человека/);
  assert.match(question, /2–3 конкретных базовых фактора/);
  assert.equal(profile.chartDepth, 'core');
  assert.deepEqual(profile.factorBudget, { min: 2, max: 3 });
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
  assert.match(prompt, /карту как единую сеть/);
  assert.match(prompt, /3–6 наиболее значимых связей/);
  assert.equal(profile.chartDepth, 'full');
  assert.deepEqual(profile.factorBudget, { min: 3, max: 6 });
  assert.equal(profile.historyLimit, 16);
});

test('уровень доступа выбирается только на сервере', () => {
  assert.match(serverSource, /const premium = req\.user \? hasCloneAccessForChart\(req\.user, record\.id\) : false/);
  assert.match(serverSource, /answerConsultation\(\{[\s\S]*?product,[\s\S]*?premium,/);
});

test('обычная консультация HeroStar не получает профиль клона', () => {
  assert.equal(resolveConsultationProfile({ product: 'herostar', premium: true }), null);
  assert.match(consultationSystemPrompt('deep', 'herostar', true), /пять ключей HeroStar/);
  assert.doesNotMatch(consultationSystemPrompt('deep', 'herostar', true), /Режим «Звёздный клон»/);
});
