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

test('бесплатный клон точно использует механику диалога 23 июля 11:45', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-07-23.1145');
  assert.equal(profile.sourceCommit, 'ad915b2bf870b27552eaf185a842702987d80da1');
  assert.ok(question.includes('Рассмотри описанную ситуацию не как прогноз поступка человека'));
  assert.ok(question.includes('2–4 конкретных фактора карты'));
  assert.ok(question.includes('аспект, ретроградность, ASC/DSC, MC/IC'));
  assert.equal(profile.chartDepth, 'full');
  assert.deepEqual(profile.factorBudget, { min: 2, max: 4 });
  assert.equal(profile.historyLimit, 8);
  assert.ok(question.includes('Ситуация: Войти ли в новый проект?'));

  const prompt = consultationSystemPrompt('deep', 'clone', false);
  assert.ok(prompt.includes('пять ключей HeroStar'));
  assert.ok(!prompt.includes('Режим «Звёздный клон» имеет приоритет'));
});

test('платный клон сохраняет углублённый серверный алгоритм', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: true });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_PREMIUM_PROFILE_ID);
  assert.equal(question, 'Войти ли в новый проект?');

  const prompt = consultationSystemPrompt('deep', 'clone', true);
  assert.ok(prompt.includes('пять ключей HeroStar'));
  assert.ok(prompt.includes('Режим «Звёздный клон» имеет приоритет'));
  assert.ok(prompt.includes('карту как единую сеть'));
  assert.ok(prompt.includes('3–6 наиболее значимых связей'));
  assert.equal(profile.chartDepth, 'full');
  assert.deepEqual(profile.factorBudget, { min: 3, max: 6 });
  assert.equal(profile.historyLimit, 16);
});

test('уровень доступа выбирается только на сервере', () => {
  assert.ok(serverSource.includes('const premium = req.user ? hasCloneAccessForChart(req.user, record.id) : false'));
  const answerCall = serverSource.slice(serverSource.indexOf('answerConsultation({'), serverSource.indexOf('answerConsultation({') + 500);
  assert.ok(answerCall.includes('product'));
  assert.ok(answerCall.includes('premium'));
});

test('обычная консультация HeroStar не получает профиль клона', () => {
  assert.equal(resolveConsultationProfile({ product: 'herostar', premium: true }), null);
  assert.ok(consultationSystemPrompt('deep', 'herostar', true).includes('пять ключей HeroStar'));
  assert.ok(!consultationSystemPrompt('deep', 'herostar', true).includes('Режим «Звёздный клон»'));
});
