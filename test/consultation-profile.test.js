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

const forbiddenGenericCloneRules = [
  'Выбирай только 1–3 элемента карты',
  'не более двух поддерживающих элементов',
  'обычно используй 1–2 элемента карты',
];

function assertNoGenericFactorConflict(prompt) {
  for (const rule of forbiddenGenericCloneRules) {
    assert.ok(!prompt.includes(rule), `Clone prompt must not contain generic rule: ${rule}`);
  }
}

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
});

test('механика 11:45 является единственным правилом факторов в первом ответе и продолжении', () => {
  const deep = consultationSystemPrompt('deep', 'clone', false);
  const dialog = consultationSystemPrompt('dialog', 'clone', false);

  for (const prompt of [deep, dialog]) {
    assert.ok(prompt.includes('профиля 2026-07-23.1145'));
    assert.ok(prompt.includes('2–4 конкретных релевантных факторов'));
    assert.ok(prompt.includes('Сначала кратко скажи, как поступил бы клон'));
    assertNoGenericFactorConflict(prompt);
  }

  assert.ok(deep.includes('первый содержательный ответ Звёздного клона'));
  assert.ok(dialog.includes('Не сужай разбор только потому, что это продолжение'));
});

test('платный клон использует только правило 3–6 связей без ограничений обычного HeroStar', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: true });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');
  const deep = consultationSystemPrompt('deep', 'clone', true);
  const dialog = consultationSystemPrompt('dialog', 'clone', true);

  assert.equal(profile.id, CLONE_PREMIUM_PROFILE_ID);
  assert.equal(question, 'Войти ли в новый проект?');
  assert.equal(profile.chartDepth, 'full');
  assert.deepEqual(profile.factorBudget, { min: 3, max: 6 });
  assert.equal(profile.historyLimit, 16);

  for (const prompt of [deep, dialog]) {
    assert.ok(prompt.includes('Режим «Звёздный клон» имеет приоритет'));
    assert.ok(prompt.includes('карту как единую сеть'));
    assert.ok(prompt.includes('3–6 наиболее значимых связей'));
    assertNoGenericFactorConflict(prompt);
  }
});

test('обычный HeroStar сохраняет собственную компактную механику', () => {
  const deep = consultationSystemPrompt('deep', 'herostar', true);
  const dialog = consultationSystemPrompt('dialog', 'herostar', true);

  assert.equal(resolveConsultationProfile({ product: 'herostar', premium: true }), null);
  assert.ok(deep.includes('Выбирай только 1–3 элемента карты'));
  assert.ok(deep.includes('не более двух поддерживающих элементов'));
  assert.ok(dialog.includes('обычно используй 1–2 элемента карты'));
  assert.ok(!deep.includes('Режим «Звёздный клон»'));
  assert.ok(!dialog.includes('Режим «Звёздный клон»'));
});

test('уровень доступа выбирается только на сервере', () => {
  assert.ok(serverSource.includes('const premium = req.user ? hasCloneAccessForChart(req.user, record.id) : false'));
  const answerCall = serverSource.slice(serverSource.indexOf('answerConsultation({'), serverSource.indexOf('answerConsultation({') + 500);
  assert.ok(answerCall.includes('product'));
  assert.ok(answerCall.includes('premium'));
});
