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

test('бесплатный клон использует актуальную энергетическую интерпретацию и говорит только о клоне', () => {
  const profile = resolveConsultationProfile({ product: 'clone', premium: false });
  const prepared = splitPreparedQuestion(prepareConsultationQuestion(profile, 'Какая девушка подходит?'));

  assert.equal(profile.id, CLONE_FREE_PROFILE_ID);
  assert.equal(profile.promptVersion, '2026-08-31.energy-interpretation-v2');
  assert.equal(profile.derivedFromPromptVersion, '2026-08-31.energy-interpretation-v1');
  assert.ok(prepared.instruction.includes('Рассматривай описанную ситуацию только от лица самостоятельного персонажа'));
  assert.ok(prepared.instruction.includes('Не переноси вывод на пользователя напрямую'));
  assert.ok(prepared.instruction.includes('клону было бы важно'));
  assert.ok(prepared.instruction.includes('2–4 наиболее значимых фактора карты'));
  assert.ok(prepared.instruction.includes('ЭНЕРГЕТИЧЕСКАЯ ИНТЕРПРЕТАЦИЯ'));
  assert.ok(prepared.instruction.includes('систему взаимодействующих энергий'));
  assert.ok(prepared.instruction.includes('не составляй каталог качеств «идеального партнёра»'));
  assert.ok(prepared.instruction.includes('внутренне мысли энергиями, наружу говори по-человечески'));
  assert.ok(prepared.instruction.includes('единство'));
  assert.ok(prepared.instruction.includes('уникальность'));
  assert.ok(!prepared.instruction.includes('Всегда говори «клон поступил бы»'));
  assert.equal(profile.systemPromptAddon, '');
  assert.equal(profile.chartDepth, 'full');
  assert.deepEqual(profile.factorBudget, { min: 2, max: 4 });
  assert.equal(profile.historyLimit, 8);
  assert.equal(prepared.situation, 'Какая девушка подходит?');
});

test('системный промпт клона связывает ответ с выбранными grounding-факторами', () => {
  const deep = consultationSystemPrompt('deep', 'clone', false);
  const dialog = consultationSystemPrompt('dialog', 'clone', false);

  for (const prompt of [deep, dialog]) {
    assertNoGenericFactorConflict(prompt);
    assert.match(prompt, /selectedFactors/);
    assert.match(prompt, /доказательная основа именно текущего ответа/i);
    assert.match(prompt, /не копируй служебное поле role дословно/i);
    assert.match(prompt, /не подменяй selectedFactors случайными другими факторами/i);
  }

  assert.ok(deep.includes('В первом ответе сразу затронь суть вопроса.'));
  assert.ok(!dialog.includes('В первом ответе сразу затронь суть вопроса.'));
});

test('платный клон углубляет ту же энергетику через 3–6 факторов', () => {
  const freeProfile = resolveConsultationProfile({ product: 'clone', premium: false });
  const premiumProfile = resolveConsultationProfile({ product: 'clone', premium: true });
  const freePrepared = splitPreparedQuestion(prepareConsultationQuestion(freeProfile, 'Войти ли в новый проект?'));
  const premiumPrepared = splitPreparedQuestion(prepareConsultationQuestion(premiumProfile, 'Войти ли в новый проект?'));

  assert.equal(premiumProfile.id, CLONE_PREMIUM_PROFILE_ID);
  assert.equal(premiumProfile.promptVersion, '2026-08-31.energy-interpretation-premium-v2');
  assert.equal(premiumProfile.derivedFromPromptVersion, '2026-08-31.energy-interpretation-v2');
  assert.equal(premiumProfile.systemPromptAddon, '');
  assert.ok(premiumPrepared.instruction.includes('3–6 наиболее значимых факторов карты'));
  assert.ok(!premiumPrepared.instruction.includes('2–4 наиболее значимых факторов карты'));
  assert.ok(premiumPrepared.instruction.includes('полную картину одного решения или внутренней динамики'));
  assert.ok(premiumPrepared.instruction.includes('главное внутреннее противоречие или баланс энергий'));
  assert.ok(premiumPrepared.instruction.includes('альтернативный ход или альтернативное проявление'));
  assert.ok(premiumPrepared.instruction.includes('конкретное условие, при котором вывод изменится'));
  assert.ok(premiumPrepared.instruction.includes('один первый проверяемый шаг'));
  assert.equal(premiumPrepared.situation, freePrepared.situation);
  assert.equal(premiumProfile.chartDepth, 'full');
  assert.deepEqual(premiumProfile.factorBudget, { min: 3, max: 6 });
  assert.equal(premiumProfile.historyLimit, 16);
});

test('обычный HeroStar сохраняет собственную компактную механику', () => {
  const deep = consultationSystemPrompt('deep', 'herostar', true);
  const dialog = consultationSystemPrompt('dialog', 'herostar', true);

  assert.equal(resolveConsultationProfile({ product: 'herostar', premium: true }), null);
  assert.ok(deep.includes('Выбирай только 1–3 элемента карты'));
  assert.ok(deep.includes('не более двух поддерживающих элементов'));
  assert.ok(dialog.includes('обычно используй 1–2 элемента карты'));
  assert.ok(!deep.includes('selectedFactors — это факторы карты'));
});

test('уровень доступа выбирается только на сервере', () => {
  assert.ok(serverSource.includes("const premium = req.user ? hasCloneAccessForChart(req.user, record.id) : false"));
  const answerCall = serverSource.slice(serverSource.indexOf('answerConsultationWithFactors({'), serverSource.indexOf('answerConsultationWithFactors({') + 500);
  assert.ok(answerCall.includes('product'));
  assert.ok(answerCall.includes('premium'));
});
