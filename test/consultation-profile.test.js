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

test('бесплатный клон использует промпт 23.07 11:45 и формулу пяти элементов', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const question = prepareConsultationQuestion(profile, 'Войти ли в новый проект?');

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-07-23.1145-five');
  assert.equal(profile.derivedFromPromptVersion, '2026-07-23.1145');
  assert.equal(profile.sourceCommit, 'ad915b2bf870b27552eaf185a842702987d80da1');
  assert.ok(question.includes('Рассмотри описанную ситуацию не как прогноз поступка человека'));
  assert.ok(question.includes('Всегда говори «клон поступил бы»'));
  assert.ok(question.includes('2–4 конкретных фактора карты'));
  assert.ok(question.includes('аспект, ретроградность, ASC/DSC, MC/IC'));
  assert.ok(question.includes('один уточняющий вопрос, только если он действительно меняет решение'));
  assert.ok(question.includes('действие: есть ли ясный ход'));
  assert.ok(question.includes('гармония и красота'));
  assert.ok(question.includes('ответственность и включённость'));
  assert.ok(question.includes('единство'));
  assert.ok(question.includes('уникальность'));
  assert.ok(question.includes('Не называй эти пять элементов пользователю'));
  assert.ok(!question.includes('полную картину одного решения'));
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

test('платный клон даёт полную картину решения через 3–6 факторов', () => {
  const freeProfile = resolveConsultationProfile({ product: 'clone', premium: false });
  const premiumProfile = resolveConsultationProfile({ product: 'clone', premium: true });
  const freePrepared = splitPreparedQuestion(prepareConsultationQuestion(freeProfile, 'Войти ли в новый проект?'));
  const premiumPrepared = splitPreparedQuestion(prepareConsultationQuestion(premiumProfile, 'Войти ли в новый проект?'));

  assert.equal(premiumProfile.id, CLONE_PREMIUM_PROFILE_ID);
  assert.equal(premiumProfile.promptVersion, '2026-07-27.full-decision-v1');
  assert.equal(premiumProfile.derivedFromPromptVersion, '2026-07-23.1145-five');
  assert.equal(premiumProfile.systemPromptAddon, '');
  assert.ok(premiumPrepared.instruction.includes('3–6 конкретных факторов карты'));
  assert.ok(!premiumPrepared.instruction.includes('2–4 конкретных фактора карты'));
  assert.ok(premiumPrepared.instruction.includes('полную картину одного решения'));
  assert.ok(premiumPrepared.instruction.includes('главное внутреннее противоречие'));
  assert.ok(premiumPrepared.instruction.includes('один жизнеспособный альтернативный ход'));
  assert.ok(premiumPrepared.instruction.includes('условие, при котором решение изменится'));
  assert.ok(premiumPrepared.instruction.includes('один первый проверяемый шаг'));
  assert.ok(premiumPrepared.instruction.includes('Пиши ёмко и цельно'));
  assert.ok(premiumPrepared.instruction.includes('действие: есть ли ясный ход'));
  assert.equal(premiumPrepared.situation, freePrepared.situation);
  assert.equal(premiumProfile.chartDepth, 'full');
  assert.deepEqual(premiumProfile.factorBudget, { min: 3, max: 6 });
  assert.equal(premiumProfile.historyLimit, 16);

  for (const prompt of [
    consultationSystemPrompt('deep', 'clone', true),
    consultationSystemPrompt('dialog', 'clone', true),
  ]) {
    assert.ok(!prompt.includes('полную картину одного решения'));
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
