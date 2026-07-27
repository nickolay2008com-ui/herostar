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
const premiumAddon = 'добавь больше благоприятных факторов из натальной карты для благоприятного решения задачи клона. пиши кротко';
const situationMarker = '\n\nСитуация: ';

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

function splitPreparedQuestion(value) {
  const markerIndex = value.lastIndexOf(situationMarker);
  assert.ok(markerIndex >= 0, 'Подготовленный вопрос должен содержать ситуацию');
  return {
    instruction: value.slice(0, markerIndex),
    situation: value.slice(markerIndex + situationMarker.length),
  };
}

test('бесплатный клон использует утверждённую инструкцию вопроса', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-07-23.1145');
  assert.equal(profile.sourceCommit, 'ad915b2bf870b27552eaf185a842702987d80da1');
  assert.ok(question.includes('Рассмотри описанную ситуацию не как прогноз поступка человека'));
  assert.ok(question.includes('2–4 конкретных фактора карты'));
  assert.ok(question.includes('аспект, ретроградность, ASC/DSC, MC/IC'));
  assert.equal(profile.systemPromptAddon, '');
  assert.equal(profile.chartDepth, 'full');
  assert.deepEqual(profile.factorBudget, { min: 2, max: 4 });
  assert.equal(profile.historyLimit, 8);
  assert.equal(splitPreparedQuestion(question).situation, 'Войти ли в новый проект?');
});

test('системный промпт клона не дублирует тарифную инструкцию вопроса', () => {
  const deep = consultationSystemPrompt('deep', 'clone', false);
  const dialog = consultationSystemPrompt('dialog', 'clone', false);

  for (const prompt of [deep, dialog]) {
    assert.ok(!prompt.includes('2026-07-23.1145'));
    assert.ok(!prompt.includes('2–4 конкретных фактора карты'));
    assertNoGenericFactorConflict(prompt);
  }

  assert.ok(deep.includes('первый содержательный ответ Звёздного клона'));
  assert.ok(!dialog.includes('первый содержательный ответ Звёздного клона'));
});

test('платный промпт равен бесплатному плюс одна утверждённая фраза', () => {
  const freeProfile = resolveConsultationProfile({ product: 'clone', premium: false });
  const premiumProfile = resolveConsultationProfile({ product: 'clone', premium: true });
  const freePrepared = splitPreparedQuestion(prepareConsultationQuestion(freeProfile, 'Войти ли в новый проект?'));
  const premiumPrepared = splitPreparedQuestion(prepareConsultationQuestion(premiumProfile, 'Войти ли в новый проект?'));

  assert.equal(premiumProfile.id, CLONE_PREMIUM_PROFILE_ID);
  assert.equal(premiumProfile.promptVersion, '2026-07-27.premium-addon');
  assert.equal(premiumProfile.systemPromptAddon, '');
  assert.equal(premiumPrepared.instruction, `${freePrepared.instruction}\n\n${premiumAddon}`);
  assert.equal(premiumPrepared.situation, freePrepared.situation);
  assert.equal(premiumProfile.chartDepth, 'full');
  assert.deepEqual(premiumProfile.factorBudget, { min: 3, max: 6 });
  assert.equal(premiumProfile.historyLimit, 16);

  for (const prompt of [
    consultationSystemPrompt('deep', 'clone', true),
    consultationSystemPrompt('dialog', 'clone', true),
  ]) {
    assert.ok(!prompt.includes(premiumAddon));
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
});

test('уровень доступа выбирается только на сервере', () => {
  assert.ok(serverSource.includes('const premium = req.user ? hasCloneAccessForChart(req.user, record.id) : false'));
  const answerCall = serverSource.slice(serverSource.indexOf('answerConsultationWithFactors({'), serverSource.indexOf('answerConsultationWithFactors({') + 500);
  assert.ok(answerCall.includes('product'));
  assert.ok(answerCall.includes('premium'));
});
